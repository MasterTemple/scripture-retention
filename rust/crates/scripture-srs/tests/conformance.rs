//! The web app's engine and this one give the same days and the same text: the cases in
//! `conformance.json` come from the web app (`test/conformance.test.ts`), run here.

use std::collections::HashMap;

use scripture_srs::{AlgorithmId, Day, Durations, Phase, Scheduler, SrsOptions, Verse};
use serde_json::{Value, json};

#[derive(serde::Deserialize)]
struct Cases {
    durations: Durations,
    options: HashMap<String, SrsOptions>,
    verses: Vec<Verse>,
    cases: Vec<Case>,
}

#[derive(serde::Deserialize)]
struct Case {
    verse: usize,
    options: String,
    algorithm: AlgorithmId,
    day: Day,
    status: Value,
    preview: Value,
    memory: Value,
}

fn phase(p: Phase) -> &'static str {
    match p {
        Phase::Daily => "daily",
        Phase::Weekly => "weekly",
        Phase::Monthly => "monthly",
        Phase::Upcoming => "upcoming",
        Phase::Retained => "retained",
    }
}

#[test]
fn every_case_matches_the_web_app() {
    let cases: Cases =
        serde_json::from_str(include_str!("conformance.json")).expect("conformance.json reads");
    let mut failures = Vec::new();
    for (i, c) in cases.cases.iter().enumerate() {
        let scheduler = Scheduler::new(
            c.algorithm,
            cases.durations,
            cases.options[&c.options].clone(),
        );
        let verse = &cases.verses[c.verse];
        let s = scheduler.status(verse, c.day);
        let status = json!([
            phase(s.phase),
            s.position,
            s.total,
            s.scheduled.map(|d| d.to_string()),
            s.due,
            s.next.map(|d| d.to_string()),
            s.interval,
            s.learning,
            s.fresh
        ]);
        let preview: Value = scheduler
            .preview(verse, c.day)
            .into_iter()
            .map(|p| json!([p.grade.number(), p.label, p.days]))
            .collect();
        let memory: Value = scheduler
            .memory(verse, c.day)
            .into_iter()
            .map(|(l, v)| json!([l, v]))
            .collect();
        for (what, ours, theirs) in [
            ("status", &status, &c.status),
            ("preview", &preview, &c.preview),
            ("memory", &memory, &c.memory),
        ] {
            if ours != theirs {
                failures.push(format!(
                    "case {i} ({} {:?} verse {} on {}) {what}: ours {ours} ≠ web app's {theirs}",
                    c.options, c.algorithm, c.verse, c.day
                ));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {} cases differ:\n{}",
        failures.len(),
        cases.cases.len(),
        failures
            .iter()
            .take(25)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
