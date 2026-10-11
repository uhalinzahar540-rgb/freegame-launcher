//! Extraction, checksums and per-installation file manifests (used by "Verify files").
//! Everything here is blocking and must run on a blocking thread.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{self, BufReader, Read};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::models::PackageFormat;

const BUFFER: usize = 1024 * 1024;

pub fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; BUFFER];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn crc32_file(path: &Path) -> io::Result<u32> {
    let mut file = File::open(path)?;
    let mut hasher = crc32fast::Hasher::new();
    let mut buffer = vec![0u8; BUFFER];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize())
}

pub fn extract(archive: &Path, format: PackageFormat, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("cannot create {}: {e}", dest.display()))?;
    match format {
        PackageFormat::Zip => extract_zip(archive, dest),
        PackageFormat::SevenZ => {
            sevenz_rust::decompress_file(archive, dest).map_err(|e| format!("cannot unpack 7z archive: {e}"))
        }
    }
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|e| format!("cannot open archive: {e}"))?;
    let mut zip = zip::ZipArchive::new(BufReader::new(file)).map_err(|e| format!("invalid zip archive: {e}"))?;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|e| format!("corrupted zip entry: {e}"))?;
        // `enclosed_name` rejects absolute paths and `..` (zip-slip).
        let Some(relative) = entry.enclosed_name() else { continue };
        let out = dest.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| format!("cannot create {}: {e}", out.display()))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        let mut target = File::create(&out).map_err(|e| format!("cannot write {}: {e}", out.display()))?;
        io::copy(&mut entry, &mut target).map_err(|e| format!("cannot unpack {}: {e}", out.display()))?;
    }
    Ok(())
}

/// Resolves the catalog's relative executable path; falls back to searching by file name
/// in case the archive layout differs slightly from the catalog entry.
pub fn find_executable(root: &Path, relative: &str) -> Option<PathBuf> {
    let direct = root.join(relative.replace('\\', "/"));
    if direct.is_file() {
        return Some(direct);
    }
    let wanted = Path::new(relative).file_name()?.to_string_lossy().to_lowercase();
    WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .find(|e| e.file_name().to_string_lossy().to_lowercase() == wanted)
        .map(|e| e.into_path())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub size: u64,
    pub crc32: u32,
}

pub type Manifest = BTreeMap<String, ManifestEntry>;

fn relative_key(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    Some(rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/"))
}

pub fn build_manifest(root: &Path) -> io::Result<Manifest> {
    let mut manifest = Manifest::new();
    for entry in WalkDir::new(root).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let Some(key) = relative_key(root, entry.path()) else { continue };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        manifest.insert(key, ManifestEntry { size, crc32: crc32_file(entry.path())? });
    }
    Ok(manifest)
}

pub fn manifest_size(manifest: &Manifest) -> u64 {
    manifest.values().map(|e| e.size).sum()
}

pub struct VerifyOutcome {
    pub checked: usize,
    pub missing: Vec<String>,
    pub modified: Vec<String>,
}

pub fn verify_manifest(root: &Path, manifest: &Manifest) -> VerifyOutcome {
    let mut outcome = VerifyOutcome { checked: 0, missing: Vec::new(), modified: Vec::new() };
    for (key, expected) in manifest {
        outcome.checked += 1;
        let path = root.join(key);
        match fs::metadata(&path) {
            Err(_) => outcome.missing.push(key.clone()),
            Ok(meta) if meta.len() != expected.size => outcome.modified.push(key.clone()),
            Ok(_) => match crc32_file(&path) {
                Ok(crc) if crc == expected.crc32 => {}
                _ => outcome.modified.push(key.clone()),
            },
        }
    }
    outcome
}

/// Folder size with a cap on the number of visited entries, for manually added games
/// whose executable might live somewhere huge like the Desktop.
pub fn dir_size_capped(root: &Path, max_entries: usize) -> u64 {
    WalkDir::new(root)
        .max_depth(8)
        .into_iter()
        .take(max_entries)
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn zip_roundtrip_manifest_and_verify() {
        let tmp = std::env::temp_dir().join(format!("fgl-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&tmp).unwrap();
        let archive = tmp.join("game.zip");
        {
            let mut writer = zip::ZipWriter::new(File::create(&archive).unwrap());
            let options = zip::write::SimpleFileOptions::default();
            writer.start_file("Game/bin/game.exe", options).unwrap();
            writer.write_all(b"MZ fake exe").unwrap();
            writer.start_file("Game/data.txt", options).unwrap();
            writer.write_all(b"hello").unwrap();
            writer.finish().unwrap();
        }
        let dest = tmp.join("installed");
        extract(&archive, PackageFormat::Zip, &dest).unwrap();
        assert!(find_executable(&dest, "Game/bin/game.exe").is_some());
        assert!(find_executable(&dest, "game.exe").is_some());

        let manifest = build_manifest(&dest).unwrap();
        assert_eq!(manifest.len(), 2);
        assert_eq!(verify_manifest(&dest, &manifest).missing.len(), 0);

        fs::write(dest.join("Game/data.txt"), b"HELLO").unwrap();
        fs::remove_file(dest.join("Game/bin/game.exe")).unwrap();
        let outcome = verify_manifest(&dest, &manifest);
        assert_eq!(outcome.modified, vec!["Game/data.txt".to_string()]);
        assert_eq!(outcome.missing, vec!["Game/bin/game.exe".to_string()]);
        assert_eq!(sha256_file(&archive).unwrap().len(), 64);
        fs::remove_dir_all(&tmp).unwrap();
    }
}
