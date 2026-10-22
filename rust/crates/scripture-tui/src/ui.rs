//! Drawing each view.

use ratatui::Frame;
use ratatui::layout::{Alignment, Constraint, Flex, Layout, Rect};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{
    Block, BorderType, Cell, Clear, Gauge, Paragraph, Row, Table, TableState, Tabs, Wrap,
};
use scripture_srs::{
    ALGORITHM_IDS, Grade, LogEntry, Order, Phase, Scheduler, Status, describe_interval,
    describe_position,
};

use crate::app::{App, SETTING_RETENTION, SETTING_TRANSLATION, VIEWS, View};
use crate::bible::TextState;
use crate::store::TRANSLATIONS;

const ACCENT: Color = Color::Indexed(105);

fn phase_color(phase: Phase) -> Color {
    match phase {
        Phase::Daily => Color::Indexed(105),
        Phase::Weekly => Color::Indexed(36),
        Phase::Monthly => Color::Indexed(172),
        Phase::Upcoming => Color::DarkGray,
        Phase::Retained => Color::Indexed(71),
    }
}

fn grade_color(grade: Grade) -> Color {
    match grade {
        Grade::Again => Color::Indexed(167),
        Grade::Hard => Color::Indexed(179),
        Grade::Good => ACCENT,
        Grade::Easy => Color::Indexed(71),
    }
}

fn pill(phase: Phase, adaptive: bool) -> Span<'static> {
    Span::styled(
        format!(" {} ", phase.name(adaptive)),
        Style::new()
            .fg(Color::Black)
            .bg(phase_color(phase))
            .add_modifier(Modifier::BOLD),
    )
}

fn position(s: &Status, verse: &scripture_srs::Verse) -> String {
    let at = if s.phase == Phase::Upcoming {
        format!("Starts {}", verse.start)
    } else {
        describe_position(s)
    };
    if verse.paused.is_some() {
        format!("Paused · {at}")
    } else {
        at
    }
}

pub fn draw(frame: &mut Frame, app: &mut App) {
    let [top, body, bottom] = Layout::vertical([
        Constraint::Length(2),
        Constraint::Min(5),
        Constraint::Length(1),
    ])
    .areas(frame.area());
    let scheduler = app.scheduler();
    draw_top(frame, top, app, &scheduler);
    match app.view {
        View::Review => draw_review(frame, body, app, &scheduler),
        View::Verses => draw_verses(frame, body, app),
        View::Settings => draw_settings(frame, body, app),
    }
    draw_bottom(frame, bottom, app, &scheduler);
    if app.adding.is_some() {
        draw_add(frame, app);
    }
}

fn draw_top(frame: &mut Frame, area: Rect, app: &App, scheduler: &Scheduler) {
    let [left, right] =
        Layout::horizontal([Constraint::Min(30), Constraint::Length(40)]).areas(area);
    let due = app.due().len();
    let titles = VIEWS.iter().map(|v| match v {
        View::Review => format!("Review · {due}"),
        View::Verses => format!("Verses · {}", app.store.verses.len()),
        View::Settings => "Settings".into(),
    });
    let selected = VIEWS.iter().position(|v| *v == app.view).unwrap_or(0);
    let tabs = Tabs::new(titles)
        .select(selected)
        .highlight_style(
            Style::new()
                .fg(ACCENT)
                .add_modifier(Modifier::BOLD | Modifier::UNDERLINED),
        )
        .block(Block::new().title(Line::from(" Scripture Retention ").bold()));
    frame.render_widget(tabs, left);
    let info = Line::from(vec![
        Span::raw(scheduler.algorithm().name()).fg(ACCENT),
        Span::raw(format!(
            " · {} · {} ",
            TRANSLATIONS[app.store.translation()].1,
            app.day
        ))
        .dim(),
    ]);
    frame.render_widget(Paragraph::new(info).alignment(Alignment::Right), right);
}

