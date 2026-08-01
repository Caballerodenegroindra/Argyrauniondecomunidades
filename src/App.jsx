import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, Users, Sparkles, Lock, Mail, Phone, User as UserIcon,
  CheckCircle2, XCircle, ChevronRight, LogOut, Settings, ClipboardList,
  ExternalLink, AlertCircle, Loader2
} from "lucide-react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
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

const emptyLinks = () =>
  RANK_ORDER.reduce((acc, k) => ({ ...acc, [k]: { general: "", especifico: "" } }), {});

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
          rank: null,
          createdAt: Date.now(),
        });
        await setDoc(nameRef, { uid: cred.user.uid, email: email.trim() });
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
  const [links, setLinks] = useState(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "config", "rankLinks"));
      setLinks(snap.exists() ? snap.data() : emptyLinks());
    })();
  }, []);

  const rank = record.rank ? RANKS[record.rank] : null;
  const rankLinks = links && record.rank ? links[record.rank] : null;

  return (
    <Shell>
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

        {record.status === "accepted" && rank && (
          <div>
            <div className="rounded-xl p-4 mb-4 border" style={{ borderColor: rank.color, background: `${rank.color}14` }}>
              <span className="font-semibold" style={{ color: rank.color }}>{rank.label}</span>
              <div className="text-sm text-[#D8D5E0]">{rank.title}</div>
              <p className="text-xs text-[#96939F] mt-2">{rank.blurb}</p>
            </div>

            <div className="text-xs uppercase tracking-wide text-[#96939F] mb-2">Tus enlaces de grupo</div>
            <div className="space-y-2 mb-2">
              <a
                href={rankLinks?.general || "#"}
                target="_blank" rel="noreferrer"
                className={cx("flex items-center justify-between px-4 py-3 rounded-lg border text-sm", rankLinks?.general ? "border-[#2A2C38] hover:border-[#6C6CF0]" : "border-[#2A2C38] opacity-40 pointer-events-none")}
              >
                Grupo general <ExternalLink size={14} />
              </a>
              <a
                href={rankLinks?.especifico || "#"}
                target="_blank" rel="noreferrer"
                className={cx("flex items-center justify-between px-4 py-3 rounded-lg border text-sm", rankLinks?.especifico ? "border-[#2A2C38] hover:border-[#6C6CF0]" : "border-[#2A2C38] opacity-40 pointer-events-none")}
              >
                Grupo de {rank.label} <ExternalLink size={14} />
              </a>
            </div>
            {!(rankLinks?.general && rankLinks?.especifico) && (
              <p className="text-xs text-[#96939F]">Un administrador todavía no configuró estos enlaces.</p>
            )}
          </div>
        )}

        <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-sm text-[#96939F] hover:text-[#F2F0EB] mt-6 pt-4 border-t border-[#2A2C38]">
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
    </Shell>
  );
}

/* ---------------- Admin ---------------- */

