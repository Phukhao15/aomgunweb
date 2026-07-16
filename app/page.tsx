"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { firebaseAuth } from "../lib/firebase-client";

type Screen =
  | "welcome"
  | "register"
  | "parent"
  | "add-child"
  | "join"
  | "pin"
  | "child";

const avatars = ["🧑🏻‍🚀", "👧🏽", "🧒🏻", "👦🏾", "👧🏻"];
const qrPattern = [
  1,1,1,1,1,0,1,0,1,1,1,1,1, 1,0,0,0,1,0,0,1,1,0,0,0,1,
  1,0,1,0,1,1,1,0,1,0,1,0,1, 1,0,0,0,1,0,1,1,1,0,0,0,1,
  1,1,1,1,1,0,1,0,1,1,1,1,1, 0,0,0,0,0,0,1,1,0,0,0,0,0,
  1,0,1,1,1,1,0,1,0,1,1,0,1, 0,1,1,0,0,1,1,0,1,0,0,1,0,
  1,1,1,0,1,0,1,1,1,1,0,1,1, 0,0,0,0,0,0,1,0,1,0,1,0,0,
  1,1,1,1,1,0,0,1,1,1,1,0,1, 1,0,0,0,1,1,1,0,1,0,1,1,0,
  1,0,1,0,1,0,1,1,1,1,0,1,1,
];

function money(value: number | string) {
  const amount = Number(value ?? 0) / 100;
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(amount);
}

function transactionView(item: any) {
  const negative = Number(item.amount) < 0;
  const date = item.created_at ? new Date(String(item.created_at).replace(" ", "T") + "Z") : new Date();
  return {
    icon: item.kind === "allowance" ? "💸" : item.category === "Food & drink" ? "🥤" : "🧾",
    title: item.note || (item.kind === "allowance" ? "Allowance" : "Expense"),
    meta: `${item.category} · ${date.toLocaleDateString("en", { month: "short", day: "numeric" })}`,
    amount: `${negative ? "−" : "+"}${money(Math.abs(Number(item.amount)))}`,
    negative,
  };
}

function goalPercent(goal: any) {
  if (!goal || !Number(goal.target_amount)) return 0;
  return Math.min(100, Math.round(Number(goal.saved_amount) / Number(goal.target_amount) * 100));
}

function Icon({ name }: { name: "arrow" | "bell" | "eye" | "plus" | "scan" | "copy" | "shield" }) {
  const symbols = { arrow: "←", bell: "♧", eye: "◉", plus: "+", scan: "⌗", copy: "▣", shield: "◆" };
  return <span aria-hidden="true">{symbols[name]}</span>;
}

function Brand() {
  return (
    <div className="brand" aria-label="AomGun Family">
      <span className="brand-mark"><span>●</span><span>●</span></span>
      <span>AomGun Family</span>
    </div>
  );
}