fn draw_bottom(frame: &mut Frame, area: Rect, app: &App, scheduler: &Scheduler) {
    if let Some(message) = &app.message {
        frame.render_widget(
            Paragraph::new(Line::from(message.as_str()).fg(Color::Yellow)),
            area,
        );
        return;
    }
    // The card in front's deck may have its own schedule
    let adaptive = match (app.view, app.current()) {
        (View::Review, Some(verse)) => app.scheduler_for(verse).algorithm().is_adaptive(),
        _ => scheduler.algorithm().is_adaptive(),
    };
    let keys = match app.view {
        View::Review if app.current().is_none() => "Tab views · q quit",
        View::Review if !app.revealed => "Space show the verse · ← back · Tab views · q quit",
        View::Review if adaptive => {
            "1–4 grade · Space Good · t/w/m again in a day/week/month · ← back · q quit"
        }
        View::Review => "Space next · t/w/m again in a day/week/month · ← back · q quit",
        View::Verses if adaptive => {
            "↑↓ select · a add · f start over · x delete · Tab views · q quit"
        }
        View::Verses => "↑↓ select · a add · x delete · Tab views · q quit",
        View::Settings => "↑↓ select · Enter choose · ←→ change · Tab views · q quit",
    };
    frame.render_widget(Paragraph::new(Line::from(keys).dim()), area);
}

fn draw_review(frame: &mut Frame, area: Rect, app: &mut App, scheduler: &Scheduler) {
    let Some(verse) = app.current().cloned() else {
        return draw_done(frame, area, app, scheduler);
    };
    // Its deck's schedule
    let scheduler = &app.scheduler_for(&verse);
    let adaptive = scheduler.algorithm().is_adaptive();
    let passage = verse
        .passage
        .as_deref()
        .and_then(|p| app.store.passage_name(p));
    let status = scheduler.status(&verse, app.day);
    let [progress, card, buttons] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(6),
        Constraint::Length(3),
    ])
    .areas(area);
    let ratio = app.index as f64 / app.queue.len().max(1) as f64;
    frame.render_widget(
        Gauge::default()
            .ratio(ratio)
            .label(format!("{} of {}", app.index + 1, app.queue.len()))
            .gauge_style(Style::new().fg(ACCENT).bg(Color::Indexed(236))),
        progress,
    );

    let mut lines = vec![
        Line::from(Span::styled(
            format!(
                "#{}",
                if verse.tag.is_empty() {
                    "?"
                } else {
                    &verse.tag
                }
            ),
            Style::new().fg(ACCENT).bold(),
        )),
        Line::from(Span::raw(verse.reference.clone()).bold()),
        Line::raw(""),
    ];
    // A passage's card names its passage above it
    if let Some(passage) = &passage {
        // Without a topic of its own, a card goes by its passage
        if verse.tag.is_empty() {
            lines.remove(0);
        }
        lines.insert(0, Line::from(passage.to_uppercase()).dim());
    }
    if app.revealed {
        match app.current_text() {
            Some(TextState::Ready(passages)) => {
                let several = passages.len() > 1;
                for p in passages {
                    if several {
                        lines.push(Line::from(p.reference.clone()).dim());
                    }
                    let mut spans = Vec::new();
                    for (label, text) in p.verses {
                        spans.push(Span::styled(
                            format!("{label} "),
                            Style::new().fg(Color::DarkGray),
                        ));
                        spans.push(Span::raw(format!("{text} ")));
                    }
                    lines.push(Line::from(spans));
                    lines.push(Line::raw(""));
                }
                lines.push(Line::from(TRANSLATIONS[app.store.translation()].1).dim());
            }
            Some(TextState::Loading) => lines.push(
                Line::from(format!(
                    "Loading the {}…",
                    TRANSLATIONS[app.store.translation()].1
                ))
                .dim(),
            ),
            Some(TextState::Unknown) => {
                lines.push(Line::from("This reference couldn't be read. Check its spelling.").dim())
            }
            Some(TextState::Missing) => {
                lines.push(Line::from("This translation doesn't have this passage.").dim())
            }
            Some(TextState::Error(e)) => lines
                .push(Line::from(format!("Couldn't load the text: {e}")).fg(Color::Indexed(167))),
            None => {}
        }
    } else {
        lines.push(
            Line::from(if passage.is_some() && verse.tag.is_empty() {
                "Say the reference and recite it aloud, then press Space."
            } else {
                "Say the topic, the reference, and the verse aloud, then press Space."
            })
            .dim(),
        );
    }
    let block = Block::bordered()
        .border_type(BorderType::Rounded)
        .title(Line::from(vec![
            Span::raw(" "),
            pill(status.phase, adaptive),
            Span::raw(" "),
        ]))
        .title(Line::from(format!(" {} ", position(&status, &verse))).right_aligned())
        .padding(ratatui::widgets::Padding::new(2, 2, 1, 0));
    frame.render_widget(
        Paragraph::new(Text::from(lines))
            .wrap(Wrap { trim: true })
            .block(block),
        card,
    );

    if app.revealed {
        let mut spans = Vec::new();
        if adaptive {
            for (i, option) in scheduler
                .preview_at(&verse, app.day, app.graded_at())
                .iter()
                .enumerate()
            {
                spans.push(Span::styled(
                    format!(" {} ", i + 1),
                    Style::new().fg(Color::Black).bg(grade_color(option.grade)),
                ));
                spans.push(Span::styled(
                    format!(" {} ", option.grade.name()),
                    Style::new().fg(grade_color(option.grade)).bold(),
                ));
                spans.push(Span::raw(format!("{}    ", option.label)).dim());
            }
        } else {
            spans.push(Span::styled(
                " Space ",
                Style::new().fg(Color::Black).bg(ACCENT),
            ));
            spans.push(Span::raw(" Next").bold());
        }
        frame.render_widget(
            Paragraph::new(Line::from(spans))
                .alignment(Alignment::Center)
                .block(Block::new().padding(ratatui::widgets::Padding::top(1))),
            buttons,
        );
    }
}

