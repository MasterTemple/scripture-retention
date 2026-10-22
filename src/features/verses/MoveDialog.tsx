import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent } from "@/components/ui/overlays";
import type { Day } from "@/core/dates";
import type { Verse } from "@/core/schedule";
import { isAdaptive, verseStatus } from "@/core/srs";
import { moveCurrent, rescheduleCurrent } from "@/state/review";
import { schedulersNow, useSchedulers } from "@/state/store";
import { closePanel } from "@/state/ui";
import { IntervalPicker } from "./AdaptiveSchedule";
import { PositionPicker, StartSummary } from "./PositionPicker";

/**
 * Moves the verse being reviewed (counted as reviewed today): into another bucket, at a position
 * in it, or (under an adaptive algorithm) to come back in so many days
 */
export function MoveDialog({ verse, day }: { verse: Verse; day: Day }) {
  const adaptive = isAdaptive(useSchedulers()(verse).algorithm);
  return adaptive ? <RescheduleDialog verse={verse} day={day} /> : <FixedMoveDialog verse={verse} day={day} />;
}

function FixedMoveDialog({ verse, day }: { verse: Verse; day: Day }) {
  const [start, setStart] = useState(verse.start);
  const durations = useSchedulers()(verse).durations;
  return (
    <DialogContent
      title={`Move ${verse.ref}`}
      description="Where should it be today? It counts as reviewed."
      onOpenAutoFocus={(e) => e.preventDefault()}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              moveCurrent(start, day);
              closePanel();
            }}
          >
            Move
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <PositionPicker start={start} day={day} onChange={setStart} durations={durations} />
        <StartSummary start={start} day={day} durations={durations} />
      </div>
    </DialogContent>
  );
}

function RescheduleDialog({ verse, day }: { verse: Verse; day: Day }) {
  const [days, setDays] = useState(() => Math.max(1, verseStatus(verse, day, schedulersNow()(verse)).interval ?? 1));
  return (
    <DialogContent
      title={`Reschedule ${verse.ref}`}
      description="When should it come back? It counts as reviewed, and the algorithm goes on from there."
      onOpenAutoFocus={(e) => e.preventDefault()}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              rescheduleCurrent(days, day);
              closePanel();
            }}
          >
            Reschedule
          </Button>
        </>
      }
    >
      <div className="px-5 py-4">
        <IntervalPicker days={days} day={day} onChange={setDays} />
      </div>
    </DialogContent>
  );
}
