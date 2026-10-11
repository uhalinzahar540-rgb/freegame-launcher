//! IPC commands. Names and argument names match `src/services/tauri-backend.ts`
//! (Tauri maps snake_case parameters to the camelCase keys sent by the frontend).

use tauri::State;
use tauri_plugin_autostart::ManagerExt;

use crate::app::Shared;
use crate::models::*;
use crate::{downloads, library};

type Res<T> = Result<T, String>;

#[tauri::command]
pub async fn get_catalog(app: State<'_, Shared>) -> Res<Vec<Game>> {
    Ok(app.catalog_games())
}

#[tauri::command]
pub async fn get_sources(app: State<'_, Shared>) -> Res<Vec<SourceInfo>> {
    Ok(app.sources())
}

#[tauri::command]
pub async fn set_source_enabled(app: State<'_, Shared>, source_id: String, enabled: bool) -> Res<SourceInfo> {
    app.source(&source_id)?;
    app.store.update(|d| {
        d.source_enabled.insert(source_id.clone(), enabled);
    });
    let needs_fetch = enabled && source_id == "freetp" && app.catalog.read().unwrap().freetp.is_empty();
    if needs_fetch {
        return app.refresh_source(&source_id).await;
    }
    app.emit(BackendEvent::CatalogChanged);
    app.emit(BackendEvent::SourcesChanged);
    app.source(&source_id)
}

#[tauri::command]
pub async fn refresh_source(app: State<'_, Shared>, source_id: String) -> Res<SourceInfo> {
    app.refresh_source(&source_id).await
}

#[tauri::command]
pub async fn get_library(app: State<'_, Shared>) -> Res<Vec<Installation>> {
    Ok(library::library(&app))
}

#[tauri::command]
pub async fn add_manual_game(app: State<'_, Shared>, executable_path: String, title: String) -> Res<Installation> {
    library::add_manual(&app, executable_path, title).await
}

#[tauri::command]
pub async fn set_favorite(app: State<'_, Shared>, game_id: String, favorite: bool) -> Res<()> {
    library::set_favorite(&app, &game_id, favorite)
}

#[tauri::command]
pub async fn uninstall_game(app: State<'_, Shared>, game_id: String) -> Res<()> {
    library::uninstall(&app, &game_id).await
}

#[tauri::command]
pub async fn verify_game(app: State<'_, Shared>, game_id: String) -> Res<VerifyReport> {
    library::verify(&app, &game_id).await
}

#[tauri::command]
pub async fn get_play_stats(app: State<'_, Shared>, game_id: String) -> Res<PlayStats> {
    Ok(library::play_stats(&app, &game_id))
}

#[tauri::command]
pub async fn get_downloads(app: State<'_, Shared>) -> Res<Vec<DownloadTask>> {
    let mut tasks = app.store.read(|d| d.downloads.clone());
    tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(tasks)
}

#[tauri::command]
pub async fn start_install(app: State<'_, Shared>, game_id: String, install_dir: Option<String>) -> Res<DownloadTask> {
    let game = app.find_game(&game_id).ok_or_else(|| format!("game not found: {game_id}"))?;
    downloads::create_task(&app, &game, DownloadKind::Install, install_dir)
}

#[tauri::command]
pub async fn pause_download(app: State<'_, Shared>, id: String) -> Res<()> {
    downloads::pause(&app, &id)
}

#[tauri::command]
pub async fn resume_download(app: State<'_, Shared>, id: String) -> Res<()> {
    downloads::resume(&app, &id)
}

#[tauri::command]
pub async fn cancel_download(app: State<'_, Shared>, id: String) -> Res<()> {
    downloads::cancel(&app, &id)
}

#[tauri::command]
pub async fn retry_download(app: State<'_, Shared>, id: String) -> Res<()> {
    downloads::retry(&app, &id)
}

