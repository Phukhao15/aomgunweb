# AomGun

AomGun is a family finance web application for parents and children. Parents can create a family, invite additional parents, add children, set budgets, send allowance, and review activity. Children join without an email by using a one-time code and four-digit PIN.

## Stack

- Next.js App Router, ready for Vercel
- Firebase Authentication for parent accounts
- Cloud Firestore for family records
- Firebase Admin SDK for server-side authorization
- HttpOnly child sessions with hashed invite codes and PINs

## Local development

1. Put the Firebase Admin service-account JSON at `secrets/aomgun-firebase-admin.json`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:3000`.

The `secrets` directory and all environment files are excluded from Git.

## Vercel environment

Set `FIREBASE_SERVICE_ACCOUNT_BASE64` to the Base64-encoded Firebase Admin service-account JSON. The public Firebase web configuration is included for the `aomgun-3ae64` project and can be overridden with the `NEXT_PUBLIC_FIREBASE_*` variables shown in `.env.example`.

After the first deployment, add the Vercel domain under Firebase Authentication → Settings → Authorized domains.

## Checks

- `npm run typecheck`
- `npm run build`
- `npm test`
