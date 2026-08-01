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
  doc, getDoc, setDoc, updateDoc, collection, getDocs,
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

const emptyLinks = () =>
  RANK_ORDER.reduce((acc, k) => ({ ...acc, [k]: { general: "", especifico: "" } }), {});

function cx(...a) {
  return a.filter(Boolean).join(" ");
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

function Field({ icon: Icon, label, ...props }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs tracking-wide uppercase text-[#96939F] mb-1.5">{label}</span>
      <div className="flex items-center gap-2 bg-[#1D1F2A] border border-[#2A2C38] rounded-lg px-3 py-2.5 focus-within:border-[#6C6CF0] transition-colors">
        {Icon && <Icon size={16} className="text-[#6C6CF0] shrink-0" />}
        <input
          {...props}
          className="bg-transparent outline-none w-full text-[#F2F0EB] placeholder:text-[#5B5866] text-sm"
        />
      </div>
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

        <Field icon={UserIcon} label="Nick o nombre" placeholder="Tu nombre ficticio" value={nick} onChange={(e) => setNick(e.target.value)} />
        <Field icon={Lock} label="Contraseña" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "register" && (
          <>
            <Field icon={Phone} label="Número de teléfono (para el grupo)" placeholder="+51 999 999 999" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Field icon={Mail} label="Correo electrónico (para recuperar tu cuenta)" type="email" placeholder="tucorreo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-[#E07A7A] mb-4">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <PrimaryButton onClick={submit} disabled={busy}>
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
  const [saving, setSaving] = useState(false);

  const toggleQ2 = (key) => {
    setQ2((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const finishSurvey = async () => {
    setSaving(true);
    await updateDoc(doc(db, "users", uid), {
      answers: { experiencia: q1, tareas: q2 },
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
                return (
                  <button
                    key={k}
                    onClick={() => toggleQ2(k)}
                    className={cx("w-full text-left px-4 py-3 rounded-lg border transition-colors", active ? "bg-white/5" : "border-[#2A2C38] hover:border-white/20")}
                    style={active ? { borderColor: r.color } : {}}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{r.title}</span>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: r.color, border: `1px solid ${r.color}` }}>
                        {r.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#96939F] mt-1">{r.blurb}</p>
                  </button>
                );
              })}
            </div>
            <PrimaryButton onClick={finishSurvey} disabled={q2.length === 0 || saving}>
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

function AdminPanel({ onExit }) {
  const [tab, setTab] = useState("solicitudes");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState(emptyLinks());
  const [savingLinks, setSavingLinks] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "users"));
    const recs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    recs.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    setUsers(recs);
    const lr = await getDoc(doc(db, "config", "rankLinks"));
    setLinks(lr.exists() ? lr.data() : emptyLinks());
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

  const solicitudes = users.filter((u) => u.status === "submitted");
  const resueltas = users.filter((u) => u.status === "accepted" || u.status === "rejected");

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
        setRecord(snap.exists() ? snap.data() : null);
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
    if (isAdmin === true) return <AdminPanel onExit={() => setAdminMode(false)} />;
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