function StepDots({ active, total = 3 }: { active: number; total?: number }) {
  return <div className="step-dots" aria-label={`Step ${active} of ${total}`}>{Array.from({ length: total }, (_, i) => <i className={i + 1 === active ? "active" : ""} key={i} />)}</div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [registerStep, setRegisterStep] = useState(1);
  const [childName, setChildName] = useState("Milo");
  const [age, setAge] = useState("10");
  const [avatar, setAvatar] = useState(2);
  const [inviteReady, setInviteReady] = useState(false);
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("Milo");
  const [pin, setPin] = useState("");
  const [toast, setToast] = useState("");
  const [parentTab, setParentTab] = useState("Home");
  const [childTab, setChildTab] = useState("Home");
  const [parentName, setParentName] = useState("Nina");
  const [familyName, setFamilyName] = useState("The Santisuk Family");
  const [inviteCode, setInviteCode] = useState("");
  const [data, setData] = useState<any>(null);
  const [activeChildId, setActiveChildId] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrImage, setQrImage] = useState("");
  const [parentInviteCode, setParentInviteCode] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const parentChildren = data?.role === "parent" && data.registered ? data.children ?? [] : [];
  const activeChild = parentChildren.find((child: any) => child.id === activeChildId) ?? parentChildren[0] ?? null;
  const childRecord = data?.role === "child" ? data.child : null;
  const liveTransactions = data?.transactions ?? [];

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) {
      setCode(invite.toUpperCase());
      setScreen("join");
    }
    return onAuthStateChanged(firebaseAuth, () => {
      setAuthReady(true);
      void loadSession();
    });
  }, []);

  useEffect(() => {
    if (!inviteCode) return;
    const joinUrl = `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`;
    QRCode.toDataURL(joinUrl, { width: 220, margin: 1, color: { dark: "#172039", light: "#ffffff" } }).then(setQrImage).catch(() => setQrImage(""));
  }, [inviteCode]);

  useEffect(() => {
    if (!activeChildId && parentChildren[0]?.id) setActiveChildId(String(parentChildren[0].id));
  }, [activeChildId, parentChildren]);

  const screenTitle = useMemo(() => ({
    welcome: "Choose your path", register: "Create your account", parent: "Family dashboard",
    "add-child": "Add a child", join: "Join your family", pin: "Create your PIN", child: "My money",
  }[screen]), [screen]);

  function navigate(next: Screen) {
    setScreen(next);
    setToast("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await firebaseAuth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadSession() {
    try {
      const response = await fetch("/api/app", { cache: "no-store", headers: await authHeaders() });
      const result = await response.json();
      setData(result);
      if (result.role === "child") {
        setNickname(result.child?.nickname ?? result.child?.name ?? "Milo");
      }
      return result;
    } catch {
      setToast("Could not connect to AomGun Family");
      return null;
    }
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const response = await fetch("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Request failed");
      if (result.role || result.child) setData(result);
      return result;
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openParent() {
    if (data?.role === "child") {
      await runAction("logoutChild");
      await loadSession();
    }
    if (!firebaseAuth.currentUser) {
      setRegisterStep(1);
      navigate("register");
      return;
    }
    const result = await loadSession();
    if (!result) return;
    navigate(result.registered ? "parent" : "register");
    if (!result.registered) setRegisterStep(2);
  }

  async function signInEmail() {
    if (!parentEmail || parentPassword.length < 6) {
      setToast("Enter your email and a password with at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      try {
        await signInWithEmailAndPassword(firebaseAuth, parentEmail.trim(), parentPassword);
      } catch {
        await createUserWithEmailAndPassword(firebaseAuth, parentEmail.trim(), parentPassword);
      }
      const result = await loadSession();
      if (result?.registered) navigate("parent");
      else setRegisterStep(2);
    } catch (cause: any) {
      const code = String(cause?.code ?? "");
      setToast(code.includes("email-already-in-use") ? "This email exists already. Check your password." : "Email sign-in could not be completed");
    } finally {
      setBusy(false);
    }
  }

  async function signInProvider(provider: GoogleAuthProvider | OAuthProvider) {
    setBusy(true);
    try {
      await signInWithPopup(firebaseAuth, provider);
      const result = await loadSession();
      if (result?.registered) navigate("parent");
      else setRegisterStep(2);
    } catch (cause: any) {
      setToast(String(cause?.code ?? "").includes("popup-closed") ? "Sign-in window was closed" : "This sign-in method is not enabled yet");
    } finally {
      setBusy(false);
    }
  }

  async function registerParent() {
    const result = await runAction("registerParent", { name: parentName, familyName });
    if (result) setRegisterStep(3);
  }

  async function createChildInvite() {
    const result = await runAction("addChild", { name: childName, age: Number(age), avatar: avatars[avatar] });
    if (result) {
      setInviteCode(result.code);
      setInviteReady(true);
      await loadSession();
    }
  }

  async function createParentInvite() {
    const result = await runAction("createParentInvite");
    if (result) {
      setParentInviteCode(result.code);
      await navigator.clipboard?.writeText(result.code);
      setToast("Parent invite copied · valid for 72 hours");
    }
  }

  async function joinAsParent() {
    if (!firebaseAuth.currentUser) return setToast("Sign in first, then use your parent invite code");
    const invite = window.prompt("Enter the parent invite code");
    if (!invite) return;
    const result = await runAction("joinAsParent", { code: invite.toUpperCase() });
    if (result) navigate("parent");
  }

  async function joinFamily() {
    const result = await runAction("joinChild", { code, nickname, pin });
    if (result) navigate("child");
  }

  async function sendAllowance() {
    if (!activeChild) return setToast("Add a child first");
    const value = window.prompt(`Allowance for ${activeChild.name} (THB)`, "500");
    if (!value) return;
    const result = await runAction("sendAllowance", { childId: activeChild.id, amount: Number(value), note: "Weekly allowance" });
    if (result) setToast("Allowance sent and saved");
  }

  async function setBudgets() {
    if (!activeChild) return setToast("Add a child first");
    const daily = window.prompt("Daily budget (THB)", String(Number(activeChild.daily_budget) / 100));
    if (!daily) return;
    const weekly = window.prompt("Weekly budget (THB)", String(Number(activeChild.weekly_budget) / 100));
    if (!weekly) return;
    const monthly = window.prompt("Monthly budget (THB)", String(Number(activeChild.monthly_budget) / 100));
    if (!monthly) return;
    const result = await runAction("setBudgets", { childId: activeChild.id, daily: Number(daily), weekly: Number(weekly), monthly: Number(monthly) });
    if (result) setToast("Budgets updated securely");
  }

  async function addExpense() {
    const amount = window.prompt("Expense amount (THB)", "85");
    if (!amount) return;
    const note = window.prompt("What did you buy?", "Bubble tea") ?? "Expense";
    const result = await runAction("recordExpense", { amount: Number(amount), category: "Food & drink", note });
    if (result) setToast("Expense saved");
  }

  function copyCode() {
    navigator.clipboard?.writeText(inviteCode);
    setToast("Invite code copied");
    window.setTimeout(() => setToast(""), 1800);
  }

  function pinPress(value: string) {
    if (value === "⌫") return setPin((p) => p.slice(0, -1));
    if (pin.length < 4) setPin((p) => p + value);
  }

  return (
    <main className={`app-shell screen-${screen}`}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <section className="phone" aria-label={screenTitle}>
        <header className="statusbar"><span>9:41</span><span className="signals">▮▮▮ ))) ▰</span></header>

        {screen === "welcome" && (
          <div className="welcome-view">
            <div className="welcome-top"><Brand /><button className="text-link" onClick={() => navigate("register")}>{authReady ? "Sign in" : "Loading…"}</button></div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="family-card parent-mini"><span>👩🏻</span><i>Parent</i></div>
              <div className="family-card child-mini"><span>🧒🏻</span><i>Child</i></div>
              <div className="coin c1">฿</div><div className="coin c2">฿</div>
              <div className="wallet">●<b>฿</b></div>
            </div>
            <div className="welcome-copy">
              <span className="eyebrow">MONEY SKILLS, MADE SIMPLE</span>
              <h1>Grow smart money<br />habits <em>together.</em></h1>
              <p>A safe, joyful space for families to learn, save and spend with confidence.</p>
            </div>
            <div className="role-actions">
              <button className="role-card parent-role" onClick={openParent}>
                <span className="role-icon">👩🏻‍💼</span><span><b>I’m a Parent</b><small>Create & manage a family</small></span><strong>→</strong>
              </button>
              <button className="role-card child-role" onClick={() => navigate("join")}>
                <span className="role-icon">🧒🏻</span><span><b>I’m a Child</b><small>Join with a family code</small></span><strong>→</strong>
              </button>
            </div>
            <p className="privacy-note"><Icon name="shield" /> Private, secure and made for families</p>
          </div>
        )}

        {screen === "register" && (
          <div className="onboarding-view">
            <div className="nav-row"><button className="back" aria-label="Back" onClick={() => registerStep > 1 ? setRegisterStep(registerStep - 1) : navigate("welcome")}><Icon name="arrow" /></button><StepDots active={registerStep} /></div>
            {registerStep === 1 && <>
              <div className="page-heading"><span className="kicker">FOR PARENTS</span><h2>Let’s create your<br />family space</h2><p>Start in seconds. Your family is created automatically.</p></div>
              <div className="auth-stack">
                <button className="social-button" disabled={busy} onClick={() => signInProvider(new GoogleAuthProvider())}><span className="google">G</span>Continue with Google</button>
                <button className="social-button apple" disabled={busy} onClick={() => signInProvider(new OAuthProvider("apple.com"))}><span>●</span>Continue with Apple</button>
                <div className="divider"><span>or use email</span></div>
                <label>Email address<input type="email" autoComplete="email" value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} placeholder="parent@example.com" aria-label="Email address" /></label>
                <label>Password<input type="password" autoComplete="current-password" value={parentPassword} onChange={(event) => setParentPassword(event.target.value)} placeholder="At least 6 characters" aria-label="Password" /></label>
                <button className="primary" disabled={busy} onClick={signInEmail}>{busy ? "Signing in…" : "Continue"}</button>
                <button className="secondary-link" onClick={joinAsParent}>I have a parent invite code</button>
              </div>
            </>}
            {registerStep === 2 && <>
              <div className="page-heading"><span className="kicker">YOUR DETAILS</span><h2>What should we<br />call you?</h2><p>This is how your children will see you in the app.</p></div>
              <div className="profile-setup"><div className="big-avatar">👩🏻</div><button className="avatar-edit">+</button></div>
              <div className="form-grid"><label>Your name<input value={parentName} onChange={(event) => setParentName(event.target.value)} /></label><label>Family name<input value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></label></div>
              <button className="primary bottom-primary" disabled={busy} onClick={registerParent}>{busy ? "Creating…" : "Create my family"}</button>
            </>}
            {registerStep === 3 && <div className="success-view">
              <div className="success-burst"><div className="success-house">⌂<span>♥</span></div></div>
              <span className="kicker">ALL SET</span><h2>Your family is ready!</h2><p>You’re now the owner of <b>{familyName}</b>. Let’s add your first child.</p>
              <div className="owner-pill"><span>👩🏻</span><div><b>{parentName}</b><small>Family owner</small></div><i>✓</i></div>
              <button className="primary" onClick={() => navigate("add-child")}>Add my first child</button>
              <button className="secondary-link" onClick={() => navigate("parent")}>I’ll do this later</button>
            </div>}
          </div>
        )}

        {screen === "parent" && (
          <div className="dashboard-view parent-dashboard">
            <div className="dashboard-head"><div><span className="muted">Good morning,</span><h2>{data?.identity?.displayName ?? parentName} <span>👋</span></h2></div><button className="bell" aria-label="Notifications"><Icon name="bell" /><i /></button></div>
            <div className="parent-team"><div><span className="muted">Parents</span><div className="parent-chips">{(data?.members ?? []).map((member: any) => <span className="parent-chip" key={member.id}><i>{String(member.display_name ?? "P").slice(0,1).toUpperCase()}</i><b>{member.display_name}</b><small>{member.role === "owner" ? "Owner" : "Parent"}</small></span>)}</div></div><button onClick={createParentInvite} aria-label="Invite another parent">+</button></div>
            {parentInviteCode && <div className="parent-invite-banner"><span>Parent invite</span><b>{parentInviteCode}</b><button onClick={() => navigator.clipboard?.writeText(parentInviteCode)}>Copy</button></div>}
            <div className="family-strip"><div className="family-selector">{parentChildren.map((child: any) => <button className={`member ${activeChild?.id === child.id ? "active" : ""}`} onClick={() => setActiveChildId(String(child.id))} key={child.id}><span>{child.avatar}</span><small>{child.nickname ?? child.name}</small></button>)}<button className="member add" onClick={() => { setInviteReady(false); navigate("add-child"); }}><span>+</span><small>Add</small></button></div></div>
            <div className="overview-card">
              <div className="overview-title"><span>This month</span><button aria-label="Toggle balance"><Icon name="eye" /></button></div>
              <h3>{money(activeChild?.received ?? 0)}</h3><p>Total allowance sent</p>
              <div className="stats-row"><div><i className="green">↓</i><span><small>Balance</small><b>{money(activeChild?.balance ?? 0)}</b></span></div><div><i className="red">↑</i><span><small>Spent</small><b>{money(activeChild?.spent ?? 0)}</b></span></div></div>
            </div>
            <div className="quick-actions"><button onClick={sendAllowance}><i className="qa-purple">↗</i><span>Send<br />allowance</span></button><button onClick={setBudgets}><i className="qa-blue">▥</i><span>Set<br />budget</span></button><button><i className="qa-green">◎</i><span>View<br />savings</span></button></div>
            <section className="spending-card"><div className="section-title"><div><h3>Spending</h3><span>June overview</span></div><button>Details</button></div><div className="chart-row"><div className="donut"><span>฿2.4k<small>spent</small></span></div><ul><li><i className="blue-dot" />Food <b>45%</b></li><li><i className="purple-dot" />Fun <b>30%</b></li><li><i className="yellow-dot" />Travel <b>25%</b></li></ul></div></section>
            <section className="recent"><div className="section-title"><h3>Recent activity</h3><button>See all</button></div>{liveTransactions.filter((item: any) => !activeChild || item.child_id === activeChild.id).slice(0,3).map((item: any) => <Transaction key={item.id} {...transactionView(item)} />)}{!liveTransactions.length && <p className="empty-state">No activity yet</p>}</section>
            <BottomNav active={parentTab} onSelect={setParentTab} parent />
          </div>
        )}

        {screen === "add-child" && (
          <div className="onboarding-view add-child-view">
            <div className="nav-row"><button className="back" aria-label="Back" onClick={() => navigate("parent")}><Icon name="arrow" /></button><span className="nav-title">Add a child</span><span className="nav-spacer" /></div>
            {!inviteReady ? <>
              <div className="page-heading compact"><span className="kicker">FAMILY MEMBER</span><h2>Who are we adding?</h2><p>A few quick details, then we’ll make their invite.</p></div>
              <div className="avatar-picker"><div className="selected-avatar">{avatars[avatar]}</div><span>Choose an avatar</span><div className="avatar-options">{avatars.map((a, i) => <button key={a} className={avatar === i ? "selected" : ""} onClick={() => setAvatar(i)}>{a}</button>)}</div></div>
              <div className="form-grid"><label>Child’s name<input value={childName} onChange={(e) => setChildName(e.target.value)} /></label><label>Age<select value={age} onChange={(e) => setAge(e.target.value)}>{Array.from({length:14},(_,i) => i+4).map(a => <option key={a}>{a}</option>)}</select></label></div>
              <div className="info-banner"><span>✦</span><p>No email needed. {childName || "Your child"} will create a nickname and 4-digit PIN when joining.</p></div>
              <button className="primary bottom-primary" disabled={busy} onClick={createChildInvite}>{busy ? "Creating…" : "Create child invite"}</button>
            </> : <div className="invite-view">
              <div className="invite-avatar">{avatars[avatar]}<i>✓</i></div><span className="kicker">INVITE READY</span><h2>Invite {childName}</h2><p>Have them enter this code or scan the QR on their device.</p>
              <div className="qr-card">{qrImage ? <img className="qr-image" src={qrImage} alt={`Invite QR code for ${childName}`} /> : <div className="qr-grid">{qrPattern.map((on, i) => <i className={on ? "on" : ""} key={i} />)}</div>}<span>{String(data?.family?.name ?? familyName).toUpperCase()}</span></div>
              <div className="code-box"><small>INVITE CODE</small><b>{inviteCode}</b><button onClick={copyCode} aria-label="Copy invite code"><Icon name="copy" /></button></div>
              <div className="expiry">◷ Expires in 24 hours</div>
              <button className="primary" onClick={() => navigate("parent")}>Done</button>
              <button className="secondary-link" onClick={() => setToast("Share sheet opened")}>Share invite</button>
            </div>}
          </div>
        )}

        {screen === "join" && (
          <div className="onboarding-view child-onboarding">
            <div className="nav-row"><button className="back" aria-label="Back" onClick={() => navigate("welcome")}><Icon name="arrow" /></button><StepDots active={1} /></div>
            <div className="join-art"><div className="scan-frame"><span>⌗</span><i className="scan-line" /></div><div className="spark s1">✦</div><div className="spark s2">✦</div></div>
            <div className="page-heading centered"><span className="kicker">HEY THERE!</span><h2>Join your family</h2><p>Ask your parent for the invite code, or scan their QR code.</p></div>
            <label className="code-input-label">Family invite code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MILO-4821" maxLength={9} /></label>
            <button className="primary child-primary" disabled={code.length < 4} onClick={() => navigate("pin")}>Join family</button>
            <div className="or"><span>or</span></div>
            <button className="scan-button" onClick={() => setToast("Camera scanning is available after HTTPS deployment")}><Icon name="scan" /> Scan QR code</button>
            <p className="child-safe">◆ You’ll only see your own money — never anyone else’s.</p>
          </div>
        )}

        {screen === "pin" && (
          <div className="onboarding-view pin-view">
            <div className="nav-row"><button className="back" aria-label="Back" onClick={() => navigate("join")}><Icon name="arrow" /></button><StepDots active={2} /></div>
            <div className="mini-family"><div>{avatars[avatar]}</div><span>Welcome to<br /><b>The Santisuk Family</b></span><i>✓</i></div>
            <div className="page-heading centered"><span className="kicker">MAKE IT YOURS</span><h2>Pick a nickname & PIN</h2><p>Your PIN keeps your money safe. Choose four numbers you’ll remember.</p></div>
            <label className="nickname-label">Nickname<input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={14} /></label>
            <div className="pin-dots" aria-label={`${pin.length} of 4 PIN digits entered`}>{[0,1,2,3].map(i => <i className={pin.length > i ? "filled" : ""} key={i} />)}</div>
            <div className="pin-pad">{["1","2","3","4","5","6","7","8","9","","0","⌫"].map((n,i) => n ? <button key={i} onClick={() => pinPress(n)}>{n}</button> : <span key={i} />)}</div>
            <button className="primary child-primary" disabled={busy || pin.length < 4 || !nickname} onClick={joinFamily}>{busy ? "Joining…" : "Start exploring"}</button>
          </div>
        )}

        {screen === "child" && (
          <div className="dashboard-view child-dashboard">
            <div className="child-hero">
              <div className="dashboard-head"><div className="hello"><span className="child-avatar">{childRecord?.avatar ?? avatars[avatar]}</span><span><small>Hi, {childRecord?.nickname ?? nickname}!</small><b>Ready to grow? 🌱</b></span></div><button className="bell" aria-label="Notifications"><Icon name="bell" /><i /></button></div>
              <div className="balance-card"><div><span>My balance <button aria-label="Toggle balance"><Icon name="eye" /></button></span><h2>{money(childRecord?.balance ?? 0)}</h2><small>Stored securely for this profile</small></div><div className="piggy">🐷<i>฿</i></div></div>
            </div>
            <div className="child-content">
              <div className="budget-cards"><div className="budget-card"><div><span>Today’s budget</span><b>{money(childRecord?.daily_budget ?? 0)}</b></div><strong>Live</strong><div className="progress"><i style={{width:"25%"}} /></div></div><div className="budget-card goal-card"><div><span>Saving goal</span><b>{data?.goals?.[0]?.name ?? "New bicycle"} 🚲</b></div><strong>{goalPercent(data?.goals?.[0])}%</strong><div className="progress"><i style={{width:`${goalPercent(data?.goals?.[0])}%`}} /></div></div></div>
              <div className="quick-actions child-actions"><button onClick={addExpense}><i>＋</i><span>Add expense</span></button><button><i>◎</i><span>My savings</span></button><button><i>☷</i><span>All activity</span></button></div>
              <section className="streak"><div className="streak-star">★</div><div><small>YOUR MONEY STREAK</small><h3>5 days of tracking!</h3><p>Two more days to unlock a badge.</p></div><span>🔥</span></section>
              <section className="recent"><div className="section-title"><h3>My activity</h3><button>See all</button></div>{liveTransactions.map((item: any) => <Transaction key={item.id} {...transactionView(item)} />)}{!liveTransactions.length && <p className="empty-state">Your activity will appear here</p>}</section>
            </div>
            <BottomNav active={childTab} onSelect={setChildTab} />
          </div>
        )}
        {toast && <div className="toast" role="status">✓ {toast}</div>}
      </section>
      <aside className="prototype-nav" aria-label="Prototype screens">
        <Brand /><p>Interactive prototype</p>
        {[["welcome","Welcome"],["register","Parent registration"],["parent","Parent dashboard"],["add-child","Add child"],["join","Child join"],["pin","Create PIN"],["child","Child dashboard"]].map(([id,label]) => <button className={screen === id ? "active" : ""} onClick={() => navigate(id as Screen)} key={id}><span>{label}</span><i>→</i></button>)}
        <div className="prototype-note"><b>Privacy by design</b><span>Child profiles are scoped to their own records. Sibling data is never exposed.</span></div>
      </aside>
    </main>
  );
}

function Transaction({ icon, title, meta, amount, negative }: { icon: string; title: string; meta: string; amount: string; negative: boolean }) {
  return <div className="transaction"><span className="transaction-icon">{icon}</span><div><b>{title}</b><small>{meta}</small></div><strong className={negative ? "negative" : "positive"}>{amount}</strong></div>;
}

function BottomNav({ active, onSelect, parent = false }: { active: string; onSelect: (v: string) => void; parent?: boolean }) {
  const items = parent ? [["Home","⌂"],["Insights","⌁"],["Budgets","▥"],["Family","♙"]] : [["Home","⌂"],["Activity","☷"],["Add","+"],["Goals","◇"],["Me","♙"]];
  return <nav className="bottom-nav">{items.map(([label,icon]) => <button key={label} aria-label={label} className={`${active === label ? "active" : ""} ${label === "Add" ? "nav-add" : ""}`} onClick={() => onSelect(label)}><i>{icon}</i><span>{label}</span></button>)}</nav>;
}
