//! Wire types shared with the frontend. Field names and enum values mirror `src/types/index.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCapabilities {
    pub search: bool,
    pub metadata: bool,
    pub auto_install: bool,
    pub open_page: bool,
    pub updates: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub id: String,
    pub name: String,
    pub kind: &'static str,
    pub homepage: Option<String>,
    pub enabled: bool,
    pub status: &'static str,
    pub status_message: Option<String>,
    pub last_sync: Option<String>,
    pub game_count: usize,
    pub capabilities: SourceCapabilities,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SystemRequirements {
    pub os: Option<String>,
    pub cpu: Option<String>,
    pub ram: Option<String>,
    pub gpu: Option<String>,
    pub storage: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PackageFormat {
    #[serde(rename = "zip")]
    Zip,
    #[serde(rename = "7z")]
    SevenZ,
}

impl PackageFormat {
    pub fn extension(self) -> &'static str {
        match self {
            PackageFormat::Zip => "zip",
            PackageFormat::SevenZ => "7z",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePackage {
    pub version: String,
    pub url: String,
    #[serde(default)]
    pub size_bytes: u64,
    #[serde(default)]
    pub sha256: String,
    pub format: PackageFormat,
    pub executable: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub source_id: String,
    pub slug: String,
    pub title: String,
    pub developer: Option<String>,
    pub short_description: String,
    pub description: String,
    pub genres: Vec<String>,
    pub cover_url: Option<String>,
    pub hero_url: Option<String>,
    pub screenshots: Vec<String>,
    pub page_url: Option<String>,
    pub license: Option<String>,
    pub release_date: Option<String>,
    pub popularity: f64,
    pub requirements: Option<SystemRequirements>,
    pub package: Option<GamePackage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub game_id: String,
    pub title: String,
    pub version: Option<String>,
    pub install_path: String,
    pub executable: String,
    /// Computed on every read; the stored value is ignored.
    #[serde(default)]
    pub executable_exists: bool,
    pub size_bytes: u64,
    pub installed_at: String,
    pub last_played_at: Option<String>,
    pub playtime_seconds: u64,
    pub favorite: bool,
    pub manual: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Verifying,
    Installing,
    Completed,
    Failed,
    Cancelled,
}

impl DownloadStatus {
    pub fn is_finished(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    pub fn is_busy(self) -> bool {
        matches!(self, Self::Downloading | Self::Verifying | Self::Installing)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadKind {
    Install,
    Update,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub game_id: String,
    pub title: String,
    pub version: String,
    pub kind: DownloadKind,
    pub status: DownloadStatus,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
    pub resumable: bool,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub game_id: String,
    pub title: String,
    pub installed_version: Option<String>,
    pub available_version: String,
    pub size_bytes: u64,
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyReport {
    pub game_id: String,
    pub checked_files: usize,
    pub missing: Vec<String>,
    pub modified: Vec<String>,
    pub executable_exists: bool,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySession {
    pub id: u64,
    pub game_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayStats {
    pub game_id: String,
    pub total_seconds: u64,
    pub session_count: usize,
    pub sessions: Vec<PlaySession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub launch_on_startup: bool,
    pub minimize_to_tray: bool,
    pub language: String,
    pub theme: String,
    pub onboarding_completed: bool,
    pub notifications: bool,
    pub download_dir: String,
    pub speed_limit_kbps: f64,
    pub max_concurrent_downloads: f64,
    pub auto_install: bool,
    pub library_dir: String,
    pub verify_after_install: bool,
    pub check_updates_on_start: bool,
    pub show_playtime: bool,
    pub animations: bool,
    pub ui_scale: f64,
    pub catalog_url: String,
    pub launcher_update_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            launch_on_startup: false,
            minimize_to_tray: true,
            language: "en".into(),
            theme: "crimson".into(),
            onboarding_completed: false,
            notifications: true,
            download_dir: String::new(),
            speed_limit_kbps: 0.0,
            max_concurrent_downloads: 2.0,
            auto_install: true,
            library_dir: String::new(),
            verify_after_install: true,
            check_updates_on_start: true,
            show_playtime: true,
            animations: true,
            ui_scale: 100.0,
            catalog_url: String::new(),
            launcher_update_url: String::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationKind {
    Info,
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppNotification {
    pub id: u64,
    pub kind: NotificationKind,
    pub title: String,
    pub body: String,
    pub game_id: Option<String>,
    pub created_at: String,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateInfo {
    pub current_version: String,
    pub configured: bool,
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum BackendEvent {
    DownloadProgress { task: DownloadTask },
    DownloadRemoved { id: String },
    LibraryChanged,
    CatalogChanged,
    SourcesChanged,
    GameRunning { game_id: String, running: bool },
    Notification { notification: AppNotification },
}
