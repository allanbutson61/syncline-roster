import React, { useState } from "react";
import { signIn, requestReset, CONFIGURED } from "./supabase.js";
import LOGO from "./logo.js";

const C = {
  page: "#F7F4F1", panel: "#FFFFFF", line: "#E5DED8", line2: "#CFC5BD",
  ink: "#312122", dim: "#7A6A64", red: "#B02423", orange: "#DC7A40",
};
const mono = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const disp = "'Barlow Condensed', 'IBM Plex Sans', sans-serif";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    setBusy(true); setErr(""); setNote("");
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setErr(error);
  };

  const reset = async () => {
    if (!email.trim()) { setErr("Enter your email first, then press Forgotten password."); return; }
    setBusy(true); setErr("");
    const { error } = await requestReset(email);
    setBusy(false);
    if (error) setErr(error);
    else setNote("If that email has an account, a reset link is on its way. Check junk mail too.");
  };

  const field = { width: "100%", background: "#FFF", color: C.ink,
    border: `1px solid ${C.line2}`, padding: "9px 10px", fontFamily: mono,
    fontSize: 13, borderRadius: 2, marginBottom: 10 };

  return (
    <div style={{ background: C.page, minHeight: "100vh", fontFamily: sans, color: C.ink,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <img src={LOGO} alt="Syncline Haulage" style={{ height: 74, width: "auto" }} />
          <div style={{ fontFamily: disp, fontSize: 24, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", marginTop: 6 }}>Roster Control</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, letterSpacing: ".1em",
            marginTop: 3 }}>ELIWANA / KARTAJIRRI VILLAGE · FMG</div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.line}`,
          borderTop: `3px solid ${C.red}`, padding: 20, borderRadius: 2 }}>
          {!CONFIGURED ? (
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              The database isn't connected yet. Add <b>VITE_SUPABASE_URL</b> and{" "}
              <b>VITE_SUPABASE_ANON_KEY</b> to the Netlify environment variables and redeploy.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em",
                textTransform: "uppercase", color: C.dim, marginBottom: 4 }}>Email</div>
              <input type="email" value={email} autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} style={field} />

              <div style={{ fontFamily: disp, fontSize: 11.5, letterSpacing: ".12em",
                textTransform: "uppercase", color: C.dim, marginBottom: 4 }}>Password</div>
              <input type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} style={field} />

              {err && <div style={{ color: C.red, fontFamily: mono, fontSize: 11.5,
                marginBottom: 10, lineHeight: 1.5 }}>{err}</div>}
              {note && <div style={{ color: C.orange, fontFamily: mono, fontSize: 11.5,
                marginBottom: 10, lineHeight: 1.5 }}>{note}</div>}

              <button onClick={submit} disabled={busy} style={{ width: "100%",
                background: C.red, color: "#FFF", border: `1px solid ${C.red}`,
                padding: "10px 14px", borderRadius: 2, cursor: busy ? "wait" : "pointer",
                fontFamily: disp, fontSize: 14, letterSpacing: ".1em", textTransform: "uppercase",
                fontWeight: 600 }}>{busy ? "Signing in…" : "Sign in"}</button>

              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button onClick={reset} disabled={busy} style={{ background: "none", border: "none",
                  color: C.dim, fontFamily: mono, fontSize: 11, cursor: "pointer",
                  textDecoration: "underline" }}>Forgotten password</button>
              </div>
            </>
          )}
        </div>

        <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, textAlign: "center",
          marginTop: 14, lineHeight: 1.6 }}>
          Everyone works on the same roster now. Changes you make appear on
          everyone else's screen, recorded against your name.
          <br />No account? Ask Jaki — admin@synclinehaulage.com.au
        </div>
      </div>
    </div>
  );
}
