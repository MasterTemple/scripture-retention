import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * A dialog: a sheet rising from the bottom on a phone, in reach of a thumb, kept above the
 * keyboard and no taller than what it leaves showing (`--keyboard`, `--viewport-h`, from
 * lib/keyboard.ts), and a centered panel on wider screens. `footer` stays in view under the
 * content as it scrolls.
 */
export function DialogContent({
  className,
  children,
  title,
  description,
  footer,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: ReactNode; description?: ReactNode; footer?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[fade-up_0.2s_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border bg-popover text-popover-foreground shadow-2xl outline-none",
          // Phones: a bottom sheet
          "inset-x-0 bottom-[var(--keyboard,0px)] max-h-[calc(var(--viewport-h,100dvh)-env(safe-area-inset-top)-0.75rem)] rounded-t-2xl border-b-0 data-[state=open]:animate-[sheet-up_0.25s_cubic-bezier(0.2,0.9,0.3,1)]",
          // Wider: centered
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[min(90dvh,760px)] sm:w-[calc(100%-1.5rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border-b sm:data-[state=open]:animate-pop",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 border-b px-5 pt-3 pb-3.5 sm:py-4">
          <div className="min-w-0 space-y-1">
            <DialogPrimitive.Title className="text-lg font-semibold sm:text-base">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : ""}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="-mt-1 -mr-2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <XIcon className="size-5 sm:size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 [&>button]:max-sm:h-12 [&>button]:max-sm:flex-1 [&>button]:max-sm:text-base">
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0 pb-safe sm:hidden" />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
