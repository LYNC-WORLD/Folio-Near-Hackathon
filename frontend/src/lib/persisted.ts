// A tiny shared store saved on the device: every screen sees the same value, and it
// survives restarts. Loads from AsyncStorage once at startup and saves on every set().
//
//   const follows = persisted("folio_following_v1", new Set<string>(), {
//     load: (raw) => new Set(raw as string[]),
//     save: (v) => [...v],
//   });
//   follows.set(next);  const value = follows.use();
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function persisted<T>(
  key: string,
  initial: T,
  opts: {
    /** turn the parsed JSON back into T (default: use it as is) */
    load?: (raw: unknown, initial: T) => T;
    /** turn T into something JSON can hold (default: T itself) */
    save?: (value: T) => unknown;
  } = {},
) {
  let value = initial;
  let changed = false; // set() before the saved value loaded: keep the newer one
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  AsyncStorage.getItem(key)
    .then((raw) => {
      if (raw == null || changed) return;
      const parsed: unknown = JSON.parse(raw);
      value = opts.load ? opts.load(parsed, initial) : (parsed as T);
      emit();
    })
    .catch(() => {});

  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const get = () => value;

  return {
    get,
    set(next: T) {
      changed = true;
      value = next;
      AsyncStorage.setItem(
        key,
        JSON.stringify(opts.save ? opts.save(next) : next),
      ).catch(() => {});
      emit();
    },
    /** React hook: re-renders when the value changes */
    use: () => useSyncExternalStore(subscribe, get),
  };
}
