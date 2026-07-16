import { adminAuth, firestore } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type ParentIdentity = { uid: string; email: string; displayName: string };

const collections = {
  users: firestore.collection("users"),
  families: firestore.collection("families"),
  members: firestore.collection("familyMembers"),
  parentInvites: firestore.collection("parentInvites"),
  children: firestore.collection("children"),
  invites: firestore.collection("childInvites"),
  childSessions: firestore.collection("childSessions"),
  transactions: firestore.collection("transactions"),
  goals: firestore.collection("savingsGoals"),
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function randomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const value = Array.from(bytes, (byte) => letters[byte % letters.length]).join("");
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function randomToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function hashPin(pin: string, salt = randomToken().slice(0, 22)) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120_000 }, material, 256);
  return { salt, hash: base64Url(new Uint8Array(bits)) };
}

function row(idValue: string, data: FirebaseFirestore.DocumentData): Row {
  return { id: idValue, ...data };
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `aomgun_child_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`;
}

function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `aomgun_child_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function parentIdentity(request: Request): Promise<ParentIdentity | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    if (!decoded.email) return null;
    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      displayName: String(decoded.name || decoded.email.split("@")[0]),
    };
  } catch {
    return null;
  }
}

async function parentFamily(identity: ParentIdentity): Promise<Row | null> {
  const membership = await collections.members.where("user_id", "==", identity.uid).limit(1).get();
  if (membership.empty) return null;
  const member = row(membership.docs[0].id, membership.docs[0].data());
  const familyDoc = await collections.families.doc(String(member.family_id)).get();
  if (!familyDoc.exists) return null;
  const family = row(familyDoc.id, familyDoc.data()!);
  return { ...family, member_user_id: identity.uid, member_role: member.role };
}

async function childFromSession(request: Request) {
  const token = cookieValue(request, "aomgun_child_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const session = await collections.childSessions.doc(tokenHash).get();
  if (!session.exists || new Date(String(session.data()!.expires_at)).getTime() <= Date.now()) return null;
  const child = await collections.children.doc(String(session.data()!.child_id)).get();
  return child.exists ? row(child.id, child.data()!) : null;
}

async function recordsBy(collection: FirebaseFirestore.CollectionReference, field: string, value: string) {
  const snapshot = await collection.where(field, "==", value).get();
  return snapshot.docs.map((doc) => row(doc.id, doc.data()));
}

function newestFirst(items: Row[]) {
  return items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function childSnapshot(childId: string) {
  const childDoc = await collections.children.doc(childId).get();
  if (!childDoc.exists) throw new Error("Child not found");
  const child = row(childDoc.id, childDoc.data()!);
  const [familyDoc, transactions, goals] = await Promise.all([
    collections.families.doc(String(child.family_id)).get(),
    recordsBy(collections.transactions, "child_id", childId),
    recordsBy(collections.goals, "child_id", childId),
  ]);
  const balance = transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  return {
    child: { ...child, family_name: familyDoc.data()?.name ?? "Family", balance },
    transactions: newestFirst(transactions).slice(0, 20),
    goals: newestFirst(goals),
  };
}

async function parentSnapshot(identity: ParentIdentity) {
  const family = await parentFamily(identity);
  if (!family) return { role: "parent", registered: false, identity };
  const [memberRows, childRows] = await Promise.all([
    recordsBy(collections.members, "family_id", String(family.id)),
    recordsBy(collections.children, "family_id", String(family.id)),
  ]);
  const members = await Promise.all(memberRows.map(async (member) => {
    const user = await collections.users.doc(String(member.user_id)).get();
    return { ...member, ...(user.data() ?? {}) };
  }));
  members.sort((a, b) => a.role === "owner" ? -1 : b.role === "owner" ? 1 : String(a.created_at).localeCompare(String(b.created_at)));
  const transactionGroups = await Promise.all(childRows.map((child) => recordsBy(collections.transactions, "child_id", String(child.id))));
  const children: Row[] = childRows.map((child, index) => {
    const transactions = transactionGroups[index];
    const balance = transactions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const received = transactions.filter((item) => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0);
    const spent = Math.abs(transactions.filter((item) => Number(item.amount) < 0).reduce((sum, item) => sum + Number(item.amount), 0));
    return { ...child, balance, received, spent };
  });
  children.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const transactions = newestFirst(transactionGroups.flat()).slice(0, 30).map((item) => ({
    ...item,
    child_name: children.find((child) => child.id === item.child_id)?.name ?? "Child",
  }));
  return { role: "parent", registered: true, identity, family, members, children, transactions };
}

export async function GET(request: Request) {
  try {
    const child = await childFromSession(request);
    if (child) return Response.json({ role: "child", ...(await childSnapshot(String(child.id))) });
    const identity = await parentIdentity(request);
    if (!identity) return Response.json({ role: "anonymous" });
    return Response.json(await parentSnapshot(identity));
  } catch (cause) {
    console.error(cause);
    return error("Unable to load your family right now", 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Row;
    const action = String(payload.action ?? "");

    if (action === "registerParent") {
      const identity = await parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const name = String(payload.name ?? identity.displayName).trim().slice(0, 60);
      const familyName = String(payload.familyName ?? "My Family").trim().slice(0, 80);
      if (!name || !familyName) return error("Name and family name are required");
      if (!await parentFamily(identity)) {
        const familyId = id("fam");
        const createdAt = now();
        const batch = firestore.batch();
        batch.set(collections.users.doc(identity.uid), { email: identity.email, display_name: name, created_at: createdAt });
        batch.set(collections.families.doc(familyId), { owner_user_id: identity.uid, name: familyName, created_at: createdAt });
        batch.set(collections.members.doc(`${familyId}_${identity.uid}`), { family_id: familyId, user_id: identity.uid, role: "owner", created_at: createdAt });
        await batch.commit();
      }
      return Response.json(await parentSnapshot(identity), { status: 201 });
    }

    if (action === "addChild") {
      const identity = await parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const family = await parentFamily(identity);
      if (!family) return error("Create your family first", 409);
      const name = String(payload.name ?? "").trim().slice(0, 40);
      const age = Number(payload.age);
      const avatar = String(payload.avatar ?? "🧒🏻").slice(0, 20);
      if (!name || !Number.isInteger(age) || age < 4 || age > 17) return error("Enter a valid child name and age");
      const childId = id("chd");
      const inviteId = id("inv");
      const goalId = id("goal");
      const code = randomCode();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      const createdAt = now();
      const batch = firestore.batch();
      batch.set(collections.children.doc(childId), { family_id: family.id, name, age, avatar, nickname: null, pin_salt: null, pin_hash: null, daily_budget: 20000, weekly_budget: 100000, monthly_budget: 350000, created_at: createdAt });
      batch.set(collections.invites.doc(inviteId), { family_id: family.id, child_id: childId, code_hash: await sha256(code), expires_at: expiresAt, used_at: null, created_at: createdAt });
      batch.set(collections.goals.doc(goalId), { child_id: childId, name: "New bicycle", target_amount: 1200000, saved_amount: 0, created_at: createdAt });
      await batch.commit();
      return Response.json({ childId, code, expiresAt }, { status: 201 });
    }

    if (action === "createParentInvite") {
      const identity = await parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const family = await parentFamily(identity);
      if (!family) return error("Family was not found", 404);
      const code = randomCode();
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      await collections.parentInvites.doc(id("pinv")).set({ family_id: family.id, invited_by_user_id: identity.uid, code_hash: await sha256(code), expires_at: expiresAt, used_at: null, created_at: now() });
      return Response.json({ code, expiresAt, familyName: family.name }, { status: 201 });
    }

    if (action === "joinAsParent") {
      const identity = await parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const code = String(payload.code ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return error("Parent invite code is invalid");
      if (await parentFamily(identity)) return error("This account already belongs to a family", 409);
      const inviteQuery = await collections.parentInvites.where("code_hash", "==", await sha256(code)).limit(1).get();
      if (inviteQuery.empty) return error("Parent invite was not found", 404);
      const inviteRef = inviteQuery.docs[0].ref;
      await firestore.runTransaction(async (transaction) => {
        const invite = await transaction.get(inviteRef);
        const data = invite.data()!;
        if (data.used_at) throw new Error("USED_PARENT_INVITE");
        if (new Date(String(data.expires_at)).getTime() <= Date.now()) throw new Error("EXPIRED_PARENT_INVITE");
        const memberRef = collections.members.doc(`${data.family_id}_${identity.uid}`);
        transaction.set(collections.users.doc(identity.uid), { email: identity.email, display_name: identity.displayName, created_at: now() }, { merge: true });
        transaction.set(memberRef, { family_id: data.family_id, user_id: identity.uid, role: "parent", invited_by_user_id: data.invited_by_user_id, created_at: now() });
        transaction.update(inviteRef, { used_at: now() });
      });
      return Response.json(await parentSnapshot(identity), { status: 201 });
    }

    if (action === "joinChild") {
      const code = String(payload.code ?? "").trim().toUpperCase();
      const nickname = String(payload.nickname ?? "").trim().slice(0, 24);
      const pin = String(payload.pin ?? "");
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return error("Invite code is invalid");
      if (!nickname) return error("Nickname is required");
      if (!/^\d{4}$/.test(pin)) return error("PIN must contain exactly four digits");
      const inviteQuery = await collections.invites.where("code_hash", "==", await sha256(code)).limit(1).get();
      if (inviteQuery.empty) return error("Invite code was not found", 404);
      const inviteRef = inviteQuery.docs[0].ref;
      const token = randomToken();
      const tokenHash = await sha256(token);
      const sessionExpiry = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const pinData = await hashPin(pin);
      let childId = "";
      await firestore.runTransaction(async (transaction) => {
        const invite = await transaction.get(inviteRef);
        const data = invite.data()!;
        if (data.used_at) throw new Error("USED_CHILD_INVITE");
        if (new Date(String(data.expires_at)).getTime() <= Date.now()) throw new Error("EXPIRED_CHILD_INVITE");
        childId = String(data.child_id);
        transaction.update(collections.children.doc(childId), { nickname, pin_salt: pinData.salt, pin_hash: pinData.hash });
        transaction.update(inviteRef, { used_at: now() });
        transaction.set(collections.childSessions.doc(tokenHash), { child_id: childId, expires_at: sessionExpiry, created_at: now() });
      });
      return Response.json({ role: "child", ...(await childSnapshot(childId)) }, { status: 201, headers: { "Set-Cookie": sessionCookie(token, request) } });
    }

    if (action === "logoutChild") {
      const token = cookieValue(request, "aomgun_child_session");
      if (token) await collections.childSessions.doc(await sha256(token)).delete();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request) } });
    }

    if (action === "recordExpense") {
      const child = await childFromSession(request);
      if (!child) return error("Child session is required", 401);
      const amount = Math.round(Number(payload.amount) * 100);
      const category = String(payload.category ?? "Other").trim().slice(0, 30);
      const note = String(payload.note ?? "Expense").trim().slice(0, 80);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return error("Enter a valid amount");
      const existing = await recordsBy(collections.transactions, "child_id", String(child.id));
      const balance = existing.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
      if (amount > balance) return error("This expense is higher than your available balance", 409);
      await collections.transactions.doc(id("txn")).set({ child_id: child.id, actor_type: "child", kind: "expense", amount: -amount, category, note, created_at: now() });
      return Response.json({ role: "child", ...(await childSnapshot(String(child.id))) }, { status: 201 });
    }

    if (action === "sendAllowance" || action === "setBudgets") {
      const identity = await parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const family = await parentFamily(identity);
      if (!family) return error("Family was not found", 404);
      const childId = String(payload.childId ?? "");
      const child = await collections.children.doc(childId).get();
      if (!child.exists || child.data()!.family_id !== family.id) return error("Child was not found in your family", 404);
      if (action === "sendAllowance") {
        const amount = Math.round(Number(payload.amount) * 100);
        const note = String(payload.note ?? "Allowance").trim().slice(0, 80);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return error("Enter a valid amount");
        await collections.transactions.doc(id("txn")).set({ child_id: childId, actor_type: "parent", actor_user_id: identity.uid, kind: "allowance", amount, category: "Allowance", note, created_at: now() });
      } else {
        const daily = Math.round(Number(payload.daily) * 100);
        const weekly = Math.round(Number(payload.weekly) * 100);
        const monthly = Math.round(Number(payload.monthly) * 100);
        if (![daily, weekly, monthly].every((value) => Number.isFinite(value) && value >= 0 && value <= 100_000_000)) return error("Budget values are invalid");
        await child.ref.update({ daily_budget: daily, weekly_budget: weekly, monthly_budget: monthly });
      }
      return Response.json(await parentSnapshot(identity));
    }

    return error("Unknown action", 404);
  } catch (cause) {
    console.error(cause);
    const message = cause instanceof Error ? cause.message : "";
    if (message === "USED_PARENT_INVITE" || message === "USED_CHILD_INVITE") return error("This invite has already been used", 409);
    if (message === "EXPIRED_PARENT_INVITE" || message === "EXPIRED_CHILD_INVITE") return error("This invite has expired", 410);
    return error("The request could not be completed", 500);
  }
}
