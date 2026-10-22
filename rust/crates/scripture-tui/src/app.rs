//! What's on screen and what each key does: today's review, the verses, and settings.

use std::path::PathBuf;

use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use scripture_srs::{ALGORITHM_IDS, Day, Grade, LogEntry, Order, Scheduler, Verse, with_entry};

use crate::bible::{Bible, TextState};
use crate::store::{Store, TRANSLATIONS};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum View {
    Review,
    Verses,
    Settings,
}

pub const VIEWS: [View; 3] = [View::Review, View::Verses, View::Settings];

/// Adding a verse: its reference and topic, and which is being typed
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AddForm {
    pub reference: String,
    pub tag: String,
    /// 0 the reference, 1 the topic
    pub field: usize,
}

/// The rows of Settings after the algorithms
pub const SETTING_TRANSLATION: usize = ALGORITHM_IDS.len();
pub const SETTING_RETENTION: usize = ALGORITHM_IDS.len() + 1;
pub const SETTING_ROWS: usize = ALGORITHM_IDS.len() + 2;

pub struct App {
    pub store: Store,
    /// Where it's saved (none: not saved, for tests)
    pub path: Option<PathBuf>,
    pub day: Day,
    pub bible: Bible,
    pub view: View,
    // Today's review: the verses due when it began (by id), the one in front, whether its text shows
    pub queue: Vec<String>,
    pub index: usize,
    pub revealed: bool,
    /// Verses reviewed in this sitting
    pub reviewed: usize,
    /// Beside each place in the queue, the log entry its grade (or reschedule) wrote, so going
    /// back and grading again replaces that grade, and stepping forward past it doesn't grade it
    wrote: Vec<Option<usize>>,
    // Verses: the one selected, and whether a delete waits for a second press
    pub selected: usize,
    pub confirm_delete: bool,
    pub adding: Option<AddForm>,
    pub setting: usize,
    pub message: Option<String>,
    pub quit: bool,
}

impl App {
    pub fn new(store: Store, path: Option<PathBuf>, day: Day, bible: Bible) -> App {
        let setting = ALGORITHM_IDS
            .iter()
            .position(|a| *a == store.algorithm())
            .unwrap_or(0);
        let mut app = App {
            store,
            path,
            day,
            bible,
            view: View::Review,
            queue: Vec::new(),
            index: 0,
            revealed: false,
            reviewed: 0,
            wrote: Vec::new(),
            selected: 0,
            confirm_delete: false,
            adding: None,
            setting,
            message: None,
            quit: false,
        };
        app.start_review();
        app
    }

    pub fn scheduler(&self) -> Scheduler {
        self.store.scheduler()
    }

