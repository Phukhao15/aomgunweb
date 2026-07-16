import { ensureSchema, getD1, hashPin, id, randomCode, randomToken, sha256 } from "../../../db/runtime";

type ParentIdentity = { email: string; displayName: string };

function parentIdentity(request: Request): ParentIdentity | null {
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (email) {
    let displayName = email;
    if (encodedName && encoding === "percent-encoded-utf-8") {
      try { displayName = decodeURIComponent(encodedName); } catch { /* fall back to email */ }
    }
    return { email: email.toLowerCase(), displayName };
  }
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { email: "parent@example.com", displayName: "Nina" };
  }
  return null;
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
  return `nestmint_child_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`;
}

function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `nestmint_child_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function childFromSession(request: Request) {
  const token = cookieValue(request, "nestmint_child_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  return getD1().prepare(`
    SELECT c.*, f.name AS family_name
    FROM child_sessions s
    JOIN children c ON c.id = s.child_id
    JOIN families f ON f.id = c.family_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first<Record<string, unknown>>();
}

async function parentFamily(identity: ParentIdentity) {
  return getD1().prepare(`
    SELECT f.id, f.name, f.owner_user_id AS owner_id, u.id AS member_user_id,
      u.display_name, u.email, fm.role AS member_role
    FROM users u
    JOIN family_members fm ON fm.user_id = u.id
    JOIN families f ON f.id = fm.family_id
    WHERE u.email = ? ORDER BY CASE fm.role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1
  `).bind(identity.email).first<Record<string, unknown>>();
}

async function childSnapshot(childId: string) {
  const db = getD1();
  const child = await db.prepare(`
    SELECT c.id, c.family_id, c.name, c.age, c.avatar, c.nickname,
      c.daily_budget, c.weekly_budget, c.monthly_budget, c.created_at,
      f.name AS family_name,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE child_id = c.id), 0) AS balance
    FROM children c JOIN families f ON f.id = c.family_id WHERE c.id = ?
  `).bind(childId).first<Record<string, unknown>>();
  const transactions = (await db.prepare("SELECT id, kind, amount, category, note, actor_type, created_at FROM transactions WHERE child_id = ? ORDER BY created_at DESC LIMIT 20").bind(childId).all()).results;
  const goals = (await db.prepare("SELECT id, name, target_amount, saved_amount FROM savings_goals WHERE child_id = ? ORDER BY created_at DESC").bind(childId).all()).results;
  return { child, transactions, goals };
}

