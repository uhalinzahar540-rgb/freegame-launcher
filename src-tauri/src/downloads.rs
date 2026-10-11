//! Download queue: resumable HTTP downloads (Range requests), SHA-256 verification,
//! extraction and registration in the library.
//!
//! Each task that owns a worker has a control flag in `App::controls`; pause/cancel
//! flip the flag and the worker stops at the next chunk.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use reqwest::header::RANGE;
use reqwest::StatusCode;
use tokio::io::AsyncWriteExt;

use crate::app::{network_error, Shared};
use crate::archive;
use crate::i18n;
use crate::models::*;
use crate::store::DownloadJob;
use crate::util::{free_space, now_iso, sanitize_dir_name, unique_dir};

const RUN: u8 = 0;
const PAUSE: u8 = 1;
const CANCEL: u8 = 2;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(400);
const SAVE_INTERVAL: Duration = Duration::from_secs(5);
const STALL_TIMEOUT_SECS: u32 = 90;
const DISK_RESERVE: u64 = 64 * 1024 * 1024;

enum Stop {
    Paused,
    Cancelled,
    Failed(String),
}

impl From<String> for Stop {
    fn from(message: String) -> Self {
        Stop::Failed(message)
    }
}

fn archive_paths(app: &Shared, id: &str, format: PackageFormat) -> (PathBuf, PathBuf) {
    let dir = PathBuf::from(app.store.read(|d| d.settings.download_dir.clone()));
    let ext = format.extension();
    (dir.join(format!("{id}.{ext}.part")), dir.join(format!("{id}.{ext}")))
}

fn remove_files(app: &Shared, id: &str) {
    if let Some(job) = app.store.read(|d| d.download_jobs.get(id).cloned()) {
        let (part, archive) = archive_paths(app, id, job.package.format);
        let _ = fs::remove_file(part);
        let _ = fs::remove_file(archive);
    }
}

fn get_task(app: &Shared, id: &str) -> Option<DownloadTask> {
    app.store.read(|d| d.downloads.iter().find(|t| t.id == id).cloned())
}

/// Applies `f` to the task, persists (unless `volatile`) and emits a progress event.
fn mutate_task(app: &Shared, id: &str, volatile: bool, f: impl FnOnce(&mut DownloadTask)) -> Option<DownloadTask> {
    let apply = |data: &mut crate::store::Data| {
        let task = data.downloads.iter_mut().find(|t| t.id == id)?;
        f(task);
        task.updated_at = now_iso();
        Some(task.clone())
    };
    let task = if volatile { app.store.update_volatile(apply) } else { app.store.update(apply) };
    if let Some(task) = &task {
        app.emit(BackendEvent::DownloadProgress { task: task.clone() });
    }
    task
}

fn set_status(app: &Shared, id: &str, status: DownloadStatus, error: Option<String>) {
    mutate_task(app, id, false, |task| {
        task.status = status;
        task.error = error;
        if status != DownloadStatus::Downloading {
            task.speed_bps = 0;
            task.eta_seconds = None;
        }
    });
}

pub fn create_task(app: &Shared, game: &Game, kind: DownloadKind, install_dir: Option<String>) -> Result<DownloadTask, String> {
    let package = game.package.clone().ok_or_else(|| {
        app.t(
            "This game has no package for automatic installation — open its page instead.",
            "У этой игры нет пакета для автоустановки — откройте её страницу.",
            "У цієї гри немає пакета для автовстановлення — відкрийте її сторінку.",
        )
    })?;

    let existing = app.store.read(|d| {
        let active = d.downloads.iter().find(|t| t.game_id == game.id && !t.status.is_finished()).cloned();
        let installed = d.installations.iter().find(|i| i.game_id == game.id).cloned();
        (active, installed)
    });
    if let (Some(active), _) = &existing {
        return Ok(active.clone());
    }
    let replace_path = match (kind, existing.1) {
        (DownloadKind::Install, Some(_)) => {
            return Err(app.t("The game is already installed.", "Игра уже установлена.", "Гру вже встановлено."))
        }
        (DownloadKind::Update, None) => {
            return Err(app.t("The game is not installed.", "Игра не установлена.", "Гру не встановлено."))
        }
        (DownloadKind::Update, Some(inst)) => Some(inst.install_path),
        (DownloadKind::Install, None) => None,
    };

    let now = now_iso();
    let task = DownloadTask {
        id: uuid::Uuid::new_v4().to_string(),
        game_id: game.id.clone(),
        title: game.title.clone(),
        version: package.version.clone(),
        kind,
        status: DownloadStatus::Queued,
        downloaded_bytes: 0,
        total_bytes: package.size_bytes,
        speed_bps: 0,
        eta_seconds: None,
        resumable: true,
        error: None,
        created_at: now.clone(),
        updated_at: now,
    };
    let job = DownloadJob { package, install_dir: install_dir.filter(|d| !d.trim().is_empty()), replace_path };
    app.store.update(|d| {
        d.downloads.push(task.clone());
        d.download_jobs.insert(task.id.clone(), job);
    });
    app.emit(BackendEvent::DownloadProgress { task: task.clone() });
    schedule(app);
    Ok(get_task(app, &task.id).unwrap_or(task))
}

