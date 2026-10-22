import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent } from "@/components/ui/overlays";
import type { Day } from "@/core/dates";
import type { Verse } from "@/core/schedule";
import { moveCurrent } from "@/state/review";
import { closePanel } from "@/state/ui";
import { PositionPicker, StartSummary } from "./PositionPicker";

/** Moves the verse being reviewed into another bucket, at a position in it (counted as reviewed today) */
export function MoveDialog({ verse, day }: { verse: Verse; day: Day }) {
  const [start, setStart] = useState(verse.start);
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
        <PositionPicker start={start} day={day} onChange={setStart} />
        <StartSummary start={start} day={day} />
      </div>
    </DialogContent>
  );
}
