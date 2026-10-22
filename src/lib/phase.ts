import type { Phase } from "@/core/schedule";

/** Each phase's color, as text, a soft fill, and a dot */
export const PHASE_STYLE: Record<Phase, { text: string; soft: string; dot: string }> = {
  daily: { text: "text-daily", soft: "bg-daily/12 text-daily", dot: "bg-daily" },
  weekly: { text: "text-weekly", soft: "bg-weekly/12 text-weekly", dot: "bg-weekly" },
  monthly: { text: "text-monthly", soft: "bg-monthly/12 text-monthly", dot: "bg-monthly" },
  upcoming: { text: "text-muted-foreground", soft: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
  retained: { text: "text-success", soft: "bg-success-soft text-success", dot: "bg-success" },
};
