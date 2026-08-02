import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield, Users, Sparkles, Lock, Mail, Phone, User as UserIcon,
  CheckCircle2, XCircle, ChevronRight, ChevronDown, LogOut, Settings, ClipboardList,
  ExternalLink, AlertCircle, Loader2, Home, Newspaper, Crown,
  MessageCircle, Plus, Trash2, ArrowLeft, X, Building2, FlaskConical,
  ShieldCheck, Globe2, Smile, Megaphone, Stamp, Send, Landmark, UserPlus, HelpCircle,
} from "lucide-react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  query, orderBy, onSnapshot, addDoc, where,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";
import argyraLogo from "./assets/argyra-logo.png";

/* ===========================================================
   MODELO DE DATOS (resumen)
   -----------------------------------------------------------
   communities/{id}
     name, kind: 'comunidad' | 'independiente'
     subcommunities: string[]
     leaderUid, leaderName, leaderPhone
     ambassadorMainUid, ambassadorMainName
     ambassadorAltUid, ambassadorAltName
     sealDate, status: 'activa' | 'expulsada', notes, createdAt

   users/{uid}  (perfil privado)
     nick, phone, email, motivation
     status: 'survey-pending'|'terms-pending'|'submitted'|'accepted'|'rejected'
     affiliation: 'community' | 'new-community' | 'team'
     communityId: string|null
     pendingCommunityName, pendingCommunityKind  (si affiliation === 'new-community')
     role: 'nuevo'|'miembro'|'coordinador'|'lider'
     branches: string[]  (solo relevante si role === 'coordinador')
     sello: { active: bool, date: string|null }
     createdAt, updatedAt

   directory/{uid}  (espejo público reducido, solo para miembros aceptados)
     nick, role, branches, communityId, sello:{active}, status

   announcements/{id}  (Directorio Central)
     title, body, scope: 'global'|'community', communityId,
     authorUid, authorName, createdAt

   communities/{id}/embassy/{id}  (Embajada — espacio privado de la comunidad)
     authorUid, authorName, body, createdAt

   passRequests/{id}  (Sistema de pase — validar liderazgo antes de Coordinador)
     uid, name, branchRequested, motivation,
     status: 'pending'|'approved'|'rejected', reviewedBy, createdAt
=========================================================== */

const BRANCHES = {
  laboratorio: {
    key: "laboratorio", label: "Laboratorio", icon: FlaskConical, color: "#6C6CF0",
    blurb: "Programación, diseño y desarrollo: creación y modificación de páginas web, apps y otros proyectos técnicos de la comunidad.",
  },
  guardia: {
    key: "guardia", label: "Guardia y Expansión", icon: ShieldCheck, color: "#8C2F39",
    blurb: "Seguridad, moderación y crecimiento de comunidades afiliadas.",
  },
  relaciones: {
    key: "relaciones", label: "Relaciones Externas", icon: Globe2, color: "#C9A036",
    blurb: "Embajadas, alianzas y contacto entre comunidades.",
  },
  casual: {
    key: "casual", label: "Comunidad Casual", icon: Smile, color: "#4E9A6B",
    blurb: "Convivencia diaria, eventos y ambiente de la comunidad.",
  },
  publicidad: {
    key: "publicidad", label: "Publicidad", icon: Megaphone, color: "#B36BD4",
    blurb: "Difusión y promoción de Argyra hacia afuera.",
  },
};
const BRANCH_ORDER = ["laboratorio", "guardia", "relaciones", "casual", "publicidad"];

const ROLES = {
  lider: { key: "lider", label: "Líder", color: "#C9A036", blurb: "Autoridad máxima de todo el proyecto Argyra." },
  coordinador: { key: "coordinador", label: "Coordinador", color: "#6C6CF0", blurb: "Coordina una o más ramas funcionales de Argyra." },
  miembro: { key: "miembro", label: "Miembro", color: "#4E9A6B", blurb: "Participa activamente en la comunidad." },
  nuevo: { key: "nuevo", label: "Nuevo", color: "#96939F", blurb: "Recién llegado a Argyra." },
};
const ROLE_ORDER = ["lider", "coordinador", "miembro", "nuevo"];

function cx(...a) { return a.filter(Boolean).join(" "); }

/* ---------------- Validación de nombre y teléfono ---------------- */
const NAME_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/;
function isValidName(str) { return NAME_REGEX.test(str); }
function sanitizeName(str) { return str.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, ""); }
function sanitizePhone(str) {
  let v = str.replace(/[^0-9+]/g, "");
  const hasPlus = v.startsWith("+");
  v = v.replace(/\+/g, "");
  return hasPlus ? "+" + v : v;
}

const COUNTRY_CODES = [
  "1","7","20","27","30","31","32","33","34","36","39","40","41","43","44","45","46","47","48","49",
  "51","52","53","54","55","56","57","58","60","61","62","63","64","65","66","81","82","84","86","90","91","92","93","94","95","98",
  "211","212","213","216","218","220","221","222","223","224","225","226","227","228","229",
  "230","231","232","233","234","235","236","237","238","239","240","241","242","243","244","245","246","248","249",
  "250","251","252","253","254","255","256","257","258","260","261","262","263","264","265","266","267","268","269",
  "290","291","297","298","299",
  "350","351","352","353","354","355","356","357","358","359",
  "370","371","372","373","374","375","376","377","378","380","381","382","383","385","386","387","389",
  "420","421","423",
  "500","501","502","503","504","505","506","507","508","509",
  "590","591","592","593","594","595","596","597","598","599",
  "670","672","673","674","675","676","677","678","679","680","681","682","683","685","686","687","688","689","690","691","692",
  "850","852","853","855","856",
  "880","886",
  "960","961","962","963","964","965","966","967","968","970","971","972","973","974","975","976","977",
  "992","993","994","995","996","998",
].sort((a, b) => b.length - a.length);

function validatePhone(raw) {
  const val = (raw || "").trim();
  if (!/^\+?[0-9]+$/.test(val) || val.replace(/\+/g, "").length === 0) {
    return { valid: false, message: "El número debe ser solo dígitos, todo junto (puedes iniciar con +)." };
  }
  const digits = val.startsWith("+") ? val.slice(1) : val;
  if (digits.length < 8 || digits.length > 15) {
    return { valid: false, message: "Revisa la cantidad de dígitos: falta o sobra la cantidad de números." };
  }
  const code = COUNTRY_CODES.find((c) => digits.startsWith(c));
  if (!code) {
    return { valid: false, message: "El código de país/área no existe. Revisa tu número (ej: +51 para Perú)." };
  }
  const rest = digits.slice(code.length);
  if (rest.length < 5 || rest.length > 12) {
    return { valid: false, message: "El número después del código de país parece incompleto o inventado." };
  }
  return { valid: true, message: "" };
}

function waLink(phone) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function formatDate(v) {
  if (!v) return "—";
  try {
    const d = typeof v === "number" ? new Date(v) : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" });
  } catch { return String(v); }
}

async function syncDirectory(uid, data) {
  try { await setDoc(doc(db, "directory", uid), data, { merge: true }); } catch (e) {}
}

function firebaseErrorToMessage(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "Ese correo ya tiene una cuenta.";
  if (code.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (code.includes("invalid-email")) return "Correo electrónico inválido.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Contraseña incorrecta.";
  if (code.includes("user-not-found")) return "No existe una cuenta con ese correo.";
  if (code.includes("too-many-requests")) return "Demasiados intentos. Espera un momento.";
  return "Ocurrió un error. Intenta de nuevo.";
}

/* ---------------- UI atoms ---------------- */

function Field({ icon: Icon, label, hint, error, ...props }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">{label}</span>
      <div
        className={cx(
          "flex items-center gap-2 bg-[#1D1F2A] border rounded-lg px-3 py-2.5 focus-within:border-[#6C6CF0] transition-colors",
          error ? "border-[#E07A7A]" : "border-[#2A2C38]"
        )}
      >
        {Icon && <Icon size={16} className="text-[#6C6CF0] shrink-0" />}
        <input
          {...props}
          className="bg-transparent outline-none w-full text-[#F2F0EB] placeholder:text-[#5B5866] text-sm"
        />
      </div>
      {error ? (
        <span className="block text-[11px] text-[#E07A7A] mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-[#5B5866] mt-1">{hint}</span>
      ) : null}
    </label>
  );
}

function TextArea({ label, hint, error, ...props }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">{label}</span>
      <textarea
        {...props}
        rows={props.rows || 3}
        className={cx(
          "w-full bg-[#1D1F2A] border rounded-lg px-3 py-2.5 outline-none text-[#F2F0EB] placeholder:text-[#5B5866] text-sm focus:border-[#6C6CF0] transition-colors resize-none",
          error ? "border-[#E07A7A]" : "border-[#2A2C38]"
        )}
      />
      {error ? (
        <span className="block text-[11px] text-[#E07A7A] mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-[#5B5866] mt-1">{hint}</span>
      ) : null}
    </label>
  );
}

