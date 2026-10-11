//! The few strings produced by the native side (notifications, tray menu, source
//! status). Everything else is translated in the frontend.

pub const SUPPORTED: [&str; 13] = ["en", "zh", "hi", "es", "ar", "fr", "pt", "ru", "de", "ja", "ko", "tr", "uk"];

/// Maps an OS locale like "ru-RU" or "pt_BR" to a supported language code.
pub fn from_locale(locale: &str) -> Option<&'static str> {
    let primary = locale.split(['-', '_', '.']).next()?.to_ascii_lowercase();
    SUPPORTED.iter().copied().find(|code| *code == primary)
}

/// Windows LCIDs written by the NSIS installer (`$LANGUAGE`).
pub fn from_lcid(lcid: u32) -> Option<&'static str> {
    Some(match lcid {
        1033 => "en",
        1049 => "ru",
        1058 => "uk",
        2052 => "zh",
        1034 | 3082 => "es",
        1025 => "ar",
        1036 => "fr",
        1046 | 2070 => "pt",
        1031 => "de",
        1041 => "ja",
        1042 => "ko",
        1055 => "tr",
        1081 => "hi",
        _ => return None,
    })
}

/// Picks the entry for `lang` from a 13-language table ordered like `SUPPORTED`.
fn pick(lang: &str, table: [&'static str; 13]) -> &'static str {
    let index = SUPPORTED.iter().position(|code| *code == lang).unwrap_or(0);
    table[index]
}

/// For longer native messages translated only into English, Russian and Ukrainian.
pub fn pick3(lang: &str, en: &'static str, ru: &'static str, uk: &'static str) -> &'static str {
    match lang {
        "ru" => ru,
        "uk" => uk,
        _ => en,
    }
}

pub fn game_installed(lang: &str) -> &'static str {
    pick(lang, [
        "Game installed", "游戏已安装", "गेम इंस्टॉल हो गया", "Juego instalado", "تم تثبيت اللعبة",
        "Jeu installé", "Jogo instalado", "Игра установлена", "Spiel installiert",
        "ゲームをインストールしました", "게임이 설치되었습니다", "Oyun yüklendi", "Гру встановлено",
    ])
}

pub fn game_updated(lang: &str) -> &'static str {
    pick(lang, [
        "Game updated", "游戏已更新", "गेम अपडेट हो गया", "Juego actualizado", "تم تحديث اللعبة",
        "Jeu mis à jour", "Jogo atualizado", "Игра обновлена", "Spiel aktualisiert",
        "ゲームを更新しました", "게임이 업데이트되었습니다", "Oyun güncellendi", "Гру оновлено",
    ])
}

pub fn install_failed(lang: &str) -> &'static str {
    pick(lang, [
        "Installation failed", "安装失败", "इंस्टॉलेशन विफल", "Error de instalación", "فشل التثبيت",
        "Échec de l'installation", "Falha na instalação", "Ошибка установки", "Installation fehlgeschlagen",
        "インストールに失敗しました", "설치 실패", "Yükleme başarısız", "Помилка встановлення",
    ])
}

pub fn updates_available(lang: &str) -> &'static str {
    pick(lang, [
        "Game updates available", "有可用的游戏更新", "गेम अपडेट उपलब्ध हैं", "Actualizaciones disponibles",
        "تحديثات الألعاب متاحة", "Mises à jour disponibles", "Atualizações disponíveis",
        "Доступны обновления игр", "Spiel-Updates verfügbar", "ゲームのアップデートがあります",
        "게임 업데이트가 있습니다", "Oyun güncellemeleri mevcut", "Доступні оновлення ігор",
    ])
}

pub fn launcher_update(lang: &str) -> &'static str {
    pick(lang, [
        "New launcher version", "启动器有新版本", "लॉन्चर का नया संस्करण", "Nueva versión del launcher",
        "إصدار جديد من المشغّل", "Nouvelle version du launcher", "Nova versão do launcher",
        "Новая версия лаунчера", "Neue Launcher-Version", "ランチャーの新しいバージョン",
        "새 런처 버전", "Yeni başlatıcı sürümü", "Нова версія лаунчера",
    ])
}

pub fn tray_open(lang: &str) -> &'static str {
    pick(lang, [
        "Open FreeGame Launcher", "打开 FreeGame Launcher", "FreeGame Launcher खोलें", "Abrir FreeGame Launcher",
        "فتح FreeGame Launcher", "Ouvrir FreeGame Launcher", "Abrir FreeGame Launcher",
        "Открыть FreeGame Launcher", "FreeGame Launcher öffnen", "FreeGame Launcher を開く",
        "FreeGame Launcher 열기", "FreeGame Launcher'ı aç", "Відкрити FreeGame Launcher",
    ])
}

pub fn tray_quit(lang: &str) -> &'static str {
    pick(lang, [
        "Quit", "退出", "बाहर निकलें", "Salir", "خروج", "Quitter", "Sair", "Выход", "Beenden", "終了", "종료",
        "Çıkış", "Вихід",
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_locales_and_lcids() {
        assert_eq!(from_locale("ru-RU"), Some("ru"));
        assert_eq!(from_locale("pt_BR"), Some("pt"));
        assert_eq!(from_locale("xx"), None);
        assert_eq!(from_lcid(1049), Some("ru"));
        assert_eq!(game_installed("ru"), "Игра установлена");
        assert_eq!(game_installed("unknown"), "Game installed");
    }
}
