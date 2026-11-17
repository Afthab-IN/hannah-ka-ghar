import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../../shaderlib';
import { W } from '../../world';
import type { Lamp } from '../../lamps';
import type { Builder } from '../kit';


// ---------------------------------------------------------------------------
// A closed slab from four top corners (any order round the quad), extruded
// straight down by `thick`. Faces are oriented outward automatically.
// ---------------------------------------------------------------------------
export function quadSlab(top: THREE.Vector3[], thick: number): THREE.BufferGeometry {
  const bot = top.map((p) => p.clone().setY(p.y - thick));
  const all = [...top, ...bot];
  const c = new THREE.Vector3();
  all.forEach((p) => c.add(p));
  c.multiplyScalar(1 / all.length);
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const fc = new THREE.Vector3().add(a).add(b).add(d).multiplyScalar(1 / 3).sub(c);
    if (n.dot(fc) < 0) pos.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, e: THREE.Vector3) => { tri(a, b, d); tri(a, d, e); };
  quad(top[0], top[1], top[2], top[3]);
  quad(bot[0], bot[1], bot[2], bot[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(top[i], top[j], bot[j], bot[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Diagonal lattice (porch skirting) in a vertical panel.
// along 'x': panel in the xy plane at z = fixed; along 'z': in the zy plane at x = fixed.
// ---------------------------------------------------------------------------
export function lattice(b: Builder, mat: THREE.Material, along: 'x' | 'z', fixed: number, u0: number, u1: number, y0: number, y1: number, pitch = 0.17) {
  const H = y1 - y0;
  for (const d of [1, -1]) {
    for (let s = u0 - H - pitch; s <= u1 + H + pitch; s += pitch) {
      // segment from (s, y0) to (s + d*H, y1), clipped to [u0, u1]
      const ua = d > 0 ? s : s - H, ub = d > 0 ? s + H : s;
      const ca = Math.max(ua, u0), cb = Math.min(ub, u1);
      if (cb - ca < 0.02) continue;
      // y at the clipped ends
      const yAt = (u: number) => (d > 0 ? y0 + (u - s) : y0 + (s - u));
      const ya = yAt(ca), yb = yAt(cb);
      const cu = (ca + cb) / 2, cy = (ya + yb) / 2;
      const len = Math.hypot(cb - ca, yb - ya);
      if (along === 'x') b.box(mat, cu, cy, fixed, len, 0.034, 0.014, { rotZ: d * Math.PI / 4, collide: false });
      else b.box(mat, fixed, cy, cu, 0.014, 0.034, len, { rotX: -d * Math.PI / 4, collide: false });
    }
  }
}

// ---------------------------------------------------------------------------
// Things placed with a local frame (furniture facing local -z, like yaw 0).
// ---------------------------------------------------------------------------
export class Frame {
  c: number; s: number;
  constructor(public x: number, public y: number, public z: number, public yaw = 0) { this.c = Math.cos(yaw); this.s = Math.sin(yaw); }
  /** local -> world */
  p(lx: number, ly: number, lz: number) {
    return new THREE.Vector3(this.x + lx * this.c + lz * this.s, this.y + ly, this.z - lx * this.s + lz * this.c);
  }
  box(b: Builder, mat: THREE.Material, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, rotX = 0, rotZ = 0) {
    const w = this.p(lx, ly, lz);
    b.box(mat, w.x, w.y, w.z, sx, sy, sz, { rotY: this.yaw, rotX, rotZ, collide: false });
  }
  cyl(b: Builder, mat: THREE.Material, lx: number, ly0: number, lz: number, r: number, h: number, seg = 8, rTop?: number) {
    const w = this.p(lx, ly0, lz);
    b.cyl(mat, w.x, w.y, w.z, r, h, { seg, rTop });
  }
  /** cylinder lying along the local x axis, centred at (lx, ly, lz) */
  rollX(b: Builder, mat: THREE.Material, lx: number, ly: number, lz: number, r: number, len: number) {
    const w = this.p(lx + len / 2, ly, lz);
    b.cyl(mat, w.x, w.y, w.z, r, len, { seg: 10, rotY: this.yaw, rotZ: Math.PI / 2 });
  }
  /** cylinder lying along the local z axis, centred at (lx, ly, lz) */
  rollZ(b: Builder, mat: THREE.Material, lx: number, ly: number, lz: number, r: number, len: number) {
    const w = this.p(lx, ly, lz - len / 2);
    b.cyl(mat, w.x, w.y, w.z, r, len, { seg: 10, rotY: this.yaw, rotX: Math.PI / 2 });
  }
  /** solid collider for the whole piece: local footprint box */
  solid(sx: number, sy: number, sz: number, lx = 0, lz = 0) {
    const w = this.p(lx, sy / 2, lz);
    return W.physics.addBoxRot(w.x, w.y, w.z, sx, sy, sz, this.yaw, { walk: false });
  }
}

// ---------------------------------------------------------------------------
// Instanced small props with per-instance colours (books, jars, plates, fruit).
// One draw call per shape.
// ---------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
type Inst = { m: THREE.Matrix4; c: THREE.Color };
export class Props {
  private sets: Record<'box' | 'cyl' | 'ball' | 'cone', Inst[]> = { box: [], cyl: [], ball: [], cone: [] };
  private put(kind: 'box' | 'cyl' | 'ball' | 'cone', x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, rotY = 0, rotX = 0, rotZ = 0) {
    _e.set(rotX, rotY, rotZ, 'YXZ');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
    this.sets[kind].push({ m: _m.clone(), c: new THREE.Color(color) });
  }
  /** box by centre and size */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, rotY = 0, rotX = 0, rotZ = 0) { this.put('box', x, y, z, sx, sy, sz, color, rotY, rotX, rotZ); }
  /** cylinder standing on (x, y0, z) */
  cyl(x: number, y0: number, z: number, r: number, h: number, color: THREE.ColorRepresentation, rotY = 0, rotX = 0, rotZ = 0) { this.put('cyl', x, y0, z, r, h, r, color, rotY, rotX, rotZ); }
  /** ellipsoid by centre and radii */
  ball(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: THREE.ColorRepresentation, rotY = 0, rotX = 0, rotZ = 0) { this.put('ball', x, y, z, rx, ry, rz, color, rotY, rotX, rotZ); }
  /** cone (point up) standing on (x, y0, z) */
  cone(x: number, y0: number, z: number, r: number, h: number, color: THREE.ColorRepresentation, rotY = 0, rotX = 0, rotZ = 0) { this.put('cone', x, y0, z, r, h, r, color, rotY, rotX, rotZ); }

  build(name = 'props'): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    patchMaterial(mat, { key: 'house-props' });
    const geos = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0),
      ball: new THREE.IcosahedronGeometry(1, 1),
      cone: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
    };
    for (const k of Object.keys(this.sets) as (keyof typeof geos)[]) {
      const list = this.sets[k];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geos[k], mat, list.length);
      list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

// ---------------------------------------------------------------------------
// Canvas atlas: one texture for quilts, rugs, pictures and the name board.
// Rects are canvas pixels [x, y, w, h].
// ---------------------------------------------------------------------------
export type Rect = [number, number, number, number];
export class Atlas {
  geos: THREE.BufferGeometry[] = [];
  constructor(public size: number) {}
  uv(r: Rect): [number, number, number, number] {
    const S = this.size;
    return [r[0] / S, 1 - (r[1] + r[3]) / S, (r[0] + r[2]) / S, 1 - r[1] / S];
  }
  private remap(g: THREE.BufferGeometry, faces: Rect[] | Rect, vertsPerFace: number) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const f = Array.isArray(faces[0]) ? (faces as Rect[])[Math.min(Math.floor(i / vertsPerFace), (faces as Rect[]).length - 1)] : (faces as Rect);
      const [u0, v0, u1, v1] = this.uv(f);
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
  }
  private place(g: THREE.BufferGeometry, pos: THREE.Vector3Like, rot: THREE.Vector3Like) {
    _e.set(rot.x, rot.y, rot.z, 'YXZ');
    _m.compose(_p.set(pos.x, pos.y, pos.z), _q.setFromEuler(_e), _s.set(1, 1, 1));
    const ng = g.toNonIndexed();
    ng.applyMatrix4(_m);
    this.geos.push(ng);
  }
  /** box; faces: one rect for all, or 6 rects in BoxGeometry order (+x, -x, +y, -y, +z, -z) */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, faces: Rect | Rect[], rotY = 0, rotX = 0, rotZ = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    this.remap(g, faces, 4);
    this.place(g, { x, y, z }, { x: rotX, y: rotY, z: rotZ });
  }
  /** flat plane facing +z before rotation */
  plane(x: number, y: number, z: number, w: number, h: number, r: Rect, rotY = 0, rotX = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    this.remap(g, r, 1e9);
    this.place(g, { x, y, z }, { x: rotX, y: rotY, z: 0 });
  }
  /** a rug lying on the floor: rect (or oval if round) centred at x,z */
  rug(x: number, y: number, z: number, w: number, d: number, r: Rect, round = false, rotY = 0) {
    const g = round ? new THREE.CircleGeometry(0.5, 40) : new THREE.PlaneGeometry(1, 1);
    g.scale(w, d, 1);
    // circle uvs run 0..1 across its bounding square already
    this.remap(g, r, 1e9);
    this.place(g, { x, y, z }, { x: -Math.PI / 2, y: rotY, z: 0 });
  }
  build(draw: (g: CanvasRenderingContext2D, S: number) => void): THREE.Mesh {
    const cv = document.createElement('canvas');
    cv.width = cv.height = this.size;
    draw(cv.getContext('2d')!, this.size);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, alphaTest: 0.5 });
    patchMaterial(mat, { key: 'house-atlas' });
    for (const g of this.geos) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const merged = mergeGeometries(this.geos, false)!;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = 'house-atlas';
    return mesh;
  }
}

