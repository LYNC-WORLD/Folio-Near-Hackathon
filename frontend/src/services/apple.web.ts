import type { GoogleSession } from "@/types";

export const isAppleAvailable = async () => false;
export const signInWithApple = async (): Promise<GoogleSession | null> => null;
export const restoreAppleSession = async (): Promise<GoogleSession | null> =>
  null;
export const refreshAppleSession = restoreAppleSession;
export const signOutApple = async (): Promise<void> => {};