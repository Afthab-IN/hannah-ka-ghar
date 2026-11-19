import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { W } from '../../world';
import { Builder, wall, windowUnit } from '../kit';
import { M } from '../materials';
import { addIndoorVolume } from '../../shaderlib';
import { mulberry32 } from '../../noise';
import * as D from './dims';
import { Frame, type Atlas, type Props, type Shades } from './util';
import { R } from './atlas';
import type { HouseMats } from './mats';
import type { Furniture } from './furniture';

// The west wing (a sunroom with a flat roof that is the rooftop terrace, reached
// from the attic through the west gable) and the small balcony off the attic
// bedroom on the east gable.

const { X, Z, F, A, G, YB, T } = D;
interface Ctx { b: Builder; m: HouseMats; props: Props; atlas: Atlas; shades: Shades; fu: Furniture }
const P3 = (u: number, y: number, v: number) => new THREE.Vector3(X(u), y, Z(v));
const rnd = mulberry32(5150);

function seat(sitLabel: string, at: THREE.Vector3, eye: THREE.Vector3, yaw: number, exit: THREE.Vector3, label = 'Sitting', extra: { pitch?: number; yawRange?: number } = {}) {
  W.interact.add({ pos: at, radius: 0.45, range: 2.4, label: sitLabel, onUse: () => W.mount({ pose: () => ({ pos: eye, yaw }), exit, label, yawRange: extra.yawRange ?? 1.6, pitch: extra.pitch }) });
}

