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

/// One page of the full Steam store catalog (every game, not just the bundled list).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamPage {
    pub total: u32,
    pub games: Vec<Game>,
}

pub const BROWSE_PAGE: u32 = 48;
const STEAM_CDN: &str = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/";

fn steam_language(lang: &str) -> &'static str {
    match lang {
        "ru" => "russian",
        "uk" => "ukrainian",
        "de" => "german",
        "fr" => "french",
        "es" => "spanish",
        "pt" => "brazilian",
        "tr" => "turkish",
        "zh" => "schinese",
        "ja" => "japanese",
        "ko" => "koreana",
        "ar" => "arabic",
        _ => "english",
    }
}

fn sort_param(sort: &str) -> &'static str {
    match sort {
        "title" => "Name_ASC",
        "new" => "Released_DESC",
        "reviews" => "Reviews_DESC",
        "price" => "Price_ASC",
        _ => "",
    }
}

fn between<'a>(haystack: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let from = haystack.find(start)? + start.len();
    let len = haystack[from..].find(end)?;
    Some(&haystack[from..from + len])
}

fn unescape(text: &str) -> String {
    text.replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
}

/// `30 Oct, 2025` / `Oct 30, 2025` (English store format) -> `2025-10-30`.
pub fn parse_english_date(text: &str) -> Option<String> {
    const MONTHS: [&str; 12] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    let parts: Vec<&str> = text.split(|c: char| c == ' ' || c == ',').filter(|p| !p.is_empty()).collect();
    if parts.len() != 3 {
        return None;
    }
    let month_of = |p: &str| {
        let p = p.to_ascii_lowercase();
        MONTHS.iter().position(|m| p.starts_with(m)).map(|i| i + 1)
    };
    let (day, month) = match (parts[0].parse::<u32>().ok(), month_of(parts[1]), month_of(parts[0]), parts[1].parse::<u32>().ok()) {
        (Some(d), Some(m), _, _) => (d, m),
        (_, _, Some(m), Some(d)) => (d, m),
        _ => return None,
    };
    let year: u32 = parts[2].parse().ok()?;
    (1..=31).contains(&day).then(|| format!("{year:04}-{month:02}-{day:02}"))
}

fn strip_tags(html: &str) -> String {
    let spaced = html.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n").replace("</p>", "\n").replace("</li>", "\n");
    let mut out = String::with_capacity(spaced.len());
    let mut in_tag = false;
    for c in spaced.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let text = unescape(&out);
    let mut lines: Vec<&str> = text.lines().map(str::trim).collect();
    lines.dedup_by(|a, b| a.is_empty() && b.is_empty());
    lines.join("\n").trim().to_string()
}

fn price_from_row(row: &str) -> (bool, Option<StorePrice>) {
    let final_minor: u64 = between(row, "data-price-final=\"", "\"").and_then(|v| v.parse().ok()).unwrap_or(0);
    // Free games render as `<div class="discount_final_price free">Free</div>`.
    let final_text = between(row, "discount_final_price", "</div>")
        .and_then(|s| s.split_once('>'))
        .map(|(_, text)| unescape(text.trim()))
        .unwrap_or_default();
    if final_text.is_empty() {
        return (false, None);
    }
    if final_minor == 0 {
        return (true, None);
    }
    let discount: u32 = between(row, "data-discount=\"", "\"").and_then(|v| v.parse().ok()).unwrap_or(0);
    let original = between(row, "discount_original_price\">", "</div>").map(|s| unescape(s.trim()));
    let initial = if discount > 0 && discount < 100 {
        (final_minor as f64 * 100.0 / (100 - discount) as f64).round() as u64
    } else {
        final_minor
    };
    (
        false,
        Some(StorePrice {
            currency: String::new(),
            r#final: final_minor,
            initial,
            discount_percent: discount,
            initial_formatted: original.unwrap_or_else(|| final_text.clone()),
            final_formatted: final_text,
        }),
    )
}

