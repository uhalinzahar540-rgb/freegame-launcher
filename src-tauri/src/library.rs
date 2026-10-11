//! Installed games: manual additions, removal, file verification, launching and playtime.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use crate::app::Shared;
use crate::archive::{self, Manifest};
use crate::downloads::manifest_path;
use crate::models::*;
use crate::util::{is_safe_to_delete, now_iso, slugify};

pub fn library(app: &Shared) -> Vec<Installation> {
    let mut items = app.store.read(|d| d.installations.clone());
    for item in &mut items {
        item.executable_exists = Path::new(&item.executable).is_file();
    }
    items.sort_by(|a, b| b.last_played_at.cmp(&a.last_played_at).then_with(|| a.title.cmp(&b.title)));
    items
}

fn find_installation(app: &Shared, game_id: &str) -> Result<Installation, String> {
    app.store
        .read(|d| d.installations.iter().find(|i| i.game_id == game_id).cloned())
        .ok_or_else(|| app.t("The game is not installed.", "Игра не установлена.", "Гру не встановлено."))
}

pub async fn add_manual(app: &Shared, executable_path: String, title: String) -> Result<Installation, String> {
    let exe = PathBuf::from(executable_path.trim());
    if !exe.is_file() {
        return Err(app.t("The selected file does not exist.", "Выбранный файл не существует.", "Вибраний файл не існує."));
    }
    let title = match title.trim() {
        "" => exe.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Game".into()),
        t => t.to_string(),
    };
    let exe_str = exe.to_string_lossy().into_owned();
    if app.store.read(|d| d.installations.iter().any(|i| i.manual && i.executable.eq_ignore_ascii_case(&exe_str))) {
        return Err(app.t(
            "This game is already in the library.",
            "Эта игра уже есть в библиотеке.",
            "Ця гра вже є в бібліотеці.",
        ));
    }
    let folder = exe.parent().map(Path::to_path_buf).unwrap_or_else(|| exe.clone());
    let scan_folder = folder.clone();
    let size = tauri::async_runtime::spawn_blocking(move || archive::dir_size_capped(&scan_folder, 200_000))
        .await
        .unwrap_or(0);

    let short_id = uuid::Uuid::new_v4().simple().to_string();
    let installation = Installation {
        game_id: format!("local:{}-{}", slugify(&title), &short_id[..8]),
        title,
        version: None,
        install_path: folder.to_string_lossy().into_owned(),
        executable: exe_str,
        executable_exists: true,
        size_bytes: size,
        installed_at: now_iso(),
        last_played_at: None,
        playtime_seconds: 0,
        favorite: false,
        manual: true,
    };
    app.store.update(|d| d.installations.push(installation.clone()));
    app.emit(BackendEvent::LibraryChanged);
    app.emit(BackendEvent::CatalogChanged);
    app.emit(BackendEvent::SourcesChanged);
    Ok(installation)
}

pub fn set_favorite(app: &Shared, game_id: &str, favorite: bool) -> Result<(), String> {
    let found = app.store.update(|d| {
        d.installations.iter_mut().find(|i| i.game_id == game_id).map(|i| i.favorite = favorite).is_some()
    });
    if !found {
        return Err(app.t("The game is not installed.", "Игра не установлена.", "Гру не встановлено."));
    }
    app.emit(BackendEvent::LibraryChanged);
    Ok(())
}

pub async fn uninstall(app: &Shared, game_id: &str) -> Result<(), String> {
    let inst = find_installation(app, game_id)?;
    if app.running.lock().unwrap().contains_key(game_id) {
        return Err(app.t(
            "Close the game before removing it.",
            "Закройте игру перед удалением.",
            "Закрийте гру перед видаленням.",
        ));
    }
    if !inst.manual {
        let path = PathBuf::from(&inst.install_path);
        if !is_safe_to_delete(&path) {
            return Err(format!("refusing to delete {}", path.display()));
        }
        let result = tauri::async_runtime::spawn_blocking(move || match fs::remove_dir_all(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        })
        .await
        .map_err(|e| e.to_string())?;
        if let Err(error) = result {
            return Err(format!(
                "{} ({error})",
                app.t(
                    "Some files could not be removed — make sure the game is closed",
                    "Не удалось удалить часть файлов — убедитесь, что игра закрыта",
                    "Не вдалося видалити частину файлів — переконайтеся, що гру закрито",
                )
            ));
        }
        let _ = fs::remove_file(manifest_path(&app.dirs.manifests, game_id));
    }
    app.store.update(|d| {
        d.installations.retain(|i| i.game_id != game_id);
        d.sessions.retain(|s| s.game_id != game_id);
    });
    app.emit(BackendEvent::LibraryChanged);
    if inst.manual {
        app.emit(BackendEvent::CatalogChanged);
        app.emit(BackendEvent::SourcesChanged);
    }
    Ok(())
}

