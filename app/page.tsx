"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
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
  const [parentJoinCode, setParentJoinCode] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [parentPanel, setParentPanel] = useState<"" | "allowance" | "budget" | "profile">("");
  const [allowanceAmount, setAllowanceAmount] = useState("500");
  const [allowanceNote, setAllowanceNote] = useState("Weekly allowance");
  const [budgetDaily, setBudgetDaily] = useState("200");
  const [budgetWeekly, setBudgetWeekly] = useState("1000");
  const [budgetMonthly, setBudgetMonthly] = useState("3500");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Food & drink");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [savingAmount, setSavingAmount] = useState("");
  const [newPin, setNewPin] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);

  const parentChildren = data?.role === "parent" && data.registered ? data.children ?? [] : [];
  const activeChild = parentChildren.find((child: any) => child.id === activeChildId) ?? parentChildren[0] ?? null;
  const childRecord = data?.role === "child" ? data.child : null;
  const liveTransactions = data?.transactions ?? [];
  const liveGoals = data?.goals ?? [];

  const spendingByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of liveTransactions) {
      if (Number(item.amount) >= 0) continue;
      const category = String(item.category ?? "Other");
      totals.set(category, (totals.get(category) ?? 0) + Math.abs(Number(item.amount)));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [liveTransactions]);

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

  useEffect(() => () => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

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
      if (!response.ok) throw new Error(result.error ?? "Could not load your account");
      setData(result);
      if (result.role === "child") {
        setNickname(result.child?.nickname ?? result.child?.name ?? "Milo");
      }
      return result;
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : "Could not connect to AomGun Family");
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
    if (result.role !== "parent") {
      setRegisterStep(1);
      navigate("register");
      setToast("Please sign in as a parent first");
      return;
    }
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
      if (!result) return;
      if (result.role !== "parent") throw new Error("Parent sign-in could not be verified");
      if (result.registered) navigate("parent");
      else setRegisterStep(2);
    } catch (cause: any) {
      const code = String(cause?.code ?? "");
      setToast(code.includes("email-already-in-use") ? "This email exists already. Check your password." : "Email sign-in could not be completed");
    } finally {
      setBusy(false);
    }
  }

  async function signInProvider(provider: GoogleAuthProvider) {
    setBusy(true);
    try {
      await signInWithPopup(firebaseAuth, provider);
      const result = await loadSession();
      if (!result) return;
      if (result.role !== "parent") throw new Error("Parent sign-in could not be verified");
      if (result.registered) navigate("parent");
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

  async function logoutParent() {
    setBusy(true);
    try {
      await signOut(firebaseAuth);
      setData(null);
      setActiveChildId("");
      setParentPassword("");
      setRegisterStep(1);
      navigate("welcome");
      setToast("Signed out successfully");
    } catch {
      setToast("Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
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
    if (!parentJoinCode) return setToast("Enter your parent invite code");
    const result = await runAction("joinAsParent", { code: parentJoinCode.toUpperCase() });
    if (result) navigate("parent");
  }

  async function joinFamily() {
    const result = await runAction("joinChild", { code, nickname, pin });
    if (result) navigate("child");
  }

  async function sendAllowance() {
    if (!activeChild) return setToast("Add a child first");
    const result = await runAction("sendAllowance", { childId: activeChild.id, amount: Number(allowanceAmount), note: allowanceNote });
    if (result) setToast("Allowance sent and saved");
    if (result) setParentPanel("");
  }

  async function setBudgets() {
    if (!activeChild) return setToast("Add a child first");
    const result = await runAction("setBudgets", { childId: activeChild.id, daily: Number(budgetDaily), weekly: Number(budgetWeekly), monthly: Number(budgetMonthly) });
    if (result) setToast("Budgets updated securely");
    if (result) setParentPanel("");
  }

  async function addExpense() {
    const result = await runAction("recordExpense", { amount: Number(expenseAmount), category: expenseCategory, note: expenseNote || "Expense" });
    if (result) { setToast("Expense saved"); setExpenseAmount(""); setExpenseNote(""); setChildTab("Activity"); }
  }

  async function saveParentProfile() {
    const result = await runAction("updateParentProfile", { name: parentName, familyName });
    if (result) { setParentPanel(""); setToast("Profile updated"); }
  }

  async function resetParentPassword() {
    if (!firebaseAuth.currentUser?.email) return;
    try { await sendPasswordResetEmail(firebaseAuth, firebaseAuth.currentUser.email); setToast("Password reset email sent"); }
    catch { setToast("Could not send the reset email"); }
  }

  async function logoutChild() {
    const result = await runAction("logoutChild");
    if (result) { setData(null); setPin(""); navigate("welcome"); setToast("Signed out successfully"); }
  }

  async function changeChildPin() {
    const result = await runAction("changeChildPin", { pin: newPin });
    if (result) { setNewPin(""); setToast("PIN changed successfully"); }
  }

  async function createGoal() {
    const result = await runAction("createSavingsGoal", { name: goalName, targetAmount: Number(goalTarget) });
    if (result) { setGoalName(""); setGoalTarget(""); setToast("Savings goal created"); }
  }

  async function saveToGoal(goalId: string) {
    const result = await runAction("saveTowardGoal", { goalId, amount: Number(savingAmount) });
    if (result) { setSavingAmount(""); setToast("Money moved to savings"); }
  }

  function openAllowancePanel() {
    if (!activeChild) return setToast("Add a child first");
    setAllowanceAmount("500"); setAllowanceNote("Weekly allowance"); setParentPanel("allowance");
  }

  function openBudgetPanel() {
    if (!activeChild) return setToast("Add a child first");
    openBudgetPanelFor(activeChild);
  }

  function openBudgetPanelFor(child: any) {
    setActiveChildId(String(child.id));
    setBudgetDaily(String(Number(child.daily_budget ?? 0) / 100));
    setBudgetWeekly(String(Number(child.weekly_budget ?? 0) / 100));
    setBudgetMonthly(String(Number(child.monthly_budget ?? 0) / 100));
    setParentPanel("budget");
  }

  async function shareChildInvite() {
    const joinUrl = `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}`;
    if (navigator.share) await navigator.share({ title: "Join AomGun Family", text: `Use code ${inviteCode}`, url: joinUrl });
    else { await navigator.clipboard?.writeText(joinUrl); setToast("Invite link copied"); }
  }

  function stopCamera() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraOpen(false);
  }

  async function openCamera() {
    setScannerMessage("");
    if (!navigator.mediaDevices?.getUserMedia) return setToast("Camera is not available in this browser");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      cameraStream.current = stream;
      setCameraOpen(true);
      window.setTimeout(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const Detector = (window as any).BarcodeDetector;
        if (!Detector) { setScannerMessage("QR detection is not supported here. Enter the code manually."); return; }
        const detector = new Detector({ formats: ["qr_code"] });
        const scan = async () => {
          if (!cameraStream.current || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const raw = String(results[0]?.rawValue ?? "");
            const invite = raw.includes("invite=") ? new URL(raw).searchParams.get("invite") : raw.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/i)?.[0];
            if (invite) { setCode(invite.toUpperCase()); stopCamera(); navigate("pin"); return; }
          } catch { /* keep scanning */ }
          window.requestAnimationFrame(scan);
        };
        void scan();
      }, 50);
    } catch { setToast("Camera permission was not granted"); }
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
                <div className="divider"><span>or use email</span></div>
                <label>Email address<input type="email" autoComplete="email" value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} placeholder="parent@example.com" aria-label="Email address" /></label>
                <label>Password<input type="password" autoComplete="current-password" value={parentPassword} onChange={(event) => setParentPassword(event.target.value)} placeholder="At least 6 characters" aria-label="Password" /></label>
                <button className="primary" disabled={busy} onClick={signInEmail}>{busy ? "Signing in…" : "Continue"}</button>
                <details className="parent-join"><summary>I have a parent invite code</summary><label>Parent invite code<input value={parentJoinCode} onChange={(event) => setParentJoinCode(event.target.value.toUpperCase())} placeholder="ABCD-2345" maxLength={9} /></label><button type="button" onClick={joinAsParent}>Join this family</button></details>
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
            <div className="dashboard-head"><div><span className="muted">Good morning,</span><h2>{data?.identity?.displayName ?? parentName} <span>👋</span></h2></div><div className="parent-head-actions"><button className="bell" aria-label="Notifications"><Icon name="bell" /><i /></button><button className="logout-button" disabled={busy} onClick={logoutParent} aria-label="Sign out">ออกจากระบบ</button></div></div>
            {parentTab === "Home" && <>
              <ParentTeam data={data} parentInviteCode={parentInviteCode} createParentInvite={createParentInvite} />
              <ChildSelector children={parentChildren} activeChild={activeChild} setActiveChildId={setActiveChildId} add={() => { setInviteReady(false); navigate("add-child"); }} />
              <div className="overview-card"><div className="overview-title"><span>This month</span><button aria-label="Toggle balance"><Icon name="eye" /></button></div><h3>{money(activeChild?.received ?? 0)}</h3><p>Total allowance sent</p><div className="stats-row"><div><i className="green">↓</i><span><small>Balance</small><b>{money(activeChild?.balance ?? 0)}</b></span></div><div><i className="red">↑</i><span><small>Spent</small><b>{money(activeChild?.spent ?? 0)}</b></span></div></div></div>
              <div className="quick-actions"><button onClick={openAllowancePanel}><i className="qa-purple">↗</i><span>Send<br />allowance</span></button><button onClick={openBudgetPanel}><i className="qa-blue">▥</i><span>Set<br />budget</span></button><button onClick={() => setParentTab("Savings")}><i className="qa-green">◎</i><span>View<br />savings</span></button></div>
              <section className="recent"><div className="section-title"><h3>Recent activity</h3><button onClick={() => setParentTab("Insights")}>See all</button></div>{liveTransactions.filter((item: any) => !activeChild || item.child_id === activeChild.id).slice(0,3).map((item: any) => <Transaction key={item.id} {...transactionView(item)} />)}{!liveTransactions.length && <p className="empty-state">No activity yet</p>}</section>
            </>}
            {parentTab === "Insights" && <div className="tab-page"><PageTitle eyebrow="FAMILY REPORT" title="Insights" text="See spending and allowance activity across every child." /><div className="summary-grid"><Metric label="Total balance" value={money(parentChildren.reduce((sum: number, child: any) => sum + Number(child.balance), 0))} tone="blue" /><Metric label="Total spent" value={money(parentChildren.reduce((sum: number, child: any) => sum + Number(child.spent), 0))} tone="red" /></div><section className="panel-card"><h3>Spending by category</h3>{spendingByCategory.length ? spendingByCategory.map(([category, amount]) => <div className="category-row" key={category}><span>{category}</span><div><i style={{width:`${Math.min(100, amount / Math.max(1, spendingByCategory[0][1]) * 100)}%`}} /></div><b>{money(amount)}</b></div>) : <p className="empty-state">No spending recorded yet</p>}</section><section className="panel-card"><h3>All activity</h3>{liveTransactions.map((item: any) => <Transaction key={item.id} {...transactionView(item)} />)}</section></div>}
            {parentTab === "Budgets" && <div className="tab-page"><PageTitle eyebrow="SPENDING LIMITS" title="Budgets" text="Set daily, weekly and monthly limits for each child." />{parentChildren.map((child: any) => <section className="child-manage-card" key={child.id}><div><span>{child.avatar}</span><h3>{child.nickname ?? child.name}</h3></div><dl><div><dt>Daily</dt><dd>{money(child.daily_budget)}</dd></div><div><dt>Weekly</dt><dd>{money(child.weekly_budget)}</dd></div><div><dt>Monthly</dt><dd>{money(child.monthly_budget)}</dd></div></dl><button onClick={() => openBudgetPanelFor(child)}>Edit budget</button></section>)}{!parentChildren.length && <p className="empty-state">Add a child to set budgets</p>}</div>}
            {parentTab === "Savings" && <div className="tab-page"><PageTitle eyebrow="GOALS" title="Family savings" text="Follow every child’s progress toward their goals." />{liveGoals.map((goal: any) => <section className="goal-list-card" key={goal.id}><div><span>🎯</span><div><small>{goal.child_name}</small><h3>{goal.name}</h3></div><b>{goalPercent(goal)}%</b></div><div className="progress"><i style={{width:`${goalPercent(goal)}%`}} /></div><p>{money(goal.saved_amount)} of {money(goal.target_amount)}</p></section>)}{!liveGoals.length && <p className="empty-state">Savings goals will appear here</p>}</div>}
            {parentTab === "Family" && <div className="tab-page"><PageTitle eyebrow="MEMBERS" title={String(data?.family?.name ?? familyName)} text="Manage parents, children and your family profile." /><ParentTeam data={data} parentInviteCode={parentInviteCode} createParentInvite={createParentInvite} />{parentChildren.map((child: any) => <section className="member-row-card" key={child.id}><span>{child.avatar}</span><div><h3>{child.nickname ?? child.name}</h3><p>Age {child.age} · Balance {money(child.balance)}</p></div></section>)}<div className="settings-actions"><button onClick={() => { setParentName(data?.identity?.displayName ?? parentName); setFamilyName(data?.family?.name ?? familyName); setParentPanel("profile"); }}>Edit family profile</button><button onClick={resetParentPassword}>Send password reset email</button><button className="danger" onClick={logoutParent}>ออกจากระบบ</button></div></div>}
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
              <button className="secondary-link" onClick={shareChildInvite}>Share invite</button>
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
            <button className="scan-button" onClick={openCamera}><Icon name="scan" /> Scan QR code</button>
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
              {childTab === "Home" && <><div className="budget-cards"><div className="budget-card"><div><span>Today’s budget</span><b>{money(childRecord?.daily_budget ?? 0)}</b></div><strong>Live</strong><div className="progress"><i style={{width:"25%"}} /></div></div><div className="budget-card goal-card"><div><span>Saving goal</span><b>{liveGoals[0]?.name ?? "Create a goal"} 🎯</b></div><strong>{goalPercent(liveGoals[0])}%</strong><div className="progress"><i style={{width:`${goalPercent(liveGoals[0])}%`}} /></div></div></div><div className="quick-actions child-actions"><button onClick={() => setChildTab("Add")}><i>＋</i><span>Add expense</span></button><button onClick={() => setChildTab("Goals")}><i>◎</i><span>My savings</span></button><button onClick={() => setChildTab("Activity")}><i>☷</i><span>All activity</span></button></div><section className="streak"><div className="streak-star">★</div><div><small>YOUR MONEY HABIT</small><h3>{liveTransactions.length} records tracked</h3><p>Keep logging to understand your spending.</p></div><span>🔥</span></section><section className="recent"><div className="section-title"><h3>My activity</h3><button onClick={() => setChildTab("Activity")}>See all</button></div>{liveTransactions.slice(0,3).map((item: any) => <Transaction key={item.id} {...transactionView(item)} />)}{!liveTransactions.length && <p className="empty-state">Your activity will appear here</p>}</section></>}
              {childTab === "Activity" && <div className="tab-page child-tab"><PageTitle eyebrow="MY RECORDS" title="Activity" text="Everything you receive, spend and save." /><section className="panel-card">{liveTransactions.map((item: any) => <Transaction key={item.id} {...transactionView(item)} />)}{!liveTransactions.length && <p className="empty-state">No activity yet</p>}</section></div>}
              {childTab === "Add" && <div className="tab-page child-tab"><PageTitle eyebrow="NEW RECORD" title="Add expense" text="Record what you spent so your balance stays accurate." /><div className="action-form"><label>Amount (THB)<input inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="85" /></label><label>Category<select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option>Food & drink</option><option>Travel</option><option>Fun</option><option>School</option><option>Shopping</option><option>Other</option></select></label><label>What did you buy?<input value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} placeholder="Bubble tea" /></label><button className="primary" disabled={busy || !expenseAmount} onClick={addExpense}>{busy ? "Saving…" : "Save expense"}</button></div></div>}
              {childTab === "Goals" && <div className="tab-page child-tab"><PageTitle eyebrow="MY SAVINGS" title="Goals" text="Choose something meaningful and save a little at a time." />{liveGoals.map((goal: any) => <section className="goal-list-card" key={goal.id}><div><span>🎯</span><div><h3>{goal.name}</h3><small>{money(goal.saved_amount)} of {money(goal.target_amount)}</small></div><b>{goalPercent(goal)}%</b></div><div className="progress"><i style={{width:`${goalPercent(goal)}%`}} /></div><div className="goal-save"><input inputMode="decimal" value={savingAmount} onChange={(event) => setSavingAmount(event.target.value)} placeholder="Amount" /><button onClick={() => saveToGoal(goal.id)} disabled={busy || !savingAmount}>Save</button></div></section>)}<div className="action-form compact-form"><h3>Create a new goal</h3><label>Goal name<input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="New bicycle" /></label><label>Target (THB)<input inputMode="decimal" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder="12000" /></label><button className="primary" disabled={busy || !goalName || !goalTarget} onClick={createGoal}>Create goal</button></div></div>}
              {childTab === "Me" && <div className="tab-page child-tab"><PageTitle eyebrow="MY PROFILE" title={String(childRecord?.nickname ?? nickname)} text={`Member of ${String(childRecord?.family_name ?? "my family")}`} /><section className="profile-card"><span>{childRecord?.avatar ?? avatars[avatar]}</span><h3>{childRecord?.name}</h3><p>Age {childRecord?.age} · Your records are private</p></section><div className="action-form compact-form"><h3>Change 4-digit PIN</h3><label>New PIN<input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" /></label><button className="primary" disabled={busy || newPin.length !== 4} onClick={changeChildPin}>Change PIN</button></div><button className="full-danger" onClick={logoutChild}>ออกจากระบบเด็ก</button></div>}
            </div>
            <BottomNav active={childTab} onSelect={setChildTab} />
          </div>
        )}
        {parentPanel && <div className="modal-backdrop" role="presentation"><section className="sheet" role="dialog" aria-modal="true"><div className="sheet-head"><h3>{parentPanel === "allowance" ? `Send allowance to ${activeChild?.name}` : parentPanel === "budget" ? `Budget for ${activeChild?.name}` : "Family profile"}</h3><button onClick={() => setParentPanel("")} aria-label="Close">×</button></div>{parentPanel === "allowance" && <div className="action-form"><label>Amount (THB)<input inputMode="decimal" value={allowanceAmount} onChange={(event) => setAllowanceAmount(event.target.value)} /></label><label>Note<input value={allowanceNote} onChange={(event) => setAllowanceNote(event.target.value)} /></label><button className="primary" disabled={busy || !allowanceAmount} onClick={sendAllowance}>Confirm allowance</button></div>}{parentPanel === "budget" && <div className="action-form"><label>Daily budget<input inputMode="decimal" value={budgetDaily} onChange={(event) => setBudgetDaily(event.target.value)} /></label><label>Weekly budget<input inputMode="decimal" value={budgetWeekly} onChange={(event) => setBudgetWeekly(event.target.value)} /></label><label>Monthly budget<input inputMode="decimal" value={budgetMonthly} onChange={(event) => setBudgetMonthly(event.target.value)} /></label><button className="primary" disabled={busy} onClick={setBudgets}>Save budgets</button></div>}{parentPanel === "profile" && <div className="action-form"><label>Your name<input value={parentName} onChange={(event) => setParentName(event.target.value)} /></label><label>Family name<input value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></label><button className="primary" disabled={busy} onClick={saveParentProfile}>Save profile</button></div>}</section></div>}
        {cameraOpen && <div className="modal-backdrop"><section className="camera-sheet"><div className="sheet-head"><h3>Scan family QR</h3><button onClick={stopCamera}>×</button></div><video ref={videoRef} playsInline muted /><p>{scannerMessage || "Point the camera at the QR code"}</p></section></div>}
        {toast && <div className="toast" role="status">✓ {toast}</div>}
      </section>
    </main>
  );
}

