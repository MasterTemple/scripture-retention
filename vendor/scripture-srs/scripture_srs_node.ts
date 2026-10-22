import { BoltFFICancelledError, BoltFFIHandle, BoltFFIModule, CallbackRegistry, StreamCancellable, StreamSession, WASM_ABI_VERSION, instantiateBoltFFISync, matchWireResult, utf8ByteCount, wireArraySize, wireMapSize, wireOptionalSize, wireResultSize, wireStringSize, writeUnexpectedCallbackError } from "@boltffi/runtime";
import type { BoltFFIExports, Duration, WireCodec, WireResult } from "@boltffi/runtime";
import { wasmBindgen as _wasmBindgen } from "./scripture_srs_imports.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const _thisDir = dirname(fileURLToPath(import.meta.url));
const _wasmPath = join(_thisDir, "scripture_srs_bg.wasm");
const _callbackImports: Record<string, WebAssembly.ImportValue> = {};



export interface VerseRecord {
  readonly id: string;
  readonly tag: string;
  readonly reference: string;
  readonly start: string;
  readonly last: string | null;
  readonly log: Array<LogItem>;
  readonly deck: string | null;
  readonly passage: string | null;
  readonly paused: string | null;
}


const VerseRecordCodec: WireCodec<VerseRecord> = {
  size: (value) => ((((((((wireStringSize(value.id) + wireStringSize(value.tag)) + wireStringSize(value.reference)) + wireStringSize(value.start)) + wireOptionalSize(value.last, (__boltffiValue0) => wireStringSize(__boltffiValue0))) + wireArraySize(value.log, (__boltffiValue0) => LogItemCodec.size(__boltffiValue0))) + wireOptionalSize(value.deck, (__boltffiValue0) => wireStringSize(__boltffiValue0))) + wireOptionalSize(value.passage, (__boltffiValue0) => wireStringSize(__boltffiValue0))) + wireOptionalSize(value.paused, (__boltffiValue0) => wireStringSize(__boltffiValue0))),
  encode: (writer, value) => {
    writer.writeString(value.id);
    writer.writeString(value.tag);
    writer.writeString(value.reference);
    writer.writeString(value.start);
    writer.writeOptional(value.last, (__boltffiValue0) => {
  writer.writeString(__boltffiValue0);
});
    writer.writeArray(value.log, (__boltffiValue0) => {
  LogItemCodec.encode(writer, __boltffiValue0);
});
    writer.writeOptional(value.deck, (__boltffiValue0) => {
  writer.writeString(__boltffiValue0);
});
    writer.writeOptional(value.passage, (__boltffiValue0) => {
  writer.writeString(__boltffiValue0);
});
    writer.writeOptional(value.paused, (__boltffiValue0) => {
  writer.writeString(__boltffiValue0);
});
  },
  decode: (reader) => {
    const id = reader.readString();
    const tag = reader.readString();
    const reference = reader.readString();
    const start = reader.readString();
    const last = reader.readOptional(() => reader.readString());
    const log = reader.readArray(() => LogItemCodec.decode(reader));
    const deck = reader.readOptional(() => reader.readString());
    const passage = reader.readOptional(() => reader.readString());
    const paused = reader.readOptional(() => reader.readString());
    return {
      id: id,
      tag: tag,
      reference: reference,
      start: start,
      last: last,
      log: log,
      deck: deck,
      passage: passage,
      paused: paused,
    };
  },
};



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


