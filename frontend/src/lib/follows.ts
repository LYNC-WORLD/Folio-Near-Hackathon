// Who you follow — kept on the device until the backend has a follow endpoint.
// Shared store so Leaders and the Investor screen always agree.
import { persisted } from "./persisted";

const store = persisted("folio_following_v1", new Set<string>(), {
  load: (raw) => new Set(raw as string[]),
  save: (v) => [...v],
});

export function toggleFollow(id: string) {
  const next = new Set(store.get());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  store.set(next);
  return next.has(id);
}

export const useFollowing = store.use;
