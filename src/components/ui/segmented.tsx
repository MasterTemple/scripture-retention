import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A row of mutually exclusive choices */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("inline-flex items-center gap-0.5 rounded-xl bg-muted p-1 sm:rounded-lg sm:p-0.5", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap sm:rounded-md text-muted-foreground transition-all outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-4",
            size === "sm" ? "h-9 px-3 text-sm sm:h-7 sm:px-2.5 sm:text-xs" : "h-10 px-3 text-sm sm:h-8",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
