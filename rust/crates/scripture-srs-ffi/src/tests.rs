use super::*;

fn verse(start: &str) -> VerseRecord {
    VerseRecord {
        id: "1".into(),
        tag: "love".into(),
        reference: "John 3:16".into(),
        start: start.into(),
        last: None,
        log: Vec::new(),
    }
}

#[test]
fn a_new_verse_through_fsrs() {
    let srs = ScriptureSrs::new();
    let fsrs = srs.scheduler().with_algorithm(Algorithm::Fsrs);
    let labels: Vec<String> = fsrs
        .preview(verse("2026-10-21"), "2026-10-21".into())
        .unwrap()
        .into_iter()
        .map(|o| o.label)
        .collect();
    assert_eq!(labels, ["<1m", "<6m", "<10m", "10d"]);
    let reviewed = fsrs
        .review(verse("2026-10-21"), Grade::Good, "2026-10-21".into())
        .unwrap();
    assert_eq!(reviewed.last.as_deref(), Some("2026-10-21"));
    assert_eq!(
        reviewed.log,
        [LogItem::Review {
            day: "2026-10-21".into(),
            grade: Grade::Good
        }]
    );
    let status = fsrs.status(reviewed.clone(), "2026-10-21".into()).unwrap();
    assert!(status.learning && status.due);
    assert_eq!(status.description, "Learning");
    assert!(
        fsrs.memory(reviewed, "2026-10-21".into())
            .unwrap()
            .iter()
            .any(|m| m.label == "Stability")
    );
}

#[test]
fn the_fixed_schedule() {
    let fixed = ScriptureSrs::new().scheduler();
    assert_eq!(fixed.grades(), [Grade::Good]);
    let s = fixed
        .status(verse("2026-10-01"), "2026-10-21".into())
        .unwrap();
    assert_eq!(
        (s.phase, s.position, s.total, s.due),
        (Phase::Daily, 21, 49, true)
    );
    assert_eq!(s.description, "Day 21 of 49");
    assert!(
        fixed
            .preview(verse("2026-10-01"), "2026-10-21".into())
            .unwrap()
            .is_empty()
    );
    let upcoming = fixed
        .status(verse("2026-11-01"), "2026-10-21".into())
        .unwrap();
    assert_eq!(
        (upcoming.phase, upcoming.description.as_str()),
        (Phase::Upcoming, "Starts 2026-11-01")
    );
}

#[test]
fn due_verses_and_rescheduling() {
    let leitner = ScriptureSrs::new()
        .scheduler()
        .with_algorithm(Algorithm::Leitner);
    let later = leitner
        .reschedule(verse("2026-10-01"), 5, "2026-10-21".into(), true)
        .unwrap();
    assert_eq!(
        later.log.last(),
        Some(&LogItem::Place {
            day: "2026-10-21".into(),
            days: 5
        })
    );
    let due = leitner
        .due(
            vec![later.clone(), verse("2026-10-21")],
            "2026-10-21".into(),
        )
        .unwrap();
    assert_eq!(due.len(), 1);
    assert!(leitner.status(later, "2026-10-26".into()).unwrap().due);
}

