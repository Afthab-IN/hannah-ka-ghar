import * as THREE from 'three';
import type { BuildCtx } from '../../scene';
import { W } from '../../world';
import { M } from '../materials';
import { Builder, wall, windowUnit } from '../kit';
import { BARN, PADDOCK } from '../../world/layout';
import { heightAt, padHeightAt } from '../../world/terrain';
import { addIndoorVolume } from '../../shaderlib';
import {
  VBuilder, Atlas, V, rng, mat4, beam, paintBoard, fitText, SERIF_FONT, hayMat, dirtStrawMat, vcolMat, vglowMat, castOnly,
} from './util';

// The big red barn (gambrel roof, sliding doors, stalls, tack, hay, a loft),
// the yard round it (tractor, hay wagon, round bales, wheelbarrow, feed bin)
// and the white three-rail paddock fence with a gate.

const X0 = BARN.x - BARN.w / 2, X1 = BARN.x + BARN.w / 2; // 33, 47
const Z0 = BARN.z - BARN.d / 2, Z1 = BARN.z + BARN.d / 2; // -71, -53
const CX = BARN.x;
const T = 0.2, HT = T / 2;
const H = 4.2; // wall plate
const BRX = 4.5, BRY = 7.0, RY = 8.9; // gambrel break (from centre) and heights above the floor
const IX0 = X0 + HT, IX1 = X1 - HT, IZ0 = Z0 + HT, IZ1 = Z1 - HT;
const DOOR = { x0: CX - 2.8, x1: CX + 2.8, h: 3.55 };
const LOFT_Z = -57.6; // loft over the front, from here to the front wall
const STALL_X = 36.5; // stall fronts (stalls along the west wall)
const STALLS = [-70.9, -67.6, -64.3, -61.0, -57.7];
const BENTS = [-67.6, -64.3, -61.0];

const at = (x: number, y: number, z: number, yaw = 0) => mat4({ x, y, z }, { x: 0, y: yaw, z: 0 });