/// Starts workers for queued tasks while there are free slots.
pub fn schedule(app: &Shared) {
    let max = app.store.read(|d| d.settings.max_concurrent_downloads).round().clamp(1.0, 5.0) as usize;
    let mut controls = app.controls.lock().unwrap();
    if controls.len() >= max {
        return;
    }
    let mut queued: Vec<(String, String)> = app.store.read(|d| {
        d.downloads
            .iter()
            .filter(|t| t.status == DownloadStatus::Queued && !controls.contains_key(&t.id))
            .map(|t| (t.created_at.clone(), t.id.clone()))
            .collect()
    });
    queued.sort();
    for (_, id) in queued.into_iter().take(max - controls.len()) {
        let control = Arc::new(AtomicU8::new(RUN));
        controls.insert(id.clone(), control.clone());
        let app = app.clone();
        tauri::async_runtime::spawn(async move { run(app, id, control).await });
    }
}

async fn run(app: Shared, id: String, control: Arc<AtomicU8>) {
    match process(&app, &id, &control).await {
        Ok(()) => {}
        Err(Stop::Paused) => set_status(&app, &id, DownloadStatus::Paused, None),
        Err(Stop::Cancelled) => {
            remove_files(&app, &id);
            mutate_task(&app, &id, false, |task| {
                task.status = DownloadStatus::Cancelled;
                task.downloaded_bytes = 0;
                task.speed_bps = 0;
                task.eta_seconds = None;
            });
        }
        Err(Stop::Failed(message)) => {
            set_status(&app, &id, DownloadStatus::Failed, Some(message.clone()));
            if let Some(task) = get_task(&app, &id) {
                let title = i18n::install_failed(&app.lang());
                app.notify(NotificationKind::Error, title, &format!("{}: {message}", task.title), Some(&task.game_id));
            }
        }
    }
    app.controls.lock().unwrap().remove(&id);
    schedule(&app);
}

fn check_control(control: &AtomicU8) -> Result<(), Stop> {
    match control.load(Ordering::SeqCst) {
        PAUSE => Err(Stop::Paused),
        CANCEL => Err(Stop::Cancelled),
        _ => Ok(()),
    }
}

