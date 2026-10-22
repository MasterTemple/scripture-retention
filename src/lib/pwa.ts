import { toast } from "sonner";
import { registerSW } from "virtual:pwa-register";

/**
 * Registers the service worker that keeps the app working offline. A new version waits to be
 * taken (it would reload the page, perhaps mid-verse), and saved books are asked to be kept.
 */
export function registerOffline() {
  if (!("serviceWorker" in navigator)) return;
  const update = registerSW({
    onNeedRefresh: () =>
      toast("A new version is ready", {
        duration: Infinity,
        action: { label: "Reload", onClick: () => update(true) },
      }),
    onOfflineReady: () => toast.success("Ready to use offline"),
  });
  // Without this, Safari may clear saved books from a site not opened in a while
  navigator.storage?.persist?.().catch(() => {});
}
