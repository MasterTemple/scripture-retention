//! The verses and settings, kept in the web app's backup format: a file saved from the app's
//! Settings → Data → Save backup opens here, and this file restores there. Settings the terminal
//! doesn't use (the theme, reminders…) are kept as they were.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use scripture_srs::{AlgorithmId, Day, Durations, Scheduler, SrsOptions, Verse};
use serde_json::{Map, Value, json};

/// Everything in a backup
#[derive(Clone, Debug, PartialEq)]
pub struct Store {
    pub verses: Vec<Verse>,
    /// Verses waiting to be started, kept as the web app wrote them
    pub queue: Vec<Value>,
    /// The web app's settings, every field kept
    pub settings: Map<String, Value>,
    /// Other top-level fields (the queue's last check…), kept
    rest: Map<String, Value>,
}

/// The translations the web app has built in: its id, abbreviation, and fetch.bible id
pub const TRANSLATIONS: [(&str, &str, &str); 6] = [
    ("fetch:eng_bsb", "BSB", "eng_bsb"),
    ("fetch:eng_kjv", "KJV", "eng_kjv"),
    ("fetch:eng_web", "WEB", "eng_web"),
    ("fetch:eng_asv", "ASV", "eng_asv"),
    ("fetch:eng_lsv", "LSV", "eng_lsv"),
    ("fetch:eng_ylt", "YLT", "eng_ylt"),
];

impl Default for Store {
    fn default() -> Store {
        Store {
            verses: Vec::new(),
            queue: Vec::new(),
            settings: Map::new(),
            rest: Map::new(),
        }
    }
}

impl Store {
    /// A backup's contents, or why it can't be read
    pub fn from_json(text: &str) -> Result<Store, String> {
        let value: Value = serde_json::from_str(text).map_err(|e| format!("not JSON: {e}"))?;
        let Value::Object(mut object) = value else {
            return Err("not a backup (not a JSON object)".into());
        };
        if object.get("app").and_then(Value::as_str) != Some("scripture-retention") {
            return Err("not a Scripture Retention backup".into());
        }
        let verses = serde_json::from_value(object.remove("verses").unwrap_or(json!([])))
            .map_err(|e| format!("its verses can't be read: {e}"))?;
        let queue = match object.remove("queue") {
            Some(Value::Array(queue)) => queue,
            _ => Vec::new(),
        };
        let settings = match object.remove("settings") {
            Some(Value::Object(settings)) => settings,
            _ => Map::new(),
        };
        // Written afresh on each save
        for key in ["app", "version", "saved"] {
            object.remove(key);
        }
        Ok(Store {
            verses,
            queue,
            settings,
            rest: object,
        })
    }

    /// As a backup the web app restores
    pub fn to_json(&self, saved: &str) -> String {
        let mut object = self.rest.clone();
        object.insert("app".into(), json!("scripture-retention"));
        object.insert("version".into(), json!(1));
        object.insert("saved".into(), json!(saved));
        object.insert(
            "verses".into(),
            serde_json::to_value(&self.verses).unwrap_or(json!([])),
        );
        object.insert("queue".into(), Value::Array(self.queue.clone()));
        object.insert("settings".into(), Value::Object(self.settings.clone()));
        serde_json::to_string_pretty(&Value::Object(object)).unwrap_or_default() + "\n"
    }