async function parentSnapshot(identity: ParentIdentity) {
  const family = await parentFamily(identity);
  if (!family) return { role: "parent", registered: false, identity };
  const db = getD1();
  const members = (await db.prepare(`
    SELECT u.id, u.display_name, u.email, fm.role, fm.created_at
    FROM family_members fm JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ? ORDER BY CASE fm.role WHEN 'owner' THEN 0 ELSE 1 END, fm.created_at
  `).bind(family.id).all()).results;
  const children = (await db.prepare(`
    SELECT c.id, c.name, c.age, c.avatar, c.nickname, c.daily_budget, c.weekly_budget, c.monthly_budget,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE child_id = c.id), 0) AS balance,
      COALESCE((SELECT SUM(amount) FROM transactions WHERE child_id = c.id AND amount > 0), 0) AS received,
      ABS(COALESCE((SELECT SUM(amount) FROM transactions WHERE child_id = c.id AND amount < 0), 0)) AS spent
    FROM children c WHERE c.family_id = ? ORDER BY c.created_at
  `).bind(family.id).all()).results;
  const childIds = children.map((child) => String(child.id));
  let transactions: Record<string, unknown>[] = [];
  if (childIds.length) {
    const placeholders = childIds.map(() => "?").join(",");
    transactions = (await db.prepare(`SELECT t.id, t.child_id, c.name AS child_name, t.kind, t.amount, t.category, t.note, t.actor_type, t.created_at FROM transactions t JOIN children c ON c.id = t.child_id WHERE t.child_id IN (${placeholders}) ORDER BY t.created_at DESC LIMIT 30`).bind(...childIds).all()).results;
  }
  return { role: "parent", registered: true, identity, family, members, children, transactions };
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const child = await childFromSession(request);
    if (child) return Response.json({ role: "child", ...(await childSnapshot(String(child.id))) });
    const identity = parentIdentity(request);
    if (!identity) return Response.json({ role: "anonymous", signInPath: "/signin-with-chatgpt?return_to=%2F" });
    return Response.json(await parentSnapshot(identity));
  } catch (cause) {
    console.error(cause);
    return error("Unable to load your family right now", 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const db = getD1();

    if (action === "registerParent") {
      const identity = parentIdentity(request);
      if (!identity) return error("Sign in is required", 401);
      const name = String(payload.name ?? identity.displayName).trim().slice(0, 60);
      const familyName = String(payload.familyName ?? "My Family").trim().slice(0, 80);
      if (!name || !familyName) return error("Name and family name are required");
      const existing = await parentFamily(identity);
      if (!existing) {
        const userId = id("usr");
        const familyId = id("fam");
        await db.batch([
          db.prepare("INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)").bind(userId, identity.email, name),
          db.prepare("INSERT INTO families (id, owner_user_id, name) VALUES (?, ?, ?)").bind(familyId, userId, familyName),
          db.prepare("INSERT INTO family_members (id, family_id, user_id, role) VALUES (?, ?, ?, 'owner')").bind(id("mbr"), familyId, userId),
        ]);
      }
      return Response.json(await parentSnapshot(identity), { status: 201 });
    }

    if (action === "addChild") {
      const identity = parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const family = await parentFamily(identity);
      if (!family) return error("Create your family first", 409);
      const name = String(payload.name ?? "").trim().slice(0, 40);
      const age = Number(payload.age);
      const avatar = String(payload.avatar ?? "🧒🏻").slice(0, 20);
      if (!name || !Number.isInteger(age) || age < 4 || age > 17) return error("Enter a valid child name and age");
      const childId = id("chd");
      const inviteId = id("inv");
      const code = randomCode();
      const codeHash = await sha256(code.toUpperCase());
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await db.batch([
        db.prepare("INSERT INTO children (id, family_id, name, age, avatar) VALUES (?, ?, ?, ?, ?)").bind(childId, family.id, name, age, avatar),
        db.prepare("INSERT INTO invites (id, family_id, child_id, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)").bind(inviteId, family.id, childId, codeHash, expiresAt),
        db.prepare("INSERT INTO savings_goals (id, child_id, name, target_amount, saved_amount) VALUES (?, ?, ?, ?, 0)").bind(id("goal"), childId, "New bicycle", 1200000),
      ]);
      return Response.json({ childId, code, expiresAt }, { status: 201 });
    }

    if (action === "createParentInvite") {
      const identity = parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const family = await parentFamily(identity);
      if (!family) return error("Family was not found", 404);
      const code = randomCode();
      const codeHash = await sha256(code.toUpperCase());
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      await db.prepare("INSERT INTO parent_invites (id, family_id, invited_by_user_id, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id("pinv"), family.id, family.member_user_id, codeHash, expiresAt).run();
      return Response.json({ code, expiresAt, familyName: family.name }, { status: 201 });
    }

    if (action === "joinAsParent") {
      const identity = parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const code = String(payload.code ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return error("Parent invite code is invalid");
      if (await parentFamily(identity)) return error("This account already belongs to a family", 409);
      const invite = await db.prepare("SELECT id, family_id, invited_by_user_id, used_at, expires_at FROM parent_invites WHERE code_hash = ?")
        .bind(await sha256(code)).first<Record<string, unknown>>();
      if (!invite) return error("Parent invite was not found", 404);
      if (invite.used_at) return error("This parent invite has already been used", 409);
      if (new Date(String(invite.expires_at)).getTime() <= Date.now()) return error("This parent invite has expired", 410);
      let user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(identity.email).first<Record<string, unknown>>();
      const userId = user ? String(user.id) : id("usr");
      const statements = [];
      if (!user) statements.push(db.prepare("INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)").bind(userId, identity.email, identity.displayName));
      statements.push(
        db.prepare("INSERT INTO family_members (id, family_id, user_id, role, invited_by_user_id) VALUES (?, ?, ?, 'parent', ?)").bind(id("mbr"), invite.family_id, userId, invite.invited_by_user_id),
        db.prepare("UPDATE parent_invites SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(invite.id),
      );
      await db.batch(statements);
      return Response.json(await parentSnapshot(identity), { status: 201 });
    }

    if (action === "joinChild") {
      const code = String(payload.code ?? "").trim().toUpperCase();
      const nickname = String(payload.nickname ?? "").trim().slice(0, 24);
      const pin = String(payload.pin ?? "");
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return error("Invite code is invalid");
      if (!nickname) return error("Nickname is required");
      if (!/^\d{4}$/.test(pin)) return error("PIN must contain exactly four digits");
      const codeHash = await sha256(code);
      const invite = await db.prepare(`SELECT i.id, i.child_id, i.used_at, i.expires_at FROM invites i WHERE i.code_hash = ?`).bind(codeHash).first<Record<string, unknown>>();
      if (!invite) return error("Invite code was not found", 404);
      if (invite.used_at) return error("This invite has already been used", 409);
      if (new Date(String(invite.expires_at)).getTime() <= Date.now()) return error("This invite has expired", 410);
      const { salt, hash } = await hashPin(pin);
      const token = randomToken();
      const tokenHash = await sha256(token);
      const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.batch([
        db.prepare("UPDATE children SET nickname = ?, pin_salt = ?, pin_hash = ? WHERE id = ?").bind(nickname, salt, hash, invite.child_id),
        db.prepare("UPDATE invites SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(invite.id),
        db.prepare("INSERT INTO child_sessions (token_hash, child_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, invite.child_id, sessionExpiry),
      ]);
      return Response.json({ role: "child", ...(await childSnapshot(String(invite.child_id))) }, { status: 201, headers: { "Set-Cookie": sessionCookie(token, request) } });
    }

    if (action === "logoutChild") {
      const token = cookieValue(request, "nestmint_child_session");
      if (token) await db.prepare("DELETE FROM child_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
      return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request) } });
    }

    if (action === "recordExpense") {
      const child = await childFromSession(request);
      if (!child) return error("Child session is required", 401);
      const amount = Math.round(Number(payload.amount) * 100);
      const category = String(payload.category ?? "Other").trim().slice(0, 30);
      const note = String(payload.note ?? "Expense").trim().slice(0, 80);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return error("Enter a valid amount");
      const balanceRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM transactions WHERE child_id = ?").bind(child.id).first<{ balance: number }>();
      if (amount > Number(balanceRow?.balance ?? 0)) return error("This expense is higher than your available balance", 409);
      await db.prepare("INSERT INTO transactions (id, child_id, actor_type, kind, amount, category, note) VALUES (?, ?, 'child', 'expense', ?, ?, ?)").bind(id("txn"), child.id, -amount, category, note).run();
      return Response.json({ role: "child", ...(await childSnapshot(String(child.id))) }, { status: 201 });
    }

    if (action === "sendAllowance" || action === "setBudgets") {
      const identity = parentIdentity(request);
      if (!identity) return error("Parent sign-in is required", 401);
      const family = await parentFamily(identity);
      if (!family) return error("Family was not found", 404);
      const childId = String(payload.childId ?? "");
      const owned = await db.prepare("SELECT id FROM children WHERE id = ? AND family_id = ?").bind(childId, family.id).first();
      if (!owned) return error("Child was not found in your family", 404);
      if (action === "sendAllowance") {
        const amount = Math.round(Number(payload.amount) * 100);
        const note = String(payload.note ?? "Allowance").trim().slice(0, 80);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return error("Enter a valid amount");
        await db.prepare("INSERT INTO transactions (id, child_id, actor_type, kind, amount, category, note) VALUES (?, ?, 'parent', 'allowance', ?, 'Allowance', ?)").bind(id("txn"), childId, amount, note).run();
      } else {
        const daily = Math.round(Number(payload.daily) * 100);
        const weekly = Math.round(Number(payload.weekly) * 100);
        const monthly = Math.round(Number(payload.monthly) * 100);
        if (![daily, weekly, monthly].every((value) => Number.isFinite(value) && value >= 0 && value <= 100_000_000)) return error("Budget values are invalid");
        await db.prepare("UPDATE children SET daily_budget = ?, weekly_budget = ?, monthly_budget = ? WHERE id = ? AND family_id = ?").bind(daily, weekly, monthly, childId, family.id).run();
      }
      return Response.json(await parentSnapshot(identity));
    }

    return error("Unknown action", 404);
  } catch (cause) {
    console.error(cause);
    return error("The request could not be completed", 500);
  }
}