function PrimaryButton({ children, className, ...props }) {
  return (
    <button
      {...props}
      className={cx(
        "w-full flex items-center justify-center gap-2 bg-[#6C6CF0] hover:bg-[#5A5AE0] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg px-4 py-2.5 transition-colors",
        className
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, className, ...props }) {
  return (
    <button
      {...props}
      className={cx(
        "w-full flex items-center justify-center gap-2 border border-[#2A2C38] hover:border-[#6C6CF0] disabled:opacity-40 disabled:cursor-not-allowed text-[#F2F0EB] font-medium text-sm rounded-lg px-4 py-2.5 transition-colors",
        className
      )}
    >
      {children}
    </button>
  );
}

function Shell({ children, wide, withUserBar, compactHeader }) {
  return (
    <div className="min-h-screen w-full bg-[#0C0D12] text-[#F2F0EB] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full border border-[#2A2C38] opacity-40" />
      <div className="pointer-events-none absolute -top-10 -right-10 w-[300px] h-[300px] rounded-full border border-[#2A2C38] opacity-30" />
      <div
        className="pointer-events-none fixed inset-0 bg-center bg-no-repeat opacity-[0.06]"
        style={{ backgroundImage: `url(${argyraLogo})`, backgroundSize: "min(70vw, 620px)" }}
      />
      <div className={cx("relative z-10 min-h-screen flex flex-col items-center px-4 py-10", withUserBar && "pt-16")}>
        {!compactHeader && (
          <div className="mb-8 text-center">
            <div className="text-2xl tracking-[0.25em]" style={{ fontFamily: "'Cinzel', serif", color: "#C9A036" }}>
              ARGYRA
            </div>
            <div className="text-[11px] tracking-[0.2em] uppercase text-[#96939F] mt-1">
              Unión de comunidades
            </div>
          </div>
        )}
        <div className={cx("w-full", wide ? "max-w-lg" : "max-w-md")}>{children}</div>
      </div>
    </div>
  );
}

function ProgressDots({ step, total }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={cx("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-[#6C6CF0]" : "w-1.5 bg-[#2A2C38]")} />
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    "survey-pending": { text: "Formulario pendiente", color: "#96939F" },
    "terms-pending": { text: "Falta enviar solicitud", color: "#96939F" },
    submitted: { text: "En revisión", color: "#C9A036" },
    accepted: { text: "Aceptada", color: "#4E9A6B" },
    rejected: { text: "No aceptada", color: "#E07A7A" },
  };
  const s = map[status] || map["submitted"];
  return (
    <span className="text-xs px-2.5 py-1 rounded-full border" style={{ color: s.color, borderColor: s.color }}>
      {s.text}
    </span>
  );
}

function RoleBadge({ role }) {
  const r = ROLES[role] || ROLES.nuevo;
  return (
    <span className="text-xs px-2.5 py-1 rounded-full border" style={{ color: r.color, borderColor: r.color, background: `${r.color}1A` }}>
      {r.label}
    </span>
  );
}

function BranchChip({ branchKey, size = "xs" }) {
  const b = BRANCHES[branchKey];
  if (!b) return null;
  const Icon = b.icon;
  return (
    <span
      className={cx("inline-flex items-center gap-1 px-2 py-1 rounded-full border", size === "xs" ? "text-[11px]" : "text-xs")}
      style={{ color: b.color, borderColor: b.color, background: `${b.color}1A` }}
    >
      <Icon size={12} /> {b.label}
    </span>
  );
}

function SealBadge({ sello }) {
  if (!sello?.active) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border" style={{ color: "#C9A036", borderColor: "#C9A036", background: "#C9A0361A" }}>
      <Stamp size={12} /> Sello Argyra
      {sello.date ? <span className="text-[#96939F]">· {formatDate(sello.date)}</span> : null}
    </span>
  );
}

