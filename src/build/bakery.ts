import * as THREE from 'three';
import type { BuildCtx } from '../scene';
import { W } from '../world';
import { M } from './materials';
import { Builder, wall, windowUnit, makeDoor, gableRoof, gableOutline } from './kit';
import { BAKERY, COOP } from '../world/layout';
import { heightAt, padHeightAt } from '../world/terrain';
import { addIndoorVolume, U } from '../shaderlib';
import { Fire } from '../fx/fire';
import {
  VBuilder, Atlas, V, rng, mat4, beam, paintBoard, chalkBoard, CHALK_FONT, SERIF_FONT, fitText,
  chickenWireMat, wirePanel, mergeMesh, chimneySmoke, vglowMat, castOnly,
} from './farm/util';
import * as P from './farm/pastry';

// "Crumb & Clover", a small countryside bakery west of the farmhouse, plus the
// chicken coop behind it. Front (gable end) faces +x toward the path.

// footprint (wall centre lines)
const X0 = -30, X1 = -24, Z0 = -41.5, Z1 = -34.5;
const T = 0.18, HT = T / 2;
const EAVE = 3.0, RISE = 2.3;
const ZC = (Z0 + Z1) / 2; // ridge line (-38)
// inner faces
const IX0 = X0 + HT, IX1 = X1 - HT, IZ0 = Z0 + HT, IZ1 = Z1 - HT;

export const BAKERY_PLACES = [
  { name: 'Inside the bakery', x: -24.9, z: -38.4, yaw: Math.PI / 2 + 0.25 },
];

const at = (x: number, y: number, z: number, yaw = 0) => mat4({ x, y, z }, { x: 0, y: yaw, z: 0 });

