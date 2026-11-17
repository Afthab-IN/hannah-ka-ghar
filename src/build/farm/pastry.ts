import * as THREE from 'three';
import { VBuilder, mat4, rng } from './util';

// Procedural breads and pastries for the bakery, all vertex coloured so a
// whole shop of them merges into one draw call. Every function places the
// item with its BOTTOM at the given y.

const C = (h: string) => new THREE.Color(h);
const CRUST = C('#b5692a');
const CRUST_DK = C('#7a3f16');
const GOLD = C('#d39a4a');
const PALE = C('#e2bf80');
const FLOUR = C('#f1ece2');
const CRUMB = C('#efd7a6');
const tmp = new THREE.Color();
const sst = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type M4 = THREE.Matrix4;
const at = (x: number, y: number, z: number, yaw = 0) => mat4({ x, y, z }, { x: 0, y: yaw, z: 0 });
const mul = (a: M4, b: M4) => new THREE.Matrix4().multiplyMatrices(a, b);

/** Round sourdough boule with a scored cross (or a single ear) and flour on top. r = radius (m). */
export function boule(v: VBuilder, base: M4, r = 0.1, o: { flour?: number; dark?: number; score?: 'cross' | 'ear' | 'leaf' } = {}) {
  const flour = o.flour ?? 0.6, dark = o.dark ?? 0;
  const g = new THREE.SphereGeometry(1, 14, 9);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.3) p.setY(i, -0.3 + (y + 0.3) * 0.12); }
  g.computeVertexNormals();
  const ky = 0.64;
  const crust = CRUST.clone().lerp(CRUST_DK, dark);
  v.add(g, (q) => {
    tmp.copy(PALE).lerp(crust, sst(-0.32, 0.55, q.y));
    if (q.y > 0.5) tmp.lerp(FLOUR, sst(0.5, 1.0, q.y) * flour);
    return tmp;
  }, mul(base, mat4({ x: 0, y: 0.33 * ky * r, z: 0 }, undefined, { x: r, y: r * ky, z: r })));
  const sc = o.score ?? 'cross';
  const arcs: [number, number][] = sc === 'cross' ? [[0, 0], [Math.PI / 2, 0]] : sc === 'ear' ? [[0.3, 0.25]] : [[0, 0], [0.6, 0.45], [-0.6, -0.45]];
  for (const [yaw, off] of arcs) {
    const R = Math.sqrt(1 - off * off);
    const a = sc === 'leaf' && off !== 0 ? 0.7 : 1.5;
    const t = new THREE.TorusGeometry(R, 0.05, 3, 9, a);
    t.rotateZ(Math.PI / 2 - a / 2);
    t.translate(0, 0, off);
    v.add(t, CRUMB, mul(base, mat4({ x: 0, y: 0.33 * ky * r, z: 0 }, { x: 0, y: yaw, z: 0 }, { x: r * 1.004, y: r * ky * 1.004, z: r * 1.004 })));
  }
}

/** Oval batard loaf lying along local x, with one long slash. len = full length. */
export function batard(v: VBuilder, base: M4, len = 0.26, o: { dark?: number; flour?: number } = {}) {
  const g = new THREE.SphereGeometry(1, 14, 8);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.3) p.setY(i, -0.3 + (y + 0.3) * 0.12); }
  g.computeVertexNormals();
  const rx = len / 2, ry = len * 0.22, rz = len * 0.26;
  const crust = CRUST.clone().lerp(CRUST_DK, o.dark ?? 0.15);
  v.add(g, (q) => { tmp.copy(PALE).lerp(crust, sst(-0.3, 0.5, q.y)); if (q.y > 0.6) tmp.lerp(FLOUR, sst(0.6, 1, q.y) * (o.flour ?? 0.4)); return tmp; },
    mul(base, mat4({ x: 0, y: 0.33 * ry, z: 0 }, undefined, { x: rx, y: ry, z: rz })));
  const t = new THREE.TorusGeometry(1, 0.06, 3, 10, 1.7);
  t.rotateZ(Math.PI / 2 - 0.85);
  v.add(t, CRUMB, mul(base, mat4({ x: 0, y: 0.33 * ry, z: 0 }, { x: 0, y: 0.12, z: 0 }, { x: rx * 1.004, y: ry * 1.004, z: rz })));
}

