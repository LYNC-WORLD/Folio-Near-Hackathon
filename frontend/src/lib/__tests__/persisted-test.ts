jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { persisted } from "../persisted";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("persisted", () => {
  beforeEach(() => AsyncStorage.clear());

  it("loads the saved value", async () => {
    await AsyncStorage.setItem("k1", JSON.stringify(["a"]));
    const store = persisted("k1", new Set<string>(), {
      load: (raw) => new Set(raw as string[]),
      save: (v) => [...v],
    });
    await flush();
    expect([...store.get()]).toEqual(["a"]);
  });

  it("saves on set", async () => {
    const store = persisted("k2", 1);
    store.set(2);
    await flush();
    expect(await AsyncStorage.getItem("k2")).toBe("2");
  });

  it("keeps a change made before the saved value loads", async () => {
    await AsyncStorage.setItem("k3", JSON.stringify("old"));
    const store = persisted("k3", "initial");
    store.set("new"); // before the async load resolves
    await flush();
    expect(store.get()).toBe("new");
  });
});