export default function build(ctx: BuildCtx) {
  const G = padHeightAt(BAKERY.x, BAKERY.z);
  const F = G + 0.32;
  const R = rng(4242);

  // ---- materials ----
  const siding = M.siding('#c2ccad', 0.17);
  const plaster = M.plaster('#f2e8d5');
  const trim = M.trim('#f3ecdc');
  const shingle = M.shingles('#5b463a');
  const brick = M.brick('#9c4b33');
  const stone = M.stone('#9a948a');
  const tile = M.tile('#ebe2cf', 0.3, '#3e3d39');
  const woodDk = M.wood('#5e3d26');
  const woodLt = M.wood('#b98f60');
  const ceil = M.woodFloor('#b99467', 'z', 0.13);
  const glass = M.glass(1);
  const bead = M.beadboard('#a5b394');
  const copper = M.metal('#c27b48', 0.32);
  const glowLantern = M.glow('#ffbf6a', 4, true);

  const ext = new Builder('bakery');
  const int = ext; // one builder: interior and exterior share materials (fewer draw calls)
  const glow = new VBuilder('bakery-glow');
  const out = new VBuilder('bakery-props-out');
  const inn = new VBuilder('bakery-props-in');
  const atlas = new Atlas(1024, 1024);

  // =========================================================================
  // Shell
  // =========================================================================
  // brick plinth ring + tiled floor
  const PB = 0.13;
  ext.boxMinMax(brick, X1 - PB, G - 0.3, Z0 - PB, X1 + PB, F, Z1 + PB);
  ext.boxMinMax(brick, X0 - PB, G - 0.3, Z0 - PB, X0 + PB, F, Z1 + PB);
  ext.boxMinMax(brick, X0 + PB, G - 0.3, Z0 - PB, X1 - PB, F, Z0 + PB);
  ext.boxMinMax(brick, X0 + PB, G - 0.3, Z1 - PB, X1 - PB, F, Z1 + PB);
  int.boxMinMax(tile, X0 + PB, G - 0.3, Z0 + PB, X1 - PB, F, Z1 - PB);
  // front step
  ext.boxMinMax(stone, X1 + PB, G - 0.25, -36.95, X1 + 0.78, G + 0.16, -35.25);

  // walls
  const DOOR = { u0: 4.9, u1: 5.9 }; // along the front wall from Z0
  wall(ext, {
    a: [X1, Z0], b: [X1, Z1], y: F, outline: gableOutline(7, EAVE, RISE), outer: siding, inner: plaster, outSide: 1,
    holes: [{ u0: 0.7, u1: 3.9, y0: 0.75, y1: 2.45 }, { u0: DOOR.u0, u1: DOOR.u1, y0: 0, y1: 2.18 }],
  });
  wall(ext, {
    a: [X0, Z0], b: [X0, Z1], y: F, outline: gableOutline(7, EAVE, RISE), outer: siding, inner: plaster, outSide: -1,
    holes: [{ u0: 3.15, u1: 3.85, y0: 3.3, y1: 4.1 }],
  });
  wall(ext, {
    a: [X0 - HT, Z0], b: [X1 + HT, Z0], y: F, h: EAVE, outer: siding, inner: plaster, outSide: 1,
    holes: [{ u0: 4.29, u1: 5.29, y0: 1.0, y1: 2.2 }, { u0: 2.39, u1: 3.19, y0: 1.15, y1: 2.05 }],
  });
  wall(ext, {
    a: [X0 - HT, Z1], b: [X1 + HT, Z1], y: F, h: EAVE, outer: siding, inner: plaster, outSide: -1,
    holes: [{ u0: 4.39, u1: 5.39, y0: 1.0, y1: 2.2 }, { u0: 1.49, u1: 2.49, y0: 1.0, y1: 2.2 }],
  });
  const shut = M.paint('#4b5d44', 0.6);
  windowUnit(ext, { x: X1, y: F + 1.6, z: Z0 + 2.3, w: 3.2, h: 1.7, n: [1, 0], frame: trim, glass, muntins: [4, 1] });
  windowUnit(ext, { x: X0, y: F + 3.7, z: ZC, w: 0.7, h: 0.8, n: [-1, 0], frame: trim, glass, muntins: [2, 2] });
  windowUnit(ext, { x: -25.3, y: F + 1.6, z: Z0, w: 1.0, h: 1.2, n: [0, -1], frame: trim, glass, muntins: [2, 2], shutters: shut });
  windowUnit(ext, { x: -27.3, y: F + 1.6, z: Z0, w: 0.8, h: 0.9, n: [0, -1], frame: trim, glass, muntins: [2, 2] });
  windowUnit(ext, { x: -25.2, y: F + 1.6, z: Z1, w: 1.0, h: 1.2, n: [0, 1], frame: trim, glass, muntins: [2, 2], shutters: shut });
  windowUnit(ext, { x: -28.1, y: F + 1.6, z: Z1, w: 1.0, h: 1.2, n: [0, 1], frame: trim, glass, muntins: [2, 2], shutters: shut });
  // door casing
  {
    const zc = Z0 + (DOOR.u0 + DOOR.u1) / 2, w = DOOR.u1 - DOOR.u0;
    ext.box(trim, X1 + HT + 0.015, F + 2.18 + 0.06, zc, 0.04, 0.14, w + 0.3, { collide: false });
    ext.box(trim, X1 + HT + 0.015, F + 1.09, Z0 + DOOR.u0 - 0.07, 0.04, 2.18, 0.12, { collide: false });
    ext.box(trim, X1 + HT + 0.015, F + 1.09, Z0 + DOOR.u1 + 0.07, 0.04, 2.18, 0.12, { collide: false });
    ext.box(trim, X1 - HT - 0.015, F + 2.18 + 0.05, zc, 0.03, 0.1, w + 0.2, { collide: false });
    ext.box(trim, X1 - HT - 0.015, F + 1.09, Z0 + DOOR.u0 - 0.05, 0.03, 2.18, 0.08, { collide: false });
    ext.box(trim, X1 - HT - 0.015, F + 1.09, Z0 + DOOR.u1 + 0.05, 0.03, 2.18, 0.08, { collide: false });
    // little pediment over the door
    ext.box(trim, X1 + HT + 0.07, F + 2.42, zc, 0.16, 0.06, w + 0.44, { collide: false });
  }
  // corner boards
  for (const [cx, cz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) ext.box(trim, cx, F + EAVE / 2, cz, 0.24, EAVE, 0.24, { collide: false });
  // a trim belt where the gable starts, front and back
  for (const x of [X1 + HT + 0.02, X0 - HT - 0.02]) ext.box(trim, x, F + EAVE + 0.03, ZC, 0.05, 0.1, 7.2, { collide: false });

  // roof
  const OV = 0.42;
  gableRoof(ext, { cx: (X0 + X1) / 2, cz: ZC, y: F + EAVE, len: X1 - X0, span: Z1 - Z0, rise: RISE, ridge: 'x', overhang: OV, mat: shingle, under: ceil, fascia: trim });
  // barge boards along the gable rakes
  {
    const half = (Z1 - Z0) / 2;
    const tan = RISE / half;
    for (const xe of [X1 + OV - 0.03, X0 - OV + 0.03]) for (const s of [-1, 1]) {
      const zA = ZC + s * (half + OV), yA = F + EAVE - OV * tan - 0.09;
      beam(ext, trim, V(xe, yA, zA), V(xe, F + EAVE + RISE - 0.09, ZC), 0.05, 0.2);
    }
  }
  // inside: tie beams, rafters, ridge beam
  for (const x of [-28.6, -27.0, -25.4]) int.box(woodDk, x, F + EAVE - 0.1, ZC, 0.16, 0.2, IZ1 - IZ0, { collide: false });
  for (let x = X0 + 0.55; x < X1 - 0.3; x += 0.82) for (const s of [-1, 1]) {
    const zA = ZC + s * (IZ1 - ZC);
    const half = (Z1 - Z0) / 2;
    const yA = F + EAVE + RISE * (1 - Math.abs(zA - ZC) / half) - 0.08;
    beam(int, woodDk, V(x, yA, zA), V(x, F + EAVE + RISE - 0.08, ZC), 0.09, 0.14);
  }
  int.box(woodDk, (X0 + X1) / 2, F + EAVE + RISE - 0.14, ZC, IX1 - IX0, 0.18, 0.14, { collide: false });

  // beadboard wainscot + chair rail on the side walls
  for (const [z, s] of [[IZ0, 1], [IZ1, -1]] as const) {
    int.box(bead, (IX0 + IX1) / 2, F + 0.5, z + s * 0.012, IX1 - IX0 - 0.02, 1.0, 0.024, { collide: false });
    int.box(woodDk, (IX0 + IX1) / 2, F + 1.02, z + s * 0.025, IX1 - IX0 - 0.02, 0.05, 0.05, { collide: false });
    int.box(woodDk, (IX0 + IX1) / 2, F + 0.05, z + s * 0.022, IX1 - IX0 - 0.02, 0.1, 0.04, { collide: false });
  }

  // =========================================================================
  // Chimney + wood-fired oven (north-west corner, mouth facing +x)
  // =========================================================================
  const OZ = -39.9; // oven centre z
  // base with a log niche
  const nc = { collide: false };
  int.boxMinMax(brick, IX0, F, -40.8, -28.35, F + 0.12, -39.0, nc);
  int.boxMinMax(brick, IX0, F + 0.12, -40.8, -28.35, F + 0.32, -40.6, nc);
  int.boxMinMax(brick, IX0, F + 0.12, -39.2, -28.35, F + 0.32, -39.0, nc);
  int.boxMinMax(brick, IX0, F + 0.12, -40.6, -29.5, F + 0.32, -39.2, nc);
  int.boxMinMax(brick, IX0, F + 0.32, -40.8, -28.35, F + 0.85, -39.0, nc);
  W.physics.addCylinder(-29.06, OZ, 0.88, F, F + 1.6);
  // dome
  {
    const d = new THREE.SphereGeometry(0.78, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    d.scale(1, 0.78, 1);
    int.add(brick, d, at(-29.12, F + 0.85, OZ));
  }
  // arched facade with the mouth
  {
    const w = 1.7, h = 0.78, mw = 0.58, mh0 = 0.2, mr = mw / 2;
    const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
    const hole = new THREE.Path();
    hole.moveTo(-mr, 0.03); hole.lineTo(mr, 0.03); hole.lineTo(mr, mh0);
    hole.absarc(0, mh0, mr, 0, Math.PI, false);
    hole.lineTo(-mr, 0.03);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false, curveSegments: 10 });
    // shape x -> world z, shape y -> up, extrude -> world -x
    g.rotateY(-Math.PI / 2);
    int.add(brick, g, at(-28.2, F + 0.85, OZ));
    // keystone + arch ring in a paler brick
    const ring = new THREE.TorusGeometry(mr + 0.06, 0.055, 4, 12, Math.PI);
    ring.rotateY(Math.PI / 2);
    int.add(stone, ring, at(-28.17, F + 0.85 + mh0, OZ));
    int.box(stone, -28.15, F + 0.85 + mh0 + mr + 0.07, OZ, 0.06, 0.13, 0.12, { collide: false });
  }
  // cavity behind the mouth (so you see a hot oven, not the room behind)
  int.boxMinMax(brick, -29.75, F + 0.85, -40.35, -28.3, F + 0.88, -39.45, { collide: false });
  int.boxMinMax(brick, -29.8, F + 0.85, -40.4, -29.68, F + 1.42, -39.4, { collide: false });
  int.boxMinMax(brick, -29.75, F + 0.85, -40.4, -28.3, F + 1.42, -40.3, { collide: false });
  int.boxMinMax(brick, -29.75, F + 0.85, -39.5, -28.3, F + 1.42, -39.4, { collide: false });
  int.boxMinMax(brick, -29.75, F + 1.38, -40.4, -28.3, F + 1.44, -39.4, { collide: false });
  // stone landing ledge in front of the mouth
  int.boxMinMax(stone, -28.25, F + 0.8, -40.3, -27.98, F + 0.88, -39.5, { collide: false });
  // glowing coals + a couple of logs in the oven
  for (let i = 0; i < 9; i++) glow.box('#ff6a1e', -29.35 + R() * 0.5, F + 0.895, OZ + (R() - 0.5) * 0.5, 0.06 + R() * 0.05, 0.03, 0.05 + R() * 0.05, { x: 0, y: R() * 3, z: 0 });
  for (const [dz, a] of [[-0.12, 0.3], [0.1, -0.25], [0.0, 1.4]]) inn.rod('#2d1c12', V(-29.55, F + 0.92, OZ + dz - Math.sin(a) * 0.2), V(-29.1, F + 0.95, OZ + dz + Math.sin(a) * 0.2), 0.04, 6);
  const fire = new Fire({ pos: new THREE.Vector3(-29.05, F + 0.88, OZ), scale: 0.3, logs: false, embers: false, label: 'the oven fire', lampRadius: 4.6, lampIntensity: 5 });
  W.scene.add(fire.group);
  // logs stacked in the niche under the oven
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) {
    const z = -40.5 + 0.08 + i * 0.19 + row * 0.095, y = F + 0.18 + row * 0.16;
    const g = new THREE.CylinderGeometry(0.08, 0.08, 0.55, 7);
    g.rotateZ(Math.PI / 2);
    inn.add(g, (q) => new THREE.Color(Math.abs(q.x) > 0.27 ? '#c9a77a' : '#4e3523').multiplyScalar(0.8 + 0.3 * R()), at(-29.0 + (R() - 0.5) * 0.06, y, z));
  }
  // flue hood above the oven, then the chimney through the roof
  int.boxMinMax(brick, -28.62, F + 1.63, -40.25, -28.02, F + 3.95, -39.55, { collide: false });
  int.boxMinMax(stone, -28.26, F + 1.6, -40.75, -28.16, F + 1.66, -39.05, { collide: false }); // mantel
  ext.boxMinMax(brick, -28.66, F + 3.7, -40.29, -27.98, F + 5.95, -39.51, { collide: false });
  ext.boxMinMax(brick, -28.75, F + 5.85, -40.38, -27.89, F + 6.0, -39.42, { collide: false });
  {
    const pot = new THREE.CylinderGeometry(0.12, 0.15, 0.32, 10);
    pot.translate(0, 0.16, 0);
    out.add(pot, '#b35a3c', at(-28.32, F + 6.0, -39.9));
  }
  const smoke = chimneySmoke(new THREE.Vector3(-28.32, F + 6.35, -39.9), { height: 7, size: 1.1 });
  W.scene.add(smoke.points);

  // =========================================================================
  // Counter with a glass display case (customer side faces +x)
  // =========================================================================
  const CX0 = -26.7, CX1 = -26.1, CZ0 = -41.25, CZM = -38.55, CZ1 = -37.0;
  // plinth under the case, the case glass, frame
  int.boxMinMax(woodDk, CX0, F, CZ0, CX1, F + 0.42, CZM, { collide: false });
  int.boxMinMax(woodLt, CX1 - 0.005, F + 0.08, CZ0 + 0.06, CX1 + 0.01, F + 0.36, CZM - 0.06, { collide: false });
  int.boxMinMax(glass, CX0 + 0.01, F + 0.42, CZ0 + 0.01, CX1 - 0.01, F + 1.26, CZM - 0.01, { collide: false });
  for (const [x, z] of [[CX0, CZ0], [CX1, CZ0], [CX0, CZM], [CX1, CZM]]) int.box(woodDk, x + (x === CX0 ? 0.02 : -0.02), F + 0.84, z + (z === CZ0 ? 0.02 : -0.02), 0.04, 0.84, 0.04, { collide: false });
  int.boxMinMax(woodDk, CX0, F + 1.26, CZ0, CX1, F + 1.3, CZM, { collide: false });
  int.boxMinMax(trim, CX0 + 0.03, F + 0.42, CZ0 + 0.03, CX1 - 0.03, F + 0.45, CZM - 0.03, { collide: false });
  int.boxMinMax(glass, CX0 + 0.03, F + 0.83, CZ0 + 0.03, CX1 - 0.03, F + 0.845, CZM - 0.03, { collide: false });
  // plain counter section
  int.boxMinMax(woodDk, CX0, F, CZM, CX1, F + 0.92, CZ1, { collide: false });
  int.boxMinMax(woodLt, CX0 - 0.05, F + 0.92, CZM - 0.02, CX1 + 0.05, F + 0.97, CZ1 + 0.03, { collide: false });
  for (let z = CZM + 0.2; z < CZ1 - 0.1; z += 0.5) int.boxMinMax(woodLt, CX1 - 0.005, F + 0.12, z, CX1 + 0.012, F + 0.8, z + 0.35, { collide: false });
  // segment collider (raycasts ignore segments, so the pastries stay reachable)
  W.physics.addSegment((CX0 + CX1) / 2, CZ0, (CX0 + CX1) / 2, CZ1 - 0.25, (CX1 - CX0) / 2, F, F + 1.3);

  // pastries in the case: lower tray buns + pies, upper glass shelf croissants + danishes
  for (let i = 0; i < 2; i++) P.pie(inn, at(-26.4, F + 0.45, -40.95 + i * 0.3), 0.115, i ? '#5c2a4a' : '#8a2e22');
  for (let i = 0; i < 6; i++) P.cinnamonBun(inn, at(-26.53 + (i % 2) * 0.15, F + 0.45, -40.25 + Math.floor(i / 2) * 0.13, R() * 3));
  for (let i = 0; i < 8; i++) P.muffin(inn, at(-26.52 + (i % 2) * 0.13, F + 0.45, -39.75 + Math.floor(i / 2) * 0.1), i % 3 !== 0);
  for (let i = 0; i < 8; i++) P.croissant(inn, at(-26.5 + (i % 2) * 0.17, F + 0.85, -41.05 + Math.floor(i / 2) * 0.17, Math.PI / 2 + (R() - 0.5) * 0.4));
  for (let i = 0; i < 6; i++) P.danish(inn, at(-26.52 + (i % 2) * 0.14, F + 0.85, -40.25 + Math.floor(i / 2) * 0.12), i % 2 ? '#a3202a' : '#d99a1e');
  for (let i = 0; i < 6; i++) P.roll(inn, at(-26.52 + (i % 2) * 0.13, F + 0.85, -39.78 + Math.floor(i / 2) * 0.1), 0.036, i % 2 === 0);
  // trays
  inn.box('#e9e4da', -26.4, F + 0.452, -40.45, 0.5, 0.008, 1.5);
  inn.box('#e9e4da', -26.4, F + 0.852, -40.0, 0.5, 0.006, 2.4);
  // counter top things: register, bun stand, bell
  {
    const bx = -26.45, bz = -38.25, by = F + 0.97;
    // an old brass cash register: wooden drawer, brass body, sloped keys facing the baker, display on top
    inn.box('#4a2f1f', bx, by + 0.045, bz, 0.36, 0.09, 0.4);
    inn.box('#7a5a2a', bx + 0.181, by + 0.045, bz, 0.004, 0.05, 0.14);
    inn.box('#c99c47', bx + 0.03, by + 0.17, bz, 0.26, 0.16, 0.36);
    inn.box('#a77d34', bx + 0.03, by + 0.17, bz, 0.27, 0.12, 0.3);
    inn.box('#c99c47', bx - 0.12, by + 0.16, bz, 0.12, 0.03, 0.34, { x: 0, y: 0, z: -0.55 });
    for (let i = 0; i < 15; i++) {
      const row = i % 3, col = Math.floor(i / 3);
      inn.add(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 8), row === 0 ? '#2b2522' : '#efe8d6', mat4({ x: bx - 0.155 + row * 0.04, y: by + 0.14 + row * 0.024, z: bz - 0.12 + col * 0.06 }, { x: 0, y: 0, z: -0.55 }));
    }
    inn.box('#c99c47', bx + 0.06, by + 0.31, bz, 0.13, 0.12, 0.26);
    const arch = new THREE.CylinderGeometry(0.13, 0.13, 0.13, 14, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2); arch.rotateX(Math.PI / 2); arch.scale(1, 0.35, 1);
    inn.add(arch, '#b88d3e', at(bx + 0.06, by + 0.37, bz));
    for (const sx of [-1, 1]) inn.box('#23201d', bx + 0.06 + sx * 0.066, by + 0.315, bz, 0.004, 0.05, 0.18);
    for (let i = 0; i < 4; i++) inn.box('#f4efe2', bx + 0.06 + 0.068, by + 0.322, bz - 0.066 + i * 0.044, 0.004, 0.022, 0.03);
    inn.box('#c99c47', bx + 0.06 + 0.068, by + 0.29, bz, 0.006, 0.012, 0.19);
    const crank = new THREE.TorusGeometry(0.045, 0.008, 4, 10, Math.PI);
    inn.add(crank, '#2b2522', at(bx + 0.03, by + 0.19, bz + 0.2));
    // bun stand
    const st = new THREE.CylinderGeometry(0.03, 0.07, 0.09, 12);
    st.translate(0, 0.045, 0);
    inn.add(st, '#e6dfd2', at(-26.38, by, -37.75));
    const plate = new THREE.CylinderGeometry(0.17, 0.17, 0.012, 24);
    plate.translate(0, 0.096, 0);
    inn.add(plate, '#f2eee6', at(-26.38, by, -37.75));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      P.cinnamonBun(inn, at(-26.38 + Math.cos(a) * 0.1, by + 0.102, -37.75 + Math.sin(a) * 0.1, a), 0.95);
    }
    P.cinnamonBun(inn, at(-26.38, by + 0.135, -37.75, 1), 0.95);
    // service bell
    const bb = new THREE.CylinderGeometry(0.04, 0.045, 0.012, 14);
    bb.translate(0, 0.006, 0);
    inn.add(bb, '#3b2a20', at(-26.3, by, -37.22));
    const dome = new THREE.SphereGeometry(0.035, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    inn.add(dome, '#d8b25a', at(-26.3, by + 0.012, -37.22));
    inn.add(new THREE.SphereGeometry(0.008, 6, 4), '#d8b25a', at(-26.3, by + 0.05, -37.22));
  }

  // =========================================================================
  // Back wall shelves of loaves + chalkboard menu
  // =========================================================================
  const SX0 = IX0, SX1 = -29.52, SZ0 = -38.85, SZ1 = -35.3;
  for (const z of [SZ0 + 0.02, (SZ0 + SZ1) / 2, SZ1 - 0.02]) int.boxMinMax(woodDk, SX0, F, z - 0.025, SX1, F + 1.95, z + 0.025, { collide: false });
  const shelfY = [0.38, 0.84, 1.3, 1.76];
  for (const y of shelfY) int.boxMinMax(woodDk, SX0, F + y - 0.03, SZ0, SX1, F + y, SZ1, { collide: false });
  W.physics.addBox(SX0, F, SZ0, SX1, F + 1.95, SZ1, { walk: false });
  {
    let z = SZ0 + 0.18;
    // shelf 1 (top): boules
    for (z = SZ0 + 0.18; z < SZ1 - 0.15; z += 0.27) P.boule(inn, at(-29.72, F + 1.76, z, R() * 3), 0.105 + R() * 0.015, { score: R() > 0.5 ? 'cross' : 'leaf', dark: R() * 0.4 });
    // shelf 2: batards angled
    for (z = SZ0 + 0.2; z < SZ1 - 0.2; z += 0.21) P.batard(inn, at(-29.71, F + 1.3, z, Math.PI / 2 + (R() - 0.5) * 0.3), 0.24 + R() * 0.04, { dark: R() * 0.5 });
    // shelf 3: tin loaves and boules
    for (z = SZ0 + 0.2; z < SZ1 - 0.15; z += 0.26) {
      if (Math.floor((z - SZ0) / 0.26) % 2) P.tinLoaf(inn, at(-29.71, F + 0.84, z, Math.PI / 2));
      else P.boule(inn, at(-29.71, F + 0.84, z, R() * 3), 0.1, { score: 'ear', dark: 0.3 });
    }
    // bottom: baskets of baguettes and rolls
    for (const bz of [SZ0 + 0.45, SZ0 + 1.25, SZ0 + 2.05, SZ0 + 2.85]) {
      P.basket(inn, at(-29.71, F + 0.38, bz), 0.16, 0.14);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        P.roll(inn, at(-29.71 + Math.cos(a) * 0.07, F + 0.42 + (k % 2) * 0.02, bz + Math.sin(a) * 0.07), 0.04);
      }
    }
  }
  // menu board above the shelves
  const menuR = atlas.region(512, 320, (g, w, h) => {
    chalkBoard(g, w, h, 5);
    g.textAlign = 'center'; g.fillStyle = 'rgba(250,246,236,0.92)';
    fitText(g, "Today's Bakes", w / 2, 62, w - 60, 50, CHALK_FONT, 'bold');
    g.strokeStyle = 'rgba(240,200,120,0.7)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w * 0.22, 80); g.quadraticCurveTo(w / 2, 92, w * 0.78, 80); g.stroke();
    const items: [string, string][] = [['Sourdough loaf', '6'], ['Butter croissant', '3'], ['Cinnamon bun', '3.5'], ['Baguette', '4'], ['Berry muffin', '3'], ['Apple pie (whole)', '18']];
    g.font = `30px ${CHALK_FONT}`;
    items.forEach(([n, p], i) => {
      const y = 128 + i * 32;
      g.textAlign = 'left'; g.fillStyle = 'rgba(250,246,236,0.9)'; g.fillText(n, 46, y);
      g.textAlign = 'right'; g.fillStyle = 'rgba(255,214,140,0.95)'; g.fillText(p, w - 46, y);
      g.fillStyle = 'rgba(250,246,236,0.35)';
      g.textAlign = 'left';
      const x0 = 46 + g.measureText(n).width + 10, x1 = w - 46 - g.measureText(p).width - 10;
      for (let x = x0; x < x1; x += 12) g.fillRect(x, y - 6, 3, 3);
    });
  });
  {
    const mx = -26.96, my = F + 2.36, mz = -39.75;
    atlas.plane(menuR, 1.12, 0.7, mat4({ x: mx + 0.021, y: my, z: mz }, { x: 0, y: Math.PI / 2, z: 0 }));
    inn.box('#6b4a2e', mx, my, mz, 0.04, 0.78, 1.2);
    for (const s of [-1, 1]) inn.beam('#2a2b2e', V(mx, my + 0.39, mz + s * 0.45), V(-27.0, F + EAVE - 0.2, mz + s * 0.45), 0.012, 0.012);
    // a sheaf of dried wheat on the back wall where the menu would not fit
    const wx = IX0 + 0.06, wy = F + 2.35, wz = -37.1;
    const rw = rng(9);
    for (let i = 0; i < 26; i++) {
      const a = (rw() - 0.5) * 1.1, d = 0.5 + rw() * 0.15;
      const top = V(wx + 0.02 + rw() * 0.04, wy + Math.cos(a) * d, wz + Math.sin(a) * d);
      const bot = V(wx + 0.02, wy - 0.3 - rw() * 0.1, wz + Math.sin(a) * 0.08 - (rw() - 0.5) * 0.05);
      inn.beam(new THREE.Color('#c9a35c').multiplyScalar(0.8 + rw() * 0.3), bot, top, 0.008, 0.008);
      const ear = new THREE.SphereGeometry(1, 6, 4);
      inn.add(ear, new THREE.Color('#d8b46a').multiplyScalar(0.8 + rw() * 0.3), mat4({ x: top.x, y: top.y + 0.04, z: top.z }, { x: a, y: 0, z: 0 }, { x: 0.018, y: 0.06, z: 0.018 }));
    }
    inn.add(new THREE.TorusGeometry(0.05, 0.015, 5, 10), '#8a3b33', mat4({ x: wx + 0.03, y: wy - 0.05, z: wz }, { x: Math.PI / 2, y: 0, z: 0 }));
  }

  // =========================================================================
  // Work table, dough, rolling pin, flour, copper pans
  // =========================================================================
  {
    const tx0 = -28.75, tx1 = -27.55, tz0 = -38.4, tz1 = -36.4, ty = F + 0.92;
    int.boxMinMax(woodLt, tx0, ty - 0.07, tz0, tx1, ty, tz1, { collide: false });
    for (const [x, z] of [[tx0 + 0.06, tz0 + 0.06], [tx1 - 0.06, tz0 + 0.06], [tx0 + 0.06, tz1 - 0.06], [tx1 - 0.06, tz1 - 0.06]]) int.box(woodDk, x, F + (ty - 0.07 - F) / 2, z, 0.08, ty - 0.07 - F, 0.08, { collide: false });
    int.boxMinMax(woodDk, tx0 + 0.04, F + 0.18, tz0 + 0.04, tx1 - 0.04, F + 0.21, tz1 - 0.04, { collide: false });
    W.physics.addBox(tx0, F, tz0, tx1, ty, tz1, { walk: false });
    // flour dusting
    for (let i = 0; i < 4; i++) {
      const g = new THREE.CircleGeometry(0.07 + R() * 0.07, 16);
      const pa = g.attributes.position as THREE.BufferAttribute;
      for (let k = 1; k < pa.count; k++) { const f = 0.7 + R() * 0.5; pa.setXY(k, pa.getX(k) * f, pa.getY(k) * f); }
      g.rotateX(-Math.PI / 2);
      inn.add(g, '#e2d2b4', mat4({ x: tx0 + 0.25 + R() * 0.7, y: ty + 0.002 + i * 0.0004, z: tz0 + 0.3 + R() * 1.4 }, { x: 0, y: R() * 3, z: 0 }, { x: 1, y: 1, z: 0.6 + R() * 0.5 }));
    }
    // dough ball + flattened dough + rolling pin
    const dough = new THREE.SphereGeometry(0.11, 14, 8);
    dough.scale(1, 0.55, 1);
    dough.translate(0, 0.05, 0);
    inn.add(dough, '#eedfc0', at(-28.25, ty, -37.85));
    const flat = new THREE.CylinderGeometry(0.2, 0.21, 0.018, 18);
    flat.scale(1, 1, 0.7);
    flat.translate(0, 0.009, 0);
    inn.add(flat, '#efe0c4', at(-28.05, ty + 0.003, -37.15));
    const pin = new THREE.CylinderGeometry(0.03, 0.03, 0.32, 10);
    pin.rotateX(Math.PI / 2);
    inn.add(pin, '#caa171', mat4({ x: -27.85, y: ty + 0.033, z: -37.25 }, { x: 0, y: 0.5, z: 0 }));
    for (const s of [-1, 1]) {
      const h = new THREE.CylinderGeometry(0.012, 0.014, 0.1, 8);
      h.rotateX(Math.PI / 2);
      h.translate(0, 0, s * 0.21);
      inn.add(h, '#8a5f38', mat4({ x: -27.85, y: ty + 0.033, z: -37.25 }, { x: 0, y: 0.5, z: 0 }));
    }
    // shaped loaves proofing on a floured board
    inn.box('#c9a172', -28.5, ty + 0.012, -36.85, 0.34, 0.02, 0.5);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.SphereGeometry(0.07, 12, 7);
      g.scale(1, 0.55, 1.3);
      g.translate(0, 0.035, 0);
      inn.add(g, '#ead8b4', at(-28.5, ty + 0.022, -37.0 + i * 0.15));
    }
    // flour crock + scoop, a bowl
    const crock = new THREE.CylinderGeometry(0.1, 0.09, 0.22, 14);
    crock.translate(0, 0.11, 0);
    inn.add(crock, '#d9cdb5', at(-28.55, ty, -38.2));
    inn.add(new THREE.CylinderGeometry(0.095, 0.095, 0.01, 14), '#f6f3ec', at(-28.55, ty + 0.2, -38.2));
    const bowl = new THREE.CylinderGeometry(0.13, 0.075, 0.085, 16);
    bowl.translate(0, 0.0425, 0);
    inn.add(bowl, '#7c8f9a', at(-27.8, ty, -38.05));
    const bd = new THREE.SphereGeometry(0.115, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    bd.scale(1, 0.35, 1); bd.translate(0, 0.075, 0);
    inn.add(bd, '#eadbbd', at(-27.8, ty, -38.05));
    // things on the lower shelf
    for (let i = 0; i < 3; i++) {
      const b = new THREE.CylinderGeometry(0.12, 0.07, 0.08, 14);
      b.translate(0, 0.04, 0);
      inn.add(b, ['#c7b9a4', '#7c8f9a', '#a8553c'][i], at(-28.15 + (i - 1) * 0.12, F + 0.21, -37.9 + i * 0.45));
    }
    // pot rack hanging from the tie beam with copper pans
    const rackY = F + 2.32;
    int.box(woodDk, -28.6, rackY, -37.4, 0.06, 0.05, 1.7, { collide: false });
    for (const z of [-38.15, -36.65]) inn.beam('#2a2b2e', V(-28.6, rackY, z), V(-28.6, F + EAVE - 0.2, z), 0.015, 0.015);
    const pans: [number, number][] = [[-38.0, 0.14], [-37.62, 0.11], [-37.28, 0.12], [-36.95, 0.09]];
    for (const [z, r] of pans) {
      const pan = new THREE.CylinderGeometry(r, r * 0.86, 0.05, 18);
      pan.rotateZ(Math.PI / 2);
      const hy = rackY - 0.06 - 0.16 - r;
      int.add(copper, pan, at(-28.6, hy, z));
      int.box(copper, -28.6, rackY - 0.06 - 0.08, z, 0.025, 0.16, 0.025, { collide: false });
      int.add(copper, new THREE.TorusGeometry(0.025, 0.006, 4, 8), at(-28.6, rackY - 0.04, z, Math.PI / 2));
    }
    // a hanging ladle and whisk
    beam(int, copper, V(-28.6, rackY - 0.05, -36.75), V(-28.6, rackY - 0.38, -36.75), 0.018, 0.012);
  }

  // flour sacks in the south-west corner and by the oven
  P.flourSack(inn, at(-29.55, F, -34.98, 0.4), 1, 1);
  P.flourSack(inn, at(-29.1, F, -34.92, -0.3), 0.95, 2);
  P.flourSack(inn, at(-29.62, F, -35.48, 0.9), 1.05, 3);
  P.flourSack(inn, mat4({ x: -29.35, y: F + 0.36, z: -35.15 }, { x: 0, y: 1.2, z: 1.35 }), 0.9, 4);
  W.physics.addBox(IX0, F, -35.75, -28.85, F + 0.6, IZ1, { walk: false });

  // =========================================================================
  // Window display (inside the big front window) + bread rack by the north window
  // =========================================================================
  {
    const x0 = -24.78, x1 = IX1 - 0.01, z0 = -40.65, z1 = -37.75;
    int.boxMinMax(woodLt, x0, F + 0.66, z0, x1, F + 0.7, z1, { collide: false });
    int.boxMinMax(woodDk, x0, F, z0, x0 + 0.04, F + 0.66, z1, { collide: false });
    int.boxMinMax(woodLt, x0, F + 0.95, z0 + 0.3, x0 + 0.28, F + 0.99, z1 - 0.3, { collide: false });
    for (const z of [z0 + 0.32, z1 - 0.32]) int.boxMinMax(woodDk, x0, F + 0.7, z - 0.02, x0 + 0.28, F + 0.95, z + 0.02, { collide: false });
    W.physics.addBox(x0, F, z0, IX1, F + 1.2, z1, { walk: false });
    P.cake(inn, at(-24.4, F + 0.7, -39.2));
    P.boule(inn, at(-24.45, F + 0.7, -40.35), 0.11, { score: 'leaf' });
    P.boule(inn, at(-24.42, F + 0.7, -38.05), 0.1, { score: 'cross' });
    P.boule(inn, at(-24.62, F + 0.99, -38.6), 0.09, { score: 'ear', dark: 0.4 });
    for (let i = 0; i < 4; i++) P.croissant(inn, at(-24.66, F + 0.99, -39.9 + i * 0.16, R() * 0.4 + Math.PI / 2), 0.95);
    // crock of baguettes standing up
    const ck = new THREE.CylinderGeometry(0.09, 0.08, 0.24, 14);
    ck.translate(0, 0.12, 0);
    inn.add(ck, '#c8b79a', at(-24.38, F + 0.7, -39.75));
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      P.baguette(inn, mat4({ x: -24.38 + Math.cos(a) * 0.035, y: F + 0.72 + 0.27, z: -39.75 + Math.sin(a) * 0.035 }, { x: 0, y: a, z: Math.PI / 2 - 0.12 }), 0.56, 0.026);
    }
  }
  {
    // slanted bread rack against the north wall (customer side): take a sourdough loaf here
    const x0 = -25.78, x1 = -24.82, zb = IZ0;
    for (const x of [x0 + 0.03, x1 - 0.03]) int.boxMinMax(woodDk, x - 0.025, F, zb, x + 0.025, F + 1.05, zb + 0.48, { collide: false });
    for (let i = 0; i < 3; i++) {
      const y = F + 0.25 + i * 0.32, d = 0.46 - i * 0.12;
      int.box(woodLt, (x0 + x1) / 2, y, zb + d / 2, x1 - x0, 0.03, d, { rotX: 0.18, collide: false });
      int.box(woodDk, (x0 + x1) / 2, y + 0.05, zb + d - 0.01, x1 - x0, 0.06, 0.02, { collide: false });
      for (let k = 0; k < 4; k++) P.boule(inn, mat4({ x: x0 + 0.14 + k * 0.23, y: y + 0.015, z: zb + d * 0.55 }, { x: 0.18, y: R() * 3, z: 0 }), 0.095 + R() * 0.012, { score: (['cross', 'ear', 'leaf'] as const)[(i + k) % 3], dark: R() * 0.4 });
    }
    W.physics.addSegment(x0 + 0.2, zb + 0.24, x1 - 0.2, zb + 0.24, 0.24, F, F + 1.05);
  }
  // a tall basket of baguettes by the door
  P.basket(inn, at(-24.48, F, -34.98), 0.19, 0.42, '#9b7444');
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1;
    P.baguette(inn, mat4({ x: -24.48 + Math.cos(a) * 0.07, y: F + 0.42, z: -34.98 + Math.sin(a) * 0.07 }, { x: 0, y: a, z: Math.PI / 2 - 0.15 - R() * 0.1 }), 0.62, 0.028);
  }
  W.physics.addCylinder(-24.48, -34.98, 0.22, F, F + 0.8);

  // =========================================================================
  // Pendant lamps + the door bell
  // =========================================================================
  for (const [x, z, y] of [[-25.4, -39.9, 2.35], [-25.4, -36.9, 2.35], [-27.0, -37.6, 2.45]]) {
    const yy = F + y;
    inn.beam('#1d1d1f', V(x, yy + 0.16, z), V(x, F + EAVE - 0.19, z), 0.012, 0.012);
    const sh = new THREE.ConeGeometry(0.2, 0.18, 18, 1, true);
    sh.translate(0, -0.09 + 0.18, 0);
    inn.add(sh, '#3d5a47', at(x, yy - 0.02, z));
    const shIn = new THREE.ConeGeometry(0.195, 0.175, 18, 1, true);
    shIn.scale(-1, 1, 1);
    shIn.translate(0, -0.09 + 0.18, 0);
    inn.add(shIn, '#f2eadb', at(x, yy - 0.02, z));
    inn.add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), '#2a2a2a', at(x, yy + 0.16, z));
    glow.add(new THREE.SphereGeometry(0.05, 10, 6), '#ffd8a0', at(x, yy + 0.03, z));
    W.lamps.add(new THREE.Vector3(x, yy - 0.05, z), '#ffcf96', 1.9, 5.8);
  }
  {
    // shop bell on a curly bracket above the door, inside
    const bz = Z0 + DOOR.u1 - 0.12;
    inn.box('#2a2b2e', IX1 - 0.12, F + 2.3, bz, 0.24, 0.02, 0.02);
    const bell = new THREE.ConeGeometry(0.045, 0.07, 10, 1, true);
    inn.add(bell, '#cfa64c', at(IX1 - 0.22, F + 2.24, bz));
    inn.add(new THREE.SphereGeometry(0.012, 6, 4), '#a3802e', at(IX1 - 0.22, F + 2.2, bz));
  }

  // =========================================================================
  // The front: door, awning, sign, lantern, flower boxes, A-frame, bench
  // =========================================================================
  const door = makeDoor({
    hinge: new THREE.Vector3(X1, F, Z0 + DOOR.u0 + 0.02), w: DOOR.u1 - DOOR.u0 - 0.04, h: 2.16, dir: [0, 1], swing: -1,
    mat: M.paint('#8c3b33', 0.5), knob: M.paint('#c9a24c', 0.3, 0.8), glass: M.glass(0.6), name: 'bakery door',
    onToggle: (open) => { if (open) W.audio.play('shop_bell', { pos: new THREE.Vector3(X1, F + 2.2, Z0 + DOOR.u1), volume: 0.8 }); },
  });
  W.scene.add(door.group);
  door.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== M.paint('#8c3b33', 0.5)) m.castShadow = false; });

  // striped awning over the display window
  {
    const z0 = Z0 + 0.5, z1 = Z0 + 4.1, x0 = X1 + HT, x1 = X1 + 1.25, yT = F + 2.74, yL = F + 2.2;
    const n = 10, sw = (z1 - z0) / n;
    const len = Math.hypot(x1 - x0, yT - yL);
    const red = '#a83a33', cream = '#f2e7d0';
    for (let i = 0; i < n; i++) {
      const zc = z0 + (i + 0.5) * sw, c = i % 2 ? cream : red;
      out.beam(c, V(x0, yT, zc), V(x1, yL, zc), sw + 0.002, 0.02);
      // valance strip + scallop, both sides
      out.box(c, x1 + 0.005, yL - 0.08, zc, 0.012, 0.17, sw);
      for (const s of [1, -1]) {
        const sc = new THREE.CircleGeometry(sw / 2, 8, Math.PI, Math.PI);
        sc.rotateY(s * Math.PI / 2);
        out.add(sc, c, at(x1 + 0.005 + s * 0.007, yL - 0.165, zc));
      }
    }
    void len;
    // cheeks + iron arms
    for (const z of [z0 + 0.06, (z0 + z1) / 2, z1 - 0.06]) out.rod('#26272a', V(x0, F + 2.1, z), V(x1 - 0.03, yL + 0.01, z), 0.012, 5);
    out.box('#26272a', x0 + 0.02, yT + 0.02, (z0 + z1) / 2, 0.04, 0.05, z1 - z0 + 0.1);
  }

  // hanging sign in the front gable
  {
    const sx = X1 + HT + 0.09, sy = F + EAVE + 0.62, sw = 2.4, sh = 0.82;
    const r = atlas.region(768, 262, (g, w, h) => {
      paintBoard(g, w, h, '#2f4a3a', '#e8d9b0', 7);
      // inner gold pinstripe
      g.strokeStyle = 'rgba(214,176,96,0.9)'; g.lineWidth = 3;
      g.strokeRect(30, 30, w - 60, h - 60);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(0,0,0,0.35)';
      fitText(g, 'Crumb & Clover', w / 2 + 3, 138 + 3, w - 150, 96, SERIF_FONT, 'italic bold');
      g.fillStyle = '#f3e7c8';
      fitText(g, 'Crumb & Clover', w / 2, 138, w - 150, 96, SERIF_FONT, 'italic bold');
      // BAKERY spaced
      g.fillStyle = '#d9b46a';
      g.font = `bold 40px ${SERIF_FONT}`;
      const word = 'BAKERY', sp = 18;
      let tw = 0; for (const ch of word) tw += g.measureText(ch).width + sp; tw -= sp;
      let x = w / 2 - tw / 2;
      g.textAlign = 'left';
      for (const ch of word) { g.fillText(ch, x, 206); x += g.measureText(ch).width + sp; }
      // little rules each side of BAKERY
      g.fillRect(w / 2 - tw / 2 - 120, 192, 96, 3);
      g.fillRect(w / 2 + tw / 2 + 24, 192, 96, 3);
      // clover leaf ornaments in the corners
      const clover = (cx: number, cy: number, s: number) => {
        g.fillStyle = '#7fae6e';
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + k * (Math.PI * 2 / 3);
          g.beginPath(); g.arc(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55, s * 0.5, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = '#7fae6e'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + s * 0.4, cy + s * 0.9, cx + s * 0.2, cy + s * 1.3); g.stroke();
      };
      clover(70, 92, 20); clover(w - 70, 92, 20);
      // wheat sprigs at the bottom corners
      const wheat = (cx: number, cy: number, dir: number) => {
        g.strokeStyle = '#d9b46a'; g.fillStyle = '#d9b46a'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dir * 40, cy - 50); g.stroke();
        for (let k = 0; k < 5; k++) {
          const t = 0.3 + k * 0.15, px = cx + dir * 40 * t, py = cy - 50 * t;
          for (const s of [-1, 1]) { g.beginPath(); g.ellipse(px + s * 7, py - 2, 4, 9, s * 0.6 * dir, 0, Math.PI * 2); g.fill(); }
        }
      };
      wheat(64, 228, 1); wheat(w - 64, 228, -1);
    });
    const m = mat4({ x: sx + 0.031, y: sy, z: ZC }, { x: 0, y: Math.PI / 2, z: 0 });
    atlas.plane(r, sw, sh, m);
    out.box('#4a3322', sx, sy, ZC, 0.06, sh + 0.08, sw + 0.08);
    // two chains from eye bolts in the gable
    for (const s of [-1, 1]) {
      const z = ZC + s * (sw / 2 - 0.25);
      for (let k = 0; k < 5; k++) {
        const y = sy + sh / 2 + 0.04 + k * 0.07;
        const link = new THREE.TorusGeometry(0.022, 0.006, 4, 8);
        out.add(link, '#2a2a2c', mat4({ x: sx, y: y + 0.035, z }, { x: 0, y: k % 2 ? 0 : Math.PI / 2, z: 0 }));
      }
      out.box('#2a2a2c', (sx + X1 + HT) / 2, sy + sh / 2 + 0.42, z, sx - X1 - HT + 0.04, 0.03, 0.03);
    }
  }

  // wall lantern by the door
  {
    const lz = Z0 + 6.45, ly = F + 2.05, lx = X1 + HT + 0.22;
    out.box('#222326', X1 + HT + 0.11, ly + 0.28, lz, 0.22, 0.03, 0.03);
    out.box('#222326', X1 + HT + 0.01, ly + 0.15, lz, 0.02, 0.4, 0.1);
    out.box('#222326', lx, ly + 0.2, lz, 0.18, 0.03, 0.18);
    const cap = new THREE.ConeGeometry(0.14, 0.1, 4);
    cap.rotateY(Math.PI / 4);
    out.add(cap, '#222326', at(lx, ly + 0.26, lz));
    out.box('#222326', lx, ly - 0.17, lz, 0.16, 0.03, 0.16);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.box('#222326', lx + dx * 0.075, ly + 0.015, lz + dz * 0.075, 0.015, 0.36, 0.015);
    ext.box(glowLantern, lx, ly + 0.01, lz, 0.13, 0.32, 0.13, { collide: false });
    W.lamps.add(new THREE.Vector3(lx + 0.1, ly, lz), '#ffbd70', 2.6, 6.5, { nightOnly: true });
  }

  // flower boxes
  const flowerBox = (cx: number, cz: number, len: number, n: [number, number], y: number, seed: number) => {
    const r = rng(seed);
    const alongX = n[0] === 0;
    const bw = 0.24, bh = 0.2;
    const ox = cx + n[0] * (HT + bw / 2 + 0.01), oz = cz + n[1] * (HT + bw / 2 + 0.01);
    const sx = alongX ? len : bw, sz = alongX ? bw : len;
    out.box('#5c6e4f', ox, y + bh / 2, oz, sx, bh, sz);
    out.box('#46392c', ox, y + bh - 0.01, oz, sx - 0.04, 0.02, sz - 0.04);
    for (const k of [-0.35, 0.35]) out.box('#222326', cx + n[0] * (HT + 0.08) + (alongX ? k * len : 0), y - 0.08, cz + n[1] * (HT + 0.08) + (alongX ? 0 : k * len), alongX ? 0.03 : 0.16, 0.16, alongX ? 0.16 : 0.03);
    const cols = ['#de7090', '#f4eeee', '#a98bd0', '#eecb5a', '#d9575f', '#f2a5bd'];
    const cnt = Math.round(len * 20);
    for (let i = 0; i < cnt; i++) {
      const t = (i + r() * 0.8) / cnt - 0.5;
      const px = ox + (alongX ? t * len : (r() - 0.5) * 0.15), pz = oz + (alongX ? (r() - 0.5) * 0.15 : t * len);
      // foliage clump
      for (let k = 0; k < 2; k++) {
        const leaf = new THREE.IcosahedronGeometry(0.04 + r() * 0.025, 0);
        out.add(leaf, new THREE.Color('#3f6b34').multiplyScalar(0.75 + r() * 0.45), mat4({ x: px + (r() - 0.5) * 0.06, y: y + bh + 0.03 + r() * 0.04, z: pz + (r() - 0.5) * 0.06 }, { x: r(), y: r() * 3, z: 0 }, { x: 1, y: 0.75, z: 1 }));
      }
      if (r() < 0.8) {
        const fc = new THREE.Color(cols[Math.floor(r() * cols.length)]);
        const fy = y + bh + 0.08 + r() * 0.07;
        for (let k = 0; k < 3; k++) out.add(new THREE.IcosahedronGeometry(0.018 + r() * 0.01, 0), fc.clone().multiplyScalar(0.9 + r() * 0.2), mat4({ x: px + (r() - 0.5) * 0.06, y: fy + (r() - 0.5) * 0.03, z: pz + (r() - 0.5) * 0.06 }, { x: r(), y: r(), z: 0 }));
      }
      // trailing ivy over the front edge
      if (r() < 0.3) {
        const hang = 0.12 + r() * 0.22;
        const ex = n[0] * (bw / 2 + 0.015), ez = n[1] * (bw / 2 + 0.015);
        for (let k = 0; k < 5; k++) out.add(new THREE.IcosahedronGeometry(0.02, 0), new THREE.Color('#4e7a3c').multiplyScalar(0.8 + r() * 0.4), at(px + ex + n[0] * k * 0.006, y + bh - 0.01 - (k * hang) / 4, pz + ez + n[1] * k * 0.006, r() * 3));
      }
    }
  };
  flowerBox(X1, Z0 + 2.3, 3.0, [1, 0], F + 0.42, 11);
  flowerBox(-25.3, Z0, 1.1, [0, -1], F + 0.78, 12);
  flowerBox(-25.2, Z1, 1.1, [0, 1], F + 0.78, 13);
  flowerBox(-28.1, Z1, 1.1, [0, 1], F + 0.78, 14);

  // chalkboard A-frame by the door
  {
    const ax = X1 + 0.95, az = Z1 + 0.25, yaw = Math.PI / 2 - 0.45; // faces roughly +x, turned toward the path
    const gy = heightAt(ax, az);
    const L = 0.95, tilt = 0.17, bw = 0.6;
    const r = atlas.region(256, 400, (g, w, h) => {
      chalkBoard(g, w, h, 9);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(250,246,236,0.95)';
      fitText(g, 'Fresh bread', w / 2, 62, w - 30, 40, CHALK_FONT, 'bold');
      fitText(g, 'today!', w / 2, 104, w - 30, 40, CHALK_FONT, 'bold');
      g.strokeStyle = 'rgba(250,246,236,0.6)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(40, 124); g.lineTo(w - 40, 124); g.stroke();
      g.fillStyle = 'rgba(255,168,190,0.95)';
      fitText(g, 'Cinnamon buns', w / 2, 178, w - 30, 32, CHALK_FONT);
      g.fillStyle = 'rgba(255,224,140,0.95)';
      fitText(g, 'Sourdough', w / 2, 232, w - 30, 34, CHALK_FONT);
      g.fillStyle = 'rgba(170,220,255,0.9)';
      fitText(g, 'Croissants', w / 2, 284, w - 30, 30, CHALK_FONT);
      // a chalk loaf doodle
      g.strokeStyle = 'rgba(250,246,236,0.85)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(w / 2, 340, 52, 24, 0, Math.PI, 0); g.lineTo(w / 2 + 52, 350); g.lineTo(w / 2 - 52, 350); g.closePath(); g.stroke();
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(w / 2 + k * 22 - 8, 328); g.lineTo(w / 2 + k * 22 + 8, 318); g.stroke(); }
    });
    const base = mat4({ x: ax, y: gy, z: az }, { x: 0, y: yaw, z: 0 });
    for (const s of [1, -1]) {
      // board centre: hinge at top, splayed at the bottom
      const local = mat4({ x: 0, y: L / 2 * Math.cos(tilt) + 0.02, z: s * (L / 2) * Math.sin(tilt) }, { x: -tilt, y: s === 1 ? 0 : Math.PI, z: 0 });
      const m = new THREE.Matrix4().multiplyMatrices(base, local);
      out.add(new THREE.BoxGeometry(bw, L, 0.03), '#7a5534', m);
      const pm = new THREE.Matrix4().multiplyMatrices(m, mat4({ x: 0, y: 0.03, z: 0.017 }));
      atlas.plane(r, bw - 0.08, L - 0.16, pm);
    }
    W.physics.addCylinder(ax, az, 0.32, gy, gy + 1.0);
  }

  // bench on the lawn, facing the farm (+x)
  {
    const bx = X1 + 2.0, bz = Z0 + 0.4, gy = heightAt(bx, bz);
    const len = 1.5, sy = gy + 0.45;
    for (let i = 0; i < 3; i++) out.box('#8a5c38', bx - 0.15 + i * 0.13, sy, bz, 0.11, 0.035, len);
    for (let i = 0; i < 3; i++) out.box('#8a5c38', bx - 0.27 - i * 0.016, sy + 0.2 + i * 0.13, bz, 0.03, 0.09, len, { x: 0, y: 0, z: 0.12 });
    for (const dz of [-len / 2 + 0.12, len / 2 - 0.12]) {
      out.box('#26272a', bx - 0.12, gy + 0.22, bz + dz, 0.05, 0.44, 0.05);
      out.box('#26272a', bx + 0.1, gy + 0.22, bz + dz, 0.05, 0.44, 0.05);
      out.box('#26272a', bx - 0.26, gy + 0.62, bz + dz, 0.04, 0.62, 0.05, { x: 0, y: 0, z: 0.12 });
      out.box('#26272a', bx - 0.06, sy + 0.2, bz + dz, 0.38, 0.04, 0.05);
      out.box('#26272a', bx + 0.13, sy + 0.1, bz + dz, 0.04, 0.2, 0.05);
    }
    W.physics.addBox(bx - 0.32, gy, bz - len / 2, bx + 0.16, sy + 0.02, bz + len / 2, { walk: false });
    W.interact.add({
      pos: new THREE.Vector3(bx, sy + 0.1, bz), radius: 0.5, range: 2.4, label: 'Sit on the bench',
      onUse: () => W.mount({
        pose: () => ({ pos: new THREE.Vector3(bx - 0.06, sy + 0.7, bz), yaw: -Math.PI / 2 }),
        exit: new THREE.Vector3(bx + 0.7, gy, bz), label: 'A rest outside Crumb & Clover', yawRange: 1.7,
      }),
    });
  }

  // =========================================================================
  // Interactions inside
  // =========================================================================
  const held: Record<string, THREE.Object3D> = {};
  const take = (kind: 'croissant' | 'sourdough' | 'bun', label: string, msg: string) => () => {
    held[kind] ??= P.heldMesh(kind);
    W.hold(held[kind], label);
    W.toast(msg);
  };
  W.interact.add({ pos: new THREE.Vector3(-26.4, F + 0.95, -40.4), radius: 0.28, label: 'Take a croissant', onUse: take('croissant', 'a warm croissant', 'A warm croissant, flaky and buttery. Mind the crumbs.') });
  W.interact.add({ pos: new THREE.Vector3(-26.38, F + 1.12, -37.75), radius: 0.22, label: 'Take a cinnamon bun', onUse: take('bun', 'a cinnamon bun', 'A sticky cinnamon bun, still warm from the oven.') });
  W.interact.add({ pos: new THREE.Vector3(-25.3, F + 0.75, -41.15), radius: 0.36, label: 'Take a sourdough loaf', onUse: take('sourdough', 'a sourdough loaf', 'A sourdough loaf. The crust still crackles as it cools.') });
  W.interact.add({
    pos: new THREE.Vector3(-26.3, F + 1.0, -37.22), radius: 0.13, range: 2.4, label: 'Ring the bell',
    onUse: () => { W.audio.play('shop_bell', { pos: new THREE.Vector3(-26.3, F + 1, -37.22), volume: 0.9, rate: 1.25 }); W.toast('Ding! Nobody comes, but the bread smells wonderful.'); },
  });

  addIndoorVolume(new THREE.Vector3(IX0, F - 0.05, IZ0), new THREE.Vector3(IX1, F + EAVE + RISE, IZ1));

  // =========================================================================
  // Chicken coop and run (north-west, behind the bakery)
  // =========================================================================
  buildCoop(ext, out, atlas);

  // =========================================================================
  // finish
  // =========================================================================
  const extG = ext.build();
  castOnly(extG, [siding, shingle, brick, M.boards('#a3382b', 0.16)]);
  W.scene.add(extG);
  const gm = glow.build(vglowMat(4.5));
  if (gm) W.scene.add(gm);
  const om = out.build(undefined, { cast: true });
  const im = inn.build(undefined, { cast: false });
  if (om) W.scene.add(om);
  if (im) W.scene.add(im);
  const am = atlas.build();
  if (am) W.scene.add(am);

  // smoke follows the oven fire and the light
  W.onUpdate((dt, time) => {
    const u = smoke.uniforms;
    u.uTime.value = time;
    u.uAmt.value = fire.lit;
    u.uPx.value = ctx.renderer.getPixelRatio();
    const day = U.uDay.value;
    u.uCol.value.setRGB(0.22 + 0.62 * day, 0.22 + 0.6 * day, 0.24 + 0.58 * day);
    u.uWind.value.copy(U.uWindDir.value);
  });
}

