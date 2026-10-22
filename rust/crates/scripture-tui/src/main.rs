//! Scripture Retention in the terminal: review memorized verses by any spaced-repetition
//! algorithm, with the same data as the web app (its backup file).

mod app;
mod bible;
mod store;
mod ui;

use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use ratatui::crossterm::event::{self, Event, KeyEventKind};
use scripture_srs::Day;

use crate::app::App;
use crate::bible::{Bible, default_cache};
use crate::store::{Store, default_path};

const HELP: &str = "scripture-tui: review memorized Scripture in the terminal

Usage: scripture-tui [--file PATH] [--day YYYY-MM-DD]

  --file PATH   The backup to review from and save to: the web app's Settings → Data → Save
                backup, or a new file (default: $XDG_DATA_HOME/scripture-retention/backup.json)
  --day DAY     Review as if it were this day (for trying it out)

Keys: Tab switches views (Review, Verses, Settings); in a review, Space shows the verse and goes on,
1–4 grade it (Again, Hard, Good, Easy); q quits. Changes are saved as they're made, in the web
app's backup format, so Settings → Data → Restore in the app takes them back.";

fn main() -> ExitCode {
    let mut path = None;
    let mut fixed_day: Option<Day> = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{HELP}");
                return ExitCode::SUCCESS;
            }
            "--file" | "-f" => path = args.next().map(PathBuf::from),
            "--day" => match args.next().map(|d| d.parse::<Day>()) {
                Some(Ok(day)) => fixed_day = Some(day),
                _ => {
                    eprintln!("--day takes a day, as 2026-10-21");
                    return ExitCode::FAILURE;
                }
            },
            other => {
                eprintln!("unknown argument {other:?} (see --help)");
                return ExitCode::FAILURE;
            }
        }
    }
    let path = path.unwrap_or_else(default_path);
    let store = match Store::load(&path) {
        Ok(store) => store,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    let today = |store: &Store| fixed_day.unwrap_or_else(|| store.review_day(chrono::Local::now()));
    let day = today(&store);
    let mut app = App::new(store, Some(path), day, Bible::new(default_cache()));

    let mut terminal = ratatui::init();
    let result = (|| -> std::io::Result<()> {
        while !app.quit {
            terminal.draw(|frame| ui::draw(frame, &mut app))?;
            // Wakes now and then for books that have downloaded and for a new day
            if event::poll(Duration::from_millis(250))?
                && let Event::Key(key) = event::read()?
                && key.kind == KeyEventKind::Press
            {
                app.on_key(key);
            }
            app.bible.poll();
            let day = today(&app.store);
            app.set_day(day);
        }
        Ok(())
    })();
    ratatui::restore();
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}