export function buildBarn(_ctx: BuildCtx) {
  const G = padHeightAt(BARN.x, BARN.z);
  const F = G + 0.18;
  const R = rng(777);

  const red = M.boards('#8f2b21', 0.32);
  const inner = M.boards('#7b6047', 0.28);
  const trim = M.trim('#f2efe7');
  const roof = M.roofMetal('#80878d', 'z', 0.5);
  const stone = M.stone('#8d877d');
  const dirt = dirtStrawMat();
  const glass = M.glass(0.5);
  const hay = hayMat();
  const timber = M.wood('#6a4a31', 0.35);

  const b = new Builder('barn');
  const ip = new VBuilder('barn-props-in'); // interior props (no shadows)
  const yp = new VBuilder('barn-yard'); // yard props (cast)
  const mp = new VBuilder('barn-metal'); // galvanised bits
  const gl = new VBuilder('barn-glow');
  const atlas = new Atlas(1024, 512);

  // =========================================================================
  // Foundation, floor, walls
  // =========================================================================
  const PB = 0.15;
  b.boxMinMax(stone, X0 - PB, G - 0.4, Z0 - PB, X1 + PB, F, Z0 + PB);
  b.boxMinMax(stone, X0 - PB, G - 0.4, Z1 - PB, DOOR.x0, F, Z1 + PB);
  b.boxMinMax(stone, DOOR.x1, G - 0.4, Z1 - PB, X1 + PB, F, Z1 + PB);
  b.boxMinMax(stone, X0 - PB, G - 0.4, Z0 + PB, X0 + PB, F, Z1 - PB);
  b.boxMinMax(stone, X1 - PB, G - 0.4, Z0 + PB, X1 + PB, F, Z1 - PB);
  b.boxMinMax(dirt, X0 + PB, G - 0.4, Z0 + PB, X1 - PB, F, Z1 - PB);
  b.boxMinMax(dirt, DOOR.x0, G - 0.4, Z1 - PB, DOOR.x1, F, Z1 + PB);
  // packed earth apron in front of the doors (a half step)
  b.boxMinMax(dirt, DOOR.x0 - 0.6, G - 0.4, Z1 + PB, DOOR.x1 + 0.6, G + 0.09, Z1 + 2.2);

  const gable: [number, number][] = [[0, 0], [14, 0], [14, H], [7 + BRX, BRY], [7, RY], [7 - BRX, BRY], [0, H]];
  wall(b, { a: [X0, Z1], b: [X1, Z1], y: F, outline: gable, outer: red, inner, outSide: -1, t: T, holes: [{ u0: DOOR.x0 - X0, u1: DOOR.x1 - X0, y0: 0, y1: DOOR.h }] });
  wall(b, { a: [X0, Z0], b: [X1, Z0], y: F, outline: gable, outer: red, inner, outSide: 1, t: T });
  const westWin = [-69.25, -65.95, -62.65, -59.35];
  const eastWin = [-68.4, -64.4, -60.4];
  wall(b, {
    a: [X0, Z0 - HT], b: [X0, Z1 + HT], y: F, h: H, outer: red, inner, outSide: -1, t: T,
    holes: westWin.map((z) => ({ u0: z - (Z0 - HT) - 0.45, u1: z - (Z0 - HT) + 0.45, y0: 2.0, y1: 2.9 })),
  });
  wall(b, {
    a: [X1, Z0 - HT], b: [X1, Z1 + HT], y: F, h: H, outer: red, inner, outSide: 1, t: T,
    holes: eastWin.map((z) => ({ u0: z - (Z0 - HT) - 0.5, u1: z - (Z0 - HT) + 0.5, y0: 1.9, y1: 2.9 })),
  });
  for (const z of westWin) windowUnit(b, { x: X0, y: F + 2.45, z, w: 0.9, h: 0.9, n: [-1, 0], wallT: T, frame: trim, glass, muntins: [2, 2] });
  for (const z of eastWin) windowUnit(b, { x: X1, y: F + 2.4, z, w: 1.0, h: 1.0, n: [1, 0], wallT: T, frame: trim, glass, muntins: [2, 2] });
  // corner boards + door surround + eave trim boards
  for (const [cx, cz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) b.box(trim, cx, F + H / 2, cz, 0.3, H, 0.3, { collide: false });
  b.box(trim, CX, F + DOOR.h + 0.08, Z1 + HT + 0.02, DOOR.x1 - DOOR.x0 + 0.36, 0.16, 0.05, { collide: false });
  for (const x of [DOOR.x0 - 0.09, DOOR.x1 + 0.09]) b.box(trim, x, F + DOOR.h / 2, Z1 + HT + 0.02, 0.18, DOOR.h, 0.05, { collide: false });
  // white rake trim along the gambrel at both gables
  for (const [z, s] of [[Z1 + HT + 0.02, 1], [Z0 - HT - 0.02, -1]] as const) {
    const pts = [[X0 - 0.06, H], [CX - BRX, BRY], [CX, RY], [CX + BRX, BRY], [X1 + 0.06, H]];
    for (let i = 0; i < pts.length - 1; i++) beam(b, trim, V(pts[i][0], F + pts[i][1] - 0.11, z + s * 0.01), V(pts[i + 1][0], F + pts[i + 1][1] - 0.11, z + s * 0.01), 0.06, 0.22);
    b.box(trim, CX, F + H - 0.05, z, X1 - X0 + 0.1, 0.1, 0.05, { collide: false }); // belt line at the plate
  }
  // hay loft door (front gable) and a matching one at the back
  for (const [z, s] of [[Z1 + HT, 1], [Z0 - HT, -1]] as const) {
    const y0 = F + 4.55, y1 = F + 6.65, x0 = CX - 1.1, x1 = CX + 1.1;
    b.boxMinMax(red, x0, y0, z, x1, y1, z + s * 0.05, { collide: false });
    const zf = z + s * 0.07;
    b.box(trim, CX, y0 + 0.06, zf, 2.36, 0.12, 0.04, { collide: false });
    b.box(trim, CX, y1 - 0.06, zf, 2.36, 0.12, 0.04, { collide: false });
    for (const x of [x0 + 0.06, x1 - 0.06, CX]) b.box(trim, x, (y0 + y1) / 2, zf, 0.12, y1 - y0, 0.04, { collide: false });
    for (const [xa, xb] of [[x0 + 0.1, CX - 0.06], [CX + 0.06, x1 - 0.1]]) {
      beam(b, trim, V(xa, y0 + 0.12, zf), V(xb, y1 - 0.12, zf), 0.04, 0.1);
      beam(b, trim, V(xa, y1 - 0.12, zf), V(xb, y0 + 0.12, zf), 0.04, 0.1);
    }
  }
  // farm name board above the hay door
  {
    const r = atlas.region(640, 120, (g, w, h) => {
      paintBoard(g, w, h, '#f3efe5', '', 21);
      g.fillStyle = '#8f2b21'; g.textAlign = 'center';
      const word = 'HANNAH KA GHAR', sp = 9;
      let fs = 66, tw = 0;
      for (;;) {
        g.font = `bold ${fs}px ${SERIF_FONT}`;
        tw = 0; for (const ch of word) tw += g.measureText(ch).width + sp; tw -= sp;
        if (tw <= w - 50 || fs < 20) break;
        fs -= 2;
      }
      let x = w / 2 - tw / 2; g.textAlign = 'left';
      for (const ch of word) { g.fillText(ch, x, 60 + fs * 0.36); x += g.measureText(ch).width + sp; }
    });
    const sy = F + 7.18;
    atlas.plane(r, 3.2, 0.6, at(CX, sy, Z1 + HT + 0.071));
    b.box(trim, CX, sy, Z1 + HT + 0.035, 3.32, 0.72, 0.07, { collide: false });
  }

  // =========================================================================
  // Gambrel roof (ridge along z)
  // =========================================================================
  {
    const OVG = 0.45, OVE = 0.55, t = 0.12;
    const zA = Z0 - OVG, zB = Z1 + OVG, L = zB - zA, zc = (zA + zB) / 2;
    const slab = (mat: THREE.Material, p: [number, number], q: [number, number], th: number, off = 0, ext0 = 0, ext1 = 0, len = L) => {
      // slab whose underside runs from p to q (x, y), thickness th on the outer side, extended along its slope
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
      const ux = dx / l, uy = dy / l;
      let nx = -uy, ny = ux; if (ny < 0) { nx = -nx; ny = -ny; }
      const p0 = [p[0] - ux * ext0, p[1] - uy * ext0], p1 = [q[0] + ux * ext1, q[1] + uy * ext1];
      const cx = (p0[0] + p1[0]) / 2 + nx * (th / 2 + off), cy = (p0[1] + p1[1]) / 2 + ny * (th / 2 + off);
      b.box(mat, cx, F + cy, zc, l + ext0 + ext1, th, len, { rotZ: Math.atan2(dy, dx), collide: false });
    };
    for (const s of [-1, 1]) {
      const E: [number, number] = [CX + s * 7, H], B: [number, number] = [CX + s * BRX, BRY], Rr: [number, number] = [CX, RY];
      slab(roof, E, B, t, 0, OVE, 0.045);
      slab(roof, B, Rr, t, 0, 0.045, 0.02);
      // inner board lining just under the metal
      slab(inner, E, B, 0.03, -0.03, 0, 0, Z1 - Z0);
      slab(inner, B, Rr, 0.03, -0.03, 0, 0, Z1 - Z0);
      // flashing along the break, white fascia at the eave
      b.box(roof, CX + s * (BRX + 0.04), F + BRY + 0.14, zc, 0.22, 0.05, L + 0.02, { collide: false });
      const ex = CX + s * (7 + OVE * Math.cos(Math.atan2(2.8, 2.5))), ey = H - OVE * Math.sin(Math.atan2(2.8, 2.5));
      b.box(trim, ex + s * 0.03, F + ey + 0.02, zc, 0.05, 0.24, L + 0.04, { collide: false });
    }
    b.box(roof, CX, F + RY + t + 0.03, zc, 0.36, 0.07, L + 0.04, { collide: false });
    // rafters (gambrel trusses) inside, with collar ties at the break
    for (let z = Z0 + 0.6; z < Z1 - 0.3; z += 1.65) {
      for (const s of [-1, 1]) {
        beam(b, timber, V(CX + s * (7 - 0.1), F + H - 0.1, z), V(CX + s * BRX, F + BRY - 0.12, z), 0.09, 0.2);
        beam(b, timber, V(CX + s * BRX, F + BRY - 0.12, z), V(CX, F + RY - 0.12, z), 0.09, 0.2);
      }
      b.box(timber, CX, F + BRY - 0.2, z, BRX * 2, 0.16, 0.08, { collide: false });
    }
  }

  // cupola with louvres and a weathervane on the ridge
  const vane = new THREE.Group();
  {
    const cz = BARN.z, cy0 = F + RY - 0.35, s = 1.5, hb = 1.15;
    b.box(red, CX, cy0 + 0.35, cz, s, 0.7, s, { collide: false });
    b.box(trim, CX, cy0 + 0.72 + hb / 2, cz, s - 0.1, hb, s - 0.1, { collide: false });
    for (let i = 0; i < 6; i++) {
      const y = cy0 + 0.82 + i * 0.16;
      yp.box('#2b2a28', CX, y, cz, s - 0.04, 0.025, s - 0.3);
      yp.box('#2b2a28', CX, y, cz, s - 0.3, 0.025, s - 0.04);
    }
    const top = cy0 + 0.72 + hb;
    b.box(trim, CX, top + 0.04, cz, s + 0.1, 0.08, s + 0.1, { collide: false });
    const cap = new THREE.ConeGeometry(s * 0.82, 0.75, 4, 1);
    cap.rotateY(Math.PI / 4);
    cap.translate(0, 0.375, 0);
    b.add(roof, cap, at(CX, top + 0.08, cz));
    // vane: rod, compass arms (static) + turning arrow and rooster
    const iron = '#26272a';
    yp.rod(iron, V(CX, top + 0.8, cz), V(CX, top + 2.1, cz), 0.018);
    yp.add(new THREE.SphereGeometry(0.06, 8, 6), '#b8913f', at(CX, top + 0.85, cz));
    yp.rod(iron, V(CX - 0.42, top + 1.25, cz), V(CX + 0.42, top + 1.25, cz), 0.012);
    yp.rod(iron, V(CX, top + 1.25, cz - 0.42), V(CX, top + 1.25, cz + 0.42), 0.012);
    const letter = (ch: string, x: number, z: number) => {
      // tiny N E S W plates
      yp.box(iron, x, top + 1.25, z, 0.08, 0.1, 0.012, { x: 0, y: ch === 'E' || ch === 'W' ? Math.PI / 2 : 0, z: 0 });
    };
    letter('N', CX, cz - 0.46); letter('S', CX, cz + 0.46); letter('E', CX + 0.46, cz); letter('W', CX - 0.46, cz);
    const vb = new VBuilder('vane');
    vb.box(iron, 0, 0, 0, 0.012, 0.012, 1.1);
    const head = new THREE.ConeGeometry(0.07, 0.18, 3);
    head.rotateX(Math.PI / 2);
    vb.add(head, iron, at(0, 0, 0.6));
    vb.box(iron, 0, 0, -0.5, 0.01, 0.16, 0.2);
    // rooster silhouette (extruded shape)
    const sh = new THREE.Shape();
    const pts: [number, number][] = [[-0.2, 0], [0.18, 0], [0.22, 0.08], [0.26, 0.2], [0.2, 0.3], [0.24, 0.36], [0.18, 0.4], [0.14, 0.34], [0.1, 0.24], [-0.05, 0.2], [-0.18, 0.34], [-0.26, 0.3], [-0.24, 0.18], [-0.2, 0.06]];
    sh.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
    rg.translate(0, 0, -0.006);
    rg.rotateY(Math.PI / 2);
    vb.add(rg, iron, at(0, 0.03, 0.05));
    const vm = vb.build(M.paint('#26272a', 0.6, 0.4), { cast: true })!;
    vane.add(vm);
    vane.position.set(CX, top + 1.65, cz);
    W.scene.add(vane);
  }

  // hay hoist beam in the front gable
  {
    const y = F + RY - 0.65, z0 = Z1 - 0.4, z1 = Z1 + 1.35;
    b.boxMinMax(timber, CX - 0.1, y - 0.12, z0, CX + 0.1, y + 0.12, z1, { collide: false });
    yp.add(new THREE.TorusGeometry(0.13, 0.03, 5, 12), '#3a3530', at(CX, y - 0.28, z1 - 0.15, Math.PI / 2));
    yp.box('#3a3530', CX, y - 0.15, z1 - 0.15, 0.06, 0.12, 0.04);
    yp.rod('#c2a875', V(CX, y - 0.3, z1 - 0.02), V(CX, F + 7.62, z1 - 0.02), 0.012, 5);
    yp.rod('#c2a875', V(CX, y - 0.3, z1 - 0.28), V(CX, F + 7.75, z1 - 0.28), 0.012, 5);
    yp.add(new THREE.TorusGeometry(0.05, 0.012, 4, 8, Math.PI * 1.4), '#3a3530', at(CX, F + 7.57, z1 - 0.02, Math.PI / 2));
  }

  // gooseneck barn lights either side of the doors
  for (const x of [CX - 4.0, CX + 4.0]) {
    const z = Z1 + HT, y = F + 4.55;
    yp.box('#1f3a2c', x, y, z + 0.03, 0.12, 0.12, 0.05);
    yp.rod('#1f3a2c', V(x, y, z + 0.05), V(x, y + 0.25, z + 0.3), 0.02);
    yp.rod('#1f3a2c', V(x, y + 0.25, z + 0.3), V(x, y + 0.2, z + 0.55), 0.02);
    const shade = new THREE.ConeGeometry(0.24, 0.16, 16, 1, true);
    yp.add(shade, '#1f3a2c', at(x, y + 0.1, z + 0.6));
    const sin = new THREE.ConeGeometry(0.235, 0.155, 16, 1, true);
    sin.scale(-1, 1, 1);
    yp.add(sin, '#e8e2d2', at(x, y + 0.1, z + 0.6));
    gl.add(new THREE.SphereGeometry(0.06, 8, 6), '#ffcf8a', at(x, y + 0.04, z + 0.6));
    W.lamps.add(new THREE.Vector3(x, y - 0.1, z + 0.75), '#ffc477', 3.2, 9, { nightOnly: true });
  }

  // =========================================================================
  // Sliding doors on a track (start open)
  // =========================================================================
  const doorMat = vcolMat({ noise: 0, rough: 0.7 });
  const leafW = (DOOR.x1 - DOOR.x0) / 2 + 0.06, leafH = DOOR.h + 0.1;
  const zLeaf = Z1 + HT + 0.09;
  const mkLeaf = (name: string) => {
    const v = new VBuilder(name);
    const w = leafW, h = leafH, red2 = '#8f2b21', wh = '#f2efe7';
    v.box(red2, 0, h / 2, 0, w, h, 0.07);
    for (let k = 0; k < Math.floor(w / 0.32); k++) v.box('#7e241c', -w / 2 + 0.16 + k * 0.32 + 0.16, h / 2, 0.036, 0.02, h - 0.1, 0.004);
    const fz = 0.05;
    v.box(wh, 0, h - 0.07, fz, w, 0.14, 0.04);
    v.box(wh, 0, 0.07, fz, w, 0.14, 0.04);
    v.box(wh, 0, h / 2, fz, w, 0.14, 0.04);
    v.box(wh, -w / 2 + 0.07, h / 2, fz, 0.14, h, 0.04);
    v.box(wh, w / 2 - 0.07, h / 2, fz, 0.14, h, 0.04);
    for (const [y0, y1] of [[0.14, h / 2 - 0.07], [h / 2 + 0.07, h - 0.14]]) {
      v.beam(wh, V(-w / 2 + 0.14, y0, fz), V(w / 2 - 0.14, y1, fz), 0.04, 0.12);
      v.beam(wh, V(-w / 2 + 0.14, y1, fz), V(w / 2 - 0.14, y0, fz), 0.04, 0.12);
    }
    // rollers on top + handle
    for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
      v.box('#26272a', x, h + 0.1, 0, 0.06, 0.24, 0.03);
      const rl = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10);
      rl.rotateX(Math.PI / 2);
      v.add(rl, '#26272a', at(x, h + 0.2, -0.02));
    }
    const m = v.build(doorMat, { cast: true })!;
    const g = new THREE.Group();
    g.add(m);
    return g;
  };
  const left = mkLeaf('barn-door-left'), right = mkLeaf('barn-door-right');
  const closedX = [CX - leafW / 2 + 0.03, CX + leafW / 2 - 0.03];
  const openX = [DOOR.x0 - leafW / 2 + 0.12, DOOR.x1 + leafW / 2 - 0.12];
  left.position.set(openX[0], F, zLeaf);
  right.position.set(openX[1], F, zLeaf);
  W.scene.add(left, right);
  // track rail
  yp.box('#26272a', CX, F + leafH + 0.24, zLeaf - 0.03, (DOOR.x1 - DOOR.x0) * 2 + 0.6, 0.08, 0.06);
  const doorCol = W.physics.addBox(DOOR.x0, F, zLeaf - 0.06, DOOR.x1, F + leafH, zLeaf + 0.06, { walk: false });
  W.physics.addBox(DOOR.x0 - leafW + 0.1, F, zLeaf - 0.06, DOOR.x0, F + leafH, zLeaf + 0.06, { walk: false });
  W.physics.addBox(DOOR.x1, F, zLeaf - 0.06, DOOR.x1 + leafW - 0.1, F + leafH, zLeaf + 0.06, { walk: false });
  let doorsOpen = true, doorT = 1;
  doorCol.enabled = false;
  W.interact.add({
    pos: new THREE.Vector3(CX, F + 1.5, zLeaf + 0.2), radius: 1.3, range: 3.6,
    label: () => (doorsOpen ? 'Close the barn doors' : 'Open the barn doors'),
    onUse: () => {
      doorsOpen = !doorsOpen;
      W.audio.play('door_open', { pos: new THREE.Vector3(CX, F + 2, zLeaf), volume: 0.9, rate: 0.55 });
      if (!doorsOpen) doorCol.enabled = true;
    },
  });
  W.onUpdate((dt) => {
    const target = doorsOpen ? 1 : 0;
    if (Math.abs(doorT - target) < 1e-4) return;
    doorT += Math.sign(target - doorT) * Math.min(Math.abs(target - doorT), dt * 0.7);
    const e = doorT * doorT * (3 - 2 * doorT);
    left.position.x = closedX[0] + (openX[0] - closedX[0]) * e;
    right.position.x = closedX[1] + (openX[1] - closedX[1]) * e;
    if (doorsOpen && doorT > 0.6) doorCol.enabled = false;
  });

  // =========================================================================
  // Interior frame: posts, tie beams, loft over the front
  // =========================================================================
  for (const z of [...BENTS, LOFT_Z]) for (const x of [STALL_X, 2 * CX - STALL_X]) {
    const top = z === LOFT_Z ? F + 3.3 : F + H - 0.1;
    b.box(timber, x, (F + top) / 2, z, 0.22, top - F, 0.22, { collide: 'nowalk' });
  }
  for (const z of BENTS) {
    b.box(timber, CX, F + H - 0.05, z, IX1 - IX0, 0.24, 0.2, { collide: false });
    for (const x of [STALL_X, 2 * CX - STALL_X]) for (const s of [-1, 1]) beam(b, timber, V(x, F + H - 0.95, z), V(x + s * 0.8, F + H - 0.15, z), 0.12, 0.12);
  }
  for (const x of [STALL_X, 2 * CX - STALL_X]) b.box(timber, x, F + H - 0.05, (IZ0 + LOFT_Z) / 2, 0.2, 0.22, LOFT_Z - IZ0, { collide: false });
  // loft floor, girder, joists
  b.boxMinMax(timber, IX0, F + 3.3, LOFT_Z - 0.12, IX1, F + 3.58, LOFT_Z + 0.12, { collide: false });
  b.boxMinMax(inner, IX0, F + 3.58, LOFT_Z - 0.1, IX1, F + 3.72, IZ1, { collide: false });
  for (let x = IX0 + 0.3; x < IX1; x += 0.62) b.boxMinMax(timber, x - 0.05, F + 3.36, LOFT_Z + 0.12, x + 0.05, F + 3.58, IZ1, { collide: false });
  W.physics.addBox(IX0, F + 3.3, LOFT_Z - 0.12, IX1, F + 3.72, IZ1);

  // =========================================================================
  // Stalls along the west wall
  // =========================================================================
  const names = ['Clover', 'Pearl', 'Biscuit', 'Duke'];
  const bars = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 0.13);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ip.box('#2b2c2e', x0 + (x1 - x0) * t, (y0 + y1) / 2, z0 + (z1 - z0) * t, 0.022, y1 - y0, 0.022);
    }
    ip.beam('#2b2c2e', V(x0, y1, z0), V(x1, y1, z1), 0.04, 0.04);
  };
  const lowW = 1.3, topY = 2.3;
  for (let i = 0; i < 4; i++) {
    const za = STALLS[i], zb = STALLS[i + 1], zc = (za + zb) / 2;
    // divider on the south side of each stall (the north one is the back wall or the previous stall)
    if (i < 4) {
      b.boxMinMax(timber, IX0, F, zb - 0.03, STALL_X - 0.1, F + lowW, zb + 0.03, { collide: 'nowalk' });
      bars(IX0, zb, STALL_X - 0.1, zb, F + lowW, F + topY);
      W.physics.addBox(IX0, F, zb - 0.04, STALL_X, F + topY, zb + 0.04, { walk: false });
    }
    // front: fixed panels either side of a 1.3 m opening, door slid open over the north panel
    const o0 = zc - 0.65, o1 = zc + 0.65;
    for (const [p0, p1] of [[za + 0.11, o0], [o1, zb - 0.11]]) {
      b.boxMinMax(timber, STALL_X - 0.03, F, p0, STALL_X + 0.03, F + lowW, p1, { collide: 'nowalk' });
      bars(STALL_X, p0, STALL_X, p1, F + lowW, F + topY);
      W.physics.addBox(STALL_X - 0.05, F, p0, STALL_X + 0.05, F + topY, p1, { walk: false });
    }
    // the slid-open door on the aisle side
    {
      const d0 = za + 0.2, d1 = d0 + 1.3, x = STALL_X + 0.09;
      ip.box('#6b4a31', x, F + 0.7, (d0 + d1) / 2, 0.05, 1.25, 1.3);
      for (let k = 0; k < 6; k++) ip.box('#5a3e29', x + 0.027, F + 0.7, d0 + 0.11 + k * 0.215, 0.006, 1.2, 0.012);
      bars(x, d0, x, d1, F + 1.33, F + 2.2);
      ip.beam('#2b2c2e', V(x, F + 1.33, d0), V(x, F + 1.33, d1), 0.05, 0.05);
      ip.box('#2b2c2e', x, F + 2.42, (d0 + d1) / 2, 0.04, 0.05, 1.5);
    }
    // header + name plate over the opening
    b.box(timber, STALL_X, F + topY + 0.1, zc, 0.12, 0.16, zb - za - 0.2, { collide: false });
    const r = atlas.region(256, 72, (g, w, h) => {
      paintBoard(g, w, h, '#c9a26a', '#5a3a22', 31 + i);
      g.fillStyle = '#3f2614'; g.textAlign = 'center';
      fitText(g, names[i], w / 2, 52, w - 30, 44, SERIF_FONT, 'italic bold');
    });
    atlas.plane(r, 0.56, 0.16, at(STALL_X + 0.064, F + topY + 0.1, zc, Math.PI / 2));
    // straw bedding
    b.boxMinMax(hay, IX0 + 0.02, F, za + 0.06, STALL_X - 0.1, F + 0.035, zb - 0.06, { collide: false });
    // corner hay rack (back wall, north corner) with hay
    const hx = IX0 + 0.05, hz = za + 0.1;
    ip.beam('#2b2c2e', V(hx, F + 1.25, hz + 0.75), V(hx + 0.75, F + 1.25, hz), 0.04, 0.04);
    ip.beam('#2b2c2e', V(hx, F + 1.85, hz + 0.75), V(hx + 0.75, F + 1.85, hz), 0.04, 0.04);
    for (let k = 0; k <= 6; k++) { const t = k / 6; ip.box('#2b2c2e', hx + 0.75 * t, F + 1.55, hz + 0.75 * (1 - t), 0.02, 0.6, 0.02); }
    const hb = new THREE.SphereGeometry(0.42, 9, 6);
    hb.scale(1, 0.55, 1);
    b.add(hay, hb, at(hx + 0.24, F + 1.72, hz + 0.24));
    // water bucket hanging on the front wall inside
    const bx = STALL_X - 0.17, bz = zb - 0.35;
    const bucket = new THREE.CylinderGeometry(0.15, 0.12, 0.28, 14);
    bucket.translate(0, 0.14, 0);
    ip.add(bucket, ['#2e5a78', '#7a2e2e', '#2f6a44', '#2e5a78'][i], at(bx, F + 0.85, bz));
    ip.add(new THREE.CylinderGeometry(0.135, 0.135, 0.01, 14), '#3d5560', at(bx, F + 1.08, bz));
    ip.add(new THREE.TorusGeometry(0.15, 0.008, 4, 12, Math.PI), '#888', at(bx, F + 1.13, bz, Math.PI / 2));
  }
  // west wall faces of the stalls (back) get a kick board
  b.boxMinMax(timber, IX0, F, STALLS[0], IX0 + 0.05, F + 1.2, STALLS[4], { collide: false });

  // =========================================================================
  // Tack along the east wall (front half), feed bins, ladder, hay at the back
  // =========================================================================
  {
    const wx = IX1;
    // saddle racks with saddles
    const saddle = (z: number, y: number, leather: string, pad: string) => {
      ip.box('#5a3e29', wx - 0.27, y - 0.06, z, 0.54, 0.05, 0.08);
      ip.box('#5a3e29', wx - 0.04, y - 0.2, z, 0.06, 0.32, 0.12);
      ip.box(pad, wx - 0.3, y + 0.0, z, 0.62, 0.025, 0.66, { x: 0, y: 0, z: 0 });
      for (const s of [-1, 1]) ip.box(pad, wx - 0.3, y - 0.18, z + s * 0.33, 0.62, 0.36, 0.02, { x: s * 0.12, y: 0, z: 0 });
      const seat = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      ip.add(seat, leather, mat4({ x: wx - 0.3, y: y + 0.012, z }, undefined, { x: 0.3, y: 0.11, z: 0.24 }));
      ip.add(new THREE.SphereGeometry(0.07, 10, 6), leather, mat4({ x: wx - 0.56, y: y + 0.1, z }, undefined, { x: 1, y: 0.8, z: 1.2 }));
      ip.add(new THREE.SphereGeometry(0.09, 10, 6), leather, mat4({ x: wx - 0.06, y: y + 0.08, z }, undefined, { x: 0.5, y: 0.9, z: 1.5 }));
      for (const s of [-1, 1]) {
        ip.box(leather, wx - 0.32, y - 0.17, z + s * 0.3, 0.36, 0.38, 0.025, { x: s * 0.15, y: 0, z: 0 });
        ip.box('#3a2416', wx - 0.3, y - 0.42, z + s * 0.33, 0.03, 0.4, 0.012);
        ip.add(new THREE.TorusGeometry(0.06, 0.008, 4, 10), '#b9b9b6', at(wx - 0.3, y - 0.66, z + s * 0.335));
      }
    };
    saddle(-60.3, F + 1.25, '#6b3a1d', '#2f4a6a');
    saddle(-61.35, F + 1.25, '#4e2a16', '#7a2e2e');
    saddle(-62.4, F + 1.25, '#7a4a26', '#e2d8c4');
    // tack trunk under the saddles
    ip.box('#2f4a3a', wx - 0.32, F + 0.25, -61.35, 0.55, 0.5, 1.2);
    ip.box('#253c2f', wx - 0.32, F + 0.52, -61.35, 0.58, 0.06, 1.24);
    for (const z of [-60.8, -61.9]) ip.box('#c09a4a', wx - 0.6, F + 0.42, z, 0.02, 0.12, 0.06);
    W.physics.addBox(wx - 0.62, F, -62.8, wx, F + 0.55, -59.9, { walk: false });
    // bridles and halters on hooks
    ip.box('#5a3e29', wx - 0.02, F + 1.75, -58.95, 0.04, 0.14, 1.5);
    const cols = ['#4e2a16', '#2e5a78', '#6b3a1d', '#a33a2b'];
    for (let k = 0; k < 4; k++) {
      const z = -59.55 + k * 0.4, c = cols[k];
      ip.box('#2b2c2e', wx - 0.08, F + 1.74, z, 0.1, 0.02, 0.02);
      const crown = new THREE.TorusGeometry(0.09, 0.012, 4, 12, Math.PI);
      ip.add(crown, c, mat4({ x: wx - 0.12, y: F + 1.66, z }, { x: 0, y: Math.PI / 2, z: 0 }));
      for (const s of [-1, 1]) ip.box(c, wx - 0.12, F + 1.42, z + s * 0.09, 0.012, 0.48, 0.02);
      ip.box(c, wx - 0.12, F + 1.5, z, 0.012, 0.025, 0.2);
      ip.add(new THREE.TorusGeometry(0.035, 0.006, 4, 8), '#c9c9c4', mat4({ x: wx - 0.12, y: F + 1.18, z }, { x: 0, y: Math.PI / 2, z: 0 }));
      if (k % 2 === 0) { const rein = new THREE.TorusGeometry(0.06, 0.008, 4, 12); rein.scale(1, 4, 1); ip.add(rein, c, mat4({ x: wx - 0.12, y: F + 0.98, z }, { x: 0, y: Math.PI / 2, z: 0 })); }
    }
    // coiled rope on a peg
    for (let k = 0; k < 4; k++) ip.add(new THREE.TorusGeometry(0.17 + k * 0.006, 0.014, 4, 18), '#c2a875', mat4({ x: wx - 0.06 - k * 0.02, y: F + 1.25, z: -63.5 }, { x: 0, y: Math.PI / 2, z: 0 }, { x: 1, y: 1.35, z: 1 }));
    // feed bins (galvanised) with scoops
    for (const z of [-64.9, -65.9]) {
      const bin = new THREE.CylinderGeometry(0.33, 0.33, 0.75, 18);
      bin.translate(0, 0.375, 0);
      mp.add(bin, '#a8adb0', at(wx - 0.42, F, z));
      for (const y of [0.15, 0.6]) mp.add(new THREE.TorusGeometry(0.335, 0.012, 4, 20), '#959a9d', mat4({ x: wx - 0.42, y: F + y, z }, { x: Math.PI / 2, y: 0, z: 0 }));
      const lid = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 18);
      lid.translate(0, 0.77, 0);
      mp.add(lid, '#b6bbbe', at(wx - 0.42, F, z));
      mp.add(new THREE.TorusGeometry(0.05, 0.01, 4, 8, Math.PI), '#3a3a3a', at(wx - 0.42, F + 0.79, z));
      W.physics.addCylinder(wx - 0.42, z, 0.36, F, F + 0.8);
    }
    // pitchfork + broom leaning by the east posts
    const px = 2 * CX - STALL_X + 0.16, pz = -64.0;
    ip.rod('#a88257', V(px, F, pz + 0.35), V(px + 0.05, F + 1.55, pz + 0.12), 0.016, 6);
    for (let k = -1; k <= 1; k++) ip.rod('#9a9a98', V(px + 0.05, F + 1.55, pz + 0.12 + k * 0.04), V(px + 0.1, F + 1.85, pz + 0.04 + k * 0.05), 0.006, 4);
    ip.rod('#a88257', V(px + 0.05, F + 1.42, pz + 0.17), V(px + 0.05, F + 1.55, pz + 0.12), 0.03, 6);
    ip.rod('#a88257', V(px, F + 0.25, -60.4), V(px + 0.04, F + 1.6, -60.6), 0.016, 6);
    const brush = new THREE.CylinderGeometry(0.03, 0.14, 0.32, 10);
    ip.add(brush, '#c7a85a', mat4({ x: px, y: F + 0.16, z: -60.38 }, { x: 0.1, y: 0, z: 0 }));
    // ladder to the loft edge
    const lx = 45.4, lz0 = LOFT_Z - 0.75, lz1 = LOFT_Z - 0.06, ly1 = F + 4.35;
    for (const dx of [-0.24, 0.24]) ip.beam('#8a6a4a', V(lx + dx, F, lz0), V(lx + dx, ly1, lz1), 0.06, 0.08);
    for (let k = 1; k < 15; k++) {
      const t = k / 15;
      ip.box('#8a6a4a', lx, F + (ly1 - F) * t, lz0 + (lz1 - lz0) * t, 0.48, 0.035, 0.035);
    }
    W.physics.addSegment(lx - 0.26, lz0 + 0.2, lx + 0.26, lz0 + 0.2, 0.18, F, F + 2.2);
  }

  // hay bales stacked at the back (and up on the loft)
  {
    const bale = (x: number, y: number, z: number, rot: number, s = 1) => {
      const bw = 0.9 * s, bh = 0.42, bd = 0.46;
      const g = new THREE.BoxGeometry(bw, bh, bd);
      b.add(hay, g, mat4({ x, y: y + bh / 2, z }, { x: 0, y: rot, z: 0 }));
      for (const k of [-0.22, 0.22]) {
        const c = Math.cos(rot), sn = Math.sin(rot);
        ip.add(new THREE.BoxGeometry(0.015, bh + 0.006, bd + 0.006), '#5a4a2a', mat4({ x: x + c * k * bw, y: y + bh / 2, z: z - sn * k * bw }, { x: 0, y: rot, z: 0 }));
      }
    };
    const xs0 = 37.2;
    for (let row = 0; row < 3; row++) {
      const z = IZ0 + 0.26 + row * 0.47;
      const levels = 3 - row;
      for (let lv = 0; lv < levels; lv++) {
        const off = (lv + row) % 2 ? 0.45 : 0;
        for (let x = xs0 + off; x < IX1 - 0.5; x += 0.92) {
          if (R() < 0.08 && lv === levels - 1) continue;
          bale(x, F + lv * 0.42, z + (R() - 0.5) * 0.04, (R() - 0.5) * 0.04);
        }
      }
      W.physics.addBox(xs0 - 0.45, F, z - 0.24, IX1, F + levels * 0.42, z + 0.24);
    }
    // a few loose bales in the aisle
    bale(39.2, F, -66.5, 0.5);
    bale(40.3, F, -66.7, -0.2);
    bale(39.7, F + 0.42, -66.6, 0.15);
    W.physics.addBox(38.6, F, -67.1, 40.9, F + 0.84, -66.0);
    // loft: bales and loose hay over the edge
    for (let row = 0; row < 3; row++) for (let x = IX0 + 0.5; x < IX1 - 0.4; x += 0.93) {
      if (row === 0 && x > 44.3) continue; // room for the ladder top
      const lv = row === 0 ? 1 : 2;
      for (let k = 0; k < lv; k++) bale(x, F + 3.72 + k * 0.42, LOFT_Z + 0.45 + row * 0.5 + (R() - 0.5) * 0.05, (R() - 0.5) * 0.05);
    }
    for (let i = 0; i < 18; i++) {
      const g = new THREE.SphereGeometry(0.25 + R() * 0.2, 8, 5);
      g.scale(1, 0.4, 0.8);
      b.add(hay, g, mat4({ x: IX0 + 0.4 + R() * 13, y: F + 3.66, z: LOFT_Z + 0.05 + R() * 0.15 }, { x: 0.4 + R() * 0.4, y: R(), z: 0 }));
    }
    // loose straw piles on the floor
    const mound = (x: number, z: number, r: number) => {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), k = 0.75 + 0.5 * Math.abs(Math.sin(p.getX(i) * 5.1 + p.getZ(i) * 3.7 + r * 9));
        p.setXYZ(i, p.getX(i) * k, Math.max(y, -0.2) * k, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      b.add(hay, g, mat4({ x, y: F - 0.02, z }, { x: 0, y: r * 7, z: 0 }, { x: r, y: r * 0.22, z: r * 0.8 }));
    };
    for (let i = 0; i < 4; i++) mound(38.0 + R() * 1.5, -67.6 + R() * 0.5, 0.5 + R() * 0.25);
    mound(37.1, -58.3, 0.45); mound(44.2, -66.8, 0.5);
  }

  // lanterns: hanging from the tie beams and under the loft, one by the tack
  const lantern = (x: number, y: number, z: number, chainTop: number) => {
    ip.rod('#2b2c2e', V(x, y + 0.2, z), V(x, chainTop, z), 0.008, 4);
    ip.box('#2b2c2e', x, y + 0.18, z, 0.2, 0.03, 0.2);
    ip.box('#2b2c2e', x, y - 0.18, z, 0.18, 0.03, 0.18);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ip.box('#2b2c2e', x + dx * 0.08, y, z + dz * 0.08, 0.015, 0.36, 0.015);
    const cap = new THREE.ConeGeometry(0.14, 0.1, 4);
    cap.rotateY(Math.PI / 4);
    ip.add(cap, '#2b2c2e', at(x, y + 0.24, z));
    gl.box('#ffb062', x, y, z, 0.12, 0.26, 0.12);
    W.lamps.add(new THREE.Vector3(x, y - 0.1, z), '#ffbe6e', 2.6, 8.5);
  };
  lantern(CX, F + 2.95, -64.3, F + H - 0.17);
  lantern(CX, F + 2.9, -61.0, F + H - 0.17);
  lantern(CX, F + 2.6, -55.4, F + 3.36);
  lantern(CX, F + 2.9, -67.6, F + H - 0.17);
  // indoor volume (inset half a wall)
  addIndoorVolume(new THREE.Vector3(IX0, F - 0.05, IZ0), new THREE.Vector3(IX1, F + RY, IZ1));

  // =========================================================================
  // The yard: tractor, hay wagon, round bales, feed bin, wheelbarrow, trough
  // =========================================================================
  tractor(yp, 30.9, -57.2, 0.22);
  W.physics.addSegment(30.9 - Math.sin(0.22) * 1.2, -57.2 - Math.cos(0.22) * 1.2, 30.9 + Math.sin(0.22) * 1.4, -57.2 + Math.cos(0.22) * 1.4, 0.85, heightAt(30.9, -57.2), heightAt(30.9, -57.2) + 2);
  hayWagon(yp, b, hay, 50.8, -56.5, 0.06);
  // round bales east of the barn
  {
    const rb = (x: number, z: number, yaw: number, lift = 0) => {
      const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 20);
      g.rotateZ(Math.PI / 2);
      const y = heightAt(x, z) + 0.72 + lift;
      b.add(hay, g, mat4({ x, y, z }, { x: 0, y: yaw, z: 0 }));
      // net wrap bands
      for (const k of [-0.45, 0, 0.45]) {
        const ring = new THREE.TorusGeometry(0.755, 0.012, 3, 24);
        ring.rotateY(Math.PI / 2);
        yp.add(ring, '#d9d2b8', mat4({ x: x + Math.cos(yaw) * k, y, z: z - Math.sin(yaw) * k }, { x: 0, y: yaw, z: 0 }));
      }
      if (!lift) W.physics.addCylinder(x, z, 0.8, y - 0.75, y + 0.75);
    };
    rb(50.0, -63.0, 0.1); rb(50.2, -64.6, 0.05); rb(50.1, -63.8, 0.08, 1.3);
    rb(51.8, -66.8, 1.2);
  }
  // wheelbarrow by the door
  {
    const x = 35.3, z = -51.2, yaw = 0.7, g = heightAt(x, z);
    const base = at(x, g, z, yaw);
    const mm = (p: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(base, p);
    const tray = new THREE.CylinderGeometry(0.45, 0.3, 0.32, 4, 1, true);
    tray.rotateY(Math.PI / 4); tray.scale(0.85, 1, 1.25);
    mp.add(tray, '#7b8f86', mm(at(0, 0.62, 0)));
    const trayIn = tray.clone(); trayIn.scale(-0.97, 0.97, 0.97);
    mp.add(trayIn, '#5d6d66', mm(at(0, 0.63, 0)));
    const wh = new THREE.TorusGeometry(0.18, 0.06, 6, 14);
    wh.rotateY(Math.PI / 2);
    yp.add(wh, '#222', mm(at(0, 0.24, 0.72)));
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(s * 0.22, 0.26, 0.72).applyMatrix4(base), c = new THREE.Vector3(s * 0.3, 0.55, -0.95).applyMatrix4(base);
      yp.beam('#8a6a4a', a, c, 0.05, 0.05);
      const l0 = new THREE.Vector3(s * 0.25, 0.48, -0.3).applyMatrix4(base), l1 = new THREE.Vector3(s * 0.27, 0.0, -0.36).applyMatrix4(base);
      yp.beam('#3a3a3a', l0, l1, 0.03, 0.03);
    }
    W.physics.addCylinder(x, z, 0.55, g, g + 0.8);
  }
  // feed bin (wooden chest) by the barn front
  {
    const x = 44.9, z = -51.7, g = heightAt(x, z);
    yp.box('#6b4a31', x, g + 0.4, z, 1.3, 0.8, 0.7);
    yp.box('#5a3e29', x, g + 0.83, z - 0.02, 1.36, 0.06, 0.76, { x: -0.06, y: 0, z: 0 });
    for (const dx of [-0.5, 0.5]) yp.box('#26272a', x + dx, g + 0.8, z + 0.36, 0.08, 0.05, 0.02);
    yp.box('#e8e2d2', x, g + 0.5, z + 0.355, 0.7, 0.2, 0.01);
    W.physics.addBox(x - 0.65, g, z - 0.35, x + 0.65, g + 0.85, z + 0.35, { walk: false });
    const pail = new THREE.CylinderGeometry(0.15, 0.12, 0.3, 12);
    pail.translate(0, 0.15, 0);
    mp.add(pail, '#a8adb0', at(x + 0.9, g, z + 0.1));
  }
  // galvanised stock tank inside the paddock, near the north fence
  {
    const x = 30.6, z = -40.4, g = heightAt(x, z);
    const tank = new THREE.CylinderGeometry(1, 1, 0.62, 28, 1, true);
    const p = tank.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.02 * Math.sin(a * 28); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    tank.computeVertexNormals();
    tank.translate(0, 0.31, 0);
    mp.add(tank, '#a9aeb1', mat4({ x, y: g, z }, undefined, { x: 1.05, y: 1, z: 0.48 }));
    mp.add(new THREE.TorusGeometry(1, 0.03, 4, 28), '#b8bdc0', mat4({ x, y: g + 0.62, z }, { x: Math.PI / 2, y: 0, z: 0 }, { x: 1.05, y: 0.48, z: 1 }));
    const water = new THREE.CircleGeometry(1, 24);
    water.rotateX(-Math.PI / 2);
    const wm = new THREE.Mesh(water, M.paint('#304a52', 0.08, 0.4));
    wm.position.set(x, g + 0.5, z); wm.scale.set(1.03, 1, 0.46);
    wm.receiveShadow = true;
    W.scene.add(wm);
    W.physics.addCylinder(x - 0.55, z, 0.55, g, g + 0.65);
    W.physics.addCylinder(x + 0.55, z, 0.55, g, g + 0.65);
  }

  // =========================================================================
  // Paddock fence: white post and three rails, gate on the north side
  // =========================================================================
  paddockFence(b, trim);

  // =========================================================================
  // finish
  // =========================================================================
  const bg = b.build();
  castOnly(bg, [red, roof, hay, stone, trim]);
  W.scene.add(bg);
  for (const [v, cast] of [[ip, false], [yp, true]] as const) { const m = v.build(undefined, { cast }); if (m) W.scene.add(m); }
  const mm = mp.build(vcolMat({ metal: 0.65, rough: 0.42, noise: 0.12 }), { cast: true });
  if (mm) W.scene.add(mm);
  const gm = gl.build(vglowMat(2.6));
  if (gm) W.scene.add(gm);
  const am = atlas.build();
  if (am) W.scene.add(am);

  // weathervane drifts with the breeze
  W.onUpdate((dt, time) => {
    vane.rotation.y = -0.75 + 0.25 * Math.sin(time * 0.13) + 0.1 * Math.sin(time * 0.47 + 1.3);
  });
}

