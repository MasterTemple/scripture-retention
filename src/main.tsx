import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadTopos } from "@/bible/topos";
import { trackKeyboard } from "@/lib/keyboard";
import { registerOffline } from "@/lib/pwa";
import { startReminders } from "@/lib/reminders";
import App from "./App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
registerOffline();
trackKeyboard();
startReminders();

loadTopos().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  (error: unknown) =>
    root.render(
      <div style={{ padding: 32, fontFamily: "system-ui" }}>
        <h1>Scripture Retention couldn't start</h1>
        <p>Its reference parser failed to load: {String(error)}</p>
      </div>,
    ),
);
