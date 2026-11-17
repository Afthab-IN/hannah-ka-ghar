import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { W } from '../world';
import type { Collider } from '../physics';

// Building kit. Static parts go into a Builder, which merges everything per
// material into one mesh (few draw calls). Walls with real holes for doors
// and windows, window units, hinged doors, stairs and gable roofs.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function clean(geo: THREE.BufferGeometry, m?: THREE.Matrix4) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (m) g.applyMatrix4(m);
  g.clearGroups();
  return g;
}

export interface BoxOpts {
  rotY?: number; rotX?: number; rotZ?: number;
  /** collision: true (solid, walkable top), 'nowalk' (solid, top not walkable), false (none). Default: Builder.collide */
  collide?: boolean | 'nowalk';
}

export class Builder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  colliders: Collider[] = [];
  constructor(public name = 'built', public collide = true) {}

  add(mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4) {
    let a = this.parts.get(mat);
    if (!a) { a = []; this.parts.set(mat, a); }
    a.push(clean(geo, m));
  }

  /** Box by centre and full size. Rotations in radians (Y first, then X, then Z). */
  box(mat: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, o: BoxOpts = {}) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    _e.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0, 'YXZ');
    _m.compose(_p.set(cx, cy, cz), _q.setFromEuler(_e), _s.set(1, 1, 1));
    this.add(mat, geo, _m);
    const col = o.collide ?? this.collide;
    if (col && !o.rotX && !o.rotZ) this.colliders.push(W.physics.addBoxRot(cx, cy, cz, sx, sy, sz, o.rotY || 0, { walk: col !== 'nowalk' }));
  }

  /** Box between two corners (axis-aligned). */
  boxMinMax(mat: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BoxOpts = {}) {
    this.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);
  }

  /** Vertical cylinder (posts, legs). collide adds a cylinder collider. */
  cyl(mat: THREE.Material, x: number, y0: number, z: number, r: number, h: number, o: { seg?: number; rTop?: number; collide?: boolean; rotX?: number; rotZ?: number; rotY?: number } = {}) {
    const geo = new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.seg ?? 10);
    geo.translate(0, h / 2, 0);
    _e.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0, 'YXZ');
    _m.compose(_p.set(x, y0, z), _q.setFromEuler(_e), _s.set(1, 1, 1));
    this.add(mat, geo, _m);
    if (o.collide) this.colliders.push(W.physics.addCylinder(x, z, Math.max(r, o.rTop ?? r), y0, y0 + h));
  }

  /** Any geometry placed with position / rotation / scale. No collision. */
  geo(mat: THREE.Material, geo: THREE.BufferGeometry, pos: THREE.Vector3Like, rot: THREE.Vector3Like = { x: 0, y: 0, z: 0 }, scale: THREE.Vector3Like = { x: 1, y: 1, z: 1 }) {
    _e.set(rot.x, rot.y, rot.z, 'YXZ');
    _m.compose(_p.set(pos.x, pos.y, pos.z), _q.setFromEuler(_e), _s.set(scale.x, scale.y, scale.z));
    this.add(mat, geo, _m);
  }

  build(opts: { cast?: boolean; receive?: boolean } = {}): THREE.Group {
    const g = new THREE.Group();
    g.name = this.name;
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = opts.cast !== false && !(mat as any).transparent;
      mesh.receiveShadow = opts.receive !== false;
      g.add(mesh);
    }
    return g;
  }
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------
export interface Hole { u0: number; u1: number; y0: number; y1: number }
export interface WallOpts {
  a: [number, number]; // start (x, z)
  b: [number, number]; // end (x, z)
  y: number; // base height
  /** outline in wall space: u along a->b (0..length), y up from base. Default rectangle of height h. */
  outline?: [number, number][];
  h?: number;
  holes?: Hole[];
  t?: number; // total thickness (default 0.18)
  outer: THREE.Material;
  inner?: THREE.Material; // default = outer
  /** which side is outside: +1 = the left of a->b (right-hand normal rotated), -1 the other side */
  outSide?: 1 | -1;
  collide?: boolean; // default true; collides up to the rectangular height h (or outline min top)
}