fn draw_done(frame: &mut Frame, area: Rect, app: &App, scheduler: &Scheduler) {
    let adaptive = scheduler.algorithm().is_adaptive();
    let statuses: Vec<Status> = app
        .store
        .verses
        .iter()
        .map(|v| app.scheduler_for(v).status(v, app.day))
        .collect();
    let mut lines = vec![];
    if app.store.verses.is_empty() {
        lines.push(Line::from("No verses yet").bold());
        lines.push(Line::raw(""));
        lines.push(
            Line::from("Add one in Verses (Tab, then a), or open a backup saved from the web app:")
                .dim(),
        );
        lines.push(Line::from("scripture-tui --file scripture-retention-backup.json").dim());
    } else {
        lines.push(
            Line::from(if app.reviewed > 0 {
                "Done for today"
            } else {
                "Nothing due today"
            })
            .bold()
            .fg(Color::Indexed(71)),
        );
        if app.reviewed > 0 {
            lines.push(
                Line::from(format!(
                    "You reviewed {} {}.",
                    app.reviewed,
                    if app.reviewed == 1 { "verse" } else { "verses" }
                ))
                .dim(),
            );
        }
        lines.push(Line::raw(""));
        let counts: Vec<Span> = [Phase::Daily, Phase::Weekly, Phase::Monthly]
            .iter()
            .flat_map(|p| {
                let n = statuses.iter().filter(|s| s.phase == *p).count();
                [
                    Span::styled(format!("{n} "), Style::new().fg(phase_color(*p)).bold()),
                    Span::raw(format!("{}   ", p.name(adaptive))).dim(),
                ]
            })
            .collect();
        lines.push(Line::from(counts));
        if let Some(next) = statuses
            .iter()
            .filter_map(|s| s.next.filter(|n| *n > app.day))
            .min()
        {
            lines.push(Line::raw(""));
            lines.push(Line::from(format!("Next review: {next}")).dim());
        }
        let more = app.due().len();
        if more > 0 {
            lines.push(Line::raw(""));
            lines.push(Line::from(format!("Space to review {more} more")).fg(ACCENT));
        }
    }
    let [middle] = Layout::vertical([Constraint::Length(lines.len() as u16)])
        .flex(Flex::Center)
        .areas(area);
    frame.render_widget(Paragraph::new(lines).alignment(Alignment::Center), middle);
}