    /// The file's backup, or an empty one if there's no file yet
    pub fn load(path: &Path) -> Result<Store, String> {
        match fs::read_to_string(path) {
            Ok(text) => Store::from_json(&text).map_err(|e| format!("{}: {e}", path.display())),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Store::default()),
            Err(e) => Err(format!("{}: {e}", path.display())),
        }
    }

    /// Writes the backup whole (to a file beside it, then over it, so a crash never leaves half)
    pub fn save(&self, path: &Path, saved: &str) -> io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, self.to_json(saved))?;
        fs::rename(temporary, path)
    }

    fn setting<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        self.settings
            .get(key)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    pub fn algorithm(&self) -> AlgorithmId {
        self.setting("algorithm").unwrap_or_default()
    }

    pub fn set_algorithm(&mut self, algorithm: AlgorithmId) {
        self.settings
            .insert("algorithm".into(), json!(algorithm.key()));
    }

    /// Every option, defaults under what's saved
    pub fn options(&self) -> SrsOptions {
        self.setting("srs").unwrap_or_default()
    }

    pub fn set_options(&mut self, options: &SrsOptions) {
        self.settings.insert(
            "srs".into(),
            serde_json::to_value(options).unwrap_or(json!({})),
        );
    }

    pub fn durations(&self) -> Durations {
        self.setting("durations").unwrap_or_default()
    }

    pub fn scheduler(&self) -> Scheduler {
        Scheduler::new(self.algorithm(), self.durations(), self.options())
    }

    /// The hour (0–11) a new day of reviews begins
    pub fn day_starts_at(&self) -> u32 {
        self.setting("dayStartsAt").unwrap_or(0)
    }

    /// Which built-in translation the verses show in (the first, BSB, for one uploaded or browsed in the app)
    pub fn translation(&self) -> usize {
        let id: Option<String> = self.setting("translationId");
        id.and_then(|id| TRANSLATIONS.iter().position(|t| t.0 == id))
            .unwrap_or(0)
    }

    pub fn set_translation(&mut self, index: usize) {
        self.settings.insert(
            "translationId".into(),
            json!(TRANSLATIONS[index % TRANSLATIONS.len()].0),
        );
    }

    /// The day reviews are for at `now`: today, or yesterday before the hour a day begins
    pub fn review_day(&self, now: chrono::DateTime<chrono::Local>) -> Day {
        use chrono::Datelike;
        let shifted = now - chrono::Duration::hours(i64::from(self.day_starts_at()));
        Day::new(shifted.year(), shifted.month() as u8, shifted.day() as u8)
            .expect("a calendar day")
    }
}

/// Where the backup lives when no file is given: `$XDG_DATA_HOME/scripture-retention/backup.json`
pub fn default_path() -> PathBuf {
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")));
    data.unwrap_or_else(|| PathBuf::from("."))
        .join("scripture-retention")
        .join("backup.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    const BACKUP: &str = r#"{"app": "scripture-retention", "version": 1, "saved": "2026-10-21T00:00:00Z", "queueChecked": "2026-10-20",
        "verses": [{"id": "a", "tag": "t", "ref": "John 3:16", "start": "2026-01-01", "last": "2026-01-02", "log": [{"day": "2026-01-01", "grade": 3}, {"day": "2026-01-02", "set": 4}]}],
        "queue": [{"id": "q", "tag": "", "ref": "Romans 12:1"}],
        "settings": {"algorithm": "anki", "theme": "dark", "srs": {"anki": {"startingEase": 2.3}}, "translationId": "fetch:eng_kjv", "dayStartsAt": 3}}"#;

    #[test]
    fn a_web_app_backup_reads_and_writes_back_the_same() {
        let store = Store::from_json(BACKUP).unwrap();
        assert_eq!(store.verses[0].reference, "John 3:16");
        assert_eq!(store.algorithm(), AlgorithmId::Anki);
        assert_eq!(store.options().anki.starting_ease, 2.3);
        assert_eq!(store.options().anki.easy_bonus, 1.3);
        assert_eq!(store.translation(), 1);
        assert_eq!(store.day_starts_at(), 3);
        let again = Store::from_json(&store.to_json("2026-10-22T00:00:00Z")).unwrap();
        assert_eq!(again, store);
        let written: Value = serde_json::from_str(&store.to_json("now")).unwrap();
        assert_eq!(written["settings"]["theme"], "dark");
        assert_eq!(written["queueChecked"], "2026-10-20");
        assert_eq!(
            written["verses"][0]["log"][1],
            json!({"day": "2026-01-02", "set": 4})
        );
    }

    #[test]
    fn what_isnt_a_backup_says_so() {
        assert!(Store::from_json("{}").is_err());
        assert!(Store::from_json("nope").is_err());
    }

    #[test]
    fn settings_change_and_save() {
        let mut store = Store::default();
        assert_eq!(store.algorithm(), AlgorithmId::Fixed);
        store.set_algorithm(AlgorithmId::Fsrs);
        store.set_translation(2);
        let mut options = store.options();
        options.fsrs.desired_retention = 0.85;
        store.set_options(&options);
        let again = Store::from_json(&store.to_json("now")).unwrap();
        assert_eq!(
            (
                again.algorithm(),
                again.translation(),
                again.options().fsrs.desired_retention
            ),
            (AlgorithmId::Fsrs, 2, 0.85)
        );
    }
}