/**
 * A wall slab between a and b with real holes. The outer half gets `outer`
 * material, the inner half `inner`. Normal of side +1 = (dz, -dx) of a->b, i.e.
 * for a wall running +x, side +1 faces -z.
 */
export function wall(b: Builder, o: WallOpts) {
  if ((o.outSide ?? 1) === 1) {
    // build it from the other end so the local frame stays right-handed
    const L0 = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
    const h0 = o.h ?? 2.7;
    const ol = o.outline ?? [[0, 0], [L0, 0], [L0, h0], [0, h0]];
    return wallRH(b, {
      ...o, a: o.b, b: o.a, outSide: -1,
      outline: ol.map(([u, y]) => [L0 - u, y] as [number, number]).reverse(),
      holes: (o.holes ?? []).map((ho) => ({ u0: L0 - ho.u1, u1: L0 - ho.u0, y0: ho.y0, y1: ho.y1 })),
    });
  }
  return wallRH(b, o);
}

function wallRH(b: Builder, o: WallOpts) {
  const [ax, az] = o.a, [bx, bz] = o.b;
  const L = Math.hypot(bx - ax, bz - az);
  const t = o.t ?? 0.18;
  const outline = o.outline ?? [[0, 0], [L, 0], [L, o.h ?? 2.7], [0, o.h ?? 2.7]];
  // collider height: given h, or the lowest top of the outline (eaves of a gable end)
  const h = o.h ?? Math.min(...outline.map((q) => q[1]).filter((y) => y > 0.5));
  const holes = o.holes ?? [];
  const shape = new THREE.Shape(outline.map(([u, y]) => new THREE.Vector2(u, y)));
  for (const ho of holes) {
    const p = new THREE.Path();
    p.moveTo(ho.u0, ho.y0); p.lineTo(ho.u0, ho.y1); p.lineTo(ho.u1, ho.y1); p.lineTo(ho.u1, ho.y0); p.lineTo(ho.u0, ho.y0);
    shape.holes.push(p);
  }
  const dx = (bx - ax) / L, dz = (bz - az) / L;
  const side = -1;
  // local frame: X along wall, Y up, Z = normal toward the outer side
  const nx = dz * side, nz = -dx * side;
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(dx, 0, dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
  const half = t / 2;
  const mk = (z0: number, mat: THREE.Material) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: half, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, z0);
    const m = new THREE.Matrix4().makeTranslation(ax, o.y, az).multiply(basis);
    b.add(mat, geo, m);
  };
  mk(0, o.outer);
  mk(-half, o.inner ?? o.outer);

  if (o.collide !== false) {
    // solid intervals along the wall up to height h, holes cut out where they reach the floor
    const topH = Math.min(h, ...outline.map((p) => p[1]).filter((y) => y > 0.5));
    const cuts = holes.filter((ho) => ho.y0 < 0.3).map((ho) => [ho.u0, ho.u1] as [number, number]).sort((p, q) => p[0] - q[0]);
    const spans: [number, number][] = [];
    let u = 0;
    for (const [c0, c1] of cuts) { if (c0 > u) spans.push([u, c0]); u = Math.max(u, c1); }
    if (u < L) spans.push([u, L]);
    for (const [s0, s1] of spans) addWallCollider(ax + dx * s0, az + dz * s0, ax + dx * s1, az + dz * s1, t, o.y, o.y + topH, b);
    // the wall above each door
    for (const ho of holes.filter((hh) => hh.y0 < 0.3)) {
      if (ho.y1 < topH - 0.05) addWallCollider(ax + dx * ho.u0, az + dz * ho.u0, ax + dx * ho.u1, az + dz * ho.u1, t, o.y + ho.y1, o.y + topH, b);
    }
  }
}