function StatusPill({ status }) {
  const active = status === "activa";
  return (
    <span
      className="text-[11px] px-2 py-1 rounded-full border"
      style={active ? { color: "#4E9A6B", borderColor: "#4E9A6B", background: "#4E9A6B1A" } : { color: "#E07A7A", borderColor: "#E07A7A", background: "#E07A7A1A" }}
    >
      {active ? "Activa" : "Expulsada"}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children, right }) {
  return (
    <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-4 mb-4">
      {title && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F2F0EB]">
            {Icon && <Icon size={16} className="text-[#6C6CF0]" />}
            {title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="text-sm text-[#5B5866] text-center py-8">{text}</div>;
}

function HelpButton({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ayuda de esta sección"
        className="w-7 h-6 shrink-0 flex items-center justify-center rounded-md border border-[#2A2C38] text-[#96939F] hover:border-[#6C6CF0] hover:text-[#6C6CF0] transition-colors"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <HelpCircle size={16} className="text-[#6C6CF0]" /> ¿Para qué es esta sección?
              </div>
              <button onClick={() => setOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md border border-[#2A2C38] text-[#96939F]">
                <X size={13} />
              </button>
            </div>
            <p className="text-sm text-[#96939F] leading-relaxed whitespace-pre-line">{text}</p>
          </div>
        </div>
      )}
    </>
  );
}

function TopBar({ title, onBack, right }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {onBack && (
        <button onClick={onBack} className="text-[#96939F] hover:text-[#F2F0EB]">
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="text-lg font-semibold flex-1">{title}</div>
      {right}
    </div>
  );
}

function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { key: "home", label: "Inicio", icon: Newspaper },
    { key: "communities", label: "Comunid.", icon: Building2 },
    { key: "team", label: "Ramas", icon: Users },
    { key: "pase", label: "Pase", icon: Stamp },
    { key: "leaders", label: "Líderes", icon: Crown },
    { key: "profile", label: "Perfil", icon: UserIcon },
  ];
  if (isAdmin) items.push({ key: "admin", label: "Admin", icon: Shield });
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#12131A]/95 backdrop-blur border-t border-[#2A2C38]">
      <div className="max-w-lg mx-auto grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              "min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 px-0.5 transition-colors",
              tab === key ? "text-[#6C6CF0]" : "text-[#5B5866] hover:text-[#96939F]"
            )}
          >
            <Icon size={17} />
            <span className="block w-full text-center text-[9px] leading-none whitespace-nowrap overflow-hidden text-ellipsis">
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopUserBar({ nick, role }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 bg-[#12131A]/95 backdrop-blur border-b border-[#2A2C38]">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-2">
        <span className="text-[11px] tracking-[0.2em] uppercase" style={{ fontFamily: "'Cinzel', serif", color: "#C9A036" }}>
          Argyra
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-[#F2F0EB] truncate max-w-[120px]">{nick}</span>
          <RoleBadge role={role} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Auth ---------------- */

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [nick, setNick] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleNickChange = (e) => {
    const v = e.target.value;
    setNick(mode === "register" ? sanitizeName(v) : v);
  };
  const handlePhoneChange = (e) => setPhone(sanitizePhone(e.target.value));

  const nickError = mode === "register" && nick.length > 0 && !isValidName(nick)
    ? "Solo letras, sin espacios ni símbolos." : "";
  const phoneCheck = mode === "register" && phone.length > 0 ? validatePhone(phone) : null;
  const phoneError = phoneCheck && !phoneCheck.valid ? phoneCheck.message : "";

  const submit = async () => {
    setError("");
    if (!nick.trim() || !password) { setError("Completa nick y contraseña."); return; }
    setBusy(true);
    const nickLower = nick.trim().toLowerCase();
    try {
      if (mode === "register") {
        if (!phone.trim() || !email.trim()) { setError("Completa tu número y tu correo electrónico."); setBusy(false); return; }
        if (!isValidName(nick.trim())) { setError("El nombre solo puede tener letras, sin espacios ni símbolos."); setBusy(false); return; }
        const phoneResult = validatePhone(phone.trim());
        if (!phoneResult.valid) { setError(phoneResult.message); setBusy(false); return; }
        const nameRef = doc(db, "usernames", nickLower);
        const nameSnap = await getDoc(nameRef);
        if (nameSnap.exists()) { setError("Ese nick ya está registrado. Prueba iniciar sesión."); setBusy(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, "users", cred.user.uid), {
          nick: nick.trim(),
          phone: phone.trim(),
          email: email.trim(),
          status: "survey-pending",
          affiliation: null,
          communityId: null,
          pendingCommunityName: "",
          pendingCommunityKind: "",
          motivation: "",
          role: "nuevo",
          branches: [],
          sello: { active: false, date: null },
          createdAt: Date.now(),
        });
        await setDoc(nameRef, { uid: cred.user.uid, email: email.trim() });
        await syncDirectory(cred.user.uid, { nick: nick.trim(), role: "nuevo", branches: [], communityId: null, status: "survey-pending", sello: { active: false } });
      } else {
        const nameSnap = await getDoc(doc(db, "usernames", nickLower));
        if (!nameSnap.exists()) { setError("No existe una cuenta con ese nick."); setBusy(false); return; }
        const { email: loginEmail } = nameSnap.data();
        await signInWithEmailAndPassword(auth, loginEmail, password);
      }
    } catch (e) { setError(firebaseErrorToMessage(e)); }
    setBusy(false);
  };

  return (
    <Shell>
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
        <div className="flex mb-6 bg-[#1D1F2A] rounded-lg p-1">
          <button onClick={() => setMode("login")} className={cx("flex-1 text-sm py-2 rounded-md transition-colors", mode === "login" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>Iniciar sesión</button>
          <button onClick={() => setMode("register")} className={cx("flex-1 text-sm py-2 rounded-md transition-colors", mode === "register" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>Registrarse</button>
        </div>

        <Field icon={UserIcon} label="Nick o nombre" placeholder="TuNombre" value={nick} onChange={handleNickChange} error={nickError}
          hint={mode === "register" && !nickError ? "Solo letras, sin espacios ni símbolos." : undefined} />
        <Field icon={Lock} label="Contraseña" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "register" && (
          <>
            <Field icon={Phone} label="Número de teléfono" placeholder="+51999999999" inputMode="tel" value={phone} onChange={handlePhoneChange} error={phoneError}
              hint={!phoneError ? "Todo junto, con código de país real (ej: +51...)." : undefined} />
            <Field icon={Mail} label="Correo electrónico (para recuperar tu cuenta)" type="email" placeholder="tucorreo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </>
        )}

        {error && <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-4"><AlertCircle size={14} /> {error}</div>}

        <PrimaryButton onClick={submit} disabled={busy || (mode === "register" && (!!nickError || !!phoneError))}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {mode === "register" ? "Comenzar el ingreso" : "Ingresar"}
          {!busy && <ChevronRight size={16} />}
        </PrimaryButton>
      </div>
    </Shell>
  );
}

/* ---------------- Ingreso: elegir afiliación (reemplaza la encuesta de rangos) ---------------- */

function IngresoScreen({ uid, onDone }) {
  const [step, setStep] = useState(0);
  const [affiliation, setAffiliation] = useState(""); // 'community' | 'new-community' | 'team'
  const [communities, setCommunities] = useState([]);
  const [communityId, setCommunityId] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("comunidad"); // 'comunidad' | 'independiente'
  const [motivation, setMotivation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "communities"), orderBy("name")));
        setCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.status !== "expulsada"));
      } catch (e) {}
    })();
  }, []);

  const next = () => {
    setError("");
    if (step === 0 && !affiliation) { setError("Elige una opción para continuar."); return; }
    if (step === 1) {
      if (affiliation === "community" && !communityId) { setError("Elige la comunidad o grupo al que perteneces."); return; }
      if (affiliation === "new-community" && !newName.trim()) { setError("Escribe el nombre de tu comunidad o grupo."); return; }
    }
    setStep((s) => s + 1);
  };
  const back = () => { setError(""); setStep((s) => Math.max(0, s - 1)); };

  const submit = async () => {
    setError("");
    if (!motivation.trim()) { setError("Cuéntanos brevemente tu motivación."); return; }
    setBusy(true);
    try {
      const payload = {
        affiliation,
        communityId: affiliation === "community" ? communityId : null,
        pendingCommunityName: affiliation === "new-community" ? newName.trim() : "",
        pendingCommunityKind: affiliation === "new-community" ? newKind : "",
        motivation: motivation.trim(),
        status: "terms-pending",
      };
      await updateDoc(doc(db, "users", uid), payload);
      await syncDirectory(uid, { status: "terms-pending" });
      onDone();
    } catch (e) { setError(firebaseErrorToMessage(e)); }
    setBusy(false);
  };

  const OPTIONS = [
    { key: "community", icon: Building2, title: "Ya soy parte de una comunidad o grupo afiliado", desc: "Te vinculamos a una comunidad ya registrada en Argyra." },
    { key: "new-community", icon: UserPlus, title: "Quiero afiliar mi comunidad o grupo a Argyra", desc: "Tu comunidad (o tu grupo independiente) entra por primera vez." },
    { key: "team", icon: Shield, title: "Quiero unirme directo al equipo de Argyra", desc: "Sin comunidad detrás: apoyas directo en una de las ramas." },
  ];

  return (
    <Shell>
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
        <ProgressDots step={step} total={3} />

        {step === 0 && (
          <>
            <div className="text-sm text-[#96939F] mb-4">¿Cómo te unes a Argyra?</div>
            <div className="space-y-2 mb-2">
              {OPTIONS.map((o) => {
                const Icon = o.icon;
                const active = affiliation === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => setAffiliation(o.key)}
                    className={cx("w-full text-left flex items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
                      active ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38] hover:border-[#5B5866]")}
                  >
                    <Icon size={18} className={active ? "text-[#6C6CF0]" : "text-[#96939F]"} />
                    <div>
                      <div className="text-sm font-medium">{o.title}</div>
                      <div className="text-xs text-[#96939F] mt-0.5">{o.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 1 && affiliation === "community" && (
          <>
            <div className="text-sm text-[#96939F] mb-4">Elige tu comunidad o grupo</div>
            {communities.length === 0 ? (
              <EmptyState text="Todavía no hay comunidades registradas. Elige otra opción." />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {communities.map((c) => (
                  <button key={c.id} onClick={() => setCommunityId(c.id)}
                    className={cx("w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      communityId === c.id ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38] hover:border-[#5B5866]")}>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-[#96939F]">{c.kind === "independiente" ? "Grupo independiente" : "Comunidad"}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 1 && affiliation === "new-community" && (
          <>
            <div className="text-sm text-[#96939F] mb-4">Cuéntanos de tu comunidad o grupo</div>
            <Field icon={Building2} label="Nombre de la comunidad o grupo" placeholder="Ej: Dynasty Ark Nexus" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="mb-4">
              <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Tipo</span>
              <div className="flex gap-2">
                <button onClick={() => setNewKind("comunidad")} className={cx("flex-1 text-sm py-2 rounded-lg border", newKind === "comunidad" ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38]")}>Comunidad (con subcomunidades)</button>
                <button onClick={() => setNewKind("independiente")} className={cx("flex-1 text-sm py-2 rounded-lg border", newKind === "independiente" ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38]")}>Grupo independiente</button>
              </div>
            </div>
            <div className="text-xs text-[#5B5866] mb-2">Un admin creará el registro formal y te asignará como líder al aprobar tu solicitud.</div>
          </>
        )}

        {step === 1 && affiliation === "team" && (
          <div className="text-sm text-[#96939F]">Te unirás directo al equipo de Argyra, sin comunidad. Luego podrás apoyar en la rama que elijas.</div>
        )}

        {step === 2 && (
          <>
            <div className="text-sm text-[#96939F] mb-4">Última pregunta</div>
            <TextArea label="¿Por qué quieres unirte a Argyra?" placeholder="Cuéntanos brevemente..." value={motivation} onChange={(e) => setMotivation(e.target.value)} rows={4} />
          </>
        )}

        {error && <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-4"><AlertCircle size={14} /> {error}</div>}

        <div className="flex gap-2 mt-2">
          {step > 0 && <GhostButton onClick={back} className="w-auto px-4"><ArrowLeft size={16} /></GhostButton>}
          {step < 2 ? (
            <PrimaryButton onClick={next}>Continuar <ChevronRight size={16} /></PrimaryButton>
          ) : (
            <PrimaryButton onClick={submit} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null} Continuar
            </PrimaryButton>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- Términos y envío de solicitud ---------------- */

function TermsScreen({ uid, onSubmitted }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!accepted) { setError("Debes aceptar para continuar."); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", uid), { status: "submitted" });
      await syncDirectory(uid, { status: "submitted" });
      onSubmitted();
    } catch (e) { setError(firebaseErrorToMessage(e)); }
    setBusy(false);
  };

  return (
    <Shell>
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
        <div className="text-sm font-semibold mb-2">Antes de enviar tu solicitud</div>
        <div className="text-xs text-[#96939F] leading-relaxed mb-4 space-y-2">
          <p>Al unirte a Argyra te comprometes a respetar a las demás comunidades y personas, seguir las normas de cada espacio y actuar de buena fe.</p>
          <p>Tu solicitud será revisada por un administrador, quien confirmará tu comunidad/grupo (o la registrará si es nueva) y tu rol inicial.</p>
        </div>
        <label className="flex items-start gap-2 mb-5 cursor-pointer">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
          <span className="text-sm text-[#F2F0EB]">Acepto y quiero enviar mi solicitud</span>
        </label>
        {error && <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-4"><AlertCircle size={14} /> {error}</div>}
        <PrimaryButton onClick={submit} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar solicitud
        </PrimaryButton>
      </div>
    </Shell>
  );
}

/* ---------------- Perfil ---------------- */

function ProfileScreen({ record, uid, onLogout, onSaved, community }) {
  const [phone, setPhone] = useState(record.phone || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const phoneCheck = phone.length > 0 ? validatePhone(phone) : null;
  const phoneError = phoneCheck && !phoneCheck.valid ? phoneCheck.message : "";

  const save = async () => {
    if (phoneError) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), { phone: phone.trim() });
      setMsg("Guardado.");
      onSaved();
    } catch (e) {}
    setSaving(false);
  };

  const waHref = waLink(record.phone);

  return (
    <div>
      <TopBar title="Mi perfil" right={<HelpButton text="Aquí ves y editas tu información: tu rango actual, tu comunidad (si tienes), el Sello Argyra y tu teléfono de contacto. También es donde cierras sesión." />} />
      <SectionCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[#1D1F2A] border border-[#2A2C38] flex items-center justify-center text-lg font-semibold" style={{ color: "#C9A036" }}>
            {(record.nick || "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{record.nick}</div>
            <div className="flex items-center gap-2 mt-1">
              <RoleBadge role={record.role} />
              <StatusBadge status={record.status} />
            </div>
          </div>
        </div>
        <SealBadge sello={record.sello} />
        {record.role === "coordinador" && record.branches?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {record.branches.map((b) => <BranchChip key={b} branchKey={b} />)}
          </div>
        )}
        <div className="text-sm text-[#96939F] mt-3">
          {community ? <>Comunidad: <span className="text-[#F2F0EB]">{community.name}</span></> : record.communityId === null && record.affiliation === "team" ? "Equipo directo de Argyra (sin comunidad)" : "Sin comunidad asignada aún"}
        </div>
      </SectionCard>

      <SectionCard title="Contacto" icon={Phone}>
        <Field icon={Phone} label="Teléfono" value={phone} onChange={(e) => setPhone(sanitizePhone(e.target.value))} error={phoneError} />
        {waHref && (
          <a href={waHref} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-[#4E9A6B] mb-3">
            <MessageCircle size={14} /> Abrir WhatsApp
          </a>
        )}
        {msg && <div className="text-xs text-[#4E9A6B] mb-3">{msg}</div>}
        <PrimaryButton onClick={save} disabled={saving || !!phoneError}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : "Guardar cambios"}
        </PrimaryButton>
      </SectionCard>

      <GhostButton onClick={onLogout} className="mt-2"><LogOut size={16} /> Cerrar sesión</GhostButton>
    </div>
  );
}

/* ---------------- Directorio Central (anuncios entre comunidades) ---------------- */

function DirectorioCentralScreen({ isAdmin, record, communities }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState("global");
  const [communityId, setCommunityId] = useState("");
  const [busy, setBusy] = useState(false);

  const canPost = isAdmin || record.role === "lider" || (record.role === "coordinador" && record.branches?.includes("relaciones"));

  useEffect(() => {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const publish = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "announcements"), {
        title: title.trim(), body: body.trim(),
        scope, communityId: scope === "community" ? communityId : null,
        authorUid: null, authorName: record.nick,
        createdAt: Date.now(),
      });
      setTitle(""); setBody(""); setShowForm(false);
    } catch (e) {}
    setBusy(false);
  };

  return (
    <div>
      <TopBar title="Directorio Central" right={
        <div className="flex items-center gap-1.5">
          {canPost && (
            <button onClick={() => setShowForm((s) => !s)} className="w-7 h-6 flex items-center justify-center rounded-md border border-[#2A2C38] text-[#6C6CF0] hover:border-[#6C6CF0]"><Plus size={15} /></button>
          )}
          <HelpButton text="Anuncios compartidos entre todas las comunidades de Argyra. Un anuncio puede ser para 'Toda Argyra' o dirigido a una comunidad específica. Publican aquí los admins, Líderes y Coordinadores de Relaciones Externas." />
        </div>
      } />
      <p className="text-xs text-[#5B5866] mb-4">Anuncios entre comunidades. Aquí se comparten novedades a toda Argyra o a comunidades específicas.</p>

      {showForm && (
        <SectionCard title="Nuevo anuncio" icon={Megaphone}>
          <Field label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del anuncio" />
          <TextArea label="Contenido" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe el anuncio..." />
          <div className="mb-4">
            <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Alcance</span>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setScope("global")} className={cx("flex-1 text-sm py-2 rounded-lg border", scope === "global" ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38]")}>Toda Argyra</button>
              <button onClick={() => setScope("community")} className={cx("flex-1 text-sm py-2 rounded-lg border", scope === "community" ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38]")}>Una comunidad</button>
            </div>
            {scope === "community" && (
              <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="w-full bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2.5 text-sm text-[#F2F0EB]">
                <option value="">Elige comunidad...</option>
                {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <PrimaryButton onClick={publish} disabled={busy || !title.trim() || !body.trim() || (scope === "community" && !communityId)}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Publicar
          </PrimaryButton>
        </SectionCard>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#96939F] justify-center py-8"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : items.length === 0 ? (
        <EmptyState text="Todavía no hay anuncios." />
      ) : (
        items.map((it) => (
          <SectionCard key={it.id}>
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-sm">{it.title}</div>
              {it.scope === "community" ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2A2C38] text-[#96939F]">
                  {communities.find((c) => c.id === it.communityId)?.name || "Comunidad"}
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#C9A036] text-[#C9A036]">Toda Argyra</span>
              )}
            </div>
            <div className="text-sm text-[#96939F] whitespace-pre-wrap mb-2">{it.body}</div>
            <div className="text-[11px] text-[#5B5866]">{it.authorName} · {formatDate(it.createdAt)}</div>
          </SectionCard>
        ))
      )}
    </div>
  );
}

/* ---------------- Comunidades ---------------- */

function CommunitiesScreen({ record, isAdmin }) {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [people, setPeople] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "communities"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      setCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "directory"));
    const unsub = onSnapshot(q, (snap) => setPeople(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))), () => {});
    return unsub;
  }, []);

  if (openId) {
    const c = communities.find((x) => x.id === openId);
    if (!c) { setOpenId(null); return null; }
    return <CommunityDetail community={c} onBack={() => setOpenId(null)} record={record} isAdmin={isAdmin}
      members={people.filter((p) => p.communityId === c.id)} />;
  }

  return (
    <div>
      <TopBar title="Comunidades" right={<HelpButton text="Lista de todas las comunidades y grupos independientes afiliados a Argyra. Toca cualquiera para ver su información (líder, embajadores, subcomunidades, estado) y, si tienes acceso, su Embajada privada." />} />
      <p className="text-xs text-[#5B5866] mb-4">Comunidades y grupos independientes afiliados a Argyra.</p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#96939F] justify-center py-8"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : communities.length === 0 ? (
        <EmptyState text="Todavía no hay comunidades registradas." />
      ) : (
        communities.map((c) => (
          <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full text-left">
            <SectionCard>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-sm flex items-center gap-2">
                  <Building2 size={15} className="text-[#6C6CF0]" /> {c.name}
                </div>
                <StatusPill status={c.status} />
              </div>
              <div className="text-xs text-[#96939F] mb-2">
                {c.kind === "independiente" ? "Grupo independiente" : `Comunidad · ${c.subcommunities?.length || 0} subcomunidad(es)`}
              </div>
              <div className="flex items-center gap-1.5 mb-2 text-xs" style={{ color: "#C9A036" }}>
                <Crown size={13} />
                <span>Admin/Líder: <span className="font-semibold">{c.leaderName || "Sin asignar"}</span></span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#5B5866]">
                <span>Sello: {formatDate(c.sealDate)}</span>
              </div>
            </SectionCard>
          </button>
        ))
      )}
    </div>
  );
}

function CommunityDetail({ community: c, onBack, record, isAdmin, members }) {
  const [tab, setTab] = useState("info");
  const canSeeEmbassy =
    isAdmin || record.role === "lider" ||
    (record.role === "coordinador" && record.branches?.includes("relaciones")) ||
    record.communityId === c.id;

  return (
    <div>
      <TopBar title={c.name} onBack={onBack} right={<HelpButton text="Información: datos de la comunidad (líder, embajadores, subcomunidades, fecha del Sello y estado) y sus miembros por rango. Embajada: espacio privado solo para miembros de esta comunidad, sus embajadores, Líderes y Coordinadores de Relaciones Externas." />} />
      <div className="flex mb-4 bg-[#1D1F2A] rounded-lg p-1">
        <button onClick={() => setTab("info")} className={cx("flex-1 text-xs py-2 rounded-md transition-colors", tab === "info" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>Información</button>
        {canSeeEmbassy && (
          <button onClick={() => setTab("embassy")} className={cx("flex-1 text-xs py-2 rounded-md transition-colors", tab === "embassy" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>Embajada</button>
        )}
      </div>

      {tab === "info" && (
        <>
          <SectionCard>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#96939F]">{c.kind === "independiente" ? "Grupo independiente" : "Comunidad"}</span>
              <StatusPill status={c.status} />
            </div>
            <div className="text-sm space-y-2">
              <div><span className="text-[#96939F]">Líder:</span> {c.leaderName || "—"}
                {c.leaderPhone && <a href={waLink(c.leaderPhone)} target="_blank" rel="noreferrer" className="ml-2 text-[#4E9A6B] text-xs inline-flex items-center gap-1"><MessageCircle size={12} />WhatsApp</a>}
              </div>
              {c.kind === "comunidad" && (
                <>
                  <div><span className="text-[#96939F]">Embajador titular:</span> {c.ambassadorMainName || "—"}</div>
                  <div><span className="text-[#96939F]">Embajador suplente:</span> {c.ambassadorAltName || "—"}</div>
                </>
              )}
              <div><span className="text-[#96939F]">Fecha del Sello:</span> {formatDate(c.sealDate)}</div>
              {c.notes && <div className="text-xs text-[#96939F] italic mt-2">{c.notes}</div>}
            </div>
          </SectionCard>

          {c.kind === "comunidad" && (
            <SectionCard title="Subcomunidades" icon={Landmark}>
              {(!c.subcommunities || c.subcommunities.length === 0) ? (
                <EmptyState text="Sin subcomunidades registradas." />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {c.subcommunities.map((s, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-[#2A2C38] text-[#96939F]">{s}</span>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard title="Miembros" icon={Users}>
            {members.length === 0 ? <EmptyState text="Sin miembros registrados todavía." /> : (
              <div className="space-y-2">
                {ROLE_ORDER.map((rk) => {
                  const list = members.filter((m) => m.role === rk);
                  if (list.length === 0) return null;
                  return (
                    <div key={rk}>
                      <div className="text-[11px] uppercase tracking-wide text-[#5B5866] mb-1">{ROLES[rk].label}</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {list.map((m) => (
                          <span key={m.uid} className="text-xs px-2.5 py-1 rounded-full border border-[#2A2C38] flex items-center gap-1">
                            {m.nick}
                            {m.sello?.active && <Stamp size={11} style={{ color: "#C9A036" }} />}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {tab === "embassy" && <EmbassyPanel communityId={c.id} record={record} />}
    </div>
  );
}

/* ---------------- Embajada: espacio privado por comunidad ---------------- */

function EmbassyPanel({ communityId, record }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "communities", communityId, "embassy"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [communityId]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "communities", communityId, "embassy"), {
        authorName: record.nick, body: body.trim(), createdAt: Date.now(),
      });
      setBody("");
    } catch (e) {}
    setBusy(false);
  };

  return (
    <SectionCard title="Espacio de la Embajada" icon={Landmark}>
      <p className="text-xs text-[#5B5866] mb-3">Espacio privado: solo lo ven los miembros de esta comunidad, sus embajadores, Relaciones Externas y Líderes.</p>
      <div className="flex gap-2 mb-4">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un mensaje..."
          className="flex-1 bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#6C6CF0]" />
        <button onClick={send} disabled={busy || !body.trim()} className="bg-[#6C6CF0] disabled:opacity-40 rounded-lg px-3"><Send size={16} /></button>
      </div>
      {loading ? (
        <div className="text-sm text-[#96939F] text-center py-4"><Loader2 size={16} className="animate-spin inline" /></div>
      ) : items.length === 0 ? (
        <EmptyState text="Sin mensajes todavía." />
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {items.map((m) => (
            <div key={m.id} className="bg-[#1D1F2A] rounded-lg px-3 py-2">
              <div className="text-xs font-medium text-[#C9A036]">{m.authorName}</div>
              <div className="text-sm whitespace-pre-wrap">{m.body}</div>
              <div className="text-[10px] text-[#5B5866] mt-1">{formatDate(m.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ---------------- Equipo (ramas funcionales de Argyra) ---------------- */

function BranchCard({ bk, coords, info, isAdmin }) {
  const b = BRANCHES[bk];
  const Icon = b.icon;
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState(info?.link || "");
  const [text, setText] = useState(info?.info || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "branchInfo", bk), { link: link.trim(), info: text.trim() }, { merge: true });
      setEditing(false);
    } catch (e) {}
    setSaving(false);
  };

  return (
    <SectionCard title={b.label} icon={Icon} right={isAdmin && (
      <button onClick={() => setEditing((s) => !s)} className="w-7 h-6 flex items-center justify-center rounded-md border border-[#2A2C38] text-[#96939F] hover:border-[#6C6CF0] hover:text-[#6C6CF0]">
        <Settings size={13} />
      </button>
    )}>
      <p className="text-xs text-[#96939F] mb-2">{info?.info?.trim() ? info.info : b.blurb}</p>
      {info?.link ? (
        <a href={info.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#6C6CF0] mb-3">
          <ExternalLink size={12} /> Enlace del grupo
        </a>
      ) : null}

      {editing && (
        <div className="mb-3 border-t border-[#2A2C38] pt-3">
          <Field label="Enlace del grupo (WhatsApp, Discord, etc.)" placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
          <TextArea label="Descripción de la rama" value={text} onChange={(e) => setText(e.target.value)} placeholder={b.blurb} />
          <PrimaryButton onClick={save} disabled={saving} className="py-1.5 text-xs">{saving ? <Loader2 size={14} className="animate-spin" /> : "Guardar"}</PrimaryButton>
        </div>
      )}

      <div className="text-[11px] uppercase tracking-wide text-[#5B5866] mb-1">Coordinadores</div>
      {coords.length === 0 ? (
        <div className="text-xs text-[#5B5866]">Sin coordinador asignado.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {coords.map((p) => <span key={p.uid} className="text-xs px-2.5 py-1 rounded-full border" style={{ color: b.color, borderColor: b.color }}>{p.nick}</span>)}
        </div>
      )}
    </SectionCard>
  );
}

function TeamScreen({ isAdmin }) {
  const [people, setPeople] = useState([]);
  const [branchInfo, setBranchInfo] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "directory"));
    const unsub = onSnapshot(q, (snap) => {
      setPeople(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "branchInfo"), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setBranchInfo(map);
    }, () => {});
    return unsub;
  }, []);

  const accepted = people.filter((p) => p.status === "accepted");
  const direct = accepted.filter((p) => !p.communityId);

  return (
    <div>
      <TopBar title="Ramas de Argyra" right={<HelpButton text="Las 5 ramas funcionales que sostienen el proyecto: Laboratorio, Guardia y Expansión, Relaciones Externas, Comunidad Casual y Publicidad. Aquí ves para qué sirve cada una, su enlace de grupo (si lo tiene) y quién la coordina." />} />
      <p className="text-xs text-[#5B5866] mb-4">El equipo que sostiene el proyecto, organizado por rama funcional.</p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#96939F] justify-center py-8"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : (
        BRANCH_ORDER.map((bk) => {
          const coords = accepted.filter((p) => p.role === "coordinador" && p.branches?.includes(bk));
          return <BranchCard key={bk} bk={bk} coords={coords} info={branchInfo[bk]} isAdmin={isAdmin} />;
        })
      )}
      <SectionCard title="Equipo directo (sin comunidad)" icon={Users}>
        {direct.length === 0 ? <EmptyState text="Nadie registrado directo al equipo todavía." /> : (
          <div className="space-y-2">
            {ROLE_ORDER.map((rk) => {
              const list = direct.filter((p) => p.role === rk);
              if (list.length === 0) return null;
              return (
                <div key={rk}>
                  <div className="text-[11px] uppercase tracking-wide text-[#5B5866] mb-1">{ROLES[rk].label}</div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {list.map((p) => <span key={p.uid} className="text-xs px-2.5 py-1 rounded-full border border-[#2A2C38]">{p.nick}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ---------------- Líderes (autoridad máxima del proyecto) ---------------- */

function LeadersScreen() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [communities, setCommunities] = useState({});

  useEffect(() => {
    const q = query(collection(db, "directory"));
    const unsub = onSnapshot(q, (snap) => {
      setPeople(snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((p) => p.status === "accepted"));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "communities"));
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data().name; });
      setCommunities(map);
    })();
  }, []);

  const leaders = people.filter((p) => p.role === "lider");
  const communityCoordinators = people.filter((p) => p.role === "coordinador" && p.communityId);
  const byCommunity = {};
  communityCoordinators.forEach((p) => {
    if (!byCommunity[p.communityId]) byCommunity[p.communityId] = [];
    byCommunity[p.communityId].push(p);
  });

  return (
    <div>
      <TopBar title="Líderes" right={<HelpButton text="Los Líderes son la autoridad máxima de todo el proyecto Argyra, vengan de una comunidad o del equipo directo. Abajo también verás a los Coordinadores que pertenecen a cada comunidad." />} />
      <p className="text-xs text-[#5B5866] mb-4">Autoridad máxima de todo el proyecto Argyra.</p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#96939F] justify-center py-8"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : (
        <>
          {leaders.length === 0 ? (
            <EmptyState text="Sin líderes registrados todavía." />
          ) : (
            leaders.map((p) => (
              <SectionCard key={p.uid}>
                <div className="flex items-center gap-3">
                  <Crown size={20} style={{ color: "#C9A036" }} />
                  <div>
                    <div className="font-semibold text-sm">{p.nick}</div>
                    <div className="text-xs text-[#96939F]">{p.communityId ? communities[p.communityId] || "Comunidad" : "Equipo directo de Argyra"}</div>
                  </div>
                </div>
              </SectionCard>
            ))
          )}

          <div className="text-sm font-semibold mt-6 mb-2">Coordinadores por comunidad</div>
          {Object.keys(byCommunity).length === 0 ? (
            <EmptyState text="Ninguna comunidad tiene Coordinadores todavía." />
          ) : (
            Object.entries(byCommunity).map(([cid, coords]) => (
              <SectionCard key={cid} title={communities[cid] || "Comunidad"} icon={Building2}>
                <div className="space-y-1.5">
                  {coords.map((p) => (
                    <div key={p.uid} className="flex items-center justify-between text-sm">
                      <span>{p.nick}</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {(p.branches || []).map((bk) => <BranchChip key={bk} branchKey={bk} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ))
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- Sistema de pase: solicitar Coordinador ---------------- */

function PaseScreen({ record, uid }) {
  const [branch, setBranch] = useState("");
  const [motivation, setMotivation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "passRequests"), where("uid", "==", uid));
    const unsub = onSnapshot(q, (snap) => setMyRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return unsub;
  }, [uid]);

  const myBranches = record.branches || [];
  const pendingBranches = myRequests.filter((r) => r.status === "pending").map((r) => r.branchRequested);
  const availableBranches = BRANCH_ORDER.filter((bk) => !myBranches.includes(bk) && !pendingBranches.includes(bk));
  const isLeader = record.role === "lider";

  const submit = async () => {
    setError("");
    if (!branch) { setError("Elige la rama que quieres coordinar."); return; }
    if (!motivation.trim()) { setError("Cuéntanos por qué quieres el pase."); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, "passRequests"), {
        uid, name: record.nick, branchRequested: branch, motivation: motivation.trim(),
        status: "pending", reviewedBy: null, createdAt: Date.now(),
      });
      setBranch(""); setMotivation("");
    } catch (e) { setError(firebaseErrorToMessage(e)); }
    setBusy(false);
  };

  return (
    <div>
      <TopBar title="Sistema de pase" right={<HelpButton text="Aquí pides subir de rango a Coordinador de una rama. Puedes postular a más de una rama: llena el formulario explicando por qué, y un admin revisa cada solicitud por separado." />} />
      <p className="text-xs text-[#5B5866] mb-4">Formulario para validar tu liderazgo antes de entrar como Coordinador de una rama. Puedes postular a varias ramas.</p>

      {myBranches.length > 0 && (
        <SectionCard title="Ya coordinas" icon={CheckCircle2}>
          <div className="flex flex-wrap gap-1.5">
            {myBranches.map((bk) => <BranchChip key={bk} branchKey={bk} />)}
          </div>
        </SectionCard>
      )}

      {isLeader ? (
        <SectionCard><div className="text-sm text-[#4E9A6B] flex items-center gap-2"><CheckCircle2 size={16} /> Ya eres Líder, tienes autoridad sobre todas las ramas.</div></SectionCard>
      ) : availableBranches.length === 0 ? (
        <SectionCard><div className="text-sm text-[#C9A036] flex items-center gap-2"><Loader2 size={16} /> No tienes ramas disponibles para postular ahora mismo (ya las coordinas o están en revisión).</div></SectionCard>
      ) : (
        <SectionCard title="Solicitar pase" icon={Stamp}>
          <div className="mb-4">
            <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Rama que quieres coordinar</span>
            <div className="grid grid-cols-1 gap-2">
              {availableBranches.map((bk) => {
                const b = BRANCHES[bk];
                const active = branch === bk;
                return (
                  <button key={bk} onClick={() => setBranch(bk)} className={cx("text-left text-sm px-3 py-2 rounded-lg border flex items-center gap-2", active ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38]")}>
                    <b.icon size={15} style={{ color: b.color }} /> {b.label}
                  </button>
                );
              })}
            </div>
          </div>
          <TextArea label="Motivación" value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="¿Por qué deberías coordinar esta rama?" />
          {error && <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-4"><AlertCircle size={14} /> {error}</div>}
          <PrimaryButton onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : "Enviar pase"}</PrimaryButton>
        </SectionCard>
      )}

      {pendingBranches.length > 0 && (
        <SectionCard title="En revisión" icon={Loader2}>
          <div className="flex flex-wrap gap-1.5">
            {pendingBranches.map((bk) => <BranchChip key={bk} branchKey={bk} />)}
          </div>
        </SectionCard>
      )}

      {myRequests.filter((r) => r.status !== "pending").length > 0 && (
        <SectionCard title="Historial" icon={ClipboardList}>
          {myRequests.filter((r) => r.status !== "pending").map((r) => (
            <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-[#2A2C38] last:border-0">
              <span>{BRANCHES[r.branchRequested]?.label}</span>
              {r.status === "approved" ? <span className="text-[#4E9A6B] text-xs">Aprobado</span> : <span className="text-[#E07A7A] text-xs">Rechazado</span>}
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  );
}

/* ---------------- Admin: gestión de comunidades ---------------- */

function CommunityForm({ initial, onSave, onCancel, people }) {
  const [name, setName] = useState(initial?.name || "");
  const [kind, setKind] = useState(initial?.kind || "comunidad");
  const [subsText, setSubsText] = useState((initial?.subcommunities || []).join(", "));
  const [leaderUid, setLeaderUid] = useState(initial?.leaderUid || "");
  const [ambassadorMainUid, setAmbassadorMainUid] = useState(initial?.ambassadorMainUid || "");
  const [ambassadorAltUid, setAmbassadorAltUid] = useState(initial?.ambassadorAltUid || "");
  const [sealDate, setSealDate] = useState(initial?.sealDate ? String(initial.sealDate).slice(0, 10) : "");
  const [status, setStatus] = useState(initial?.status || "activa");
  const [notes, setNotes] = useState(initial?.notes || "");

  const findPerson = (uid) => people.find((p) => p.uid === uid);

  const save = () => {
    if (!name.trim()) return;
    const leader = findPerson(leaderUid);
    const ambMain = findPerson(ambassadorMainUid);
    const ambAlt = findPerson(ambassadorAltUid);
    onSave({
      name: name.trim(),
      kind,
      subcommunities: kind === "comunidad" ? subsText.split(",").map((s) => s.trim()).filter(Boolean) : [],
      leaderUid: leaderUid || null,
      leaderName: leader?.nick || "",
      leaderPhone: leader?.phone || "",
      ambassadorMainUid: ambassadorMainUid || null,
      ambassadorMainName: ambMain?.nick || "",
      ambassadorAltUid: ambassadorAltUid || null,
      ambassadorAltName: ambAlt?.nick || "",
      sealDate: sealDate || null,
      status,
      notes: notes.trim(),
    });
  };

  return (
    <SectionCard title={initial ? "Editar comunidad" : "Nueva comunidad / grupo"} icon={Building2}>
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="mb-4">
        <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Tipo</span>
        <div className="flex gap-2">
          <button onClick={() => setKind("comunidad")} className={cx("flex-1 text-sm py-2 rounded-lg border", kind === "comunidad" ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38]")}>Comunidad</button>
          <button onClick={() => setKind("independiente")} className={cx("flex-1 text-sm py-2 rounded-lg border", kind === "independiente" ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38]")}>Grupo independiente</button>
        </div>
      </div>
      {kind === "comunidad" && (
        <Field label="Subcomunidades (separadas por coma)" value={subsText} onChange={(e) => setSubsText(e.target.value)} placeholder="Alfa, Beta, Gamma" />
      )}
      <label className="block mb-4">
        <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Líder</span>
        <select value={leaderUid} onChange={(e) => setLeaderUid(e.target.value)} className="w-full bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2.5 text-sm text-[#F2F0EB]">
          <option value="">Sin asignar</option>
          {people.map((p) => <option key={p.uid} value={p.uid}>{p.nick}</option>)}
        </select>
      </label>
      {kind === "comunidad" && (
        <>
          <label className="block mb-4">
            <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Embajador titular</span>
            <select value={ambassadorMainUid} onChange={(e) => setAmbassadorMainUid(e.target.value)} className="w-full bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2.5 text-sm text-[#F2F0EB]">
              <option value="">Sin asignar</option>
              {people.map((p) => <option key={p.uid} value={p.uid}>{p.nick}</option>)}
            </select>
          </label>
          <label className="block mb-4">
            <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Embajador suplente</span>
            <select value={ambassadorAltUid} onChange={(e) => setAmbassadorAltUid(e.target.value)} className="w-full bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2.5 text-sm text-[#F2F0EB]">
              <option value="">Sin asignar</option>
              {people.map((p) => <option key={p.uid} value={p.uid}>{p.nick}</option>)}
            </select>
          </label>
        </>
      )}
      <Field label="Fecha del Sello" type="date" value={sealDate} onChange={(e) => setSealDate(e.target.value)} />
      <div className="mb-4">
        <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Estado</span>
        <div className="flex gap-2">
          <button onClick={() => setStatus("activa")} className={cx("flex-1 text-sm py-2 rounded-lg border", status === "activa" ? "border-[#4E9A6B] bg-[#4E9A6B]/10 text-[#4E9A6B]" : "border-[#2A2C38]")}>Activa</button>
          <button onClick={() => setStatus("expulsada")} className={cx("flex-1 text-sm py-2 rounded-lg border", status === "expulsada" ? "border-[#E07A7A] bg-[#E07A7A]/10 text-[#E07A7A]" : "border-[#2A2C38]")}>Expulsada</button>
        </div>
      </div>
      <TextArea label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2">
        <GhostButton onClick={onCancel}>Cancelar</GhostButton>
        <PrimaryButton onClick={save}>Guardar</PrimaryButton>
      </div>
    </SectionCard>
  );
}

function CommunitiesManager({ people }) {
  const [communities, setCommunities] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | community obj
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "communities"), (snap) => setCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return unsub;
  }, []);

  const save = async (data) => {
    if (editing === "new") await addDoc(collection(db, "communities"), { ...data, createdAt: Date.now() });
    else await updateDoc(doc(db, "communities", editing.id), data);
    setEditing(null);
  };
  const remove = async (id) => { if (confirm("¿Eliminar esta comunidad?")) await deleteDoc(doc(db, "communities", id)); };

  if (editing) return <CommunityForm initial={editing === "new" ? null : editing} onSave={save} onCancel={() => setEditing(null)} people={people} />;

  return (
    <SectionCard title="Comunidades y grupos" icon={Building2} right={
      <button onClick={() => setEditing("new")} className="text-[#6C6CF0]"><Plus size={18} /></button>
    }>
      {communities.length === 0 ? <EmptyState text="Sin comunidades todavía." /> : communities.map((c) => (
        <div key={c.id} className="flex items-center justify-between py-2 border-b border-[#2A2C38] last:border-0">
          <div>
            <div className="text-sm font-medium">{c.name}</div>
            <div className="text-xs text-[#96939F]">{c.kind} · {c.leaderName || "sin líder"}</div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={c.status} />
            <button onClick={() => setEditing(c)} className="text-[#6C6CF0] text-xs">Editar</button>
            <button onClick={() => remove(c.id)} className="text-[#E07A7A]"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

/* ---------------- Admin: gestión de personas ---------------- */

function PersonRow({ user, communities }) {
  const [role, setRole] = useState(user.role || "nuevo");
  const [branches, setBranches] = useState(user.branches || []);
  const [communityId, setCommunityId] = useState(user.communityId || "");
  const [sealActive, setSealActive] = useState(user.sello?.active ?? false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { ok: bool, text: string }

  const toggleBranch = (b) => setBranches((bs) => bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    const sello = { active: sealActive, date: sealActive ? (user.sello?.date || new Date().toISOString()) : null };
    const payload = {
      role, branches: role === "coordinador" ? branches : [],
      communityId: communityId || null, sello,
    };
    try {
      await updateDoc(doc(db, "users", user.uid), payload);
      await setDoc(doc(db, "directory", user.uid), {
        role: payload.role, branches: payload.branches, communityId: payload.communityId, sello,
      }, { merge: true });
      setFeedback({ ok: true, text: "Guardado." });
    } catch (e) {
      setFeedback({ ok: false, text: firebaseErrorToMessage(e) || "No se pudo guardar." });
    }
    setSaving(false);
  };

  return (
    <div className="border-b border-[#2A2C38] last:border-0 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{user.nick}</div>
        <RoleBadge role={role} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-2 py-1.5 text-xs">
          {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
        </select>
        <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-2 py-1.5 text-xs">
          <option value="">Sin comunidad (equipo)</option>
          {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {role === "coordinador" && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {BRANCH_ORDER.map((bk) => (
            <button key={bk} onClick={() => toggleBranch(bk)} className={cx("text-[11px] px-2 py-1 rounded-full border", branches.includes(bk) ? "border-[#6C6CF0] text-[#6C6CF0]" : "border-[#2A2C38] text-[#96939F]")}>
              {BRANCHES[bk].label}
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer">
        <input type="checkbox" checked={sealActive} onChange={(e) => setSealActive(e.target.checked)} />
        Sello Argyra activo
      </label>
      {feedback && (
        <div className={cx("text-xs mb-2", feedback.ok ? "text-[#4E9A6B]" : "text-[#E07A7A]")}>{feedback.text}</div>
      )}
      <PrimaryButton onClick={save} disabled={saving} className="py-1.5 text-xs">
        {saving ? <Loader2 size={14} className="animate-spin" /> : "Guardar"}
      </PrimaryButton>
    </div>
  );
}

function PeopleManager({ communities }) {
  const [people, setPeople] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "users")), (snap) => setPeople(snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((p) => p.status === "accepted")), () => {});
    return unsub;
  }, []);
  return (
    <SectionCard title="Personas (rol, comunidad, rama, sello)" icon={Users}>
      {people.length === 0 ? <EmptyState text="Sin personas aceptadas todavía." /> : people.map((p) => <PersonRow key={p.uid} user={p} communities={communities} />)}
    </SectionCard>
  );
}

/* ---------------- Admin: solicitudes de ingreso ---------------- */

function RequestsManager({ communities }) {
  const [requests, setRequests] = useState([]);
  const [busyUid, setBusyUid] = useState(null);
  const [errors, setErrors] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "users")), (snap) => setRequests(snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((p) => p.status === "submitted")), () => {});
    return unsub;
  }, []);

  const accept = async (u) => {
    setBusyUid(u.uid);
    setErrors((e) => ({ ...e, [u.uid]: null }));
    try {
      let communityId = u.communityId || null;
      let role = "nuevo";
      if (u.affiliation === "new-community" && u.pendingCommunityName) {
        const ref = await addDoc(collection(db, "communities"), {
          name: u.pendingCommunityName, kind: u.pendingCommunityKind || "comunidad",
          subcommunities: [], leaderUid: u.uid, leaderName: u.nick, leaderPhone: u.phone || "",
          ambassadorMainUid: null, ambassadorMainName: "", ambassadorAltUid: null, ambassadorAltName: "",
          sealDate: new Date().toISOString(), status: "activa", notes: "", createdAt: Date.now(),
        });
        communityId = ref.id;
        role = "lider";
      }
      const sello = { active: true, date: new Date().toISOString() };
      await updateDoc(doc(db, "users", u.uid), { status: "accepted", communityId, role, sello });
      await setDoc(doc(db, "directory", u.uid), { status: "accepted", communityId, role, sello, branches: [], nick: u.nick }, { merge: true });
    } catch (e) {
      setErrors((er) => ({ ...er, [u.uid]: firebaseErrorToMessage(e) || "No se pudo aceptar." }));
    }
    setBusyUid(null);
  };
  const reject = async (u) => {
    setBusyUid(u.uid);
    setErrors((e) => ({ ...e, [u.uid]: null }));
    try {
      await updateDoc(doc(db, "users", u.uid), { status: "rejected" });
      await setDoc(doc(db, "directory", u.uid), { status: "rejected" }, { merge: true });
    } catch (e) {
      setErrors((er) => ({ ...er, [u.uid]: firebaseErrorToMessage(e) || "No se pudo rechazar." }));
    }
    setBusyUid(null);
  };

  return (
    <SectionCard title="Solicitudes pendientes" icon={ClipboardList}>
      {requests.length === 0 ? <EmptyState text="Sin solicitudes pendientes." /> : requests.map((u) => (
        <div key={u.uid} className="border-b border-[#2A2C38] last:border-0 py-3">
          <div className="text-sm font-medium">{u.nick}</div>
          <div className="text-xs text-[#96939F] mb-1">
            {u.affiliation === "community" ? `Comunidad: ${communities.find((c) => c.id === u.communityId)?.name || "—"}`
              : u.affiliation === "new-community" ? `Nueva comunidad/grupo: ${u.pendingCommunityName} (${u.pendingCommunityKind})`
              : "Equipo directo de Argyra"}
          </div>
          {u.motivation && <div className="text-xs text-[#5B5866] italic mb-2">"{u.motivation}"</div>}
          {errors[u.uid] && <div className="text-xs text-[#E07A7A] mb-2">{errors[u.uid]}</div>}
          <div className="flex gap-2">
            <button onClick={() => accept(u)} disabled={busyUid === u.uid} className="flex-1 text-xs py-1.5 rounded-lg bg-[#4E9A6B] disabled:opacity-50 text-white flex items-center justify-center gap-1">
              {busyUid === u.uid ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Aceptar
            </button>
            <button onClick={() => reject(u)} disabled={busyUid === u.uid} className="flex-1 text-xs py-1.5 rounded-lg border border-[#E07A7A] disabled:opacity-50 text-[#E07A7A] flex items-center justify-center gap-1">
              {busyUid === u.uid ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Rechazar
            </button>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

/* ---------------- Admin: pases (Coordinador) ---------------- */

function PassesManager() {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "passRequests"), where("status", "==", "pending")), (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return unsub;
  }, []);

  const approve = async (r) => {
    await updateDoc(doc(db, "passRequests", r.id), { status: "approved" });
    const uSnap = await getDoc(doc(db, "users", r.uid));
    const current = uSnap.exists() ? uSnap.data() : {};
    const branches = Array.from(new Set([...(current.branches || []), r.branchRequested]));
    await updateDoc(doc(db, "users", r.uid), { role: "coordinador", branches });
    await syncDirectory(r.uid, { role: "coordinador", branches });
  };
  const reject = async (r) => { await updateDoc(doc(db, "passRequests", r.id), { status: "rejected" }); };

  return (
    <SectionCard title="Pases pendientes (Coordinador)" icon={Stamp}>
      {requests.length === 0 ? <EmptyState text="Sin pases pendientes." /> : requests.map((r) => (
        <div key={r.id} className="border-b border-[#2A2C38] last:border-0 py-3">
          <div className="text-sm font-medium">{r.name} · {BRANCHES[r.branchRequested]?.label}</div>
          <div className="text-xs text-[#5B5866] italic mb-2">"{r.motivation}"</div>
          <div className="flex gap-2">
            <button onClick={() => approve(r)} className="flex-1 text-xs py-1.5 rounded-lg bg-[#4E9A6B] text-white flex items-center justify-center gap-1"><CheckCircle2 size={13} /> Aprobar</button>
            <button onClick={() => reject(r)} className="flex-1 text-xs py-1.5 rounded-lg border border-[#E07A7A] text-[#E07A7A] flex items-center justify-center gap-1"><XCircle size={13} /> Rechazar</button>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

/* ---------------- Admin: administradores ---------------- */

function AdminsManager({ currentUid, isSuperAdmin }) {
  const [admins, setAdmins] = useState([]);
  const [nick, setNick] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "admins"), (snap) => setAdmins(snap.docs.map((d) => d.id)), () => {});
    return unsub;
  }, []);

  const grant = async () => {
    setError("");
    const nameSnap = await getDoc(doc(db, "usernames", nick.trim().toLowerCase()));
    if (!nameSnap.exists()) { setError("No existe ese nick."); return; }
    const { uid } = nameSnap.data();
    await setDoc(doc(db, "admins", uid), { grantedAt: Date.now(), grantedBy: currentUid });
    setNick("");
  };
  const revoke = async (uid) => { await deleteDoc(doc(db, "admins", uid)); };

  return (
    <SectionCard title="Administradores" icon={Shield}>
      <div className="flex gap-2 mb-3">
        <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="nick" className="flex-1 bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2 text-sm" />
        <button onClick={grant} className="bg-[#6C6CF0] text-white text-xs px-3 rounded-lg">Otorgar</button>
      </div>
      {error && <div className="text-xs text-[#E07A7A] mb-2">{error}</div>}
      <div className="space-y-1">
        {admins.map((uid) => (
          <div key={uid} className="flex items-center justify-between text-xs py-1">
            <span className="text-[#96939F]">{uid}</span>
            {uid !== currentUid && <button onClick={() => revoke(uid)} className="text-[#E07A7A]"><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ---------------- Panel de Admin ---------------- */

function AdminPanel({ onExit, currentUid, isSuperAdmin, nick, role }) {
  const [section, setSection] = useState("requests");
  const [communities, setCommunities] = useState([]);
  const [people, setPeople] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "communities"), (snap) => setCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return unsub;
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "users")), (snap) => setPeople(snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((p) => p.status === "accepted")), () => {});
    return unsub;
  }, []);

  const sections = [
    { key: "requests", label: "Solicitudes", icon: ClipboardList },
    { key: "communities", label: "Comunidades", icon: Building2 },
    { key: "people", label: "Personas", icon: Users },
    { key: "passes", label: "Pases", icon: Stamp },
    { key: "admins", label: "Admins", icon: Shield },
  ];

  return (
    <Shell wide withUserBar compactHeader>
      <TopUserBar nick={nick} role={role} />
      <div className="w-full pb-4">
        <TopBar title="Panel de administración" onBack={onExit} right={<HelpButton text="Panel solo para admins. Solicitudes: acepta o rechaza ingresos nuevos. Comunidades: crea/edita comunidades y grupos. Personas: asigna rol, comunidad, rama y Sello. Pases: aprueba solicitudes de Coordinador. Admins: otorga o quita acceso de administrador." />} />
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {sections.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={cx("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap", section === s.key ? "border-[#6C6CF0] text-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38] text-[#96939F]")}>
              <s.icon size={13} /> {s.label}
            </button>
          ))}
        </div>
        {section === "requests" && <RequestsManager communities={communities} />}
        {section === "communities" && <CommunitiesManager people={people} />}
        {section === "people" && <PeopleManager communities={communities} />}
        {section === "passes" && <PassesManager />}
        {section === "admins" && <AdminsManager currentUid={currentUid} isSuperAdmin={isSuperAdmin} />}
      </div>
    </Shell>
  );
}

function NoAdminAccess({ onExit }) {
  return (
    <Shell>
      <SectionCard>
        <div className="text-sm text-[#E07A7A] mb-3">No tienes acceso de administrador.</div>
        <GhostButton onClick={onExit}>Volver</GhostButton>
      </SectionCard>
    </Shell>
  );
}

/* ---------------- App raíz ---------------- */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [record, setRecord] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTabState] = useState(() => {
    try { return localStorage.getItem("argyra_tab") || "home"; } catch (e) { return "home"; }
  });
  const setTab = useCallback((next) => {
    setTabState(next);
    try { localStorage.setItem("argyra_tab", next); } catch (e) {}
  }, []);
  const [community, setCommunity] = useState(null);
  const [communities, setCommunities] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        const data = snap.exists() ? snap.data() : null;
        setRecord(data);

        if (data?.nick && data.nick.trim().toLowerCase() === "indrhack") {
          try {
            const adminSnap = await getDoc(doc(db, "admins", fbUser.uid));
            if (!adminSnap.exists()) {
              await setDoc(doc(db, "admins", fbUser.uid), { grantedAt: Date.now(), grantedBy: "bootstrap" });
            }
          } catch (e) {}
        }
        try {
          const adminSnap = await getDoc(doc(db, "admins", fbUser.uid));
          setIsAdmin(adminSnap.exists());
        } catch (e) { setIsAdmin(false); }
      } else {
        setRecord(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "communities"), (snap) => setCommunities(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return unsub;
  }, []);

  useEffect(() => {
    if (record?.communityId) {
      getDoc(doc(db, "communities", record.communityId)).then((s) => setCommunity(s.exists() ? { id: s.id, ...s.data() } : null));
    } else {
      setCommunity(null);
    }
  }, [record?.communityId]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    setRecord(snap.exists() ? snap.data() : null);
  }, [user]);

  const logout = async () => { await signOut(auth); setTab("home"); };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-[#96939F] justify-center">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      </Shell>
    );
  }

  if (!user || !record) return <AuthScreen />;
  if (record.status === "survey-pending") return <IngresoScreen uid={user.uid} onDone={refresh} />;
  if (record.status === "terms-pending") return <TermsScreen uid={user.uid} onSubmitted={refresh} />;
  if (record.status === "submitted") {
    return (
      <Shell>
        <SectionCard>
          <div className="flex items-center gap-2 text-sm text-[#C9A036] mb-2"><Loader2 size={16} /> Solicitud en revisión</div>
          <p className="text-xs text-[#96939F]">Un administrador revisará tu solicitud pronto.</p>
        </SectionCard>
        <GhostButton onClick={logout}><LogOut size={16} /> Cerrar sesión</GhostButton>
      </Shell>
    );
  }
  if (record.status === "rejected") {
    return (
      <Shell>
        <SectionCard>
          <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-2"><XCircle size={16} /> Solicitud no aceptada</div>
        </SectionCard>
        <GhostButton onClick={logout}><LogOut size={16} /> Cerrar sesión</GhostButton>
      </Shell>
    );
  }

  const isSuperAdmin = record.nick && record.nick.trim().toLowerCase() === "indrhack";

  if (tab === "admin") {
    if (!isAdmin) return <NoAdminAccess onExit={() => setTab("home")} />;
    return <AdminPanel onExit={() => setTab("home")} currentUid={user.uid} isSuperAdmin={isSuperAdmin} nick={record.nick} role={record.role} />;
  }

  let body;
  if (tab === "communities") body = <CommunitiesScreen record={record} isAdmin={isAdmin} />;
  else if (tab === "team") body = <TeamScreen isAdmin={isAdmin} />;
  else if (tab === "pase") body = <PaseScreen record={record} uid={user.uid} />;
  else if (tab === "leaders") body = <LeadersScreen />;
  else if (tab === "profile") body = <ProfileScreen record={record} uid={user.uid} onLogout={logout} onSaved={refresh} community={community} />;
  else body = <DirectorioCentralScreen isAdmin={isAdmin} record={record} communities={communities} />;

  return (
    <Shell wide={tab === "communities"} withUserBar compactHeader>
      <TopUserBar nick={record.nick} role={record.role} />
      <div className="w-full pb-16">{body}</div>
      <BottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
    </Shell>
  );
}