async fn process(app: &Shared, id: &str, control: &Arc<AtomicU8>) -> Result<(), Stop> {
    let task = get_task(app, id).ok_or_else(|| "download not found".to_string())?;
    let job = app.store.read(|d| d.download_jobs.get(id).cloned()).ok_or_else(|| "download job not found".to_string())?;
    let (part, archive_path) = archive_paths(app, id, job.package.format);
    if let Some(dir) = part.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("cannot create download folder: {e}"))?;
    }

    if !archive_path.exists() {
        set_status(app, id, DownloadStatus::Downloading, None);
        download(app, id, &job.package, &part, control).await?;
        fs::rename(&part, &archive_path).map_err(|e| format!("cannot finalize download: {e}"))?;
    }
    check_control(control)?;

    let expected = job.package.sha256.trim().to_ascii_lowercase();
    if !expected.is_empty() {
        set_status(app, id, DownloadStatus::Verifying, None);
        let path = archive_path.clone();
        let actual = tauri::async_runtime::spawn_blocking(move || archive::sha256_file(&path))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("cannot read downloaded file: {e}"))?;
        if actual != expected {
            let _ = fs::remove_file(&archive_path);
            return Err(Stop::Failed(app.t(
                "Checksum mismatch: the file is damaged or was replaced. Retry the download.",
                "Контрольная сумма не совпала: файл повреждён или подменён. Повторите загрузку.",
                "Контрольна сума не збіглася: файл пошкоджено або підмінено. Повторіть завантаження.",
            )));
        }
    }
    check_control(control)?;

    set_status(app, id, DownloadStatus::Installing, None);
    let settings = app.settings();
    let title = task.title.clone();
    let blocking_job = job.clone();
    let blocking_archive = archive_path.clone();
    let manifests = app.dirs.manifests.clone();
    let game_id = task.game_id.clone();
    let lang = settings.language.clone();
    let library_dir = settings.library_dir.clone();
    let installed = tauri::async_runtime::spawn_blocking(move || {
        install(&blocking_archive, &blocking_job, &library_dir, &title, &manifests, &game_id, &lang)
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = fs::remove_file(&archive_path);

    let now = now_iso();
    app.store.update(|d| {
        if let Some(inst) = d.installations.iter_mut().find(|i| i.game_id == task.game_id) {
            inst.version = Some(job.package.version.clone());
            inst.install_path = installed.path.to_string_lossy().into_owned();
            inst.executable = installed.executable.to_string_lossy().into_owned();
            inst.size_bytes = installed.size;
        } else {
            d.installations.push(Installation {
                game_id: task.game_id.clone(),
                title: task.title.clone(),
                version: Some(job.package.version.clone()),
                install_path: installed.path.to_string_lossy().into_owned(),
                executable: installed.executable.to_string_lossy().into_owned(),
                executable_exists: true,
                size_bytes: installed.size,
                installed_at: now.clone(),
                last_played_at: None,
                playtime_seconds: 0,
                favorite: false,
                manual: false,
            });
        }
    });
    mutate_task(app, id, false, |t| {
        t.status = DownloadStatus::Completed;
        t.downloaded_bytes = t.total_bytes.max(t.downloaded_bytes);
        t.speed_bps = 0;
        t.eta_seconds = None;
        t.error = None;
    });
    app.store.update(|d| {
        d.download_jobs.remove(id);
    });
    app.emit(BackendEvent::LibraryChanged);
    let lang = app.lang();
    let title = match task.kind {
        DownloadKind::Install => i18n::game_installed(&lang),
        DownloadKind::Update => i18n::game_updated(&lang),
    };
    app.notify(NotificationKind::Success, title, &task.title, Some(&task.game_id));
    Ok(())
}

async fn download(app: &Shared, id: &str, package: &GamePackage, part: &Path, control: &AtomicU8) -> Result<(), Stop> {
    for attempt in 0..2 {
        let existing = tokio::fs::metadata(part).await.map(|m| m.len()).unwrap_or(0);
        let mut request = app.http.get(&package.url);
        if existing > 0 {
            request = request.header(RANGE, format!("bytes={existing}-"));
        }
        let response = request.send().await.map_err(|e| Stop::Failed(network_error(&e)))?;
        let status = response.status();

        if status == StatusCode::RANGE_NOT_SATISFIABLE && existing > 0 {
            if package.size_bytes > 0 && existing >= package.size_bytes {
                return Ok(());
            }
            let _ = tokio::fs::remove_file(part).await;
            if attempt == 0 {
                continue;
            }
        }
        if !status.is_success() {
            return Err(Stop::Failed(format!("HTTP {}", status.as_u16())));
        }

        let append = status == StatusCode::PARTIAL_CONTENT && existing > 0;
        let mut downloaded = if append { existing } else { 0 };
        let total = response
            .content_length()
            .map(|len| len + downloaded)
            .filter(|t| *t > 0)
            .unwrap_or(package.size_bytes);

        if let Some(free) = part.parent().and_then(free_space) {
            if free < total.saturating_sub(downloaded) + DISK_RESERVE {
                return Err(Stop::Failed(app.t(
                    "Not enough free disk space for the download.",
                    "Недостаточно места на диске для загрузки.",
                    "Недостатньо місця на диску для завантаження.",
                )));
            }
        }

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(part)
            .await
            .map_err(|e| format!("cannot write {}: {e}", part.display()))?;

        mutate_task(app, id, true, |t| {
            t.downloaded_bytes = downloaded;
            t.total_bytes = total;
            t.resumable = true;
        });

        let mut stream = response.bytes_stream();
        let mut last_emit = Instant::now();
        let mut last_save = Instant::now();
        let mut last_bytes = downloaded;
        let mut speed = 0.0f64;
        let mut idle_secs = 0u32;

        loop {
            if let Err(stop) = check_control(control) {
                let _ = file.flush().await;
                return Err(stop);
            }
            let next = match tokio::time::timeout(Duration::from_secs(1), stream.next()).await {
                Ok(next) => next,
                Err(_) => {
                    idle_secs += 1;
                    if idle_secs >= STALL_TIMEOUT_SECS {
                        let _ = file.flush().await;
                        return Err(Stop::Failed("the download stalled — no data from the server".into()));
                    }
                    continue;
                }
            };
            let Some(chunk) = next else { break };
            idle_secs = 0;
            let chunk = chunk.map_err(|e| {
                Stop::Failed(format!("connection lost: {} — press Retry to resume", network_error(&e)))
            })?;
            file.write_all(&chunk).await.map_err(|e| format!("disk write error: {e}"))?;
            downloaded += chunk.len() as u64;

            let limit_kbps = app.store.read(|d| d.settings.speed_limit_kbps).max(0.0);
            app.limiter.throttle(chunk.len() as u64, (limit_kbps * 1024.0) as u64).await;

            let elapsed = last_emit.elapsed();
            if elapsed >= PROGRESS_INTERVAL {
                let instant = (downloaded - last_bytes) as f64 / elapsed.as_secs_f64();
                speed = if speed == 0.0 { instant } else { speed * 0.7 + instant * 0.3 };
                last_bytes = downloaded;
                last_emit = Instant::now();
                let eta = (speed > 1.0 && total > downloaded).then(|| ((total - downloaded) as f64 / speed) as u64);
                let volatile = last_save.elapsed() < SAVE_INTERVAL;
                if !volatile {
                    last_save = Instant::now();
                }
                mutate_task(app, id, volatile, |t| {
                    t.downloaded_bytes = downloaded;
                    t.total_bytes = total.max(downloaded);
                    t.speed_bps = speed as u64;
                    t.eta_seconds = eta;
                });
            }
        }
        file.flush().await.map_err(|e| format!("disk write error: {e}"))?;
        drop(file);
        mutate_task(app, id, false, |t| {
            t.downloaded_bytes = downloaded;
            t.total_bytes = total.max(downloaded);
            t.speed_bps = 0;
            t.eta_seconds = None;
        });
        if total > 0 && downloaded < total {
            return Err(Stop::Failed("the connection closed before the download finished — press Retry to resume".into()));
        }
        return Ok(());
    }
    Err(Stop::Failed("the server rejected the resume request".into()))
}

struct Installed {
    path: PathBuf,
    executable: PathBuf,
    size: u64,
}

pub fn manifest_path(manifests: &Path, game_id: &str) -> PathBuf {
    manifests.join(format!("{}.json", game_id.replace([':', '/', '\\'], "_")))
}

fn install(
    archive_path: &Path,
    job: &DownloadJob,
    library_dir: &str,
    title: &str,
    manifests: &Path,
    game_id: &str,
    lang: &str,
) -> Result<Installed, Stop> {
    let not_found = || {
        format!(
            "{} {}",
            i18n::pick3(
                lang,
                "Executable not found in the package:",
                "В пакете не найден исполняемый файл:",
                "У пакеті не знайдено виконуваний файл:"
            ),
            job.package.executable
        )
    };

    let (path, executable) = if let Some(existing) = &job.replace_path {
        // Update: unpack next to the old folder, then swap, so a failed update never
        // leaves the game half-replaced.
        let existing = PathBuf::from(existing);
        let name = existing.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "game".into());
        let staging = existing.with_file_name(format!(".{name}.fgl-update"));
        let _ = fs::remove_dir_all(&staging);
        if let Err(error) = archive::extract(archive_path, job.package.format, &staging) {
            let _ = fs::remove_dir_all(&staging);
            return Err(Stop::Failed(error));
        }
        let Some(exe_in_staging) = archive::find_executable(&staging, &job.package.executable) else {
            let _ = fs::remove_dir_all(&staging);
            return Err(Stop::Failed(not_found()));
        };
        let relative = exe_in_staging.strip_prefix(&staging).map(Path::to_path_buf).unwrap_or_default();
        if existing.exists() {
            if let Err(error) = fs::remove_dir_all(&existing) {
                let _ = fs::remove_dir_all(&staging);
                return Err(Stop::Failed(format!(
                    "{} ({error})",
                    i18n::pick3(
                        lang,
                        "Cannot replace the old version — close the game and retry",
                        "Не удалось заменить старую версию — закройте игру и повторите",
                        "Не вдалося замінити стару версію — закрийте гру та повторіть"
                    )
                )));
            }
        }
        fs::rename(&staging, &existing).map_err(|e| format!("cannot move the new version into place: {e}"))?;
        let executable = existing.join(relative);
        (existing, executable)
    } else {
        let base = PathBuf::from(job.install_dir.as_deref().unwrap_or(library_dir));
        let target = unique_dir(&base.join(sanitize_dir_name(title)));
        if let Some(free) = free_space(&base) {
            // Archives typically expand to well over their size; require some headroom.
            let needed = job.package.size_bytes.saturating_mul(2);
            if free < needed {
                return Err(Stop::Failed(
                    i18n::pick3(
                        lang,
                        "Not enough free space in the installation folder.",
                        "Недостаточно места в папке установки.",
                        "Недостатньо місця в теці встановлення.",
                    )
                    .into(),
                ));
            }
        }
        if let Err(error) = archive::extract(archive_path, job.package.format, &target) {
            let _ = fs::remove_dir_all(&target);
            return Err(Stop::Failed(error));
        }
        let Some(executable) = archive::find_executable(&target, &job.package.executable) else {
            let _ = fs::remove_dir_all(&target);
            return Err(Stop::Failed(not_found()));
        };
        (target, executable)
    };

    let manifest = archive::build_manifest(&path).map_err(|e| format!("cannot index installed files: {e}"))?;
    if let Ok(bytes) = serde_json::to_vec(&manifest) {
        let _ = fs::write(manifest_path(manifests, game_id), bytes);
    }
    Ok(Installed { size: archive::manifest_size(&manifest), path, executable })
}