pub fn parse_search_html(html: &str, start: u32, local: &Local) -> Vec<Game> {
    let now = "1970-01-01T00:00:00Z".to_string();
    html.split("<a href=")
        .skip(1)
        .enumerate()
        .filter_map(|(index, row)| {
            let app_id: u32 = between(row, "data-ds-appid=\"", "\"")?.split(',').next()?.parse().ok()?;
            let title = unescape(between(row, "<span class=\"title\">", "</span>")?.trim());
            let release_date = between(row, "search_released responsive_secondrow\">", "</div>").and_then(|d| parse_english_date(d.trim()));
            // Row capsules sit in hashed folders where `header.jpg` is missing; the unhashed path always resolves.
            let header = Some(format!("{STEAM_CDN}{app_id}/header.jpg"));
            let (is_free, price) = price_from_row(row);
            let date = release_date.as_ref().map(|d| format!("{d}T00:00:00Z")).unwrap_or_else(|| now.clone());
            Some(Game {
                id: format!("steam:{app_id}"),
                source_id: "steam".into(),
                slug: app_id.to_string(),
                title,
                developer: None,
                short_description: String::new(),
                description: String::new(),
                genres: Vec::new(),
                cover_url: header.clone(),
                hero_url: header,
                screenshots: Vec::new(),
                page_url: Some(store_page(app_id)),
                license: None,
                release_date,
                popularity: 1_000_000f64 - f64::from(start) - index as f64,
                requirements: None,
                package: None,
                store: Some(StoreInfo {
                    steam_app_id: app_id,
                    is_free,
                    price,
                    installed: local.installed.contains(&app_id),
                    client_available: local.client_available,
                }),
                created_at: date.clone(),
                updated_at: date,
            })
        })
        .collect()
}

pub async fn browse(
    http: &reqwest::Client,
    query: &str,
    start: u32,
    sort: &str,
    on_sale: bool,
    region: &str,
) -> Result<SteamPage, String> {
    #[derive(Deserialize)]
    struct SearchResponse {
        total_count: u32,
        results_html: String,
    }

    let mut params: Vec<(&str, String)> = vec![
        ("start", start.to_string()),
        ("count", BROWSE_PAGE.to_string()),
        ("category1", "998".into()),
        ("infinite", "1".into()),
        ("json", "1".into()),
        ("cc", region.to_string()),
        ("l", "english".into()),
        ("ndl", "1".into()),
    ];
    if !query.trim().is_empty() {
        params.push(("term", query.trim().to_string()));
    }
    let sort = sort_param(sort);
    if !sort.is_empty() {
        params.push(("sort_by", sort.into()));
    }
    if on_sale {
        params.push(("specials", "1".into()));
    }
    let resp = http
        .get(format!("{STEAM_HOME}search/results/"))
        .query(&params)
        .send()
        .await
        .map_err(|e| crate::app::network_error(&e))?;
    if !resp.status().is_success() {
        return Err(format!("Steam: HTTP {}", resp.status().as_u16()));
    }
    let body: SearchResponse = resp.json().await.map_err(|e| format!("Steam: {e}"))?;
    Ok(SteamPage { total: body.total_count, games: parse_search_html(&body.results_html, start, &scan_local()) })
}

