import { remindersCalendar } from "@/core/reminders";
import { reviewDay, useApp } from "@/state/store";
import { viewUrl } from "@/state/ui";
import { writeState } from "./reminderStore";

/**
 * Reminders, as far as a site without a server can send them: the service worker shows them
 * when the browser wakes it (periodic background sync: Chrome and Edge, installed), and the page
 * asks it to while it's open in the background. A calendar of them is the sure way on any phone.
 */

type PeriodicSync = { register: (tag: string, options: { minInterval: number }) => Promise<void>; unregister: (tag: string) => Promise<void> };

export const canNotify = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

/** Whether the browser can wake the app to remind with it closed */
export const canWake = () => typeof window !== "undefined" && "ServiceWorkerRegistration" in window && "periodicSync" in ServiceWorkerRegistration.prototype;

/** iOS shows a site's notifications only once it's added to the Home Screen */
export const needsInstall = () =>
  /iP(hone|od|ad)/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone && !matchMedia("(display-mode: standalone)").matches;

const anyOn = () => {
  const { review, newVerse } = useApp.getState().settings.reminders;
  return review.enabled || newVerse.enabled;
};

/** Asks to notify (from a tap), and to be woken for reminders where the browser can */
export async function allowNotifications(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") await syncWake();
  return permission;
}

/** Registers (or, with every reminder off, drops) the periodic wake-up */
async function syncWake() {
  if (!canWake() || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & { periodicSync: PeriodicSync }).periodicSync;
    if (anyOn() && Notification.permission === "granted") {
      const status = await navigator.permissions.query({ name: "periodic-background-sync" as PermissionName });
      if (status.state === "granted") await sync.register("reminders", { minInterval: 60 * 60 * 1000 });
    } else {
      await sync.unregister("reminders");
    }
  } catch {
    // Not installed, or not allowed: reminders come while the app is open in the background
  }
}

async function check() {
  if (!canNotify() || Notification.permission !== "granted" || !anyOn()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage({ type: "CHECK_REMINDERS" });
}

/** Keeps the service worker's copy of the state current, and checks for reminders while the page is in the background */
export function startReminders() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const copy = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { verses, queue, queueChecked, settings } = useApp.getState();
      writeState({ verses, queue, queueChecked, settings }).catch(() => {});
    }, 500);
  };
  copy();
  useApp.subscribe((state, previous) => {
    if (state.verses !== previous.verses || state.queue !== previous.queue || state.settings !== previous.settings) copy();
    if (state.settings.reminders !== previous.settings.reminders) void syncWake();
  });
  void syncWake();
  setInterval(() => document.visibilityState === "hidden" && void check(), 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void check());
}

/** A calendar file of the reminders turned on, for the phone's own calendar to keep */
export function downloadCalendar() {
  const ics = remindersCalendar(useApp.getState().settings.reminders, viewUrl("review"), reviewDay());
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "scripture-retention-reminders.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
