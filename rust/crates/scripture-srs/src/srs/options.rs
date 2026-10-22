//! The algorithms and their options, with the defaults the web app uses.

/// The scheduling algorithms a verse can follow
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "lowercase")
)]
pub enum AlgorithmId {
    /// The fixed schedule: daily, weekly, monthly
    #[default]
    Fixed,
    Fsrs,
    Anki,
    Sm2,
    Leitner,
    Pimsleur,
    Ebisu,
}

/// Every algorithm, in the order the web app lists them
pub const ALGORITHM_IDS: [AlgorithmId; 7] = [
    AlgorithmId::Fixed,
    AlgorithmId::Fsrs,
    AlgorithmId::Anki,
    AlgorithmId::Sm2,
    AlgorithmId::Leitner,
    AlgorithmId::Pimsleur,
    AlgorithmId::Ebisu,
];

impl AlgorithmId {
    /// Whether it grades reviews and adapts to them (every one but the fixed schedule)
    pub fn is_adaptive(self) -> bool {
        self != AlgorithmId::Fixed
    }

    /// The name people know it by
    pub fn name(self) -> &'static str {
        match self {
            AlgorithmId::Fixed => "Scripture Memory",
            AlgorithmId::Fsrs => "FSRS",
            AlgorithmId::Anki => "Anki (SM-2)",
            AlgorithmId::Sm2 => "SuperMemo SM-2",
            AlgorithmId::Leitner => "Leitner boxes",
            AlgorithmId::Pimsleur => "Pimsleur",
            AlgorithmId::Ebisu => "Ebisu",
        }
    }

    /// Its id as the web app saves it: `fixed`, `fsrs`, `anki`, …
    pub fn key(self) -> &'static str {
        match self {
            AlgorithmId::Fixed => "fixed",
            AlgorithmId::Fsrs => "fsrs",
            AlgorithmId::Anki => "anki",
            AlgorithmId::Sm2 => "sm2",
            AlgorithmId::Leitner => "leitner",
            AlgorithmId::Pimsleur => "pimsleur",
            AlgorithmId::Ebisu => "ebisu",
        }
    }

    pub fn from_key(key: &str) -> Option<AlgorithmId> {
        ALGORITHM_IDS.into_iter().find(|id| id.key() == key)
    }

    /// A sentence on how it schedules
    pub fn description(self) -> &'static str {
        match self {
            AlgorithmId::Fixed => {
                "Each verse daily, then weekly, then monthly, for set lengths of time. No grading: every review counts the same."
            }
            AlgorithmId::Fsrs => {
                "Anki's modern scheduler: models how stable and how difficult each verse is, and reviews it when you'd recall it with the retention you choose."
            }
            AlgorithmId::Anki => {
                "Anki's classic scheduler: learning steps, then intervals that grow by each verse's ease, which Hard lowers and Easy raises."
            }
            AlgorithmId::Sm2 => {
                "The 1987 algorithm Anki grew from: 1 day, 6 days, then each interval times an easiness factor."
            }
            AlgorithmId::Leitner => {
                "Each verse sits in a box with its own interval. Recalled, it moves up a box; forgotten, it goes back."
            }
            AlgorithmId::Pimsleur => {
                "Graduated-interval recall: each interval about five times the last."
            }
            AlgorithmId::Ebisu => {
                "A Bayesian model of each verse's half-life; a verse comes due when the chance you'd recall it falls to your target."
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase", default)
)]
pub struct AnkiOptions {
    /// Learning steps in minutes (under a day: again in the same sitting)
    pub learning_steps: Vec<f64>,
    pub relearning_steps: Vec<f64>,
    pub graduating_interval: f64,
    pub easy_interval: f64,
    pub starting_ease: f64,
    pub easy_bonus: f64,
    pub interval_modifier: f64,
    pub hard_interval: f64,
    /// The share of the old interval kept after a lapse
    pub new_interval: f64,
    pub minimum_interval: f64,
    pub maximum_interval: f64,
    pub leech_threshold: u32,
    pub fuzz: bool,
}

impl Default for AnkiOptions {
    fn default() -> AnkiOptions {
        AnkiOptions {
            learning_steps: vec![1.0, 10.0],
            relearning_steps: vec![10.0],
            graduating_interval: 1.0,
            easy_interval: 4.0,
            starting_ease: 2.5,
            easy_bonus: 1.3,
            interval_modifier: 1.0,
            hard_interval: 1.2,
            new_interval: 0.0,
            minimum_interval: 1.0,
            maximum_interval: 36500.0,
            leech_threshold: 8,
            fuzz: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase", default)
)]
pub struct FsrsOptions {
    /// 17 (FSRS-4.5), 19 (FSRS-5), or 21 (FSRS-6) parameters; empty for FSRS-6's defaults
    pub params: Vec<f64>,
    pub desired_retention: f64,
}

impl Default for FsrsOptions {
    fn default() -> FsrsOptions {
        FsrsOptions {
            params: Vec::new(),
            desired_retention: 0.9,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase", default)
)]
pub struct Sm2Options {
    pub starting_ease: f64,
}

impl Default for Sm2Options {
    fn default() -> Sm2Options {
        Sm2Options { starting_ease: 2.5 }
    }
}

/// Where a forgotten verse goes on a ladder
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "lowercase")
)]
pub enum OnMiss {
    First,
    Back,
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase")
)]
pub struct LadderOptions {
    /// The interval of each box, in days
    pub intervals: Vec<f64>,
    pub on_miss: OnMiss,
}

impl LadderOptions {
    pub fn leitner() -> LadderOptions {
        LadderOptions {
            intervals: vec![1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0],
            on_miss: OnMiss::First,
        }
    }

    pub fn pimsleur() -> LadderOptions {
        LadderOptions {
            intervals: vec![1.0, 5.0, 25.0, 120.0, 730.0],
            on_miss: OnMiss::Back,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(rename_all = "camelCase", default)
)]
pub struct EbisuOptions {
    /// Recall probability at which a verse comes due
    pub target_recall: f64,
    /// A new verse's half-life, in days
    pub halflife: f64,
    /// The prior's α = β
    pub ab: f64,
}

impl Default for EbisuOptions {
    fn default() -> EbisuOptions {
        EbisuOptions {
            target_recall: 0.85,
            halflife: 1.0,
            ab: 3.0,
        }
    }
}

/// Every algorithm's options. FSRS uses Anki's steps, maximum interval, fuzz, and leech
/// threshold, as Anki's deck options share them
#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "serde",
    derive(serde::Serialize, serde::Deserialize),
    serde(default)
)]
pub struct SrsOptions {
    pub anki: AnkiOptions,
    pub fsrs: FsrsOptions,
    pub sm2: Sm2Options,
    #[cfg_attr(feature = "serde", serde(default = "LadderOptions::leitner"))]
    pub leitner: LadderOptions,
    #[cfg_attr(feature = "serde", serde(default = "LadderOptions::pimsleur"))]
    pub pimsleur: LadderOptions,
    pub ebisu: EbisuOptions,
}

impl Default for SrsOptions {
    fn default() -> SrsOptions {
        SrsOptions {
            anki: AnkiOptions::default(),
            fsrs: FsrsOptions::default(),
            sm2: Sm2Options::default(),
            leitner: LadderOptions::leitner(),
            pimsleur: LadderOptions::pimsleur(),
            ebisu: EbisuOptions::default(),
        }
    }
}