// ---------------------------------------------------------------------------
// White three-rail paddock fence round PADDOCK with a swinging gate (north side)
// ---------------------------------------------------------------------------
function paddockFence(b: Builder, white: THREE.Material) {
  const { x0, x1, z0, z1 } = PADDOCK;
  const GX0 = 38.0, GX1 = 42.0; // gate posts on the north side
  const rails = [0.42, 0.84, 1.26];
  const postH = 1.42;
  const run = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / 2.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, g = heightAt(x, z);
      b.box(white, x, g + (postH - 0.3) / 2, z, 0.13, postH + 0.3, 0.13, { collide: false });
      b.box(white, x, g + postH + 0.02, z, 0.16, 0.04, 0.16, { collide: false });
      if (i < n) {
        const t1 = (i + 1) / n, xb = ax + (bx - ax) * t1, zb = az + (bz - az) * t1, gb = heightAt(xb, zb);
        // rails sit on the paddock (inside) face of the posts
        const ox = bz === az ? 0 : (x0 + x1) / 2 > x ? 0.08 : -0.08, oz = bz === az ? ((z0 + z1) / 2 > z ? 0.08 : -0.08) : 0;
        for (const ry of rails) beam(b, white, V(x + ox, g + ry, z + oz), V(xb + ox, gb + ry, zb + oz), 0.035, 0.15);
        W.physics.addSegment(x, z, xb, zb, 0.1, Math.min(g, gb) - 0.5, Math.max(g, gb) + 2.3);
      }
    }
  };
  run(x0, z1, x1, z1); // south
  run(x0, z0, x0, z1); // west
  run(x1, z0, x1, z1); // east
  run(x0, z0, GX0, z0); // north, west of the gate
  run(GX1, z0, x1, z0); // north, east of the gate
  // heavier gate posts
  for (const gx of [GX0, GX1]) { const g = heightAt(gx, z0); b.box(white, gx, g + 0.7, z0, 0.2, 1.75, 0.2, { collide: false }); W.physics.addCylinder(gx, z0, 0.14, g - 0.3, g + 2.3); }

  // the gate: a white five-bar farm gate, hinged on the west post, swings into the paddock
  const gw = GX1 - GX0 - 0.24;
  const gy = heightAt(GX0, z0);
  const v = new VBuilder('paddock-gate');
  const wc = '#f2efe7';
  const bars = [0.18, 0.42, 0.66, 0.9, 1.18];
  for (const y of bars) v.box(wc, gw / 2, y, 0, gw, 0.1, 0.04);
  v.box(wc, 0.06, 0.68, 0, 0.12, 1.24, 0.06);
  v.box(wc, gw - 0.06, 0.68, 0, 0.12, 1.24, 0.06);
  v.box(wc, gw / 2, 0.68, 0, 0.08, 1.1, 0.045);
  v.beam(wc, V(0.12, 0.2, 0.02), V(gw / 2, 1.16, 0.02), 0.03, 0.09);
  v.beam(wc, V(gw - 0.12, 0.2, 0.02), V(gw / 2, 1.16, 0.02), 0.03, 0.09);
  for (const y of [0.3, 1.05]) v.box('#26272a', 0.12, y, 0, 0.26, 0.05, 0.07);
  v.box('#26272a', gw - 0.05, 0.92, 0.05, 0.12, 0.05, 0.04);
  const gm = v.build(vcolMat({ noise: 0, rough: 0.6 }), { cast: true })!;
  const pivot = new THREE.Group();
  pivot.position.set(GX0 + 0.12, gy, z0);
  pivot.add(gm);
  W.scene.add(pivot);
  const closedC = W.physics.addSegment(GX0 + 0.12, z0, GX1 - 0.12, z0, 0.08, gy - 0.4, gy + 2.3);
  const openAng = 1.75;
  const oe = [GX0 + 0.12 + Math.cos(openAng) * gw, z0 + Math.sin(openAng) * gw];
  const openC = W.physics.addSegment(GX0 + 0.12, z0, oe[0], oe[1], 0.08, gy - 0.4, gy + 2.3);
  let open = false, ang = 0;
  openC.enabled = false;
  W.interact.add({
    pos: new THREE.Vector3((GX0 + GX1) / 2, gy + 0.95, z0), radius: 1.1, range: 3.2,
    label: () => (open ? 'Close the paddock gate' : 'Open the paddock gate'),
    onUse: () => {
      open = !open;
      closedC.enabled = !open; openC.enabled = open;
      W.audio.play('swing_creak', { pos: new THREE.Vector3(GX0, gy + 1, z0), volume: 0.7, rate: 0.9 });
    },
  });
  W.onUpdate((dt) => {
    const target = open ? openAng : 0;
    if (Math.abs(target - ang) < 1e-3) return;
    ang += (target - ang) * (1 - Math.exp(-dt * 3));
    pivot.rotation.y = -ang; // -: swings toward +z (into the paddock)
  });
}

