//! Catalog sources: the bundled/remote open-source JSON catalog and the FreeTP RSS feed.

use chrono::DateTime;
use serde::Deserialize;

use crate::models::{Game, GamePackage, SystemRequirements};

pub const BUNDLED_OPENSOURCE: &str = include_str!("../../public/catalog/opensource.json");
pub const FREETP_HOME: &str = "https://freetp.org/";
pub const FREETP_RSS: &str = "https://freetp.org/rss.xml";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogFile {
    source_id: String,
    updated_at: String,
    games: Vec<CatalogEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogEntry {
    slug: String,
    title: String,
    developer: Option<String>,
    #[serde(default)]
    short_description: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    genres: Vec<String>,
    cover_url: Option<String>,
    hero_url: Option<String>,
    #[serde(default)]
    screenshots: Vec<String>,
    page_url: Option<String>,
    license: Option<String>,
    release_date: Option<String>,
    popularity: Option<f64>,
    requirements: Option<SystemRequirements>,
    package: Option<GamePackage>,
}

pub fn parse_catalog(text: &str) -> Result<Vec<Game>, String> {
    let file: CatalogFile = serde_json::from_str(text).map_err(|e| format!("invalid catalog: {e}"))?;
    Ok(file
        .games
        .into_iter()
        .map(|g| Game {
            id: format!("{}:{}", file.source_id, g.slug),
            source_id: file.source_id.clone(),
            hero_url: g.hero_url.or_else(|| g.cover_url.clone()),
            updated_at: g
                .release_date
                .as_ref()
                .map(|d| format!("{d}T00:00:00Z"))
                .unwrap_or_else(|| file.updated_at.clone()),
            created_at: file.updated_at.clone(),
            slug: g.slug,
            title: g.title,
            developer: g.developer,
            short_description: g.short_description,
            description: g.description,
            genres: g.genres,
            cover_url: g.cover_url,
            screenshots: g.screenshots,
            page_url: g.page_url,
            license: g.license,
            release_date: g.release_date,
            popularity: g.popularity.unwrap_or(0.0),
            requirements: g.requirements,
            package: g.package,
        })
        .collect())
}

pub fn parse_freetp_rss(bytes: &[u8]) -> Result<Vec<Game>, String> {
    let channel = rss::Channel::read_from(bytes).map_err(|e| format!("invalid RSS feed: {e}"))?;
    let total = channel.items().len();
    Ok(channel
        .items()
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let title = decode_entities(item.title()?.trim());
            let link = item.link()?.trim().to_string();
            let slug = link
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .map(|s| s.trim_end_matches(".html").to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| crate::util::slugify(&title));
            let html = item.description().unwrap_or_default();
            let text = strip_html(html);
            let date = item
                .pub_date()
                .and_then(|d| DateTime::parse_from_rfc2822(d).ok())
                .map(|d| d.to_utc().to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
                .unwrap_or_else(crate::util::now_iso);
            let cover = first_image(html).map(|src| absolutize(&src));
            Some(Game {
                id: format!("freetp:{slug}"),
                source_id: "freetp".into(),
                slug,
                title,
                developer: None,
                short_description: truncate(&text, 220),
                description: text,
                genres: item.categories().iter().map(|c| decode_entities(c.name().trim())).collect(),
                hero_url: cover.clone(),
                cover_url: cover,
                screenshots: Vec::new(),
                page_url: Some(link),
                license: None,
                release_date: None,
                // Feed order is newest first; keep that order when sorting by popularity.
                popularity: (total - index) as f64,
                requirements: None,
                package: None,
                created_at: date.clone(),
                updated_at: date,
            })
        })
        .collect())
}

fn absolutize(src: &str) -> String {
    if src.starts_with("http://") || src.starts_with("https://") {
        src.to_string()
    } else if let Some(rest) = src.strip_prefix("//") {
        format!("https://{rest}")
    } else {
        format!("{}{}", FREETP_HOME, src.trim_start_matches('/'))
    }
}

fn first_image(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let img = lower.find("<img")?;
    let src_at = img + lower[img..].find("src=")? + 4;
    let quote = html[src_at..].chars().next()?;
    if quote == '"' || quote == '\'' {
        let rest = &html[src_at + 1..];
        rest.find(quote).map(|end| rest[..end].to_string())
    } else {
        html[src_at..].split([' ', '>']).next().map(str::to_string)
    }
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    decode_entities(&out).split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&laquo;", "«")
        .replace("&raquo;", "»")
        .replace("&ndash;", "–")
        .replace("&mdash;", "—")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let cut: String = text.chars().take(max_chars).collect();
    let cut = cut.rsplit_once(' ').map(|(head, _)| head).unwrap_or(&cut);
    format!("{}…", cut.trim_end_matches([',', '.', ';', ':']))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_parses() {
        let games = parse_catalog(BUNDLED_OPENSOURCE).unwrap();
        assert!(!games.is_empty());
        assert!(games.iter().all(|g| g.id.starts_with("opensource:") && g.package.is_some()));
    }

    #[test]
    fn parses_rss_items() {
        let feed = r#"<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><link>https://freetp.org/</link><description>d</description>
            <item><title>Cool Game</title><link>https://freetp.org/igry-po-seti/123-cool-game.html</link>
            <description><![CDATA[<img src="/uploads/c.jpg"> Great &amp; fun <b>co-op</b>]]></description><category>Action</category></item>
            </channel></rss>"#;
        let games = parse_freetp_rss(feed.as_bytes()).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].id, "freetp:123-cool-game");
        assert_eq!(games[0].cover_url.as_deref(), Some("https://freetp.org/uploads/c.jpg"));
        assert_eq!(games[0].description, "Great & fun co-op");
        assert_eq!(games[0].genres, vec!["Action".to_string()]);
    }
}
