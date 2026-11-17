import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../shaderlib';
import { mulberry32 } from '../noise';

// Hand-built animals with smooth, natural proportions: an orange tabby cat and
// hens. Coats are baked into vertex colours (stripes, white chest, speckles)
// and every joint is animated in code.

function furMaterial(key: string, rough = 0.9) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough });
  patchMaterial(m, {
    key: 'fur-' + key,
    fragAfterLights: /* glsl */ `
      {
        // soft fuzzy rim, like light caught in fur or feathers
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 N = normalize(transformDirectionByInverseViewMatrix(normal, viewMatrix));
        float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
        reflectedLight.directDiffuse += (uLightCol * 0.12 + vec3(0.02)) * diffuseColor.rgb * rim;
      }
    `,
  });
  return m;
}

/** A sphere deformed by fn and coloured per vertex by colour(p) (p = position in animal space). */
function blob(rx: number, ry: number, rz: number, colour: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color, opts: { seg?: number; at?: THREE.Vector3; shape?: (p: THREE.Vector3) => void } = {}) {
  const g = new THREE.SphereGeometry(1, opts.seg ?? 24, Math.round((opts.seg ?? 24) * 0.7));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.copy(p);
    p.set(p.x * rx, p.y * ry, p.z * rz);
    opts.shape?.(p);
    if (opts.at) p.add(opts.at);
    pos.setXYZ(i, p.x, p.y, p.z);
    const c = colour(p, n);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function limb(r0: number, r1: number, len: number, col: THREE.Color, seg = 10) {
  // a tapered tube hanging down from its top (pivot at the origin)
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 3);
  g.translate(0, -len / 2, 0);
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) { cols[i] = col.r; cols[i + 1] = col.g; cols[i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv');
  return g;
}

function colourGeo(g: THREE.BufferGeometry, c: THREE.Color) {
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/**
 * Merge the direct mesh children of every group under root into one
 * vertex-coloured mesh per group (fewer draw calls); animated groups stay.
 * Only the biggest piece keeps casting a shadow.
 */
export function collapse(root: THREE.Object3D, mat: THREE.Material) {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) groups.push(o); });
  let biggest: THREE.Mesh | null = null, bigN = 0;
  for (const g of groups) {
    const meshes = g.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    if (!meshes.length) continue;
    const parts: THREE.BufferGeometry[] = [];
    for (const m of meshes) {
      m.updateMatrix();
      let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
      if (!geo.attributes.color) {
        const c = ((m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1)).clone();
        const e = (m.material as THREE.MeshStandardMaterial).emissive;
        if (e) c.add(e.clone().multiplyScalar(0.5));
        colourGeo(geo, c);
      }
      geo.applyMatrix4(m.matrix);
      parts.push(geo);
      g.remove(m);
    }
    const merged = new THREE.Mesh(mergeGeometries(parts, false)!, mat);
    merged.receiveShadow = true;
    merged.castShadow = false;
    g.add(merged);
    const n = merged.geometry.attributes.position.count;
    if (n > bigN) { bigN = n; biggest = merged; }
  }
  if (biggest) (biggest as THREE.Mesh).castShadow = true;
}

// ---------------------------------------------------------------------------
// Cat
// ---------------------------------------------------------------------------
export type CatPose = 'stand' | 'walk' | 'run' | 'sit' | 'groom' | 'nuzzle';

