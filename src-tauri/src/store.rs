//! Launcher state persisted as a single JSON document in the app data folder.
//! Writes go to a temp file and are renamed into place so a crash never leaves a
//! half-written file behind.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::models::{AppNotification, DownloadTask, GamePackage, Installation, PlaySession, Settings};

/// What a queued download needs to finish, snapshotted when it was created so a
/// retry installs exactly the same package even if the catalog changed meanwhile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    pub package: GamePackage,
    pub install_dir: Option<String>,
    /// For updates: the existing installation folder that gets replaced.
    pub replace_path: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Data {
    pub settings: Settings,
    pub installations: Vec<Installation>,
    pub sessions: Vec<PlaySession>,
    pub notifications: Vec<AppNotification>,
    pub downloads: Vec<DownloadTask>,
    pub download_jobs: HashMap<String, DownloadJob>,
    pub source_enabled: HashMap<String, bool>,
    pub source_sync: HashMap<String, String>,
    pub next_id: u64,
}

impl Data {
    pub fn next_id(&mut self) -> u64 {
        self.next_id += 1;
        self.next_id
    }

    pub fn source_enabled(&self, id: &str) -> bool {
        self.source_enabled.get(id).copied().unwrap_or(true)
    }
}

pub struct Store {
    path: PathBuf,
    data: Mutex<Data>,
    save_lock: Mutex<()>,
    /// True when no state file existed yet (first launch).
    pub fresh: bool,
}

impl Store {
    pub fn load(path: PathBuf) -> Self {
        let (data, fresh) = match fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<Data>(&bytes) {
                Ok(data) => (data, false),
                Err(error) => {
                    eprintln!("state file is corrupted ({error}); keeping a backup and starting fresh");
                    let _ = fs::copy(&path, path.with_extension("json.bak"));
                    (Data::default(), true)
                }
            },
            Err(_) => (Data::default(), true),
        };
        Self { path, data: Mutex::new(data), save_lock: Mutex::new(()), fresh }
    }

    pub fn read<R>(&self, f: impl FnOnce(&Data) -> R) -> R {
        f(&self.data.lock().unwrap())
    }

    /// Mutates and persists.
    pub fn update<R>(&self, f: impl FnOnce(&mut Data) -> R) -> R {
        let (result, bytes) = {
            let mut data = self.data.lock().unwrap();
            let result = f(&mut data);
            (result, serde_json::to_vec_pretty(&*data))
        };
        if let Ok(bytes) = bytes {
            self.write(&bytes);
        }
        result
    }

    /// Mutates in memory only — for high-frequency changes like download progress.
    pub fn update_volatile<R>(&self, f: impl FnOnce(&mut Data) -> R) -> R {
        f(&mut self.data.lock().unwrap())
    }

    pub fn flush(&self) {
        let bytes = self.read(|data| serde_json::to_vec_pretty(data));
        if let Ok(bytes) = bytes {
            self.write(&bytes);
        }
    }

    fn write(&self, bytes: &[u8]) {
        let _guard = self.save_lock.lock().unwrap();
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let tmp = self.path.with_extension("json.tmp");
        let result = fs::write(&tmp, bytes).and_then(|_| fs::rename(&tmp, &self.path));
        if let Err(error) = result {
            eprintln!("failed to save launcher state: {error}");
        }
    }
}