fn draw_verses(frame: &mut Frame, area: Rect, app: &App) {
    let wide = area.width >= 100;
    let [list, detail] = if wide {
        Layout::horizontal([Constraint::Percentage(58), Constraint::Percentage(42)]).areas(area)
    } else {
        [area, Rect::default()]
    };
    let order = app.listed();
    let rows: Vec<Row> = order
        .iter()
        .map(|&i| {
            let v = &app.store.verses[i];
            let scheduler = app.scheduler_for(v);
            let adaptive = scheduler.algorithm().is_adaptive();
            let s = scheduler.status(v, app.day);
            Row::new(vec![
                Cell::from(Span::styled(
                    format!(" {} ", s.phase.name(adaptive)),
                    Style::new().fg(phase_color(s.phase)),
                )),
                Cell::from(Span::styled(
                    format!("#{}", if v.tag.is_empty() { "?" } else { &v.tag }),
                    Style::new().fg(ACCENT),
                )),
                Cell::from(v.reference.clone()),
                Cell::from(Span::raw(position(&s, v)).dim()),
                Cell::from(if s.due {
                    Span::styled(" Due ", Style::new().fg(Color::Black).bg(ACCENT))
                } else {
                    Span::raw("")
                }),
            ])
        })
        .collect();
    let table = Table::new(
        rows,
        [
            Constraint::Length(8),
            Constraint::Fill(2),
            Constraint::Fill(3),
            Constraint::Length(15),
            Constraint::Length(5),
        ],
    )
    .header(Row::new(["Phase", "Topic", "Reference", "Where", ""]).style(Style::new().dim()))
    .row_highlight_style(
        Style::new()
            .bg(Color::Indexed(236))
            .add_modifier(Modifier::BOLD),
    )
    .block(
        Block::bordered()
            .border_type(BorderType::Rounded)
            .title(" Verses "),
    );
    let mut state =
        TableState::default().with_selected((!order.is_empty()).then_some(app.selected));
    frame.render_stateful_widget(table, list, &mut state);
    if wide && let Some(&i) = order.get(app.selected) {
        draw_detail(frame, detail, app, i);
    }
}

fn draw_detail(frame: &mut Frame, area: Rect, app: &App, index: usize) {
    let v = &app.store.verses[index];
    let scheduler = app.scheduler_for(v);
    let s = scheduler.status(v, app.day);
    let mut lines = vec![
        Line::from(v.reference.clone()).bold(),
        Line::from(position(&s, v)),
        Line::from(if s.due {
            "Due today".to_string()
        } else if let Some(paused) = v.paused {
            format!("Paused since {paused}")
        } else {
            s.next.map_or(String::new(), |n| format!("Next {n}"))
        })
        .fg(if s.due { ACCENT } else { Color::Gray }),
        Line::raw(""),
    ];
    for (label, value) in scheduler.memory(v, app.day) {
        lines.push(Line::from(vec![
            Span::raw(format!("{label:<16}")).dim(),
            Span::raw(value),
        ]));
    }
    lines.push(Line::from(vec![
        Span::raw(format!("{:<16}", "Deck")).dim(),
        Span::raw(format!(
            "{} ({})",
            app.store.deck_name(v.deck.as_deref()),
            scheduler.algorithm().name()
        )),
    ]));
    if let Some(passage) = v.passage.as_deref().and_then(|p| app.store.passage_name(p)) {
        lines.push(Line::from(vec![
            Span::raw(format!("{:<16}", "Passage")).dim(),
            Span::raw(passage),
        ]));
    }
    lines.push(Line::from(vec![
        Span::raw(format!("{:<16}", "Started")).dim(),
        Span::raw(v.start.to_string()),
    ]));
    if let Some(last) = v.last {
        lines.push(Line::from(vec![
            Span::raw(format!("{:<16}", "Last reviewed")).dim(),
            Span::raw(last.to_string()),
        ]));
    }
    if !v.log.is_empty() {
        lines.push(Line::raw(""));
        lines.push(Line::from("History").bold());
        for entry in v.log.iter().rev().take(12) {
            let (day, what, color) = match *entry {
                LogEntry::Review { day, grade } => {
                    (day, grade.name().to_string(), grade_color(grade))
                }
                LogEntry::Place { day, days: 0 } => {
                    (day, "Started over as new".into(), Color::Gray)
                }
                LogEntry::Place { day, days } => (
                    day,
                    format!("Placed: next in {}", describe_interval(days)),
                    Color::Gray,
                ),
            };
            lines.push(Line::from(vec![
                Span::raw(format!("{day}  ")).dim(),
                Span::styled(what, Style::new().fg(color)),
            ]));
        }
    }
    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: true }).block(
            Block::bordered()
                .border_type(BorderType::Rounded)
                .title(" Verse "),
        ),
        area,
    );
}