const VerseStatusCodec: WireCodec<VerseStatus> = {
  size: (value) => (((((((((4 + 4) + 4) + wireOptionalSize(value.scheduled, (__boltffiValue0) => wireStringSize(__boltffiValue0))) + 1) + wireOptionalSize(value.next, (__boltffiValue0) => wireStringSize(__boltffiValue0))) + wireOptionalSize(value.interval, (__boltffiValue0) => 4)) + 1) + 1) + wireStringSize(value.description)),
  encode: (writer, value) => {
    PhaseCodec.encode(writer, value.phase);
    writer.writeU32(value.position);
    writer.writeU32(value.total);
    writer.writeOptional(value.scheduled, (__boltffiValue0) => {
  writer.writeString(__boltffiValue0);
});
    writer.writeBool(value.due);
    writer.writeOptional(value.next, (__boltffiValue0) => {
  writer.writeString(__boltffiValue0);
});
    writer.writeOptional(value.interval, (__boltffiValue0) => {
  writer.writeU32(__boltffiValue0);
});
    writer.writeBool(value.learning);
    writer.writeBool(value.fresh);
    writer.writeString(value.description);
  },
  decode: (reader) => {
    const phase = PhaseCodec.decode(reader);
    const position = reader.readU32();
    const total = reader.readU32();
    const scheduled = reader.readOptional(() => reader.readString());
    const due = reader.readBool();
    const next = reader.readOptional(() => reader.readString());
    const interval = reader.readOptional(() => reader.readU32());
    const learning = reader.readBool();
    const fresh = reader.readBool();
    const description = reader.readString();
    return {
      phase: phase,
      position: position,
      total: total,
      scheduled: scheduled,
      due: due,
      next: next,
      interval: interval,
      learning: learning,
      fresh: fresh,
      description: description,
    };
  },
};



export interface GradeOption {
  readonly grade: Grade;
  readonly label: string;
  readonly days: number;
}


const GradeOptionCodec: WireCodec<GradeOption> = {
  size: (value) => ((4 + wireStringSize(value.label)) + 4),
  encode: (writer, value) => {
    GradeCodec.encode(writer, value.grade);
    writer.writeString(value.label);
    writer.writeU32(value.days);
  },
  decode: (reader) => {
    const grade = GradeCodec.decode(reader);
    const label = reader.readString();
    const days = reader.readU32();
    return {
      grade: grade,
      label: label,
      days: days,
    };
  },
};



export interface MemoryItem {
  readonly label: string;
  readonly value: string;
}


const MemoryItemCodec: WireCodec<MemoryItem> = {
  size: (value) => (wireStringSize(value.label) + wireStringSize(value.value)),
  encode: (writer, value) => {
    writer.writeString(value.label);
    writer.writeString(value.value);
  },
  decode: (reader) => {
    const label = reader.readString();
    const value = reader.readString();
    return {
      label: label,
      value: value,
    };
  },
};



export interface AlgorithmInfo {
  readonly algorithm: Algorithm;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly grades: Array<Grade>;
  readonly adaptive: boolean;
}


const AlgorithmInfoCodec: WireCodec<AlgorithmInfo> = {
  size: (value) => (((((4 + wireStringSize(value.key)) + wireStringSize(value.name)) + wireStringSize(value.description)) + wireArraySize(value.grades, (__boltffiValue0) => 4)) + 1),
  encode: (writer, value) => {
    AlgorithmCodec.encode(writer, value.algorithm);
    writer.writeString(value.key);
    writer.writeString(value.name);
    writer.writeString(value.description);
    writer.writeArray(value.grades, (__boltffiValue0) => {
  GradeCodec.encode(writer, __boltffiValue0);
});
    writer.writeBool(value.adaptive);
  },
  decode: (reader) => {
    const algorithm = AlgorithmCodec.decode(reader);
    const key = reader.readString();
    const name = reader.readString();
    const description = reader.readString();
    const grades = reader.readArray(() => GradeCodec.decode(reader));
    const adaptive = reader.readBool();
    return {
      algorithm: algorithm,
      key: key,
      name: name,
      description: description,
      grades: grades,
      adaptive: adaptive,
    };
  },
};



export interface FsrsFit {
  readonly params: Array<number> | Float64Array;
  readonly reviews: number;
  readonly verses: number;
}


const FsrsFitCodec: WireCodec<FsrsFit> = {
  size: (value) => (((4 + (value.params.length * 8)) + 4) + 4),
  encode: (writer, value) => {
    writer.writeArray(value.params, (__boltffiValue0) => {
  writer.writeF64(__boltffiValue0);
});
    writer.writeU32(value.reviews);
    writer.writeU32(value.verses);
  },
  decode: (reader) => {
    const params = reader.readF64Array();
    const reviews = reader.readU32();
    const verses = reader.readU32();
    return {
      params: params,
      reviews: reviews,
      verses: verses,
    };
  },
};



