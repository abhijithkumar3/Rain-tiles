import type { Theme } from "./themes";
import { areaToFrequency } from "./pitch";

type Drop = { x: number; y: number; vx: number; vy: number; len: number; a: number; tint: number; bounces: number };
type Pane = { id: number; x: number; y: number; w: number; h: number; angle: number; ci: number; flash: number; golden: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Ripple = { x: number; y: number; r: number; life: number };
type Bokeh = { x: number; y: number; r: number; a: number; vx: number };

const GRAVITY = 0.32;
const RING_GAP = 16;
const RING_R = 5;
const MAX_VOICES = 24;

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

class Piano {
  ctx: AudioContext;
  master: GainNode;
  clipOut: MediaStreamAudioDestinationNode;
  clipGain: GainNode;
  private voices: { g: GainNode; end: number }[] = [];
  private perFrame = 0;

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    // short synthetic reverb
    const conv = this.ctx.createConvolver();
    const len = this.ctx.sampleRate * 3.2;
    const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i]! = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    conv.buffer = ir;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.42;
    this.master.connect(comp);
    this.master.connect(conv).connect(wet).connect(comp);
    comp.connect(this.ctx.destination);
    this.clipOut = this.ctx.createMediaStreamDestination();
    this.clipGain = this.ctx.createGain();
    comp.connect(this.clipGain).connect(this.clipOut);
  }

  resume() {
    if (this.ctx.state !== "running") void this.ctx.resume();
  }
  frame() {
    this.perFrame = 0;
  }

  note(freq: number, vel: number, bright = false) {
    if (this.ctx.state !== "running" || this.perFrame > 2) return;
    this.perFrame++;
    const t = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > t);
    if (this.voices.length >= MAX_VOICES) {
      const old = this.voices.shift()!;
      old.g.gain.cancelScheduledValues(t);
      old.g.gain.setTargetAtTime(0, t, 0.08);
    }
    // Soft felt-piano voice: sine partials with decaying overtones, long natural ring.
    const dur = Math.max(1.6, 4.2 - Math.log2(freq / 110) * 0.8) * (bright ? 0.7 : 1);
    const amp = Math.min(0.035 + Math.min(vel, 3) * 0.02, 0.11) * (bright ? 0.8 : 1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.018);
    g.gain.setTargetAtTime(amp * 0.45, t + 0.018, 0.25);
    g.gain.setTargetAtTime(0.0001, t + 0.5, dur / 4);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.3;
    f.frequency.setValueAtTime(Math.min(freq * 5, 4500), t);
    f.frequency.setTargetAtTime(Math.max(freq * 1.4, 250), t + 0.02, dur / 5);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * 0.35;
    f.connect(g).connect(pan).connect(this.master);
    const partials: [number, number][] = [[1, 1], [2, 0.32], [3, 0.12], [4, 0.05]];
    for (const [mul, a] of partials) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mul;
      o.detune.value = (Math.random() * 2 - 1) * 3 + (mul > 1 ? mul * 1.5 : 0);
      const pg = this.ctx.createGain();
      pg.gain.setValueAtTime(a, t);
      if (mul > 1) pg.gain.setTargetAtTime(a * 0.2, t, 0.3 / mul);
      o.connect(pg).connect(f);
      o.start(t);
      o.stop(t + dur + 0.2);
    }
    this.voices.push({ g, end: t + dur });
  }
}

export type EngineEvents = { onFirstPane?: () => void; onFirstManipulate?: () => void; onReset?: () => void };

export class RainEngine {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private drops: Drop[] = [];
  private panes: Pane[] = [];
  private sparks: Spark[] = [];
  private ripples: Ripple[] = [];
  private bokeh: Bokeh[] = [];
  private stroke: { x: number; y: number }[] = [];
  private mode: "draw" | "drag" | "tilt" | null = null;
  private target: Pane | null = null;
  private grab = { dx: 0, dy: 0, a0: 0, ang0: 0, sx: 0, sy: 0, t: 0, moved: 0 };
  private nextId = 1;
  private raf = 0;
  private theme: Theme;
  piano: Piano;
  private madePane = false;
  private manipulated = false;
  private paneCount = 0;

