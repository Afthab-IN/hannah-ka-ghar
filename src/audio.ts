import * as THREE from 'three';

// Small WebAudio manager. Clips live in public/audio/<name>.mp3 and load on
// demand; a missing file just stays silent. Positional sounds use a panner.

export interface LoopHandle {
  setVolume(v: number, fade?: number): void;
  setPos(p: THREE.Vector3): void;
  stop(fade?: number): void;
  readonly playing: boolean;
}

export class Sound {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  enabled = true;
  base = './audio/';
  private pendingLoops: (() => void)[] = [];

  /** Must be called from a user gesture (click / tap) to unlock audio on iOS. */
  unlock() {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC() as AudioContext;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      // a silent blip actually unlocks playback on iOS
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.master); s.start(0);
      const p = this.pendingLoops; this.pendingLoops = [];
      p.forEach((f) => f());
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2);
  }

  load(name: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(name);
    if (!p) {
      p = fetch(`${this.base}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((ab) => new Promise<AudioBuffer>((res, rej) => this.ctx!.decodeAudioData(ab, res, rej)))
        .catch(() => null);
      this.buffers.set(name, p);
    }
    return p;
  }

  updateListener(cam: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const f = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    const u = new THREE.Vector3(0, 1, 0).transformDirection(cam.matrixWorld);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02); l.upY.setTargetAtTime(u.y, t, 0.02); l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else {
      (l as any).setPosition(p.x, p.y, p.z);
      (l as any).setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  private panner(pos: THREE.Vector3, ref: number, max: number): PannerNode {
    const pn = this.ctx!.createPanner();
    pn.panningModel = 'equalpower';
    pn.distanceModel = 'inverse';
    pn.refDistance = ref;
    pn.maxDistance = max;
    pn.rolloffFactor = 1.2;
    if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z; }
    else (pn as any).setPosition(pos.x, pos.y, pos.z);
    return pn;
  }

  private splashBuf: AudioBuffer | null = null;
  /** A small water splash, synthesised (decaying filtered noise with a plop). */
  splash(pos: THREE.Vector3, volume = 0.6) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.splashBuf) {
      const len = Math.floor(ctx.sampleRate * 0.7);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * 0.35;
        const plop = Math.sin(2 * Math.PI * (380 - 260 * Math.min(1, t / 0.08)) * t) * Math.exp(-t * 40) * 0.6;
        d[i] = (lp * Math.exp(-t * 7) * (t < 0.01 ? t / 0.01 : 1) + plop) * 0.8;
      }
      this.splashBuf = b;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.splashBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.panner(pos, 3, 60)).connect(this.master);
    src.start();
  }

  /** One-shot. pos = positional (else plain stereo). */
  play(name: string, opts: { pos?: THREE.Vector3; volume?: number; rate?: number; ref?: number; max?: number } = {}) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx, master = this.master;
    this.load(name).then((buf) => {
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1;
      const g = ctx.createGain();
      g.gain.value = opts.volume ?? 1;
      src.connect(g);
      if (opts.pos) g.connect(this.panner(opts.pos, opts.ref ?? 3, opts.max ?? 80)).connect(master);
      else g.connect(master);
      src.start();
    });
  }

  /** Looping sound (ambience or a positional source like a fire). */
  loop(name: string, opts: { pos?: THREE.Vector3; volume?: number; ref?: number; max?: number; rate?: number } = {}): LoopHandle {
    let gain: GainNode | null = null;
    let pn: PannerNode | null = null;
    let src: AudioBufferSourceNode | null = null;
    let vol = opts.volume ?? 1;
    let stopped = false;
    const start = () => {
      if (!this.ctx || !this.master || stopped) return;
      const ctx = this.ctx, master = this.master;
      this.load(name).then((buf) => {
        if (!buf || stopped) return;
        src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = opts.rate ?? 1;
        gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.5);
        src.connect(gain);
        if (opts.pos) { pn = this.panner(opts.pos, opts.ref ?? 4, opts.max ?? 80); gain.connect(pn).connect(master); }
        else gain.connect(master);
        src.start(0, Math.random() * buf.duration);
      });
    };
    if (this.ctx) start(); else this.pendingLoops.push(start);
    const self = this;
    return {
      get playing() { return !!src && !stopped; },
      setVolume(v: number, fade = 0.4) {
        vol = v;
        if (gain && self.ctx) gain.gain.setTargetAtTime(v, self.ctx.currentTime, fade);
      },
      setPos(p: THREE.Vector3) {
        if (!pn) return;
        if (pn.positionX) { pn.positionX.value = p.x; pn.positionY.value = p.y; pn.positionZ.value = p.z; }
        else (pn as any).setPosition(p.x, p.y, p.z);
      },
      stop(fade = 0.5) {
        stopped = true;
        if (gain && self.ctx && src) {
          gain.gain.setTargetAtTime(0, self.ctx.currentTime, fade);
          const s = src;
          setTimeout(() => { try { s.stop(); } catch { /* already stopped */ } }, fade * 4000);
        }
      },
    };
  }
}
