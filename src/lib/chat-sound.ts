"use client";

/**
 * Sohbet bildirim sesleri — Web Audio API ile anlık sentezleniyor (dosya/asset
 * gerektirmez, bundle'a hiç eklenmez). Tarayıcıların autoplay kısıtlaması yüzünden
 * AudioContext ilk kullanıcı etkileşiminde (mesaj gönderme tıklaması gibi) "unlock"
 * olur — sayfa yüklenir yüklenmez hiç etkileşim olmadan gelen bir mesajın sesi bu
 * yüzden çalmayabilir, bu tarayıcı kısıtı, uygulama hatası değil.
 */
const STORAGE_KEY = "cdrive-chat-sound";

let ctx: AudioContext | null = null;
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isChatSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setChatSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
}

/** Kısa, yumuşak bir "pop" sesi — tek bir sinüs tonu, hızlı sönümlenen zarf. */
function playTone(freq: number, startAt: number, duration: number, gainPeak: number, audioCtx: AudioContext) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t = audioCtx.currentTime + startAt;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(gainPeak, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Mesaj gönderilince — tek, kısa, yükselen ton. */
export function playSentSound() {
  if (!isChatSoundEnabled()) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  playTone(720, 0, 0.09, 0.06, audioCtx);
}

/** Yeni mesaj gelince — iki tonlu, biraz daha belirgin "bildirim" sesi. */
export function playReceivedSound() {
  if (!isChatSoundEnabled()) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  playTone(520, 0, 0.1, 0.07, audioCtx);
  playTone(780, 0.08, 0.12, 0.07, audioCtx);
}
