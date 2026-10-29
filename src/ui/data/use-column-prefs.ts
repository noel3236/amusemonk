'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Pinned columns and column order are one viewer's convenience, so they live in this browser only.
const EVENT = 'amusemonk:column-prefs';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function useStoredKeys(storageKey: string, defaults: readonly string[]) {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null
  );
  let keys: readonly string[] = defaults;
  if (raw) {
    try {
      const v: unknown = JSON.parse(raw);
      if (Array.isArray(v)) keys = v.filter((x): x is string => typeof x === 'string');
    } catch {
      // A corrupt entry falls back to the defaults.
    }
  }
  const save = useCallback(
    (next: readonly string[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage blocked: the change holds until the page reloads.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [storageKey]
  );
  return [keys, save] as const;
}

export function useColumnPrefs(tableId: string, defaultPinned: readonly string[] = []) {
  const [pinned, savePinned] = useStoredKeys(`amusemonk:pinned:${tableId}`, defaultPinned);
  const [order, saveOrder] = useStoredKeys(`amusemonk:order:${tableId}`, []);
  const togglePin = useCallback(
    (key: string) => savePinned(pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key]),
    [pinned, savePinned]
  );
  const reset = useCallback(() => {
    savePinned(defaultPinned);
    saveOrder([]);
  }, [savePinned, saveOrder, defaultPinned]);
  return { pinned, togglePin, order, saveOrder, reset };
}
