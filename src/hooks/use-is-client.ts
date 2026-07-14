import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/**
 * True only once the client has hydrated. Used to defer rendering anything
 * that depends on client-only state (e.g. next-themes' resolved theme)
 * without the extra render pass a setState-in-effect mount check causes.
 */
export function useIsClient() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