function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="tab-title"><span>{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><b>{value}</b></div>;
}

function ParentTeam({ data, parentInviteCode, createParentInvite }: { data: any; parentInviteCode: string; createParentInvite: () => void }) {
  return <><div className="parent-team"><div><span className="muted">Parents</span><div className="parent-chips">{(data?.members ?? []).map((member: any) => <span className="parent-chip" key={member.id}><i>{String(member.display_name ?? "P").slice(0,1).toUpperCase()}</i><b>{member.display_name}</b><small>{member.role === "owner" ? "Owner" : "Parent"}</small></span>)}</div></div><button onClick={createParentInvite} aria-label="Invite another parent">+</button></div>{parentInviteCode && <div className="parent-invite-banner"><span>Parent invite</span><b>{parentInviteCode}</b><button onClick={() => navigator.clipboard?.writeText(parentInviteCode)}>Copy</button></div>}</>;
}

function ChildSelector({ children, activeChild, setActiveChildId, add }: { children: any[]; activeChild: any; setActiveChildId: (id: string) => void; add: () => void }) {
  return <div className="family-strip"><div className="family-selector">{children.map((child: any) => <button className={`member ${activeChild?.id === child.id ? "active" : ""}`} onClick={() => setActiveChildId(String(child.id))} key={child.id}><span>{child.avatar}</span><small>{child.nickname ?? child.name}</small></button>)}<button className="member add" onClick={add}><span>+</span><small>Add</small></button></div></div>;
}

function Transaction({ icon, title, meta, amount, negative }: { icon: string; title: string; meta: string; amount: string; negative: boolean }) {
  return <div className="transaction"><span className="transaction-icon">{icon}</span><div><b>{title}</b><small>{meta}</small></div><strong className={negative ? "negative" : "positive"}>{amount}</strong></div>;
}

function BottomNav({ active, onSelect, parent = false }: { active: string; onSelect: (v: string) => void; parent?: boolean }) {
  const items = parent ? [["Home","⌂"],["Insights","⌁"],["Budgets","▥"],["Savings","◇"],["Family","♙"]] : [["Home","⌂"],["Activity","☷"],["Add","+"],["Goals","◇"],["Me","♙"]];
  return <nav className="bottom-nav">{items.map(([label,icon]) => <button key={label} aria-label={label} className={`${active === label ? "active" : ""} ${label === "Add" ? "nav-add" : ""}`} onClick={() => onSelect(label)}><i>{icon}</i><span>{label}</span></button>)}</nav>;
}
