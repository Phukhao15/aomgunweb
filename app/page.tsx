"use client";

import { useMemo, useState } from "react";

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

const transactions = [
  { icon: "🥤", title: "Bubble tea", meta: "Food & drink · Today", amount: "−฿85", negative: true },
  { icon: "🎮", title: "Game top-up", meta: "Fun · Yesterday", amount: "−฿120", negative: true },
  { icon: "💸", title: "Weekly allowance", meta: "From Mom · 2 days ago", amount: "+฿500", negative: false },
];

function Icon({ name }: { name: "arrow" | "bell" | "eye" | "plus" | "scan" | "copy" | "shield" }) {
  const symbols = { arrow: "←", bell: "♧", eye: "◉", plus: "+", scan: "⌗", copy: "▣", shield: "◆" };
  return <span aria-hidden="true">{symbols[name]}</span>;
}

function Brand() {
  return (
    <div className="brand" aria-label="NestMint">
      <span className="brand-mark"><span>●</span><span>●</span></span>
      <span>NestMint</span>
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

  const screenTitle = useMemo(() => ({
    welcome: "Choose your path", register: "Create your account", parent: "Family dashboard",
    "add-child": "Add a child", join: "Join your family", pin: "Create your PIN", child: "My money",
  }[screen]), [screen]);

  function navigate(next: Screen) {
    setScreen(next);
    setToast("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copyCode() {
    navigator.clipboard?.writeText("MILO-4821");
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
            <div className="welcome-top"><Brand /><button className="text-link" onClick={() => navigate("register")}>Sign in</button></div>
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
              <button className="role-card parent-role" onClick={() => navigate("register")}>
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
                <button className="social-button"><span className="google">G</span>Continue with Google</button>
                <button className="social-button apple"><span>●</span>Continue with Apple</button>
                <div className="divider"><span>or use email</span></div>
                <label>Email address<input type="email" defaultValue="parent@example.com" aria-label="Email address" /></label>
                <button className="primary" onClick={() => setRegisterStep(2)}>Continue</button>
              </div>
            </>}
            {registerStep === 2 && <>
              <div className="page-heading"><span className="kicker">YOUR DETAILS</span><h2>What should we<br />call you?</h2><p>This is how your children will see you in the app.</p></div>
              <div className="profile-setup"><div className="big-avatar">👩🏻</div><button className="avatar-edit">+</button></div>
              <div className="form-grid"><label>Your name<input defaultValue="Nina" /></label><label>Family name<input defaultValue="The Santisuk Family" /></label></div>
              <button className="primary bottom-primary" onClick={() => setRegisterStep(3)}>Create my family</button>
            </>}
            {registerStep === 3 && <div className="success-view">
              <div className="success-burst"><div className="success-house">⌂<span>♥</span></div></div>
              <span className="kicker">ALL SET</span><h2>Your family is ready!</h2><p>You’re now the owner of <b>The Santisuk Family</b>. Let’s add your first child.</p>
              <div className="owner-pill"><span>👩🏻</span><div><b>Nina</b><small>Family owner</small></div><i>✓</i></div>
              <button className="primary" onClick={() => navigate("add-child")}>Add my first child</button>
              <button className="secondary-link" onClick={() => navigate("parent")}>I’ll do this later</button>
            </div>}
          </div>
        )}

        {screen === "parent" && (
          <div className="dashboard-view parent-dashboard">
            <div className="dashboard-head"><div><span className="muted">Good morning,</span><h2>Nina <span>👋</span></h2></div><button className="bell" aria-label="Notifications"><Icon name="bell" /><i /></button></div>
            <div className="family-strip"><div className="family-selector"><button className="member active"><span>🧒🏻</span><small>Milo</small></button><button className="member"><span>👧🏽</span><small>Lena</small></button><button className="member add" onClick={() => navigate("add-child")}><span>+</span><small>Add</small></button></div></div>
            <div className="overview-card">
              <div className="overview-title"><span>This month</span><button aria-label="Toggle balance"><Icon name="eye" /></button></div>
              <h3>฿3,550</h3><p>Total allowance sent</p>
              <div className="stats-row"><div><i className="green">↓</i><span><small>Saved</small><b>฿1,050</b></span></div><div><i className="red">↑</i><span><small>Spent</small><b>฿2,450</b></span></div></div>
            </div>
            <div className="quick-actions"><button><i className="qa-purple">↗</i><span>Send<br />allowance</span></button><button onClick={() => { setParentTab("Budgets"); setToast("Budget controls opened"); }}><i className="qa-blue">▥</i><span>Set<br />budget</span></button><button><i className="qa-green">◎</i><span>View<br />savings</span></button></div>
            <section className="spending-card"><div className="section-title"><div><h3>Spending</h3><span>June overview</span></div><button>Details</button></div><div className="chart-row"><div className="donut"><span>฿2.4k<small>spent</small></span></div><ul><li><i className="blue-dot" />Food <b>45%</b></li><li><i className="purple-dot" />Fun <b>30%</b></li><li><i className="yellow-dot" />Travel <b>25%</b></li></ul></div></section>
            <section className="recent"><div className="section-title"><h3>Recent activity</h3><button>See all</button></div>{transactions.slice(0,2).map((t) => <Transaction key={t.title} {...t} />)}</section>
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
              <button className="primary bottom-primary" onClick={() => setInviteReady(true)}>Create child invite</button>
            </> : <div className="invite-view">
              <div className="invite-avatar">{avatars[avatar]}<i>✓</i></div><span className="kicker">INVITE READY</span><h2>Invite {childName}</h2><p>Have them enter this code or scan the QR on their device.</p>
              <div className="qr-card"><div className="qr-grid">{qrPattern.map((on, i) => <i className={on ? "on" : ""} key={i} />)}</div><span>THE SANTISUK FAMILY</span></div>
              <div className="code-box"><small>INVITE CODE</small><b>MILO-4821</b><button onClick={copyCode} aria-label="Copy invite code"><Icon name="copy" /></button></div>
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
            <button className="scan-button" onClick={() => { setCode("MILO-4821"); setToast("QR code scanned"); }}><Icon name="scan" /> Scan QR code</button>
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
            <button className="primary child-primary" disabled={pin.length < 4 || !nickname} onClick={() => navigate("child")}>Start exploring</button>
          </div>
        )}

        {screen === "child" && (
          <div className="dashboard-view child-dashboard">
            <div className="child-hero">
              <div className="dashboard-head"><div className="hello"><span className="child-avatar">{avatars[avatar]}</span><span><small>Hi, {nickname}!</small><b>Ready to grow? 🌱</b></span></div><button className="bell" aria-label="Notifications"><Icon name="bell" /><i /></button></div>
              <div className="balance-card"><div><span>My balance <button aria-label="Toggle balance"><Icon name="eye" /></button></span><h2>฿1,050</h2><small>+฿500 this week</small></div><div className="piggy">🐷<i>฿</i></div></div>
            </div>
            <div className="child-content">
              <div className="budget-cards"><div className="budget-card"><div><span>Today’s spending</span><b>฿50 <small>/ ฿200</small></b></div><strong>25%</strong><div className="progress"><i style={{width:"25%"}} /></div></div><div className="budget-card goal-card"><div><span>Saving goal</span><b>New bicycle 🚲</b></div><strong>42%</strong><div className="progress"><i style={{width:"42%"}} /></div></div></div>
              <div className="quick-actions child-actions"><button><i>＋</i><span>Add expense</span></button><button><i>◎</i><span>My savings</span></button><button><i>☷</i><span>All activity</span></button></div>
              <section className="streak"><div className="streak-star">★</div><div><small>YOUR MONEY STREAK</small><h3>5 days of tracking!</h3><p>Two more days to unlock a badge.</p></div><span>🔥</span></section>
              <section className="recent"><div className="section-title"><h3>My activity</h3><button>See all</button></div>{transactions.map((t) => <Transaction key={t.title} {...t} />)}</section>
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