fn draw_settings(frame: &mut Frame, area: Rect, app: &App) {
    let current = app.store.algorithm();
    let mut lines = vec![
        Line::from("Algorithm").bold(),
        Line::from("Every review is kept, and the one you pick works from all of them.").dim(),
        Line::raw(""),
    ];
    for (i, id) in ALGORITHM_IDS.iter().enumerate() {
        let chosen = *id == current;
        let due = Scheduler::new(*id, app.store.durations(), app.store.options())
            .due_verses(&app.store.verses, app.day, Order::Phase)
            .len();
        let cursor = if app.setting == i { "›" } else { " " };
        let mark = if chosen { "●" } else { "○" };
        let style = if app.setting == i {
            Style::new().bg(Color::Indexed(236)).bold()
        } else {
            Style::new()
        };
        lines.push(Line::from(vec![
            Span::raw(format!("{cursor} {mark} ")).fg(if chosen { ACCENT } else { Color::Gray }),
            Span::styled(format!("{:<20}", id.name()), style),
            Span::raw(format!("{due} due today")).dim(),
        ]));
        if app.setting == i {
            for line in wrap(id.description(), area.width.saturating_sub(12) as usize) {
                lines.push(Line::from(format!("      {line}")).dim());
            }
        }
    }
    lines.push(Line::raw(""));
    let row = |i: usize, label: &str, value: String| {
        let cursor = if app.setting == i { "›" } else { " " };
        let style = if app.setting == i {
            Style::new().bg(Color::Indexed(236)).bold()
        } else {
            Style::new()
        };
        Line::from(vec![
            Span::raw(format!("{cursor}   ")),
            Span::styled(format!("{label:<20}"), style),
            Span::raw(format!("‹ {value} ›")).fg(ACCENT),
        ])
    };
    lines.push(row(
        SETTING_TRANSLATION,
        "Translation",
        TRANSLATIONS[app.store.translation()].1.to_string(),
    ));
    lines.push(row(
        SETTING_RETENTION,
        "Desired retention",
        format!(
            "{}%",
            (app.store.options().fsrs.desired_retention * 100.0).round()
        ),
    ));
    lines.push(
        Line::from("      FSRS's: how likely you are to recall a verse when it's due.").dim(),
    );
    lines.push(Line::raw(""));
    lines.push(Line::from("Every other option is in the web app's Settings → Schedule; a backup carries them here.").dim());
    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: false }).block(
            Block::bordered()
                .border_type(BorderType::Rounded)
                .title(" Settings ")
                .padding(ratatui::widgets::Padding::horizontal(1)),
        ),
        area,
    );
}

