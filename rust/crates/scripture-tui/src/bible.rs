//! A verse's text, as the web app shows it: the reference read by topos, its book downloaded from
//! fetch.bible (once, then kept in the cache) and read by logoxide. Books download in the
//! background, so the screen never waits on the network.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::thread;

use logoxide_markup::{Markup, parse, verses::verses};
use logoxide_text::passage::verse_texts_in;
use topos_bible::matcher::BibleMatcher;
use topos_bible::segments::formatter::FormatOptions;

/// A book's verses: (chapter, verse) to text
pub type BookText = HashMap<(u8, u8), String>;

/// A translation's book, by fetch.bible id and USFM code
type BookKey = (String, String);

/// One passage of a reference, with its verses' numbers and text
#[derive(Clone, Debug, PartialEq)]
pub struct ShownPassage {
    /// As topos writes it: `Psalm 119:147-148`
    pub reference: String,
    /// `(label, text)`: the label is the verse number, with the chapter when the passage spans chapters
    pub verses: Vec<(String, String)>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TextState {
    Loading,
    Ready(Vec<ShownPassage>),
    /// The reference couldn't be read
    Unknown,
    /// The translation doesn't have it
    Missing,
    Error(String),
}

pub struct Bible {
    cache: PathBuf,
    matcher: BibleMatcher,
    books: HashMap<BookKey, Result<BookText, String>>,
    pending: HashSet<BookKey>,
    sender: Sender<(BookKey, Result<BookText, String>)>,
    receiver: Receiver<(BookKey, Result<BookText, String>)>,
}

/// Cleans what logoxide's plain text keeps that a reader doesn't type: paragraph marks, extra
/// spaces, and invisible characters (as the web app does)
fn clean(text: &str) -> String {
    let kept: String = text
        .chars()
        .filter(|c| {
            !matches!(
                c,
                '\u{200B}' | '\u{FEFF}' | '\u{00AD}' | '\u{2060}' | '¶' | '§'
            )
        })
        .collect();
    kept.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Every verse of a USX book (a bridge's text under each of its verses, parts joined)
pub fn read_usx(usx: &str) -> BookText {
    let nodes = parse(Markup::Usx, usx);
    let spans = verses(&nodes);
    let mut out: BookText = HashMap::new();
    for v in verse_texts_in(&nodes, &spans) {
        let text = clean(&v.text);
        let entry = out.entry((v.chapter, v.verse)).or_default();
        if !entry.is_empty() {
            entry.push(' ');
        }
        entry.push_str(&text);
        if v.last_chapter == v.chapter && v.last > v.verse {
            for verse in v.verse + 1..=v.last {
                out.entry((v.chapter, verse)).or_default();
            }
        }
    }
    out
}

fn book_url(fetch_id: &str, usfm: &str) -> String {
    format!(
        "https://v1.fetch.bible/bibles/{fetch_id}/usx/{}.usx",
        usfm.to_lowercase()
    )
}

/// The book's USX: from the cache, or downloaded into it
fn fetch_book(cache: &Path, (fetch_id, usfm): &BookKey) -> Result<String, String> {
    let file = cache
        .join(fetch_id)
        .join(format!("{}.usx", usfm.to_lowercase()));
    if let Ok(text) = fs::read_to_string(&file) {
        return Ok(text);
    }
    let text = ureq::get(&book_url(fetch_id, usfm))
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())?;
    if let Some(dir) = file.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let _ = fs::write(&file, &text);
    Ok(text)
}

impl Bible {
    /// Books kept in `cache` (`$XDG_CACHE_HOME/scripture-retention` by default)
    pub fn new(cache: PathBuf) -> Bible {
        let (sender, receiver) = channel();
        Bible {
            cache,
            matcher: BibleMatcher::default(),
            books: HashMap::new(),
            pending: HashSet::new(),
            sender,
            receiver,
        }
    }

    /// Takes in the books that have arrived; whether any did (so the screen redraws)
    pub fn poll(&mut self) -> bool {
        let mut any = false;
        while let Ok((key, book)) = self.receiver.try_recv() {
            self.pending.remove(&key);
            self.books.insert(key, book);
            any = true;
        }
        any
    }

    /// Gives a book's verses directly, as if it had downloaded
    #[cfg(test)]
    pub fn insert(&mut self, fetch_id: &str, usfm: &str, book: BookText) {
        self.books
            .insert((fetch_id.into(), usfm.to_uppercase()), Ok(book));
    }

    fn request(&mut self, key: &BookKey) {
        if self.books.contains_key(key) || !self.pending.insert(key.clone()) {
            return;
        }
        let (cache, sender, key) = (self.cache.clone(), self.sender.clone(), key.clone());
        thread::spawn(move || {
            let book = fetch_book(&cache, &key).map(|usx| read_usx(&usx));
            let _ = sender.send((key, book));
        });
    }

    /// The text of `reference` in the translation `fetch_id`, starting downloads it needs
    pub fn text(&mut self, reference: &str, fetch_id: &str) -> TextState {
        let found = self.matcher.search(reference);
        if found.is_empty() {
            return TextState::Unknown;
        }
        let data = self.matcher.data();
        let mut wanted = Vec::new();
        for m in &found {
            let usfm = data
                .books()
                .get_usfm(m.psg.book)
                .cloned()
                .unwrap_or_default();
            let versification = data.chapter_verses().get_chapter_verses(&m.psg.book);
            let label = FormatOptions::default()
                .passage(&m.psg, data)
                .unwrap_or_else(|| reference.to_string());
            wanted.push((
                (fetch_id.to_string(), usfm.to_uppercase()),
                label,
                m.psg.verses(versification),
            ));
        }
        let mut shown = Vec::new();
        let mut loading = false;
        for (key, label, chapter_verses) in wanted {
            match self.books.get(&key) {
                None => {
                    self.request(&key);
                    loading = true;
                }
                Some(Err(e)) => return TextState::Error(e.clone()),
                Some(Ok(book)) => {
                    let several = chapter_verses.first().map(|v| v.chapter)
                        != chapter_verses.last().map(|v| v.chapter);
                    let verses: Vec<(String, String)> = chapter_verses
                        .iter()
                        .filter_map(|cv| {
                            let text = book.get(&(cv.chapter, cv.verse))?;
                            let label = if several {
                                format!("{}:{}", cv.chapter, cv.verse)
                            } else {
                                cv.verse.to_string()
                            };
                            Some((label, text.clone()))
                        })
                        .collect();
                    if !verses.is_empty() {
                        shown.push(ShownPassage {
                            reference: label,
                            verses,
                        });
                    }
                }
            }
        }
        if loading {
            TextState::Loading
        } else if shown.is_empty() {
            TextState::Missing
        } else {
            TextState::Ready(shown)
        }
    }

    /// Starts downloading the books `references` need, so their cards open at once
    pub fn prefetch<'a>(&mut self, references: impl IntoIterator<Item = &'a str>, fetch_id: &str) {
        for reference in references {
            let _ = self.text(reference, fetch_id);
        }
    }
}

/// Where downloaded books are kept: `$XDG_CACHE_HOME/scripture-retention`
pub fn default_cache() -> PathBuf {
    let cache = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")));
    cache
        .unwrap_or_else(|| PathBuf::from("."))
        .join("scripture-retention")
}

#[cfg(test)]
mod tests {
    use super::*;