function addWallCollider(x0: number, z0: number, x1: number, z1: number, t: number, y0: number, y1: number, b: Builder) {
  if (Math.abs(z1 - z0) < 1e-4) b.colliders.push(W.physics.addBox(Math.min(x0, x1), y0, z0 - t / 2, Math.max(x0, x1), y1, z0 + t / 2, { walk: false }));
  else if (Math.abs(x1 - x0) < 1e-4) b.colliders.push(W.physics.addBox(x0 - t / 2, y0, Math.min(z0, z1), x0 + t / 2, y1, Math.max(z0, z1), { walk: false }));
  else b.colliders.push(W.physics.addSegment(x0, z0, x1, z1, t / 2, y0, y1));
}

/** Gable outline helper: rectangle of eave height h with a peak of `rise` in the middle. */
export function gableOutline(L: number, h: number, rise: number): [number, number][] {
  return [[0, 0], [L, 0], [L, h], [L / 2, h + rise], [0, h]];
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
export interface WindowOpts {
  /** centre of the opening on the wall centre plane */
  x: number; y: number; z: number;
  w: number; h: number;
  /** outward normal, axis aligned: [1,0], [-1,0], [0,1] or [0,-1] */
  n: [number, number];
  wallT?: number;
  frame: THREE.Material;
  glass: THREE.Material;
  muntins?: [number, number]; // columns, rows of panes (default 2 x 2)
  shutters?: THREE.Material | null;
  sill?: boolean;
  casing?: boolean; // trim boards round the outside (default true)
}

export function windowUnit(b: Builder, o: WindowOpts) {
  const t = o.wallT ?? 0.18;
  const [nx, nz] = o.n;
  const along = nx !== 0 ? 'z' : 'x';
  // helpers to place a box in (u along wall, y, d along normal) space
  const put = (mat: THREE.Material, u: number, y: number, d: number, su: number, sy: number, sd: number) => {
    const cx = o.x + (along === 'x' ? u : 0) + nx * d;
    const cz = o.z + (along === 'z' ? u : 0) + nz * d;
    if (along === 'x') b.box(mat, cx, o.y + y, cz, su, sy, sd, { collide: false });
    else b.box(mat, cx, o.y + y, cz, sd, sy, su, { collide: false });
  };
  const fw = 0.06; // frame
  // frame lining the hole
  put(o.frame, 0, o.h / 2 - fw / 2, 0, o.w, fw, t + 0.02);
  put(o.frame, 0, -o.h / 2 + fw / 2, 0, o.w, fw, t + 0.02);
  put(o.frame, -o.w / 2 + fw / 2, 0, 0, fw, o.h, t + 0.02);
  put(o.frame, o.w / 2 - fw / 2, 0, 0, fw, o.h, t + 0.02);
  // glass
  put(o.glass, 0, 0, 0.0, o.w - fw * 2, o.h - fw * 2, 0.012);
  // sashes and muntins
  const [cols, rows] = o.muntins ?? [2, 2];
  const mw = 0.03;
  for (let i = 1; i < cols; i++) put(o.frame, -o.w / 2 + (o.w * i) / cols, 0, 0, mw, o.h - fw * 2, 0.04);
  for (let j = 1; j < rows; j++) put(o.frame, 0, -o.h / 2 + (o.h * j) / rows, 0, o.w - fw * 2, j === rows / 2 ? 0.05 : mw, 0.04);
  // outside casing
  if (o.casing !== false) {
    const cw = 0.1, out = t / 2 + 0.015;
    put(o.frame, 0, o.h / 2 + cw / 2, out, o.w + cw * 2, cw, 0.03);
    put(o.frame, -o.w / 2 - cw / 2, -0.0, out, cw, o.h, 0.03);
    put(o.frame, o.w / 2 + cw / 2, -0.0, out, cw, o.h, 0.03);
    // inside casing
    put(o.frame, 0, o.h / 2 + 0.04, -out, o.w + 0.16, 0.08, 0.025);
    put(o.frame, -o.w / 2 - 0.04, 0, -out, 0.08, o.h, 0.025);
    put(o.frame, o.w / 2 + 0.04, 0, -out, 0.08, o.h, 0.025);
  }
  if (o.sill !== false) {
    put(o.frame, 0, -o.h / 2 - 0.03, t / 2 + 0.04, o.w + 0.24, 0.05, 0.12);
    put(o.frame, 0, -o.h / 2 - 0.02, -t / 2 - 0.05, o.w + 0.12, 0.04, 0.12);
  }
  if (o.shutters) {
    const sw = o.w * 0.5, out = t / 2 + 0.04;
    for (const s of [-1, 1]) {
      const u = s * (o.w / 2 + 0.1 + sw / 2);
      put(o.shutters, u, 0, out, sw, o.h + 0.04, 0.035);
      // louvre lines
      for (let k = 0; k < 9; k++) put(o.shutters, u, -o.h / 2 + 0.12 + (k * (o.h - 0.2)) / 8.5, out + 0.02, sw - 0.08, 0.025, 0.02);
    }
  }
}

// ---------------------------------------------------------------------------
// Doors that open
// ---------------------------------------------------------------------------
export interface DoorOpts {
  /** hinge position on the floor (x, y, z) */
  hinge: THREE.Vector3;
  w: number; h: number; t?: number;
  /** direction from the hinge to the latch when closed, axis aligned [1,0], [0,1]... */
  dir: [number, number];
  /** swing: +1 opens toward the left of dir, -1 to the right */
  swing?: 1 | -1;
  mat: THREE.Material; // use M.paint(...) (moving parts)
  knob?: THREE.Material;
  glass?: THREE.Material | null; // a glazed top half
  panels?: boolean;
  open?: boolean;
  name?: string; // "front door"
  sounds?: { open?: string; close?: string } | null;
  onToggle?: (open: boolean) => void;
}

export interface Door { group: THREE.Group; open: boolean; toggle(): void; collider: Collider }

export function makeDoor(o: DoorOpts): Door {
  const t = o.t ?? 0.05;
  const pivot = new THREE.Group();
  pivot.position.copy(o.hinge);
  const baseYaw = Math.atan2(-o.dir[1], o.dir[0]); // rotate local +x onto dir
  pivot.rotation.y = baseYaw;
  const leaf = new Builder('door', false);
  leaf.box(o.mat, o.w / 2, o.h / 2, 0, o.w, o.h, t);
  if (o.panels !== false) {
    const pm = o.mat;
    const rows = o.glass ? [[0.12, o.h * 0.42]] : [[0.12, o.h * 0.42], [o.h * 0.52, o.h - 0.12]];
    for (const [y0, y1] of rows) for (const s of [-1, 1]) {
      const px = o.w / 2 + s * o.w * 0.22;
      leaf.box(pm, px, (y0 + y1) / 2, s * 0, o.w * 0.34, y1 - y0, t + 0.025);
    }
  }
  if (o.glass) {
    leaf.box(o.glass, o.w / 2, o.h * 0.73, 0, o.w * 0.72, o.h * 0.4, t + 0.012);
    leaf.box(o.mat, o.w / 2, o.h * 0.73, 0, 0.03, o.h * 0.4, t + 0.03);
    leaf.box(o.mat, o.w / 2, o.h * 0.73, 0, o.w * 0.72, 0.03, t + 0.03);
  }
  const knob = o.knob ?? o.mat;
  leaf.box(knob, o.w - 0.08, 1.0, t / 2 + 0.03, 0.05, 0.05, 0.06);
  leaf.box(knob, o.w - 0.08, 1.0, -t / 2 - 0.03, 0.05, 0.05, 0.06);
  const leafGroup = leaf.build();
  pivot.add(leafGroup);

  // collider for the closed door
  const cx = o.hinge.x + (o.dir[0] * o.w) / 2, cz = o.hinge.z + (o.dir[1] * o.w) / 2;
  const sx = o.dir[0] !== 0 ? o.w : 0.12, sz = o.dir[1] !== 0 ? o.w : 0.12;
  const collider = W.physics.addBox(cx - sx / 2, o.hinge.y, cz - sz / 2, cx + sx / 2, o.hinge.y + o.h, cz + sz / 2, { walk: false });

  const swing = o.swing ?? 1;
  let angle = 0;
  const door: Door = {
    group: pivot,
    open: !!o.open,
    collider,
    toggle() {
      door.open = !door.open;
      collider.enabled = !door.open;
      const snd = o.sounds === null ? null : door.open ? o.sounds?.open ?? 'door_open' : o.sounds?.close ?? 'door_close';
      if (snd) W.audio.play(snd, { pos: new THREE.Vector3(cx, o.hinge.y + 1.2, cz), volume: 0.7 });
      o.onToggle?.(door.open);
    },
  };
  collider.enabled = !door.open;
  angle = door.open ? 1.45 : 0;
  pivot.rotation.y = baseYaw + angle * swing;
  W.onUpdate((dt) => {
    const target = door.open ? 1.45 : 0;
    if (Math.abs(target - angle) < 1e-3) return;
    angle += (target - angle) * (1 - Math.exp(-dt * 7));
    pivot.rotation.y = baseYaw + angle * swing;
  });
  const name = o.name ?? 'door';
  W.interact.add({
    pos: new THREE.Vector3(cx, o.hinge.y + 1.1, cz),
    radius: Math.max(0.45, o.w * 0.5),
    range: 2.6,
    label: () => (door.open ? `Close the ${name}` : `Open the ${name}`),
    onUse: () => door.toggle(),
  });
  leafGroup.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.receiveShadow = true;
    mesh.castShadow = mesh.material === o.mat; // the leaf only, not the glass or knobs
  });
  return door;
}