/// Full store data for a single game, localized to the launcher language.
pub async fn details(http: &reqwest::Client, app_id: u32, region: &str, lang: &str) -> Result<Game, String> {
    #[derive(Deserialize)]
    struct Named {
        description: String,
    }
    #[derive(Deserialize)]
    struct Shot {
        path_full: String,
    }
    #[derive(Deserialize)]
    struct Overview {
        initial: u64,
        r#final: u64,
        discount_percent: u32,
        currency: String,
        initial_formatted: String,
        final_formatted: String,
    }
    #[derive(Deserialize)]
    struct Data {
        name: String,
        #[serde(default)]
        is_free: bool,
        #[serde(default)]
        short_description: String,
        #[serde(default)]
        about_the_game: String,
        #[serde(default)]
        developers: Vec<String>,
        #[serde(default)]
        genres: Vec<Named>,
        header_image: Option<String>,
        #[serde(default)]
        screenshots: Vec<Shot>,
        price_overview: Option<Overview>,
    }
    #[derive(Deserialize)]
    struct Entry {
        success: bool,
        data: Option<Data>,
    }

    let url = format!("{STEAM_HOME}api/appdetails?appids={app_id}&cc={region}&l={}", steam_language(lang));
    let resp = http.get(&url).send().await.map_err(|e| crate::app::network_error(&e))?;
    if !resp.status().is_success() {
        return Err(format!("Steam: HTTP {}", resp.status().as_u16()));
    }
    let mut body: HashMap<String, Entry> = resp.json().await.map_err(|e| format!("Steam: {e}"))?;
    let data = body
        .remove(&app_id.to_string())
        .filter(|e| e.success)
        .and_then(|e| e.data)
        .ok_or_else(|| format!("Steam: app {app_id} not found"))?;
    let local = scan_local();
    let now = "1970-01-01T00:00:00Z".to_string();
    Ok(Game {
        id: format!("steam:{app_id}"),
        source_id: "steam".into(),
        slug: app_id.to_string(),
        title: data.name,
        developer: data.developers.into_iter().next(),
        short_description: unescape(&data.short_description),
        description: strip_tags(&data.about_the_game),
        genres: data.genres.into_iter().map(|g| g.description).collect(),
        cover_url: data.header_image.clone(),
        hero_url: data.screenshots.first().map(|s| s.path_full.clone()).or(data.header_image),
        screenshots: data.screenshots.into_iter().take(8).map(|s| s.path_full).collect(),
        page_url: Some(store_page(app_id)),
        license: None,
        release_date: None,
        popularity: 0.0,
        requirements: None,
        package: None,
        store: Some(StoreInfo {
            steam_app_id: app_id,
            is_free: data.is_free,
            price: data.price_overview.map(|o| StorePrice {
                currency: o.currency,
                r#final: o.r#final,
                initial: o.initial,
                discount_percent: o.discount_percent,
                initial_formatted: if o.initial_formatted.is_empty() { o.final_formatted.clone() } else { o.initial_formatted },
                final_formatted: o.final_formatted,
            }),
            installed: local.installed.contains(&app_id),
            client_available: local.client_available,
        }),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[cfg(test)]
mod browse_tests {
    use super::*;

    #[test]
    fn parses_store_dates() {
        assert_eq!(parse_english_date("30 Oct, 2025").as_deref(), Some("2025-10-30"));
        assert_eq!(parse_english_date("Jul 9, 2013").as_deref(), Some("2013-07-09"));
        assert_eq!(parse_english_date("Coming soon"), None);
    }

    #[test]
    fn parses_search_rows() {
        let html = r#"<!-- x --><a href="https://store.steampowered.com/app/1/X/" data-ds-appid="1808500" class="search_result_row">
<div class="search_capsule"><img src="https://cdn/apps/1808500/capsule_231x87.jpg?t=1" ></div>
<span class="title">ARC Raiders &amp; Co</span>
<div class="search_released responsive_secondrow">
  30 Oct, 2025 </div>
<div class="search_price_discount_combined responsive_secondrow" data-price-final="161000">
<div class="discount_block search_discount_block" data-price-final="161000" data-discount="50"><div class="discount_original_price">3220 руб</div><div class="discount_final_price">1610 руб</div></div></div>
</a><a href="https://store.steampowered.com/app/570/" data-ds-appid="570" class="row"><img src="https://cdn/apps/570/capsule_231x87.jpg" ><span class="title">Dota 2</span>
<div class="search_released responsive_secondrow">9 Jul, 2013</div><div data-price-final="0"><div class="discount_block no_discount"><div class="discount_final_price free">Free</div></div></div></a>"#;
        let local = Local { installed: HashSet::from([570]), client_available: true };
        let games = parse_search_html(html, 0, &local);
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].title, "ARC Raiders & Co");
        assert_eq!(games[0].release_date.as_deref(), Some("2025-10-30"));
        assert_eq!(games[0].cover_url.as_deref(), Some(format!("{STEAM_CDN}1808500/header.jpg").as_str()));
        let price = games[0].store.as_ref().unwrap().price.as_ref().unwrap();
        assert_eq!((price.r#final, price.initial, price.discount_percent), (161000, 322000, 50));
        assert_eq!(price.initial_formatted, "3220 руб");
        let dota = games[1].store.as_ref().unwrap();
        assert!(dota.is_free && dota.price.is_none() && dota.installed);
        assert!(games[0].popularity > games[1].popularity);
    }
}