export interface Durations {
  readonly dailyWeeks: number;
  readonly weeklyMonths: number;
  readonly monthlyYears: number;
}


const DurationsCodec: WireCodec<Durations> = {
  size: (value) => 12,
  encode: (writer, value) => {
    writer.writeU32(value.dailyWeeks);
    writer.writeU32(value.weeklyMonths);
    writer.writeU32(value.monthlyYears);
  },
  decode: (reader) => {
    const dailyWeeks = reader.readU32();
    const weeklyMonths = reader.readU32();
    const monthlyYears = reader.readU32();
    return {
      dailyWeeks: dailyWeeks,
      weeklyMonths: weeklyMonths,
      monthlyYears: monthlyYears,
    };
  },
};



export type Grade =
  | 0
  | 1
  | 2
  | 3;


export const Grade = {
  Again: 0,
  Hard: 1,
  Good: 2,
  Easy: 3,
} as const;



const GradeCodec: WireCodec<Grade> = {
  size: () => 4,
  encode: (writer, value) => {
    writer.writeI32(value);
  },
  decode: (reader) => {
    const value = reader.readI32();
    switch (value) {
      case 0: return Grade.Again;
      case 1: return Grade.Hard;
      case 2: return Grade.Good;
      case 3: return Grade.Easy;
      default: throw new Error(`Unknown Grade wire tag: ${value}`);
    }
  },
};

export type Algorithm =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6;


export const Algorithm = {
  Fixed: 0,
  Fsrs: 1,
  Anki: 2,
  Sm2: 3,
  Leitner: 4,
  Pimsleur: 5,
  Ebisu: 6,
} as const;



const AlgorithmCodec: WireCodec<Algorithm> = {
  size: () => 4,
  encode: (writer, value) => {
    writer.writeI32(value);
  },
  decode: (reader) => {
    const value = reader.readI32();
    switch (value) {
      case 0: return Algorithm.Fixed;
      case 1: return Algorithm.Fsrs;
      case 2: return Algorithm.Anki;
      case 3: return Algorithm.Sm2;
      case 4: return Algorithm.Leitner;
      case 5: return Algorithm.Pimsleur;
      case 6: return Algorithm.Ebisu;
      default: throw new Error(`Unknown Algorithm wire tag: ${value}`);
    }
  },
};

export type Phase =
  | 0
  | 1
  | 2
  | 3
  | 4;


export const Phase = {
  Daily: 0,
  Weekly: 1,
  Monthly: 2,
  Upcoming: 3,
  Retained: 4,
} as const;



const PhaseCodec: WireCodec<Phase> = {
  size: () => 4,
  encode: (writer, value) => {
    writer.writeI32(value);
  },
  decode: (reader) => {
    const value = reader.readI32();
    switch (value) {
      case 0: return Phase.Daily;
      case 1: return Phase.Weekly;
      case 2: return Phase.Monthly;
      case 3: return Phase.Upcoming;
      case 4: return Phase.Retained;
      default: throw new Error(`Unknown Phase wire tag: ${value}`);
    }
  },
};

export type LogItem =
  | { readonly tag: "Review"; readonly day: string; readonly grade: Grade }
  | { readonly tag: "Place"; readonly day: string; readonly days: number };




const LogItemCodec: WireCodec<LogItem> = {
  size: (value) => {
    switch (value.tag) {
      case "Review": return ((4 + wireStringSize(value.day)) + 4);
      case "Place": return ((4 + wireStringSize(value.day)) + 4);
    }
  },
  encode: (writer, value) => {
    switch (value.tag) {
      case "Review":
        writer.writeI32(0);
        writer.writeString(value.day);
        GradeCodec.encode(writer, value.grade);
        break;
      case "Place":
        writer.writeI32(1);
        writer.writeString(value.day);
        writer.writeU32(value.days);
        break;
    }
  },
  decode: (reader) => {
    const tag = reader.readI32();
    switch (tag) {
      case 0: return { tag: "Review", day: reader.readString(), grade: GradeCodec.decode(reader) };
      case 1: return { tag: "Place", day: reader.readString(), days: reader.readU32() };
      default: throw new Error(`Unknown LogItem wire tag: ${tag}`);
    }
  },
};