/** Baguette lying along local x. */
export function baguette(v: VBuilder, base: M4, len = 0.55, r = 0.03) {
  const g = new THREE.CapsuleGeometry(r, len - 2 * r, 3, 8);
  g.rotateZ(Math.PI / 2);
  g.scale(1, 0.8, 1);
  g.translate(0, r * 0.8, 0);
  v.add(g, (q) => tmp.copy(PALE).lerp(GOLD, sst(0, r * 0.9, q.y)).lerp(CRUST, sst(r * 0.8, r * 1.6, q.y)), base);
  const n = Math.max(3, Math.round(len / 0.11));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + r + (len - 2 * r) * ((i + 0.5) / n);
    const s = new THREE.SphereGeometry(1, 6, 3);
    v.add(s, CRUMB, mul(base, mat4({ x, y: r * 1.56, z: 0 }, { x: 0, y: 0.55, z: 0 }, { x: len / n * 0.42, y: r * 0.06, z: r * 0.28 })));
  }
}

/** Croissant lying flat, horns pointing toward local +z. Size ~0.14 m. */
export function croissant(v: VBuilder, base: M4, s = 1) {
  const R = 0.044 * s, tube = 0.024 * s, arc = Math.PI * 1.25;
  const g = new THREE.TorusGeometry(R, tube, 7, 16, arc);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let th = Math.atan2(y, x); if (th < -0.01) th += Math.PI * 2;
    const t = Math.min(1, Math.max(0, th / arc));
    const f = 0.28 + 0.72 * Math.pow(Math.sin(Math.PI * t), 0.6);
    const cx = R * Math.cos(th), cy = R * Math.sin(th);
    p.setXYZ(i, cx + (x - cx) * f, cy + (y - cy) * f, z * f);
  }
  g.rotateZ(-Math.PI / 2 - arc / 2);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 0.78, 1);
  g.translate(0, tube * 0.78, R * 0.25);
  g.computeVertexNormals();
  v.add(g, (q, n) => {
    const ang = Math.atan2(q.z - R * 0.25, q.x);
    const band = Math.abs(Math.sin(ang * 4.5));
    tmp.copy(PALE).lerp(GOLD, sst(-0.3, 0.6, n.y)).lerp(CRUST, sst(0.2, 1.0, n.y) * (0.35 + 0.65 * band));
    return tmp;
  }, base);
}

/** Cinnamon bun: golden coil with a dark cinnamon spiral and icing. */
export function cinnamonBun(v: VBuilder, base: M4, s = 1) {
  const r = 0.046 * s, h = 0.034 * s;
  const cyl = new THREE.CylinderGeometry(r * 0.96, r, h, 16);
  cyl.translate(0, h / 2, 0);
  v.add(cyl, (q) => tmp.copy(PALE).lerp(GOLD, sst(0, h, q.y)), base);
  class Spiral extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    getPoint(t: number, out = new THREE.Vector3()) {
      const th = t * Math.PI * 2 * 2.6;
      const rr = r * (0.08 + 0.8 * t);
      return out.set(rr * Math.cos(th), h, rr * Math.sin(th));
    }
  }
  const tube = new THREE.TubeGeometry(new Spiral(), 40, 0.0055 * s, 4, false);
  v.add(tube, '#6a3714', base);
  // icing drizzle
  const rr = rng(Math.floor(Math.abs(base.elements[12] * 131 + base.elements[14] * 71)));
  for (let k = 0; k < 3; k++) {
    const a = rr() * Math.PI;
    const d = (k - 1) * r * 0.35;
    const c = new THREE.CapsuleGeometry(0.0035 * s, r * 1.5, 2, 4);
    c.rotateZ(Math.PI / 2);
    v.add(c, '#f6f1e6', mul(base, mat4({ x: -Math.sin(a) * d, y: h + 0.004 * s, z: Math.cos(a) * d }, { x: 0, y: a, z: 0 })));
  }
}