pub fn pause(app: &Shared, id: &str) -> Result<(), String> {
    let control = app.controls.lock().unwrap().get(id).cloned();
    if let Some(control) = control {
        control.store(PAUSE, Ordering::SeqCst);
        return Ok(());
    }
    match get_task(app, id).map(|t| t.status) {
        Some(DownloadStatus::Queued) => {
            set_status(app, id, DownloadStatus::Paused, None);
            Ok(())
        }
        Some(_) => Ok(()),
        None => Err("download not found".into()),
    }
}

pub fn resume(app: &Shared, id: &str) -> Result<(), String> {
    match get_task(app, id).map(|t| t.status) {
        Some(DownloadStatus::Paused) => {
            set_status(app, id, DownloadStatus::Queued, None);
            schedule(app);
            Ok(())
        }
        Some(_) => Ok(()),
        None => Err("download not found".into()),
    }
}

pub fn cancel(app: &Shared, id: &str) -> Result<(), String> {
    let control = app.controls.lock().unwrap().get(id).cloned();
    if let Some(control) = control {
        control.store(CANCEL, Ordering::SeqCst);
        return Ok(());
    }
    let Some(task) = get_task(app, id) else { return Err("download not found".into()) };
    if task.status.is_finished() {
        return Ok(());
    }
    remove_files(app, id);
    mutate_task(app, id, false, |t| {
        t.status = DownloadStatus::Cancelled;
        t.downloaded_bytes = 0;
        t.speed_bps = 0;
        t.eta_seconds = None;
    });
    Ok(())
}

pub fn retry(app: &Shared, id: &str) -> Result<(), String> {
    let Some(task) = get_task(app, id) else { return Err("download not found".into()) };
    if !matches!(task.status, DownloadStatus::Failed | DownloadStatus::Cancelled) {
        return Ok(());
    }
    if app.store.read(|d| !d.download_jobs.contains_key(id)) {
        return Err("this download can no longer be retried — start the installation again".into());
    }
    mutate_task(app, id, false, |t| {
        t.status = DownloadStatus::Queued;
        t.error = None;
    });
    schedule(app);
    Ok(())
}

pub fn clear_finished(app: &Shared) {
    let removed: Vec<String> = app.store.read(|d| {
        d.downloads.iter().filter(|t| t.status.is_finished()).map(|t| t.id.clone()).collect()
    });
    for id in &removed {
        remove_files(app, id);
    }
    app.store.update(|d| {
        d.downloads.retain(|t| !t.status.is_finished());
        for id in &removed {
            d.download_jobs.remove(id);
        }
    });
    for id in removed {
        app.emit(BackendEvent::DownloadRemoved { id });
    }
}
