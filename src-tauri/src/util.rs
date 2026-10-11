use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// Makes a string safe to use as a Windows folder name.
pub fn sanitize_dir_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { ' ' } else { c })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = cleaned.trim_end_matches(['.', ' ']).to_string();
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if cleaned.is_empty() || RESERVED.contains(&cleaned.to_ascii_uppercase().as_str()) {
        "Game".into()
    } else {
        cleaned
    }
}

pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    for c in value.to_lowercase().chars() {
        if c.is_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    let slug = slug.trim_end_matches('-').to_string();
    if slug.is_empty() { "game".into() } else { slug }
}

/// Returns `base` if it is free (missing or empty), otherwise `base (2)`, `base (3)`, …
pub fn unique_dir(base: &Path) -> PathBuf {
    let is_free = |path: &Path| match std::fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => !path.exists(),
    };
    if is_free(base) {
        return base.to_path_buf();
    }
    let name = base.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    (2..1000)
        .map(|i| base.with_file_name(format!("{name} ({i})")))
        .find(|candidate| is_free(candidate))
        .unwrap_or_else(|| base.with_file_name(format!("{name} ({})", uuid::Uuid::new_v4())))
}

/// Free space of the volume holding `path` (or its nearest existing ancestor).
pub fn free_space(path: &Path) -> Option<u64> {
    path.ancestors().find(|p| p.exists()).and_then(|p| fs2::available_space(p).ok())
}

/// Refuses to delete anything that looks like a drive root or a top-level folder.
pub fn is_safe_to_delete(path: &Path) -> bool {
    path.is_absolute() && path.components().count() >= 3
}

/// Compares dotted versions numerically ("1.10" > "1.9"); falls back to string inequality.
pub fn is_newer_version(candidate: &str, current: &str) -> bool {
    fn parts(v: &str) -> Option<Vec<u64>> {
        v.trim().trim_start_matches(['v', 'V']).split(['.', '-', '+']).take(4).map(|p| p.parse().ok()).collect()
    }
    match (parts(candidate), parts(current)) {
        (Some(a), Some(b)) => a > b,
        _ => candidate.trim() != current.trim(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_and_slugs() {
        assert_eq!(sanitize_dir_name("OpenRA: Red Alert?"), "OpenRA Red Alert");
        assert_eq!(sanitize_dir_name("con"), "Game");
        assert_eq!(slugify("Shattered Pixel Dungeon!"), "shattered-pixel-dungeon");
    }

    #[test]
    fn compares_versions() {
        assert!(is_newer_version("v0.2.0", "0.1.9"));
        assert!(is_newer_version("1.10", "1.9"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
    }
}
