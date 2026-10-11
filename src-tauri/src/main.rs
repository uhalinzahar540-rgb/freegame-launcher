// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod archive;
mod catalog;
mod commands;
mod downloads;
mod i18n;
mod library;
mod models;
mod steam;
mod store;
mod util;

use std::sync::Arc;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

use crate::app::{App, TrayMenu};

const MINIMIZED_ARG: &str = "--minimized";

fn show_main_window(handle: &AppHandle) {
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_tray(handle: &AppHandle, state: &App) -> tauri::Result<()> {
    let lang = state.lang();
    let open = MenuItem::with_id(handle, "open", i18n::tray_open(&lang), true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "quit", i18n::tray_quit(&lang), true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("FreeGame Launcher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|handle, event| match event.id.as_ref() {
            "open" => show_main_window(handle),
            "quit" => {
                if let Some(state) = handle.try_state::<Arc<App>>() {
                    state.store.flush();
                }
                handle.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = handle.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(handle)?;

    *state.tray.lock().unwrap() = Some(TrayMenu { open, quit });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|handle, _argv, _cwd| {
            show_main_window(handle);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .setup(|tauri_app| {
            let handle = tauri_app.handle().clone();
            let state = Arc::new(App::new(handle.clone())?);
            tauri_app.manage(state.clone());

            if let Err(error) = build_tray(&handle, &state) {
                eprintln!("tray icon unavailable: {error}");
            }

            let started_minimized = std::env::args().any(|arg| arg == MINIMIZED_ARG);
            if !started_minimized {
                show_main_window(&handle);
            }

            App::start_background_work(state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let to_tray = window
                    .app_handle()
                    .try_state::<Arc<App>>()
                    .map(|state| state.store.read(|data| data.settings.minimize_to_tray))
                    .unwrap_or(false);
                if to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else if let Some(state) = window.app_handle().try_state::<Arc<App>>() {
                    state.store.flush();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_catalog,
            commands::get_sources,
            commands::set_source_enabled,
            commands::refresh_source,
            commands::get_library,
            commands::add_manual_game,
            commands::set_favorite,
            commands::uninstall_game,
            commands::verify_game,
            commands::get_play_stats,
            commands::get_downloads,
            commands::start_install,
            commands::pause_download,
            commands::resume_download,
            commands::cancel_download,
            commands::retry_download,
            commands::clear_finished_downloads,
            commands::launch_game,
            commands::get_running_games,
            commands::check_updates,
            commands::start_update,
            commands::check_launcher_update,
            commands::get_settings,
            commands::update_settings,
            commands::get_free_space,
            commands::get_notifications,
            commands::mark_notifications_read,
            commands::steam_open,
            commands::steam_browse,
            commands::steam_game,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start FreeGame Launcher");
}