/// Words in lines of at most `width` characters
fn wrap(text: &str, width: usize) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for word in text.split_whitespace() {
        match lines.last_mut() {
            Some(line) if line.chars().count() + 1 + word.chars().count() <= width.max(20) => {
                line.push(' ');
                line.push_str(word);
            }
            _ => lines.push(word.to_string()),
        }
    }
    lines
}

fn draw_add(frame: &mut Frame, app: &App) {
    let Some(form) = &app.adding else { return };
    let [area] = Layout::vertical([Constraint::Length(9)])
        .flex(Flex::Center)
        .areas(frame.area());
    let [area] = Layout::horizontal([Constraint::Max(60)])
        .flex(Flex::Center)
        .areas(area);
    frame.render_widget(Clear, area);
    let field = |i: usize, label: &str, value: &str| {
        let active = form.field == i;
        Line::from(vec![
            Span::raw(format!("{label:<11}")).dim(),
            Span::styled(
                format!("{value}{}", if active { "▏" } else { "" }),
                if active {
                    Style::new().fg(ACCENT).bold()
                } else {
                    Style::new()
                },
            ),
        ])
    };
    let lines = vec![
        Line::raw(""),
        field(0, "Reference", &form.reference),
        Line::raw(""),
        field(1, "Topic #", &form.tag),
        Line::raw(""),
        Line::from("Enter next / add · Tab switch · Esc cancel").dim(),
    ];
    frame.render_widget(
        Paragraph::new(lines).block(
            Block::bordered()
                .border_type(BorderType::Rounded)
                .title(" Add a verse ")
                .padding(ratatui::widgets::Padding::horizontal(2)),
        ),
        area,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::App;
    use crate::bible::{Bible, read_usx};
    use crate::store::Store;
    use ratatui::Terminal;
    use ratatui::backend::TestBackend;
    use scripture_srs::{AlgorithmId, Verse};

    fn screen(app: &mut App) -> String {
        let mut terminal = Terminal::new(TestBackend::new(110, 30)).unwrap();
        terminal.draw(|f| draw(f, app)).unwrap();
        let buffer = terminal.backend().buffer();
        (0..buffer.area.height)
            .map(|y| {
                (0..buffer.area.width)
                    .map(|x| buffer[(x, y)].symbol())
                    .collect::<String>()
                    + "\n"
            })
            .collect()
    }

    fn app() -> App {
        let mut store = Store::default();
        store.set_algorithm(AlgorithmId::Fsrs);
        let day: scripture_srs::Day = "2026-10-21".parse().unwrap();
        store.verses = vec![Verse::new("a", "love", "John 3:16", day)];
        let mut bible = Bible::new(std::env::temp_dir().join("scripture-tui-test-unused"));
        bible.insert("eng_bsb", "JHN", read_usx(r#"<usx><book code="JHN"/><chapter number="3"/><verse number="16"/>For God so loved the world.</usx>"#));
        App::new(store, None, day, bible)
    }

    #[test]
    fn the_review_card_then_its_verse_and_grades() {
        let mut app = app();
        let before = screen(&mut app);
        assert!(
            before.contains("#love")
                && before.contains("John 3:16")
                && before.contains("Say the topic"),
            "{before}"
        );
        assert!(before.contains("FSRS") && before.contains("Review · 1"));
        app.revealed = true;
        let after = screen(&mut app);
        assert!(after.contains("For God so loved the world."), "{after}");
        assert!(
            after.contains("Again") && after.contains("<10m") && after.contains("Easy"),
            "{after}"
        );
    }

    #[test]
    fn verses_and_settings_draw() {
        let mut app = app();
        app.view = View::Verses;
        let verses = screen(&mut app);
        assert!(
            verses.contains("John 3:16") && verses.contains("New") && verses.contains("Due"),
            "{verses}"
        );
        app.view = View::Settings;
        let settings = screen(&mut app);
        assert!(
            settings.contains("Leitner boxes")
                && settings.contains("Desired retention")
                && settings.contains("90%"),
            "{settings}"
        );
    }
}
