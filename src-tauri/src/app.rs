use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicU8;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::menu::MenuItem;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::catalog::{self, FREETP_HOME, FREETP_RSS};
use crate::i18n;
use crate::models::*;
use crate::store::Store;
use crate::util::{is_newer_version, now_iso};

pub const EVENT_CHANNEL: &str = "fgl://event";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
/// Injected by the GitHub Actions build: the repository's "latest release" API URL.
const BUILT_IN_UPDATE_URL: Option<&str> = option_env!("FGL_UPDATE_URL");
const MAX_NOTIFICATIONS: usize = 200;

pub type Shared = Arc<App>;

pub struct TrayMenu {
    pub open: MenuItem<Wry>,
    pub quit: MenuItem<Wry>,
}

#[derive(Default)]
pub struct CatalogState {
    pub opensource: Vec<Game>,
    pub opensource_error: Option<String>,
    pub freetp: Vec<Game>,
    pub freetp_error: Option<String>,
}

pub struct Dirs {
    pub manifests: PathBuf,
    pub cache: PathBuf,
}

/// Global token bucket so the speed limit applies to all downloads combined.
#[derive(Default)]
pub struct RateLimiter {
    window: Mutex<Option<(Instant, u64)>>,
}

impl RateLimiter {
    pub async fn throttle(&self, bytes: u64, limit_bytes_per_sec: u64) {
        if limit_bytes_per_sec == 0 {
            return;
        }
        let delay = {
            let mut window = self.window.lock().unwrap();
            let (start, used) = window.get_or_insert((Instant::now(), 0));
            if start.elapsed() > Duration::from_secs(2) {
                *start = Instant::now();
                *used = 0;
            }
            *used += bytes;
            let expected = Duration::from_secs_f64(*used as f64 / limit_bytes_per_sec as f64);
            expected.saturating_sub(start.elapsed())
        };
        if !delay.is_zero() {
            tokio::time::sleep(delay).await;
        }
    }
}

pub struct App {
    pub handle: AppHandle,
    pub store: Store,
    pub dirs: Dirs,
    pub http: reqwest::Client,
    pub catalog: RwLock<CatalogState>,
    /// Control flags of downloads that currently own a worker (see `downloads.rs`).
    pub controls: Mutex<HashMap<String, Arc<AtomicU8>>>,
    /// gameId -> process id of running games.
    pub running: Mutex<HashMap<String, u32>>,
    pub limiter: RateLimiter,
    pub tray: Mutex<Option<TrayMenu>>,
}

