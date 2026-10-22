import { toast } from "sonner";
import { registerSW } from "virtual:pwa-register";

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
/** Whether a new version is downloaded and waiting to take over */
let waiting = false;
const waiters = new Set<() => void>();

/**
 * Registers the service worker that keeps the app working offline. A new version waits to be
 * taken (it would reload the page, perhaps mid-verse), and saved books are asked to be kept.
 */
export function registerOffline() {
  if (!("serviceWorker" in navigator)) return;
  applyUpdate = registerSW({
    onNeedRefresh: () => {
      waiting = true;
      for (const w of waiters) w();
      toast("A new version is ready", {
        duration: Infinity,
        action: { label: "Reload", onClick: () => void applyUpdate?.(true) },
      });
    },
    onOfflineReady: () => toast.success("Ready to use offline"),
  });
  // Without this, Safari may clear saved books from a site not opened in a while
  navigator.storage?.persist?.().catch(() => {});
}

export type UpdateCheck = "updating" | "current" | "offline" | "unavailable";

/**
 * Looks for a new version now (rather than when the browser next does) and, if there is one,
 * takes it and reloads. Your verses are kept: they're in this browser's storage, not the app.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (!registration || !applyUpdate) return "unavailable";
  if (!waiting) {
    try {
      await registration.update();
    } catch {
      return "offline";
    }
    // A new version downloads before it can take over; wait for it, if one was found
    if (!registration.installing && !registration.waiting) return "current";
    await new Promise<void>((resolve) => {
      const done = () => (waiters.delete(done), resolve());
      waiters.add(done);
      setTimeout(done, 30_000);
    });
    if (!waiting) return "current";
  }
  await applyUpdate(true);
  return "updating";
}
