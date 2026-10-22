import { createStore, get, set } from "idb-keyval";
import type { ReminderState, Sent } from "@/core/reminders";

// What the page and the service worker share for reminders: the service worker can't read
// localStorage, so the state is copied to IndexedDB, along with what's been sent

const db = createStore("scripture-retention-reminders", "state");

export const readState = () => get<ReminderState>("state", db);
export const writeState = (state: ReminderState) => set("state", state, db);
export const readSent = async (): Promise<Sent> => (await get<Sent>("sent", db)) ?? {};
export const writeSent = (sent: Sent) => set("sent", sent, db);
