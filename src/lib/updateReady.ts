import { useSyncExternalStore } from "react";

/**
 * "A new version is installed and waiting" — one flag shared between the service-worker
 * registration in main.tsx and the banner that offers the reload. The swap normally
 * happens on its own at a quiet moment; the flag is for the phone that never has one
 * (a tester tapping through every screen), so the update can be taken by hand instead
 * of waiting for a pause that isn't coming.
 */
let apply: (() => void) | null = null;
const subs = new Set<() => void>();

export function markUpdateReady(fn: () => void) {
  apply = fn;
  subs.forEach((s) => s());
}

export function clearUpdateReady() {
  apply = null;
  subs.forEach((s) => s());
}

const subscribe = (s: () => void) => {
  subs.add(s);
  return () => {
    subs.delete(s);
  };
};
const snapshot = () => apply;

/** The pending update's apply function, or null when the app is current. */
export function useUpdateReady(): (() => void) | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