export type SrsError =
  | { readonly tag: "InvalidDay"; readonly message: string }
  | { readonly tag: "InvalidVerse"; readonly message: string }
  | { readonly tag: "InvalidOptions"; readonly message: string }
  | { readonly tag: "Training"; readonly message: string };




export class SrsErrorException extends Error {
  constructor(public readonly value: SrsError) {
    super(value.message);
    this.name = "SrsErrorException";
  }
}

const SrsErrorCodec: WireCodec<SrsError> = {
  size: (value) => {
    switch (value.tag) {
      case "InvalidDay": return (4 + wireStringSize(value.message));
      case "InvalidVerse": return (4 + wireStringSize(value.message));
      case "InvalidOptions": return (4 + wireStringSize(value.message));
      case "Training": return (4 + wireStringSize(value.message));
    }
  },
  encode: (writer, value) => {
    switch (value.tag) {
      case "InvalidDay":
        writer.writeI32(0);
        writer.writeString(value.message);
        break;
      case "InvalidVerse":
        writer.writeI32(1);
        writer.writeString(value.message);
        break;
      case "InvalidOptions":
        writer.writeI32(2);
        writer.writeString(value.message);
        break;
      case "Training":
        writer.writeI32(3);
        writer.writeString(value.message);
        break;
    }
  },
  decode: (reader) => {
    const tag = reader.readI32();
    switch (tag) {
      case 0: return { tag: "InvalidDay", message: reader.readString() };
      case 1: return { tag: "InvalidVerse", message: reader.readString() };
      case 2: return { tag: "InvalidOptions", message: reader.readString() };
      case 3: return { tag: "Training", message: reader.readString() };
      default: throw new Error(`Unknown SrsError wire tag: ${tag}`);
    }
  },
};const _ScriptureSrsFinalizer: FinalizationRegistry<number> | null =
  typeof FinalizationRegistry === "undefined"
    ? null
    : new FinalizationRegistry<number>((handle) => {
        (_exports.boltffi_release_class_scripture_srs_ffi_scripture_srs as Function)(handle);
      });

export class ScriptureSrs extends BoltFFIHandle {
  protected static override _typeName = "ScriptureSrs";

  private constructor(handle: number) {
    super(handle);
    _ScriptureSrsFinalizer?.register(this, handle, this);
  }

  protected override _release(handle: number): void {
    (_exports.boltffi_release_class_scripture_srs_ffi_scripture_srs as Function)(handle);
  }

  protected override _unregister(): void {
    _ScriptureSrsFinalizer?.unregister(this);
  }

  static _fromHandle(handle: number): ScriptureSrs {
    if (handle === 0) {
      throw new Error("ScriptureSrs received a null handle");
    }
    return new ScriptureSrs(handle);
  }


  static new(): ScriptureSrs {
  return ScriptureSrs._fromHandle((_exports.boltffi_init_class_scripture_srs_ffi_scripture_srs_new as Function)());
}

  version(): string {
  this._assertNotDisposed();
  return _module.takePackedUtf8String((_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_version as Function)(this._handle) as bigint);
}

  scheduler(): SrsScheduler {
  this._assertNotDisposed();
  return SrsScheduler._fromHandle((_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_scheduler as Function)(this._handle));
}