// ---------------------------------------------------------------------------
// A classic little green tractor (procedural), front toward local +z
// ---------------------------------------------------------------------------
function tractor(v: VBuilder, x: number, z: number, yaw: number) {
  const g = heightAt(x, z);
  const base = at(x, g, z, yaw);
  const P = (px: number, py: number, pz: number, rot?: THREE.Vector3Like, sc?: THREE.Vector3Like) => new THREE.Matrix4().multiplyMatrices(base, mat4({ x: px, y: py, z: pz }, rot, sc));
  const green = '#3d6b33', yellow = '#e2b22d', black = '#1c1c1c', grey = '#3a3c3d';
  const tyre = (px: number, pz: number, r: number, w: number, lugs: number) => {
    const t = new THREE.TorusGeometry(r - w * 0.35, w * 0.42, 8, 26);
    t.rotateY(Math.PI / 2);
    t.scale(w / (w * 0.84), 1, 1);
    v.add(t, black, P(px, r, pz));
    const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 0.6, 20);
    rim.rotateZ(Math.PI / 2);
    v.add(rim, yellow, P(px, r, pz));
    const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.22, w * 0.7, 10);
    hub.rotateZ(Math.PI / 2);
    v.add(hub, '#c99a22', P(px + Math.sign(px) * 0.03, r, pz));
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      for (const s of [-1, 1]) {
        v.add(new THREE.BoxGeometry(w * 0.48, 0.05, r * 0.16), black, P(px + s * w * 0.22, r + Math.sin(a) * (r + 0.03), pz + Math.cos(a) * (r + 0.03), { x: Math.PI / 2 - a, y: s * 0.5, z: 0 }));
      }
    }
  };
  // big rear wheels and small front wheels
  for (const s of [-1, 1]) tyre(s * 0.82, -0.75, 0.72, 0.42, 16);
  for (const s of [-1, 1]) tyre(s * 0.56, 1.25, 0.36, 0.2, 10);
  // front axle + chassis
  v.box(grey, 0, 0.36, 1.25, 1.1, 0.1, 0.12);
  v.box(grey, 0, 0.58, 0.3, 0.42, 0.34, 2.1);
  v.box(grey, 0, 0.72, -0.75, 1.3, 0.16, 0.16);
  // engine block + hood with a rounded top
  v.box(green, 0, 0.92, 0.6, 0.62, 0.44, 1.5);
  const hood = new THREE.CylinderGeometry(0.31, 0.31, 1.5, 14, 1, false, -Math.PI / 2, Math.PI);
  hood.rotateX(-Math.PI / 2);
  hood.scale(1, 0.5, 1);
  v.add(hood, green, P(0, 1.14, 0.6));
  v.box(yellow, 0, 1.06, 0.6, 0.64, 0.035, 1.52);
  // grille + headlights
  v.box('#2a2a2a', 0, 0.95, 1.36, 0.52, 0.42, 0.03);
  for (let i = -3; i <= 3; i++) v.box('#9a9a94', i * 0.07, 0.95, 1.38, 0.015, 0.38, 0.015);
  for (const s of [-1, 1]) {
    const hl = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12);
    hl.rotateX(Math.PI / 2);
    v.add(hl, '#e8e4d0', P(s * 0.36, 1.12, 1.3));
  }
  // exhaust stack and air intake
  const ex = new THREE.CylinderGeometry(0.045, 0.045, 0.75, 8);
  ex.translate(0, 0.375, 0);
  v.add(ex, '#2a2a2a', P(0.14, 1.25, 0.95));
  v.add(new THREE.CylinderGeometry(0.06, 0.05, 0.08, 8), '#2a2a2a', P(0.14, 2.03, 0.95));
  const ai = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10);
  ai.translate(0, 0.15, 0);
  v.add(ai, '#d8d4c4', P(-0.14, 1.25, 1.0));
  // dash, steering column and wheel
  v.box(green, 0, 1.05, -0.25, 0.7, 0.55, 0.2);
  v.rod(grey, new THREE.Vector3(0, 1.3, -0.2).applyMatrix4(base), new THREE.Vector3(0, 1.62, -0.45).applyMatrix4(base), 0.025, 6);
  const sw = new THREE.TorusGeometry(0.2, 0.02, 5, 18);
  v.add(sw, black, P(0, 1.65, -0.48, { x: -1.1, y: 0, z: 0 }));
  // fenders over the rear wheels and the seat
  for (const s of [-1, 1]) {
    const f = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 18, 1, true, -Math.PI * 0.45, Math.PI * 0.9);
    f.rotateZ(Math.PI / 2);
    f.rotateX(-Math.PI / 2);
    v.add(f, green, P(s * 0.82, 0.72, -0.75));
    const fi = f.clone(); fi.scale(-1, 1, 1);
    v.add(fi, '#2f5528', P(s * 0.82, 0.72, -0.75, undefined, { x: 0.98, y: 0.98, z: 0.98 }));
  }
  v.box(grey, 0, 1.05, -0.95, 0.12, 0.45, 0.12);
  const seat = new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  seat.scale(1, 0.35, 1);
  v.add(seat, '#e2b22d', P(0, 1.28, -0.98));
  v.box('#e2b22d', 0, 1.42, -1.2, 0.46, 0.3, 0.06, { x: 0.2, y: 0, z: 0 });
  // hitch
  v.box(grey, 0, 0.5, -1.35, 0.5, 0.08, 0.3);
}

