import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../shaderlib';
import { mulberry32 } from '../noise';

// Real 3D wildflowers for close range (cards take over in the distance):
// lupine spikes, black-eyed susans, orange poppies, white yarrow and seed heads.
// Green parts keep their vertex colour; petals (aPetal = 1) take the
// per-instance flower colour aFCol.

type V3 = [number, number, number];
class Parts {
  pos: number[] = []; col: number[] = []; petal: number[] = [];
  tri(a: V3, b: V3, c: V3, ca: V3, cb: V3 = ca, cc: V3 = ca, p = 0) {
    this.pos.push(...a, ...b, ...c);
    this.col.push(...ca, ...cb, ...cc);
    this.petal.push(p, p, p);
  }
  quad(a: V3, b: V3, c: V3, d: V3, ca: V3, cb: V3 = ca, p = 0) {
    // a-b bottom edge, d-c top edge
    this.tri(a, b, c, ca, ca, cb, p);
    this.tri(a, c, d, ca, cb, cb, p);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPetal', new THREE.Float32BufferAttribute(this.petal, 1));
    g.computeVertexNormals();
    const p = g.attributes.position;
    const sway = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) sway[i] = Math.pow(Math.max(0, p.getY(i)), 2) * 0.32;
    g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    return g;
  }
}

const G1: V3 = [0.16, 0.3, 0.07], G2: V3 = [0.24, 0.42, 0.1], G3: V3 = [0.1, 0.22, 0.05];

function stem(P: Parts, top: number, r: number, bend: [number, number], segs = 4, col: [V3, V3] = [G3, G2]) {
  const pts: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([bend[0] * t * t, t * top, bend[1] * t * t]);
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[i + 1];
    const ra = r * (1 - i / segs * 0.4), rb = r * (1 - (i + 1) / segs * 0.4);
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2, a1 = ((k + 1) / 3) * Math.PI * 2;
      P.quad(
        [a[0] + Math.cos(a0) * ra, a[1], a[2] + Math.sin(a0) * ra], [a[0] + Math.cos(a1) * ra, a[1], a[2] + Math.sin(a1) * ra],
        [b[0] + Math.cos(a1) * rb, b[1], b[2] + Math.sin(a1) * rb], [b[0] + Math.cos(a0) * rb, b[1], b[2] + Math.sin(a0) * rb],
        col[0], col[1]);
    }
  }
  return pts[segs];
}

function leaf(P: Parts, at: V3, ang: number, len: number, w: number, lift: number, col: V3 = G1) {
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const sx = -dz, sz = dx;
  const mid: V3 = [at[0] + dx * len * 0.5 + sx * w, at[1] + lift * 0.6, at[2] + dz * len * 0.5 + sz * w];
  const mid2: V3 = [at[0] + dx * len * 0.5 - sx * w, at[1] + lift * 0.6, at[2] + dz * len * 0.5 - sz * w];
  const tip: V3 = [at[0] + dx * len, at[1] + lift * 0.4, at[2] + dz * len];
  P.tri(at, mid, tip, G3, col, G2);
  P.tri(at, tip, mid2, G3, G2, col);
}

export function lupineGeo(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const P = new Parts();
  const top = stem(P, 1, 0.011, [(rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08], 3);
  void top;
  // palmate leaves low on the stem
  for (let l = 0; l < 1; l++) {
    const at: V3 = [0, 0.12 + l * 0.12, 0];
    const base = rnd() * 6.28;
    for (let k = 0; k < 7; k++) leaf(P, at, base + (k / 7) * 6.28, 0.09 + rnd() * 0.03, 0.012, 0.03, k % 2 ? G1 : G2);
  }
  // the spike: whorls of pea flowers, big at the bottom, buds at the top
  const y0 = 0.42, y1 = 1.02;
  const whorls = 11;
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1);
    const y = y0 + (y1 - y0) * t;
    const sx = (rnd() - 0.5) * 0.02 + 0.08 * Math.pow((y - 0) / 1, 2) * 0.5 * 0;
    const per = t > 0.8 ? 3 : 4;
    const size = 0.05 * (1 - t * 0.6);
    const ring = 0.032 * (1 - t * 0.55) + 0.008;
    const shade = 0.55 + t * 0.55;
    for (let k = 0; k < per; k++) {
      const a = (k / per) * Math.PI * 2 + i * 0.7;
      const ox = Math.cos(a), oz = Math.sin(a);
      const cx = sx + ox * ring, cz = oz * ring;
      const sxv = -oz, szv = ox;
      // banner petal: an upright rounded shape facing out
      const c: V3 = [shade, shade, shade], cTop: V3 = [shade * 1.15, shade * 1.15, shade * 1.15];
      const b0: V3 = [cx - sxv * size * 0.4, y - size * 0.15, cz - szv * size * 0.4];
      const b1: V3 = [cx + sxv * size * 0.4, y - size * 0.15, cz + szv * size * 0.4];
      const b2: V3 = [cx + sxv * size * 0.5 + ox * size * 0.25, y + size * 0.6, cz + szv * size * 0.5 + oz * size * 0.25];
      const b3: V3 = [cx - sxv * size * 0.5 + ox * size * 0.25, y + size * 0.6, cz - szv * size * 0.5 + oz * size * 0.25];
      P.quad(b0, b1, b2, b3, c, cTop, 1);
      // keel: a cupped wedge sticking out below it, paler
      const kc: V3 = [shade * 1.25, shade * 1.25, shade * 1.3];
      P.tri([cx - sxv * size * 0.25, y - size * 0.1, cz - szv * size * 0.25], [cx + ox * size * 0.9, y - size * 0.2, cz + oz * size * 0.9], [cx + sxv * size * 0.25, y - size * 0.1, cz + szv * size * 0.25], kc, kc, kc, 1);
    }
  }
  // a green bud tip
  P.tri([-0.005, y1, 0], [0.005, y1, 0], [0, y1 + 0.05, 0], G2, G2, G2, 0);
  return P.geometry();
}