impl App {
    pub fn new(handle: AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let paths = handle.path();
        let data_dir = paths.app_local_data_dir()?;
        let home = paths.home_dir().unwrap_or_else(|_| data_dir.clone());
        let dirs = Dirs { manifests: data_dir.join("manifests"), cache: data_dir.join("cache") };
        fs::create_dir_all(&dirs.manifests)?;
        fs::create_dir_all(&dirs.cache)?;

        let store = Store::load(data_dir.join("state.json"));
        let installer_language = read_installer_language(&data_dir);
        store.update(|data| {
            let s = &mut data.settings;
            if s.download_dir.trim().is_empty() {
                s.download_dir = data_dir.join("downloads").to_string_lossy().into_owned();
            }
            if s.library_dir.trim().is_empty() {
                s.library_dir = home.join("Games").join("FreeGame Library").to_string_lossy().into_owned();
            }
            if let Some(lang) = installer_language {
                s.language = lang.into();
            } else if store.fresh {
                if let Some(lang) = sys_locale::get_locale().as_deref().and_then(i18n::from_locale) {
                    s.language = lang.into();
                }
            }
            if !i18n::SUPPORTED.contains(&s.language.as_str()) {
                s.language = "en".into();
            }
            // Workers from a previous run are gone: anything mid-flight becomes resumable.
            for task in data.downloads.iter_mut().filter(|t| t.status.is_busy()) {
                task.status = DownloadStatus::Paused;
                task.speed_bps = 0;
                task.eta_seconds = None;
            }
        });

        let http = reqwest::Client::builder()
            .user_agent(concat!("FreeGameLauncher/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(20))
            .build()?;

        let mut catalog = CatalogState::default();
        let cached_remote = fs::read_to_string(dirs.cache.join("opensource.json")).ok();
        let has_remote_url = store.read(|d| !d.settings.catalog_url.trim().is_empty());
        catalog.opensource = cached_remote
            .filter(|_| has_remote_url)
            .and_then(|text| catalog::parse_catalog(&text).ok())
            .unwrap_or_else(|| catalog::parse_catalog(catalog::BUNDLED_OPENSOURCE).unwrap_or_default());
        catalog.freetp = fs::read(dirs.cache.join("freetp.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();

        Ok(Self {
            handle,
            store,
            dirs,
            http,
            catalog: RwLock::new(catalog),
            controls: Mutex::new(HashMap::new()),
            running: Mutex::new(HashMap::new()),
            limiter: RateLimiter::default(),
            tray: Mutex::new(None),
        })
    }

    pub fn start_background_work(app: Shared) {
        crate::downloads::schedule(&app);
        tauri::async_runtime::spawn(async move {
            let (freetp_enabled, remote_catalog, check_on_start) = app.store.read(|d| {
                (d.source_enabled("freetp"), !d.settings.catalog_url.trim().is_empty(), d.settings.check_updates_on_start)
            });
            if remote_catalog {
                let _ = app.refresh_source("opensource").await;
            }
            if freetp_enabled {
                let _ = app.refresh_source("freetp").await;
            }
            if check_on_start {
                let updates = crate::library::check_updates(&app);
                if !updates.is_empty() {
                    let names = updates.iter().map(|u| u.title.as_str()).collect::<Vec<_>>().join(", ");
                    app.notify(NotificationKind::Info, i18n::updates_available(&app.lang()), &names, None);
                }
                if let Ok(info) = app.check_launcher_update().await {
                    if info.available {
                        let body = info.version.clone().unwrap_or_default();
                        app.notify(NotificationKind::Info, i18n::launcher_update(&app.lang()), &body, None);
                    }
                }
            }
        });
    }

    pub fn lang(&self) -> String {
        self.store.read(|d| d.settings.language.clone())
    }

    pub fn settings(&self) -> Settings {
        self.store.read(|d| d.settings.clone())
    }

    /// Short helper for native error messages in English / Russian / Ukrainian.
    pub fn t(&self, en: &'static str, ru: &'static str, uk: &'static str) -> String {
        i18n::pick3(&self.lang(), en, ru, uk).to_string()
    }

    pub fn emit(&self, event: BackendEvent) {
        let _ = self.handle.emit(EVENT_CHANNEL, event);
    }

    pub fn notify(&self, kind: NotificationKind, title: &str, body: &str, game_id: Option<&str>) {
        let notification = self.store.update(|data| {
            let enabled = data.settings.notifications;
            let notification = AppNotification {
                id: data.next_id(),
                kind,
                title: title.to_string(),
                body: body.to_string(),
                game_id: game_id.map(str::to_string),
                created_at: now_iso(),
                read: !enabled,
            };
            data.notifications.insert(0, notification.clone());
            data.notifications.truncate(MAX_NOTIFICATIONS);
            enabled.then_some(notification)
        });
        if let Some(notification) = notification {
            self.emit(BackendEvent::Notification { notification });
        }
    }

    pub fn update_tray_language(&self) {
        let lang = self.lang();
        if let Some(tray) = self.tray.lock().unwrap().as_ref() {
            let _ = tray.open.set_text(i18n::tray_open(&lang));
            let _ = tray.quit.set_text(i18n::tray_quit(&lang));
        }
    }

    pub fn catalog_games(&self) -> Vec<Game> {
        let (os_enabled, ft_enabled, local_enabled, manual) = self.store.read(|d| {
            let manual: Vec<Installation> = d.installations.iter().filter(|i| i.manual).cloned().collect();
            (d.source_enabled("opensource"), d.source_enabled("freetp"), d.source_enabled("local"), manual)
        });
        let catalog = self.catalog.read().unwrap();
        let mut games = Vec::new();
        if os_enabled {
            games.extend(catalog.opensource.iter().cloned());
        }
        if ft_enabled {
            games.extend(catalog.freetp.iter().cloned());
        }
        if local_enabled {
            games.extend(manual.into_iter().map(manual_game));
        }
        games
    }

    /// Looks a game up regardless of whether its source is enabled (installs must keep working).
    pub fn find_game(&self, game_id: &str) -> Option<Game> {
        let catalog = self.catalog.read().unwrap();
        catalog.opensource.iter().chain(catalog.freetp.iter()).find(|g| g.id == game_id).cloned()
    }

    pub fn sources(&self) -> Vec<SourceInfo> {
        let lang = self.lang();
        let (enabled, sync, manual_count, remote_url) = self.store.read(|d| {
            (
                EnabledSources {
                    opensource: d.source_enabled("opensource"),
                    local: d.source_enabled("local"),
                    freetp: d.source_enabled("freetp"),
                },
                d.source_sync.clone(),
                d.installations.iter().filter(|i| i.manual).count(),
                d.settings.catalog_url.trim().to_string(),
            )
        });
        let catalog = self.catalog.read().unwrap();

        let status = |on: bool, error: &Option<String>, ok: &'static str| {
            if !on {
                "disabled"
            } else if error.is_some() {
                "error"
            } else {
                ok
            }
        };

        vec![
            SourceInfo {
                id: "opensource".into(),
                name: i18n::pick3(&lang, "Open-source games", "Открытые игры", "Відкриті ігри").into(),
                kind: "http",
                homepage: None,
                enabled: enabled.opensource,
                status: status(enabled.opensource, &catalog.opensource_error, "online"),
                status_message: catalog.opensource_error.clone().or_else(|| {
                    Some(if remote_url.is_empty() {
                        i18n::pick3(
                            &lang,
                            "Built-in catalog of open-source games with verified SHA-256 checksums.",
                            "Встроенный каталог открытых игр с проверкой SHA-256.",
                            "Вбудований каталог відкритих ігор з перевіркою SHA-256.",
                        )
                        .to_string()
                    } else {
                        remote_url.clone()
                    })
                }),
                last_sync: sync.get("opensource").cloned(),
                game_count: catalog.opensource.len(),
                capabilities: SourceCapabilities { search: true, metadata: true, auto_install: true, open_page: true, updates: true },
            },
            SourceInfo {
                id: "local".into(),
                name: i18n::pick3(&lang, "Local games", "Локальные игры", "Локальні ігри").into(),
                kind: "local",
                homepage: None,
                enabled: enabled.local,
                status: status(enabled.local, &None, "online"),
                status_message: Some(
                    i18n::pick3(&lang, "Games added from disk.", "Игры, добавленные с диска.", "Ігри, додані з диска.").into(),
                ),
                last_sync: None,
                game_count: manual_count,
                capabilities: SourceCapabilities { search: true, metadata: false, auto_install: false, open_page: false, updates: false },
            },
            SourceInfo {
                id: "freetp".into(),
                name: "FreeTP".into(),
                kind: "freetp",
                homepage: Some(FREETP_HOME.into()),
                enabled: enabled.freetp,
                status: if !enabled.freetp {
                    "disabled"
                } else if catalog.freetp_error.is_some() && catalog.freetp.is_empty() {
                    "error"
                } else if catalog.freetp.is_empty() {
                    "unknown"
                } else {
                    "limited"
                },
                status_message: catalog.freetp_error.clone().or_else(|| {
                    Some(
                        i18n::pick3(
                            &lang,
                            "Catalog is read from the public RSS feed. Downloads open on the website.",
                            "Каталог читается из публичной RSS-ленты. Загрузка открывается на сайте.",
                            "Каталог читається з публічної RSS-стрічки. Завантаження відкривається на сайті.",
                        )
                        .into(),
                    )
                }),
                last_sync: sync.get("freetp").cloned(),
                game_count: catalog.freetp.len(),
                capabilities: SourceCapabilities { search: true, metadata: true, auto_install: false, open_page: true, updates: false },
            },
        ]
    }

    pub fn source(&self, id: &str) -> Result<SourceInfo, String> {
        self.sources().into_iter().find(|s| s.id == id).ok_or_else(|| format!("unknown source: {id}"))
    }

    pub async fn refresh_source(&self, id: &str) -> Result<SourceInfo, String> {
        match id {
            "opensource" => {
                let url = self.store.read(|d| d.settings.catalog_url.trim().to_string());
                let result = if url.is_empty() {
                    catalog::parse_catalog(catalog::BUNDLED_OPENSOURCE)
                } else {
                    match self.fetch_text(&url).await {
                        Ok(text) => catalog::parse_catalog(&text).inspect(|_| {
                            let _ = fs::write(self.dirs.cache.join("opensource.json"), &text);
                        }),
                        Err(error) => Err(error),
                    }
                };
                let mut catalog = self.catalog.write().unwrap();
                match result {
                    Ok(games) => {
                        catalog.opensource = games;
                        catalog.opensource_error = None;
                    }
                    Err(error) => catalog.opensource_error = Some(error),
                }
            }
            "freetp" => {
                let result = match self.http.get(FREETP_RSS).send().await {
                    Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                        Ok(bytes) => catalog::parse_freetp_rss(&bytes),
                        Err(e) => Err(e.to_string()),
                    },
                    Ok(resp) => Err(format!("HTTP {}", resp.status().as_u16())),
                    Err(e) => Err(network_error(&e)),
                };
                let mut catalog = self.catalog.write().unwrap();
                match result {
                    Ok(games) => {
                        if let Ok(bytes) = serde_json::to_vec(&games) {
                            let _ = fs::write(self.dirs.cache.join("freetp.json"), bytes);
                        }
                        catalog.freetp = games;
                        catalog.freetp_error = None;
                    }
                    Err(error) => catalog.freetp_error = Some(error),
                }
            }
            "local" => {}
            other => return Err(format!("unknown source: {other}")),
        }
        let ok = match id {
            "opensource" => self.catalog.read().unwrap().opensource_error.is_none(),
            "freetp" => self.catalog.read().unwrap().freetp_error.is_none(),
            _ => true,
        };
        if ok {
            self.store.update(|d| {
                d.source_sync.insert(id.to_string(), now_iso());
            });
        }
        self.emit(BackendEvent::CatalogChanged);
        self.emit(BackendEvent::SourcesChanged);
        self.source(id)
    }

    async fn fetch_text(&self, url: &str) -> Result<String, String> {
        let resp = self.http.get(url).send().await.map_err(|e| network_error(&e))?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status().as_u16()));
        }
        resp.text().await.map_err(|e| network_error(&e))
    }

    pub async fn check_launcher_update(&self) -> Result<LauncherUpdateInfo, String> {
        let configured_url = self.store.read(|d| d.settings.launcher_update_url.trim().to_string());
        let url = if configured_url.is_empty() {
            BUILT_IN_UPDATE_URL.unwrap_or_default().to_string()
        } else {
            configured_url
        };
        let lang = self.lang();
        if url.is_empty() {
            return Ok(LauncherUpdateInfo {
                current_version: APP_VERSION.into(),
                configured: false,
                available: false,
                version: None,
                notes: None,
                message: Some(
                    i18n::pick3(
                        &lang,
                        "Launcher update source is not configured.",
                        "Источник обновлений лаунчера не настроен.",
                        "Джерело оновлень лаунчера не налаштовано.",
                    )
                    .into(),
                ),
            });
        }

        #[derive(Deserialize)]
        struct Manifest {
            tag_name: Option<String>,
            version: Option<String>,
            body: Option<String>,
            notes: Option<String>,
            html_url: Option<String>,
            url: Option<String>,
        }

        let resp = self
            .http
            .get(&url)
            .header(reqwest::header::ACCEPT, "application/vnd.github+json, application/json")
            .send()
            .await
            .map_err(|e| network_error(&e))?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            // A GitHub repository without any published release yet.
            return Ok(LauncherUpdateInfo {
                current_version: APP_VERSION.into(),
                configured: true,
                available: false,
                version: None,
                notes: None,
                message: Some(i18n::pick3(&lang, "You have the latest version.", "У вас последняя версия.", "У вас остання версія.").into()),
            });
        }
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status().as_u16()));
        }
        let manifest: Manifest = resp.json().await.map_err(|e| format!("invalid update manifest: {e}"))?;
        let version = manifest
            .version
            .or(manifest.tag_name)
            .map(|v| v.trim().trim_start_matches(['v', 'V']).to_string())
            .filter(|v| !v.is_empty());
        let available = version.as_deref().is_some_and(|v| is_newer_version(v, APP_VERSION));
        let link = manifest.html_url.or(manifest.url);
        let message = if available {
            let text = i18n::pick3(
                &lang,
                "Download the new installer:",
                "Скачайте новый установщик:",
                "Завантажте новий інсталятор:",
            );
            Some(match link {
                Some(link) => format!("{text} {link}"),
                None => text.trim_end_matches(':').to_string(),
            })
        } else {
            Some(i18n::pick3(&lang, "You have the latest version.", "У вас последняя версия.", "У вас остання версія.").into())
        };
        Ok(LauncherUpdateInfo {
            current_version: APP_VERSION.into(),
            configured: true,
            available,
            version,
            notes: manifest.notes.or(manifest.body).filter(|n| !n.trim().is_empty()),
            message,
        })
    }
}

struct EnabledSources {
    opensource: bool,
    local: bool,
    freetp: bool,
}

fn manual_game(inst: Installation) -> Game {
    Game {
        id: inst.game_id.clone(),
        source_id: "local".into(),
        slug: inst.game_id.trim_start_matches("local:").to_string(),
        title: inst.title,
        developer: None,
        short_description: String::new(),
        description: String::new(),
        genres: Vec::new(),
        cover_url: None,
        hero_url: None,
        screenshots: Vec::new(),
        page_url: None,
        license: None,
        release_date: None,
        popularity: 0.0,
        requirements: None,
        package: None,
        created_at: inst.installed_at.clone(),
        updated_at: inst.installed_at,
    }
}

fn read_installer_language(data_dir: &std::path::Path) -> Option<&'static str> {
    let path = data_dir.join("installer-language.txt");
    let text = fs::read_to_string(&path).ok()?;
    let _ = fs::remove_file(&path);
    text.trim().parse::<u32>().ok().and_then(i18n::from_lcid)
}

pub fn network_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "network timeout".into()
    } else if error.is_connect() {
        "cannot connect to the server — check your internet connection".into()
    } else {
        error.to_string()
    }
}
