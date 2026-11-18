// Face ID lock: Homebase shows a lock screen when it opens (and again after you've been away a while).
// Face ID works through a passkey the iPhone keeps for Homebase - the face never leaves the phone and Homebase only
// learns "it was you". A backup code (stored only as a fingerprint, SHA-256 with salt) always works too, so you can
// never lock yourself out. This hides your data from someone holding your phone - it doesn't encrypt it.

import * as db from "./db.js";
import { h, icon, toast } from "./ui.js";

export const isOn = () => db.setting("lock.on", false) === true;
export const after = () => Number(db.setting("lock.after", 60));
export const hideInSwitcher = () => db.setting("lock.hide", true) !== false;
export const hasFaceId = () => !!db.setting("lock.cred", "");

const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const random = n => crypto.getRandomValues(new Uint8Array(n));

async function fingerprint(code, salt) {
  const data = new TextEncoder().encode(salt + ":" + code);
  return b64(await crypto.subtle.digest("SHA-256", data));
}

// Can this phone do Face ID / Touch ID for web apps?
export async function faceIdAvailable() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch (e) { return false; }
}

export async function setCode(code) {
  const salt = b64(random(16));
  await db.setSetting("lock.salt", salt);
  await db.setSetting("lock.code", await fingerprint(code, salt));
}
export async function checkCode(code) {
  const salt = db.setting("lock.salt", "");
  return !!salt && (await fingerprint(code, salt)) === db.setting("lock.code", "");
}

// Has to run straight from a tap (the iPhone shows its passkey sheet).
export async function setUpFaceId() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: random(32),
    rp: { name: "Homebase" },
    user: { id: random(16), name: "Homebase", displayName: "Homebase" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
    timeout: 60000 } });
  await db.setSetting("lock.cred", b64(cred.rawId));
}

async function faceId() {
  const id = db.setting("lock.cred", "");
  if (!id) return false;
  await navigator.credentials.get({ publicKey: { challenge: random(32), allowCredentials: [{ type: "public-key", id: unb64(id) }], userVerification: "required", timeout: 60000 } });
  return true;
}

// ---------------- The lock screen ----------------

let screen = null;
let hiddenAt = 0;
export const locked = () => !!screen;

export function lock() {
  if (screen || !isOn()) return;
  const msg = h("div.small.muted", { style: { minHeight: "20px", marginTop: "12px" } });
  const code = h("input.field", { type: "password", inputmode: "numeric", autocomplete: "off", placeholder: "Backup code", style: { maxWidth: "220px", textAlign: "center", fontSize: "20px", letterSpacing: "4px", display: "none", margin: "14px auto 0" } });
  const tryCode = async () => {
    if (await checkCode(code.value.trim())) unlock();
    else { msg.textContent = "That's not the code"; code.value = ""; code.focus(); screen.classList.add("shake"); setTimeout(() => screen && screen.classList.remove("shake"), 400); }
  };
  code.addEventListener("keydown", e => { if (e.key === "Enter") tryCode(); });
  const showCode = () => { code.style.display = "block"; codeBtn.textContent = "Unlock"; codeBtn.className = "btn primary"; codeBtn.style.marginTop = "14px"; codeBtn.onclick = tryCode; setTimeout(() => code.focus(), 50); };
  const codeBtn = h("button.btn.ghost", { style: { marginTop: "10px" } }, "Use backup code");
  codeBtn.onclick = showCode;
  const faceBtn = hasFaceId() ? h("button.btn.primary", { style: { marginTop: "30px", fontSize: "16px", padding: "13px 22px" }, html: icon("lock", 20) + " Unlock with Face ID",
    onclick: async () => {
      try { if (await faceId()) unlock(); } catch (e) { msg.textContent = "Face ID didn't work - try again or use your backup code"; }
    } }) : null;
  screen = h("div.lockscreen",
    h("img", { src: "icons/icon-180.png", alt: "", style: { width: "92px", height: "92px", borderRadius: "22px" } }),
    h("h1.serif", { style: { fontSize: "27px", margin: "20px 0 4px" } }, "Homebase is locked"),
    h("div.muted", "Your money and notes stay private"),
    faceBtn, code, codeBtn, msg);
  document.body.append(screen);
  if (!faceBtn) showCode();
}

export function unlock() {
  if (!screen) return;
  const s = screen;
  screen = null;
  s.classList.add("out");
  setTimeout(() => s.remove(), 220);
}

// Leaving the app: the lock screen covers it right away (so the app switcher shows that, not your balance).
// Coming back within the time you chose, it opens again by itself; after that - or when Homebase starts - it asks.
// A lock screen that asks never opens by itself, even if you switch away and back quickly.
export function watch() {
  if (isOn()) { lock(); markAsked(); }
  document.addEventListener("visibilitychange", () => {
    if (!isOn()) return;
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      if (hideInSwitcher() || after() === 0) lock();
      return;
    }
    const away = hiddenAt ? Date.now() - hiddenAt : Infinity;
    if (!screen) { if (away >= after() * 1000) { lock(); markAsked(); } }
    else if (!screen.dataset.asked) { if (away < after() * 1000) unlock(); else markAsked(); }
  });
}
export function markAsked() { if (screen) screen.dataset.asked = "1"; }