export function daisyGeo(seed: number, petals = 13, centre: V3 = [0.16, 0.07, 0.02]): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const P = new Parts();
  const tilt: [number, number] = [(rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12];
  const top = stem(P, 1, 0.008, tilt);
  leaf(P, [tilt[0] * 0.1, 0.25, tilt[1] * 0.1], rnd() * 6.28, 0.14, 0.014, 0.08);
  leaf(P, [tilt[0] * 0.2, 0.45, tilt[1] * 0.2], rnd() * 6.28, 0.11, 0.012, 0.06);
  // head faces up and a little toward a random side
  const [hx, hy, hz] = top;
  const R = 0.075, r0 = 0.018;
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2 + rnd() * 0.15;
    const ox = Math.cos(a), oz = Math.sin(a);
    const sxv = -oz, szv = ox;
    const w = 0.013 + rnd() * 0.004;
    const droop = 0.012 + rnd() * 0.02;
    const base: V3 = [0.7, 0.7, 0.7], tipC: V3 = [1.05, 1.05, 1.05];
    const p0: V3 = [hx + ox * r0 - sxv * w * 0.5, hy, hz + oz * r0 - szv * w * 0.5];
    const p1: V3 = [hx + ox * r0 + sxv * w * 0.5, hy, hz + oz * r0 + szv * w * 0.5];
    const m0: V3 = [hx + ox * R * 0.6 + sxv * w, hy - droop * 0.3, hz + oz * R * 0.6 + szv * w];
    const m1: V3 = [hx + ox * R * 0.6 - sxv * w, hy - droop * 0.3, hz + oz * R * 0.6 - szv * w];
    const tip: V3 = [hx + ox * R, hy - droop, hz + oz * R];
    P.quad(p0, p1, m0, m1, base, tipC, 1);
    P.tri(m1, m0, tip, tipC, tipC, tipC, 1);
  }
  // domed centre
  const segs = 7;
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
    P.tri([hx + Math.cos(a0) * r0 * 1.3, hy + 0.002, hz + Math.sin(a0) * r0 * 1.3], [hx, hy + 0.022, hz], [hx + Math.cos(a1) * r0 * 1.3, hy + 0.002, hz + Math.sin(a1) * r0 * 1.3], centre, [centre[0] * 0.6, centre[1] * 0.6, centre[2] * 0.6]);
  }
  return P.geometry();
}

export function poppyGeo(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const P = new Parts();
  const top = stem(P, 1, 0.007, [(rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.15]);
  for (let l = 0; l < 3; l++) leaf(P, [0, 0.06, 0], rnd() * 6.28, 0.12, 0.01, 0.05, G2);
  const [hx, hy, hz] = top;
  // a cup of four petals
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rnd() * 0.3;
    const ox = Math.cos(a), oz = Math.sin(a);
    const sxv = -oz, szv = ox;
    const W0 = 0.012, W1 = 0.045, L = 0.06;
    const c0: V3 = [0.75, 0.75, 0.75], c1: V3 = [1.1, 1.1, 1.1];
    const a0: V3 = [hx + ox * 0.006 - sxv * W0, hy, hz + oz * 0.006 - szv * W0];
    const a1: V3 = [hx + ox * 0.006 + sxv * W0, hy, hz + oz * 0.006 + szv * W0];
    const b1: V3 = [hx + ox * L * 0.55 + sxv * W1, hy + L * 0.45, hz + oz * L * 0.55 + szv * W1];
    const b0: V3 = [hx + ox * L * 0.55 - sxv * W1, hy + L * 0.45, hz + oz * L * 0.55 - szv * W1];
    const t1: V3 = [hx + ox * L * 0.75 + sxv * W1 * 0.7, hy + L * 0.95, hz + oz * L * 0.75 + szv * W1 * 0.7];
    const t0: V3 = [hx + ox * L * 0.75 - sxv * W1 * 0.7, hy + L * 0.95, hz + oz * L * 0.75 - szv * W1 * 0.7];
    P.quad(a0, a1, b1, b0, c0, c1, 1);
    P.quad(b0, b1, t1, t0, c1, c1, 1);
  }
  P.tri([hx - 0.008, hy + 0.01, hz], [hx + 0.008, hy + 0.01, hz], [hx, hy + 0.03, hz], [0.1, 0.12, 0.05]);
  return P.geometry();
}

