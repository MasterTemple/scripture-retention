import { BoltFFIHandle } from "@boltffi/runtime";
export interface VerseRecord {
    readonly id: string;
    readonly tag: string;
    readonly reference: string;
    readonly start: string;
    readonly last: string | null;
    readonly log: Array<LogItem>;
}
export interface VerseStatus {
    readonly phase: Phase;
    readonly position: number;
    readonly total: number;
    readonly scheduled: string | null;
    readonly due: boolean;
    readonly next: string | null;
    readonly interval: number | null;
    readonly learning: boolean;
    readonly fresh: boolean;
    readonly description: string;
}
export interface GradeOption {
    readonly grade: Grade;
    readonly label: string;
    readonly days: number;
}
export interface MemoryItem {
    readonly label: string;
    readonly value: string;
}
export interface AlgorithmInfo {
    readonly algorithm: Algorithm;
    readonly key: string;
    readonly name: string;
    readonly description: string;
    readonly grades: Array<Grade>;
    readonly adaptive: boolean;
}
export interface FsrsFit {
    readonly params: Array<number> | Float64Array;
    readonly reviews: number;
    readonly verses: number;
}
export interface Durations {
    readonly dailyWeeks: number;
    readonly weeklyMonths: number;
    readonly monthlyYears: number;
}
export type Grade = 0 | 1 | 2 | 3;
export declare const Grade: {
    readonly Again: 0;
    readonly Hard: 1;
    readonly Good: 2;
    readonly Easy: 3;
};
export type Algorithm = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export declare const Algorithm: {
    readonly Fixed: 0;
    readonly Fsrs: 1;
    readonly Anki: 2;
    readonly Sm2: 3;
    readonly Leitner: 4;
    readonly Pimsleur: 5;
    readonly Ebisu: 6;
};
export type Phase = 0 | 1 | 2 | 3 | 4;
export declare const Phase: {
    readonly Daily: 0;
    readonly Weekly: 1;
    readonly Monthly: 2;
    readonly Upcoming: 3;
    readonly Retained: 4;
};
export type LogItem = {
    readonly tag: "Review";
    readonly day: string;
    readonly grade: Grade;
} | {
    readonly tag: "Place";
    readonly day: string;
    readonly days: number;
};
export type SrsError = {
    readonly tag: "InvalidDay";
    readonly message: string;
} | {
    readonly tag: "InvalidVerse";
    readonly message: string;
} | {
    readonly tag: "InvalidOptions";
    readonly message: string;
} | {
    readonly tag: "Training";
    readonly message: string;
};
export declare class SrsErrorException extends Error {
    readonly value: SrsError;
    constructor(value: SrsError);
}
export declare class ScriptureSrs extends BoltFFIHandle {
    protected static _typeName: string;
    private constructor();
    protected _release(handle: number): void;
    protected _unregister(): void;
    static _fromHandle(handle: number): ScriptureSrs;
    static new(): ScriptureSrs;
    version(): string;
    scheduler(): SrsScheduler;
    schedulerFromJson(json: string): SrsScheduler;
    algorithms(): Array<AlgorithmInfo>;
    readVerses(json: string): Array<VerseRecord>;
    writeVerses(verses: Array<VerseRecord>): string;
    optimizeFsrs(verses: Array<VerseRecord>): FsrsFit;
    parseSteps(text: string): Array<number> | Float64Array;
    formatInterval(days: number, stepMinutes: number | null): string;
}
export declare class SrsScheduler extends BoltFFIHandle {
    protected static _typeName: string;
    private constructor();
    protected _release(handle: number): void;
    protected _unregister(): void;
    static _fromHandle(handle: number): SrsScheduler;
    static create(): SrsScheduler;
    withAlgorithm(algorithm: Algorithm): SrsScheduler;
    algorithm(): Algorithm;
    withDurations(durations: Durations): SrsScheduler;
    withDesiredRetention(retention: number): SrsScheduler;
    withFsrsParams(params: string): SrsScheduler;
    withJson(json: string): SrsScheduler;
    toJson(): string;
    grades(): Array<Grade>;
    status(verse: VerseRecord, day: string): VerseStatus;
    preview(verse: VerseRecord, day: string): Array<GradeOption>;
    memory(verse: VerseRecord, day: string): Array<MemoryItem>;
    due(verses: Array<VerseRecord>, day: string): Array<VerseRecord>;
    review(verse: VerseRecord, grade: Grade, day: string): VerseRecord;
    reschedule(verse: VerseRecord, days: number, day: string, reviewed: boolean): VerseRecord;
}
export declare const initialized: Promise<void>;
export default function init(): Promise<void>;
export declare function __boltffiCancelById(callId: number): void;