/** Lattice-top pie in a tin. */
export function pie(v: VBuilder, base: M4, r = 0.12, filling = '#7d2426') {
  const tin = new THREE.CylinderGeometry(r + 0.008, r - 0.012, 0.035, 22, 1, true);
  tin.translate(0, 0.0175, 0);
  v.add(tin, '#a7a9a8', base);
  const fill = new THREE.CylinderGeometry(r, r - 0.012, 0.03, 22);
  fill.translate(0, 0.015, 0);
  v.add(fill, filling, base);
  const rim = new THREE.TorusGeometry(r - 0.004, 0.013, 5, 26);
  rim.rotateX(Math.PI / 2);
  v.add(rim, (q) => tmp.copy(GOLD).lerp(CRUST, 0.5 + 0.5 * Math.sin(Math.atan2(q.z, q.x) * 13)), mul(base, at(0, 0.036, 0)));
  for (let i = -2; i <= 2; i++) {
    const d = (i / 2.5) * r;
    const L = 2 * Math.sqrt(Math.max(0, r * r - d * d)) * 0.96;
    v.add(new THREE.BoxGeometry(L, 0.008, 0.018), (q) => tmp.copy(GOLD).lerp(CRUST, sst(0, 0.004, q.y)), mul(base, at(0, 0.037, d)));
    v.add(new THREE.BoxGeometry(0.018, 0.008, L), (q) => tmp.copy(GOLD).lerp(CRUST, sst(0, 0.004, q.y)), mul(base, at(d, 0.041, 0)));
  }
}

/** Small round roll / bun. */
export function roll(v: VBuilder, base: M4, r = 0.038, seeded = false) {
  const g = new THREE.SphereGeometry(r, 10, 6);
  g.scale(1, 0.72, 1);
  g.translate(0, r * 0.5, 0);
  v.add(g, (q) => tmp.copy(PALE).lerp(seeded ? C('#9a5a22') : CRUST, sst(0, r, q.y)), base);
  if (seeded) for (let k = 0; k < 7; k++) {
    const a = k * 2.4, d = (k % 3) * r * 0.25;
    v.add(new THREE.SphereGeometry(0.004, 4, 3), '#efe3c6', mul(base, at(Math.cos(a) * d, r * 1.2 - d * 0.3, Math.sin(a) * d)));
  }
}

/** Muffin in a paper case. */
export function muffin(v: VBuilder, base: M4, berry = true) {
  const cup = new THREE.CylinderGeometry(0.034, 0.026, 0.04, 14, 1);
  cup.translate(0, 0.02, 0);
  v.add(cup, (q) => tmp.set(berry ? '#d9c7a8' : '#f0e6d6').multiplyScalar(0.85 + 0.15 * Math.abs(Math.sin(Math.atan2(q.z, q.x) * 9))), base);
  const top = new THREE.SphereGeometry(0.04, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  top.scale(1, 0.7, 1);
  top.translate(0, 0.038, 0);
  v.add(top, (q) => tmp.copy(GOLD).lerp(CRUST, sst(0.04, 0.065, q.y)), base);
  if (berry) for (let k = 0; k < 5; k++) {
    const a = k * 1.9;
    v.add(new THREE.SphereGeometry(0.006, 5, 4), '#3b2a5a', mul(base, at(Math.cos(a) * 0.022, 0.058 + (k % 2) * 0.004, Math.sin(a) * 0.022)));
  }
}

/** Sandwich loaf (tin loaf) along local x. */
export function tinLoaf(v: VBuilder, base: M4) {
  const b = new THREE.BoxGeometry(0.22, 0.08, 0.11);
  b.translate(0, 0.04, 0);
  v.add(b, (q) => tmp.copy(GOLD).lerp(CRUST, sst(0.0, 0.08, q.y)), base);
  const top = new THREE.CylinderGeometry(0.055, 0.055, 0.22, 12, 1, false, 0, Math.PI);
  top.rotateZ(Math.PI / 2);
  top.rotateX(Math.PI / 2);
  top.scale(1, 0.62, 1);
  top.translate(0, 0.08, 0);
  v.add(top, CRUST, base);
}

/** Danish pastry with a jam centre. */
export function danish(v: VBuilder, base: M4, jam = '#a3202a') {
  const g = new THREE.CylinderGeometry(0.04, 0.043, 0.024, 8);
  g.translate(0, 0.012, 0);
  v.add(g, (q) => tmp.copy(PALE).lerp(GOLD, sst(0, 0.024, q.y)), base);
  const j = new THREE.CylinderGeometry(0.02, 0.02, 0.006, 10);
  j.translate(0, 0.026, 0);
  v.add(j, jam, base);
}

/** Layer cake on a stand (cream with berries). */
export function cake(v: VBuilder, base: M4) {
  const stem = new THREE.CylinderGeometry(0.03, 0.06, 0.1, 12);
  stem.translate(0, 0.05, 0);
  v.add(stem, '#e9e4da', base);
  const plate = new THREE.CylinderGeometry(0.16, 0.16, 0.012, 24);
  plate.translate(0, 0.106, 0);
  v.add(plate, '#f2eee6', base);
  const c = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 24);
  c.translate(0, 0.172, 0);
  v.add(c, (q) => tmp.set(Math.abs(q.y - 0.17) < 0.008 ? '#b03c48' : '#f5ecdc'), base);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    v.add(new THREE.SphereGeometry(0.014, 6, 4), k % 3 ? '#9e1d2c' : '#3a2a63', mul(base, at(Math.cos(a) * 0.085, 0.24, Math.sin(a) * 0.085)));
  }
}

