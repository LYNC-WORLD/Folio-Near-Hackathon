// Everything here is EXPO_PUBLIC_, so it is bundled into the app and readable
// by anyone. Never put a secret key here; secrets live in the backend .env.
export const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? "",
  GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
};
