// "Notify me when" switches — saved on the phone until there is a push backend.
import { persisted } from "./persisted";

export const NOTIFY_OPTIONS = [
  { key: "followBuys", label: "Someone I follow buys" },
  { key: "groupProposal", label: "A group opens a proposal" },
  { key: "recurringRuns", label: "A recurring buy runs" },
  { key: "dailyBriefing", label: "Daily analyst briefing" },
] as const;

export type NotifyKey = (typeof NOTIFY_OPTIONS)[number]["key"];
type Prefs = Record<NotifyKey, boolean>;

const DEFAULTS: Prefs = {
  followBuys: true,
  groupProposal: true,
  recurringRuns: true,
  dailyBriefing: false,
};

// saved prefs are merged over the defaults, so new switches get their default
const store = persisted("folio_notify_prefs_v1", DEFAULTS, {
  load: (raw, d) => ({ ...d, ...(raw as Partial<Prefs>) }),
});

export function setNotify(key: NotifyKey, on: boolean) {
  store.set({ ...store.get(), [key]: on });
}

export const useNotifyPrefs = store.use;
