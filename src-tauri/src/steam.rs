//! Steam store source: a curated list of paid hits with live regional prices.
//! Games are bought and installed by the official Steam client; the launcher only
//! opens the store page and starts games that are already installed there.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::models::{Game, StoreInfo, StorePrice, SystemRequirements};

pub const BUNDLED_STEAM: &str = include_str!("../../public/catalog/steam.json");
pub const STEAM_HOME: &str = "https://store.steampowered.com/";
const PRICE_BATCH: usize = 40;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SteamFile {
    updated_at: String,
    games: Vec<SteamEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamEntry {
    pub app_id: u32,
    slug: String,
    title: String,
    developer: Option<String>,
    release_date: Option<String>,
    #[serde(default)]
    popularity: f64,
    cover_url: Option<String>,
    hero_url: Option<String>,
    #[serde(default)]
    screenshots: Vec<String>,
    requirements: Option<SystemRequirements>,
    #[serde(default)]
    is_free: bool,
    price: Option<StorePrice>,
    #[serde(default)]
    i18n: HashMap<String, Localized>,
    #[serde(skip)]
    catalog_date: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Localized {
    short_description: String,
    description: String,
    genres: Vec<String>,
}

pub fn parse_bundled() -> Result<Vec<SteamEntry>, String> {
    let file: SteamFile = serde_json::from_str(BUNDLED_STEAM).map_err(|e| format!("invalid Steam catalog: {e}"))?;
    Ok(file
        .games
        .into_iter()
        .map(|mut g| {
            g.catalog_date = file.updated_at.clone();
            g
        })
        .collect())
}

/// Live prices for the user's region, keyed by app id. `None` means free or not sold.
pub type PriceMap = HashMap<u32, Option<StorePrice>>;

pub struct Local {
    pub installed: HashSet<u32>,
    pub client_available: bool,
}

pub fn to_game(entry: &SteamEntry, lang: &str, prices: &PriceMap, local: &Local) -> Game {
    let text = entry
        .i18n
        .get(lang)
        .filter(|l| !l.short_description.is_empty())
        .or_else(|| entry.i18n.get("en"))
        .cloned()
        .unwrap_or_default();
    let price = match prices.get(&entry.app_id) {
        Some(live) => live.clone(),
        None => entry.price.clone(),
    };
    let date = entry
        .release_date
        .as_ref()
        .map(|d| format!("{d}T00:00:00Z"))
        .unwrap_or_else(|| entry.catalog_date.clone());
    Game {
        id: format!("steam:{}", entry.app_id),
        source_id: "steam".into(),
        slug: entry.slug.clone(),
        title: entry.title.clone(),
        developer: entry.developer.clone(),
        short_description: text.short_description,
        description: text.description,
        genres: text.genres,
        cover_url: entry.cover_url.clone(),
        hero_url: entry.hero_url.clone().or_else(|| entry.cover_url.clone()),
        screenshots: entry.screenshots.clone(),
        page_url: Some(store_page(entry.app_id)),
        license: None,
        release_date: entry.release_date.clone(),
        popularity: entry.popularity,
        requirements: entry.requirements.clone(),
        package: None,
        store: Some(StoreInfo {
            steam_app_id: entry.app_id,
            is_free: entry.is_free,
            price,
            installed: local.installed.contains(&entry.app_id),
            client_available: local.client_available,
        }),
        created_at: date.clone(),
        updated_at: date,
    }
}

pub fn store_page(app_id: u32) -> String {
    format!("{STEAM_HOME}app/{app_id}/")
}

/// Two-letter store region derived from the OS locale (e.g. `ru-RU` -> `RU`).
pub fn region() -> String {
    sys_locale::get_locale()
        .and_then(|locale| {
            locale
                .split(['-', '_'])
                .nth(1)
                .filter(|r| r.len() == 2 && r.chars().all(|c| c.is_ascii_alphabetic()))
                .map(str::to_ascii_uppercase)
        })
        .unwrap_or_else(|| "US".into())
}

pub async fn fetch_prices(http: &reqwest::Client, app_ids: &[u32], region: &str) -> Result<PriceMap, String> {
    #[derive(Deserialize)]
    struct Overview {
        currency: String,
        initial: u64,
        r#final: u64,
        discount_percent: u32,
        initial_formatted: String,
        final_formatted: String,
    }

    let mut prices = PriceMap::new();
    for chunk in app_ids.chunks(PRICE_BATCH) {
        let ids = chunk.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        let url = format!("{STEAM_HOME}api/appdetails?appids={ids}&filters=price_overview&cc={region}");
        let resp = http.get(&url).send().await.map_err(|e| crate::app::network_error(&e))?;
        if !resp.status().is_success() {
            return Err(format!("Steam: HTTP {}", resp.status().as_u16()));
        }
        let body: HashMap<String, serde_json::Value> = resp.json().await.map_err(|e| format!("Steam: {e}"))?;
        for (id, item) in body {
            let Ok(id) = id.parse::<u32>() else { continue };
            if item.get("success").and_then(|v| v.as_bool()) != Some(true) {
                continue;
            }
            let overview = item
                .get("data")
                .and_then(|d| d.get("price_overview"))
                .and_then(|p| serde_json::from_value::<Overview>(p.clone()).ok());
            prices.insert(
                id,
                overview.map(|o| StorePrice {
                    currency: o.currency,
                    r#final: o.r#final,
                    initial: o.initial,
                    discount_percent: o.discount_percent,
                    initial_formatted: if o.initial_formatted.is_empty() { o.final_formatted.clone() } else { o.initial_formatted },
                    final_formatted: o.final_formatted,
                }),
            );
        }
    }
    Ok(prices)
}

pub fn scan_local() -> Local {
    let Some(root) = steam_root() else {
        return Local { installed: HashSet::new(), client_available: false };
    };
    let client_available = root.join("steam.exe").is_file() || root.join("steam.sh").is_file();
    let mut libraries = vec![root.clone()];
    if let Ok(text) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        libraries.extend(library_paths(&text));
    }
    let mut installed = HashSet::new();
    for library in libraries {
        installed.extend(installed_in(&library));
    }
    Local { installed, client_available }
}

fn installed_in(library: &Path) -> Vec<u32> {
    let Ok(entries) = fs::read_dir(library.join("steamapps")) else { return Vec::new() };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            name.strip_prefix("appmanifest_")?.strip_suffix(".acf")?.parse().ok()
        })
        .collect()
}