  schedulerFromJson(json: string): SrsScheduler {
  this._assertNotDisposed();
  const __boltffi_json_allocation = _module.allocOwnedString(json);
  const __boltffiReturnWriter = _module.allocWriter(4);
  try {
  const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_scheduler_from_json as Function)(this._handle, __boltffi_json_allocation.ptr, __boltffi_json_allocation.len, __boltffiReturnWriter.ptr) as bigint;
  if (__boltffiError !== 0n) {
    const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
    throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
  }
  const __boltffiReturnHandle = _module.readerFromWriter(__boltffiReturnWriter).readU32();
  return SrsScheduler._fromHandle(__boltffiReturnHandle);
} finally {
  _module.freeWriter(__boltffiReturnWriter);
}
}

  algorithms(): Array<AlgorithmInfo> {
  this._assertNotDisposed();
  return _module.readPackedBuffer((_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_algorithms as Function)(this._handle) as bigint, (__boltffiReader) => __boltffiReader.readArray(() => AlgorithmInfoCodec.decode(__boltffiReader)));
}

  readVerses(json: string): Array<VerseRecord> {
  this._assertNotDisposed();
  const __boltffi_json_allocation = _module.allocOwnedString(json);
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
  const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_read_verses as Function)(this._handle, __boltffi_json_allocation.ptr, __boltffi_json_allocation.len, __boltffiReturnWriter.ptr) as bigint;
  if (__boltffiError !== 0n) {
    const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
    throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
  }
  const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
  return __boltffiReader.readArray(() => VerseRecordCodec.decode(__boltffiReader));
} finally {
  _module.freeWriter(__boltffiReturnWriter);
}
}

  writeVerses(verses: Array<VerseRecord>): string {
  this._assertNotDisposed();
  const __boltffi_verses_writer = _module.allocWriter(wireArraySize(verses, (__boltffiValue0) => VerseRecordCodec.size(__boltffiValue0)));
  __boltffi_verses_writer.writeArray(verses, (__boltffiValue0) => {
  VerseRecordCodec.encode(__boltffi_verses_writer, __boltffiValue0);
});
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_write_verses as Function)(this._handle, __boltffi_verses_writer.ptr, __boltffi_verses_writer.len, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    return _module.takePackedUtf8String(_module.readerFromWriter(__boltffiReturnWriter).readU64());
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verses_writer);
}
}

  optimizeFsrs(verses: Array<VerseRecord>): FsrsFit {
  this._assertNotDisposed();
  const __boltffi_verses_writer = _module.allocWriter(wireArraySize(verses, (__boltffiValue0) => VerseRecordCodec.size(__boltffiValue0)));
  __boltffi_verses_writer.writeArray(verses, (__boltffiValue0) => {
  VerseRecordCodec.encode(__boltffi_verses_writer, __boltffiValue0);
});
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_optimize_fsrs as Function)(this._handle, __boltffi_verses_writer.ptr, __boltffi_verses_writer.len, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
    return FsrsFitCodec.decode(__boltffiReader);
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verses_writer);
}
}

  parseSteps(text: string): Array<number> | Float64Array {
  this._assertNotDisposed();
  const __boltffi_text_allocation = _module.allocOwnedString(text);
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
  const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_parse_steps as Function)(this._handle, __boltffi_text_allocation.ptr, __boltffi_text_allocation.len, __boltffiReturnWriter.ptr) as bigint;
  if (__boltffiError !== 0n) {
    const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
    throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
  }
  const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
  return __boltffiReader.readF64Array();
} finally {
  _module.freeWriter(__boltffiReturnWriter);
}
}

  formatInterval(days: number, stepMinutes: number | null): string {
  this._assertNotDisposed();
  return _module.takePackedUtf8String((_exports.boltffi_method_class_scripture_srs_ffi_scripture_srs_format_interval as Function)(this._handle, days, _module.packOptionF64Bits(stepMinutes)) as bigint);
}
}
const _SrsSchedulerFinalizer: FinalizationRegistry<number> | null =
  typeof FinalizationRegistry === "undefined"
    ? null
    : new FinalizationRegistry<number>((handle) => {
        (_exports.boltffi_release_class_scripture_srs_ffi_srs_scheduler as Function)(handle);
      });

export class SrsScheduler extends BoltFFIHandle {
  protected static override _typeName = "SrsScheduler";

  private constructor(handle: number) {
    super(handle);
    _SrsSchedulerFinalizer?.register(this, handle, this);
  }

  protected override _release(handle: number): void {
    (_exports.boltffi_release_class_scripture_srs_ffi_srs_scheduler as Function)(handle);
  }

  protected override _unregister(): void {
    _SrsSchedulerFinalizer?.unregister(this);
  }

  static _fromHandle(handle: number): SrsScheduler {
    if (handle === 0) {
      throw new Error("SrsScheduler received a null handle");
    }
    return new SrsScheduler(handle);
  }


  static create(): SrsScheduler {
  return SrsScheduler._fromHandle((_exports.boltffi_init_class_scripture_srs_ffi_srs_scheduler_create as Function)());
}

