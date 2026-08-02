import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import {
  Shield, Users, Sparkles, Lock, Mail, Phone, User as UserIcon,
  CheckCircle2, XCircle, ChevronRight, LogOut, Settings, ClipboardList,
  ExternalLink, AlertCircle, Loader2, Home, Newspaper, Crown,
  MessageCircle, Plus, Trash2, ArrowLeft, X
} from "lucide-react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  query, orderBy, onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";

/* ---------------------------------------------------------
   Tokens de diseño (mismos que la referencia de marca Argyra)
--------------------------------------------------------- */

const RANKS = {
  kangu: {
    key: "kangu",
    label: "Kangu",
    title: "Moderación, Control y Seguridad",
    color: "#6C6CF0",
    blurb: "Administradores y moderadores que mantienen los grupos limpios, ordenados y protegidos.",
  },
  domeisha: {
    key: "domeisha",
    label: "Domeisha",
    title: "Especialistas VIP",
    color: "#C9A036",
    blurb: "Miembros con habilidades especiales en programación, diseño y organización de herramientas.",
  },
  taicho: {
    key: "taicho",
    label: "Taicho",
    title: "Base de la comunidad — Veteranos",
    color: "#8C2F39",
    blurb: "El corazón de la comunidad: quienes participan en las conversaciones cotidianas.",
  },
  sinchan: {
    key: "sinchan",
    label: "Sin Chan",
    title: "Base de la comunidad — Novatos",
    color: "#4E9A6B",
    blurb: "Los recién llegados: nuevos en la comunidad.",
  },
};

const RANK_ORDER = ["kangu", "domeisha", "taicho", "sinchan"];

// Tareas específicas de cada rango: al elegir un rango en la encuesta,
// la persona debe marcar en cuál(es) de estas puede apoyar puntualmente.
const SUBTASKS = {
  kangu: [
    "Buscar alianzas con otros grupos para que se unan a la comunidad",
    "Hacer cumplir las reglas en cada grupo y borrar spam",
    "Calmar discusiones",
    "Apoyar a miembros en lo que necesiten",
    "Detectar usuarios que generan spam o hackers",
  ],
  domeisha: [
    "Programación e ingeniería",
    "Crear, actualizar y reparar las herramientas de la comunidad",
    "Planear nuevas herramientas y funciones",
  ],
  taicho: [
    "Ayudar a los nuevos miembros a acoplarse, guiándolos",
    "Informar a los administradores nuevos cómo funciona la comunidad",
    "Aportar conocimiento",
    "Apoyar a todos los admin líderes",
  ],
  sinchan: [
    "Quiero aprender",
    "Quiero ayudar",
    "Quiero apoyar",
  ],
};

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

/* ---------------- Validación de nombre y teléfono ---------------- */

// Solo letras (incluye acentos y ñ), sin espacios, números ni símbolos.
const NAME_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/;
function isValidName(str) {
  return NAME_REGEX.test(str);
}
// Filtra en tiempo real cualquier carácter que no sea una letra.
function sanitizeName(str) {
  return str.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
}

// Deja pasar solo dígitos y un único "+" al inicio (número "todo junto").
function sanitizePhone(str) {
  let v = str.replace(/[^0-9+]/g, "");
  const hasPlus = v.startsWith("+");
  v = v.replace(/\+/g, "");
  return hasPlus ? "+" + v : v;
}

// Códigos de discado internacional (E.164) realmente asignados por la UIT.
// Se usa para detectar números "inventados" cuyo código de país no existe.
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
].sort((a, b) => b.length - a.length); // probar primero los códigos más largos

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

// Convierte un teléfono guardado (ej: "+51999999999") en un enlace wa.me
// Devuelve siempre un arreglo de rangos, incluso para cuentas antiguas que
// todavía solo tienen el campo singular "rank" en vez de "ranks".
function userRanks(u) {
  if (!u) return [];
  if (Array.isArray(u.ranks) && u.ranks.length) return u.ranks;
  if (u.rank) return [u.rank];
  return [];
}

// Selector de uno o más rangos/títulos (checkboxes).
function RankPicker({ value, onChange }) {
  const toggle = (k) => {
    onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {RANK_ORDER.map((k) => {
        const active = value.includes(k);
        return (
          <button
            type="button"
            key={k}
            onClick={() => toggle(k)}
            className="text-xs px-2.5 py-1.5 rounded-full border transition-colors"
            style={active
              ? { color: RANKS[k].color, borderColor: RANKS[k].color, background: `${RANKS[k].color}1A` }
              : { color: "#5B5866", borderColor: "#2A2C38" }}
          >
            {RANKS[k].label}
          </button>
        );
      })}
    </div>
  );
}

function waLink(phone) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

// Mantiene sincronizado el "directorio público" (users/{uid} -> directory/{uid})
// con solo la info que es segura mostrar a cualquier miembro logueado
// (nick, rango y estado), sin exponer teléfono ni correo.
async function syncDirectory(uid, data) {
  try {
    await setDoc(doc(db, "directory", uid), data, { merge: true });
  } catch (e) {
    // Si las reglas todavía no están desplegadas, no rompemos el flujo principal.
  }
}

