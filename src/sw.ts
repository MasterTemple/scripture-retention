/// <reference lib="webworker" />
// The service worker: keeps the app working offline (the build lists its files here), and
// shows reminders when the browser wakes it (periodic background sync, where there is one)
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { dueReminders, reviewDayAt } from "./core/reminders";
import { readSent, readState, writeSent } from "./lib/reminderStore";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// A new version waits until the page says to take over (it would reload it, perhaps mid-review)
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "CHECK_REMINDERS") event.waitUntil(remind());
});

async function remind() {
  const state = await readState();
  if (!state || Notification.permission !== "granted") return;
  const sent = await readSent();
  const now = new Date();
  for (const r of dueReminders(state, now, sent)) {
    await self.registration.showNotification(r.title, {
      body: r.body,
      tag: r.kind,
      icon: "pwa-192x192.png",
      badge: "pwa-192x192.png",
      data: { path: r.path },
    });
    sent[r.kind] = reviewDayAt(now, state.settings.dayStartsAt);
  }
  await writeSent(sent);
}

self.addEventListener("periodicsync", ((event: Event & { tag: string; waitUntil: (p: Promise<unknown>) => void }) => {
  if (event.tag === "reminders") event.waitUntil(remind());
}) as EventListener);

// Tapping a reminder opens the app there (the window already open, if any)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { path?: string })?.path ?? "./", self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.navigate(url).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