// ---------------------------------------------------------------------------
// Flatbed hay wagon with square bales
// ---------------------------------------------------------------------------
function hayWagon(v: VBuilder, b: Builder, hay: THREE.Material, x: number, z: number, yaw: number) {
  const g = heightAt(x, z);
  const base = at(x, g, z, yaw);
  const P = (px: number, py: number, pz: number, rot?: THREE.Vector3Like) => new THREE.Matrix4().multiplyMatrices(base, mat4({ x: px, y: py, z: pz }, rot));
  const wood = '#7a5a3c', red = '#8f2b21';
  // bed
  v.add(new THREE.BoxGeometry(2.0, 0.1, 4.0), wood, P(0, 0.95, 0));
  for (let i = 0; i < 9; i++) v.add(new THREE.BoxGeometry(2.0, 0.012, 0.02), '#5a3e29', P(0, 1.006, -1.8 + i * 0.45));
  v.add(new THREE.BoxGeometry(2.04, 0.16, 0.08), red, P(0, 0.9, 2.0));
  v.add(new THREE.BoxGeometry(2.04, 0.16, 0.08), red, P(0, 0.9, -2.0));
  for (const s of [-1, 1]) v.add(new THREE.BoxGeometry(0.08, 0.16, 4.0), red, P(s * 1.0, 0.9, 0));
  // headboard rack
  for (const s of [-1, 0, 1]) v.add(new THREE.BoxGeometry(0.08, 1.0, 0.08), wood, P(s * 0.92, 1.45, 1.94));
  for (const y of [1.3, 1.65, 1.92]) v.add(new THREE.BoxGeometry(1.92, 0.08, 0.05), wood, P(0, y, 1.94));
  // running gear
  for (const zz of [-1.35, 1.35]) {
    v.add(new THREE.BoxGeometry(1.9, 0.12, 0.12), '#2a2a2a', P(0, 0.55, zz));
    for (const s of [-1, 1]) {
      const t = new THREE.TorusGeometry(0.36, 0.1, 6, 18);
      t.rotateY(Math.PI / 2);
      v.add(t, '#1c1c1c', P(s * 0.92, 0.46, zz));
      const rim = new THREE.CylinderGeometry(0.27, 0.27, 0.14, 14);
      rim.rotateZ(Math.PI / 2);
      v.add(rim, '#c9c4b8', P(s * 0.92, 0.46, zz));
    }
    v.add(new THREE.BoxGeometry(0.2, 0.36, 0.2), '#2a2a2a', P(0, 0.75, zz));
  }
  // tongue
  v.add(new THREE.BoxGeometry(0.1, 0.1, 1.6), '#2a2a2a', P(0, 0.5, 2.7, { x: 0.18, y: 0, z: 0 }));
  // bales
  const R = rng(5);
  for (let lv = 0; lv < 3; lv++) for (let i = 0; i < (lv === 2 ? 2 : 4); i++) for (let j = 0; j < 2; j++) {
    const bx = (j - 0.5) * 0.95, bz = -1.5 + i * 0.92 + (lv === 2 ? 0.9 : 0), by = 1.0 + lv * 0.42 + 0.21;
    b.add(hay, new THREE.BoxGeometry(0.9, 0.42, 0.46), P(bx, by, bz, { x: 0, y: Math.PI / 2 + (R() - 0.5) * 0.06, z: 0 }));
  }
  W.physics.addSegment(x - Math.sin(yaw) * 1.8, z - Math.cos(yaw) * 1.8, x + Math.sin(yaw) * 2.3, z + Math.cos(yaw) * 2.3, 1.05, g, g + 2.4);
}