function firebaseErrorToMessage(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "Ese correo ya tiene una cuenta.";
  if (code.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (code.includes("invalid-email")) return "Correo electrónico inválido.";
  if (code.includes("wrong-password") || code.includes("invalid-credential"))
    return "Contraseña incorrecta.";
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

function Shell({ children }) {
  return (
    <div className="min-h-screen w-full bg-[#0C0D12] text-[#F2F0EB] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full border border-[#2A2C38] opacity-40" />
      <div className="pointer-events-none absolute -top-10 -right-10 w-[300px] h-[300px] rounded-full border border-[#2A2C38] opacity-30" />
      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-10">
        <div className="mb-8 text-center">
          <div className="text-2xl tracking-[0.25em]" style={{ fontFamily: "'Cinzel', serif", color: "#C9A036" }}>
            ARGYRA
          </div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-[#96939F] mt-1">
            Unión de comunidades
          </div>
        </div>
        <div className="w-full max-w-md">{children}</div>
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
    "survey-pending": { text: "Encuesta pendiente", color: "#96939F" },
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
    // En login dejamos escribir libre (por si el nick ya existente tuviera
    // formato antiguo); en registro forzamos solo letras desde que escribe.
    setNick(mode === "register" ? sanitizeName(v) : v);
  };

  const handlePhoneChange = (e) => {
    setPhone(sanitizePhone(e.target.value));
  };

  const nickError = mode === "register" && nick.length > 0 && !isValidName(nick)
    ? "Solo letras, sin espacios ni símbolos."
    : "";
  const phoneCheck = mode === "register" && phone.length > 0 ? validatePhone(phone) : null;
  const phoneError = phoneCheck && !phoneCheck.valid ? phoneCheck.message : "";

  const submit = async () => {
    setError("");
    if (!nick.trim() || !password) {
      setError("Completa nick y contraseña.");
      return;
    }
    setBusy(true);
    const nickLower = nick.trim().toLowerCase();
    try {
      if (mode === "register") {
        if (!phone.trim() || !email.trim()) {
          setError("Completa tu número y tu correo electrónico.");
          setBusy(false);
          return;
        }
        if (!isValidName(nick.trim())) {
          setError("El nombre solo puede tener letras, sin espacios ni símbolos.");
          setBusy(false);
          return;
        }
        const phoneResult = validatePhone(phone.trim());
        if (!phoneResult.valid) {
          setError(phoneResult.message);
          setBusy(false);
          return;
        }
        const nameRef = doc(db, "usernames", nickLower);
        const nameSnap = await getDoc(nameRef);
        if (nameSnap.exists()) {
          setError("Ese nick ya está registrado. Prueba iniciar sesión.");
          setBusy(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await setDoc(doc(db, "users", cred.user.uid), {
          nick: nick.trim(),
          phone: phone.trim(),
          email: email.trim(),
          status: "survey-pending",
          answers: {},
          ranks: [],
          createdAt: Date.now(),
        });
        await setDoc(nameRef, { uid: cred.user.uid, email: email.trim() });
        await syncDirectory(cred.user.uid, { nick: nick.trim(), ranks: [], status: "survey-pending" });
        // onAuthStateChanged en el componente raíz recoge la sesión desde aquí.
      } else {
        const nameSnap = await getDoc(doc(db, "usernames", nickLower));
        if (!nameSnap.exists()) {
          setError("No existe una cuenta con ese nick.");
          setBusy(false);
          return;
        }
        const { email: loginEmail } = nameSnap.data();
        await signInWithEmailAndPassword(auth, loginEmail, password);
      }
    } catch (e) {
      setError(firebaseErrorToMessage(e));
    }
    setBusy(false);
  };

  return (
    <Shell>
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
        <div className="flex mb-6 bg-[#1D1F2A] rounded-lg p-1">
          <button
            onClick={() => setMode("login")}
            className={cx("flex-1 text-sm py-2 rounded-md transition-colors", mode === "login" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => setMode("register")}
            className={cx("flex-1 text-sm py-2 rounded-md transition-colors", mode === "register" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}
          >
            Registrarse
          </button>
        </div>

        <Field
          icon={UserIcon}
          label="Nick o nombre"
          placeholder="TuNombre"
          value={nick}
          onChange={handleNickChange}
          error={nickError}
          hint={mode === "register" && !nickError ? "Solo letras, sin espacios ni símbolos." : undefined}
        />
        <Field icon={Lock} label="Contraseña" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "register" && (
          <>
            <Field
              icon={Phone}
              label="Número de teléfono (para el grupo)"
              placeholder="+51999999999"
              inputMode="tel"
              value={phone}
              onChange={handlePhoneChange}
              error={phoneError}
              hint={!phoneError ? "Todo junto, con código de país real (ej: +51...)." : undefined}
            />
            <Field icon={Mail} label="Correo electrónico (para recuperar tu cuenta)" type="email" placeholder="tucorreo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-4">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <PrimaryButton onClick={submit} disabled={busy || (mode === "register" && (!!nickError || !!phoneError))}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {mode === "register" ? "Comenzar la encuesta" : "Ingresar"}
          {!busy && <ChevronRight size={16} />}
        </PrimaryButton>
      </div>
    </Shell>
  );
}

/* ---------------- Survey ---------------- */

function SurveyScreen({ uid, onDone }) {
  const [step, setStep] = useState(0);
  const [q1, setQ1] = useState(null);
  const [q2, setQ2] = useState([]);
  const [q2Details, setQ2Details] = useState({}); // { [rankKey]: [subtaskIndex, ...] }
  const [saving, setSaving] = useState(false);

  const toggleQ2 = (key) => {
    setQ2((prev) => {
      if (prev.includes(key)) {
        setQ2Details((d) => {
          const next = { ...d };
          delete next[key];
          return next;
        });
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const toggleSubtask = (rankKey, idx) => {
    setQ2Details((prev) => {
      const cur = prev[rankKey] || [];
      const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx];
      return { ...prev, [rankKey]: next };
    });
  };

  // Cada rango elegido necesita al menos una tarea específica marcada.
  const missingDetails = q2.some((k) => !(q2Details[k] && q2Details[k].length > 0));

  const finishSurvey = async () => {
    setSaving(true);
    const tareasDetalle = {};
    q2.forEach((k) => {
      tareasDetalle[k] = (q2Details[k] || []).map((idx) => SUBTASKS[k][idx]);
    });
    await updateDoc(doc(db, "users", uid), {
      answers: { experiencia: q1, tareas: q2, tareasDetalle },
      status: "terms-pending",
    });
    await syncDirectory(uid, { status: "terms-pending" });
    setSaving(false);
    onDone();
  };

  return (
    <Shell>
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
        <ProgressDots step={step} total={2} />

        {step === 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-1">¿Tienes experiencia en comunidades de apoyo?</h2>
            <p className="text-sm text-[#96939F] mb-5">Elige una opción para continuar.</p>
            <div className="space-y-2">
              {["Sí", "No", "Quizás"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setQ1(opt); setStep(1); }}
                  className={cx(
                    "w-full text-left px-4 py-3 rounded-lg border transition-colors text-sm",
                    q1 === opt ? "border-[#6C6CF0] bg-[#6C6CF0]/10" : "border-[#2A2C38] hover:border-[#6C6CF0]/60"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold mb-1">¿Qué tarea te ves capaz de ejercer en la comunidad?</h2>
            <p className="text-sm text-[#96939F] mb-5">Elige entre 1 y 3 opciones ({q2.length}/3 seleccionadas).</p>
            <div className="space-y-2 mb-6">
              {RANK_ORDER.map((k) => {
                const r = RANKS[k];
                const active = q2.includes(k);
                const details = q2Details[k] || [];
                return (
                  <div
                    key={k}
                    className={cx("rounded-lg border transition-colors overflow-hidden", active ? "bg-white/5" : "border-[#2A2C38] hover:border-white/20")}
                    style={active ? { borderColor: r.color } : {}}
                  >
                    <button type="button" onClick={() => toggleQ2(k)} className="w-full text-left px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{r.title}</span>
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: r.color, border: `1px solid ${r.color}` }}>
                          {r.label}
                        </span>
                      </div>
                      <p className="text-xs text-[#96939F] mt-1">{r.blurb}</p>
                    </button>

                    {active && (
                      <div className="px-4 pb-3 pt-2 border-t" style={{ borderColor: `${r.color}33` }}>
                        <p className="text-[11px] text-[#96939F] mb-2">
                          ¿En qué específicamente puedes apoyar aquí? Elige una o varias.
                        </p>
                        <div className="space-y-1.5">
                          {SUBTASKS[k].map((txt, idx) => {
                            const checked = details.includes(idx);
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => toggleSubtask(k, idx)}
                                className={cx(
                                  "w-full flex items-start gap-2 text-left text-xs px-2.5 py-2 rounded-md border transition-colors",
                                  checked ? "bg-white/10 border-transparent" : "border-transparent hover:bg-white/5"
                                )}
                              >
                                <span
                                  className="mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                                  style={checked ? { backgroundColor: r.color, borderColor: r.color } : { borderColor: "#5B5866" }}
                                >
                                  {checked && <CheckCircle2 size={11} className="text-white" />}
                                </span>
                                <span className="text-[#D8D5E0]">{txt}</span>
                              </button>
                            );
                          })}
                        </div>
                        {details.length === 0 && (
                          <p className="text-[11px] text-[#E07A7A] mt-2">Elige al menos una opción de esta lista.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <PrimaryButton onClick={finishSurvey} disabled={q2.length === 0 || missingDetails || saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Continuar"}
            </PrimaryButton>
          </div>
        )}
      </div>
    </Shell>
  );
}

/* ---------------- Terms & submit ---------------- */

function TermsScreen({ uid, onSubmitted }) {
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    await updateDoc(doc(db, "users", uid), { status: "submitted", submittedAt: Date.now() });
    await syncDirectory(uid, { status: "submitted" });
    setSending(false);
    onSubmitted();
  };

  return (
    <Shell>
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Términos, condiciones y beneficios</h2>

        <div className="mb-5">
          <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2">Términos y condiciones</div>
          <ul className="space-y-2 text-sm text-[#D8D5E0]">
            <li className="flex gap-2">
              <CheckCircle2 size={15} className="text-[#6C6CF0] shrink-0 mt-0.5" />
              Aceptas apoyar a la comunidad y seguir sus reglas.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 size={15} className="text-[#6C6CF0] shrink-0 mt-0.5" />
              Para ser aceptado, debes permitir el ingreso de un administrador nuestro a tu grupo de WhatsApp y otorgarle administración, para verificar que administras un grupo activo — así podemos empezar a apoyarte.
            </li>
          </ul>
        </div>

        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2">Beneficios</div>
          <ul className="space-y-2 text-sm text-[#D8D5E0]">
            <li className="flex gap-2">
              <Sparkles size={15} className="text-[#C9A036] shrink-0 mt-0.5" />
              Apoyo en la gestión y organización de tu comunidad.
            </li>
            <li className="flex gap-2">
              <Sparkles size={15} className="text-[#C9A036] shrink-0 mt-0.5" />
              Herramientas, coordinación y respaldo continuo.
            </li>
          </ul>
        </div>

        <PrimaryButton onClick={send} disabled={sending}>
          {sending ? <Loader2 size={16} className="animate-spin" /> : "Enviar solicitud"}
        </PrimaryButton>
      </div>
    </Shell>
  );
}

/* ---------------- Profile ---------------- */

function ProfileScreen({ record, onLogout }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const myRanks = userRanks(record);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "groups"),
      (snap) => {
        setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  // Un grupo es accesible si es público (sin rangos asignados) o si
  // comparte al menos uno de los rangos/títulos de la persona.
  const myGroups = groups.filter((g) => !g.ranks?.length || g.ranks.some((r) => myRanks.includes(r)));

  return (
    <div>
      <TopBar title="Perfil" />
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-lg font-semibold">{record.nick}</div>
            <div className="text-xs text-[#96939F]">{record.email}</div>
          </div>
          <StatusBadge status={record.status} />
        </div>

        {record.status === "submitted" && (
          <div className="text-sm text-[#D8D5E0] bg-[#1D1F2A] border border-[#2A2C38] rounded-lg p-4">
            Tu solicitud fue enviada y está siendo revisada por el Consejo Coordinador. Vuelve más tarde para ver si fue aceptada.
          </div>
        )}

        {record.status === "rejected" && (
          <div className="text-sm text-[#D8D5E0] bg-[#1D1F2A] border border-[#2A2C38] rounded-lg p-4">
            Tu solicitud no fue aceptada esta vez.
          </div>
        )}

        {record.status === "accepted" && (
          <div>
            {myRanks.length === 0 && (
              <div className="text-sm text-[#D8D5E0] bg-[#1D1F2A] border border-[#2A2C38] rounded-lg p-4 mb-4">
                Todavía no tienes un rango asignado. Un administrador te lo asignará pronto.
              </div>
            )}

            {myRanks.length > 0 && (
              <div className="space-y-3 mb-4">
                {myRanks.map((rk) => {
                  const r = RANKS[rk];
                  if (!r) return null;
                  return (
                    <div key={rk} className="rounded-xl p-4 border" style={{ borderColor: r.color, background: `${r.color}14` }}>
                      <span className="font-semibold" style={{ color: r.color }}>{r.label}</span>
                      <div className="text-sm text-[#D8D5E0]">{r.title}</div>
                      <p className="text-xs text-[#96939F] mt-2">{r.blurb}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2">Tus enlaces de grupo</div>
            {loading && <div className="text-xs text-[#5B5866]">Cargando…</div>}
            {!loading && myGroups.length === 0 && (
              <p className="text-xs text-[#96939F]">Un administrador todavía no configuró enlaces para tus rangos.</p>
            )}
            {!loading && myGroups.length > 0 && (
              <div className="space-y-2">
                {myGroups.map((g) => (
                  <a
                    key={g.id}
                    href={g.link || "#"}
                    target="_blank" rel="noreferrer"
                    className={cx("flex items-center justify-between px-4 py-3 rounded-lg border text-sm", g.link ? "border-[#2A2C38] hover:border-[#6C6CF0]" : "border-[#2A2C38] opacity-40 pointer-events-none")}
                  >
                    {g.name} <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-sm text-[#96939F] hover:text-[#F2F0EB] mt-6 pt-4 border-t border-[#2A2C38]">
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/* ---------------- Navegación principal (post-onboarding) ---------------- */

function TopBar({ title, onBack }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {onBack && (
        <button onClick={onBack} className="text-[#96939F] hover:text-[#F2F0EB]">
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="text-lg font-semibold">{title}</div>
    </div>
  );
}

function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { key: "home", label: "Inicio", icon: Home },
    { key: "directory", label: "Comunidad", icon: Users },
    { key: "leaders", label: "Líderes", icon: Crown },
    { key: "profile", label: "Perfil", icon: UserIcon },
  ];
  if (isAdmin) items.push({ key: "admin", label: "Admin", icon: Shield });
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#12131A]/95 backdrop-blur border-t border-[#2A2C38]">
      <div className="max-w-md mx-auto flex">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              "flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-wide transition-colors",
              tab === key ? "text-[#6C6CF0]" : "text-[#5B5866] hover:text-[#96939F]"
            )}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Inicio: noticias / información de la comunidad ---------------- */

function HomeFeed({ isAdmin }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => {
        setError("No se pudieron cargar las noticias.");
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const publish = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const id = `n_${Date.now()}`;
      await setDoc(doc(db, "news", id), {
        title: title.trim(),
        body: body.trim(),
        createdAt: Date.now(),
      });
      setTitle(""); setBody(""); setShowForm(false);
      // No hace falta recargar: onSnapshot ya trae la noticia nueva sola.
    } catch (e) {
      setError("No se pudo publicar la noticia.");
    }
    setSaving(false);
  };

  const remove = async (id) => {
    const sure = window.confirm("¿Eliminar esta publicación?");
    if (!sure) return;
    await deleteDoc(doc(db, "news", id));
  };

  return (
    <div>
      <TopBar title="Inicio" />
      <div className="text-sm text-[#96939F] mb-5">
        Noticias e información de la Unión de Comunidades.
      </div>

      {isAdmin && (
        <div className="mb-5">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-[#2A2C38] hover:border-[#6C6CF0] rounded-xl py-3 text-sm text-[#96939F] hover:text-[#6C6CF0] transition-colors"
            >
              <Plus size={15} /> Publicar noticia
            </button>
          ) : (
            <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-5">
              <Field label="Título" placeholder="Título de la noticia" value={title} onChange={(e) => setTitle(e.target.value)} />
              <label className="block mb-4">
                <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Contenido</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  className="w-full bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2.5 text-sm text-[#F2F0EB] outline-none focus:border-[#6C6CF0] resize-none"
                  placeholder="Escribe la información para la comunidad..."
                />
              </label>
              <div className="flex gap-2">
                <PrimaryButton onClick={publish} disabled={saving || !title.trim() || !body.trim()}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : "Publicar"}
                </PrimaryButton>
                <button onClick={() => setShowForm(false)} className="px-4 text-sm text-[#96939F] hover:text-[#F2F0EB]">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[#96939F]">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      )}

      {!loading && error && <div className="text-sm text-[#E07A7A]">{error}</div>}

      {!loading && !error && news.length === 0 && (
        <div className="text-sm text-[#5B5866] text-center py-10">
          <Newspaper size={22} className="mx-auto mb-2 opacity-50" />
          Todavía no hay noticias publicadas.
        </div>
      )}

      <div className="space-y-3">
        {news.map((n) => (
          <div key={n.id} className="bg-[#16171F] border border-[#2A2C38] rounded-xl p-4">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="font-medium text-sm">{n.title}</div>
              {isAdmin && (
                <button onClick={() => remove(n.id)} className="text-[#5B5866] hover:text-[#E07A7A] shrink-0">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <p className="text-sm text-[#D8D5E0] whitespace-pre-wrap">{n.body}</p>
            {n.createdAt && (
              <div className="text-[11px] text-[#5B5866] mt-2">
                {new Date(n.createdAt).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Comunidad: directorio de miembros ---------------- */

function DirectoryScreen({ canView, myRanks }) {
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    let dirReady = false, groupsReady = false;
    const maybeStopLoading = () => { if (dirReady && groupsReady) setLoading(false); };

    const unsubDir = onSnapshot(
      collection(db, "directory"),
      (snap) => {
        const recs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // Solo se muestran miembros ya registrados y aceptados en la comunidad.
          .filter((m) => m.status === "accepted");
        recs.sort((a, b) => {
          const ra = userRanks(a).length ? RANK_ORDER.indexOf(userRanks(a)[0]) : 99;
          const rb = userRanks(b).length ? RANK_ORDER.indexOf(userRanks(b)[0]) : 99;
          if (ra !== rb) return ra - rb;
          return (a.nick || "").localeCompare(b.nick || "");
        });
        setMembers(recs);
        dirReady = true;
        maybeStopLoading();
      },
      () => { setError("No se pudo cargar la información de la comunidad."); dirReady = true; maybeStopLoading(); }
    );
    const unsubGroups = onSnapshot(
      collection(db, "groups"),
      (snap) => {
        setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        groupsReady = true;
        maybeStopLoading();
      },
      () => { groupsReady = true; maybeStopLoading(); }
    );
    return () => { unsubDir(); unsubGroups(); };
  }, [canView]);

  if (!canView) {
    return (
      <div>
        <TopBar title="Comunidad" />
        <div className="text-sm text-[#5B5866] text-center py-14">
          <Lock size={22} className="mx-auto mb-2 opacity-50" />
          Esta sección es solo para miembros ya aceptados de la comunidad.
        </div>
      </div>
    );
  }

  const myGroups = groups.filter((g) => !g.ranks?.length || g.ranks.some((r) => myRanks.includes(r)));

  return (
    <div>
      <TopBar title="Comunidad" />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[#96939F]">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      )}
      {!loading && error && <div className="text-sm text-[#E07A7A]">{error}</div>}

      {!loading && !error && (
        <>
          <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2">Grupos por función / proyecto</div>
          {myGroups.length === 0 && (
            <p className="text-xs text-[#5B5866] mb-5">Todavía no hay grupos configurados para tus rangos.</p>
          )}
          {myGroups.length > 0 && (
            <div className="space-y-2 mb-6">
              {myGroups.map((g) => (
                <a
                  key={g.id}
                  href={g.link || "#"}
                  target="_blank" rel="noreferrer"
                  className={cx("flex items-center justify-between px-4 py-3 rounded-lg border text-sm", g.link ? "border-[#2A2C38] hover:border-[#6C6CF0]" : "border-[#2A2C38] opacity-40 pointer-events-none")}
                >
                  <span>
                    {g.name}
                    {g.description && <span className="block text-[11px] text-[#96939F] font-normal">{g.description}</span>}
                  </span>
                  <ExternalLink size={14} className="shrink-0 ml-2" />
                </a>
              ))}
            </div>
          )}

          <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2">Miembros ({members.length})</div>
          <div className="space-y-2">
            {members.map((m) => {
              const ranks = userRanks(m);
              return (
                <div key={m.id} className="flex items-center justify-between gap-2 bg-[#16171F] border border-[#2A2C38] rounded-lg px-4 py-2.5 text-sm">
                  <span className="truncate">{m.nick || "Usuario"}</span>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {ranks.length === 0 && <span className="text-[10px] text-[#5B5866] uppercase">Sin rango</span>}
                    {ranks.map((rk) => {
                      const r = RANKS[rk];
                      if (!r) return null;
                      return (
                        <span key={rk} className="text-[10px] uppercase px-2 py-0.5 rounded-full border" style={{ color: r.color, borderColor: r.color }}>
                          {r.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Líderes: Cúpula y Alto Consejo ---------------- */

function LeadersScreen({ isSuperAdmin }) {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [nick, setNick] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "leaders"),
      (snap) => {
        const recs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        recs.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        setLeaders(recs);
        setLoading(false);
      },
      () => { setError("No se pudo cargar la lista de líderes."); setLoading(false); }
    );
    return unsub;
  }, []);

  const addLeader = async () => {
    setFormError("");
    const nickLower = nick.trim().toLowerCase();
    if (!nickLower) {
      setFormError("Escribe el nick del usuario.");
      return;
    }
    setSaving(true);
    try {
      const nameSnap = await getDoc(doc(db, "usernames", nickLower));
      if (!nameSnap.exists()) {
        setFormError("No existe ningún usuario registrado con ese nick.");
        setSaving(false);
        return;
      }
      const { uid } = nameSnap.data();
      const userSnap = await getDoc(doc(db, "users", uid));
      const u = userSnap.exists() ? userSnap.data() : {};
      await setDoc(doc(db, "leaders", uid), {
        nick: u.nick || nick.trim(),
        phone: u.phone || "",
        title: customTitle.trim() || "Cúpula y Alto Consejo",
        addedAt: Date.now(),
      });
      setNick(""); setCustomTitle(""); setShowForm(false);
      // No hace falta recargar: onSnapshot ya trae el líder nuevo solo.
    } catch (e) {
      setFormError("No se pudo agregar al líder. Intenta de nuevo.");
    }
    setSaving(false);
  };

  const removeLeader = async (uid) => {
    const sure = window.confirm("¿Quitar a esta persona de la lista de líderes?");
    if (!sure) return;
    await deleteDoc(doc(db, "leaders", uid));
  };

  if (selected) {
    const wa = waLink(selected.phone);
    return (
      <div>
        <TopBar title="Perfil del líder" onBack={() => setSelected(null)} />
        <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#C9A036]/15 border border-[#C9A036]/40 flex items-center justify-center mb-3">
            <Crown size={24} className="text-[#C9A036]" />
          </div>
          <div className="text-lg font-semibold">{selected.nick}</div>
          <div className="text-xs text-[#96939F] mb-5">{selected.title}</div>
          {wa ? (
            <a
              href={wa} target="_blank" rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-[#4E9A6B] hover:bg-[#43855C] text-white font-medium text-sm rounded-lg px-4 py-2.5 transition-colors"
            >
              <MessageCircle size={16} /> Contactar por WhatsApp
            </a>
          ) : (
            <p className="text-xs text-[#5B5866]">Este líder aún no tiene un número configurado.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Líderes" />
      <div className="text-sm text-[#96939F] mb-1">
        Cúpula y Alto Consejo — Los Jefes y Liderazgo Máximo
      </div>
      <p className="text-xs text-[#5B5866] mb-5">
        Son las autoridades más altas de la comunidad. No moderan el chat del día a día,
        sino que toman las decisiones más importantes sobre el futuro de la Unión.
        Son los creadores y dueños del proyecto: tienen la última palabra sobre cualquier
        asunto, y su decisión es definitiva ante cualquier desacuerdo grave.
      </p>

      {isSuperAdmin && (
        <div className="mb-5">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-[#2A2C38] hover:border-[#C9A036] rounded-xl py-3 text-sm text-[#96939F] hover:text-[#C9A036] transition-colors"
            >
              <Plus size={15} /> Agregar líder
            </button>
          ) : (
            <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-5">
              <p className="text-xs text-[#96939F] mb-4">
                El nick debe pertenecer a un usuario ya registrado en Argyra.
              </p>
              <Field
                icon={UserIcon}
                label="Nick del usuario"
                placeholder="ejemplo: mariposa"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                error={formError}
              />
              <Field
                label="Título / cargo (opcional)"
                placeholder="Cúpula y Alto Consejo"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
              />
              <div className="flex gap-2">
                <PrimaryButton onClick={addLeader} disabled={saving}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : "Agregar"}
                </PrimaryButton>
                <button onClick={() => setShowForm(false)} className="px-4 text-sm text-[#96939F] hover:text-[#F2F0EB]">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[#96939F]">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      )}
      {!loading && error && <div className="text-sm text-[#E07A7A]">{error}</div>}
      {!loading && !error && leaders.length === 0 && (
        <div className="text-sm text-[#5B5866] text-center py-10">
          <Crown size={22} className="mx-auto mb-2 opacity-50" />
          Todavía no se agregaron líderes.
        </div>
      )}

      <div className="space-y-2">
        {leaders.map((l) => (
          <div key={l.id} className="flex items-center bg-[#16171F] border border-[#2A2C38] rounded-lg px-4 py-3">
            <button onClick={() => setSelected(l)} className="flex-1 text-left flex items-center gap-3">
              <Crown size={16} className="text-[#C9A036] shrink-0" />
              <div>
                <div className="text-sm font-medium">{l.nick}</div>
                <div className="text-[11px] text-[#96939F]">{l.title}</div>
              </div>
            </button>
            {isSuperAdmin && (
              <button onClick={() => removeLeader(l.id)} className="text-[#5B5866] hover:text-[#E07A7A] shrink-0 ml-2">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Admin ---------------- */

function AdminPanel({ onExit, currentUid }) {
  const [tab, setTab] = useState("solicitudes");
  const [users, setUsers] = useState([]);
  const [adminUids, setAdminUids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);

  const [grantNick, setGrantNick] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [grantMsg, setGrantMsg] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const snap = await getDocs(collection(db, "users"));
      const recs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      recs.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      setUsers(recs);

      // Pone al día el directorio público para cuentas que se registraron
      // antes de que existiera esta sección (no bloquea la carga del panel).
      recs.forEach((u) => {
        syncDirectory(u.id, { nick: u.nick || "", ranks: userRanks(u), status: u.status || "survey-pending" });
      });
      const groupsSnap = await getDocs(collection(db, "groups"));
      setGroups(groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const adminsSnap = await getDocs(collection(db, "admins"));
      setAdminUids(adminsSnap.docs.map((d) => d.id));
    } catch (e) {
      setLoadError(e?.message || "No se pudo cargar la información del panel.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (user, status, ranks) => {
    const finalRanks = ranks || userRanks(user);
    await updateDoc(doc(db, "users", user.id), { status, ranks: finalRanks });
    await syncDirectory(user.id, { status, ranks: finalRanks });
    load();
  };

  const saveGroup = async (group) => {
    const id = group.id || `g_${Date.now()}`;
    await setDoc(doc(db, "groups", id), {
      name: group.name.trim(),
      description: group.description?.trim() || "",
      link: group.link.trim(),
      ranks: group.ranks || [],
      order: group.order ?? Date.now(),
    });
    await load();
  };

  const deleteGroup = async (id) => {
    const sure = window.confirm("¿Eliminar este grupo?");
    if (!sure) return;
    await deleteDoc(doc(db, "groups", id));
    await load();
  };

  const grantAdmin = async () => {
    setGrantError("");
    setGrantMsg("");
    const nickLower = grantNick.trim().toLowerCase();
    if (!nickLower) {
      setGrantError("Escribe el nick de la persona.");
      return;
    }
    setGranting(true);
    try {
      const nameSnap = await getDoc(doc(db, "usernames", nickLower));
      if (!nameSnap.exists()) {
        setGrantError("No existe ningún usuario registrado con ese nick.");
        setGranting(false);
        return;
      }
      const { uid } = nameSnap.data();
      if (adminUids.includes(uid)) {
        setGrantError("Esa persona ya es administrador.");
        setGranting(false);
        return;
      }
      await setDoc(doc(db, "admins", uid), { grantedAt: Date.now(), grantedBy: currentUid });
      setGrantMsg(`Listo: "${grantNick.trim()}" ahora es administrador.`);
      setGrantNick("");
      await load();
    } catch (e) {
      setGrantError("No se pudo otorgar el acceso. Intenta de nuevo.");
    }
    setGranting(false);
  };

  const revokeAdmin = async (uid) => {
    if (uid === currentUid) {
      const sure = window.confirm("¿Seguro que quieres quitarte tu propio acceso de administrador?");
      if (!sure) return;
    }
    await deleteDoc(doc(db, "admins", uid));
    await load();
  };

  const solicitudes = users.filter((u) => u.status === "submitted");
  const resueltas = users.filter((u) => u.status === "accepted" || u.status === "rejected");
  const admins = adminUids.map((uid) => ({ uid, user: users.find((u) => u.id === uid) || null }));

  return (
    <Shell>
      <div className="w-full max-w-2xl overflow-x-hidden">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex-1 min-w-0 overflow-x-auto -mx-1 px-1">
            <div className="flex bg-[#1D1F2A] rounded-lg p-1 gap-1 w-max">
              <button onClick={() => setTab("solicitudes")} className={cx("shrink-0 whitespace-nowrap text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5", tab === "solicitudes" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>
                <ClipboardList size={14} /> Solicitudes
              </button>
              <button onClick={() => setTab("enlaces")} className={cx("shrink-0 whitespace-nowrap text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5", tab === "enlaces" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>
                <Settings size={14} /> Grupos
              </button>
              <button onClick={() => setTab("admins")} className={cx("shrink-0 whitespace-nowrap text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5", tab === "admins" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>
                <Shield size={14} /> Admins
              </button>
            </div>
          </div>
          <button onClick={onExit} className="shrink-0 flex items-center gap-1 text-xs text-[#96939F] hover:text-[#F2F0EB] border border-[#2A2C38] rounded-lg px-2.5 py-2">
            <X size={14} /> Salir
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-[#96939F]">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-[#16171F] border border-[#E07A7A]/40 rounded-2xl p-6">
            <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-3">
              <AlertCircle size={15} /> No se pudo cargar el panel
            </div>
            <p className="text-xs text-[#96939F] mb-4 break-words">{loadError}</p>
            <PrimaryButton onClick={load}>Reintentar</PrimaryButton>
          </div>
        )}

        {!loading && !loadError && tab === "solicitudes" && (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2">Pendientes ({solicitudes.length})</div>
              {solicitudes.length === 0 && <div className="text-sm text-[#5B5866]">No hay solicitudes en revisión.</div>}
              <div className="space-y-3">
                {solicitudes.map((u) => <SolicitudCard key={u.id} user={u} onDecide={decide} />)}
              </div>
            </div>

            {resueltas.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2 mt-6">Resueltas</div>
                <div className="space-y-2">
                  {resueltas.map((u) => (
                    <ResueltaRow key={u.id} user={u} onSaveRanks={(ranks) => decide(u, u.status, ranks)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !loadError && tab === "enlaces" && (
          <GroupsManager groups={groups} onSave={saveGroup} onDelete={deleteGroup} />
        )}

        {!loading && !loadError && tab === "admins" && (
          <div className="space-y-5">
            <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
              <div className="text-sm font-medium mb-1">Otorgar acceso de administrador</div>
              <p className="text-xs text-[#96939F] mb-4">
                Escribe el nick de un usuario ya registrado para darle acceso al panel.
              </p>
              <Field
                icon={UserIcon}
                label="Nick del usuario"
                placeholder="ejemplo: mariposa"
                value={grantNick}
                onChange={(e) => setGrantNick(e.target.value)}
                error={grantError}
                hint={grantMsg || undefined}
              />
              <PrimaryButton onClick={grantAdmin} disabled={granting}>
                {granting ? <Loader2 size={16} className="animate-spin" /> : "Otorgar admin"}
              </PrimaryButton>
            </div>

            <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6">
              <div className="text-sm font-medium mb-3">Administradores actuales ({admins.length})</div>
              <div className="space-y-2">
                {admins.map(({ uid, user: u }) => (
                  <div key={uid} className="flex items-center justify-between bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-4 py-2.5 text-sm">
                    <div>
                      <div>{u?.nick || "Usuario desconocido"}</div>
                      {u?.email && <div className="text-xs text-[#5B5866]">{u.email}</div>}
                    </div>
                    <button
                      onClick={() => revokeAdmin(uid)}
                      className="flex items-center gap-1.5 text-xs text-[#E07A7A] hover:bg-[#E07A7A]/15 border border-[#E07A7A]/40 rounded-lg px-2.5 py-1.5"
                    >
                      <XCircle size={13} /> Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function GroupsManager({ groups, onSave, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [ranks, setRanks] = useState([]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditingId(null); setName(""); setDescription(""); setLink(""); setRanks([]); setShowForm(false);
  };

  const editGroup = (g) => {
    setEditingId(g.id); setName(g.name); setDescription(g.description || ""); setLink(g.link || ""); setRanks(g.ranks || []);
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim() || !link.trim()) return;
    setSaving(true);
    await onSave({ id: editingId, name, description, link, ranks });
    setSaving(false);
    resetForm();
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-[#96939F]">
        Crea grupos por función o proyecto (ej. "Grupo de Programación") y elige qué rangos tienen acceso.
        Si no marcas ningún rango, el grupo queda visible para todos los miembros aceptados.
      </p>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-[#2A2C38] hover:border-[#6C6CF0] rounded-xl py-3 text-sm text-[#96939F] hover:text-[#6C6CF0] transition-colors"
        >
          <Plus size={15} /> Nuevo grupo
        </button>
      ) : (
        <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-5 space-y-1">
          <Field label="Nombre del grupo" placeholder="Grupo de Programación" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Descripción (opcional)" placeholder="Herramientas y desarrollo" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Field label="Enlace" placeholder="https://chat.whatsapp.com/..." value={link} onChange={(e) => setLink(e.target.value)} />
          <div className="mb-4">
            <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">Rangos con acceso (vacío = todos)</span>
            <RankPicker value={ranks} onChange={setRanks} />
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={save} disabled={saving || !name.trim() || !link.trim()}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? "Guardar cambios" : "Crear grupo"}
            </PrimaryButton>
            <button onClick={resetForm} className="px-4 text-sm text-[#96939F] hover:text-[#F2F0EB]">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {groups.length === 0 && <div className="text-sm text-[#5B5866]">Todavía no hay grupos creados.</div>}
        {groups.map((g) => (
          <div key={g.id} className="bg-[#16171F] border border-[#2A2C38] rounded-lg px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{g.name}</div>
                {g.description && <div className="text-xs text-[#96939F]">{g.description}</div>}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(!g.ranks || g.ranks.length === 0) && (
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full border border-[#2A2C38] text-[#96939F]">Todos</span>
                  )}
                  {(g.ranks || []).map((rk) => (
                    <span key={rk} className="text-[10px] uppercase px-2 py-0.5 rounded-full border" style={{ color: RANKS[rk].color, borderColor: RANKS[rk].color }}>
                      {RANKS[rk].label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => editGroup(g)} className="text-xs text-[#6C6CF0] hover:underline">Editar</button>
                <button onClick={() => onDelete(g.id)} className="text-[#5B5866] hover:text-[#E07A7A]">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResueltaRow({ user, onSaveRanks }) {
  const [editing, setEditing] = useState(false);
  const [ranks, setRanks] = useState(userRanks(user));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSaveRanks(ranks);
    setSaving(false);
    setEditing(false);
  };

  const myRanks = userRanks(user);

  return (
    <div className="bg-[#16171F] border border-[#2A2C38] rounded-lg px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{user.nick}</span>
        <div className="flex items-center gap-2 shrink-0">
          {!editing && (
            <div className="flex flex-wrap gap-1 justify-end">
              {myRanks.map((rk) => (
                <span key={rk} className="text-[10px] uppercase px-2 py-0.5 rounded-full border" style={{ color: RANKS[rk].color, borderColor: RANKS[rk].color }}>
                  {RANKS[rk].label}
                </span>
              ))}
            </div>
          )}
          <StatusBadge status={user.status} />
          {user.status === "accepted" && !editing && (
            <button onClick={() => setEditing(true)} className="text-[11px] text-[#6C6CF0] hover:underline shrink-0">
              Cambiar rango
            </button>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-2.5 pt-2.5 border-t border-[#2A2C38] space-y-2.5">
          <RankPicker value={ranks} onChange={setRanks} />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 bg-[#4E9A6B]/15 text-[#4E9A6B] border border-[#4E9A6B]/40 rounded-lg px-3 py-2 text-xs hover:bg-[#4E9A6B]/25 disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Guardar
            </button>
            <button onClick={() => { setEditing(false); setRanks(userRanks(user)); }} className="text-xs text-[#96939F] px-2 py-2">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SolicitudCard({ user, onDecide }) {
  const [ranks, setRanks] = useState(userRanks(user).length ? userRanks(user) : (user.answers?.tareas || []));
  return (
    <div className="bg-[#16171F] border border-[#2A2C38] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{user.nick}</span>
        <StatusBadge status={user.status} />
      </div>
      <div className="text-xs text-[#96939F] space-y-0.5 mb-3">
        <div>Tel: {user.phone}</div>
        <div>Correo: {user.email}</div>
        <div>Experiencia previa: {user.answers?.experiencia || "—"}</div>
        <div>Se postula a: {(user.answers?.tareas || []).map((k) => RANKS[k].label).join(", ") || "—"}</div>
        {user.answers?.tareasDetalle && Object.keys(user.answers.tareasDetalle).length > 0 && (
          <div className="mt-1 space-y-0.5">
            {Object.entries(user.answers.tareasDetalle).map(([k, items]) => (
              items?.length > 0 && (
                <div key={k}>
                  <span style={{ color: RANKS[k]?.color }}>{RANKS[k]?.label}:</span> {items.join("; ")}
                </div>
              )
            ))}
          </div>
        )}
      </div>
      <div className="mb-3">
        <span className="block text-[10px] uppercase tracking-wide text-[#96939F] mb-1.5">Rango(s) a otorgar</span>
        <RankPicker value={ranks} onChange={setRanks} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onDecide(user, "accepted", ranks)} className="flex items-center gap-1.5 bg-[#4E9A6B]/15 text-[#4E9A6B] border border-[#4E9A6B]/40 rounded-lg px-3 py-2 text-sm hover:bg-[#4E9A6B]/25">
          <CheckCircle2 size={14} /> Aceptar
        </button>
        <button onClick={() => onDecide(user, "rejected", [])} className="flex items-center gap-1.5 bg-[#E07A7A]/15 text-[#E07A7A] border border-[#E07A7A]/40 rounded-lg px-3 py-2 text-sm hover:bg-[#E07A7A]/25">
          <XCircle size={14} /> Rechazar
        </button>
      </div>
    </div>
  );
}

function NoAdminAccess({ onExit }) {
  return (
    <Shell>
      <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6 text-center">
        <Shield size={24} className="mx-auto mb-3 text-[#96939F]" />
        <h2 className="text-lg font-semibold mb-1">Sin acceso de administrador</h2>
        <p className="text-sm text-[#96939F] mb-4">
          Tu cuenta no está en la lista de administradores del Consejo Coordinador.
        </p>
        <button onClick={onExit} className="text-sm text-[#6C6CF0]">Volver</button>
      </div>
    </Shell>
  );
}

/* ---------------- Root ---------------- */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null); // firebase auth user
  const [record, setRecord] = useState(null); // Firestore users/{uid}
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState("home");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        const snap = await getDoc(doc(db, "users", fbUser.uid));
        const data = snap.exists() ? snap.data() : null;
        setRecord(data);

        // "indrhack" es el administrador principal fijo. Si todavía no
        // tiene el rol de admin, se lo asigna a sí mismo automáticamente
        // al entrar (las reglas de Firestore solo permiten esto para ese
        // nick exacto — ver firestore.rules).
        if (data?.nick && data.nick.trim().toLowerCase() === "indrhack") {
          try {
            const adminSnap = await getDoc(doc(db, "admins", fbUser.uid));
            if (!adminSnap.exists()) {
              await setDoc(doc(db, "admins", fbUser.uid), {
                grantedAt: Date.now(),
                grantedBy: "bootstrap",
              });
            }
          } catch (e) {
            // Si las reglas de Firestore aún no están actualizadas en la
            // consola, esto simplemente no hace nada por ahora; se puede
            // volver a intentar en el siguiente inicio de sesión.
          }
        }

        // Cada quien que inicia sesión (indrhack u otro admin que él haya
        // otorgado) ve automáticamente su opción de Admin integrada.
        try {
          const adminSnap = await getDoc(doc(db, "admins", fbUser.uid));
          setIsAdmin(adminSnap.exists());
        } catch (e) {
          setIsAdmin(false);
        }
      } else {
        setRecord(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    setRecord(snap.exists() ? snap.data() : null);
  }, [user]);

  const logout = async () => {
    await signOut(auth);
    setTab("home");
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-[#96939F] justify-center">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      </Shell>
    );
  }

  // Antes de tener cuenta o de terminar el registro (encuesta / términos),
  // se mantiene el flujo de onboarding tal cual, sin la navegación principal.
  if (!user || !record) {
    return <AuthScreen />;
  }
  if (record.status === "survey-pending") {
    return <SurveyScreen uid={user.uid} onDone={refresh} />;
  }
  if (record.status === "terms-pending") {
    return <TermsScreen uid={user.uid} onSubmitted={refresh} />;
  }

  // Ya con cuenta activa: al iniciar sesión, la persona entra directo a
  // una página de contenido (Inicio) con navegación integrada, incluyendo
  // el panel de administración para quien tenga ese acceso.
  const isSuperAdmin = record.nick && record.nick.trim().toLowerCase() === "indrhack";

  if (tab === "admin" && isAdmin) {
    return <AdminPanel onExit={() => setTab("home")} currentUid={user.uid} isSuperAdmin={isSuperAdmin} />;
  }

  let body;
  if (tab === "directory") body = <DirectoryScreen canView={record.status === "accepted" || isAdmin} myRanks={userRanks(record)} />;
  else if (tab === "leaders") body = <LeadersScreen isSuperAdmin={isSuperAdmin} />;
  else if (tab === "profile") body = <ProfileScreen record={record} onLogout={logout} />;
  else body = <HomeFeed isAdmin={isAdmin} />;

  return (
    <Shell>
      <div className="w-full max-w-md pb-16">{body}</div>
      <BottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
    </Shell>
  );
}