pub async fn verify(app: &Shared, game_id: &str) -> Result<VerifyReport, String> {
    let inst = find_installation(app, game_id)?;
    let executable_exists = Path::new(&inst.executable).is_file();
    let manifest: Option<Manifest> =
        fs::read(manifest_path(&app.dirs.manifests, game_id)).ok().and_then(|b| serde_json::from_slice(&b).ok());
    let Some(manifest) = manifest else {
        return Ok(VerifyReport {
            game_id: game_id.to_string(),
            checked_files: usize::from(executable_exists),
            missing: if executable_exists { Vec::new() } else { vec![inst.executable.clone()] },
            modified: Vec::new(),
            executable_exists,
            ok: executable_exists,
        });
    };
    let root = PathBuf::from(&inst.install_path);
    let outcome = tauri::async_runtime::spawn_blocking(move || archive::verify_manifest(&root, &manifest))
        .await
        .map_err(|e| e.to_string())?;
    let ok = executable_exists && outcome.missing.is_empty() && outcome.modified.is_empty();
    Ok(VerifyReport {
        game_id: game_id.to_string(),
        checked_files: outcome.checked,
        missing: outcome.missing,
        modified: outcome.modified,
        executable_exists,
        ok,
    })
}

pub fn play_stats(app: &Shared, game_id: &str) -> PlayStats {
    let (mut sessions, recorded) = app.store.read(|d| {
        let sessions: Vec<PlaySession> = d.sessions.iter().filter(|s| s.game_id == game_id).cloned().collect();
        let recorded = d.installations.iter().find(|i| i.game_id == game_id).map(|i| i.playtime_seconds);
        (sessions, recorded)
    });
    sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    let total = recorded.unwrap_or_else(|| sessions.iter().map(|s| s.duration_seconds).sum());
    PlayStats { game_id: game_id.to_string(), total_seconds: total, session_count: sessions.len(), sessions }
}

pub fn launch(app: &Shared, game_id: &str) -> Result<(), String> {
    if app.running.lock().unwrap().contains_key(game_id) {
        return Err(app.t("The game is already running.", "Игра уже запущена.", "Гра вже запущена."));
    }
    let inst = find_installation(app, game_id)?;
    let exe = PathBuf::from(&inst.executable);
    if !exe.is_file() {
        return Err(app.t(
            "The game's executable was not found. Verify the files or reinstall the game.",
            "Исполняемый файл игры не найден. Проверьте файлы или переустановите игру.",
            "Виконуваний файл гри не знайдено. Перевірте файли або перевстановіть гру.",
        ));
    }
    let workdir = exe.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from(&inst.install_path));

    let mut child = match Command::new(&exe).current_dir(&workdir).spawn() {
        Ok(child) => child,
        // ERROR_ELEVATION_REQUIRED: let the shell show the UAC prompt. Playtime can't be tracked then.
        Err(error) if error.raw_os_error() == Some(740) => {
            tauri_plugin_opener::open_path(&exe, None::<&str>).map_err(|e| e.to_string())?;
            mark_played(app, game_id, 0);
            return Ok(());
        }
        Err(error) => return Err(format!("{}: {error}", app.t("Failed to start the game", "Не удалось запустить игру", "Не вдалося запустити гру"))),
    };

    app.running.lock().unwrap().insert(game_id.to_string(), child.id());
    app.emit(BackendEvent::GameRunning { game_id: game_id.to_string(), running: true });

    let started_at = now_iso();
    let started = Instant::now();
    let app = app.clone();
    let game_id = game_id.to_string();
    std::thread::spawn(move || {
        let _ = child.wait();
        let duration = started.elapsed().as_secs();
        app.store.update(|d| {
            let session = PlaySession {
                id: d.next_id(),
                game_id: game_id.clone(),
                started_at: started_at.clone(),
                ended_at: Some(now_iso()),
                duration_seconds: duration,
            };
            d.sessions.push(session);
        });
        mark_played(&app, &game_id, duration);
        app.running.lock().unwrap().remove(&game_id);
        app.emit(BackendEvent::GameRunning { game_id, running: false });
    });
    Ok(())
}

fn mark_played(app: &Shared, game_id: &str, duration: u64) {
    app.store.update(|d| {
        if let Some(inst) = d.installations.iter_mut().find(|i| i.game_id == game_id) {
            inst.last_played_at = Some(now_iso());
            inst.playtime_seconds += duration;
        }
    });
    app.emit(BackendEvent::LibraryChanged);
}

pub fn running_games(app: &Shared) -> Vec<String> {
    app.running.lock().unwrap().keys().cloned().collect()
}

pub fn check_updates(app: &Shared) -> Vec<UpdateInfo> {
    let installs = app.store.read(|d| d.installations.iter().filter(|i| !i.manual).cloned().collect::<Vec<_>>());
    installs
        .into_iter()
        .filter_map(|inst| {
            let game = app.find_game(&inst.game_id)?;
            let package = game.package?;
            let outdated = inst.version.as_deref().map_or(true, |v| v.trim() != package.version.trim());
            outdated.then(|| UpdateInfo {
                game_id: inst.game_id,
                title: inst.title,
                installed_version: inst.version,
                available_version: package.version,
                size_bytes: package.size_bytes,
                source_id: game.source_id,
            })
        })
        .collect()
}