export class Cat {
  root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number }[] = [];
  private tail: THREE.Group[] = [];
  private phase = 0;
  private sit = 0;
  private t = 0;
  pose: CatPose = 'stand';
  lookYaw = 0; // head turn toward something (radians, relative to body)

  constructor() {
    const orange = new THREE.Color('#d9893f'), dark = new THREE.Color('#9a4e1c'), cream = new THREE.Color('#f3e6d2'), pink = new THREE.Color('#e6a0a0');
    const n = (x: number, y: number) => Math.sin(x * 12.9898 + y * 78.233) * 0.5 + 0.5;
    const tabby = (p: THREE.Vector3, belly: number) => {
      // stripes around the body, broken up a little; cream underneath
      const s = Math.sin(p.z * 70 + Math.sin(p.x * 30) * 1.4 + Math.sin(p.y * 25) * 0.8);
      const stripe = THREE.MathUtils.smoothstep(s, 0.35, 0.8);
      const c = orange.clone().lerp(dark, stripe * 0.85);
      c.multiplyScalar(0.92 + 0.12 * n(p.x * 40, p.z * 40));
      return c.lerp(cream, THREE.MathUtils.clamp(belly, 0, 1));
    };
    const mat = furMaterial('cat');
    // torso: deeper chest, slimmer waist, rounded rump
    const torso = blob(0.075, 0.085, 0.2, (p) => tabby(p, (-p.y - 0.02) * 18 + (p.z > 0.12 ? (0.02 - p.y) * 30 : 0)), {
      shape: (p) => { const k = 1 + 0.18 * Math.cos((p.z / 0.2) * 1.2); p.x *= k; p.y *= 0.95 + 0.1 * Math.cos((p.z / 0.2) * 1.4); },
    });
    torso.translate(0, 0.25, 0);
    const torsoM = new THREE.Mesh(torso, mat);
    this.body.add(torsoM);
    // neck + head
    this.head.position.set(0, 0.31, 0.2);
    const skull = blob(0.06, 0.055, 0.058, (p) => tabby(new THREE.Vector3(p.x, p.y, p.z + p.y * 2), (-p.y - 0.01) * 22));
    const muzzle = blob(0.032, 0.024, 0.026, (p) => cream.clone().multiplyScalar(0.96 + 0.05 * n(p.x * 90, p.y * 90)), { at: new THREE.Vector3(0, -0.018, 0.048) });
    const earGeo = (s: number) => {
      const g = new THREE.ConeGeometry(0.026, 0.05, 4, 1);
      g.rotateY(Math.PI / 4);
      g.scale(1, 1, 0.45);
      g.rotateZ(-s * 0.25);
      g.translate(s * 0.034, 0.058, -0.004);
      return colourGeo(g, dark.clone().lerp(orange, 0.4));
    };
    const innerEar = (s: number) => {
      const g = new THREE.ConeGeometry(0.016, 0.034, 3, 1);
      g.scale(1, 1, 0.3);
      g.rotateZ(-s * 0.25);
      g.translate(s * 0.033, 0.054, 0.004);
      return colourGeo(g, pink);
    };
    const headGeo = mergeGeometries([skull, muzzle, earGeo(-1), earGeo(1), innerEar(-1), innerEar(1)], false)!;
    headGeo.computeVertexNormals();
    this.head.add(new THREE.Mesh(headGeo, mat));
    // eyes: dark glossy with an amber ring, and a pink nose
    const eyeMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#1a1408', roughness: 0.1, emissive: '#3a2a02', emissiveIntensity: 0.4 }), { key: 'cat-eye' });
    const irisMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#c8a020', roughness: 0.25 }), { key: 'cat-iris' });
    for (const s of [-1, 1]) {
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), irisMat);
      iris.position.set(s * 0.024, 0.01, 0.047);
      iris.scale.set(1, 1, 0.6);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 10, 8), eyeMat);
      pupil.position.set(s * 0.024, 0.01, 0.053);
      pupil.scale.set(0.45, 1, 0.5);
      this.head.add(iris, pupil);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), patchMaterial(new THREE.MeshStandardMaterial({ color: '#d47a80', roughness: 0.4 }), { key: 'cat-nose' }));
    nose.position.set(0, -0.004, 0.073);
    nose.scale.set(1.3, 0.8, 0.8);
    this.head.add(nose);
    this.body.add(this.head);
    // legs: hip -> knee -> paw
    for (const front of [true, false]) for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.045, 0.24, front ? 0.13 : -0.13);
      const upperC = front ? orange.clone().lerp(cream, 0.2) : orange;
      const upper = new THREE.Mesh(limb(front ? 0.022 : 0.032, 0.017, 0.11, upperC), mat);
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.11;
      const lower = new THREE.Mesh(limb(0.016, 0.014, 0.11, cream.clone().lerp(orange, front ? 0.15 : 0.35)), mat);
      knee.add(lower);
      const paw = new THREE.Mesh(blob(0.019, 0.012, 0.024, () => cream), mat);
      paw.position.set(0, -0.112, 0.008);
      knee.add(paw);
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, front, side });
    }
    // tail: a chain of segments that curls and sways
    let parent: THREE.Object3D = this.body;
    const tailStart = new THREE.Group();
    tailStart.position.set(0, 0.29, -0.19);
    this.body.add(tailStart);
    parent = tailStart;
    for (let i = 0; i < 9; i++) {
      const seg = new THREE.Group();
      const r = 0.017 - i * 0.0011;
      const len = 0.032;
      const g = limb(r, r - 0.001, len, i % 2 ? dark : orange, 8);
      g.rotateX(Math.PI); // grow along +y
      const m = new THREE.Mesh(g, mat);
      seg.add(m);
      if (i > 0) seg.position.y = 0.032;
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }
    this.root.add(this.body);
    collapse(this.root, mat);
  }

  update(dt: number, speed: number) {
    this.t += dt;
    const t = this.t;
    const moving = this.pose === 'walk' || this.pose === 'run';
    const run = this.pose === 'run';
    this.phase += dt * (run ? 11 : moving ? 7 : 0) ;
    void speed;
    const wantSit = this.pose === 'sit' || this.pose === 'groom' ? 1 : 0;
    this.sit += (wantSit - this.sit) * (1 - Math.exp(-dt * 4));
    const s = this.sit;
    // body: bob while walking, lean back when sitting
    const bob = moving ? Math.abs(Math.sin(this.phase)) * (run ? 0.025 : 0.008) : Math.sin(t * 1.6) * 0.002;
    this.body.position.y = bob - s * 0.05;
    this.body.rotation.x = -s * 0.55 + (run ? Math.sin(this.phase * 2) * 0.05 : 0);
    this.body.position.z = -s * 0.04;
    // legs: diagonal gait; sitting folds the hind legs and keeps the front ones straight
    for (const L of this.legs) {
      const off = (L.front ? 0 : Math.PI) + (L.side > 0 ? Math.PI / 2 : -Math.PI / 2) * (run ? 0.3 : 1);
      const sw = moving ? Math.sin(this.phase + off) * (run ? 0.75 : 0.42) : 0;
      if (L.front) {
        L.hip.rotation.x = sw + s * 0.55;
        L.knee.rotation.x = moving ? Math.max(0, -Math.cos(this.phase + off)) * -0.6 : 0;
      } else {
        L.hip.rotation.x = sw - s * 1.15 + 0.15;
        L.knee.rotation.x = (moving ? Math.max(0, Math.cos(this.phase + off)) * 0.7 : 0.05) + s * 1.9;
      }
    }
    // head: steady while walking (cats keep their heads level), looks around, nuzzles
    const nuzzle = this.pose === 'nuzzle' ? Math.sin(t * 9) * 0.2 : 0;
    const groom = this.pose === 'groom' ? 0.6 + Math.sin(t * 5) * 0.12 : 0;
    this.head.rotation.set(-this.body.rotation.x * 0.85 + groom + nuzzle * 0.5 - bob * 2, this.lookYaw * (1 - groom), nuzzle);
    // tail: up and curled at the tip when walking, swishing gently otherwise, curled round when sitting
    for (let i = 0; i < this.tail.length; i++) {
      const k = i / this.tail.length;
      const seg = this.tail[i];
      if (i === 0) seg.rotation.x = moving ? -0.35 : s > 0.5 ? -1.9 : -0.9;
      else seg.rotation.x = moving ? -0.05 - k * 0.08 + (k > 0.7 ? -0.35 : 0) : s > 0.5 ? 0.18 : -0.06 + k * 0.12;
      seg.rotation.z = Math.sin(t * (moving ? 3 : 1.4) - i * 0.5) * (0.05 + k * 0.14) + (s > 0.5 ? 0.3 * k : 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Hen
// ---------------------------------------------------------------------------
export type HenPose = 'stand' | 'walk' | 'run' | 'peck';

export class Hen {
  root = new THREE.Group();
  private body = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private legs: THREE.Group[] = [];
  private wings: THREE.Mesh[] = [];
  private phase = 0;
  private t = Math.random() * 10;
  pose: HenPose = 'stand';

  constructor(kind: 'brown' | 'white' | 'speckled', seed: number) {
    const rnd = mulberry32(seed);
    const base = kind === 'brown' ? new THREE.Color('#9a4f22') : kind === 'white' ? new THREE.Color('#f1ece2') : new THREE.Color('#3a3634');
    const tailC = kind === 'brown' ? new THREE.Color('#3a2214') : kind === 'white' ? new THREE.Color('#e8e2d6') : new THREE.Color('#1e1c1c');
    const speck = kind === 'speckled' ? new THREE.Color('#d8d2c8') : kind === 'brown' ? new THREE.Color('#c27a3a') : new THREE.Color('#d8d0c0');
    const feathers = (p: THREE.Vector3) => {
      const c = base.clone();
      const f = Math.sin(p.x * 120 + p.y * 40) * Math.sin(p.z * 110 + p.y * 30);
      if (f > (kind === 'speckled' ? 0.55 : 0.75)) c.lerp(speck, 0.7);
      return c.multiplyScalar(0.88 + rnd() * 0.18);
    };
    const mat = furMaterial('hen-' + kind, 0.85);
    // plump teardrop body, tail end raised
    const bodyG = blob(0.085, 0.09, 0.13, feathers, {
      shape: (p) => { if (p.z < 0) p.y += -p.z * 0.45; p.x *= 1 - Math.max(0, -p.z) * 1.6; },
    });
    bodyG.translate(0, 0.2, 0);
    this.body.add(new THREE.Mesh(bodyG, mat));
    // tail feathers
    for (let i = 0; i < 5; i++) {
      const g = new THREE.SphereGeometry(1, 10, 8);
      g.scale(0.012, 0.06, 0.035);
      colourGeo(g, tailC.clone().multiplyScalar(0.85 + i * 0.05));
      const m = new THREE.Mesh(g, mat);
      m.position.set((i - 2) * 0.012, 0.3, -0.12);
      m.rotation.set(-0.5, 0, (i - 2) * 0.22);
      this.body.add(m);
    }
    // wings
    for (const s of [-1, 1]) {
      const wg = blob(0.02, 0.055, 0.09, (p) => base.clone().lerp(tailC, 0.25 + Math.max(0, -p.z) * 3), {});
      const w = new THREE.Mesh(wg, mat);
      w.position.set(s * 0.075, 0.21, -0.01);
      w.rotation.x = 0.15;
      this.body.add(w);
      this.wings.push(w);
    }
    // neck and head
    this.neck.position.set(0, 0.25, 0.09);
    const neckG = limb(0.032, 0.03, 0.09, base, 10);
    neckG.rotateX(Math.PI);
    this.neck.add(new THREE.Mesh(neckG, mat));
    this.head.position.y = 0.095;
    this.head.add(new THREE.Mesh(blob(0.032, 0.034, 0.038, () => base.clone().multiplyScalar(1.05)), mat));
    const red = patchMaterial(new THREE.MeshStandardMaterial({ color: '#c8231c', roughness: 0.55 }), { key: 'hen-red' });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.012 - i * 0.0015, 8, 6), red);
      c.position.set(0, 0.03 + (i === 1 || i === 2 ? 0.006 : 0), 0.02 - i * 0.013);
      this.head.add(c);
    }
    const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), red);
    wattle.position.set(0, -0.025, 0.03);
    wattle.scale.set(0.8, 1.5, 0.6);
    const beakG = new THREE.ConeGeometry(0.011, 0.03, 6);
    beakG.rotateX(Math.PI / 2);
    const beak = new THREE.Mesh(beakG, patchMaterial(new THREE.MeshStandardMaterial({ color: '#e0b040', roughness: 0.4 }), { key: 'hen-beak' }));
    beak.position.set(0, -0.004, 0.045);
    const eyeM = patchMaterial(new THREE.MeshStandardMaterial({ color: '#201004', roughness: 0.15 }), { key: 'hen-eye' });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), eyeM);
      e.position.set(s * 0.027, 0.008, 0.016);
      this.head.add(e);
    }
    this.head.add(wattle, beak);
    this.neck.add(this.head);
    this.body.add(this.neck);
    // legs
    const legMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#d8a838', roughness: 0.6 }), { key: 'hen-leg' });
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.035, 0.13, 0);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.12, 6).translate(0, -0.06, 0), legMat);
      hip.add(shin);
      for (const a of [-0.5, 0, 0.5]) {
        const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.04, 4).rotateX(Math.PI / 2).translate(0, 0, 0.02), legMat);
        toe.position.set(0, -0.12, 0);
        toe.rotation.y = a;
        hip.add(toe);
      }
      this.root.add(hip);
      this.legs.push(hip);
    }
    this.root.add(this.body);
    this.root.scale.setScalar(1.15);
    collapse(this.root, mat);
    this.wings = [];
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const moving = this.pose === 'walk' || this.pose === 'run';
    const run = this.pose === 'run';
    this.phase += dt * (run ? 20 : moving ? 9 : 0);
    this.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(this.phase + i * Math.PI) * (run ? 0.8 : 0.45) : 0));
    this.body.position.y = moving ? Math.abs(Math.sin(this.phase)) * 0.01 : 0;
    this.body.rotation.x = run ? 0.25 : 0;
    // the head bob: holds still, then jerks forward with each step
    let nx = 0, ny = 0;
    if (moving) { const k = (this.phase / Math.PI) % 1; nx = (k < 0.5 ? k * 2 : 1) * 0.35 - 0.1; }
    else if (this.pose === 'peck') { const k = (t * 1.6) % 1; ny = k < 0.25 ? Math.sin((k / 0.25) * Math.PI) : 0; nx = 0.3; }
    else nx = Math.floor(t * 0.8) % 3 === 0 ? 0.1 : -0.05;
    this.neck.rotation.x = nx + ny * 1.6;
    this.head.rotation.x = -ny * 0.6;
    this.head.rotation.y = !moving && this.pose !== 'peck' ? Math.sin(Math.floor(t * 1.3) * 2.1) * 0.6 : 0;
    // wings flap when running
    this.wings.forEach((w, i) => (w.rotation.z = run ? Math.sin(t * 30) * 0.5 * (i ? 1 : -1) : 0));
  }
}
