import * as THREE from 'three';
import { W } from '../../world';
import type { Builder } from '../kit';
import { M } from '../materials';
import { Fire } from '../../fx/fire';
import { mulberry32 } from '../../noise';
import type { Lamp } from '../../lamps';
import * as D from './dims';
import { Frame, skipTo, type Atlas, type Props, type Shades } from './util';
import { R } from './atlas';
import type { HouseMats } from './mats';
import type { Furniture, FurnName } from './furniture';

const { X, Z, F, A, IX, IZ } = D;
const rnd = mulberry32(4242);
export const MIRROR = M.paint('#c7d1d4', 0.04, 1.0);
const BOOKS = ['#7a2e25', '#2f4a5e', '#5e6b3a', '#c9b48a', '#8a5a2b', '#3b3b3b', '#a2683a', '#6d2f4a', '#d8cfb8', '#40584c', '#b9472e', '#264653', '#e0c38c'];
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

interface Ctx { b: Builder; m: HouseMats; props: Props; atlas: Atlas; shades: Shades; fu: Furniture }
/** put a photoscanned model at a frame (facing local -z like our furniture) */
const model = (c: Ctx, name: FurnName, f: Frame, s: number | [number, number, number] = 1) => c.fu.add(name, f.x, f.y, f.z, f.yaw, s);

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const P3 = (u: number, y: number, v: number) => new THREE.Vector3(X(u), y, Z(v));
const isNight = () => { const h = W.tod.hour as number; return h >= 17.5 || h < 6.5; };

function lampToggle(lamp: Lamp, pos: THREE.Vector3, what = 'the lamp') {
  W.interact.add({
    pos, radius: 0.28, range: 2.6,
    label: () => (lamp.on ? `Turn off ${what}` : `Turn on ${what}`),
    onUse: () => { lamp.on = !lamp.on; },
  });
}

function seat(sitLabel: string, at: THREE.Vector3, eye: THREE.Vector3, yaw: number, exit: THREE.Vector3, label = 'Sitting', yawRange = 1.5) {
  W.interact.add({ pos: at, radius: 0.42, range: 2.4, label: sitLabel, onUse: () => W.mount({ pose: () => ({ pos: eye, yaw }), exit, label, yawRange }) });
}

function bedRest(at: THREE.Vector3, eye: THREE.Vector3, yaw: number, exit: THREE.Vector3) {
  W.interact.add({
    pos: at, radius: 0.7, range: 2.6,
    label: () => (isNight() ? 'Sleep till morning' : 'Nap till evening'),
    onUse: () => {
      const night = isNight();
      W.mount({ pose: () => ({ pos: eye, yaw }), exit, label: night ? 'Sleeping till morning' : 'Napping till evening', yawRange: 1.2 });
      skipTo(night ? 7 : 18.6, night ? 5 : 4);
    },
  });
}

/** a row of books standing on a shelf (local coords). axis = the direction the row runs, c = the other coordinate. */
function books(props: Props, axis: 'x' | 'z', a0: number, a1: number, y: number, c: number, depth: number, maxH = 0.27) {
  let a = a0 + 0.01;
  while (a < a1 - 0.03) {
    if (rnd() < 0.06) { a += 0.05 + rnd() * 0.08; continue; }
    const t = 0.022 + rnd() * 0.03, h = Math.min(maxH, 0.16 + rnd() * 0.11), d = depth * (0.75 + rnd() * 0.22);
    const lean = rnd() < 0.08 ? (rnd() - 0.5) * 0.5 : 0;
    const col = pick(BOOKS);
    if (axis === 'x') props.box(X(a + t / 2), y + h / 2, Z(c), t, h, d, col, 0, 0, lean);
    else props.box(X(c), y + h / 2, Z(a + t / 2), d, h, t, col, 0, lean, 0);
    a += t + 0.002;
  }
}

function table(c: Ctx, f: Frame, mat: THREE.Material, w: number, d: number, h: number, leg = 0.06) {
  f.box(c.b, mat, 0, h - 0.025, 0, w, 0.05, d);
  const ix = w / 2 - 0.07, iz = d / 2 - 0.07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(c.b, mat, sx * ix, (h - 0.05) / 2, sz * iz, leg, h - 0.05, leg);
  f.box(c.b, mat, 0, h - 0.1, iz, w - 0.16, 0.08, 0.025);
  f.box(c.b, mat, 0, h - 0.1, -iz, w - 0.16, 0.08, 0.025);
  f.box(c.b, mat, ix, h - 0.1, 0, 0.025, 0.08, d - 0.16);
  f.box(c.b, mat, -ix, h - 0.1, 0, 0.025, 0.08, d - 0.16);
  f.solid(w, h, d);
}

function chair(c: Ctx, f: Frame, mat: THREE.Material, cushion?: THREE.Material) {
  const sh = 0.46;
  f.box(c.b, mat, 0, sh - 0.02, 0, 0.44, 0.04, 0.42);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(c.b, mat, sx * 0.19, (sh - 0.04) / 2, sz * 0.18, 0.035, sh - 0.04, 0.035);
  for (const sx of [-1, 1]) f.box(c.b, mat, sx * 0.19, sh + 0.25, 0.19, 0.035, 0.5, 0.035, -0.08);
  f.box(c.b, mat, 0, sh + 0.46, 0.21, 0.42, 0.07, 0.025, -0.08);
  f.box(c.b, mat, 0, sh + 0.3, 0.2, 0.4, 0.05, 0.02, -0.08);
  for (const sx of [-1, 1]) f.box(c.b, mat, sx * 0.19, 0.12, 0, 0.02, 0.025, 0.36);
  if (cushion) f.box(c.b, cushion, 0, sh + 0.02, -0.01, 0.38, 0.04, 0.36);
  f.solid(0.46, 0.9, 0.44);
}