// ---------------------------------------------------------------------------
// Stairs: one walkable box per step
// ---------------------------------------------------------------------------
export interface StairOpts {
  x: number; z: number; // centre of the bottom edge of the first step
  dir: [number, number]; // climbing direction, axis aligned
  w: number; // width
  y0: number; y1: number; // bottom floor and top floor heights
  run?: number; // tread depth (default 0.27)
  mat: THREE.Material; // treads
  riserMat?: THREE.Material;
  stringer?: THREE.Material | null; // side boards
  solidBelow?: boolean; // fill under the stairs (default true)
}

/** Returns the horizontal length of the flight. */
export function stairs(b: Builder, o: StairOpts): number {
  const rise = o.y1 - o.y0;
  const n = Math.max(1, Math.round(rise / 0.18));
  const r = rise / n;
  const run = o.run ?? 0.27;
  const [dx, dz] = o.dir;
  for (let i = 0; i < n; i++) {
    const top = o.y0 + r * (i + 1);
    const d0 = i * run, d1 = (i + 1) * run;
    const cd = (d0 + d1) / 2;
    const cx = o.x + dx * cd, cz = o.z + dz * cd;
    const bottom = o.solidBelow === false ? top - 0.05 : o.y0;
    const sx = dx !== 0 ? run : o.w, sz = dz !== 0 ? run : o.w;
    // tread with a small nosing
    b.box(o.mat, cx - dx * 0.015, top - 0.02, cz - dz * 0.015, sx + Math.abs(dx) * 0.03, 0.04, sz + Math.abs(dz) * 0.03, { collide: false });
    b.box(o.riserMat ?? o.mat, cx, (bottom + top - 0.04) / 2, cz, sx, top - 0.04 - bottom, sz, { collide: false });
    b.colliders.push(W.physics.addBox(cx - sx / 2, bottom, cz - sz / 2, cx + sx / 2, top, cz + sz / 2));
  }
  if (o.stringer) {
    const L = n * run;
    for (const s of [-1, 1]) {
      const ox = dz !== 0 ? (s * (o.w / 2 + 0.03)) : 0, oz = dx !== 0 ? (s * (o.w / 2 + 0.03)) : 0;
      const ang = Math.atan2(rise, L);
      const len = Math.hypot(rise, L);
      const cx = o.x + dx * L / 2 + ox, cz = o.z + dz * L / 2 + oz;
      const yaw = Math.atan2(-dz, dx);
      b.box(o.stringer, cx, o.y0 + rise / 2 + 0.05, cz, len, 0.28, 0.05, { rotY: yaw, rotZ: ang, collide: false });
    }
  }
  return n * run;
}