  constructor(private canvas: HTMLCanvasElement, theme: Theme, private events: EngineEvents = {}) {
    this.ctx = canvas.getContext("2d")!;
    this.theme = theme;
    this.piano = new Piano();
    this.resize();
    for (let i = 0; i < 14; i++)
      this.bokeh.push({ x: Math.random() * this.W, y: Math.random() * this.H * 0.9, r: 10 + Math.random() * 30, a: 0.03 + Math.random() * 0.05, vx: (Math.random() - 0.5) * 0.08 });
    window.addEventListener("resize", this.resize);
    canvas.addEventListener("pointerdown", this.down);
    window.addEventListener("pointermove", this.move);
    window.addEventListener("pointerup", this.up);
    window.addEventListener("pointercancel", this.up);
    this.loop();
  }

  setTheme(t: Theme) {
    this.theme = t;
  }

  /** Remove every pane and rewind the toy to its opening state. */
  clearAll() {
    const all = this.panes.splice(0, this.panes.length);
    for (const p of all) this.shatter(p, 2);
    this.mode = null;
    this.target = null;
    this.stroke = [];
    this.paneCount = 0;
    this.madePane = false;
    this.manipulated = false;
    this.events.onReset?.();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("pointerdown", this.down);
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.up);
    window.removeEventListener("pointercancel", this.up);
    void this.piano.ctx.close();
  }

  private get groundY() {
    return this.H * 0.93;
  }

  private resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = this.W + "px";
    this.canvas.style.height = this.H + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  // ---------- geometry ----------
  private toLocal(p: Pane, x: number, y: number) {
    const c = Math.cos(-p.angle), s = Math.sin(-p.angle);
    const dx = x - p.x, dy = y - p.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }
  private ringPos(p: Pane) {
    const ly = p.h / 2 + RING_GAP;
    return { x: p.x - Math.sin(p.angle) * ly, y: p.y + Math.cos(p.angle) * ly };
  }
  private hitPane(x: number, y: number): Pane | null {
    for (let i = this.panes.length - 1; i >= 0; i--) {
      const p = this.panes[i]!;
      const l = this.toLocal(p, x, y);
      if (Math.abs(l.x) <= p.w / 2 + 6 && Math.abs(l.y) <= p.h / 2 + 6) return p;
    }
    return null;
  }
  private hitRing(x: number, y: number): Pane | null {
    for (let i = this.panes.length - 1; i >= 0; i--) {
      const r = this.ringPos(this.panes[i]!);
      if (Math.hypot(x - r.x, y - r.y) < 18) return this.panes[i]!;
    }
    return null;
  }

  // ---------- input ----------
  private down = (e: PointerEvent) => {
    this.piano.resume();
    const x = e.clientX, y = e.clientY;
    this.grab = { ...this.grab, sx: x, sy: y, t: performance.now(), moved: 0 };
    const ring = this.hitRing(x, y);
    if (ring) {
      this.mode = "tilt";
      this.target = ring;
      this.grab.a0 = Math.atan2(y - ring.y, x - ring.x);
      this.grab.ang0 = ring.angle;
      return;
    }
    const p = this.hitPane(x, y);
    if (p) {
      this.mode = "drag";
      this.target = p;
      this.grab.dx = x - p.x;
      this.grab.dy = y - p.y;
      this.panes.splice(this.panes.indexOf(p), 1);
      this.panes.push(p);
      return;
    }
    this.mode = "draw";
    this.stroke = [{ x, y }];
  };

  private move = (e: PointerEvent) => {
    if (!this.mode) return;
    const x = e.clientX, y = e.clientY;
    this.grab.moved = Math.max(this.grab.moved, Math.hypot(x - this.grab.sx, y - this.grab.sy));
    if (this.mode === "draw") this.stroke.push({ x, y });
    else if (this.mode === "drag" && this.target && this.grab.moved > 6) {
      this.target.x = x - this.grab.dx;
      this.target.y = Math.min(y - this.grab.dy, this.groundY - 10);
      this.markManipulated();
    } else if (this.mode === "tilt" && this.target) {
      const a = Math.atan2(y - this.target.y, x - this.target.x);
      this.target.angle = this.grab.ang0 + (a - this.grab.a0);
      this.markManipulated();
    }
  };

  private up = () => {
    if (this.mode === "draw" && this.stroke.length > 1) {
      const xs = this.stroke.map((p) => p.x), ys = this.stroke.map((p) => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const w = x1 - x0, h = Math.max(y1 - y0, 14);
      if (w > 24 || y1 - y0 > 24) this.addPane((x0 + x1) / 2, (y0 + y1) / 2, Math.max(w, 14), h);
    } else if (this.mode === "drag" && this.target && this.grab.moved < 6 && performance.now() - this.grab.t < 350) {
      this.pop(this.target);
    }
    this.mode = null;
    this.target = null;
    this.stroke = [];
  };

  private markManipulated() {
    if (!this.manipulated) {
      this.manipulated = true;
      this.events.onFirstManipulate?.();
    }
  }

  private addPane(x: number, y: number, w: number, h: number) {
    this.paneCount++;
    const golden = this.paneCount % 7 === 0 && w * h > 40000;
    this.panes.push({ id: this.nextId++, x, y, w, h, angle: 0, ci: this.paneCount % this.theme.glass.length, flash: 1, golden });
    if (this.panes.length > 14) this.panes.shift();
    if (!this.madePane) {
      this.madePane = true;
      this.events.onFirstPane?.();
    }
  }

  private paneColor(p: Pane) {
    return p.golden ? "#FFC83D" : this.theme.glass[p.ci % this.theme.glass.length]!;
  }

  private pop(p: Pane) {
    this.panes.splice(this.panes.indexOf(p), 1);
    this.shatter(p, 2.5);
    this.markManipulated();
  }

  /** Break one pane into sparks and ring out its note once. */
  private shatter(p: Pane, vel: number) {
    const col = this.paneColor(p);
    const n = Math.min(60 + (p.w + p.h) / 3, 160);
    for (let i = 0; i < n && this.sparks.length < 900; i++) {
      const lx = (Math.random() - 0.5) * p.w, ly = (Math.random() - 0.5) * p.h;
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 6;
      this.sparks.push({ x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 0, max: 40 + Math.random() * 40, color: Math.random() < 0.15 ? "#FFFFFF" : col, size: 1 + Math.random() * 2 });
    }
    this.piano.note(areaToFrequency(p.w * p.h, 400, this.W * this.H * 0.35) * 2, vel, true);
  }

  // ---------- simulation ----------
  private spawnRain() {
    const target = Math.min(320, Math.round((this.W * this.H) / 4200));
    let budget = 8;
    while (this.drops.length < target && budget-- > 0) {
      this.drops.push({ x: Math.random() * (this.W + 60) - 30, y: -20 - Math.random() * 60, vx: 0.15 + Math.random() * 0.2, vy: 9 + Math.random() * 5, len: 8 + Math.random() * 12, a: 0.35 + Math.random() * 0.55, tint: -1, bounces: 0 });
    }
  }

  private collide(d: Drop) {
    for (let i = this.panes.length - 1; i >= 0; i--) {
      const p = this.panes[i]!;
      const l = this.toLocal(p, d.x, d.y);
      const hw = p.w / 2, hh = p.h / 2;
      if (Math.abs(l.x) > hw || Math.abs(l.y) > hh) continue;
      // nearest edge
      const pen = [l.y + hh, hh - l.y, l.x + hw, hw - l.x]; // top,bottom,left,right
      let k = 0;
      for (let j = 1; j < 4; j++) if (pen[j]! < pen[k]!) k = j;
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      let lvx = d.vx * c + d.vy * s, lvy = -d.vx * s + d.vy * c;
      const speed = Math.hypot(lvx, lvy);
      let nx = 0, ny = 0;
      if (k === 0) { l.y = -hh - 0.5; ny = -1; lvy = -Math.abs(lvy) * (0.25 + Math.random() * 0.2); lvx += (Math.random() - 0.5) * 3; }
      else if (k === 1) { l.y = hh + 0.5; ny = 1; lvy = Math.abs(lvy) * 0.3; }
      else if (k === 2) { l.x = -hw - 0.5; nx = -1; lvx = -Math.abs(lvx) * 0.4 - 1; }
      else { l.x = hw + 0.5; nx = 1; lvx = Math.abs(lvx) * 0.4 + 1; }
      d.x = p.x + l.x * c - l.y * s;
      d.y = p.y + l.x * s + l.y * c;
      d.vx = lvx * c - lvy * s;
      d.vy = lvx * s + lvy * c;
      d.tint = p.golden ? 99 : p.ci;
      d.bounces++;
      p.flash = Math.min(p.flash + 0.06, 1);
      if (d.bounces <= 2) {
        const col = this.paneColor(p);
        const n = 4 + Math.floor(Math.random() * 6);
        const wnx = nx * c - ny * s, wny = nx * s + ny * c;
        const base = Math.atan2(wny, wnx);
        for (let j = 0; j < n && this.sparks.length < 900; j++) {
          const a = base + (Math.random() - 0.5) * 2.2, sp = 1 + Math.random() * 3;
          this.sparks.push({ x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 12 + Math.random() * 14, color: col, size: 1 });
        }
        if (d.bounces === 1) this.piano.note(areaToFrequency(p.w * p.h, 400, this.W * this.H * 0.35), speed / 6);
      }
      return;
    }
  }

  private step() {
    this.spawnRain();
    const gy = this.groundY;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      for (let s = 0; s < 2; s++) {
        d.vy += GRAVITY / 2;
        d.x += d.vx / 2;
        d.y += d.vy / 2;
        if (this.panes.length) this.collide(d);
      }
      if (d.y >= gy) {
        if (Math.random() < 0.35) this.ripples.push({ x: d.x, y: gy + 4 + Math.random() * (this.H - gy - 6), r: 1, life: 1 });
        this.drops.splice(i, 1);
      } else if (d.x < -50 || d.x > this.W + 50) this.drops.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.vy += 0.12;
      s.vx *= 0.97;
      s.x += s.vx;
      s.y += s.vy;
      if (++s.life > s.max) this.sparks.splice(i, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.r += 0.45;
      r.life -= 0.018;
      if (r.life <= 0) this.ripples.splice(i, 1);
    }
    if (this.ripples.length > 120) this.ripples.splice(0, this.ripples.length - 120);
    for (const p of this.panes) p.flash *= 0.94;
    for (const b of this.bokeh) {
      b.x += b.vx;
      if (b.x < -40) b.x = this.W + 40;
      if (b.x > this.W + 40) b.x = -40;
    }
  }

  // ---------- render ----------
  private drawPane(p: Pane) {
    const ctx = this.ctx;
    const col = this.paneColor(p);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    const r = Math.min(8, p.w / 3, p.h / 3);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(p.w, p.h) * 0.7);
    g.addColorStop(0, hexA(col, 0.32 + p.flash * 0.1));
    g.addColorStop(1, hexA(col, 0.1));
    ctx.beginPath();
    ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = col;
    ctx.shadowBlur = p.golden ? 28 : 16;
    ctx.strokeStyle = col;
    ctx.lineWidth = p.golden ? 3.5 : 1.8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexA("#FFFFFF", 0.35 + p.flash * 0.3);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // ring handle
    ctx.strokeStyle = hexA(col, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, p.h / 2);
    ctx.lineTo(0, p.h / 2 + RING_GAP - RING_R);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, p.h / 2 + RING_GAP, RING_R, 0, Math.PI * 2);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  private render() {
    const ctx = this.ctx, W = this.W, H = this.H, t = this.theme, gy = this.groundY;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, t.bgTop);
    bg.addColorStop(1, t.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    for (const b of this.bokeh) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, hexA(t.ripple, b.a));
      g.addColorStop(1, hexA(t.ripple, 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    // ground
    const gg = ctx.createLinearGradient(0, gy, 0, H);
    gg.addColorStop(0, "rgba(0,0,0,0.25)");
    gg.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.strokeStyle = hexA(t.ripple, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
    // reflections of panes
    for (const p of this.panes) {
      ctx.fillStyle = hexA(this.paneColor(p), 0.12);
      ctx.fillRect(p.x - p.w / 2, gy + 6 + ((p.y / H) * (H - gy)) * 0.4, p.w, 2);
    }
    for (const r of this.ripples) {
      ctx.strokeStyle = hexA(t.ripple, r.life * 0.35);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * 2, r.r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // rain
    ctx.lineCap = "round";
    for (const d of this.drops) {
      const col = d.tint === 99 ? "#FFD27A" : d.tint >= 0 ? t.glass[d.tint % t.glass.length]! : t.rain[(d.len | 0) % t.rain.length]!;
      ctx.strokeStyle = hexA(col, d.tint >= 0 ? Math.min(d.a + 0.3, 1) : d.a);
      ctx.lineWidth = d.tint >= 0 ? 1.6 : 1.1;
      const sp = Math.hypot(d.vx, d.vy) || 1;
      const l = d.tint >= 0 ? Math.min(d.len, 9) : d.len;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - (d.vx / sp) * l, d.y - (d.vy / sp) * l);
      ctx.stroke();
    }
    for (const p of this.panes) this.drawPane(p);
    // sparks
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.sparks) {
      const a = 1 - s.life / s.max;
      ctx.strokeStyle = hexA(s.color, a);
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 1.5, s.y - s.vy * 1.5);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    // drawing preview
    if (this.mode === "draw" && this.stroke.length > 1) {
      const col = t.glass[(this.paneCount + 1) % t.glass.length]!;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.stroke.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  private loop = () => {
    this.piano.frame();
    this.step();
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };
}
