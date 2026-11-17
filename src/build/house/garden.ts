import * as THREE from 'three';
import { W } from '../../world';
import type { Builder } from '../kit';
import { patchMaterial } from '../../shaderlib';
import { mulberry32 } from '../../noise';
import * as D from './dims';
import type { HouseMats } from './mats';

const { X, Z, G } = D;

// Flower beds along the front of the porch and down the east side: boxwood,
// hydrangeas, and clusters of purple, pink, magenta and yellow flowers with a
// little stone edging. Three instanced meshes that sway in the wind.

interface Bed { u0: number; u1: number; v0: number; v1: number; along: 'u' | 'v'; back: 'v0' | 'u0' }

export function buildGarden(b: Builder, m: HouseMats) {
  const rnd = mulberry32(909);
  const PF = D.PORCH_FRONT, PE = D.PORCH_EAST;
  const depth = 0.95;
  const beds: Bed[] = [
    { u0: -D.W2 - 0.1, u1: -1.22, v0: PF + 0.04, v1: PF + 0.04 + depth, along: 'u', back: 'v0' },
    { u0: 2.1, u1: PE + 0.04, v0: PF + 0.04, v1: PF + 0.04 + depth, along: 'u', back: 'v0' },
    { u0: PE + 0.04, u1: PE + 0.04 + 0.85, v0: -D.D2 - 0.3, v1: PF + 0.04 + depth, along: 'v', back: 'u0' },
  ];
  const yTop = G + 0.035;
  // mulch and stone edging
  for (const bd of beds) {
    b.boxMinMax(m.black, X(bd.u0), G - 0.06, Z(bd.v0), X(bd.u1), yTop, Z(bd.v1), { collide: false });
  }
  const stones = (u0: number, v0: number, u1: number, v1: number) => {
    const len = Math.hypot(u1 - u0, v1 - v0);
    const n = Math.max(1, Math.round(len / 0.2));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0);
      const l = 0.16 + rnd() * 0.06, w = 0.1 + rnd() * 0.04, h = 0.07 + rnd() * 0.05;
      b.box(m.stone, X(u), G + h / 2 - 0.01, Z(v), alongU ? l : w, h, alongU ? w : l, { rotY: (rnd() - 0.5) * 0.35, collide: false });
    }
  };
  const fb0 = beds[0], fb1 = beds[1], eb = beds[2];
  stones(fb0.u0, fb0.v1, fb0.u1, fb0.v1);
  stones(fb0.u1, fb0.v0 + 0.1, fb0.u1, fb0.v1);
  stones(fb0.u0, fb0.v0 + 0.1, fb0.u0, fb0.v1);
  stones(fb1.u0, fb1.v1, eb.u1, fb1.v1);
  stones(fb1.u0, fb1.v0 + 0.1, fb1.u0, fb1.v1);
  stones(eb.u1, eb.v0, eb.u1, eb.v1 - 0.1);
  stones(eb.u0 + 0.1, eb.v0, eb.u1, eb.v0);

  // ---- instances
  type I = { p: THREE.Vector3; s: THREE.Vector3; c: THREE.Color; ry: number; rx?: number; rz?: number };
  const leaves: I[] = [], blooms: I[] = [];
  const col = (hex: string, jit = 0.08) => { const c = new THREE.Color(hex); c.offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * jit, (rnd() - 0.5) * jit); return c; };
  const GREENS = ['#2f5a2a', '#3a6a30', '#2b4f27'];
  const boxwood = (u: number, v: number, r: number) => {
    leaves.push({ p: new THREE.Vector3(X(u), yTop + r * 0.55, Z(v)), s: new THREE.Vector3(r, r * 0.85, r), c: col(GREENS[Math.floor(rnd() * 3)]), ry: rnd() * 6 });
  };
  const hydrangea = (u: number, v: number, hue: string) => {
    leaves.push({ p: new THREE.Vector3(X(u), yTop + 0.28, Z(v)), s: new THREE.Vector3(0.42, 0.34, 0.42), c: col('#3f6e34'), ry: rnd() * 6 });
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = 0.12 + rnd() * 0.24;
      blooms.push({ p: new THREE.Vector3(X(u + Math.cos(a) * d), yTop + 0.44 + rnd() * 0.18 - d * 0.25, Z(v + Math.sin(a) * d)), s: new THREE.Vector3(0.12, 0.1, 0.12).multiplyScalar(0.85 + rnd() * 0.4), c: col(hue, 0.12), ry: rnd() * 6 });
    }
  };
  // little flower clusters: a low leafy mound with many small heads
  const cluster = (u: number, v: number, kind: number) => {
    const r = 0.17 + rnd() * 0.06;
    leaves.push({ p: new THREE.Vector3(X(u), yTop + 0.06, Z(v)), s: new THREE.Vector3(r, 0.13, r), c: col('#4d7f3a'), ry: rnd() * 6 });
    if (kind === 3) {
      // salvia / lavender spikes
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * r * 0.8;
        blooms.push({ p: new THREE.Vector3(X(u + Math.cos(a) * d), yTop + 0.3, Z(v + Math.sin(a) * d)), s: new THREE.Vector3(0.026, 0.13 + rnd() * 0.06, 0.026), c: col(rnd() < 0.5 ? '#6a4fb0' : '#8b6cc8', 0.1), ry: 0, rx: (rnd() - 0.5) * 0.3, rz: (rnd() - 0.5) * 0.3 });
      }
      return;
    }
    const hue = [['#f2c230', '#e9b322'], ['#c2307a', '#d0408a'], ['#f08fb0', '#f4a6c0'], ['#8e5cc4', '#a274d4']][kind];
    const n = 10 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
      const sz = kind === 0 ? 0.045 : 0.04;
      blooms.push({ p: new THREE.Vector3(X(u + Math.cos(a) * d), yTop + 0.13 + rnd() * 0.1, Z(v + Math.sin(a) * d)), s: new THREE.Vector3(sz, sz * 0.55, sz), c: col(hue[i % 2], 0.1), ry: rnd() * 6 });
      if (kind === 0 && i % 2 === 0) blooms.push({ p: new THREE.Vector3(X(u + Math.cos(a) * d), yTop + 0.155 + rnd() * 0.08, Z(v + Math.sin(a) * d)), s: new THREE.Vector3(0.016, 0.012, 0.016), c: col('#3a2414'), ry: 0 });
    }
  };
  const HYD = ['#8f7bc0', '#c27ab0', '#f2a6c4', '#9fb6dc', '#b48bcf'];
  for (const bd of beds) {
    const L = bd.along === 'u' ? bd.u1 - bd.u0 : bd.v1 - bd.v0;
    const at = (t: number, depthT: number) => bd.along === 'u'
      ? { u: bd.u0 + t, v: bd.v0 + depthT * (bd.v1 - bd.v0) }
      : { u: bd.u0 + depthT * (bd.u1 - bd.u0), v: bd.v0 + t };
    // back row: boxwood with a hydrangea every few metres
    let k = 0;
    for (let t = 0.4; t < L - 0.3; t += 0.78 + rnd() * 0.12) {
      const p = at(t, 0.3);
      if (k % 3 === 1) hydrangea(p.u, p.v, HYD[Math.floor(rnd() * HYD.length)]);
      else boxwood(p.u, p.v, 0.28 + rnd() * 0.08);
      k++;
    }
    // front row: flower clusters in a repeating, slightly shuffled sequence
    let j = Math.floor(rnd() * 5);
    for (let t = 0.25; t < L - 0.15; t += 0.36 + rnd() * 0.12) {
      const p = at(t + (rnd() - 0.5) * 0.08, 0.72 + (rnd() - 0.5) * 0.12);
      const kinds = [0, 1, 3, 2, 0, 3, 1, 2];
      cluster(p.u, p.v, kinds[j++ % kinds.length]);
    }
  }

  // ---- build the instanced meshes (wind sway via aSway)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  patchMaterial(mat, { key: 'house-flowers', wind: true });
  const make = (geo: THREE.BufferGeometry, list: I[], sway: (y: number) => number, shadow: boolean, name: string) => {
    const pos = geo.attributes.position;
    // round (sphere) normals so the low-poly heads and mounds shade softly
    const nrm = geo.attributes.normal;
    const t = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { t.fromBufferAttribute(pos, i).normalize(); nrm.setXYZ(i, t.x, t.y, t.z); }
    nrm.needsUpdate = true;
    const a = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) a[i] = sway(pos.getY(i));
    geo.setAttribute('aSway', new THREE.BufferAttribute(a, 1));
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((it, i) => {
      e.set(it.rx ?? 0, it.ry, it.rz ?? 0, 'YXZ');
      mm.compose(it.p, q.setFromEuler(e), it.s);
      mesh.setMatrixAt(i, mm);
      mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    W.scene.add(mesh);
  };
  make(new THREE.IcosahedronGeometry(1, 1), leaves, (y) => Math.max(0, y + 0.3) * 0.015, true, 'house-bed-leaves');
  make(new THREE.IcosahedronGeometry(1, 0), blooms, () => 0.025, false, 'house-bed-blooms');
}