// ---------------------------------------------------------------------------
// Gable roof: two sloped slabs meeting at a ridge
// ---------------------------------------------------------------------------
export interface RoofOpts {
  cx: number; cz: number;
  y: number; // height of the wall plate (where the roof meets the walls)
  len: number; // length along the ridge (without overhang)
  span: number; // total width across the ridge (wall to wall)
  rise: number; // ridge height above y
  ridge: 'x' | 'z';
  overhang?: number; // eaves and gable overhang (default 0.45)
  t?: number; // thickness
  mat: THREE.Material;
  under?: THREE.Material; // soffit / underside
  fascia?: THREE.Material;
  collide?: boolean;
}

export function gableRoof(b: Builder, o: RoofOpts) {
  const ov = o.overhang ?? 0.45;
  const t = o.t ?? 0.14;
  const half = o.span / 2;
  const slope = Math.atan2(o.rise, half);
  const tan = Math.tan(slope), cos = Math.cos(slope), sin = Math.sin(slope);
  const run = half + ov; // ridge to eave edge, horizontally
  const slopeLen = run / cos;
  const L = o.len + ov * 2;
  for (const s of [-1, 1]) {
    // underside of the slab follows the line from the ridge (y + rise) through the wall plate (y)
    const hd = run / 2;
    const yl = o.y + o.rise - hd * tan;
    const cy = yl + (cos * t) / 2;
    const off = s * (hd + (sin * t) / 2);
    const eaveY = o.y - ov * tan;
    if (o.ridge === 'x') {
      b.box(o.mat, o.cx, cy, o.cz + off, L, t, slopeLen, { rotX: s * slope, collide: false });
      if (o.under) b.box(o.under, o.cx, yl - 0.012, o.cz + s * hd, L - 0.02, 0.02, slopeLen - 0.03, { rotX: s * slope, collide: false });
      if (o.fascia) b.box(o.fascia, o.cx, eaveY + 0.02, o.cz + s * (run + 0.02), L + 0.04, 0.22, 0.04, { collide: false });
    } else {
      b.box(o.mat, o.cx + off, cy, o.cz, slopeLen, t, L, { rotZ: -s * slope, collide: false });
      if (o.under) b.box(o.under, o.cx + s * hd, yl - 0.012, o.cz, slopeLen - 0.03, 0.02, L - 0.02, { rotZ: -s * slope, collide: false });
      if (o.fascia) b.box(o.fascia, o.cx + s * (run + 0.02), eaveY + 0.02, o.cz, 0.04, 0.22, L + 0.04, { collide: false });
    }
  }
  // ridge cap
  const top = o.y + o.rise + t / cos;
  if (o.ridge === 'x') b.box(o.mat, o.cx, top, o.cz, L, 0.08, 0.26, { collide: false });
  else b.box(o.mat, o.cx, top, o.cz, 0.26, 0.08, L, { collide: false });
  return o.y + o.rise;
}

/** Height of a gable roof's underside above the plate at distance d from the ridge line. */
export function roofHeightAt(o: { y: number; span: number; rise: number }, d: number) {
  return o.y + o.rise * (1 - Math.abs(d) / (o.span / 2));
}
