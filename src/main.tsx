import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

/*
 * Keep every phone on the latest deploy without anyone reloading twice. The service
 * worker precaches the app shell, which is right for signal-free fairways — but it also
 * means a plain refresh serves yesterday's bundle while the new one installs in the
 * background. The periodic update() check catches phones that stay open all round
 * without ever navigating. Every "where was I" state is persisted, so the reload is
 * invisible: same tab, same round, same hole.
 *
 * When a new version is ready the swap waits for a quiet moment: the app in the
 * background, or half a minute since the last touch. An instant reload used to be able
 * to land mid-tap, or wipe an open confirm dialog.
 */
const QUIET_MS = 30_000;
let lastTouch = Date.now();
for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
  document.addEventListener(type, () => (lastTouch = Date.now()), { capture: true, passive: true });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const whenQuiet = () => {
      if (document.visibilityState === "hidden" || Date.now() - lastTouch > QUIET_MS) {
        void updateSW(true);
        return;
      }
      setTimeout(whenQuiet, 5_000);
    };
    whenQuiet();
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // Every five minutes while the app is up — the check is a ~1 KB request that
    // usually answers 304, so frequency is nearly free.
    setInterval(() => void registration.update(), 5 * 60 * 1000);
    // And the moment the app comes back to the foreground: a phone pocketed during a
    // deploy is updating by the time its owner has finished unlocking it.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update();
    });
  },
});
void updateSW;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