function AdminPanel({ onExit, currentUid }) {
  const [tab, setTab] = useState("solicitudes");
  const [users, setUsers] = useState([]);
  const [adminUids, setAdminUids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState(emptyLinks());
  const [savingLinks, setSavingLinks] = useState(false);

  const [grantNick, setGrantNick] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [grantMsg, setGrantMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "users"));
    const recs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    recs.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    setUsers(recs);
    const lr = await getDoc(doc(db, "config", "rankLinks"));
    setLinks(lr.exists() ? lr.data() : emptyLinks());
    const adminsSnap = await getDocs(collection(db, "admins"));
    setAdminUids(adminsSnap.docs.map((d) => d.id));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (user, status, rank) => {
    await updateDoc(doc(db, "users", user.id), { status, rank: rank || user.rank || null });
    load();
  };

  const saveLinks = async () => {
    setSavingLinks(true);
    await setDoc(doc(db, "config", "rankLinks"), links);
    setSavingLinks(false);
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
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex bg-[#1D1F2A] rounded-lg p-1">
            <button onClick={() => setTab("solicitudes")} className={cx("text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5", tab === "solicitudes" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>
              <ClipboardList size={14} /> Solicitudes
            </button>
            <button onClick={() => setTab("enlaces")} className={cx("text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5", tab === "enlaces" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>
              <Settings size={14} /> Enlaces por rango
            </button>
            <button onClick={() => setTab("admins")} className={cx("text-sm px-3 py-1.5 rounded-md flex items-center gap-1.5", tab === "admins" ? "bg-[#6C6CF0] text-white" : "text-[#96939F]")}>
              <Shield size={14} /> Administradores
            </button>
          </div>
          <button onClick={onExit} className="text-xs text-[#96939F] hover:text-[#F2F0EB]">Salir</button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-[#96939F]">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </div>
        )}

        {!loading && tab === "solicitudes" && (
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
                    <div key={u.id} className="flex items-center justify-between bg-[#16171F] border border-[#2A2C38] rounded-lg px-4 py-2.5 text-sm">
                      <span>{u.nick}</span>
                      <div className="flex items-center gap-2">
                        {u.rank && (
                          <span className="text-[10px] uppercase px-2 py-0.5 rounded-full border" style={{ color: RANKS[u.rank].color, borderColor: RANKS[u.rank].color }}>
                            {RANKS[u.rank].label}
                          </span>
                        )}
                        <StatusBadge status={u.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && tab === "enlaces" && (
          <div className="bg-[#16171F] border border-[#2A2C38] rounded-2xl p-6 space-y-5">
            {RANK_ORDER.map((k) => (
              <div key={k}>
                <div className="text-sm font-medium mb-2" style={{ color: RANKS[k].color }}>
                  {RANKS[k].label} — {RANKS[k].title}
                </div>
                <Field
                  label="Enlace del grupo general"
                  placeholder="https://chat.whatsapp.com/..."
                  value={links[k]?.general || ""}
                  onChange={(e) => setLinks((prev) => ({ ...prev, [k]: { ...prev[k], general: e.target.value } }))}
                />
                <Field
                  label={`Enlace específico de ${RANKS[k].label}`}
                  placeholder="https://chat.whatsapp.com/..."
                  value={links[k]?.especifico || ""}
                  onChange={(e) => setLinks((prev) => ({ ...prev, [k]: { ...prev[k], especifico: e.target.value } }))}
                />
              </div>
            ))}
            <PrimaryButton onClick={saveLinks} disabled={savingLinks}>
              {savingLinks ? <Loader2 size={16} className="animate-spin" /> : "Guardar enlaces"}
            </PrimaryButton>
          </div>
        )}

        {!loading && tab === "admins" && (
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

function SolicitudCard({ user, onDecide }) {
  const [rank, setRank] = useState(user.rank || user.answers?.tareas?.[0] || RANK_ORDER[0]);
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
      <div className="flex items-center gap-2">
        <select value={rank} onChange={(e) => setRank(e.target.value)} className="bg-[#1D1F2A] border border-[#2A2C38] rounded-lg text-sm px-2 py-2 flex-1">
          {RANK_ORDER.map((k) => <option key={k} value={k}>{RANKS[k].label}</option>)}
        </select>
        <button onClick={() => onDecide(user, "accepted", rank)} className="flex items-center gap-1.5 bg-[#4E9A6B]/15 text-[#4E9A6B] border border-[#4E9A6B]/40 rounded-lg px-3 py-2 text-sm hover:bg-[#4E9A6B]/25">
          <CheckCircle2 size={14} /> Aceptar
        </button>
        <button onClick={() => onDecide(user, "rejected")} className="flex items-center gap-1.5 bg-[#E07A7A]/15 text-[#E07A7A] border border-[#E07A7A]/40 rounded-lg px-3 py-2 text-sm hover:bg-[#E07A7A]/25">
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
  const [adminMode, setAdminMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(null); // null = checking

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
      } else {
        setRecord(null);
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

  const enterAdmin = async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "admins", user.uid));
    setIsAdmin(snap.exists());
    setAdminMode(true);
  };

  const logout = async () => {
    await signOut(auth);
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

  if (adminMode) {
    if (isAdmin === false) return <NoAdminAccess onExit={() => setAdminMode(false)} />;
    if (isAdmin === true) return <AdminPanel onExit={() => setAdminMode(false)} currentUid={user.uid} />;
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-[#96939F] justify-center">
          <Loader2 size={16} className="animate-spin" /> Verificando acceso…
        </div>
      </Shell>
    );
  }

  let body;
  if (!user || !record) {
    body = <AuthScreen />;
  } else if (record.status === "survey-pending") {
    body = <SurveyScreen uid={user.uid} onDone={refresh} />;
  } else if (record.status === "terms-pending") {
    body = <TermsScreen uid={user.uid} onSubmitted={refresh} />;
  } else {
    body = <ProfileScreen record={record} onLogout={logout} />;
  }

  return (
    <div>
      {body}
      {user && (
        <div className="text-center pb-6 relative z-10 -mt-6">
          <button onClick={enterAdmin} className="text-[10px] text-[#5B5866] hover:text-[#96939F] tracking-wide uppercase">
            Panel de administración
          </button>
        </div>
      )}
    </div>
  );
}