export function buildWing(c: Ctx) {
  const { b, m, props, atlas, shades } = c;
  // layout below was drawn against a west face at u -6.9; shift it with the house
  const du = -D.W2 - T / 2 + 6.9;
  const dv = D.WING_V - 3.6; // the wing also got deeper: push the south group south
  const Xw = (u: number) => X(u + du);
  const P3w = (u: number, y: number, v: number) => P3(u + du, y, v);
  const bx = (mat: THREE.Material, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, collide: boolean | 'nowalk' = false) =>
    b.boxMinMax(mat, X(Math.min(u0, u1)), Math.min(y0, y1), Z(Math.min(v0, v1)), X(Math.max(u0, u1)), Math.max(y0, y1), Z(Math.max(v0, v1)), { collide });
  // white railing with balusters and a collider you cannot climb or jump over
  const railing = (u0: number, v0: number, u1: number, v1: number, y: number, h = 1.0, posts = true) => {
    const alongX = Math.abs(v1 - v0) < 1e-3;
    const len = alongX ? Math.abs(u1 - u0) : Math.abs(v1 - v0);
    if (alongX) {
      bx(m.trim, u0, y + h - 0.06, v0 - 0.045, u1, y + h, v0 + 0.045);
      bx(m.trim, u0, y + 0.08, v0 - 0.03, u1, y + 0.14, v0 + 0.03);
    } else {
      bx(m.trim, u0 - 0.045, y + h - 0.06, v0, u0 + 0.045, y + h, v1);
      bx(m.trim, u0 - 0.03, y + 0.08, v0, u0 + 0.03, y + 0.14, v1);
    }
    const n = Math.max(1, Math.round(len / 0.115));
    for (let i = 1; i < n; i++) {
      const t = i / n, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      bx(m.trim, u - 0.019, y + 0.14, v - 0.019, u + 0.019, y + h - 0.06, v + 0.019);
    }
    if (posts) {
      const np = Math.max(1, Math.round(len / 1.3));
      for (let i = 0; i <= np; i++) {
        const t = i / np, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
        bx(m.trim, u - 0.055, y, v - 0.055, u + 0.055, y + h + 0.05, v + 0.055);
        bx(m.trim, u - 0.07, y + h + 0.05, v - 0.07, u + 0.07, y + h + 0.09, v + 0.07);
      }
    }
    const tu = alongX ? 0 : 0.07, tv = alongX ? 0.07 : 0;
    W.physics.addBox(X(Math.min(u0, u1) - tu), y - 0.3, Z(Math.min(v0, v1) - tv), X(Math.max(u0, u1) + tu), y + 1.4, Z(Math.max(v0, v1) + tv), { walk: false });
  };

  // =================================================================== SUNROOM (the wing's ground floor)
  const U0 = D.WING_U0, UE = -D.W2 - T / 2, WV = D.WING_V; // outer wall centre (west), house gable outer face, half depth
  const IU0 = U0 + T / 2, IV = WV - T / 2; // inner faces
  const top = A - 0.27; // wall top / ceiling
  const hW = top - YB;
  const hole = (cc: number, w: number, y0: number, y1: number, start: number) => ({ u0: cc - w / 2 - start, u1: cc + w / 2 - start, y0: y0 - YB, y1: y1 - YB });
  const WN = { w: 1.15, y0: F + 0.55, y1: F + 2.35 };
  const southWins = [U0 + 1.15, UE - 1.05], westWins = [-2.1, 0, 2.1], northWins = [(U0 + UE) / 2];
  bx(m.brick, U0 - T / 2 - 0.03, G - 0.3, -WV - T / 2 - 0.03, UE, F - 0.1, WV + T / 2 + 0.03, 'nowalk');
  bx(m.floor, IU0, F - 0.2, -IV, UE, F, IV, true);
  wall(b, { a: [X(U0 - T / 2), Z(WV)], b: [X(UE), Z(WV)], y: YB, h: hW, t: T, outer: m.siding, inner: m.plaster, outSide: -1, holes: southWins.map((u) => hole(u, WN.w, WN.y0, WN.y1, U0 - T / 2)) });
  wall(b, { a: [X(U0 - T / 2), Z(-WV)], b: [X(UE), Z(-WV)], y: YB, h: hW, t: T, outer: m.siding, inner: m.plaster, outSide: 1, holes: northWins.map((u) => hole(u, WN.w, WN.y0, WN.y1, U0 - T / 2)) });
  wall(b, { a: [X(U0), Z(-IV)], b: [X(U0), Z(IV)], y: YB, h: hW, t: T, outer: m.siding, inner: m.plaster, outSide: -1, holes: westWins.map((v) => hole(v, WN.w, WN.y0, WN.y1, -IV)) });
  const win = (u: number, v: number, n: [number, number]) => windowUnit(b, { x: X(u), y: (WN.y0 + WN.y1) / 2, z: Z(v), w: WN.w, h: WN.y1 - WN.y0, n, wallT: T, frame: m.trim, glass: m.glass, muntins: [3, 4], shutters: null });
  for (const u of southWins) win(u, WV, [0, 1]);
  for (const u of northWins) win(u, -WV, [0, -1]);
  for (const v of westWins) win(U0, v, [-1, 0]);
  // trim: water table, corner boards, and a wide fascia round the roof deck
  for (const sv of [-1, 1]) {
    const ov = sv * (WV + T / 2);
    bx(m.trim, U0 - T / 2 - 0.035, F - 0.17, ov, UE, F + 0.03, ov + sv * 0.035);
    bx(m.trim, U0 - T / 2 - 0.035, YB, ov, U0 - T / 2 + 0.2, top, ov + sv * 0.03);
    bx(m.trim, U0 - T / 2 - 0.035, YB, ov - sv * 0.2, U0 - T / 2, top, ov + sv * 0.03);
  }
  bx(m.trim, U0 - T / 2 - 0.035, F - 0.17, -WV - T / 2, U0 - T / 2, F + 0.03, WV + T / 2);
  // plaster over the old outside wall of the house, round the bedroom doorway
  const sd = D.SUN_DOOR_V;
  bx(m.plaster, UE - 0.012, F, -IV, UE, top, sd - 0.62);
  bx(m.plaster, UE - 0.012, F, sd + 0.62, UE, top, IV);
  bx(m.plaster, UE - 0.012, F + 2.24, sd - 0.62, UE, top, sd + 0.62);
  for (const [u0, v0, u1, v1] of [[IU0, IV - 0.02, UE, IV], [IU0, -IV, UE, -IV + 0.02], [IU0, -IV, IU0 + 0.02, IV]]) bx(m.trim, u0, F, v0, u1, F + 0.14, v1);
  // the roof: ceiling below, deck boards on top (the terrace floor), fascia round the edge
  bx(m.bead, U0 - T / 2, top, -WV - T / 2, UE, A - 0.05, WV + T / 2, true);
  bx(m.deck, U0 - T / 2, A - 0.05, -WV - T / 2, UE, A, WV + T / 2, true);
  bx(m.trim, U0 - T / 2 - 0.035, top - 0.08, -WV - T / 2 - 0.035, U0 - T / 2, A + 0.02, WV + T / 2 + 0.035);
  for (const sv of [-1, 1]) bx(m.trim, U0 - T / 2, top - 0.08, sv * (WV + T / 2), UE, A + 0.02, sv * (WV + T / 2 + 0.035));
  // furnishing: two armchairs looking out of the west windows, a table, a lamp, plants, a rug
  if (c.fu.has('ArmChair_01')) for (const v of [-0.85, 0.85]) {
    const f = new Frame(Xw(-9.25), F, Z(v), Math.PI / 2);
    c.fu.add('ArmChair_01', f.x, f.y, f.z, f.yaw);
    f.solid(0.86, 1.0, 0.8);
    seat('Sit in the armchair', f.p(0, 0.5, 0), f.p(0, 1.12, 0.06), Math.PI / 2, f.p(0, 0, -0.75), 'Sitting in the sunroom');
  }
  {
    const tx = Xw(-9.55), tz = Z(0);
    b.cyl(m.woodDark, tx, F, tz, 0.035, 0.55, { seg: 8 });
    b.cyl(m.woodDark, tx, F, tz, 0.15, 0.03, { seg: 14 });
    b.cyl(m.woodDark, tx, F + 0.55, tz, 0.24, 0.03, { seg: 16 });
    W.physics.addCylinder(tx, tz, 0.24, F, F + 0.6);
    props.cyl(tx - 0.08, F + 0.58, tz + 0.05, 0.04, 0.09, '#f2ede2');
    props.box(tx + 0.08, F + 0.595, tz - 0.06, 0.16, 0.03, 0.22, '#2f4a5e', 0.4);
    const lx = Xw(-10.25), lz = Z(1.9);
    b.cyl(m.iron, lx, F, lz, 0.15, 0.025, { seg: 14 });
    b.cyl(m.iron, lx, F, lz, 0.014, 1.4, { seg: 6 });
    const lamp = W.lamps.add(new THREE.Vector3(lx, F + 1.42, lz), '#ffc98a', 2.6, 6.5, { on: true });
    shades.shade(lamp, lx, F + 1.3, lz, 0.2, 0.15, 0.27);
    W.physics.addCylinder(lx, lz, 0.16, F, F + 1.6);
    W.interact.add({ pos: new THREE.Vector3(lx, F + 1.42, lz), radius: 0.28, range: 2.6, label: () => (lamp.on ? 'Turn off the lamp' : 'Turn on the lamp'), onUse: () => { lamp.on = !lamp.on; } });
  }
  atlas.rug(Xw(-9.0), F + 0.008, Z(0), 2.6, 2.2, R.rug1);
  const bigPot = (u: number, v: number, y0: number, s = 1) => {
    props.cyl(X(u), y0, Z(v), 0.2 * s, 0.34 * s, '#a85c3a');
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 0.2 * s;
      props.ball(X(u + Math.cos(a) * d), y0 + (0.42 + rnd() * 0.5) * s, Z(v + Math.sin(a) * d), 0.14 * s, 0.17 * s, 0.14 * s, ['#4e7a3e', '#5f8a45', '#3f6a35'][Math.floor(rnd() * 3)]);
    }
    W.physics.addCylinder(X(u), Z(v), 0.24 * s, y0, y0 + 0.9 * s);
  };
  bigPot(IU0 + 0.35, -IV + 0.35, F);
  bigPot(UE - 0.4, -IV + 0.35, F, 0.9);
  addIndoorVolume(new THREE.Vector3(X(IU0), F - 0.3, Z(-IV)), new THREE.Vector3(X(UE - 0.02), top - 0.02, Z(IV)));

  // =================================================================== ROOFTOP TERRACE
  const TY = A;
  const ru0 = U0 - T / 2 + 0.07, rv = WV + T / 2 - 0.07;
  railing(ru0, -rv, ru0, rv, TY);
  railing(ru0, rv, UE - 0.05, rv, TY);
  railing(ru0, -rv, UE - 0.05, -rv, TY);
  // keep heads clear of the main roof's rake where it comes down low at the ends
  for (const s of [-1, 1]) W.physics.addBox(X(UE - 0.5), TY, Z(s > 0 ? 2.8 : -rv), X(UE), TY + 2.5, Z(s > 0 ? rv : -2.8), { walk: false });
  // string lights: two iron poles at the west corners, strings to the gable and between the poles
  const lightLamps = [W.lamps.add(P3w(-9.4, TY + 2.0, 1.3), '#ffc887', 2.6, 6.5, { nightOnly: true }), W.lamps.add(P3w(-9.4, TY + 2.0, -1.5), '#ffc887', 2.6, 6.5, { nightOnly: true })];
  const poleH = 2.45;
  for (const s of [-1, 1]) {
    b.cyl(m.iron, X(ru0 + 0.12), TY, Z(s * (rv - 0.12)), 0.025, poleH, { seg: 6 });
    props.ball(X(ru0 + 0.12), TY + poleH, Z(s * (rv - 0.12)), 0.04, 0.04, 0.04, '#2a2a2a');
  }
  const bulbs: THREE.BufferGeometry[][] = [[], []];
  const wire = (p0: THREE.Vector3, p1: THREE.Vector3, sag: number, li: number) => {
    const n = Math.max(3, Math.round(p0.distanceTo(p1) / 0.42));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector3().lerpVectors(p0, p1, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i], q = pts[i + 1], d = new THREE.Vector3().subVectors(q, a);
      const len = d.length(), yaw = Math.atan2(-d.z, d.x), el = Math.asin(d.y / len);
      const mid = new THREE.Vector3().addVectors(a, q).multiplyScalar(0.5);
      b.box(m.iron, mid.x, mid.y, mid.z, len, 0.012, 0.012, { rotY: yaw, rotZ: el, collide: false });
      if (i > 0) bulbs[li].push(new THREE.SphereGeometry(0.035, 8, 6).translate(a.x, a.y - 0.05, a.z));
    }
  };
  const gH = TY + 2.5;
  const pW = (s: number) => P3(ru0 + 0.12, TY + poleH - 0.05, s * (rv - 0.12));
  wire(pW(-1), P3(UE - 0.05, gH, 1.2), 0.3, 0);
  wire(pW(1), P3(UE - 0.05, gH, -1.2), 0.3, 1);
  wire(pW(-1), pW(1), 0.35, 0);
  for (const s of [-1, 1]) bx(m.iron, UE - 0.08, gH - 0.02, s * 1.2 - 0.02, UE, gH + 0.02, s * 1.2 + 0.02);
  bulbs.forEach((list, i) => { if (list.length) shades.add(lightLamps[i], mergeGeometries(list, false)!, 1.1); });
  // lanterns on the deck
  for (const [u, v, li] of [[-10.35 + du, 2.95 + dv, 0], [-7.45 + du, -3.05 - dv, 1]] as [number, number, number][]) {
    bx(m.iron, u - 0.11, TY, v - 0.11, u + 0.11, TY + 0.04, v + 0.11);
    bx(m.iron, u - 0.11, TY + 0.4, v - 0.11, u + 0.11, TY + 0.44, v + 0.11);
    for (const [du, dv] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) bx(m.iron, u + du * 0.1 - 0.01, TY, v + dv * 0.1 - 0.01, u + du * 0.1 + 0.01, TY + 0.44, v + dv * 0.1 + 0.01);
    shades.add(lightLamps[li], new THREE.BoxGeometry(0.17, 0.33, 0.17).translate(X(u), TY + 0.22, Z(v)), 1.4);
  }
  // seating: a loveseat and two chairs round a low coffee table (south half)
  {
    const f = new Frame(Xw(-8.95), TY, Z(2.85 + dv), 0);
    const w = 1.5;
    f.box(b, m.woodLight, 0, 0.2, 0, w, 0.06, 0.72);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(b, m.woodLight, sx * (w / 2 - 0.05), 0.1, sz * 0.31, 0.06, 0.2, 0.06);
    for (const sx of [-1, 1]) { f.box(b, m.woodLight, sx * (w / 2 - 0.03), 0.42, 0, 0.06, 0.06, 0.72); f.box(b, m.woodLight, sx * (w / 2 - 0.03), 0.31, -0.3, 0.05, 0.2, 0.05); }
    f.box(b, m.woodLight, 0, 0.55, 0.34, w, 0.55, 0.05, -0.12);
    f.box(b, m.linen, 0, 0.3, -0.02, w - 0.14, 0.12, 0.64);
    f.box(b, m.linen, 0, 0.55, 0.26, w - 0.14, 0.38, 0.12, -0.18);
    const cp = (lx: number, col: string) => { const p = f.p(lx, 0.5, 0.17); props.ball(p.x, p.y, p.z, 0.16, 0.15, 0.05, col, 0, -0.3); };
    cp(-0.45, '#9a4e32'); cp(0.45, '#6f8a7a');
    f.solid(w, 0.85, 0.75);
    seat('Sit on the loveseat', f.p(0.3, 0.45, 0), f.p(0.3, 1.02, 0.05), 0, f.p(0.3, 0, -0.8), 'Sitting under the sky', { yawRange: 2.0 });
    // coffee table with a pot of coffee and two mugs
    const t = new Frame(Xw(-8.95), TY, Z(1.85 + dv), 0);
    t.box(b, m.woodDark, 0, 0.4, 0, 0.9, 0.04, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.box(b, m.woodDark, sx * 0.39, 0.19, sz * 0.19, 0.04, 0.38, 0.04);
    t.box(b, m.woodDark, 0, 0.12, 0, 0.82, 0.02, 0.42);
    t.solid(0.9, 0.42, 0.5);
    const tt = TY + 0.42;
    props.cyl(Xw(-9.2), tt, Z(1.85 + dv), 0.075, 0.2, '#2f3a40');
    props.cyl(Xw(-9.2), tt + 0.2, Z(1.85 + dv), 0.04, 0.04, '#2a2a2a');
    props.box(Xw(-9.12), tt + 0.17, Z(1.85 + dv), 0.06, 0.025, 0.025, '#2f3a40', 0, 0, -0.5);
    for (const [u, v] of [[-8.85 + du, 1.75 + dv], [-8.7 + du, 1.95 + dv]]) { props.cyl(X(u), tt, Z(v), 0.04, 0.09, '#f2ede2'); props.cyl(X(u), tt + 0.075, Z(v), 0.034, 0.005, '#4a2e1c'); }
    props.box(Xw(-8.65), tt + 0.012, Z(1.72 + dv), 0.15, 0.025, 0.21, '#7a2e25', 0.3);
    W.interact.add({
      pos: P3w(-9.2, tt + 0.1, 1.85 + dv), radius: 0.2, range: 2.2, label: 'Pour a cup of coffee',
      onUse: () => {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 12), M.paint('#f2ede2', 0.4));
        W.hold(mug, 'a cup of coffee');
        W.toast('Fresh coffee, still warm');
      },
    });
    // two cushioned chairs either side of the table
    for (const [u, yaw] of [[-10.1 + du, -Math.PI / 2], [-7.8 + du, Math.PI / 2]] as [number, number][]) {
      const cf = new Frame(X(u), TY, Z(1.85 + dv), yaw);
      cf.box(b, m.woodLight, 0, 0.4, 0, 0.56, 0.05, 0.54);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cf.box(b, m.woodLight, sx * 0.24, 0.2, sz * 0.23, 0.05, 0.4, 0.05);
      for (const sx of [-1, 1]) cf.box(b, m.woodLight, sx * 0.27, 0.62, 0, 0.05, 0.04, 0.56);
      cf.box(b, m.woodLight, 0, 0.72, 0.27, 0.56, 0.6, 0.04, -0.15);
      cf.box(b, m.linen, 0, 0.47, -0.01, 0.48, 0.08, 0.48);
      cf.box(b, m.linen, 0, 0.72, 0.21, 0.46, 0.42, 0.07, -0.18);
      cf.solid(0.6, 0.9, 0.6);
      seat('Sit in the chair', cf.p(0, 0.45, 0), cf.p(0, 1.08, 0.05), yaw, cf.p(0, 0, -0.75), 'Sitting under the sky', { yawRange: 2.0 });
    }
  }
  // two loungers for lying back under the stars (north half), a blanket on one
  for (const [v, blanket] of [[-1.85, true], [-2.85, false]] as [number, boolean][]) {
    const u0 = -10.55 + du, u1 = -8.6 + du, w = 0.72, y = TY;
    bx(m.woodLight, u0, y + 0.22, v - w / 2, u1, y + 0.27, v + w / 2);
    for (const uu of [u0 + 0.06, u1 - 0.06]) for (const s of [-1, 1]) bx(m.woodLight, uu - 0.03, y, v + s * (w / 2 - 0.05) - 0.03, uu + 0.03, y + 0.22, v + s * (w / 2 - 0.05) + 0.03);
    bx(m.linen, u0 + 0.04, y + 0.27, v - w / 2 + 0.04, u1 - 0.55, y + 0.34, v + w / 2 - 0.04);
    // raised back rest at the east end
    b.box(m.woodLight, X(u1 - 0.3), y + 0.48, Z(v), 0.66, 0.05, w, { rotZ: 0.75, collide: false });
    b.box(m.linen, X(u1 - 0.33), y + 0.53, Z(v), 0.62, 0.07, w - 0.08, { rotZ: 0.75, collide: false });
    props.ball(X(u1 - 0.18), y + 0.78, Z(v), 0.08, 0.1, 0.24, '#f2ede2', 0, 0, 0.75);
    if (blanket) atlas.box(X(u0 + 0.55), y + 0.36, Z(v), 0.8, 0.04, w + 0.04, R.quilt2);
    W.physics.addBox(X(u0), y, Z(v - w / 2), X(u1), y + 0.55, Z(v + w / 2), { walk: false });
    const eye = P3(u1 - 0.42, y + 0.68, v);
    seat('Lie back and watch the stars', P3((u0 + u1) / 2, y + 0.4, v), eye, Math.PI / 2, P3((u0 + u1) / 2, y, v > -2.3 ? v + 0.7 : v - 0.5), 'Watching the sky', { pitch: 1.1, yawRange: 2.4 });
  }
  // potted plants round the edges
  bigPot(ru0 + 0.35, rv - 0.4, TY, 0.9);
  bigPot(UE - 0.45, rv - 0.4, TY, 1.0);
  bigPot(ru0 + 0.35, -rv + 0.4, TY, 0.85);
  for (const [u, v] of [[-7.4 + du, 0.95], [-7.4 + du, -0.95]]) {
    props.cyl(X(u), TY, Z(v), 0.14, 0.24, '#b8664a');
    for (let i = 0; i < 7; i++) props.ball(X(u + (rnd() - 0.5) * 0.2), TY + 0.3 + rnd() * 0.15, Z(v + (rnd() - 0.5) * 0.2), 0.07, 0.06, 0.07, ['#e8a0a8', '#f2c230', '#5f8a45', '#8e5cc4'][i % 4]);
    W.physics.addCylinder(X(u), Z(v), 0.16, TY, TY + 0.45);
  }

  // =================================================================== BALCONY (east gable, attic bedroom)
  {
    const by = D.BAL_Y, u0 = D.W2 + T / 2, u1 = u0 + D.BAL_D, v0 = D.BAL_V0, v1 = D.BAL_V1;
    bx(m.deck, u0, by - 0.12, v0, u1, by, v1, true);
    bx(m.trim, u1, by - 0.2, v0 - 0.03, u1 + 0.035, by + 0.01, v1 + 0.03);
    for (const v of [v0, v1]) bx(m.trim, u0, by - 0.2, v - 0.03, u1, by + 0.01, v + 0.03);
    // short carved brackets under the outer corners, standing on the porch roof
    for (const v of [v0 + 0.1, v1 - 0.1]) {
      const roofY = D.RT - D.RS * (u1 - 0.25 - (D.W2 + 0.1));
      bx(m.trim, u1 - 0.32, roofY - 0.02, v - 0.06, u1 - 0.18, by - 0.12, v + 0.06);
    }
    railing(u1 - 0.05, v0 + 0.05, u1 - 0.05, v1 - 0.05, by, 0.98);
    railing(u0 + 0.02, v0 + 0.05, u1 - 0.05, v0 + 0.05, by, 0.98, false);
    railing(u0 + 0.02, v1 - 0.05, u1 - 0.05, v1 - 0.05, by, 0.98, false);
    // keep heads clear of the main roof's rake board above the south end
    W.physics.addBox(X(u0), by, Z(v1 - 0.25), X(u0 + 0.5), by + 2.5, Z(v1), { walk: false });
    // bistro table and two chairs
    const tu = u0 + 0.92, tv = 1.75;
    b.cyl(m.iron, X(tu), by, Z(tv), 0.03, 0.7, { seg: 8 });
    b.cyl(m.iron, X(tu), by, Z(tv), 0.18, 0.02, { seg: 12 });
    b.cyl(m.woodLight, X(tu), by + 0.7, Z(tv), 0.3, 0.03, { seg: 18 });
    W.physics.addCylinder(X(tu), Z(tv), 0.3, by, by + 0.75);
    props.cyl(X(tu - 0.08), by + 0.73, Z(tv + 0.06), 0.04, 0.09, '#f2ede2');
    props.cyl(X(tu + 0.1), by + 0.73, Z(tv - 0.05), 0.045, 0.12, '#cfe0e6');
    for (let i = 0; i < 4; i++) props.ball(X(tu + 0.1 + (rnd() - 0.5) * 0.06), by + 0.9 + rnd() * 0.05, Z(tv - 0.05 + (rnd() - 0.5) * 0.06), 0.03, 0.03, 0.03, ['#f2c230', '#efe6d0'][i % 2]);
    for (const [cv, yaw] of [[tv - 0.62, Math.PI], [tv + 0.62, 0]] as [number, number][]) {
      const f = new Frame(X(tu), by, Z(cv), yaw);
      f.box(b, m.iron, 0, 0.45, 0, 0.42, 0.03, 0.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(b, m.iron, sx * 0.18, 0.225, sz * 0.17, 0.025, 0.45, 0.025);
      for (const sx of [-1, 1]) f.box(b, m.iron, sx * 0.18, 0.7, 0.18, 0.025, 0.5, 0.025, -0.08);
      f.box(b, m.iron, 0, 0.88, 0.2, 0.4, 0.1, 0.02, -0.08);
      f.box(b, m.linen, 0, 0.48, 0, 0.38, 0.04, 0.36);
      f.solid(0.44, 0.9, 0.42);
      seat('Sit at the bistro table', f.p(0, 0.45, 0), f.p(0, 1.1, 0.04), yaw, P3(u0 + 0.35, by, D.BAL_DOOR_V), 'Sitting on the balcony', { yawRange: 2.0 });
    }
    // a hanging fern from a bracket on the wall, and a lantern by the door
    const hu = u0 + 0.3, hv = v0 + 0.3;
    bx(m.iron, u0, by + 2.05, hv - 0.015, hu + 0.03, by + 2.08, hv + 0.015);
    b.cyl(m.iron, X(hu), by + 1.7, Z(hv), 0.004, 0.36, { seg: 4 });
    props.cyl(X(hu), by + 1.5, Z(hv), 0.13, 0.2, '#b8664a');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      props.ball(X(hu + Math.sin(a) * 0.14), by + 1.62 - (i % 3) * 0.08, Z(hv + Math.cos(a) * 0.14), 0.04, 0.025, 0.2, i % 2 ? '#4f7a3a' : '#5e8a44', a, 0.9);
    }
    const lv = D.BAL_DOOR_V + 0.75, ly = by + 1.85;
    bx(m.iron, u0, ly - 0.18, lv - 0.05, u0 + 0.03, ly + 0.14, lv + 0.05);
    bx(m.iron, u0, ly + 0.11, lv - 0.1, u0 + 0.2, ly + 0.15, lv + 0.1);
    const lamp = W.lamps.add(P3(u0 + 0.14, ly, lv), '#ffc27a', 2.2, 5.5, { nightOnly: true });
    shades.add(lamp, new THREE.BoxGeometry(0.13, 0.2, 0.13).translate(X(u0 + 0.12), ly, Z(lv)), 1.3);
  }
}