function armchair(c: Ctx, f: Frame, fabric: THREE.Material, legs: THREE.Material, w = 0.86) {
  f.box(c.b, fabric, 0, 0.27, 0, w, 0.27, 0.84);
  f.box(c.b, fabric, 0, 0.46, -0.05, w - 0.26, 0.12, 0.66);
  f.box(c.b, fabric, 0, 0.66, 0.33, w - 0.06, 0.54, 0.16, -0.12);
  f.rollX(c.b, fabric, 0, 0.93, 0.37, 0.085, w - 0.04);
  f.box(c.b, fabric, 0, 0.66, 0.24, w - 0.3, 0.42, 0.08, -0.15);
  for (const s of [-1, 1]) {
    f.box(c.b, fabric, s * (w / 2 - 0.07), 0.47, -0.01, 0.14, 0.24, 0.8);
    f.rollZ(c.b, fabric, s * (w / 2 - 0.07), 0.6, -0.01, 0.08, 0.84);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(c.b, legs, sx * (w / 2 - 0.06), 0.065, sz * 0.36, 0.05, 0.13, 0.05);
  f.solid(w, 0.95, 0.86);
}

function floorLamp(c: Ctx, u: number, v: number, y0: number, on = true, color = '#ffc98a') {
  const x = X(u), z = Z(v);
  c.b.cyl(c.m.iron, x, y0, z, 0.15, 0.025, { seg: 14 });
  c.b.cyl(c.m.iron, x, y0, z, 0.014, 1.4, { seg: 6 });
  const lamp = W.lamps.add(new THREE.Vector3(x, y0 + 1.42, z), color, 2.6, 6.5, { on });
  c.shades.shade(lamp, x, y0 + 1.3, z, 0.2, 0.15, 0.27);
  c.shades.bulb(lamp, x, y0 + 1.36, z, 0.035, 2.2);
  W.physics.addCylinder(x, z, 0.16, y0, y0 + 1.6);
  lampToggle(lamp, new THREE.Vector3(x, y0 + 1.42, z));
  return lamp;
}

function tableLamp(c: Ctx, x: number, y0: number, z: number, opts: { on?: boolean; nightOnly?: boolean; base?: THREE.ColorRepresentation; toggle?: boolean } = {}) {
  c.props.cyl(x, y0, z, 0.07, 0.05, opts.base ?? '#c9b48a');
  c.props.ball(x, y0 + 0.14, z, 0.07, 0.1, 0.07, opts.base ?? '#c9b48a');
  c.props.cyl(x, y0 + 0.2, z, 0.01, 0.1, '#b08d4a');
  const lamp = W.lamps.add(new THREE.Vector3(x, y0 + 0.36, z), '#ffc98a', 2.0, 5, { on: opts.on !== false, nightOnly: !!opts.nightOnly });
  c.shades.shade(lamp, x, y0 + 0.27, z, 0.15, 0.1, 0.18);
  c.shades.bulb(lamp, x, y0 + 0.31, z, 0.03, 2.2);
  if (opts.toggle !== false) lampToggle(lamp, new THREE.Vector3(x, y0 + 0.33, z));
  return lamp;
}

function picture(c: Ctx, u: number, y: number, v: number, w: number, h: number, r: [number, number, number, number], yaw: number) {
  c.atlas.box(X(u), y, Z(v), w, h, 0.03, [R.wood, R.wood, R.wood, R.wood, r, R.wood], yaw);
}

// ---------------------------------------------------------------------------
// bathroom fittings ---------------------------------------------------------
function roundRect(s: THREE.Shape | THREE.Path, hx: number, hz: number, r: number) {
  s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r);
  s.lineTo(hx, hz - r); s.quadraticCurveTo(hx, hz, hx - r, hz); s.lineTo(-hx + r, hz);
  s.quadraticCurveTo(-hx, hz, -hx, hz - r); s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
}
function shellGeo(hx: number, hz: number, inner: number, h: number) {
  const sh = new THREE.Shape();
  const rr = Math.min(hx, hz, 0.33) - 0.01;
  roundRect(sh, hx, hz, rr);
  const hole = new THREE.Path();
  roundRect(hole, hx - inner, hz - inner, Math.max(0.05, rr - inner));
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  return g;
}
/** clawfoot tub, painted dark outside, with a "Run a bath" interaction */
function clawTub(c: Ctx, u: number, v: number, alongV: boolean, y0: number) {
  const { b, m, props } = c;
  const x = X(u), z = Z(v);
  const rx = alongV ? 0.36 : 0.76, rz = alongV ? 0.76 : 0.36;
  b.geo(m.trim, shellGeo(rx, rz, 0.05, 0.42), { x, y: y0 + 0.16, z });
  b.geo(m.black, shellGeo(rx + 0.015, rz + 0.015, 0.016, 0.38), { x, y: y0 + 0.17, z });
  b.geo(m.trim, shellGeo(rx + 0.03, rz + 0.03, 0.07, 0.035), { x, y: y0 + 0.56, z });
  b.box(m.trim, x, y0 + 0.2, z, 2 * rx - 0.06, 0.06, 2 * rz - 0.08, { collide: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.ball(x + sx * (rx - (alongV ? 0.14 : 0.18)), y0 + 0.08, z + sz * (rz - (alongV ? 0.18 : 0.14)), 0.05, 0.08, 0.05, '#b08d4a');
  const fx = alongV ? x : x - rx + 0.08, fz = alongV ? z - rz + 0.08 : z;
  b.cyl(m.iron, fx, y0 + 0.55, fz, 0.015, 0.25, { seg: 6 });
  b.box(m.iron, fx + (alongV ? 0 : 0.05), y0 + 0.79, fz + (alongV ? 0.05 : 0), alongV ? 0.025 : 0.12, 0.025, alongV ? 0.12 : 0.025, { collide: false });
  W.physics.addBox(x - rx - 0.04, y0, z - rz - 0.04, x + rx + 0.04, y0 + 0.6, z + rz + 0.04, { walk: false });
  const water = new THREE.Mesh(new THREE.BoxGeometry(2 * rx - 0.12, 0.01, 2 * rz - 0.12), M.paint('#8fb9c2', 0.05, 0.1));
  water.position.set(x, y0 + 0.47, z);
  water.visible = false;
  W.scene.add(water);
  W.interact.add({
    pos: new THREE.Vector3(x, y0 + 0.5, z), radius: 0.55, range: 2.4,
    label: () => (water.visible ? 'Let the water out' : 'Run a bath'),
    onUse: () => {
      water.visible = !water.visible;
      W.audio.play('water_lap', { pos: water.position, volume: 0.6 });
      if (water.visible) W.toast('Warm water, a little lavender');
    },
  });
}
/** toilet with its tank against the wall behind local +z */
function toilet(c: Ctx, f: Frame) {
  const { b, m } = c;
  f.box(b, m.trim, 0, 0.61, 0.31, 0.44, 0.38, 0.2);
  f.box(b, m.trim, 0, 0.815, 0.31, 0.47, 0.03, 0.23);
  f.cyl(b, m.trim, 0, 0, -0.02, 0.13, 0.33, 14, 0.18);
  f.cyl(b, m.woodLight, 0, 0.33, -0.02, 0.2, 0.035, 16);
  f.box(b, m.woodLight, 0, 0.6, 0.18, 0.38, 0.5, 0.03, -0.1);
  f.solid(0.48, 0.82, 0.62, 0, 0.1);
}
/** pedestal sink, mirror and a sconce, against the wall behind local +z */
function pedestalSink(c: Ctx, f: Frame, nightLamp = true) {
  const { b, m, props, shades } = c;
  f.cyl(b, m.trim, 0, 0, 0.12, 0.08, 0.72, 10, 0.11);
  f.box(b, m.trim, 0, 0.8, 0.08, 0.56, 0.16, 0.44);
  f.box(b, m.black, 0, 0.882, 0.06, 0.4, 0.004, 0.28);
  f.cyl(b, m.iron, 0, 0.88, 0.25, 0.012, 0.15, 6);
  f.box(b, m.iron, 0, 1.02, 0.19, 0.02, 0.02, 0.12);
  f.solid(0.58, 0.9, 0.46, 0, 0.08);
  f.box(b, m.woodDark, 0, 1.6, 0.29, 0.6, 0.72, 0.02);
  f.box(b, MIRROR, 0, 1.6, 0.275, 0.52, 0.64, 0.012);
  const sp = f.p(0, 2.06, 0.18);
  const lamp = W.lamps.add(sp, '#ffd6a0', 2.0, 4.5, { nightOnly: nightLamp, on: true });
  shades.shade(lamp, sp.x, sp.y - 0.08, sp.z, 0.09, 0.06, 0.14);
  const bp = f.p(0, 2.02, 0.27);
  props.box(bp.x, bp.y, bp.z, 0.04, 0.04, 0.04, '#2a2a2a');
  const soap = f.p(0.2, 0.89, 0.18);
  props.ball(soap.x, soap.y, soap.z, 0.04, 0.02, 0.03, '#e9c7a0');
  if (!nightLamp) lampToggle(lamp, sp, 'the light');
}
/** tile wainscot round a room (rectangle of inner faces), skipping door gaps on any side */
function wainscot(c: Ctx, u0: number, v0: number, u1: number, v1: number, y0: number, h: number, gaps: { side: 'n' | 's' | 'w' | 'e'; a: number; b: number }[] = []) {
  const { b, m } = c;
  const bx = (mat: THREE.Material, a0: number, y: number, c0: number, a1: number, y1: number, c1: number) =>
    b.boxMinMax(mat, X(Math.min(a0, a1)), y, Z(Math.min(c0, c1)), X(Math.max(a0, a1)), y1, Z(Math.max(c0, c1)), { collide: false });
  const side = (s: 'n' | 's' | 'w' | 'e', a: number, e: number) => {
    const gs = gaps.filter((g) => g.side === s).sort((p, q) => p.a - q.a);
    let cur = a;
    const seg = (p: number, q: number) => {
      if (q - p < 0.02) return;
      if (s === 'n') { bx(m.tileWall, p, y0, v0, q, y0 + h, v0 + 0.012); bx(m.trim, p, y0 + h, v0, q, y0 + h + 0.04, v0 + 0.03); }
      if (s === 's') { bx(m.tileWall, p, y0, v1 - 0.012, q, y0 + h, v1); bx(m.trim, p, y0 + h, v1 - 0.03, q, y0 + h + 0.04, v1); }
      if (s === 'w') { bx(m.tileWall, u0, y0, p, u0 + 0.012, y0 + h, q); bx(m.trim, u0, y0 + h, p, u0 + 0.03, y0 + h + 0.04, q); }
      if (s === 'e') { bx(m.tileWall, u1 - 0.012, y0, p, u1, y0 + h, q); bx(m.trim, u1 - 0.03, y0 + h, p, u1, y0 + h + 0.04, q); }
    };
    for (const g of gs) { seg(cur, g.a); cur = Math.max(cur, g.b); }
    seg(cur, e);
  };
  side('n', u0, u1); side('s', u0, u1); side('w', v0, v1); side('e', v0, v1);
}

// ---------------------------------------------------------------------------
export function buildInterior(c: Ctx) {
  const { b, m, props, atlas, shades } = c;
  const bx = (mat: THREE.Material, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, collide: boolean | 'nowalk' = false) =>
    b.boxMinMax(mat, X(Math.min(u0, u1)), Math.min(y0, y1), Z(Math.min(v0, v1)), X(Math.max(u0, u1)), Math.max(y0, y1), Z(Math.max(v0, v1)), { collide });
  const solid = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number) =>
    W.physics.addBox(X(Math.min(u0, u1)), y0, Z(Math.min(v0, v1)), X(Math.max(u0, u1)), y1, Z(Math.max(v0, v1)), { walk: false });
  const FPU = D.FP_U, WU = D.WING_U, TI2 = D.TI / 2;
  const takeBook = (pos: THREE.Vector3) => W.interact.add({
    pos, radius: 0.35, range: 2.4, label: 'Take a book',
    onUse: () => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), M.paint(pick(BOOKS), 0.7));
      W.hold(g, 'a well worn book');
      W.toast('You take a well worn book of poems');
    },
  });

  // =================================================================== LIVING ROOM (front of the great room)
  // the light sits in front of the firebox so it fills the room, not the kitchen behind the wall
  const fire = new Fire({ pos: P3(FPU, F + 0.06, 0.43), scale: 0.4, label: 'the fire', lampRadius: 6, lampIntensity: 4.8, lampOffset: new THREE.Vector3(0, 0.56, 0.82) });
  W.scene.add(fire.group);
  // a basket of logs beside the hearth, fire irons on the other side
  for (let i = 0; i < 6; i++) props.cyl(X(FPU + 0.98), F + 0.11 + Math.floor(i / 3) * 0.085, Z(0.3 + (i % 3) * 0.1 + (i > 2 ? 0.05 : 0)), 0.045, 0.32, '#6e5338', 0, 0, -Math.PI / 2);
  bx(m.woodDark, FPU + 0.97, F, 0.22, FPU + 1.31, F + 0.06, 0.62, 'nowalk');
  for (const du of [-0.04, 0.0, 0.04]) props.cyl(X(FPU - 1.08 + du), F, Z(0.8), 0.008, 0.72, '#222222');
  // mantel things
  props.cyl(X(FPU - 0.75), F + 1.31, Z(0.75), 0.03, 0.06, '#b08d4a'); props.cyl(X(FPU - 0.75), F + 1.37, Z(0.75), 0.012, 0.16, '#f4ead2');
  props.cyl(X(FPU + 0.75), F + 1.31, Z(0.75), 0.03, 0.06, '#b08d4a'); props.cyl(X(FPU + 0.75), F + 1.37, Z(0.75), 0.012, 0.13, '#f4ead2');
  props.box(X(FPU + 0.4), F + 1.42, Z(0.74), 0.16, 0.22, 0.08, '#5a3a24');
  props.cyl(X(FPU + 0.4), F + 1.43, Z(0.79), 0.05, 0.005, '#efe6d0', 0, Math.PI / 2, 0);
  props.cyl(X(FPU - 0.4), F + 1.31, Z(0.76), 0.05, 0.16, '#6f8a7a');
  for (let i = 0; i < 5; i++) props.ball(X(FPU - 0.4 + (rnd() - 0.5) * 0.08), F + 1.5 + rnd() * 0.06, Z(0.76 + (rnd() - 0.5) * 0.06), 0.035, 0.035, 0.035, pick(['#d9a441', '#efe6d0', '#c86b5a']));
  picture(c, FPU, F + 1.85, 0.69, 0.86, 0.6, R.paint1, 0);

  // sofa facing the fire, a coffee table, an armchair either side
  {
    const f = new Frame(X(FPU), F, Z(2.95), 0);
    if (c.fu.has('Sofa_01')) {
      model(c, 'Sofa_01', f);
      const cush = (lx: number, col: string) => { const p = f.p(lx, 0.55, 0.1); props.ball(p.x, p.y, p.z, 0.17, 0.155, 0.055, col, f.yaw, -0.3); };
      cush(-0.48, '#9a4e32');
      cush(0.5, '#6f8a7a');
      f.solid(1.6, 0.85, 0.7);
    } else {
      f.box(b, m.linen, 0, 0.27, 0, 1.8, 0.3, 0.8);
      f.box(b, m.linen, 0, 0.66, 0.32, 1.8, 0.5, 0.18, -0.1);
      f.solid(1.8, 0.9, 0.8);
    }
    seat('Sit on the sofa', f.p(0.35, 0.5, 0), f.p(0.35, 1.08, 0.04), 0, f.p(0.35, 0, -0.72));
  }
  {
    const f = new Frame(X(FPU), F, Z(1.85), 0);
    let top = F + 0.44;
    if (c.fu.has('CoffeeTable_01')) {
      const sc = 0.78, sz = c.fu.size('CoffeeTable_01');
      model(c, 'CoffeeTable_01', f, sc);
      top = F + sz.y * sc;
      f.solid(sz.x * sc, sz.y * sc, sz.z * sc);
    } else table(c, f, m.woodDark, 1.2, 0.5, 0.44, 0.07);
    props.box(X(FPU - 0.35), top + 0.015, Z(1.83), 0.26, 0.03, 0.2, '#2f4a5e', 0.2);
    props.box(X(FPU - 0.35), top + 0.04, Z(1.83), 0.22, 0.025, 0.17, '#c9b48a', 0.05);
    props.cyl(X(FPU + 0.25), top, Z(1.91), 0.04, 0.09, '#f2ede2');
    props.cyl(X(FPU + 0.45), top, Z(1.78), 0.12, 0.02, '#a5733f');
    props.cyl(X(FPU + 0.45), top + 0.02, Z(1.78), 0.035, 0.08, '#efe6d0');
  }
  for (const s of [-1, 1]) {
    const cu = FPU + s * 1.45, cv = 1.85;
    const yaw = Math.atan2(-(FPU - cu), -(0.66 - cv));
    const f = new Frame(X(cu), F, Z(cv), yaw);
    if (c.fu.has('ArmChair_01')) { model(c, 'ArmChair_01', f); f.solid(0.86, 1.0, 0.8); }
    else armchair(c, f, s < 0 ? m.rust : m.green, m.woodDark);
    seat('Sit in the armchair', f.p(0, 0.5, 0), f.p(0, 1.12, 0.06), yaw, f.p(0, 0, -0.75));
  }
  const livingLamp = floorLamp(c, FPU - 1.15, 2.95, F);
  // a side table with a lamp by the east armchair
  {
    const tx = X(FPU + 1.2), tz = Z(0.98);
    b.cyl(m.woodDark, tx, F, tz, 0.035, 0.58, { seg: 8 });
    b.cyl(m.woodDark, tx, F, tz, 0.15, 0.03, { seg: 14 });
    b.cyl(m.woodDark, tx, F + 0.58, tz, 0.22, 0.03, { seg: 16 });
    W.physics.addCylinder(tx, tz, 0.22, F, F + 0.62);
    tableLamp(c, tx, F + 0.61, tz, { nightOnly: true, base: '#7f9a7a' });
  }
  atlas.rug(X(FPU), F + 0.008, Z(2.0), 3.7, 2.4, R.rug1);

  // bookshelf in the south east corner, a window seat under the east window
  {
    const has = c.fu.has('wooden_bookshelf_worn');
    const sc = 0.97, sz = c.fu.size('wooden_bookshelf_worn');
    const d = has ? sz.z * sc : 0.36, w = has ? sz.x * sc : 1.2, h = has ? sz.y * sc : 2.05;
    const v1 = IZ - 0.03, v0 = v1 - w, u1 = IX, u0 = IX - d;
    if (has) {
      model(c, 'wooden_bookshelf_worn', new Frame(X((u0 + u1) / 2), F, Z((v0 + v1) / 2), Math.PI / 2), sc);
      const shelves = [0.11, 0.39, 0.67, 0.96, 1.28, 1.66].map((y) => y * sc);
      shelves.forEach((y, i) => {
        const gap = (i < shelves.length - 1 ? shelves[i + 1] : 2.0 * sc) - y;
        books(props, 'z', v0 + 0.07, v1 - 0.07, F + y + 0.005, u1 - d * 0.42, 0.22, Math.min(0.3, gap - 0.04));
      });
    } else {
      bx(m.woodDark, u0, F, v0, u1, F + h, v0 + 0.03); bx(m.woodDark, u0, F, v1 - 0.03, u1, F + h, v1);
      for (const y of [0.05, 0.42, 0.8, 1.18, 1.56, h - 0.04]) bx(m.woodDark, u0, F + y, v0, u1, F + y + 0.03, v1);
      [0.05, 0.42, 0.8, 1.18, 1.56].forEach((y) => books(props, 'z', v0 + 0.03, v1 - 0.03, F + y + 0.03, u1 - 0.19, 0.24, 0.32));
    }
    solid(u0, F, v0, u1, F + h, v1);
    takeBook(P3(u0 + 0.05, F + 1.3, (v0 + v1) / 2));
  }
  {
    // window seat: a built-in bench with a cushion, under the east window
    const u0 = IX - 0.52, v0 = 1.6, v1 = 3.2, h = 0.44;
    bx(m.trim, u0, F, v0, IX, F + h - 0.06, v1, 'nowalk');
    bx(m.woodLight, u0 - 0.03, F + h - 0.06, v0 - 0.03, IX, F + h - 0.03, v1 + 0.03);
    for (let k = 0; k < 3; k++) bx(m.trim, u0 - 0.012, F + 0.08, v0 + 0.06 + k * 0.52, u0, F + h - 0.12, v0 + 0.5 + k * 0.52);
    bx(m.linen, u0 + 0.02, F + h - 0.03, v0 + 0.02, IX - 0.02, F + h + 0.06, v1 - 0.02);
    const fP = (v: number, col: string) => props.ball(X(IX - 0.14), F + h + 0.2, Z(v), 0.06, 0.17, 0.17, col, 0, 0, -0.25);
    fP(v0 + 0.25, '#9a4e32'); fP(v1 - 0.25, '#c9a46a');
    props.box(X(u0 + 0.25), F + h + 0.075, Z(2.8), 0.16, 0.03, 0.22, '#40584c', 0.3);
    const f = new Frame(X(IX - 0.26), F, Z(2.3), Math.PI / 2);
    seat('Sit in the window seat', f.p(0, 0.45, 0), f.p(0, 1.1, 0.08), Math.PI / 2, f.p(0, 0, -0.75), 'Sitting by the window', 1.7);
  }
  // a tall plant by the opening, coats by the front door, a rug inside it
  const plant = (u: number, v: number, y0: number, s = 1) => {
    props.cyl(X(u), y0, Z(v), 0.17 * s, 0.3 * s, '#a85c3a');
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.18 * s;
      props.ball(X(u + Math.cos(a) * d), y0 + (0.38 + rnd() * 0.5) * s, Z(v + Math.sin(a) * d), 0.13 * s, 0.17 * s, 0.13 * s, pick(['#4e7a3e', '#5f8a45', '#3f6a35']));
    }
    W.physics.addCylinder(X(u), Z(v), 0.2 * s, y0, y0 + 0.8 * s);
  };
  plant(IX - 0.3, 1.1, F, 1.1);
  bx(m.woodDark, -1.36, F + 1.6, IZ - 0.03, -0.7, F + 1.68, IZ);
  for (const [u, col, h] of [[-1.25, '#7a4a2e', 0.75], [-1.02, '#3e5a6e', 0.65], [-0.8, '#c9a46a', 0.45]] as [number, string, number][]) props.box(X(u), F + 1.62 - h / 2, Z(IZ - 0.09), 0.2, h, 0.1, col);
  props.cyl(X(-1.0), F + 1.7, Z(IZ - 0.12), 0.17, 0.05, '#c9a46a');
  atlas.rug(X(0), F + 0.008, Z(IZ - 0.55), 1.1, 0.7, R.runner);

  // =================================================================== KITCHEN + DINING (back of the great room)
  {
    const cab = m.cabinet, top = m.woodLight;
    const sinkU = 4.9, nv0 = -IZ, nv1 = -IZ + 0.58, ku0 = 3.4;
    const su0 = sinkU - 0.36, su1 = sinkU + 0.36;
    // north run with a farmhouse sink under the window
    bx(cab, ku0, F + 0.1, nv0, su0, F + 0.86, nv1, 'nowalk');
    bx(cab, su1, F + 0.1, nv0, IX, F + 0.86, nv1, 'nowalk');
    bx(cab, su0, F + 0.1, nv0, su1, F + 0.62, nv1 - 0.02, 'nowalk');
    bx(m.black, ku0 + 0.02, F, nv0, IX, F + 0.1, nv1 - 0.06);
    bx(top, ku0 - 0.02, F + 0.86, nv0, su0, F + 0.91, nv1 + 0.04);
    bx(top, su1, F + 0.86, nv0, IX, F + 0.91, nv1 + 0.04);
    bx(m.trim, su0, F + 0.62, nv0, su1, F + 0.66, nv1 + 0.05);
    bx(m.trim, su0, F + 0.62, nv1, su1, F + 0.92, nv1 + 0.05);
    bx(m.trim, su0, F + 0.62, nv0, su1, F + 0.92, nv0 + 0.05);
    bx(m.trim, su0, F + 0.62, nv0, su0 + 0.04, F + 0.92, nv1 + 0.05);
    bx(m.trim, su1 - 0.04, F + 0.62, nv0, su1, F + 0.92, nv1 + 0.05);
    b.cyl(m.iron, X(sinkU), F + 0.92, Z(nv0 + 0.06), 0.018, 0.3, { seg: 8 });
    b.box(m.iron, X(sinkU), F + 1.2, Z(nv0 + 0.15), 0.03, 0.03, 0.2, { collide: false });
    for (const [a0, a1] of [[ku0 + 0.05, ku0 + 0.55], [ku0 + 0.6, su0 - 0.04], [su1 + 0.04, su1 + 0.5], [su1 + 0.55, IX - 0.62]]) {
      bx(cab, a0, F + 0.14, nv1, a1, F + 0.82, nv1 + 0.015);
      props.ball(X(a1 - 0.05), F + 0.72, Z(nv1 + 0.03), 0.015, 0.015, 0.015, '#3a3a3a');
    }
    // east run under the east window, then the range and a pantry by the opening
    const eu0 = IX - 0.58, ev1 = -2.0;
    bx(cab, eu0, F + 0.1, nv1, IX, F + 0.86, ev1, 'nowalk');
    bx(m.black, eu0 + 0.06, F, nv1, IX, F + 0.1, ev1);
    bx(top, eu0 - 0.04, F + 0.86, nv1 + 0.04, IX, F + 0.91, ev1 + 0.03);
    for (const [a0, a1] of [[nv1 + 0.06, -3.0], [-2.95, ev1 - 0.05]]) {
      bx(cab, eu0 - 0.015, F + 0.14, a0, eu0, F + 0.82, a1);
      props.ball(X(eu0 - 0.03), F + 0.72, Z(a1 - 0.05), 0.015, 0.015, 0.015, '#3a3a3a');
    }
    // backsplash tile (lower under the windows)
    bx(m.tileWall, ku0 - 0.02, F + 0.91, -IZ, sinkU - 0.6, F + 1.5, -IZ + 0.012);
    bx(m.tileWall, sinkU + 0.6, F + 0.91, -IZ, IX, F + 1.5, -IZ + 0.012);
    bx(m.tileWall, sinkU - 0.6, F + 0.91, -IZ, sinkU + 0.6, F + 1.07, -IZ + 0.012);
    bx(m.tileWall, IX - 0.012, F + 0.91, -IZ, IX, F + 1.5, -2.95);
    bx(m.tileWall, IX - 0.012, F + 0.91, -1.85, IX, F + 1.5, -1.05);
    bx(m.tileWall, IX - 0.012, F + 0.91, -2.95, IX, F + 1.07, -1.85);
    // a vintage enamel range
    const r0 = -1.92, r1 = -1.14;
    bx(m.trim, IX - 0.64, F + 0.08, r0, IX, F + 0.88, r1, 'nowalk');
    bx(m.black, IX - 0.62, F, r0 + 0.04, IX, F + 0.08, r1 - 0.04);
    bx(m.iron, IX - 0.64, F + 0.88, r0, IX, F + 0.92, r1);
    bx(m.trim, IX - 0.08, F + 0.92, r0, IX, F + 1.15, r1);
    bx(m.iron, IX - 0.655, F + 0.22, r0 + 0.08, IX - 0.64, F + 0.7, r1 - 0.08);
    bx(m.iron, IX - 0.68, F + 0.74, r0 + 0.1, IX - 0.66, F + 0.76, r1 - 0.1);
    for (const vv of [r0 + 0.2, r1 - 0.2]) for (const uu of [IX - 0.48, IX - 0.25]) props.cyl(X(uu), F + 0.92, Z(vv), 0.09, 0.008, '#151515');
    for (let i = 0; i < 4; i++) props.cyl(X(IX - 0.645), F + 0.82, Z(r0 + 0.15 + i * 0.16), 0.02, 0.02, '#e8e0cc', 0, 0, Math.PI / 2);
    props.cyl(X(IX - 0.25), F + 0.928, Z(r0 + 0.2), 0.1, 0.13, '#b5432f');
    props.cyl(X(IX - 0.25), F + 1.055, Z(r0 + 0.2), 0.03, 0.03, '#2a2a2a');
    props.cyl(X(IX - 0.48), F + 0.928, Z(r1 - 0.2), 0.13, 0.04, '#1f1f1f');
    bx(cab, IX - 0.56, F, -0.95, IX, F + 2.05, -TI2 - 0.02, 'nowalk');
    bx(cab, IX - 0.575, F + 0.08, -0.92, IX - 0.56, F + 1.98, -0.52);
    bx(cab, IX - 0.575, F + 0.08, -0.5, IX - 0.56, F + 1.98, -0.12);
    props.ball(X(IX - 0.59), F + 1.05, Z(-0.55), 0.015, 0.015, 0.015, '#3a3a3a');
    props.ball(X(IX - 0.59), F + 1.05, Z(-0.47), 0.015, 0.015, 0.015, '#3a3a3a');
    // open shelves either side of the sink window, a plate shelf on the fireplace wall
    const jarCols = ['#c98b3a', '#e2d6b5', '#9fb7a0', '#d9a441', '#b85c3c', '#efe6d0'];
    for (const [a0, a1] of [[ku0, sinkU - 0.7], [sinkU + 0.7, IX - 0.05]]) {
      for (const y of [F + 1.5, F + 1.88]) {
        bx(top, a0, y, -IZ, a1, y + 0.03, -IZ + 0.24);
        for (const uu of [a0 + 0.1, a1 - 0.1]) bx(m.iron, uu - 0.01, y - 0.12, -IZ, uu + 0.01, y, -IZ + 0.2);
      }
      const n = Math.floor((a1 - a0 - 0.1) / 0.15);
      for (let i = 0; i < n; i++) {
        const u = a0 + 0.1 + i * 0.15, col = pick(jarCols), h = 0.12 + rnd() * 0.08;
        props.cyl(X(u), F + 1.53, Z(-IZ + 0.12), 0.05, h, col);
        props.cyl(X(u), F + 1.53 + h, Z(-IZ + 0.12), 0.052, 0.02, pick(['#8a6a3a', '#f2ede2', '#3a3a3a']));
      }
      for (let i = 0; i < Math.min(6, n); i++) props.cyl(X(a0 + 0.15 + i * 0.07), F + 1.91 + 0.11, Z(-IZ + 0.03), 0.11, 0.014, pick(['#f2ede2', '#e8eef0', '#d9e2dc']), 0, Math.PI / 2, 0);
    }
    const pw0 = D.FW_U0 + 0.25, pw1 = D.CASE_U0 - 0.25;
    bx(top, pw0, F + 1.62, -TI2 - 0.24, pw1, F + 1.65, -TI2);
    for (const uu of [pw0 + 0.15, pw1 - 0.15]) bx(m.iron, uu - 0.01, F + 1.5, -TI2 - 0.19, uu + 0.01, F + 1.62, -TI2);
    for (let i = 0; i < 10; i++) props.cyl(X(pw0 + 0.15 + i * 0.09), F + 1.65 + 0.12, Z(-TI2 - 0.11), 0.12, 0.015, pick(['#f2ede2', '#e6eef2', '#2f4a64', '#f2ede2']), 0, Math.PI / 2, 0);
    for (let i = 0; i < 5; i++) {
      const col = pick(jarCols), h = 0.14 + rnd() * 0.1, u = pw0 + 1.2 + i * 0.2;
      if (u > pw1 - 0.1) break;
      props.cyl(X(u), F + 1.65, Z(-TI2 - 0.12), 0.06, h, col);
      props.cyl(X(u), F + 1.65 + h, Z(-TI2 - 0.12), 0.062, 0.02, '#8a6a3a');
    }
    for (let i = 0; i < 5; i++) props.cyl(X(pw0 + 0.1 + i * 0.16), F + 1.46, Z(-TI2 - 0.06), 0.04, 0.09, pick(['#f2ede2', '#b5432f', '#3e5a6e', '#d9a441']));
    // on the counters: bread board and loaf, a basket of eggs, a crock of utensils
    props.box(X(IX - 0.3), F + 0.92, Z(-2.6), 0.32, 0.02, 0.24, '#a5733f');
    props.ball(X(IX - 0.3), F + 0.98, Z(-2.6), 0.13, 0.07, 0.08, '#c78a45');
    props.cyl(X(ku0 + 0.3), F + 0.91, Z(-IZ + 0.25), 0.12, 0.08, '#9c7a52');
    for (let i = 0; i < 5; i++) props.ball(X(ku0 + 0.26 + (i % 3) * 0.05), F + 1.0, Z(-IZ + 0.22 + Math.floor(i / 3) * 0.06), 0.03, 0.04, 0.03, '#efe2c8');
    props.cyl(X(IX - 0.25), F + 0.91, Z(-IZ + 0.3), 0.07, 0.16, '#e8e0cc');
    for (let i = 0; i < 4; i++) props.cyl(X(IX - 0.25 + (rnd() - 0.5) * 0.05), F + 1.0, Z(-IZ + 0.3 + (rnd() - 0.5) * 0.05), 0.008, 0.22, '#7a5232', 0, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3);
    // cafe curtains and a runner by the sink
    atlas.box(X(sinkU), F + 1.36, Z(-IZ + 0.05), 0.98, 0.42, 0.01, R.gingham);
    b.cyl(m.iron, X(sinkU - 0.55), F + 1.58, Z(-IZ + 0.05), 0.008, 1.1, { seg: 6, rotZ: -Math.PI / 2 });
    atlas.box(X(IX - 0.05), F + 1.36, Z(-2.4), 0.01, 0.42, 0.88, R.gingham);
    atlas.rug(X(sinkU), F + 0.008, Z(-3.7), 1.4, 0.55, R.runner);
    W.lamps.add(P3(sinkU, F + 1.45, -IZ + 0.4), '#ffcf96', 1.6, 4.5, { nightOnly: true });
  }
  // dining table, four chairs, a bowl of apples, the pendant
  {
    const tu = 1.5, tv = -2.5;
    let top = F + 0.78;
    if (c.fu.has('dining_table')) {
      // the scanned table is big for a farmhouse kitchen: 0.75 in plan, 0.92 in height
      const f = new Frame(X(tu), F, Z(tv), 0);
      const sc: [number, number, number] = [0.75, 0.92, 0.75];
      model(c, 'dining_table', f, sc);
      const sz = c.fu.size('dining_table');
      top = F + 0.84 * sc[1];
      f.solid(sz.x * sc[0], top - F, sz.z * sc[2]);
    } else table(c, new Frame(X(tu), F, Z(tv), Math.PI / 2), m.woodLight, 0.9, 1.5, 0.78, 0.075);
    for (const cu of [tu - 0.45, tu + 0.45]) for (const [cv, yaw] of [[tv - 0.72, Math.PI], [tv + 0.72, 0]] as [number, number][]) {
      const f = new Frame(X(cu), F, Z(cv), yaw);
      if (c.fu.has('dining_chair_02')) { model(c, 'dining_chair_02', f); f.solid(0.45, 0.95, 0.5); }
      else chair(c, f, m.woodDark, m.rust);
    }
    props.cyl(X(tu + 0.2), top, Z(tv), 0.15, 0.06, '#e9dfc6');
    for (let i = 0; i < 6; i++) props.ball(X(tu + 0.2 + Math.cos(i * 1.1) * 0.08), top + 0.07 + (i > 3 ? 0.05 : 0), Z(tv + Math.sin(i * 1.1) * 0.08), 0.045, 0.042, 0.045, i % 3 ? '#b5302a' : '#c9a33a');
    props.cyl(X(tu - 0.4), top, Z(tv), 0.06, 0.18, '#3e5a6e');
    for (let i = 0; i < 7; i++) props.ball(X(tu - 0.4 + (rnd() - 0.5) * 0.14), top + 0.22 + rnd() * 0.1, Z(tv + (rnd() - 0.5) * 0.14), 0.04, 0.04, 0.04, pick(['#f2ede2', '#d9a441', '#efe6d0']));
    W.interact.add({
      pos: P3(tu + 0.2, top + 0.08, tv), radius: 0.22, range: 2.2, label: 'Take an apple',
      onUse: () => {
        W.hold(new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), M.paint('#b5302a', 0.45)), 'a crisp apple');
        W.toast('A crisp apple from the orchard');
      },
    });
    const py = F + 2.05;
    b.cyl(m.iron, X(tu), py, Z(tv), 0.006, F + D.CEIL - py, { seg: 5 });
    const lamp = W.lamps.add(new THREE.Vector3(X(tu), py - 0.05, Z(tv)), '#ffc98a', 3.0, 6.5, { on: true });
    shades.shade(lamp, X(tu), py - 0.16, Z(tv), 0.26, 0.05, 0.18, 0.55);
    shades.bulb(lamp, X(tu), py - 0.14, Z(tv), 0.045, 2.4);
    lampToggle(lamp, P3(tu, py - 0.1, tv), 'the kitchen light');
  }
  // mudroom corner by the back door: a bench with hooks above, boots, a mat
  {
    const u0 = WU + TI2, u1 = u0 + 0.42, v0 = -IZ + 0.15, v1 = -2.9, h = 0.45;
    bx(m.woodLight, u0, F + h - 0.04, v0, u1, F + h, v1);
    bx(m.woodDark, u0, F, v0, u1, F + h - 0.04, v0 + 0.04); bx(m.woodDark, u0, F, v1 - 0.04, u1, F + h - 0.04, v1);
    bx(m.woodDark, u0, F + 0.1, v0, u1, F + 0.12, v1);
    solid(u0, F, v0, u1, F + h, v1);
    bx(m.woodDark, u0, F + 1.62, v0 + 0.05, u0 + 0.03, F + 1.72, v1 - 0.05);
    const coats: [number, string, number][] = [[-4.3, '#4a5a3a', 0.8], [-3.9, '#7a3a2a', 0.7], [-3.5, '#c9a46a', 0.55], [-3.15, '#2f3f5a', 0.75]];
    for (const [v, col, hh] of coats) props.box(X(u0 + 0.09), F + 1.66 - hh / 2, Z(v), 0.1, hh, 0.32, col);
    props.cyl(X(u0 + 0.14), F + 1.75, Z(-3.6), 0.16, 0.05, '#c9a46a');
    for (const [v, col] of [[-4.2, '#3b2a1e'], [-3.95, '#3b2a1e'], [-3.5, '#2c3a2a'], [-3.3, '#2c3a2a']] as [number, string][]) props.box(X(u0 + 0.2), F + 0.07, Z(v), 0.24, 0.14, 0.1, col, 0.1);
    props.cyl(X(u0 + 0.22), F + h, Z(-3.2), 0.13, 0.12, '#9c7a52');
    const f = new Frame(X(u0 + 0.21), F, Z(-3.7), -Math.PI / 2);
    seat('Sit on the bench', f.p(0, 0.45, 0), f.p(0, 1.08, 0.06), -Math.PI / 2, f.p(0, 0, -0.75));
    atlas.rug(X(D.BACK_DOOR_U), F + 0.008, Z(-IZ + 0.45), 0.95, 0.6, R.bathmat);
  }

  // =================================================================== BEDROOM (front of the west wing)
  {
    const cu = -4.75, v0 = D.BB_V + TI2, len = 2.05, w = 1.46;
    const vc = v0 + len / 2;
    const fr = m.woodDark;
    bx(fr, cu - w / 2 - 0.02, F, v0, cu + w / 2 + 0.02, F + 1.15, v0 + 0.06);
    for (const s of [-1, 1]) bx(fr, cu + s * (w / 2 + 0.02) - 0.04, F, v0, cu + s * (w / 2 + 0.02) + 0.04, F + 1.22, v0 + 0.08);
    bx(fr, cu - w / 2 - 0.02, F, v0 + len - 0.06, cu + w / 2 + 0.02, F + 0.68, v0 + len);
    for (const s of [-1, 1]) bx(fr, cu + s * (w / 2 + 0.02) - 0.04, F, v0 + len - 0.08, cu + s * (w / 2 + 0.02) + 0.04, F + 0.75, v0 + len);
    for (const s of [-1, 1]) bx(fr, cu + s * w / 2 - 0.03, F + 0.2, v0 + 0.06, cu + s * w / 2 + 0.03, F + 0.34, v0 + len - 0.06);
    bx(m.linen, cu - w / 2 + 0.02, F + 0.32, v0 + 0.07, cu + w / 2 - 0.02, F + 0.54, v0 + len - 0.07);
    atlas.box(X(cu), F + 0.56, Z(vc + 0.25), w + 0.06, 0.05, 1.45, R.quilt1);
    for (const s of [-1, 1]) atlas.box(X(cu + s * (w / 2 + 0.035)), F + 0.42, Z(vc + 0.25), 0.02, 0.3, 1.45, R.quilt1);
    atlas.box(X(cu), F + 0.42, Z(vc + 0.25 + 0.735), w + 0.08, 0.3, 0.02, R.quilt1);
    for (const s of [-1, 1]) b.box(m.linen, X(cu + s * 0.35), F + 0.62, Z(v0 + 0.3), 0.6, 0.14, 0.36, { rotX: -0.25, collide: false });
    solid(cu - w / 2 - 0.05, F, v0, cu + w / 2 + 0.05, F + 0.65, v0 + len);
    bedRest(P3(cu, F + 0.6, vc), P3(cu + 0.1, F + 0.82, v0 + 0.55), Math.PI, P3(cu + w / 2 + 0.45, F, vc + 0.3));
    let nsTop = F + 0.6;
    const nsU = [cu - w / 2 - 0.45, cu + w / 2 + 0.45];
    if (c.fu.has('ClassicNightstand_01')) {
      const sz = c.fu.size('ClassicNightstand_01');
      nsTop = F + sz.y;
      for (const u of nsU) { const f = new Frame(X(u), F, Z(v0 + 0.01 + sz.z / 2), Math.PI); model(c, 'ClassicNightstand_01', f); f.solid(sz.x, sz.y, sz.z); }
    } else for (const u of nsU) bx(fr, u - 0.22, F, v0 + 0.02, u + 0.22, F + 0.6, v0 + 0.44, 'nowalk');
    tableLamp(c, X(nsU[0]), nsTop, Z(v0 + 0.22), { base: '#efe6d0' });
    props.box(X(nsU[1] - 0.02), nsTop + 0.015, Z(v0 + 0.22), 0.16, 0.03, 0.22, '#2f4a5e', 0.3);
    props.cyl(X(nsU[1] + 0.12), nsTop, Z(v0 + 0.3), 0.035, 0.1, '#dfe8ea');
    props.cyl(X(nsU[1] - 0.12), nsTop, Z(v0 + 0.15), 0.04, 0.12, '#b08d4a');
    picture(c, cu, F + 1.68, v0 + 0.015, 0.5, 0.62, R.paint4, 0);
    // dresser against the hall wall
    let dTop = F + 0.86;
    const dv = 3.3;
    if (c.fu.has('painted_wooden_cabinet')) {
      const sz = c.fu.size('painted_wooden_cabinet');
      const f = new Frame(X(WU - TI2 - 0.01 - sz.z / 2), F, Z(dv), Math.PI / 2);
      model(c, 'painted_wooden_cabinet', f);
      f.solid(sz.x, sz.y, sz.z);
      dTop = F + sz.y;
    } else bx(fr, WU - TI2 - 0.5, F + 0.06, dv - 0.5, WU - TI2, F + 0.86, dv + 0.5, 'nowalk');
    props.cyl(X(WU - 0.4), dTop, Z(dv - 0.3), 0.05, 0.14, '#6f8a7a');
    for (let i = 0; i < 5; i++) props.ball(X(WU - 0.4 + (rnd() - 0.5) * 0.1), dTop + 0.19 + rnd() * 0.08, Z(dv - 0.3 + (rnd() - 0.5) * 0.1), 0.035, 0.035, 0.035, pick(['#e8a0a8', '#efe6d0']));
    props.box(X(WU - 0.4), dTop + 0.04, Z(dv + 0.35), 0.16, 0.08, 0.12, '#7a2e25');
    picture(c, WU - TI2 - 0.015, F + 1.75, dv, 0.55, 0.4, R.paint2, -Math.PI / 2);
    atlas.rug(X(cu), F + 0.008, Z(2.75), 1.9, 1.15, R.rug3, true);
  }

  // =================================================================== BATHROOM (back of the west wing)
  {
    const bu0 = -IX, bu1 = WU - TI2, bv0 = -IZ, bv1 = D.BB_V - TI2;
    wainscot(c, bu0, bv0, bu1, bv1, F, 1.2, [{ side: 'e', a: -1.45 - 0.1, b: -0.45 + 0.1 }]);
    clawTub(c, -4.7, -IZ + 0.4, false, F);
    toilet(c, new Frame(X(bu0 + 0.42), F, Z(-1.55), -Math.PI / 2));
    pedestalSink(c, new Frame(X(-4.6), F, Z(bv1 - 0.3), 0));
    // towel rail, a little cabinet stool, bath mat, plant on the sill
    bx(m.woodDark, bu0, F + 1.0, -3.35, bu0 + 0.08, F + 1.03, -2.95);
    atlas.box(X(bu0 + 0.07), F + 0.78, Z(-3.15), 0.03, 0.46, 0.38, R.towel);
    atlas.rug(X(-4.7), F + 0.008, Z(-3.35), 0.9, 0.5, R.bathmat);
    props.cyl(X(-4.7), F + 1.35, Z(-IZ + 0.08), 0.05, 0.08, '#a85c3a');
    for (let i = 0; i < 5; i++) props.ball(X(-4.7 + (rnd() - 0.5) * 0.08), F + 1.47 + rnd() * 0.04, Z(-IZ + 0.08 + (rnd() - 0.5) * 0.06), 0.035, 0.03, 0.035, '#5f8a45');
    props.cyl(X(-3.3), F, Z(-3.9), 0.18, 0.45, '#9c7a52');
    props.box(X(-3.3), F + 0.47, Z(-3.9), 0.3, 0.04, 0.22, '#f4f1ea', 0.3);
  }

  // =================================================================== ATTIC
  const kv = D.ATTIC_WALK_V;
  {
    // the upstairs bathroom at the west gable: slipper tub under the window, toilet and sink on the partition
    const bu0 = -IX, bu1 = D.AB_U - TI2;
    clawTub(c, bu0 + 0.4, 0, true, A);
    toilet(c, new Frame(X(bu1 - 0.42), A, Z(-1.9), Math.PI / 2));
    pedestalSink(c, new Frame(X(bu1 - 0.3), A, Z(1.75), Math.PI / 2), false);
    atlas.rug(X(bu0 + 1.15), A + 0.012, Z(0), 0.5, 0.9, R.bathmat);
    // towel ladder and a basket under the south slope
    for (const dz of [-0.2, 0.2]) b.box(m.woodLight, X(-5.6) , A + 0.75, Z(2.7 + dz), 0.04, 1.5, 0.04, { rotX: 0, rotZ: 0.18, collide: false });
    for (let k = 0; k < 4; k++) b.box(m.woodLight, X(-5.6 + 0.05 * k), A + 0.35 + k * 0.33, Z(2.7), 0.025, 0.025, 0.44, { collide: false });
    atlas.box(X(-5.54), A + 0.95, Z(2.7), 0.03, 0.5, 0.36, R.towel);
    props.cyl(X(-4.6), A, Z(3.05), 0.2, 0.3, '#b08d5a');
    props.cyl(X(-6.2), A, Z(-2.6), 0.07, 0.12, '#a85c3a');
    for (let i = 0; i < 6; i++) props.ball(X(-6.2 + (rnd() - 0.5) * 0.14), A + 0.2 + rnd() * 0.1, Z(-2.6 + (rnd() - 0.5) * 0.12), 0.06, 0.05, 0.06, '#5f8a45');
  }
  {
    // iron bed with its head against the east gable, between the two windows
    const ir = m.iron;
    const hasBed = c.fu.has('old_bed_frame');
    const bsz = c.fu.size('old_bed_frame');
    const u1 = IX - 0.03, len = hasBed ? bsz.z : 2.03, w = hasBed ? bsz.x : 1.2, u0 = u1 - len, vc = 0;
    let my = A + 0.3;
    if (hasBed) {
      model(c, 'old_bed_frame', new Frame(X((u0 + u1) / 2), A, Z(vc), -Math.PI / 2));
      my = A + 0.42;
    } else {
      for (const s of [-1, 1]) {
        bx(ir, u1 - 0.05, A, vc + s * (w / 2 + 0.01) - 0.025, u1, A + 1.0, vc + s * (w / 2 + 0.01) + 0.025);
        bx(ir, u0, A, vc + s * (w / 2 + 0.01) - 0.025, u0 + 0.05, A + 0.75, vc + s * (w / 2 + 0.01) + 0.025);
        bx(ir, u0, A + 0.24, vc + s * w / 2 - 0.02, u1, A + 0.3, vc + s * w / 2 + 0.02);
      }
    }
    const mw = w - 0.1, mt = 0.2;
    bx(m.linen, u0 + 0.09, my, -mw / 2, u1 - 0.09, my + mt, mw / 2);
    const ql = len - 0.6;
    atlas.box(X(u0 + 0.08 + ql / 2), my + mt + 0.025, Z(vc), ql, 0.05, mw + 0.05, R.quilt2);
    for (const s of [-1, 1]) atlas.box(X(u0 + 0.08 + ql / 2), my + mt - 0.11, Z(vc + s * (mw / 2 + 0.035)), ql, 0.27, 0.02, R.quilt2);
    atlas.box(X(u0 + 0.075), my + mt - 0.11, Z(vc), 0.02, 0.27, mw + 0.08, R.quilt2);
    b.box(m.linen, X(u1 - 0.3), my + mt + 0.08, Z(vc), 0.32, 0.13, mw - 0.14, { rotZ: 0.25, collide: false });
    solid(u0, A, -w / 2 - 0.03, u1, my + mt + 0.05, w / 2 + 0.03);
    bedRest(P3(u0 + 1.0, my + mt, vc), P3(u1 - 0.55, my + mt + 0.2, vc), Math.PI / 2, P3(u0 + 0.9, A, vc - w / 2 - 0.5));
    const nsV = w / 2 + 0.33;
    let nsTop = A + 0.62;
    if (c.fu.has('painted_wooden_nightstand')) {
      const sz = c.fu.size('painted_wooden_nightstand');
      nsTop = A + sz.y;
      for (const s of [-1, 1]) { const f = new Frame(X(IX - 0.02 - sz.z / 2), A, Z(s * nsV), Math.PI / 2); model(c, 'painted_wooden_nightstand', f); f.solid(sz.x, sz.y, sz.z); }
    } else for (const s of [-1, 1]) bx(m.woodLight, IX - 0.46, A, s * nsV - 0.22, IX - 0.02, A + 0.62, s * nsV + 0.22, 'nowalk');
    tableLamp(c, X(IX - 0.22), nsTop, Z(nsV), { base: '#9fb7a0' });
    props.box(X(IX - 0.25), nsTop + 0.015, Z(-nsV), 0.15, 0.03, 0.21, '#7a2e25', 0.2);
    props.cyl(X(IX - 0.13), nsTop, Z(-nsV + 0.08), 0.04, 0.08, '#f2ede2');
    // trunk at the foot
    const t0 = u0 - 0.55, t1 = u0 - 0.05, tw = Math.min(0.46, w / 2 + 0.02);
    bx(m.woodDark, t0, A, -tw, t1, A + 0.42, tw, 'nowalk');
    b.box(m.woodDark, X((t0 + t1) / 2), A + 0.42, Z(0), 0.5, 0.1, tw * 2, { collide: false });
    for (const v of [-tw * 0.65, tw * 0.65]) bx(ir, t0 - 0.006, A, v - 0.03, t1 + 0.006, A + 0.475, v + 0.03);
    props.box(X((t0 + t1) / 2), A + 0.49, Z(0.15), 0.36, 0.06, 0.4, '#c9a46a', 0.1);
    atlas.rug(X(u0 + 0.6), A + 0.008, Z(0), 3.0, 2.6, R.rug2, true);
  }
  {
    // writing desk under the north east window
    const dv0 = -2.45, dv1 = -1.2, u0 = IX - 0.6, u1 = IX - 0.02;
    bx(m.woodLight, u0, A + 0.72, dv0, u1, A + 0.76, dv1);
    for (const v of [dv0 + 0.04, dv1 - 0.04]) for (const u of [u0 + 0.04, u1 - 0.04]) bx(m.woodLight, u - 0.025, A, v - 0.025, u + 0.025, A + 0.72, v + 0.025);
    bx(m.woodLight, u0 + 0.04, A + 0.6, dv0 + 0.06, u1 - 0.03, A + 0.72, (dv0 + dv1) / 2);
    solid(u0, A, dv0, u1, A + 0.76, dv1);
    chair(c, new Frame(X(u0 - 0.38), A, Z(-1.75), -Math.PI / 2), m.woodDark);
    tableLamp(c, X(IX - 0.2), A + 0.76, Z(dv0 + 0.18), { on: false, base: '#3e5a6e' });
    props.box(X(u0 + 0.28), A + 0.765, Z(-1.7), 0.32, 0.012, 0.24, '#f2ede2', 0.15);
    props.box(X(u0 + 0.3), A + 0.775, Z(-1.68), 0.2, 0.003, 0.012, '#2a2a2a', 0.4);
    props.cyl(X(u1 - 0.12), A + 0.76, Z(dv1 - 0.15), 0.04, 0.09, '#b5432f');
    books(props, 'z', dv0 + 0.3, dv0 + 0.62, A + 0.76, IX - 0.14, 0.18, 0.24);
  }
  {
    // reading chair looking out of the south east window, with a floor lamp
    const yaw = -1.19;
    const f = new Frame(X(5.15), A, Z(2.2), yaw);
    if (c.fu.has('ArmChair_01')) { model(c, 'ArmChair_01', f); f.solid(0.86, 1.0, 0.8); }
    else armchair(c, f, m.green, m.woodDark, 0.84);
    seat('Sit in the reading chair', f.p(0, 0.5, 0), f.p(0, 1.12, 0.06), yaw, f.p(0, 0, -0.75));
    floorLamp(c, 4.4, 2.75, A);
    atlas.rug(X(5.3), A + 0.009, Z(2.35), 1.6, 1.0, R.rug3, true);
  }
  {
    // low bookcase under the south slope, chest of drawers under the north slope
    const b0 = 0.6, b1 = 2.4, bv0 = kv + 0.1, bv1 = kv + 0.53;
    bx(m.woodDark, b0, A, bv1 - 0.04, b1, A + 0.8, bv1);
    bx(m.woodDark, b0, A + 0.77, bv0, b1, A + 0.8, bv1);
    bx(m.woodDark, b0, A, bv0, b1, A + 0.04, bv1);
    for (const u of [b0, b1 - 0.03]) bx(m.woodDark, u, A, bv0, u + 0.03, A + 0.8, bv1);
    bx(m.woodDark, b0 + 0.03, A + 0.39, bv0 + 0.02, b1 - 0.03, A + 0.41, bv1 - 0.02);
    for (const y of [0.04, 0.41]) books(props, 'x', b0 + 0.05, b1 - 0.05, A + y, (bv0 + bv1) / 2, 0.24, 0.3);
    props.cyl(X(b1 - 0.3), A + 0.8, Z((bv0 + bv1) / 2), 0.09, 0.06, '#c9a46a');
    for (let i = 0; i < 3; i++) props.ball(X(b1 - 0.3 + (i - 1) * 0.06), A + 0.9, Z((bv0 + bv1) / 2), 0.05, 0.05, 0.05, pick(['#b85c3c', '#7f9a7a', '#d9a441']));
    const c0 = 3.4, c1 = 4.5, cv0 = -kv - 0.55, cv1 = -kv - 0.1;
    bx(m.woodLight, c0, A, cv0, c1, A + 0.85, cv1);
    for (let k = 0; k < 3; k++) {
      bx(m.woodDark, c0 + 0.05, A + 0.08 + k * 0.25, cv1, c1 - 0.05, A + 0.28 + k * 0.25, cv1 + 0.012);
      for (const uu of [c0 + 0.3, c1 - 0.3]) props.ball(X(uu), A + 0.18 + k * 0.25, Z(cv1 + 0.025), 0.016, 0.016, 0.016, '#3a3a3a');
    }
    props.cyl(X(c0 + 0.25), A + 0.85, Z((cv0 + cv1) / 2), 0.06, 0.14, '#a85c3a');
    for (let i = 0; i < 6; i++) props.ball(X(c0 + 0.25 + (rnd() - 0.5) * 0.12), A + 1.02 + rnd() * 0.06, Z((cv0 + cv1) / 2 + (rnd() - 0.5) * 0.1), 0.05, 0.04, 0.05, '#5f8a45');
    picture(c, (c0 + c1) / 2, A + 1.25, cv0 + 0.03, 0.36, 0.26, R.paint3, 0);
    // baskets and a box tucked under the slopes
    props.cyl(X(-2.4), A, Z(-kv - 0.4), 0.22, 0.32, '#9c7a52');
    props.cyl(X(-1.9), A, Z(-kv - 0.45), 0.17, 0.26, '#b08d5a');
    props.box(X(0.9), A + 0.16, Z(-kv - 0.45), 0.5, 0.32, 0.4, '#a5733f', 0.2);
    atlas.rug(X(-1.7), A + 0.008, Z(-2.3), 1.4, 0.8, R.runner);
  }
  // a soft fill under the ridge so the attic is not gloomy by day
  W.lamps.add(P3(1.5, A + 2.5, -1.0), '#ffd6a6', 1.3, 8, { on: true });

  return { fire, livingLamp };
}