    pub fn fetch_id(&self) -> &'static str {
        TRANSLATIONS[self.store.translation()].2
    }

    /// The verses due today, in order
    pub fn due(&self) -> Vec<&Verse> {
        self.scheduler()
            .due_verses(&self.store.verses, self.day, Order::Phase)
    }

    /// Starts the review over with what's due, and starts downloading their books
    pub fn start_review(&mut self) {
        self.queue = self.due().into_iter().map(|v| v.id.clone()).collect();
        self.index = 0;
        self.revealed = false;
        self.reviewed = 0;
        self.wrote = vec![None; self.queue.len()];
        let references: Vec<String> = self
            .queue
            .iter()
            .filter_map(|id| self.verse(id))
            .map(|v| v.reference.clone())
            .collect();
        let fetch_id = self.fetch_id();
        self.bible
            .prefetch(references.iter().map(String::as_str), fetch_id);
    }

    /// A new day (the terminal left open overnight) starts that day's review
    pub fn set_day(&mut self, day: Day) {
        if day != self.day {
            self.day = day;
            self.start_review();
        }
    }

    pub fn verse(&self, id: &str) -> Option<&Verse> {
        self.store.verses.iter().find(|v| v.id == id)
    }

    /// The verse in front (skipping any deleted since the review began)
    pub fn current(&self) -> Option<&Verse> {
        self.queue.get(self.index).and_then(|id| self.verse(id))
    }

    /// The verse in front's text
    pub fn current_text(&mut self) -> Option<TextState> {
        let reference = self.current()?.reference.clone();
        let fetch_id = self.fetch_id();
        Some(self.bible.text(&reference, fetch_id))
    }

    fn save(&mut self) {
        let Some(path) = &self.path else { return };
        if let Err(e) = self.store.save(path, &chrono::Utc::now().to_rfc3339()) {
            self.message = Some(format!("Couldn't save {}: {e}", path.display()));
        }
    }

    /// Grades the verse in front (Good under the fixed schedule) and goes on
    pub fn grade(&mut self, grade: Grade) {
        let Some(id) = self.queue.get(self.index).cloned() else {
            return;
        };
        let scheduler = self.scheduler();
        let at = self.graded_at();
        let day = self.day;
        let mut wrote = None;
        if let Some(verse) = self.store.verses.iter_mut().find(|v| v.id == id) {
            if verse.last != Some(day) {
                self.reviewed += 1;
            }
            match at {
                Some(at) if matches!(verse.log.get(at), Some(LogEntry::Review { day: d, .. }) if *d == day) =>
                {
                    verse.log[at] = LogEntry::Review { day, grade };
                    wrote = Some(at);
                }
                _ => {
                    verse.log = with_entry(
                        verse,
                        LogEntry::Review { day, grade },
                        scheduler.durations(),
                    );
                    wrote = verse.log.len().checked_sub(1);
                }
            }
            verse.last = Some(day);
        }
        self.save();
        self.advance(&id, wrote);
    }

    /// Places the verse in front to come back in `days` (counted as reviewed) and goes on
    pub fn reschedule_current(&mut self, days: u32) {
        let Some(id) = self.queue.get(self.index).cloned() else {
            return;
        };
        let scheduler = self.scheduler();
        if let Some(i) = self.store.verses.iter().position(|v| v.id == id) {
            if self.store.verses[i].last != Some(self.day) {
                self.reviewed += 1;
            }
            self.store.verses[i] = scheduler.placed(&self.store.verses[i], days, self.day, true);
        }
        let wrote = self.verse(&id).and_then(|v| v.log.len().checked_sub(1));
        self.save();
        self.advance(&id, wrote);
    }

    /// The log entry the card in front was graded with in this review, if it was (going back to it)
    pub fn graded_at(&self) -> Option<usize> {
        self.wrote.get(self.index).copied().flatten()
    }

    /// Goes on without grading past a card graded already (stepping forward after going back),
    /// or else grades it Good
    pub fn forward(&mut self) {
        if self.graded_at().is_some() {
            self.index += 1;
            self.revealed = false;
        } else {
            self.grade(Grade::Good);
        }
    }

    /// Goes to the next card, noting the log entry the card in front wrote. A verse still due
    /// today (a learning step, or a drill) goes to the back of the queue; graded again after going
    /// back, it may no longer need that second look (its later looks not yet graded leave)
    fn advance(&mut self, id: &str, wrote: Option<usize>) {
        if let Some(mark) = self.wrote.get_mut(self.index) {
            *mark = wrote;
        }
        let due = self
            .verse(id)
            .is_some_and(|v| self.scheduler().status(v, self.day).due);
        let ahead_has = self.queue[self.index + 1..].iter().any(|q| q == id);
        if due && !ahead_has {
            self.queue.push(id.to_string());
            self.wrote.push(None);
        } else if !due && ahead_has {
            let index = self.index;
            let (queue, wrote) = self
                .queue
                .drain(..)
                .zip(self.wrote.drain(..))
                .enumerate()
                .filter(|(i, (q, w))| *i <= index || q != id || w.is_some())
                .map(|(_, kept)| kept)
                .unzip();
            (self.queue, self.wrote) = (queue, wrote);
        }
        self.index += 1;
        self.revealed = false;
    }

    pub fn back(&mut self) {
        if self.index > 0 {
            self.index -= 1;
            self.revealed = true;
        }
    }

    /// The verses as the Verses view lists them: by phase, then soonest due or newest
    pub fn listed(&self) -> Vec<usize> {
        let scheduler = self.scheduler();
        let mut rows: Vec<(usize, scripture_srs::Status)> = self
            .store
            .verses
            .iter()
            .enumerate()
            .map(|(i, v)| (i, scheduler.status(v, self.day)))
            .collect();
        rows.sort_by(|(a, sa), (b, sb)| {
            let phase = |s: &scripture_srs::Status| {
                scripture_srs::PHASES.iter().position(|p| *p == s.phase)
            };
            let when = |s: &scripture_srs::Status| s.scheduled.or(s.next);
            phase(sa)
                .cmp(&phase(sb))
                .then_with(|| when(sa).cmp(&when(sb)))
                .then_with(|| {
                    self.store.verses[*b]
                        .start
                        .cmp(&self.store.verses[*a].start)
                })
        });
        rows.into_iter().map(|(i, _)| i).collect()
    }

    fn selected_verse(&self) -> Option<usize> {
        self.listed().get(self.selected).copied()
    }

    fn add_verse(&mut self, form: AddForm) {
        let reference = form
            .reference
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if reference.is_empty() {
            self.message = Some("A verse needs a reference".into());
            return;
        }
        let id = format!(
            "{:x}{:04x}",
            chrono::Utc::now().timestamp_millis(),
            self.store.verses.len()
        );
        let tag = form
            .tag
            .trim()
            .trim_start_matches('#')
            .replace(char::is_whitespace, "-");
        self.store
            .verses
            .push(Verse::new(id, tag, reference.clone(), self.day));
        self.message = Some(format!("Added {reference}"));
        self.save();
        // Added today, it joins today's review
        self.start_review();
    }

    pub fn on_key(&mut self, key: KeyEvent) {
        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
            self.quit = true;
            return;
        }
        if let Some(form) = &mut self.adding {
            match key.code {
                KeyCode::Esc => self.adding = None,
                KeyCode::Tab | KeyCode::BackTab | KeyCode::Up | KeyCode::Down => {
                    form.field = 1 - form.field
                }
                KeyCode::Enter if form.field == 0 => form.field = 1,
                KeyCode::Enter => {
                    let form = self.adding.take().unwrap_or_default();
                    self.add_verse(form);
                }
                KeyCode::Backspace => {
                    let field = if form.field == 0 {
                        &mut form.reference
                    } else {
                        &mut form.tag
                    };
                    field.pop();
                }
                KeyCode::Char(c) => {
                    let field = if form.field == 0 {
                        &mut form.reference
                    } else {
                        &mut form.tag
                    };
                    field.push(c);
                }
                _ => {}
            }
            return;
        }
        self.message = None;
        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => {
                self.quit = true;
                return;
            }
            KeyCode::Tab => {
                self.switch(1);
                return;
            }
            KeyCode::BackTab => {
                self.switch(VIEWS.len() - 1);
                return;
            }
            _ => {}
        }
        match self.view {
            View::Review => self.review_key(key.code),
            View::Verses => self.verses_key(key.code),
            View::Settings => self.settings_key(key.code),
        }
    }

    fn switch(&mut self, by: usize) {
        let at = VIEWS.iter().position(|v| *v == self.view).unwrap_or(0);
        self.view = VIEWS[(at + by) % VIEWS.len()];
        self.confirm_delete = false;
    }

    fn review_key(&mut self, code: KeyCode) {
        if self.current().is_none() {
            if matches!(code, KeyCode::Char(' ') | KeyCode::Enter) && !self.due().is_empty() {
                self.start_review();
            }
            return;
        }
        let grades = self.scheduler().grades();
        match code {
            KeyCode::Char(' ') | KeyCode::Enter | KeyCode::Right => {
                if self.revealed {
                    self.forward();
                } else {
                    self.revealed = true;
                }
            }
            KeyCode::Char(c @ '1'..='4')
                if self.revealed && self.scheduler().algorithm().is_adaptive() =>
            {
                if let Some(grade) = grades.get(c as usize - '1' as usize) {
                    self.grade(*grade);
                }
            }
            // Again tomorrow, in a week, or in a month (counted as reviewed)
            KeyCode::Char('t') if self.revealed => self.reschedule_current(1),
            KeyCode::Char('w') if self.revealed => self.reschedule_current(7),
            KeyCode::Char('m') if self.revealed => self.reschedule_current(30),
            KeyCode::Left | KeyCode::Char('h') => self.back(),
            _ => {}
        }
    }

    fn verses_key(&mut self, code: KeyCode) {
        let count = self.store.verses.len();
        if code != KeyCode::Char('x') {
            self.confirm_delete = false;
        }
        match code {
            KeyCode::Down | KeyCode::Char('j') if count > 0 => {
                self.selected = (self.selected + 1).min(count - 1)
            }
            KeyCode::Up | KeyCode::Char('k') => self.selected = self.selected.saturating_sub(1),
            KeyCode::Home | KeyCode::Char('g') => self.selected = 0,
            KeyCode::End | KeyCode::Char('G') => self.selected = count.saturating_sub(1),
            KeyCode::Char('a') => self.adding = Some(AddForm::default()),
            KeyCode::Char('x') => {
                let Some(i) = self.selected_verse() else {
                    return;
                };
                if !self.confirm_delete {
                    self.confirm_delete = true;
                    self.message = Some(format!(
                        "Press x again to delete {}",
                        self.store.verses[i].reference
                    ));
                    return;
                }
                let removed = self.store.verses.remove(i);
                self.confirm_delete = false;
                self.selected = self.selected.min(self.store.verses.len().saturating_sub(1));
                self.message = Some(format!("Deleted {}", removed.reference));
                self.save();
                self.start_review();
            }
            // Start over as new
            KeyCode::Char('f') if self.scheduler().algorithm().is_adaptive() => {
                let Some(i) = self.selected_verse() else {
                    return;
                };
                self.store.verses[i] =
                    self.scheduler()
                        .placed(&self.store.verses[i], 0, self.day, false);
                self.message = Some(format!(
                    "{} starts over as new",
                    self.store.verses[i].reference
                ));
                self.save();
                self.start_review();
            }
            _ => {}
        }
    }

    fn settings_key(&mut self, code: KeyCode) {
        match code {
            KeyCode::Down | KeyCode::Char('j') => {
                self.setting = (self.setting + 1).min(SETTING_ROWS - 1)
            }
            KeyCode::Up | KeyCode::Char('k') => self.setting = self.setting.saturating_sub(1),
            KeyCode::Enter | KeyCode::Char(' ') if self.setting < ALGORITHM_IDS.len() => {
                let algorithm = ALGORITHM_IDS[self.setting];
                self.store.set_algorithm(algorithm);
                self.message = Some(format!("Scheduling by {}", algorithm.name()));
                self.save();
                self.start_review();
            }
            KeyCode::Left | KeyCode::Right | KeyCode::Char('h') | KeyCode::Char('l') => {
                let up = matches!(code, KeyCode::Right | KeyCode::Char('l'));
                if self.setting == SETTING_TRANSLATION {
                    let n = TRANSLATIONS.len();
                    self.store.set_translation(
                        (self.store.translation() + if up { 1 } else { n - 1 }) % n,
                    );
                    self.save();
                    self.start_review();
                } else if self.setting == SETTING_RETENTION {
                    let mut options = self.store.options();
                    let r = options.fsrs.desired_retention + if up { 0.01 } else { -0.01 };
                    options.fsrs.desired_retention = (r.clamp(0.7, 0.99) * 100.0).round() / 100.0;
                    self.store.set_options(&options);
                    self.save();
                    self.start_review();
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bible::{BookText, read_usx};
    use ratatui::crossterm::event::KeyEventKind;
    use scripture_srs::AlgorithmId;

    fn day(text: &str) -> Day {
        text.parse().unwrap()
    }

    fn key(code: KeyCode) -> KeyEvent {
        KeyEvent {
            code,
            modifiers: KeyModifiers::NONE,
            kind: KeyEventKind::Press,
            state: ratatui::crossterm::event::KeyEventState::NONE,
        }
    }

    pub fn app(algorithm: AlgorithmId) -> App {
        let mut store = Store::default();
        store.set_algorithm(algorithm);
        let mut options = store.options();
        options.anki.fuzz = false;
        store.set_options(&options);
        store.verses = vec![
            Verse::new("a", "love", "John 3:16", day("2026-10-21")),
            Verse::new("b", "word", "John 3:17", day("2026-05-01")),
        ];
        let mut bible = Bible::new(std::env::temp_dir().join("scripture-tui-test-unused"));
        let book: BookText = read_usx(
            r#"<usx><book code="JHN"/><chapter number="3"/><verse number="16"/>For God so loved the world.<verse number="17"/>For God did not send his Son.</usx>"#,
        );
        bible.insert("eng_bsb", "JHN", book);
        App::new(store, None, day("2026-10-21"), bible)
    }

    #[test]
    fn a_review_under_anki_shows_a_learning_verse_again() {
        let mut app = app(AlgorithmId::Anki);
        assert_eq!(app.queue, ["a", "b"]);
        app.on_key(key(KeyCode::Char(' ')));
        assert!(app.revealed);
        assert!(matches!(app.current_text(), Some(TextState::Ready(_))));
        // Good on a new verse: its next step is 10 minutes, so it comes back
        app.on_key(key(KeyCode::Char('3')));
        assert_eq!(app.queue, ["a", "b", "a"]);
        app.on_key(key(KeyCode::Char(' ')));
        app.on_key(key(KeyCode::Char('3')));
        app.on_key(key(KeyCode::Char(' ')));
        app.on_key(key(KeyCode::Char('3')));
        assert!(app.current().is_none());
        assert_eq!(app.reviewed, 2);
        assert_eq!(app.store.verses[0].log.len(), 2);
    }

    #[test]
    fn going_back_and_grading_again_replaces_the_grade() {
        let mut app = app(AlgorithmId::Anki);
        app.on_key(key(KeyCode::Char(' ')));
        app.on_key(key(KeyCode::Char('3')));
        app.on_key(key(KeyCode::Left));
        app.on_key(key(KeyCode::Char('4')));
        assert_eq!(
            app.store.verses[0].log,
            [LogEntry::Review {
                day: day("2026-10-21"),
                grade: Grade::Easy
            }]
        );
        // Graduated, it no longer needs its second look
        assert_eq!(app.queue, ["a", "b"]);
    }

    #[test]
    fn going_back_and_forward_doesnt_grade_again() {
        let mut app = app(AlgorithmId::Anki);
        app.on_key(key(KeyCode::Char(' ')));
        app.on_key(key(KeyCode::Char('1')));
        app.on_key(key(KeyCode::Left));
        app.on_key(key(KeyCode::Char(' ')));
        assert_eq!(
            app.store.verses[0].log,
            [LogEntry::Review {
                day: day("2026-10-21"),
                grade: Grade::Again
            }]
        );
        assert_eq!(app.queue, ["a", "b", "a"]);
        assert_eq!(app.index, 1);
    }

    #[test]
    fn the_fixed_schedule_only_goes_on() {
        let mut app = app(AlgorithmId::Fixed);
        app.on_key(key(KeyCode::Char(' ')));
        app.on_key(key(KeyCode::Char('1')));
        assert_eq!(app.index, 0, "no grades under the fixed schedule");
        app.on_key(key(KeyCode::Char(' ')));
        assert_eq!(app.index, 1);
        assert_eq!(app.store.verses[0].last, Some(day("2026-10-21")));
    }

    #[test]
    fn settings_switch_the_algorithm_and_the_review_follows() {
        let mut app = app(AlgorithmId::Fixed);
        app.on_key(key(KeyCode::Tab));
        app.on_key(key(KeyCode::Tab));
        assert_eq!(app.view, View::Settings);
        app.on_key(key(KeyCode::Down));
        app.on_key(key(KeyCode::Enter));
        assert_eq!(app.store.algorithm(), AlgorithmId::Fsrs);
        app.setting = SETTING_TRANSLATION;
        app.on_key(key(KeyCode::Right));
        assert_eq!(app.fetch_id(), "eng_kjv");
    }

    #[test]
    fn adding_and_deleting_verses() {
        let mut app = app(AlgorithmId::Fsrs);
        app.on_key(key(KeyCode::Tab));
        app.on_key(key(KeyCode::Char('a')));
        for c in "Romans 12:2".chars() {
            app.on_key(key(KeyCode::Char(c)));
        }
        app.on_key(key(KeyCode::Enter));
        for c in "renew".chars() {
            app.on_key(key(KeyCode::Char(c)));
        }
        app.on_key(key(KeyCode::Enter));
        assert_eq!(app.store.verses.len(), 3);
        assert_eq!(
            (
                app.store.verses[2].tag.as_str(),
                app.store.verses[2].reference.as_str()
            ),
            ("renew", "Romans 12:2")
        );
        assert!(app.queue.contains(&app.store.verses[2].id));
        app.on_key(key(KeyCode::Char('x')));
        assert_eq!(app.store.verses.len(), 3, "the first press only asks");
        app.on_key(key(KeyCode::Char('x')));
        assert_eq!(app.store.verses.len(), 2);
    }
}
