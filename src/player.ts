import * as THREE from 'three';
import { W, type Mount } from './world';

// First-person walking for laptops (WASD + mouse, pointer lock) and iPads
// (left thumb joystick, drag to look, tap things to use them).

const EYE = 1.62;
const RADIUS = 0.28;
const HEIGHT = 1.75;
const STEP = 0.36;

export class Player {
  pos = new THREE.Vector3();
  vy = 0;
  yaw = 0;
  pitch = -0.02;
  onGround = true;
  running = false;
  keys = new Set<string>();
  move = new THREE.Vector2(); // touch joystick (-1..1)
  mount: Mount | null = null;
  mountYaw = 0;
  locked = false;
  touch = false;
  active = false; // false while the start screen is up
  free = false; // debug fly camera (no physics)
  onUseRequest: (() => void) | null = null;
  onTapPick: ((ndcX: number, ndcY: number) => void) | null = null;
  private bob = 0;
  private stepDist = 0;
  private lastEyeY = 0;
  private velXZ = new THREE.Vector2();
  private joy: { id: number; x0: number; y0: number; el: HTMLElement; knob: HTMLElement } | null = null;
  private look: { id: number; x: number; y: number; sx: number; sy: number; t: number; moved: number } | null = null;

  constructor(private cam: THREE.PerspectiveCamera, private dom: HTMLElement) {
    W.mount = (m) => this.sit(m);
    this.bindKeys();
    this.bindMouse();
    this.bindTouch();
  }

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, W.physics.groundAt(x, z, 1e9), z);
    this.yaw = yaw;
    this.lastEyeY = this.pos.y + EYE;
  }

  sit(m: Mount) {
    this.mount = m;
    this.mountYaw = 0;
    this.pitch = Math.max(-0.5, Math.min(0.2, this.pitch));
    W.toast(m.label ? `${m.label}. Move or press E to get up` : 'Move or press E to get up');
  }

  stand() {
    if (!this.mount) return;
    const m = this.mount;
    this.mount = null;
    this.pos.copy(m.exit);
    this.pos.y = W.physics.groundAt(m.exit.x, m.exit.z, m.exit.y + 1.5);
    this.yaw = m.pose().yaw + this.mountYaw;
    this.lastEyeY = this.pos.y + EYE;
    m.onLeave?.();
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.code;
      this.keys.add(k);
      if (!this.active) return;
      if (k === 'KeyE' || k === 'Enter') { e.preventDefault(); if (this.mount) this.stand(); else this.onUseRequest?.(); }
      if (k === 'Space') { e.preventDefault(); if (this.mount) this.stand(); else if (this.onGround) { this.vy = 4.3; this.onGround = false; } }
      if (this.mount && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) this.stand();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private bindMouse() {
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.dom; });
    this.dom.addEventListener('mousedown', (e) => {
      if (!this.active || this.touch) return;
      if (!this.locked) { this.dom.requestPointerLock?.(); return; }
      if (e.button === 0) { if (this.mount) this.stand(); else this.onUseRequest?.(); }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.active) return;
      this.turn(e.movementX * 0.0022, e.movementY * 0.0022);
    });
  }

  private turn(dx: number, dy: number) {
    if (this.mount) {
      const r = this.mount.yawRange ?? 1.6;
      this.mountYaw = Math.max(-r, Math.min(r, this.mountYaw - dx));
    } else this.yaw -= dx;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy));
  }

  private bindTouch() {
    const joyEl = document.createElement('div');
    joyEl.className = 'joy';
    const knob = document.createElement('div');
    knob.className = 'knob';
    joyEl.appendChild(knob);
    document.body.appendChild(joyEl);
    const R = 56;
    this.dom.addEventListener('touchstart', (e) => {
      if (!this.active) return;
      this.touch = true;
      document.body.classList.add('touch');
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.42 && !this.joy) {
          this.joy = { id: t.identifier, x0: t.clientX, y0: t.clientY, el: joyEl, knob };
          joyEl.style.left = `${t.clientX - 64}px`;
          joyEl.style.top = `${t.clientY - 64}px`;
          joyEl.classList.add('on');
          knob.style.transform = 'translate(0px, 0px)';
          if (this.mount) this.stand();
        } else if (!this.look) {
          this.look = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now(), moved: 0 };
        }
      }
      e.preventDefault();
    }, { passive: false });
    this.dom.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.joy && t.identifier === this.joy.id) {
          let dx = t.clientX - this.joy.x0, dy = t.clientY - this.joy.y0;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          this.move.set(dx / R, -dy / R);
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (this.look && t.identifier === this.look.id) {
          const dx = t.clientX - this.look.x, dy = t.clientY - this.look.y;
          this.look.x = t.clientX; this.look.y = t.clientY;
          this.look.moved += Math.abs(dx) + Math.abs(dy);
          this.turn(dx * 0.0045, dy * 0.0045);
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.joy && t.identifier === this.joy.id) {
          this.joy = null;
          this.move.set(0, 0);
          joyEl.classList.remove('on');
        } else if (this.look && t.identifier === this.look.id) {
          const quick = performance.now() - this.look.t < 300 && this.look.moved < 14;
          if (quick) {
            this.onTapPick?.((t.clientX / window.innerWidth) * 2 - 1, -(t.clientY / window.innerHeight) * 2 + 1);
          }
          this.look = null;
        }
      }
    };
    this.dom.addEventListener('touchend', end);
    this.dom.addEventListener('touchcancel', end);
  }

  jump() { if (this.mount) this.stand(); else if (this.onGround) { this.vy = 4.3; this.onGround = false; } }

  update(dt: number) {
    const cam = this.cam;
    if (this.mount) {
      const { pos, yaw } = this.mount.pose();
      cam.position.copy(pos);
      cam.rotation.set(this.pitch, yaw + this.mountYaw, 0, 'YXZ');
      cam.updateMatrixWorld();
      this.pos.set(pos.x, pos.y - 1.1, pos.z);
      return;
    }
    if (this.free) {
      cam.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
      return;
    }
    // input -> wish direction
    let fx = 0, fz = 0;
    if (this.active) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
      fx += this.move.x; fz += this.move.y;
    }
    const mag = Math.min(1, Math.hypot(fx, fz));
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.move.x, this.move.y) > 0.92;
    this.running = run && mag > 0.1;
    const speed = (run ? 6.2 : 3.1) * mag;
    let wx = 0, wz = 0;
    if (mag > 1e-3) {
      const nx = fx / Math.hypot(fx, fz), nz = fz / Math.hypot(fx, fz);
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      // forward is -z rotated by yaw
      wx = (nx * c - nz * s) * speed;
      wz = (-nx * s - nz * c) * speed;
    }
    // ease velocity for a soft start and stop
    const a = 1 - Math.exp(-dt * (this.onGround ? 12 : 3));
    this.velXZ.x += (wx - this.velXZ.x) * a;
    this.velXZ.y += (wz - this.velXZ.y) * a;

    const prev = this.pos.clone();
    const next = this.pos.clone();
    next.x += this.velXZ.x * dt;
    next.z += this.velXZ.y * dt;
    W.physics.resolve(next, RADIUS, HEIGHT, STEP);
    // keep out of deep water unless something (the dock) holds us up
    const blocked = (p: THREE.Vector3) => {
      const g = W.physics.groundAt(p.x, p.z, p.y + STEP);
      return W.physics.water(p.x, p.z) && g <= W.physics.terrain(p.x, p.z) + 0.01;
    };
    if (blocked(next)) {
      const tx = prev.clone(); tx.x = next.x;
      const tz = prev.clone(); tz.z = next.z;
      if (!blocked(tx)) next.copy(tx); else if (!blocked(tz)) next.copy(tz); else next.copy(prev);
      next.y = prev.y;
    }
    // vertical
    const ground = W.physics.groundAt(next.x, next.z, this.pos.y + STEP);
    this.vy -= 14 * dt;
    next.y = this.pos.y + this.vy * dt;
    const ceil = W.physics.ceilingAt(next.x, next.z, this.pos.y + STEP, next.y + HEIGHT + 0.05);
    if (next.y + HEIGHT > ceil) { next.y = ceil - HEIGHT; this.vy = Math.min(0, this.vy); }
    if (next.y <= ground) { next.y = ground; this.vy = 0; this.onGround = true; }
    else if (next.y > ground + 0.05) this.onGround = false;
    // glue to the ground going down gentle slopes and stairs
    if (this.onGround === false && this.vy <= 0 && next.y - ground < STEP && this.pos.y - ground < STEP + 0.05 && this.vy > -2) { next.y = ground; this.vy = 0; this.onGround = true; }
    this.pos.copy(next);

    // footsteps and head bob
    const moved = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
    if (this.onGround && moved > 1e-4) {
      this.bob += moved * (run ? 2.4 : 2.9);
      this.stepDist += moved;
      const stride = run ? 1.25 : 0.78;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const onWood = this.pos.y > W.physics.terrain(this.pos.x, this.pos.z) + 0.08;
        const n = 1 + Math.floor(Math.random() * 3);
        W.audio.play(`${onWood ? 'step_wood' : 'step_grass'}_${n}`, { volume: onWood ? 0.35 : 0.22, rate: 0.9 + Math.random() * 0.2 });
      }
    } else this.bob *= 0.9;
    const bobY = Math.sin(this.bob * 2) * 0.035 * Math.min(1, Math.hypot(this.velXZ.x, this.velXZ.y) / 3);
    // smooth the eye over stair steps
    const eyeTarget = this.pos.y + EYE;
    this.lastEyeY += (eyeTarget - this.lastEyeY) * (1 - Math.exp(-dt * (this.onGround ? 18 : 60)));
    if (Math.abs(eyeTarget - this.lastEyeY) > 0.6) this.lastEyeY = eyeTarget;
    cam.position.set(this.pos.x, this.lastEyeY + bobY, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }
}
