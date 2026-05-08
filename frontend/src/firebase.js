import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

function cleanEnv(value) {
  if (!value) {
    return "";
  }

  const trimmed = String(value).trim();
  const withoutTrailingComma = trimmed.endsWith(",") ? trimmed.slice(0, -1).trim() : trimmed;
  const withoutQuotes =
    (withoutTrailingComma.startsWith('"') && withoutTrailingComma.endsWith('"')) ||
    (withoutTrailingComma.startsWith("'") && withoutTrailingComma.endsWith("'"))
      ? withoutTrailingComma.slice(1, -1)
      : withoutTrailingComma;

  return withoutQuotes.trim();
}

const firebaseConfig = {
  apiKey: cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID)
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;
export const isFirebaseAuthConfigured = Boolean(auth);