  withAlgorithm(algorithm: Algorithm): SrsScheduler {
  this._assertNotDisposed();
  return SrsScheduler._fromHandle((_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_with_algorithm as Function)(this._handle, algorithm));
}

  algorithm(): Algorithm {
  this._assertNotDisposed();
  return (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_algorithm as Function)(this._handle);
}

  withDurations(durations: Durations): SrsScheduler {
  this._assertNotDisposed();
  const __boltffi_durations_writer = _module.allocWriter(DurationsCodec.size(durations));
  DurationsCodec.encode(__boltffi_durations_writer, durations);
  try {
  return SrsScheduler._fromHandle((_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_with_durations as Function)(this._handle, __boltffi_durations_writer.ptr));
} finally {
  _module.freeWriter(__boltffi_durations_writer);
}
}

  withDesiredRetention(retention: number): SrsScheduler {
  this._assertNotDisposed();
  return SrsScheduler._fromHandle((_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_with_desired_retention as Function)(this._handle, retention));
}

  withFsrsParams(params: string): SrsScheduler {
  this._assertNotDisposed();
  const __boltffi_params_allocation = _module.allocOwnedString(params);
  const __boltffiReturnWriter = _module.allocWriter(4);
  try {
  const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_with_fsrs_params as Function)(this._handle, __boltffi_params_allocation.ptr, __boltffi_params_allocation.len, __boltffiReturnWriter.ptr) as bigint;
  if (__boltffiError !== 0n) {
    const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
    throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
  }
  const __boltffiReturnHandle = _module.readerFromWriter(__boltffiReturnWriter).readU32();
  return SrsScheduler._fromHandle(__boltffiReturnHandle);
} finally {
  _module.freeWriter(__boltffiReturnWriter);
}
}

  withJson(json: string): SrsScheduler {
  this._assertNotDisposed();
  const __boltffi_json_allocation = _module.allocOwnedString(json);
  const __boltffiReturnWriter = _module.allocWriter(4);
  try {
  const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_with_json as Function)(this._handle, __boltffi_json_allocation.ptr, __boltffi_json_allocation.len, __boltffiReturnWriter.ptr) as bigint;
  if (__boltffiError !== 0n) {
    const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
    throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
  }
  const __boltffiReturnHandle = _module.readerFromWriter(__boltffiReturnWriter).readU32();
  return SrsScheduler._fromHandle(__boltffiReturnHandle);
} finally {
  _module.freeWriter(__boltffiReturnWriter);
}
}

  toJson(): string {
  this._assertNotDisposed();
  return _module.takePackedUtf8String((_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_to_json as Function)(this._handle) as bigint);
}

  grades(): Array<Grade> {
  this._assertNotDisposed();
  return _module.readPackedBuffer((_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_grades as Function)(this._handle) as bigint, (__boltffiReader) => __boltffiReader.readArray(() => GradeCodec.decode(__boltffiReader)));
}

  status(verse: VerseRecord, day: string): VerseStatus {
  this._assertNotDisposed();
  const __boltffi_verse_writer = _module.allocWriter(VerseRecordCodec.size(verse));
  VerseRecordCodec.encode(__boltffi_verse_writer, verse);
  const __boltffi_day_allocation = _module.allocOwnedString(day);
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_status as Function)(this._handle, __boltffi_verse_writer.ptr, __boltffi_verse_writer.len, __boltffi_day_allocation.ptr, __boltffi_day_allocation.len, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
    return VerseStatusCodec.decode(__boltffiReader);
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verse_writer);
}
}

  preview(verse: VerseRecord, day: string): Array<GradeOption> {
  this._assertNotDisposed();
  const __boltffi_verse_writer = _module.allocWriter(VerseRecordCodec.size(verse));
  VerseRecordCodec.encode(__boltffi_verse_writer, verse);
  const __boltffi_day_allocation = _module.allocOwnedString(day);
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_preview as Function)(this._handle, __boltffi_verse_writer.ptr, __boltffi_verse_writer.len, __boltffi_day_allocation.ptr, __boltffi_day_allocation.len, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
    return __boltffiReader.readArray(() => GradeOptionCodec.decode(__boltffiReader));
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verse_writer);
}
}

  memory(verse: VerseRecord, day: string): Array<MemoryItem> {
  this._assertNotDisposed();
  const __boltffi_verse_writer = _module.allocWriter(VerseRecordCodec.size(verse));
  VerseRecordCodec.encode(__boltffi_verse_writer, verse);
  const __boltffi_day_allocation = _module.allocOwnedString(day);
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_memory as Function)(this._handle, __boltffi_verse_writer.ptr, __boltffi_verse_writer.len, __boltffi_day_allocation.ptr, __boltffi_day_allocation.len, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
    return __boltffiReader.readArray(() => MemoryItemCodec.decode(__boltffiReader));
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verse_writer);
}
}

  due(verses: Array<VerseRecord>, day: string): Array<VerseRecord> {
  this._assertNotDisposed();
  const __boltffi_verses_writer = _module.allocWriter(wireArraySize(verses, (__boltffiValue0) => VerseRecordCodec.size(__boltffiValue0)));
  __boltffi_verses_writer.writeArray(verses, (__boltffiValue0) => {
  VerseRecordCodec.encode(__boltffi_verses_writer, __boltffiValue0);
});
  const __boltffi_day_allocation = _module.allocOwnedString(day);
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_due as Function)(this._handle, __boltffi_verses_writer.ptr, __boltffi_verses_writer.len, __boltffi_day_allocation.ptr, __boltffi_day_allocation.len, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
    return __boltffiReader.readArray(() => VerseRecordCodec.decode(__boltffiReader));
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verses_writer);
}
}

  review(verse: VerseRecord, grade: Grade, day: string): VerseRecord {
  this._assertNotDisposed();
  const __boltffi_verse_writer = _module.allocWriter(VerseRecordCodec.size(verse));
  VerseRecordCodec.encode(__boltffi_verse_writer, verse);
  const __boltffi_day_allocation = _module.allocOwnedString(day);
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_review as Function)(this._handle, __boltffi_verse_writer.ptr, __boltffi_verse_writer.len, grade, __boltffi_day_allocation.ptr, __boltffi_day_allocation.len, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
    return VerseRecordCodec.decode(__boltffiReader);
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verse_writer);
}
}

  reschedule(verse: VerseRecord, days: number, day: string, reviewed: boolean): VerseRecord {
  this._assertNotDisposed();
  const __boltffi_verse_writer = _module.allocWriter(VerseRecordCodec.size(verse));
  VerseRecordCodec.encode(__boltffi_verse_writer, verse);
  const __boltffi_day_allocation = _module.allocOwnedString(day);
  try {
  const __boltffiReturnWriter = _module.allocWriter(8);
  try {
    const __boltffiError = (_exports.boltffi_method_class_scripture_srs_ffi_srs_scheduler_reschedule as Function)(this._handle, __boltffi_verse_writer.ptr, __boltffi_verse_writer.len, days, __boltffi_day_allocation.ptr, __boltffi_day_allocation.len, reviewed, __boltffiReturnWriter.ptr) as bigint;
    if (__boltffiError !== 0n) {
      const __boltffiErrorReader = _module.takePackedBuffer(__boltffiError);
      throw new SrsErrorException(SrsErrorCodec.decode(__boltffiErrorReader));
    }
    const __boltffiReader = _module.takePackedBuffer(_module.readerFromWriter(__boltffiReturnWriter).readU64());
    return VerseRecordCodec.decode(__boltffiReader);
  } finally {
    _module.freeWriter(__boltffiReturnWriter);
  }
} finally {
  _module.freeWriter(__boltffi_verse_writer);
}
}
}


const _wasmBytes = readFileSync(_wasmPath);
let _module: BoltFFIModule;
let _exports: BoltFFIExports;
instantiateBoltFFISync(_wasmBytes, WASM_ABI_VERSION, {
  env: _callbackImports,
  wasmBindgen: _wasmBindgen,
  bind(module) {
    _module = module;
    _exports = module.exports;
  },
});


export const initialized = Promise.resolve();
export default function init(): Promise<void> { return initialized; }

// Lower-level counterpart to `options.signal` / `options.cancelId`.
// `callId` must be unique among in-flight calls -- see AsyncFutureManager.cancelById.
export function __boltffiCancelById(callId: number): void {
  _module.asyncManager.cancelById(callId);
}