#[tauri::command]
pub async fn clear_finished_downloads(app: State<'_, Shared>) -> Res<()> {
    downloads::clear_finished(&app);
    Ok(())
}

#[tauri::command]
pub async fn launch_game(app: State<'_, Shared>, game_id: String) -> Res<()> {
    library::launch(&app, &game_id)
}

#[tauri::command]
pub async fn get_running_games(app: State<'_, Shared>) -> Res<Vec<String>> {
    Ok(library::running_games(&app))
}

#[tauri::command]
pub async fn check_updates(app: State<'_, Shared>) -> Res<Vec<UpdateInfo>> {
    Ok(library::check_updates(&app))
}

#[tauri::command]
pub async fn start_update(app: State<'_, Shared>, game_id: String) -> Res<DownloadTask> {
    let game = app.find_game(&game_id).ok_or_else(|| format!("game not found: {game_id}"))?;
    downloads::create_task(&app, &game, DownloadKind::Update, None)
}

#[tauri::command]
pub async fn check_launcher_update(app: State<'_, Shared>) -> Res<LauncherUpdateInfo> {
    app.check_launcher_update().await
}

#[tauri::command]
pub async fn get_settings(app: State<'_, Shared>) -> Res<Settings> {
    Ok(app.settings())
}

#[tauri::command]
pub async fn update_settings(app: State<'_, Shared>, patch: serde_json::Value) -> Res<Settings> {
    let before = app.settings();
    let mut merged = serde_json::to_value(&before).map_err(|e| e.to_string())?;
    match (merged.as_object_mut(), patch.as_object()) {
        (Some(target), Some(changes)) => {
            for (key, value) in changes {
                if target.contains_key(key) && !value.is_null() {
                    target.insert(key.clone(), value.clone());
                }
            }
        }
        _ => return Err("settings patch must be an object".into()),
    }
    let mut next: Settings = serde_json::from_value(merged).map_err(|e| format!("invalid settings: {e}"))?;
    next.speed_limit_kbps = next.speed_limit_kbps.max(0.0).round();
    next.max_concurrent_downloads = next.max_concurrent_downloads.round().clamp(1.0, 5.0);
    next.ui_scale = next.ui_scale.round().clamp(80.0, 130.0);
    if next.download_dir.trim().is_empty() {
        next.download_dir = before.download_dir.clone();
    }
    if next.library_dir.trim().is_empty() {
        next.library_dir = before.library_dir.clone();
    }
    if !crate::i18n::SUPPORTED.contains(&next.language.as_str()) {
        next.language = before.language.clone();
    }

    if next.launch_on_startup != before.launch_on_startup {
        let autostart = app.handle.autolaunch();
        let result = if next.launch_on_startup { autostart.enable() } else { autostart.disable() };
        if let Err(error) = result {
            return Err(format!("cannot change autostart: {error}"));
        }
    }

    let saved = next.clone();
    app.store.update(|d| d.settings = saved);

    if next.language != before.language {
        app.update_tray_language();
        app.emit(BackendEvent::SourcesChanged);
    }
    if next.max_concurrent_downloads != before.max_concurrent_downloads {
        downloads::schedule(&app);
    }
    if next.catalog_url != before.catalog_url {
        let shared = app.inner().clone();
        tauri::async_runtime::spawn(async move {
            let _ = shared.refresh_source("opensource").await;
        });
    }
    Ok(next)
}

#[tauri::command]
pub async fn get_free_space(path: String) -> Res<Option<u64>> {
    Ok(crate::util::free_space(std::path::Path::new(&path)))
}

#[tauri::command]
pub async fn get_notifications(app: State<'_, Shared>) -> Res<Vec<AppNotification>> {
    Ok(app.store.read(|d| d.notifications.clone()))
}

#[tauri::command]
pub async fn mark_notifications_read(app: State<'_, Shared>) -> Res<()> {
    app.store.update(|d| d.notifications.iter_mut().for_each(|n| n.read = true));
    Ok(())
}
