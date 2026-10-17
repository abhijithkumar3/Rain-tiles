/**
 * Rolling clip recorder: three staggered MediaRecorders, each cycling every 12s,
 * offset by 4s. The oldest running slot therefore always holds ~8–12s of footage.
 */
const CYCLE_MS = 12000;
const SLOTS = 3;

type Slot = {
  rec: MediaRecorder | null;
  chunks: Blob[];
  startedAt: number;
  timer: number | null;
  resolve: ((b: Blob) => void) | null;
};

export function pickMime(): string {
  const cands = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of cands) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

export class ClipRecorder {
  private slots: Slot[] = [];
  private mime = pickMime();
  private stopped = false;
  private offsets: number[] = [];

  constructor(private stream: MediaStream) {}

  get supported() {
    return typeof MediaRecorder !== "undefined" && !!this.mime;
  }
  get extension() {
    return this.mime.includes("mp4") ? "mp4" : "webm";
  }
  get mimeType() {
    return this.mime.split(";")[0] || "video/webm";
  }

  start() {
    if (!this.supported) return;
    for (let i = 0; i < SLOTS; i++) {
      const slot: Slot = { rec: null, chunks: [], startedAt: 0, timer: null, resolve: null };
      this.slots.push(slot);
      this.offsets.push(window.setTimeout(() => this.run(slot), (i * CYCLE_MS) / SLOTS));
    }
  }

  private run(slot: Slot) {
    if (this.stopped) return;
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 6_000_000 });
    slot.rec = rec;
    slot.chunks = [];
    rec.ondataavailable = (e) => e.data.size && slot.chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(slot.chunks, { type: this.mimeType });
      const r = slot.resolve;
      slot.resolve = null;
      r?.(blob);
      this.run(slot);
    };
    slot.startedAt = performance.now();
    rec.start();
    slot.timer = window.setTimeout(() => rec.state === "recording" && rec.stop(), CYCLE_MS);
  }

  /** Grab the longest available recent footage (up to 12s). */
  capture(): Promise<Blob> | null {
    const live = this.slots.filter((s) => s.rec?.state === "recording" && !s.resolve);
    if (!live.length) return null;
    const oldest = live.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
    if (oldest.timer) clearTimeout(oldest.timer);
    return new Promise<Blob>((res) => {
      oldest.resolve = res;
      oldest.rec!.stop();
    });
  }

  dispose() {
    this.stopped = true;
    this.offsets.forEach(clearTimeout);
    for (const s of this.slots) {
      if (s.timer) clearTimeout(s.timer);
      if (s.rec?.state === "recording") s.rec.stop();
    }
  }
}
