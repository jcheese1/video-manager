import { useSyncExternalStore, useCallback } from "react";

interface GlobalSettings {
  silenceThreshold: number;
  obsSetupCompleted: boolean;
}

const STORAGE_KEY = "global-settings";
const DEFAULTS: GlobalSettings = {
  silenceThreshold: -50,
  obsSetupCompleted: false,
};

let cached: GlobalSettings | null = null;
const listeners = new Set<() => void>();

function read(): GlobalSettings {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached!;
}

function write(next: GlobalSettings) {
  cached = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): GlobalSettings {
  return read();
}

export function useGlobalSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setSilenceThreshold = useCallback((value: number) => {
    write({ ...read(), silenceThreshold: value });
  }, []);

  const setObsSetupCompleted = useCallback((value: boolean) => {
    write({ ...read(), obsSetupCompleted: value });
  }, []);

  return { settings, setSilenceThreshold, setObsSetupCompleted };
}
