import "server-only";

import { cert, getApp, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function credentials(): ServiceAccount {
  const encodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (encodedServiceAccount) {
    return JSON.parse(Buffer.from(encodedServiceAccount, "base64").toString("utf8")) as ServiceAccount;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };

  const localPath = join(process.cwd(), "secrets", "aomgun-firebase-admin.json");
  if (existsSync(localPath)) {
    return JSON.parse(readFileSync(localPath, "utf8")) as ServiceAccount;
  }

  throw new Error("Firebase Admin credentials are not configured");
}

const adminApp = getApps().length ? getApp() : initializeApp({ credential: cert(credentials()) });

export const adminAuth = getAuth(adminApp);
export const firestore = getFirestore(adminApp);
