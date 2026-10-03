/** Tiny procedural sound bed — no assets, all oscillators. */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private nextBeat = 0;
  enabled = true;

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // low drone
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 220;
    g.connect(filt);
    filt.connect(this.master);
    for (const f of [41, 55.3, 82.5]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const og = this.ctx.createGain();
      og.gain.value = 0.16;
      o.connect(og);
      og.connect(g);
      o.start();
    }
    g.gain.linearRampToValueAtTime(0.22, this.ctx.currentTime + 3);
    this.droneGain = g;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
  }

  private env(node: AudioNode, dur: number, peak: number) {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(peak, this.ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  /** proximity 0..1 drives the heartbeat interval. */
  tick(t: number, proximity: number, conviction: number) {
    if (!this.ctx || !this.enabled) return;
    if (this.droneGain) {
      this.droneGain.gain.setTargetAtTime(0.14 + conviction * 0.2, this.ctx.currentTime, 0.4);
    }
    const interval = 1.25 - proximity * 0.75;
    if (t < this.nextBeat) return;
    this.nextBeat = t + interval;
    if (proximity < 0.06) return;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(78, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(38, this.ctx.currentTime + 0.16);
    this.env(o, 0.24, 0.16 + proximity * 0.3);
    o.start();
    o.stop(this.ctx.currentTime + 0.3);
  }

  sting(kind: "unreadable" | "lock" | "pickup" | "caught" | "gate") {
    if (!this.ctx || !this.enabled) return;
    if (kind === "unreadable") {
      const buf = this.ctx.createBuffer(1, 6000, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.4;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1400;
      src.connect(f);
      this.env(f, 0.4, 0.09);
      src.start();
      return;
    }
    if (kind === "caught") {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(320, this.ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(38, this.ctx.currentTime + 1.1);
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;
      o.connect(f);
      this.env(f, 1.3, 0.5);
      o.start();
      o.stop(this.ctx.currentTime + 1.4);
      return;
    }
    const notes: Record<string, number[]> = {
      lock: [180, 240],
      pickup: [520, 780],
      gate: [392, 587, 784],
    };
    notes[kind].forEach((f0, i) => {
      const o = this.ctx!.createOscillator();
      o.type = kind === "lock" ? "square" : "triangle";
      o.frequency.value = f0;
      const g = this.env(o, 0.5, kind === "lock" ? 0.12 : 0.16);
      if (g && this.ctx) g.gain.setValueAtTime(0.0001, this.ctx.currentTime + i * 0.09);
      o.start(this.ctx!.currentTime + i * 0.09);
      o.stop(this.ctx!.currentTime + 0.7 + i * 0.09);
    });
  }
}

export const sound = new Sound();
