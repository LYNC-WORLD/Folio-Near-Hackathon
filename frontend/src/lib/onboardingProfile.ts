import type { OnboardingProfile } from "@/context";
import { getUserItem, setUserItem } from "./userStorage";

const PROFILE_KEY = "folio_profile_v1";

export async function saveOnboardingProfile(
  userId: string,
  profile: OnboardingProfile,
) {
  try {
    await setUserItem(PROFILE_KEY, userId, JSON.stringify(profile));
  } catch {}
}

export async function getOnboardingProfile(
  userId: string,
): Promise<OnboardingProfile | null> {
  try {
    const raw = await getUserItem(PROFILE_KEY, userId);
    return raw ? (JSON.parse(raw) as OnboardingProfile) : null;
  } catch {
    return null;
  }
}
