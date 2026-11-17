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
export function buildInterior(c: Ctx) {
  const { b, m, props, atlas, shades } = c;
  const bx = (mat: THREE.Material, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, collide: boolean | 'nowalk' = false) =>
    b.boxMinMax(mat, X(Math.min(u0, u1)), Math.min(y0, y1), Z(Math.min(v0, v1)), X(Math.max(u0, u1)), Math.max(y0, y1), Z(Math.max(v0, v1)), { collide });
  const solid = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number) =>
    W.physics.addBox(X(Math.min(u0, u1)), y0, Z(Math.min(v0, v1)), X(Math.max(u0, u1)), y1, Z(Math.max(v0, v1)), { walk: false });

  // =================================================================== LIVING ROOM
  // fire
  // the light sits in front of the firebox so it fills the room, not the kitchen behind the wall
  const fire = new Fire({ pos: P3(D.FP_U, F + 0.06, 0.43), scale: 0.4, label: 'the fire', lampRadius: 5.5, lampIntensity: 4.5, lampOffset: new THREE.Vector3(0, 0.56, 0.82) });
  W.scene.add(fire.group);
  // a basket of logs and fire irons beside the hearth
  for (let i = 0; i < 6; i++) props.cyl(X(2.99), F + 0.11 + Math.floor(i / 3) * 0.085, Z(0.3 + (i % 3) * 0.1 + (i > 2 ? 0.05 : 0)), 0.045, 0.32, '#6e5338', 0, 0, -Math.PI / 2);
  bx(m.woodDark, 2.98, F, 0.22, 3.32, F + 0.06, 0.62, 'nowalk');
  for (const du of [-0.04, 0.0, 0.04]) props.cyl(X(1.02 + du), F, Z(0.78), 0.008, 0.72, '#222222');
  // mantel things
  props.cyl(X(1.3), F + 1.31, Z(0.75), 0.03, 0.06, '#b08d4a'); props.cyl(X(1.3), F + 1.37, Z(0.75), 0.012, 0.16, '#f4ead2');
  props.cyl(X(2.8), F + 1.31, Z(0.75), 0.03, 0.06, '#b08d4a'); props.cyl(X(2.8), F + 1.37, Z(0.75), 0.012, 0.13, '#f4ead2');
  props.box(X(2.45), F + 1.42, Z(0.74), 0.16, 0.22, 0.08, '#5a3a24');
  props.cyl(X(2.45), F + 1.43, Z(0.79), 0.05, 0.005, '#efe6d0', 0, Math.PI / 2, 0);
  props.cyl(X(1.65), F + 1.31, Z(0.76), 0.05, 0.16, '#6f8a7a');
  for (let i = 0; i < 5; i++) props.ball(X(1.65 + (rnd() - 0.5) * 0.08), F + 1.5 + rnd() * 0.06, Z(0.76 + (rnd() - 0.5) * 0.06), 0.035, 0.035, 0.035, pick(['#d9a441', '#efe6d0', '#c86b5a']));
  picture(c, D.FP_U, F + 1.78, 0.69, 0.82, 0.56, R.paint1, 0);

  // sofa facing the fire
  if (c.fu.has('Sofa_01')) {
    const f = new Frame(X(2.05), F, Z(2.53), 0);
    model(c, 'Sofa_01', f);
    // a couple of cushions and a folded throw
    const cush = (lx: number, col: string) => { const p = f.p(lx, 0.55, 0.1); props.ball(p.x, p.y, p.z, 0.17, 0.155, 0.055, col, f.yaw, -0.3); };
    cush(-0.48, '#9a4e32');
    cush(0.5, '#6f8a7a');
    f.solid(1.6, 0.85, 0.7);
    seat('Sit on the sofa', f.p(0.35, 0.5, 0), f.p(0.35, 1.08, 0.04), 0, f.p(0.35, 0, -0.72));
  } else {
    const f = new Frame(X(2.05), F, Z(2.43), 0);
    f.box(b, m.linen, 0, 0.27, 0, 2.0, 0.3, 0.86);
    f.box(b, m.linen, -0.47, 0.49, -0.07, 0.9, 0.14, 0.64);
    f.box(b, m.linen, 0.47, 0.49, -0.07, 0.9, 0.14, 0.64);
    f.box(b, m.linen, 0, 0.66, 0.34, 2.0, 0.5, 0.2, -0.1);
    f.box(b, m.linen, -0.46, 0.76, 0.2, 0.86, 0.36, 0.13, -0.18);
    f.box(b, m.linen, 0.46, 0.76, 0.2, 0.86, 0.36, 0.13, -0.18);
    for (const s of [-1, 1]) {
      f.box(b, m.linen, s * 0.92, 0.5, 0.0, 0.17, 0.3, 0.86);
      f.box(b, m.linen, s * 0.92, 0.66, 0.0, 0.2, 0.05, 0.88);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(b, m.woodDark, sx * 0.93, 0.06, sz * 0.36, 0.05, 0.12, 0.05);
    f.box(b, m.rust, -0.7, 0.68, 0.08, 0.36, 0.34, 0.1, -0.3, 0.12);
    f.box(b, m.green, 0.7, 0.68, 0.08, 0.36, 0.34, 0.1, -0.3, -0.12);
    // a folded throw over the arm
    f.box(b, m.rust, 0.92, 0.7, -0.05, 0.24, 0.04, 0.5);
    f.solid(2.0, 0.9, 0.86);
    seat('Sit on the sofa', f.p(0.4, 0.5, 0), f.p(0.4, 1.12, 0.05), 0, f.p(0.4, 0, -0.75));
  }
  // coffee table with a tray, books and a mug
  {
    const f = new Frame(X(2.05), F, Z(1.62), 0);
    let top = F + 0.44;
    if (c.fu.has('CoffeeTable_01')) {
      const sc = 0.78;
      model(c, 'CoffeeTable_01', f, sc);
      const sz = c.fu.size('CoffeeTable_01');
      top = F + sz.y * sc;
      f.solid(sz.x * sc, sz.y * sc, sz.z * sc);
    } else {
      table(c, f, m.woodDark, 1.2, 0.5, 0.44, 0.07);
      f.box(b, m.woodDark, 0, 0.12, 0, 1.06, 0.03, 0.38);
    }
    props.box(X(1.7), top + 0.015, Z(1.6), 0.26, 0.03, 0.2, '#2f4a5e', 0.2);
    props.box(X(1.7), top + 0.04, Z(1.6), 0.22, 0.025, 0.17, '#c9b48a', 0.05);
    props.cyl(X(2.3), top, Z(1.68), 0.04, 0.09, '#f2ede2');
    props.cyl(X(2.5), top, Z(1.55), 0.12, 0.02, '#a5733f');
    props.cyl(X(2.5), top + 0.02, Z(1.55), 0.035, 0.08, '#efe6d0');
  }
  // armchair angled toward the fire
  {
    const yaw = Math.atan2(-(D.FP_U - 0.25), -(0.66 - 1.75));
    const f = new Frame(X(0.25), F, Z(1.75), yaw);
    if (c.fu.has('ArmChair_01')) { model(c, 'ArmChair_01', f); f.solid(0.86, 1.0, 0.8); }
    else armchair(c, f, m.rust, m.woodDark);
    seat('Sit in the armchair', f.p(0, 0.5, 0), f.p(0, 1.12, 0.06), yaw, f.p(0, 0, -0.75));
  }
  const livingLamp = floorLamp(c, 0.85, 2.66, F);
  atlas.rug(X(2.05), F + 0.008, Z(1.72), 3.3, 2.1, R.rug1);
  // west corner: bookshelf, reading chair, side table with a lamp
  if (c.fu.has('wooden_bookshelf_worn')) {
    const sc = 0.97, sz = c.fu.size('wooden_bookshelf_worn');
    const d = sz.z * sc, w = sz.x * sc;
    const v0 = IZ - 0.02 - w, v1 = IZ - 0.02, u0 = -IX, u1 = -IX + d;
    model(c, 'wooden_bookshelf_worn', new Frame(X((u0 + u1) / 2), F, Z((v0 + v1) / 2), -Math.PI / 2), sc);
    solid(u0, F, v0, u1, F + sz.y * sc, v1);
    // books on its shelves (measured from the model)
    const shelves = [0.11, 0.39, 0.67, 0.96, 1.28, 1.66].map((y) => y * sc);
    shelves.forEach((y, i) => {
      const gap = (i < shelves.length - 1 ? shelves[i + 1] : 2.0 * sc) - y;
      books(props, 'z', v0 + 0.07, v1 - 0.07, F + y + 0.005, u0 + d * 0.42, 0.22, Math.min(0.3, gap - 0.04));
    });
    const bookPos = P3(u1 - 0.05, F + 1.3, (v0 + v1) / 2);
    W.interact.add({
      pos: bookPos, radius: 0.35, range: 2.4, label: 'Take a book',
      onUse: () => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), M.paint(pick(BOOKS), 0.7));
        W.hold(g, 'a well worn book');
        W.toast('You take a well worn book of poems');
      },
    });
  } else {
    const u0 = -IX, u1 = -IX + 0.36, v0 = 2.72, v1 = 3.88, h = 2.05;
    bx(m.woodDark, u0, F, v0, u1, F + h, v0 + 0.03, 'nowalk');
    bx(m.woodDark, u0, F, v1 - 0.03, u1, F + h, v1, 'nowalk');
    bx(m.woodDark, u0, F + h - 0.04, v0, u1 + 0.02, F + h, v1);
    bx(m.woodDark, u0, F, v0, u0 + 0.015, F + h, v1);
    solid(u0, F, v0, u1, F + h, v1);
    const shelves = [0.05, 0.42, 0.8, 1.18, 1.56];
    for (const y of shelves) bx(m.woodDark, u0, F + y, v0, u1, F + y + 0.03, v1);
    shelves.forEach((y, i) => books(props, 'z', v0 + 0.03, v1 - 0.03, F + y + 0.03, u0 + 0.19, 0.24, i === 0 ? 0.3 : 0.32));
    // the book you can borrow
    const bookPos = P3(u1 - 0.05, F + 1.3, 3.3);
    W.interact.add({
      pos: bookPos, radius: 0.35, range: 2.4, label: 'Take a book',
      onUse: () => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.04), M.paint(pick(BOOKS), 0.7));
        W.hold(g, 'a well worn book');
        W.toast('You take a well worn book of poems');
      },
    });
  }
  {
    const yaw = Math.atan2(-1.8, 1.1);
    const hasM = c.fu.has('ArmChair_01');
    const f = hasM ? new Frame(X(-4.0), F, Z(3.02), yaw) : new Frame(X(-4.3), F, Z(3.1), yaw);
    if (hasM) { model(c, 'ArmChair_01', f); f.solid(0.86, 1.0, 0.8); }
    else armchair(c, f, m.green, m.woodDark, 0.82);
    seat('Sit in the reading chair', f.p(0, 0.5, 0), f.p(0, 1.12, 0.06), yaw, f.p(0, 0, -0.75));
    const tx = X(-4.95), tz = Z(2.12);
    b.cyl(m.woodDark, tx, F, tz, 0.035, 0.6, { seg: 8 });
    b.cyl(m.woodDark, tx, F, tz, 0.16, 0.03, { seg: 14 });
    b.cyl(m.woodDark, tx, F + 0.6, tz, 0.24, 0.03, { seg: 16 });
    W.physics.addCylinder(tx, tz, 0.24, F, F + 0.65);
    tableLamp(c, tx + 0.04, F + 0.63, tz - 0.06, { nightOnly: true, base: '#7f9a7a' });
    props.box(tx - 0.09, F + 0.645, tz + 0.1, 0.15, 0.03, 0.2, '#7a2e25', 0.4);
    atlas.rug(X(-4.0), F + 0.008, Z(2.6), 1.7, 1.5, R.rug3, true);
  }
  // console under the east window
  {
    const u0 = IX - 0.42, u1 = IX - 0.02, v0 = 1.4, v1 = 2.6, h = 0.8;
    bx(m.woodDark, u0, F + h - 0.04, v0, u1, F + h, v1);
    for (const [uu, vv] of [[u0 + 0.04, v0 + 0.04], [u0 + 0.04, v1 - 0.04], [u1 - 0.04, v0 + 0.04], [u1 - 0.04, v1 - 0.04]]) bx(m.woodDark, uu - 0.03, F, vv - 0.03, uu + 0.03, F + h - 0.04, vv + 0.03);
    bx(m.woodDark, u0 + 0.02, F + 0.12, v0 + 0.05, u1 - 0.02, F + 0.15, v1 - 0.05);
    solid(u0, F, v0, u1, F + h, v1);
    props.cyl(X(5.15), F + h, Z(1.7), 0.07, 0.22, '#3e5a6e');
    for (let i = 0; i < 9; i++) props.ball(X(5.15 + (rnd() - 0.5) * 0.18), F + h + 0.3 + rnd() * 0.12, Z(1.7 + (rnd() - 0.5) * 0.18), 0.05, 0.05, 0.05, pick(['#b48bcf', '#d48fb0', '#efe6d0', '#8f7bc0']));
    props.cyl(X(5.12), F + h, Z(2.3), 0.13, 0.12, '#b08d5a');
    for (let i = 0; i < 3; i++) props.ball(X(5.12 + (i - 1) * 0.07), F + h + 0.14, Z(2.3 + (i % 2) * 0.05), 0.045, 0.045, 0.045, '#c8473a');
    picture(c, IX - 0.015, F + 1.62, 2.0, 0.62, 0.43, R.paint2, -Math.PI / 2);
    props.box(X(5.1), F + 0.16, Z(2.0), 0.3, 0.26, 0.45, '#9c7a52'); // a basket below
  }
  // plants in pots
  const plant = (u: number, v: number, s = 1) => {
    props.cyl(X(u), F, Z(v), 0.17 * s, 0.3 * s, '#a85c3a');
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.18 * s;
      props.ball(X(u + Math.cos(a) * d), F + (0.38 + rnd() * 0.5) * s, Z(v + Math.sin(a) * d), 0.13 * s, 0.17 * s, 0.13 * s, pick(['#4e7a3e', '#5f8a45', '#3f6a35']));
    }
    W.physics.addCylinder(X(u), Z(v), 0.2 * s, F, F + 0.8 * s);
  };
  plant(4.95, 3.45, 1.15);
  plant(-0.98, 3.5, 0.9);
  // a pair of boots by the door
  props.box(X(-0.8), F + 0.06, Z(3.72), 0.1, 0.12, 0.26, '#3b2a1e', 0.2);
  props.box(X(-0.66), F + 0.06, Z(3.7), 0.1, 0.12, 0.26, '#3b2a1e', -0.1);

  // =================================================================== KITCHEN
  {
    const cab = m.cabinet, top = m.woodLight;
    // north run with a farmhouse sink under the window
    const nv0 = -IZ, nv1 = -IZ + 0.58;
    bx(cab, 2.9, F + 0.1, nv0, 3.4, F + 0.86, nv1, 'nowalk');
    bx(cab, 4.1, F + 0.1, nv0, 5.4, F + 0.86, nv1, 'nowalk');
    bx(cab, 3.4, F + 0.1, nv0, 4.1, F + 0.62, nv1 - 0.02, 'nowalk');
    bx(m.black, 2.92, F, nv0, 5.4, F + 0.1, nv1 - 0.06);
    bx(top, 2.88, F + 0.86, nv0, 3.4, F + 0.91, nv1 + 0.04);
    bx(top, 4.1, F + 0.86, nv0, 5.4, F + 0.91, nv1 + 0.04);
    // sink: an open box
    const su0 = 3.4, su1 = 4.1;
    bx(m.trim, su0, F + 0.62, nv0, su1, F + 0.66, nv1 + 0.05);
    bx(m.trim, su0, F + 0.62, nv1, su1, F + 0.92, nv1 + 0.05);
    bx(m.trim, su0, F + 0.62, nv0, su1, F + 0.92, nv0 + 0.05);
    bx(m.trim, su0, F + 0.62, nv0, su0 + 0.04, F + 0.92, nv1 + 0.05);
    bx(m.trim, su1 - 0.04, F + 0.62, nv0, su1, F + 0.92, nv1 + 0.05);
    b.cyl(m.iron, X(3.75), F + 0.92, Z(nv0 + 0.06), 0.018, 0.3, { seg: 8 });
    b.box(m.iron, X(3.75), F + 1.2, Z(nv0 + 0.15), 0.03, 0.03, 0.2, { collide: false });
    // cabinet doors and knobs
    for (const [a0, a1] of [[2.95, 3.38], [4.14, 4.6], [4.64, 5.1]]) {
      bx(cab, a0, F + 0.14, nv1, a1, F + 0.82, nv1 + 0.015);
      props.ball(X(a1 - 0.05), F + 0.72, Z(nv1 + 0.03), 0.015, 0.015, 0.015, '#3a3a3a');
    }
    // east run
    const eu0 = IX - 0.58;
    bx(cab, eu0, F + 0.1, nv1, IX, F + 0.86, -1.85, 'nowalk');
    bx(m.black, eu0 + 0.06, F, nv1, IX, F + 0.1, -1.85);
    bx(top, eu0 - 0.04, F + 0.86, nv1 + 0.04, IX, F + 0.91, -1.82);
    for (const [a0, a1] of [[-3.22, -2.62], [-2.58, -1.9]]) {
      bx(cab, eu0 - 0.015, F + 0.14, a0, eu0, F + 0.82, a1);
      props.ball(X(eu0 - 0.03), F + 0.72, Z(a1 - 0.05), 0.015, 0.015, 0.015, '#3a3a3a');
    }
    // backsplash tile
    bx(m.tileWall, 2.88, F + 0.91, -IZ, 3.25, F + 1.5, -IZ + 0.012);
    bx(m.tileWall, 4.25, F + 0.91, -IZ, IX, F + 1.5, -IZ + 0.012);
    bx(m.tileWall, 3.25, F + 0.91, -IZ, 4.25, F + 1.07, -IZ + 0.012);
    bx(m.tileWall, IX - 0.012, F + 0.91, -IZ, IX, F + 1.5, -2.75);
    bx(m.tileWall, IX - 0.012, F + 0.91, -1.85, IX, F + 1.5, -1.0);
    bx(m.tileWall, IX - 0.012, F + 0.91, -2.75, IX, F + 1.07, -1.85);
    // a vintage enamel range
    const r0 = -1.78, r1 = -1.0;
    bx(m.trim, IX - 0.64, F + 0.08, r0, IX, F + 0.88, r1, 'nowalk');
    bx(m.black, IX - 0.62, F, r0 + 0.04, IX, F + 0.08, r1 - 0.04);
    bx(m.iron, IX - 0.64, F + 0.88, r0, IX, F + 0.92, r1);
    bx(m.trim, IX - 0.08, F + 0.92, r0, IX, F + 1.15, r1);
    bx(m.iron, IX - 0.655, F + 0.22, r0 + 0.08, IX - 0.64, F + 0.7, r1 - 0.08);
    bx(m.iron, IX - 0.68, F + 0.74, r0 + 0.1, IX - 0.66, F + 0.76, r1 - 0.1);
    for (const vv of [r0 + 0.2, r1 - 0.2]) for (const uu of [IX - 0.48, IX - 0.25]) props.cyl(X(uu), F + 0.92, Z(vv), 0.09, 0.008, '#151515');
    for (let i = 0; i < 4; i++) props.cyl(X(IX - 0.645), F + 0.82, Z(r0 + 0.15 + i * 0.16), 0.02, 0.02, '#e8e0cc', 0, 0, Math.PI / 2);
    // kettle and a cast iron pan
    props.cyl(X(IX - 0.25), F + 0.928, Z(r0 + 0.2), 0.1, 0.13, '#b5432f');
    props.cyl(X(IX - 0.25), F + 1.055, Z(r0 + 0.2), 0.03, 0.03, '#2a2a2a');
    props.cyl(X(IX - 0.48), F + 0.928, Z(r1 - 0.2), 0.13, 0.04, '#1f1f1f');
    // pantry cupboard
    bx(cab, IX - 0.56, F, -0.82, IX, F + 2.05, -0.08, 'nowalk');
    bx(cab, IX - 0.575, F + 0.08, -0.79, IX - 0.56, F + 1.98, -0.46);
    bx(cab, IX - 0.575, F + 0.08, -0.44, IX - 0.56, F + 1.98, -0.11);
    props.ball(X(IX - 0.59), F + 1.05, Z(-0.49), 0.015, 0.015, 0.015, '#3a3a3a');
    props.ball(X(IX - 0.59), F + 1.05, Z(-0.41), 0.015, 0.015, 0.015, '#3a3a3a');
    // open shelves beside the window, and a long shelf on the spine wall
    for (const y of [F + 1.5, F + 1.88]) {
      bx(top, 4.36, y, -IZ, IX, y + 0.03, -IZ + 0.24);
      for (const uu of [4.45, 5.25]) bx(m.iron, uu - 0.01, y - 0.12, -IZ, uu + 0.01, y, -IZ + 0.2);
    }
    const jarCols = ['#c98b3a', '#e2d6b5', '#9fb7a0', '#d9a441', '#b85c3c', '#efe6d0'];
    for (let i = 0; i < 6; i++) {
      const u = 4.48 + i * 0.15, col = pick(jarCols), h = 0.12 + rnd() * 0.08;
      props.cyl(X(u), F + 1.53, Z(-IZ + 0.12), 0.05, h, col);
      props.cyl(X(u), F + 1.53 + h, Z(-IZ + 0.12), 0.052, 0.02, pick(['#8a6a3a', '#f2ede2', '#3a3a3a']));
    }
    for (let i = 0; i < 6; i++) props.cyl(X(4.5 + i * 0.07), F + 1.91 + 0.11, Z(-IZ + 0.03), 0.11, 0.014, pick(['#f2ede2', '#e8eef0', '#d9e2dc']), 0, Math.PI / 2, 0);
    for (let i = 0; i < 3; i++) props.cyl(X(5.0 + i * 0.12), F + 1.91, Z(-IZ + 0.14), 0.05, 0.08, pick(['#3e5a6e', '#f2ede2']));
    bx(top, 1.05, F + 1.62, -0.3, 3.25, F + 1.65, -0.06);
    for (const uu of [1.2, 3.1]) bx(m.iron, uu - 0.01, F + 1.5, -0.25, uu + 0.01, F + 1.62, -0.06);
    for (let i = 0; i < 9; i++) props.cyl(X(1.2 + i * 0.09), F + 1.65 + 0.12, Z(-0.17), 0.12, 0.015, pick(['#f2ede2', '#e6eef2', '#2f4a64', '#f2ede2']), 0, Math.PI / 2, 0);
    for (let i = 0; i < 5; i++) {
      const col = pick(jarCols), h = 0.14 + rnd() * 0.1;
      props.cyl(X(2.15 + i * 0.2), F + 1.65, Z(-0.18), 0.06, h, col);
      props.cyl(X(2.15 + i * 0.2), F + 1.65 + h, Z(-0.18), 0.062, 0.02, '#8a6a3a');
    }
    // mugs on hooks under the shelf
    for (let i = 0; i < 5; i++) props.cyl(X(1.3 + i * 0.16), F + 1.46, Z(-0.12), 0.04, 0.09, pick(['#f2ede2', '#b5432f', '#3e5a6e', '#d9a441']));
    // things on the counters: bread board and loaf, a basket of eggs, crock of utensils
    props.box(X(5.0), F + 0.92, Z(-2.6), 0.32, 0.02, 0.24, '#a5733f');
    props.ball(X(5.0), F + 0.98, Z(-2.6), 0.13, 0.07, 0.08, '#c78a45');
    props.cyl(X(3.1), F + 0.91, Z(-3.65), 0.12, 0.08, '#9c7a52');
    for (let i = 0; i < 5; i++) props.ball(X(3.06 + (i % 3) * 0.05), F + 1.0, Z(-3.68 + Math.floor(i / 3) * 0.06), 0.03, 0.04, 0.03, '#efe2c8');
    props.cyl(X(5.15), F + 0.91, Z(-3.6), 0.07, 0.16, '#e8e0cc');
    for (let i = 0; i < 4; i++) props.cyl(X(5.15 + (rnd() - 0.5) * 0.05), F + 1.0, Z(-3.6 + (rnd() - 0.5) * 0.05), 0.008, 0.22, '#7a5232', 0, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3);
    props.box(X(4.6), F + 0.92, Z(-3.7), 0.05, 0.18, 0.05, '#f2ede2');
    // cafe curtains
    atlas.box(X(3.75), F + 1.36, Z(-IZ + 0.05), 0.92, 0.42, 0.01, R.gingham);
    b.cyl(m.iron, X(3.25), F + 1.58, Z(-IZ + 0.05), 0.008, 1.0, { seg: 6, rotZ: -Math.PI / 2 });
    atlas.box(X(IX - 0.05), F + 1.36, Z(-2.3), 0.01, 0.42, 0.88, R.gingham);
    atlas.rug(X(3.75), F + 0.008, Z(-2.95), 1.4, 0.55, R.runner);
  }
  // dining table, four chairs, a bowl of apples, the pendant
  {
    let top = F + 0.78;
    if (c.fu.has('dining_table')) {
      // the scanned table is big for a farmhouse kitchen: 0.75 in plan, 0.92 in height, long side along z
      const f = new Frame(X(2.2), F, Z(-1.8), Math.PI / 2);
      const sc: [number, number, number] = [0.75, 0.92, 0.75];
      model(c, 'dining_table', f, sc);
      const sz = c.fu.size('dining_table');
      top = F + 0.84 * sc[1];
      f.solid(sz.x * sc[0], top - F, sz.z * sc[2]);
    } else table(c, new Frame(X(2.2), F, Z(-1.8), 0), m.woodLight, 0.86, 1.32, 0.78, 0.075);
    for (const vv of [-2.2, -1.4]) {
      if (c.fu.has('dining_chair_02')) {
        for (const [uu, yaw] of [[1.45, -Math.PI / 2], [2.95, Math.PI / 2]]) {
          const f = new Frame(X(uu), F, Z(vv), yaw);
          model(c, 'dining_chair_02', f);
          f.solid(0.45, 0.95, 0.5);
        }
      } else {
        chair(c, new Frame(X(1.42), F, Z(vv), -Math.PI / 2), m.woodDark, m.rust);
        chair(c, new Frame(X(2.98), F, Z(vv), Math.PI / 2), m.woodDark, m.rust);
      }
    }
    props.cyl(X(2.2), top, Z(-1.65), 0.15, 0.06, '#e9dfc6');
    for (let i = 0; i < 6; i++) props.ball(X(2.2 + Math.cos(i * 1.1) * 0.08), top + 0.07 + (i > 3 ? 0.05 : 0), Z(-1.65 + Math.sin(i * 1.1) * 0.08), 0.045, 0.042, 0.045, i % 3 ? '#b5302a' : '#c9a33a');
    props.cyl(X(2.2), top, Z(-2.15), 0.06, 0.18, '#3e5a6e');
    for (let i = 0; i < 7; i++) props.ball(X(2.2 + (rnd() - 0.5) * 0.14), top + 0.22 + rnd() * 0.1, Z(-2.15 + (rnd() - 0.5) * 0.14), 0.04, 0.04, 0.04, pick(['#f2ede2', '#d9a441', '#efe6d0']));
    W.interact.add({
      pos: P3(2.2, top + 0.08, -1.65), radius: 0.22, range: 2.2, label: 'Take an apple',
      onUse: () => {
        W.hold(new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), M.paint('#b5302a', 0.45)), 'a crisp apple');
        W.toast('A crisp apple from the orchard');
      },
    });
    const py = F + 1.95;
    b.cyl(m.iron, X(2.2), py, Z(-1.8), 0.006, F + D.CEIL - py, { seg: 5 });
    const lamp = W.lamps.add(new THREE.Vector3(X(2.2), py - 0.05, Z(-1.8)), '#ffc98a', 3.0, 6.5, { on: true });
    shades.shade(lamp, X(2.2), py - 0.16, Z(-1.8), 0.24, 0.05, 0.18, 0.55);
    shades.bulb(lamp, X(2.2), py - 0.14, Z(-1.8), 0.045, 2.4);
    lampToggle(lamp, P3(2.2, py - 0.1, -1.8), 'the kitchen light');
  }
  // under shelf light over the counters at night
  W.lamps.add(P3(4.6, F + 1.45, -3.35), '#ffcf96', 1.6, 4.5, { nightOnly: true });
  // back door mat
  atlas.rug(X(1.61), F + 0.008, Z(-3.55), 0.9, 0.55, R.bathmat);

  // =================================================================== BEDROOM (downstairs)
  {
    const cu = -3.85, v0 = -IZ, len = 2.05, w = 1.46;
    const vc = v0 + len / 2;
    const fr = m.woodDark;
    bx(fr, cu - w / 2 - 0.02, F, v0, cu + w / 2 + 0.02, F + 1.15, v0 + 0.06);
    for (const s of [-1, 1]) bx(fr, cu + s * (w / 2 + 0.02) - 0.04, F, v0, cu + s * (w / 2 + 0.02) + 0.04, F + 1.22, v0 + 0.08);
    bx(fr, cu - w / 2 - 0.02, F, v0 + len - 0.06, cu + w / 2 + 0.02, F + 0.68, v0 + len);
    for (const s of [-1, 1]) bx(fr, cu + s * (w / 2 + 0.02) - 0.04, F, v0 + len - 0.08, cu + s * (w / 2 + 0.02) + 0.04, F + 0.75, v0 + len);
    for (const s of [-1, 1]) bx(fr, cu + s * w / 2 - 0.03, F + 0.2, v0 + 0.06, cu + s * w / 2 + 0.03, F + 0.34, v0 + len - 0.06);
    bx(m.linen, cu - w / 2 + 0.02, F + 0.32, v0 + 0.07, cu + w / 2 - 0.02, F + 0.54, v0 + len - 0.07);
    // quilt over the lower two thirds, hanging down the sides
    atlas.box(X(cu), F + 0.56, Z(vc + 0.25), w + 0.06, 0.05, 1.45, R.quilt1);
    for (const s of [-1, 1]) atlas.box(X(cu + s * (w / 2 + 0.035)), F + 0.42, Z(vc + 0.25), 0.02, 0.3, 1.45, R.quilt1);
    atlas.box(X(cu), F + 0.42, Z(vc + 0.25 + 0.735), w + 0.08, 0.3, 0.02, R.quilt1);
    for (const s of [-1, 1]) b.box(m.linen, X(cu + s * 0.35), F + 0.62, Z(v0 + 0.3), 0.6, 0.14, 0.36, { rotX: -0.25, collide: false });
    solid(cu - w / 2 - 0.05, F, v0, cu + w / 2 + 0.05, F + 0.65, v0 + len);
    bedRest(P3(cu, F + 0.6, vc), P3(cu + 0.1, F + 0.82, v0 + 0.55), Math.PI, P3(cu + w / 2 + 0.45, F, vc + 0.3));
    // nightstands
    const ns = (u: number) => {
      bx(fr, u - 0.23, F + 0.56, -IZ + 0.02, u + 0.23, F + 0.6, -IZ + 0.44);
      bx(fr, u - 0.21, F, -IZ + 0.04, u + 0.21, F + 0.56, -IZ + 0.42, 'nowalk');
      bx(m.woodLight, u - 0.18, F + 0.36, -IZ + 0.42, u + 0.18, F + 0.5, -IZ + 0.43);
    };
    let nsTop = F + 0.6;
    if (c.fu.has('ClassicNightstand_01')) {
      const sz = c.fu.size('ClassicNightstand_01');
      nsTop = F + sz.y;
      for (const u of [-4.93, -2.78]) {
        const f = new Frame(X(u), F, Z(-IZ + 0.01 + sz.z / 2), Math.PI);
        model(c, 'ClassicNightstand_01', f);
        f.solid(sz.x, sz.y, sz.z);
      }
    } else { ns(-4.92); ns(-2.78); }
    const bedLamp = tableLamp(c, X(-4.92), nsTop, Z(-IZ + 0.22), { base: '#efe6d0' });
    props.box(X(-2.8), nsTop + 0.015, Z(-3.68), 0.16, 0.03, 0.22, '#2f4a5e', 0.3);
    props.cyl(X(-2.66), nsTop, Z(-3.6), 0.035, 0.1, '#dfe8ea');
    props.cyl(X(-2.9), nsTop, Z(-3.75), 0.04, 0.12, '#b08d4a');
    picture(c, cu, F + 1.62, -IZ + 0.015, 0.5, 0.62, R.paint4, 0);
    void bedLamp;
    // dresser with a mirror
    let dTop = F + 0.86;
    if (c.fu.has('painted_wooden_cabinet')) {
      // the painted cabinet stands in as the dresser, against the east wall
      const sz = c.fu.size('painted_wooden_cabinet');
      const f = new Frame(X(-1.76 - 0.01 - sz.z / 2), F, Z(-1.15), Math.PI / 2);
      model(c, 'painted_wooden_cabinet', f);
      f.solid(sz.x, sz.y, sz.z);
      dTop = F + sz.y;
    } else {
      const du0 = -2.26, du1 = -1.76, dv0 = -1.6, dv1 = -0.6;
      bx(fr, du0, F + 0.06, dv0, du1, F + 0.86, dv1, 'nowalk');
      for (let k = 0; k < 3; k++) {
        bx(m.woodLight, du0 - 0.012, F + 0.12 + k * 0.25, dv0 + 0.04, du0, F + 0.33 + k * 0.25, dv1 - 0.04);
        props.ball(X(du0 - 0.03), F + 0.225 + k * 0.25, Z((dv0 + dv1) / 2), 0.018, 0.018, 0.018, '#b08d4a');
      }
      bx(fr, du0 + 0.15, F + 1.0, dv0 + 0.18, du0 + 0.19, F + 1.75, dv1 - 0.18);
      b.boxMinMax(MIRROR, X(du0 + 0.145), F + 1.05, Z(dv0 + 0.23), X(du0 + 0.15), F + 1.7, Z(dv1 - 0.23), { collide: false });
    }
    props.cyl(X(-2.05), dTop, Z(-1.45), 0.05, 0.14, '#6f8a7a');
    for (let i = 0; i < 5; i++) props.ball(X(-2.05 + (rnd() - 0.5) * 0.1), dTop + 0.19 + rnd() * 0.08, Z(-1.45 + (rnd() - 0.5) * 0.1), 0.035, 0.035, 0.035, pick(['#e8a0a8', '#efe6d0']));
    props.box(X(-2.05), dTop + 0.04, Z(-0.8), 0.16, 0.08, 0.12, '#7a2e25');
    atlas.rug(X(-3.7), F + 0.008, Z(-1.25), 1.7, 1.05, R.rug3, true);
  }

  // =================================================================== BATHROOM
  {
    const bu0 = -1.7 + D.TI / 2, bu1 = 0.9 - D.TI / 2;
    // tile wainscot with a cap
    const wy = F + 1.2;
    bx(m.tileWall, bu0, F, -IZ, bu1, wy, -IZ + 0.012);
    bx(m.tileWall, bu0, F, -IZ, bu0 + 0.012, wy, -0.06);
    bx(m.tileWall, bu0, F, -0.072, bu1, wy, -0.06);
    bx(m.tileWall, bu1 - 0.012, F, -IZ, bu1, wy, -1.16 - 0.1);
    bx(m.tileWall, bu1 - 0.012, F, -0.24 + 0.1, bu1, wy, -0.06);
    bx(m.trim, bu0, wy, -IZ, bu1, wy + 0.04, -IZ + 0.03);
    bx(m.trim, bu0, wy, -IZ, bu0 + 0.03, wy + 0.04, -0.06);
    bx(m.trim, bu0, wy, -0.09, bu1, wy + 0.04, -0.06);
    // clawfoot tub: a white shell painted dark outside, on four little feet
    const tc = new THREE.Vector3(X(-0.72), F, Z(-3.5));
    const shellGeo = (rx: number, rz: number, inner: number, h: number) => {
      const sh = new THREE.Shape();
      const rr = Math.min(rz, 0.33);
      const rect = (s: THREE.Shape | THREE.Path, hx: number, hz: number, r: number) => {
        s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r);
        s.lineTo(hx, hz - r); s.quadraticCurveTo(hx, hz, hx - r, hz); s.lineTo(-hx + r, hz);
        s.quadraticCurveTo(-hx, hz, -hx, hz - r); s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
      };
      rect(sh, rx, rz, rr);
      const hole = new THREE.Path();
      rect(hole, rx - inner, rz - inner, Math.max(0.05, rr - inner));
      sh.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 5 });
      g.rotateX(-Math.PI / 2);
      return g;
    };
    b.geo(m.trim, shellGeo(0.76, 0.35, 0.05, 0.42), { x: tc.x, y: F + 0.16, z: tc.z });
    b.geo(m.black, shellGeo(0.775, 0.365, 0.016, 0.38), { x: tc.x, y: F + 0.17, z: tc.z });
    b.geo(m.trim, shellGeo(0.79, 0.38, 0.07, 0.035), { x: tc.x, y: F + 0.56, z: tc.z });
    b.box(m.trim, tc.x, F + 0.2, tc.z, 1.46, 0.06, 0.62, { collide: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.ball(tc.x + sx * 0.58, F + 0.08, tc.z + sz * 0.22, 0.05, 0.08, 0.05, '#b08d4a');
    b.cyl(m.iron, tc.x - 0.68, F + 0.55, tc.z, 0.015, 0.25, { seg: 6 });
    b.box(m.iron, tc.x - 0.63, F + 0.79, tc.z, 0.12, 0.025, 0.025, { collide: false });
    W.physics.addBox(tc.x - 0.8, F, tc.z - 0.39, tc.x + 0.8, F + 0.6, tc.z + 0.39, { walk: false });
    // bath water you can run
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.01, 0.58), M.paint('#8fb9c2', 0.05, 0.1));
    water.position.set(tc.x, F + 0.47, tc.z);
    water.visible = false;
    W.scene.add(water);
    W.interact.add({
      pos: new THREE.Vector3(tc.x, F + 0.5, tc.z), radius: 0.55, range: 2.4,
      label: () => (water.visible ? 'Let the water out' : 'Run a bath'),
      onUse: () => {
        water.visible = !water.visible;
        W.audio.play('water_lap', { pos: water.position, volume: 0.6 });
        if (water.visible) W.toast('Warm water, a little lavender');
      },
    });
    // toilet against the west wall
    const tu = bu0, tv = -1.45;
    bx(m.trim, tu, F + 0.42, tv - 0.22, tu + 0.2, F + 0.8, tv + 0.22, 'nowalk');
    bx(m.trim, tu - 0.005, F + 0.8, tv - 0.24, tu + 0.22, F + 0.83, tv + 0.24);
    b.cyl(m.trim, X(tu + 0.42), F, Z(tv), 0.13, 0.32, { seg: 14, rTop: 0.18 });
    b.cyl(m.woodLight, X(tu + 0.42), F + 0.32, Z(tv), 0.2, 0.035, { seg: 16 });
    solid(tu, F, tv - 0.25, tu + 0.64, F + 0.8, tv + 0.25);
    // pedestal sink with a mirror and a sconce
    const sv = -2.35;
    b.cyl(m.trim, X(bu1 - 0.24), F, Z(sv), 0.08, 0.72, { seg: 10, rTop: 0.11 });
    bx(m.trim, bu1 - 0.48, F + 0.72, sv - 0.28, bu1, F + 0.88, sv + 0.28, 'nowalk');
    bx(m.black, bu1 - 0.42, F + 0.881, sv - 0.2, bu1 - 0.12, F + 0.884, sv + 0.2);
    b.cyl(m.iron, X(bu1 - 0.06), F + 0.88, Z(sv), 0.012, 0.15, { seg: 6 });
    b.box(m.iron, X(bu1 - 0.12), F + 1.02, Z(sv), 0.12, 0.02, 0.02, { collide: false });
    solid(bu1 - 0.5, F, sv - 0.3, bu1, F + 0.9, sv + 0.3);
    bx(m.woodDark, bu1 - 0.03, F + 1.25, sv - 0.3, bu1, F + 1.95, sv + 0.3);
    b.boxMinMax(MIRROR, X(bu1 - 0.035), F + 1.29, Z(sv - 0.26), X(bu1 - 0.03), F + 1.91, Z(sv + 0.26), { collide: false });
    const sconce = W.lamps.add(P3(bu1 - 0.18, F + 2.1, sv), '#ffd6a0', 2.0, 4.5, { nightOnly: true });
    shades.shade(sconce, X(bu1 - 0.14), F + 2.02, Z(sv), 0.09, 0.06, 0.14);
    bx(m.iron, bu1 - 0.1, F + 2.0, sv - 0.02, bu1, F + 2.03, sv + 0.02);
    props.ball(X(bu1 - 0.4), F + 0.9, Z(sv + 0.18), 0.04, 0.02, 0.03, '#e9c7a0');
    // towel rail, towel, bath mat, a little plant on the sill
    bx(m.woodDark, bu0, F + 1.0, -2.95, bu0 + 0.08, F + 1.03, -2.15);
    atlas.box(X(bu0 + 0.07), F + 0.78, Z(-2.55), 0.03, 0.46, 0.5, R.towel);
    atlas.rug(X(-0.72), F + 0.008, Z(-2.82), 0.85, 0.5, R.bathmat);
    props.cyl(X(-0.7), F + 1.3, Z(-IZ + 0.08), 0.05, 0.08, '#a85c3a');
    for (let i = 0; i < 5; i++) props.ball(X(-0.7 + (rnd() - 0.5) * 0.08), F + 1.42 + rnd() * 0.04, Z(-IZ + 0.08 + (rnd() - 0.5) * 0.06), 0.035, 0.03, 0.035, '#5f8a45');
    props.box(X(0.1), F + 0.62, Z(-3.2), 0.12, 0.04, 0.08, '#efe6d0');
  }

  // =================================================================== ATTIC BEDROOM
  {
    // iron bed with its head against the east gable, under the window
    const ir = m.iron;
    const hasBed = c.fu.has('old_bed_frame');
    const bsz = c.fu.size('old_bed_frame');
    const u1 = IX - 0.03, len = hasBed ? bsz.z : 2.03, w = hasBed ? bsz.x : 1.46, u0 = u1 - len, vc = 0;
    let my = A + 0.3; // mattress bottom
    if (hasBed) {
      model(c, 'old_bed_frame', new Frame(X((u0 + u1) / 2), A, Z(vc), -Math.PI / 2));
      my = A + 0.42; // on the frame's springs
    } else {
      for (const s of [-1, 1]) {
        bx(ir, u1 - 0.05, A, vc + s * (w / 2 + 0.01) - 0.025, u1, A + 1.0, vc + s * (w / 2 + 0.01) + 0.025);
        bx(ir, u0, A, vc + s * (w / 2 + 0.01) - 0.025, u0 + 0.05, A + 0.75, vc + s * (w / 2 + 0.01) + 0.025);
        bx(ir, u0, A + 0.24, vc + s * w / 2 - 0.02, u1, A + 0.3, vc + s * w / 2 + 0.02);
      }
      for (const [uu, top] of [[u1 - 0.025, 0.96], [u0 + 0.025, 0.72]] as [number, number][]) {
        bx(ir, uu - 0.015, A + top - 0.03, -w / 2, uu + 0.015, A + top, w / 2);
        bx(ir, uu - 0.015, A + 0.3, -w / 2, uu + 0.015, A + 0.33, w / 2);
        for (let k = 1; k < 8; k++) { const v = -w / 2 + (w * k) / 8; bx(ir, uu - 0.01, A + 0.33, v - 0.01, uu + 0.01, A + top - 0.03, v + 0.01); }
      }
    }
    const mw = w - 0.1, mt = 0.2; // mattress width / thickness
    bx(m.linen, u0 + 0.09, my, -mw / 2, u1 - 0.09, my + mt, mw / 2);
    const ql = len - 0.6; // quilt over the lower part, draped over the sides and the foot
    atlas.box(X(u0 + 0.08 + ql / 2), my + mt + 0.025, Z(vc), ql, 0.05, mw + 0.05, R.quilt2);
    for (const s of [-1, 1]) atlas.box(X(u0 + 0.08 + ql / 2), my + mt - 0.11, Z(vc + s * (mw / 2 + 0.035)), ql, 0.27, 0.02, R.quilt2);
    atlas.box(X(u0 + 0.075), my + mt - 0.11, Z(vc), 0.02, 0.27, mw + 0.08, R.quilt2);
    if (hasBed) b.box(m.linen, X(u1 - 0.3), my + mt + 0.08, Z(vc), 0.32, 0.13, mw - 0.14, { rotZ: 0.25, collide: false });
    else for (const s of [-1, 1]) b.box(m.linen, X(u1 - 0.32), my + mt + 0.08, Z(vc + s * 0.35), 0.34, 0.14, 0.6, { rotZ: 0.25, collide: false });
    solid(u0, A, -w / 2 - 0.03, u1, my + mt + 0.05, w / 2 + 0.03);
    bedRest(P3(u0 + 1.0, my + mt, vc), P3(u1 - 0.55, my + mt + 0.2, vc), Math.PI / 2, P3(u0 + 0.9, A, vc - w / 2 - 0.5));
    // nightstands either side of the bed head, and the bedside lamp
    const nsV = w / 2 + 0.33;
    let nsTop = A + 0.62;
    if (c.fu.has('painted_wooden_nightstand')) {
      const sz = c.fu.size('painted_wooden_nightstand');
      nsTop = A + sz.y;
      for (const s of [-1, 1]) {
        const f = new Frame(X(IX - 0.02 - sz.z / 2), A, Z(s * nsV), Math.PI / 2);
        model(c, 'painted_wooden_nightstand', f);
        f.solid(sz.x, sz.y, sz.z);
      }
    } else {
      for (const s of [-1, 1]) {
        const v = s * nsV;
        bx(m.woodLight, IX - 0.46, A, v - 0.22, IX - 0.02, A + 0.58, v + 0.22, 'nowalk');
        bx(m.woodLight, IX - 0.48, A + 0.58, v - 0.24, IX - 0.02, A + 0.62, v + 0.24);
      }
    }
    tableLamp(c, X(IX - 0.22), nsTop, Z(nsV), { base: '#9fb7a0' });
    props.box(X(IX - 0.25), nsTop + 0.015, Z(-nsV), 0.15, 0.03, 0.21, '#7a2e25', 0.2);
    props.cyl(X(IX - 0.13), nsTop, Z(-nsV + 0.08), 0.04, 0.08, '#f2ede2');
    // trunk at the foot of the bed
    const t0 = u0 - 0.55, t1 = u0 - 0.05, tw = Math.min(0.46, w / 2 + 0.02);
    bx(m.woodDark, t0, A, -tw, t1, A + 0.42, tw, 'nowalk');
    b.box(m.woodDark, X((t0 + t1) / 2), A + 0.42, Z(0), 0.5, 0.1, tw * 2, { collide: false });
    for (const v of [-tw * 0.65, tw * 0.65]) bx(ir, t0 - 0.006, A, v - 0.03, t1 + 0.006, A + 0.475, v + 0.03);
    props.box(X((t0 + t1) / 2), A + 0.49, Z(0.15), 0.36, 0.06, 0.4, '#c9a46a', 0.1);
    atlas.rug(X(3.85), A + 0.008, Z(0), 2.9, 2.6, R.rug2, true);
    // chest of drawers tucked under the north slope
    bx(m.woodLight, 3.2, A, -3.35, 4.3, A + 0.85, -2.9);
    for (let k = 0; k < 3; k++) {
      bx(m.woodDark, 3.25, A + 0.08 + k * 0.25, -2.9, 4.25, A + 0.28 + k * 0.25, -2.888);
      for (const uu of [3.5, 4.0]) props.ball(X(uu), A + 0.18 + k * 0.25, Z(-2.875), 0.016, 0.016, 0.016, '#3a3a3a');
    }
    props.cyl(X(3.45), A + 0.85, Z(-3.1), 0.06, 0.14, '#a85c3a');
    for (let i = 0; i < 6; i++) props.ball(X(3.45 + (rnd() - 0.5) * 0.12), A + 1.02 + rnd() * 0.06, Z(-3.1 + (rnd() - 0.5) * 0.1), 0.05, 0.04, 0.05, '#5f8a45');
    picture(c, 3.75, A + 1.18, -3.32, 0.36, 0.26, R.paint3, 0);
    props.box(X(4.05), A + 0.88, Z(-3.15), 0.2, 0.06, 0.15, '#5a3a24');
  }
  {
    // writing desk under the west window
    const u0 = -IX + 0.02, u1 = -IX + 0.62;
    bx(m.woodLight, u0, A + 0.72, -0.62, u1, A + 0.76, 0.62);
    for (const v of [-0.58, 0.58]) for (const u of [u0 + 0.04, u1 - 0.04]) bx(m.woodLight, u - 0.025, A, v - 0.025, u + 0.025, A + 0.72, v + 0.025);
    bx(m.woodLight, u0 + 0.03, A + 0.6, -0.56, u1 - 0.04, A + 0.72, -0.1);
    solid(u0, A, -0.62, u1, A + 0.76, 0.62);
    chair(c, new Frame(X(-4.42), A, Z(0.05), Math.PI / 2), m.woodDark);
    tableLamp(c, X(-5.18), A + 0.76, Z(-0.42), { on: false, base: '#3e5a6e' });
    props.box(X(-5.0), A + 0.765, Z(0.1), 0.24, 0.012, 0.32, '#f2ede2', 0.15);
    props.box(X(-4.98), A + 0.775, Z(0.12), 0.012, 0.003, 0.2, '#2a2a2a', 0.4);
    props.cyl(X(-5.2), A + 0.76, Z(0.42), 0.04, 0.09, '#b5432f');
    books(props, 'z', 0.2, 0.55, A + 0.76, -5.26, 0.18, 0.24);
  }
  {
    // reading corner: armchair, floor lamp, low bookcase under the south slope
    const yaw = 1.23;
    const f = new Frame(X(-3.85), A, Z(1.85), yaw);
    if (c.fu.has('ArmChair_01')) { model(c, 'ArmChair_01', f); f.solid(0.86, 1.0, 0.8); }
    else armchair(c, f, m.green, m.woodDark, 0.84);
    seat('Sit in the reading chair', f.p(0, 0.5, 0), f.p(0, 1.12, 0.06), yaw, f.p(0, 0, -0.75));
    floorLamp(c, -4.55, 2.4, A);
    bx(m.woodDark, -3.65, A, 3.31, -1.85, A + 0.8, 3.35);
    bx(m.woodDark, -3.65, A + 0.77, 2.92, -1.85, A + 0.8, 3.35);
    bx(m.woodDark, -3.65, A, 2.92, -1.85, A + 0.04, 3.35);
    for (const u of [-3.65, -1.88]) bx(m.woodDark, u, A, 2.92, u + 0.03, A + 0.8, 3.35);
    bx(m.woodDark, -3.62, A + 0.39, 2.94, -1.88, A + 0.41, 3.33);
    for (const y of [0.04, 0.41]) books(props, 'x', -3.6, -1.9, A + y, 3.12, 0.24, 0.3);
    props.cyl(X(-2.2), A + 0.8, Z(3.1), 0.09, 0.06, '#c9a46a');
    for (let i = 0; i < 3; i++) props.ball(X(-2.2 + (i - 1) * 0.06), A + 0.9, Z(3.1), 0.05, 0.05, 0.05, pick(['#b85c3c', '#7f9a7a', '#d9a441']));
    atlas.rug(X(-3.7), A + 0.008, Z(1.4), 2.2, 1.5, R.rug1);
  }
  // baskets and a guitar case tucked under the slopes
  props.cyl(X(-1.2), A, Z(-3.1), 0.22, 0.32, '#9c7a52');
  props.cyl(X(-0.7), A, Z(-3.15), 0.17, 0.26, '#b08d5a');
  props.box(X(0.8), A + 0.16, Z(-3.15), 0.5, 0.32, 0.4, '#a5733f', 0.2);
  props.box(X(1.4), A + 0.12, Z(3.15), 0.55, 0.24, 0.4, '#c9b48a', -0.1);
  // a soft fill under the ridge so the attic is not gloomy by day
  W.lamps.add(P3(0.6, A + 2.4, -1.2), '#ffd6a6', 1.3, 7, { on: true });

  return { fire, livingLamp };
}