#[test]
fn settings_from_the_web_app() {
    let srs = ScriptureSrs::new();
    let anki = srs.scheduler_from_json(r#"{"algorithm": "anki", "theme": "dark", "srs": {"anki": {"learningSteps": [], "fuzz": false}}}"#.into()).unwrap();
    assert_eq!(anki.algorithm(), Algorithm::Anki);
    // No steps: Good graduates at once
    let options = anki
        .preview(verse("2026-10-21"), "2026-10-21".into())
        .unwrap();
    assert_eq!(
        options.iter().map(|o| o.days).collect::<Vec<_>>(),
        [1, 1, 1, 4]
    );
    // What isn't given keeps its default; it reads back as it was given
    let json: Value = serde_json::from_str(&anki.to_json()).unwrap();
    assert_eq!(json["srs"]["anki"]["easyBonus"], 1.3);
    assert_eq!(json["srs"]["anki"]["learningSteps"], serde_json::json!([]));
    assert!(matches!(
        srs.scheduler_from_json("[1]".into()),
        Err(SrsError::InvalidOptions { .. })
    ));
    assert!(matches!(
        srs.scheduler_from_json(r#"{"algorithm": "nope"}"#.into()),
        Err(SrsError::InvalidOptions { .. })
    ));
}

#[test]
fn fsrs_parameters_and_retention() {
    let s = SrsScheduler::create().with_algorithm(Algorithm::Fsrs);
    let five = srs_core::FSRS5_DEFAULTS.map(|n| n.to_string()).join(", ");
    assert!(s.with_fsrs_params(five).is_ok());
    assert!(matches!(
        s.with_fsrs_params("1, 2, 3".into()),
        Err(SrsError::InvalidOptions { .. })
    ));
    let json: Value = serde_json::from_str(&s.with_desired_retention(0.5).to_json()).unwrap();
    assert_eq!(json["srs"]["fsrs"]["desiredRetention"], 0.7);
}

#[test]
fn reading_and_writing_the_web_apps_verses() {
    let srs = ScriptureSrs::new();
    let backup = r#"{"app": "scripture-retention", "version": 1, "verses": [{"id": "a", "tag": "t", "ref": "John 3:16", "start": "2026-01-01", "last": "2026-01-02", "log": [{"day": "2026-01-01", "grade": 3}, {"day": "2026-01-02", "set": 4}]}], "queue": [], "settings": {}}"#;
    let verses = srs.read_verses(backup.into()).unwrap();
    assert_eq!(verses[0].reference, "John 3:16");
    assert_eq!(
        verses[0].log[1],
        LogItem::Place {
            day: "2026-01-02".into(),
            days: 4
        }
    );
    let state = format!(
        r#"{{"state": {{"verses": {}}}}}"#,
        srs.write_verses(verses.clone()).unwrap()
    );
    assert_eq!(srs.read_verses(state).unwrap(), verses);
    assert!(matches!(
        srs.read_verses(r#"[{"id": 1}]"#.into()),
        Err(SrsError::InvalidVerse { .. })
    ));
}

#[test]
fn bad_days_say_so() {
    let s = SrsScheduler::create();
    assert!(matches!(
        s.status(verse("2026-02-30"), "2026-10-21".into()),
        Err(SrsError::InvalidDay { .. })
    ));
    assert!(matches!(
        s.status(verse("2026-02-01"), "tomorrow".into()),
        Err(SrsError::InvalidDay { .. })
    ));
}

#[test]
fn the_algorithms_and_helpers() {
    let srs = ScriptureSrs::new();
    let all = srs.algorithms();
    assert_eq!(all.len(), 7);
    assert_eq!(all[1].key, "fsrs");
    assert_eq!(all[4].grades, [Grade::Again, Grade::Good]);
    assert!(!all[0].adaptive);
    assert_eq!(
        srs.parse_steps("1m 10m 1d".into()).unwrap(),
        [1.0, 10.0, 1440.0]
    );
    assert!(srs.parse_steps("soon".into()).is_err());
    assert_eq!(srs.format_interval(45, None), "1.5mo");
    assert_eq!(srs.format_interval(0, Some(10.0)), "<10m");
}

#[test]
fn fitting_fsrs_to_the_reviews_logged() {
    let srs = ScriptureSrs::new();
    let verses: Vec<VerseRecord> = (0..40u32)
        .map(|i| {
            let day =
                |n: u32| srs_core::Day::from_epoch_days(20_000 + i64::from(i + n)).to_string();
            let log = [0, 1, 4, 11, 26, 56]
                .iter()
                .map(|&n| LogItem::Review {
                    day: day(n),
                    grade: if (i + n) % 7 == 0 {
                        Grade::Again
                    } else {
                        Grade::Good
                    },
                })
                .collect();
            VerseRecord {
                id: i.to_string(),
                log,
                ..verse("2024-10-01")
            }
        })
        .collect();
    let fit = srs.optimize_fsrs(verses).unwrap();
    assert_eq!((fit.params.len(), fit.reviews, fit.verses), (21, 200, 40));
    let params = fit
        .params
        .iter()
        .map(|p| p.to_string())
        .collect::<Vec<_>>()
        .join(", ");
    assert!(SrsScheduler::create().with_fsrs_params(params).is_ok());
    // A verse from before grading (its log begins with a placing) isn't learned from
    let placed = VerseRecord {
        log: vec![
            LogItem::Place {
                day: "2026-01-01".into(),
                days: 7,
            },
            LogItem::Review {
                day: "2026-01-08".into(),
                grade: Grade::Good,
            },
        ],
        ..verse("2025-01-01")
    };
    let none = srs.optimize_fsrs(vec![placed]).unwrap();
    assert_eq!((none.reviews, none.verses), (0, 0));
}