export function yarrowGeo(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const P = new Parts();
  const top = stem(P, 1, 0.007, [(rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06]);
  for (let l = 0; l < 4; l++) leaf(P, [0, 0.1 + l * 0.12, 0], rnd() * 6.28, 0.12, 0.008, 0.04, G1);
  const [hx, hy, hz] = top;
  // a flat-topped cluster of tiny florets on short stalks
  for (let k = 0; k < 16; k++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.055;
    const fx = hx + Math.cos(a) * r, fz = hz + Math.sin(a) * r, fy = hy + 0.02 - r * 0.25;
    P.tri([hx, hy - 0.03, hz], [fx - 0.002, fy, fz], [fx + 0.002, fy, fz], G2);
    const s = 0.008 + rnd() * 0.004;
    const c: V3 = [1, 1, 1];
    for (let p = 0; p < 4; p++) {
      const b0 = (p / 4) * 6.28, b1 = ((p + 1) / 4) * 6.28;
      P.tri([fx, fy + 0.002, fz], [fx + Math.cos(b0) * s, fy, fz + Math.sin(b0) * s], [fx + Math.cos(b1) * s, fy, fz + Math.sin(b1) * s], c, c, c, 1);
    }
  }
  return P.geometry();
}

export function seedHeadGeo(seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const P = new Parts();
  const straw: V3 = [0.5, 0.46, 0.24], seedC: V3 = [0.72, 0.62, 0.32];
  for (let s = 0; s < 3; s++) {
    const bend: [number, number] = [(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3];
    const h = 0.8 + rnd() * 0.25;
    const top = stem(P, h, 0.004, bend, 3, [G1, straw]);
    for (let k = 0; k < 8; k++) {
      const y = top[1] - 0.15 + k * 0.02;
      const a = k * 2.4;
      const ox = Math.cos(a) * 0.012, oz = Math.sin(a) * 0.012;
      P.tri([top[0] * 0.9, y, top[2] * 0.9], [top[0] * 0.9 + ox + 0.004, y + 0.035, top[2] * 0.9 + oz], [top[0] * 0.9 + ox - 0.004, y + 0.035, top[2] * 0.9 + oz], seedC, seedC, seedC, 0);
    }
  }
  return P.geometry();
}

let mat: THREE.MeshStandardMaterial | null = null;
export function flower3DMaterial() {
  if (mat) return mat;
  mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  patchMaterial(mat, {
    key: 'flowers3d',
    wind: true,
    vertexHead: 'attribute float aPetal; attribute vec3 aFCol; varying float vPetal; varying vec3 vFCol;',
    vsReplace: [['#include <begin_vertex>', 'vPetal = aPetal; vFCol = aFCol;']],
    fragHead: 'varying float vPetal; varying vec3 vFCol;',
    fragAfterMaps: /* glsl */ `
      diffuseColor.rgb *= mix(vec3(1.0), vFCol, vPetal);
    `,
    fragAfterLights: /* glsl */ `
      {
        vec3 V = normalize(cameraPosition - vWPos);
        float back = pow(clamp(dot(-V, normalize(uLightDir)), 0.0, 1.0), 3.0);
        reflectedLight.directDiffuse += uLightCol * diffuseColor.rgb * back * (0.25 + 0.1 * vPetal);
      }
    `,
  });
  return mat;
}

/** One geometry per flower type, matching the card atlas order (0 purple lupine, 1 pink lupine, 2 susan, 3 poppy, 4 yarrow, 5 seed heads). */
let geos: THREE.BufferGeometry[] | null = null;
export function flower3DGeos() {
  if (geos) return geos;
  const lup = mergeGeometries([lupineGeo(3)], false)!;
  geos = [lup, lup, daisyGeo(5), poppyGeo(7), yarrowGeo(9), seedHeadGeo(11)];
  return geos;
}

const PALETTE: THREE.Color[][] = [
  [new THREE.Color(0.42, 0.24, 0.78), new THREE.Color(0.52, 0.32, 0.86), new THREE.Color(0.34, 0.2, 0.66), new THREE.Color(0.62, 0.48, 0.9)],
  [new THREE.Color(0.86, 0.32, 0.62), new THREE.Color(0.72, 0.2, 0.52), new THREE.Color(0.92, 0.5, 0.74), new THREE.Color(0.8, 0.26, 0.45)],
  [new THREE.Color(0.98, 0.72, 0.08), new THREE.Color(1.0, 0.8, 0.2), new THREE.Color(0.95, 0.62, 0.06)],
  [new THREE.Color(1.0, 0.45, 0.06), new THREE.Color(0.98, 0.55, 0.12)],
  [new THREE.Color(0.95, 0.94, 0.9), new THREE.Color(0.96, 0.9, 0.95)],
  [new THREE.Color(1, 1, 1)],
];
export function flowerColour(type: number, r: number) {
  const p = PALETTE[type];
  return p[Math.floor(r * p.length) % p.length];
}