// ---------------------------------------------------------------------------
// Chicken coop: a little red henhouse on legs with a ramp, nesting boxes and a
// wire run. The run stays empty and walkable for the chickens; the player is
// kept out by the fence.
// ---------------------------------------------------------------------------
function buildCoop(ext: Builder, out: VBuilder, atlas: Atlas) {
  const G = padHeightAt(COOP.x, COOP.z);
  const red = M.boards('#a3382b', 0.16);
  const trim = M.trim('#f3ecdc');
  // run rectangle
  const RX0 = -37.0, RX1 = -31.2, RZ0 = -49.8, RZ1 = -44.4;
  // henhouse body (north-west corner of the run)
  const hx0 = -36.65, hx1 = -34.85, hz0 = -49.5, hz1 = -48.1;
  const y0 = G + 0.55, yF = y0 + 1.05, yB = y0 + 0.78; // front (south) taller, roof slopes north
  // legs
  for (const [x, z] of [[hx0 + 0.06, hz0 + 0.06], [hx1 - 0.06, hz0 + 0.06], [hx0 + 0.06, hz1 - 0.06], [hx1 - 0.06, hz1 - 0.06]]) out.box('#6b5038', x, G + 0.25, z, 0.1, 0.62, 0.1);
  // floor
  out.box('#6b5038', (hx0 + hx1) / 2, y0 - 0.04, (hz0 + hz1) / 2, hx1 - hx0 + 0.04, 0.08, hz1 - hz0 + 0.04);
  // walls (front south face 1.05 tall, back north 0.78, sides sloped)
  ext.boxMinMax(red, hx0, y0, hz1 - 0.06, hx1, yF, hz1, { collide: false });
  ext.boxMinMax(red, hx0, y0, hz0, hx1, yB, hz0 + 0.06, { collide: false });
  for (const x of [hx0, hx1 - 0.06]) {
    const sh = new THREE.Shape([new THREE.Vector2(hz0, 0), new THREE.Vector2(hz1, 0), new THREE.Vector2(hz1, yF - y0), new THREE.Vector2(hz0, yB - y0)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false });
    // shape x -> world z, shape y -> world y, depth -> world x
    g.rotateY(-Math.PI / 2);
    g.translate(0, 0, 0);
    ext.add(red, g, mat4({ x: x + 0.06, y: y0, z: 0 }));
  }
  W.physics.addBox(hx0 - 0.4, G, hz0, hx1 + 0.45, yF + 0.1, hz1, { walk: false });
  // white trim on the corners and edges
  for (const [x, z] of [[hx0, hz1], [hx1, hz1], [hx0, hz0], [hx1, hz0]]) ext.box(trim, x, y0 + (z === hz1 ? (yF - y0) / 2 : (yB - y0) / 2), z, 0.07, z === hz1 ? yF - y0 : yB - y0, 0.07, { collide: false });
  ext.box(trim, (hx0 + hx1) / 2, y0 + 0.03, hz1 + 0.01, hx1 - hx0 + 0.06, 0.06, 0.04, { collide: false });
  // shed roof sloping north
  {
    const slope = Math.atan2(yF - yB, hz1 - hz0);
    const len = (hz1 - hz0 + 0.5) / Math.cos(slope);
    const cz = (hz0 + hz1) / 2, cy = (yF + yB) / 2 + 0.05;
    out.box('#5d6266', (hx0 + hx1) / 2, cy, cz, hx1 - hx0 + 0.4, 0.05, len, { x: slope, y: 0, z: 0 });
    for (let x = hx0 - 0.15; x < hx1 + 0.2; x += 0.22) out.box('#73787c', x, cy + 0.03, cz, 0.025, 0.02, len, { x: slope, y: 0, z: 0 });
  }
  // pop door + ramp on the south face
  const pdx = -36.2;
  out.box('#1b1712', pdx, y0 + 0.2, hz1 + 0.005, 0.3, 0.34, 0.02);
  out.box('#f3ecdc', pdx, y0 + 0.39, hz1 + 0.015, 0.36, 0.04, 0.03);
  out.box('#a3382b', pdx, y0 + 0.5, hz1 + 0.03, 0.32, 0.2, 0.02);
  {
    const a = V(pdx, y0 - 0.01, hz1 + 0.02), b = V(pdx, G + 0.02, hz1 + 1.05);
    out.beam('#7a5c40', a, b, 0.32, 0.03);
    const n = 6;
    for (let i = 1; i < n; i++) {
      const p = a.clone().lerp(b, i / n);
      out.box('#5e4530', p.x, p.y + 0.025, p.z, 0.3, 0.02, 0.025);
    }
  }
  // nesting box on the east side with a sloped lid
  {
    const nx0 = hx1, nx1 = hx1 + 0.42, nz0 = hz0 + 0.15, nz1 = hz1 - 0.15, ny0 = y0 + 0.12, ny1 = y0 + 0.6;
    ext.boxMinMax(red, nx0, ny0, nz0, nx1, ny1 - 0.08, nz1, { collide: false });
    out.box('#5d6266', (nx0 + nx1) / 2 + 0.02, ny1 - 0.04, (nz0 + nz1) / 2, nx1 - nx0 + 0.12, 0.03, nz1 - nz0 + 0.1, { x: 0, y: 0, z: -0.32 });
    for (const z of [nz0 + 0.3, nz1 - 0.3]) out.box('#26272a', nx1 + 0.01, ny1 - 0.18, z, 0.02, 0.06, 0.12);
    out.box('#f3ecdc', nx1 + 0.005, ny0 + 0.02, (nz0 + nz1) / 2, 0.03, 0.04, nz1 - nz0);
  }
  // a little vent window with wire on the west side, and a sign on the front
  out.box('#1d1a16', hx0 - 0.005, y0 + 0.6, (hz0 + hz1) / 2, 0.02, 0.26, 0.4);
  out.box('#f3ecdc', hx0 - 0.015, y0 + 0.6, (hz0 + hz1) / 2, 0.02, 0.32, 0.03);
  out.box('#f3ecdc', hx0 - 0.015, y0 + 0.6, (hz0 + hz1) / 2, 0.02, 0.03, 0.46);
  const signR = atlas.region(256, 88, (g, w, h) => {
    paintBoard(g, w, h, '#efe6cf', '#a3382b', 2);
    g.fillStyle = '#7a2a22'; g.textAlign = 'center';
    fitText(g, 'The Henhouse', w / 2, 58, w - 30, 40, SERIF_FONT, 'italic bold');
  });
  atlas.plane(signR, 0.62, 0.21, mat4({ x: -35.45, y: y0 + 0.78, z: hz1 + 0.022 }));
  out.box('#5a4030', -35.45, y0 + 0.78, hz1 + 0.008, 0.66, 0.25, 0.012);

  // feed trough + waterer inside the run
  {
    const tx = -32.6, tz = -46.6, gy = heightAt(tx, tz);
    out.box('#7a5c40', tx, gy + 0.2, tz, 1.1, 0.04, 0.22);
    out.box('#7a5c40', tx, gy + 0.26, tz - 0.1, 1.1, 0.12, 0.03);
    out.box('#7a5c40', tx, gy + 0.26, tz + 0.1, 1.1, 0.12, 0.03);
    out.box('#d8b04a', tx, gy + 0.235, tz, 1.04, 0.03, 0.17);
    for (const dx of [-0.48, 0.48]) out.box('#5e4530', tx + dx, gy + 0.1, tz, 0.05, 0.2, 0.3);
    const wx = -33.2, wz = -48.8, wy = heightAt(wx, wz);
    const tray = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16);
    tray.translate(0, 0.025, 0);
    out.add(tray, '#9aa0a3', at(wx, wy, wz));
    const drum = new THREE.CylinderGeometry(0.16, 0.18, 0.38, 16);
    drum.translate(0, 0.24, 0);
    out.add(drum, '#b4babd', at(wx, wy, wz));
    const top = new THREE.ConeGeometry(0.17, 0.1, 16);
    top.translate(0, 0.48, 0);
    out.add(top, '#b4babd', at(wx, wy, wz));
    out.add(new THREE.TorusGeometry(0.06, 0.008, 4, 10, Math.PI), '#555a5d', at(wx, wy + 0.56, wz));
  }

  // the run fence: posts, top rail, kick board, chicken wire panels, a little gate
  const wireGeos: THREE.BufferGeometry[] = [];
  const fh = 1.3;
  const sides: [number, number, number, number][] = [[RX0, RZ1, RX1, RZ1], [RX1, RZ1, RX1, RZ0], [RX1, RZ0, RX0, RZ0], [RX0, RZ0, RX0, RZ1]];
  const GATE = { z0: -46.95, z1: -45.9 };
  for (const [ax, az, bx, bz] of sides) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / 1.45));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const g0 = heightAt(x0, z0), g1 = heightAt(x1, z1);
      out.box('#7a5c40', x0, g0 + fh / 2 - 0.1, z0, 0.09, fh + 0.2, 0.09);
      // gate span on the east side
      const isGate = ax === RX1 && bx === RX1 && Math.min(z0, z1) <= GATE.z0 + 0.01 && Math.max(z0, z1) >= GATE.z1 - 0.01;
      out.beam('#8a6a4a', V(x0, g0 + fh, z0), V(x1, g1 + fh, z1), 0.06, 0.05);
      out.beam('#8a6a4a', V(x0, g0 + 0.09, z0), V(x1, g1 + 0.09, z1), 0.03, 0.16);
      wireGeos.push(wirePanel(x0, g0 + 0.17, z0, x1, g1 + 0.17, z1, fh - 0.2));
      if (isGate) {
        // gate frame inside this span (closed)
        const gx = RX1 + 0.05, gy = heightAt(gx, (GATE.z0 + GATE.z1) / 2);
        for (const z of [GATE.z0, GATE.z1]) out.box('#f3ecdc', gx, gy + 0.62, z, 0.05, 1.05, 0.05);
        out.box('#f3ecdc', gx, gy + 1.12, (GATE.z0 + GATE.z1) / 2, 0.05, 0.05, GATE.z1 - GATE.z0);
        out.box('#f3ecdc', gx, gy + 0.12, (GATE.z0 + GATE.z1) / 2, 0.05, 0.05, GATE.z1 - GATE.z0);
        out.beam('#f3ecdc', V(gx, gy + 0.14, GATE.z0), V(gx, gy + 1.1, GATE.z1), 0.04, 0.05);
        out.box('#26272a', gx + 0.04, gy + 0.85, GATE.z1 - 0.06, 0.03, 0.04, 0.12);
      }
    }
    // keep the player out (taller than you can jump)
    const gm = Math.min(heightAt(ax, az), heightAt(bx, bz));
    W.physics.addSegment(ax, az, bx, bz, 0.07, gm - 0.5, gm + 2.4);
  }
  out.box('#7a5c40', RX0, heightAt(RX0, RZ1) + fh / 2 - 0.1, RZ1, 0.09, fh + 0.2, 0.09);
  W.scene.add(mergeMesh(wireGeos, chickenWireMat()));

  // feed bin outside the gate: scatter some corn
  {
    const fx = RX1 + 0.75, fz = -46.0, gy = heightAt(fx, fz);
    out.box('#7a5c40', fx, gy + 0.32, fz, 0.55, 0.64, 0.5);
    out.box('#5e4530', fx, gy + 0.66, fz, 0.6, 0.05, 0.55, { x: 0.12, y: 0, z: 0 });
    out.box('#26272a', fx, gy + 0.55, fz + 0.255, 0.12, 0.04, 0.02);
    const pail = new THREE.CylinderGeometry(0.13, 0.11, 0.22, 12);
    pail.translate(0, 0.11, 0);
    out.add(pail, '#a4aaad', at(fx + 0.1, gy, fz + 0.5));
    out.add(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 12), '#d8b04a', at(fx + 0.1, gy + 0.2, fz + 0.5));
    W.physics.addBox(fx - 0.3, gy, fz - 0.27, fx + 0.3, gy + 0.7, fz + 0.27, { walk: false });
    W.interact.add({
      pos: new THREE.Vector3(fx, gy + 0.7, fz), radius: 0.4, label: 'Scatter some corn for the hens',
      onUse: () => { W.audio.play('chickens', { pos: new THREE.Vector3(-33.5, gy + 0.5, -47), volume: 0.9 }); W.toast('You toss a handful of corn over the wire. The hens approve.'); },
    });
  }
}