// ---------------------------------------------------------------------------
// Lamp shades that glow with their lamp: one merged mesh, a level per lamp.
// ---------------------------------------------------------------------------
const MAX_SHADES = 16;
export class Shades {
  private geos: THREE.BufferGeometry[] = [];
  lamps: Lamp[] = [];
  /** add shade geometry (already in world space) glowing with `lamp` */
  add(lamp: Lamp, g: THREE.BufferGeometry, glow = 1) {
    let idx = this.lamps.indexOf(lamp);
    if (idx < 0) { idx = this.lamps.length; this.lamps.push(lamp); }
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const n = ng.attributes.position.count;
    ng.setAttribute('aLamp', new THREE.Float32BufferAttribute(new Array(n).fill(idx), 1));
    ng.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Array(n).fill(glow), 1));
    this.geos.push(ng);
  }
  /** a cone-frustum lamp shade at (x, y0, z) */
  shade(lamp: Lamp, x: number, y0: number, z: number, rBot: number, rTop: number, h: number, glow = 1) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, 16, 1, true).translate(x, y0 + h / 2, z);
    this.add(lamp, g, glow);
  }
  /** a glowing bulb / lantern pane */
  bulb(lamp: Lamp, x: number, y: number, z: number, r: number, glow = 1.6) {
    this.add(lamp, new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), glow);
  }
  build(): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const lvl = { value: new Array(MAX_SHADES).fill(0) };
    const mat = new THREE.MeshStandardMaterial({ color: '#efe2c4', roughness: 0.9, side: THREE.DoubleSide });
    patchMaterial(mat, {
      key: 'house-shades',
      vertexHead: 'attribute float aLamp; attribute float aGlow; varying float vLamp; varying float vGlow;',
      vertexAfterProject: 'vLamp = aLamp; vGlow = aGlow;',
      fragHead: `uniform float uShadeLvl[${MAX_SHADES}]; varying float vLamp; varying float vGlow;`,
      fragAfterMaps: /* glsl */ `
        {
          float lv = 0.0;
          int li = int(vLamp + 0.5);
          for (int i = 0; i < ${MAX_SHADES}; i++) if (i == li) lv = uShadeLvl[i];
          totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * 1.5 * vGlow * lv;
        }`,
      extraUniforms: { uShadeLvl: lvl },
    });
    const merged = mergeGeometries(this.geos, false)!;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'house-shades';
    mesh.castShadow = false;
    W.onUpdate(() => { this.lamps.forEach((l, i) => { if (i < MAX_SHADES) lvl.value[i] = l.level; }); });
    return mesh;
  }
}

// ---------------------------------------------------------------------------
// Time skip for beds: eases the clock forward (never backward) to an hour.
// Drives the hour every frame so it also works while the day cycle runs.
// ---------------------------------------------------------------------------
let skip: { from: number; dist: number; t: number; secs: number } | null = null;
let skipHooked = false;
export function skipTo(hour: number, secs = 4) {
  const from = W.tod.hour as number;
  const dist = (((hour - from) % 24) + 24) % 24;
  skip = { from, dist, t: 0, secs };
  if (!skipHooked) {
    skipHooked = true;
    W.onUpdate((dt) => {
      if (!skip) return;
      skip.t += dt;
      const p = Math.min(1, skip.t / skip.secs);
      const e = p * p * (3 - 2 * p);
      W.tod.setHour(skip.from + skip.dist * e, true);
      if (p >= 1) skip = null;
    });
  }
}