/// Extracts `"path"  "D:\\SteamLibrary"` values from `libraryfolders.vdf`.
pub fn library_paths(vdf: &str) -> Vec<PathBuf> {
    vdf.lines()
        .filter_map(|line| {
            let mut parts = line.split('"').filter(|p| !p.trim().is_empty());
            (parts.next()? == "path").then(|| parts.next())?.map(|p| PathBuf::from(p.replace("\\\\", "\\")))
        })
        .collect()
}

#[cfg(windows)]
fn steam_root() -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let from_user = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
        .and_then(|key| key.get_value::<String, _>("SteamPath"))
        .ok();
    let from_machine = || {
        RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam")
            .and_then(|key| key.get_value::<String, _>("InstallPath"))
            .ok()
    };
    from_user
        .or_else(from_machine)
        .map(|p| PathBuf::from(p.replace('/', "\\")))
        .or_else(|| Some(PathBuf::from("C:\\Program Files (x86)\\Steam")))
        .filter(|p| p.is_dir())
}

#[cfg(not(windows))]
fn steam_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    [".steam/steam", ".local/share/Steam"].iter().map(|p| home.join(p)).find(|p| p.is_dir())
}

/// `steam://` URL for an action, or `None` for unknown actions.
pub fn client_url(app_id: u32, action: &str) -> Option<String> {
    match action {
        "store" => Some(format!("steam://store/{app_id}")),
        "install" => Some(format!("steam://install/{app_id}")),
        "run" => Some(format!("steam://rungameid/{app_id}")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_steam_catalog_parses() {
        let entries = parse_bundled().unwrap();
        assert!(entries.len() >= 30);
        let local = Local { installed: HashSet::from([3241660]), client_available: true };
        let games: Vec<Game> = entries.iter().map(|e| to_game(e, "ru", &PriceMap::new(), &local)).collect();
        let repo = games.iter().find(|g| g.id == "steam:3241660").expect("R.E.P.O. is in the catalog");
        assert!(repo.store.as_ref().unwrap().installed);
        assert!(!repo.short_description.is_empty());
        assert!(games.iter().any(|g| g.id == "steam:3949040"), "RV There Yet? is in the catalog");
    }

    #[test]
    fn parses_library_folders() {
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"\n\t\t\"label\"\t\t\"\"\n\t}\n}";
        let paths = library_paths(vdf);
        assert_eq!(paths, vec![PathBuf::from("C:\\Program Files (x86)\\Steam"), PathBuf::from("D:\\SteamLibrary")]);
    }
}