/** Open wicker basket (bottom at y). Returns nothing; contents added by the caller. */
export function basket(v: VBuilder, base: M4, r = 0.2, h = 0.16, col = '#a27a45') {
  const g = new THREE.CylinderGeometry(r, r * 0.85, h, 18, 6, true);
  g.translate(0, h / 2, 0);
  const cc = new THREE.Color(col);
  v.add(g, (q) => tmp.copy(cc).multiplyScalar(0.75 + 0.35 * Math.abs(Math.sin(q.y * 140 + Math.atan2(q.z, q.x) * 3))), base);
  const inner = new THREE.CylinderGeometry(r * 0.98, r * 0.84, h * 0.98, 18, 1, true);
  inner.scale(-1, 1, 1); // flip so the inside faces in
  inner.translate(0, h / 2, 0);
  v.add(inner, cc.clone().multiplyScalar(0.6), base);
  const bot = new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.012, 18);
  bot.translate(0, 0.006, 0);
  v.add(bot, cc.clone().multiplyScalar(0.7), base);
  const rim = new THREE.TorusGeometry(r, 0.012, 4, 22);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, h, 0);
  v.add(rim, cc.clone().multiplyScalar(0.85), base);
}

/** A flour sack (burlap) slumped on the floor. */
export function flourSack(v: VBuilder, base: M4, s = 1, seed = 1) {
  const r = rng(seed);
  const g = new THREE.SphereGeometry(1, 12, 10);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < -0.6) y = -0.6 + (y + 0.6) * 0.1;
    const k = 1 + 0.25 * (y < 0 ? -y * 0.4 : 0);
    x *= k; z *= k;
    if (y > 0.75) { x *= 0.35; z *= 0.35; } // gathered neck
    p.setXYZ(i, x, y + (r() - 0.5) * 0.02, z);
  }
  g.computeVertexNormals();
  const sx = 0.24 * s, sy = 0.32 * s, sz = 0.17 * s;
  v.add(g, (q) => tmp.set('#cdb68b').multiplyScalar(0.85 + 0.15 * Math.abs(Math.sin(q.y * 9))).lerp(FLOUR, q.y > 0.2 && Math.abs(q.x) < 0.5 && q.z > 0.6 ? 0.55 : 0), mul(base, mat4({ x: 0, y: 0.6 * sy, z: 0 }, undefined, { x: sx, y: sy, z: sz })));
  // tie
  const t = new THREE.TorusGeometry(1, 0.25, 4, 10);
  t.rotateX(Math.PI / 2);
  v.add(t, '#6b5232', mul(base, mat4({ x: 0, y: 0.6 * sy + 0.72 * sy, z: 0 }, undefined, { x: sx * 0.36, y: sy * 0.08, z: sz * 0.36 })));
  // a stencilled band of flour
}

/** Single item meshes for the player's hand. */
export function heldMesh(kind: 'croissant' | 'sourdough' | 'bun' | 'baguette') {
  const v = new VBuilder('held-' + kind);
  const o = new THREE.Matrix4();
  if (kind === 'croissant') croissant(v, o, 1.05);
  else if (kind === 'sourdough') boule(v, o, 0.1, { score: 'ear' });
  else if (kind === 'bun') cinnamonBun(v, o, 1.1);
  else baguette(v, o, 0.5);
  const m = v.build()!;
  m.castShadow = false;
  m.geometry.computeBoundingBox();
  const c = new THREE.Vector3();
  m.geometry.boundingBox!.getCenter(c);
  m.geometry.translate(-c.x, -c.y, -c.z);
  return m;
}
