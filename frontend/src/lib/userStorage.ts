// On-device values that belong to one signed-in user, so a second account on the same
// device starts clean instead of seeing the first one's answers or flags.
// Values saved before this was per-user (plain `key`) move to whoever signs in next, once.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const userKey = (key: string, userId: string) => `${key}:${userId}`;

export async function getUserItem(
  key: string,
  userId: string,
): Promise<string | null> {
  const own = await AsyncStorage.getItem(userKey(key, userId));
  if (own != null) return own;
  const legacy = await AsyncStorage.getItem(key);
  if (legacy == null) return null;
  await AsyncStorage.setItem(userKey(key, userId), legacy);
  await AsyncStorage.removeItem(key);
  return legacy;
}

export const setUserItem = (key: string, userId: string, value: string) =>
  AsyncStorage.setItem(userKey(key, userId), value);

export const removeUserItem = (key: string, userId: string) =>
  AsyncStorage.removeItem(userKey(key, userId));