    const USX: &str = r#"<usx version="3.0"><book code="JHN" style="id"/><chapter number="3" style="c" sid="JHN 3"/>
<para style="p"><verse number="16" style="v" sid="JHN 3:16"/>For God so loved the world¶ that he gave his one and only Son.<verse eid="JHN 3:16"/>
<verse number="17" style="v" sid="JHN 3:17"/>For God did not send his Son into the world to condemn the world.<verse eid="JHN 3:17"/></para>
<chapter eid="JHN 3"/></usx>"#;

    #[test]
    fn a_usx_book_reads_into_verses() {
        let book = read_usx(USX);
        assert_eq!(
            book[&(3, 16)],
            "For God so loved the world that he gave his one and only Son."
        );
        assert!(book[&(3, 17)].starts_with("For God did not send"));
    }

    #[test]
    fn a_reference_shows_its_verses_once_its_book_is_in() {
        let mut bible = Bible::new(std::env::temp_dir().join("scripture-tui-test-cache-unused"));
        bible.insert("eng_bsb", "JHN", read_usx(USX));
        let TextState::Ready(passages) = bible.text("John 3:16-17", "eng_bsb") else {
            panic!("not ready")
        };
        assert_eq!(passages[0].reference, "John 3:16-17");
        assert_eq!(
            passages[0]
                .verses
                .iter()
                .map(|(l, _)| l.as_str())
                .collect::<Vec<_>>(),
            ["16", "17"]
        );
        assert_eq!(bible.text("Not a reference", "eng_bsb"), TextState::Unknown);
        assert_eq!(bible.text("John 4:1", "eng_bsb"), TextState::Missing);
    }
}
