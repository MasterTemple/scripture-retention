import type { ReactNode } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// The pieces Settings is built of

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="px-5 py-3">
      <h3 className="pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      <div className="divide-y">{children}</div>
    </section>
  );
}

export function Row({ title, description, children, htmlFor }: { title: string; description?: ReactNode; children: ReactNode; htmlFor?: string }) {
  const Text = htmlFor ? Label : "div";
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <Text htmlFor={htmlFor} className="block min-w-0 space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        {description && <span className="block text-xs leading-snug font-normal text-muted-foreground">{description}</span>}
      </Text>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Stepper({ value, min, max, step, format, onChange, width = "w-14" }: { value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number) => void; width?: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="size-10 sm:size-8" disabled={value <= min + 1e-9} onClick={() => onChange(value - step)} aria-label="Less">
        <MinusIcon />
      </Button>
      <span className={cn("text-center text-sm font-medium whitespace-nowrap tabular-nums", width)}>{format(value)}</span>
      <Button variant="outline" size="icon" className="size-10 sm:size-8" disabled={value >= max - 1e-9} onClick={() => onChange(value + step)} aria-label="More">
        <PlusIcon />
      </Button>
    </div>
  );
}
