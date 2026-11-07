jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserItem, setUserItem, userKey } from "../userStorage";

describe("userStorage", () => {
  beforeEach(() => AsyncStorage.clear());

  it("keeps each user's value separate", async () => {
    await setUserItem("flag", "alice", "true");
    expect(await getUserItem("flag", "alice")).toBe("true");
    expect(await getUserItem("flag", "bob")).toBeNull();
  });

  it("hands a pre-per-user value to the next user once", async () => {
    await AsyncStorage.setItem("flag", "true");
    expect(await getUserItem("flag", "alice")).toBe("true");
    expect(await AsyncStorage.getItem(userKey("flag", "alice"))).toBe("true");
    expect(await AsyncStorage.getItem("flag")).toBeNull();
    expect(await getUserItem("flag", "bob")).toBeNull();
  });
});
