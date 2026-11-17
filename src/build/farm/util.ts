import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../../shaderlib';
import { M } from '../materials';
import type { Builder } from '../kit';

// Helpers shared by the bakery and the farm buildings (only used by our own
// files): a vertex-coloured merger (lots of small props in ONE draw call), a
// sign atlas (every painted sign of a building in one canvas + one mesh),
// beams between two points, and a few custom materials (hay, dirt floor,
// chicken wire, greenhouse glass).

export type Col = THREE.ColorRepresentation;
export type ColFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

const _c = new THREE.Color();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mat4(pos: THREE.Vector3Like, rot: THREE.Vector3Like = { x: 0, y: 0, z: 0 }, scale: THREE.Vector3Like | number = 1) {
  _e.set(rot.x, rot.y, rot.z, 'YXZ');
  const s = typeof scale === 'number' ? _s.set(scale, scale, scale) : _s.set(scale.x, scale.y, scale.z);
  return new THREE.Matrix4().compose(new THREE.Vector3(pos.x, pos.y, pos.z), _q.setFromEuler(_e), s);
}

/** Matrix that maps a unit-length geometry along local +x onto the segment a->b (centre at the midpoint). */
export function segMatrix(a: THREE.Vector3, b: THREE.Vector3, roll = 0) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const x = d.clone().divideScalar(len || 1);
  const ref = Math.abs(x.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const y = ref.clone().sub(x.clone().multiplyScalar(x.dot(ref))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  if (roll) { y.applyAxisAngle(x, roll); z.applyAxisAngle(x, roll); }
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(a.x + d.x / 2, a.y + d.y / 2, a.z + d.z / 2);
  return { m, len };
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export { V };

/** A box beam between two points (w = across horizontally, h = vertical-ish). */
export function beam(b: Builder, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, w: number, h: number, roll = 0) {
  const { m, len } = segMatrix(a, c, roll);
  b.add(mat, new THREE.BoxGeometry(len, h, w), m);
}

/** A round rod between two points. */
export function rod(b: Builder, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 6) {
  const { m, len } = segMatrix(a, c);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.rotateZ(-Math.PI / 2);
  b.add(mat, g, m);
}

// ---------------------------------------------------------------------------
// Vertex coloured builder: one material, colours per part (and per vertex)
// ---------------------------------------------------------------------------
const vcolCache = new Map<string, THREE.Material>();
/** The shared vertex-colour material (a little world-space noise so flat colours read as surfaces). */
export function vcolMat(opts: { rough?: number; wind?: boolean; metal?: number; noise?: number } = {}) {
  const rough = opts.rough ?? 0.8, wind = !!opts.wind, metal = opts.metal ?? 0, noise = opts.noise ?? 0.18;
  const k = `fvcol-${rough}-${wind}-${metal}-${noise}`;
  let m = vcolCache.get(k);
  if (!m) {
    const sm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal });
    patchMaterial(sm, {
      key: `fvcol-${wind}`, wind,
      fragHead: 'uniform float uVNoise;',
      extraUniforms: { uVNoise: { value: noise } },
      fragAfterMaps: /* glsl */ `
        diffuseColor.rgb *= (1.0 - uVNoise * 0.5) + uVNoise * (vnoise(vWPos.xz * 23.0 + vWPos.y * 11.0) * 0.6 + vnoise(vWPos.zy * 61.0 + vWPos.x * 7.0) * 0.4);
      `,
    });
    m = sm;
    vcolCache.set(k, m);
  }
  return m;
}

export class VBuilder {
  parts: THREE.BufferGeometry[] = [];
  tris = 0;
  constructor(public name = 'props', public wind = false) {}

  /**
   * Add a geometry. color: a colour, or a function of the LOCAL vertex position
   * and normal (before the matrix) for gradients. jitter: random brightness.
   * sway: local y -> wind sway amount (only if the builder has wind).
   */
  add(geo: THREE.BufferGeometry, color: Col | ColFn, m?: THREE.Matrix4, sway?: number | ((p: THREE.Vector3) => number)) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const fixed = typeof color !== 'function' ? _c.set(color as Col).clone() : null;
    for (let i = 0; i < n; i++) {
      let c: THREE.Color;
      if (fixed) c = fixed;
      else c = (color as ColFn)(_p.fromBufferAttribute(pos, i), _n.fromBufferAttribute(nor, i));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.wind) {
      const sw = new Float32Array(n);
      for (let i = 0; i < n; i++) sw[i] = typeof sway === 'function' ? sway(_p.fromBufferAttribute(pos, i)) : sway ?? 0;
      g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    }
    if (m) g.applyMatrix4(m);
    this.tris += n / 3;
    this.parts.push(g);
    return g;
  }

  geo(geo: THREE.BufferGeometry, color: Col | ColFn, pos: THREE.Vector3Like, rot?: THREE.Vector3Like, scale?: THREE.Vector3Like | number, sway?: number | ((p: THREE.Vector3) => number)) {
    return this.add(geo, color, mat4(pos, rot, scale), sway);
  }

  box(color: Col | ColFn, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rot?: THREE.Vector3Like) {
    return this.add(new THREE.BoxGeometry(sx, sy, sz), color, mat4({ x: cx, y: cy, z: cz }, rot));
  }

  beam(color: Col | ColFn, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, roll = 0) {
    const { m, len } = segMatrix(a, b, roll);
    return this.add(new THREE.BoxGeometry(len, h, w), color, m);
  }

  rod(color: Col | ColFn, a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6, sway?: number | ((p: THREE.Vector3) => number)) {
    const { m, len } = segMatrix(a, b);
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    g.rotateZ(-Math.PI / 2);
    return this.add(g, color, m, sway);
  }

  build(mat?: THREE.Material, opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    if (!merged) return null;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat ?? vcolMat({ wind: this.wind }));
    mesh.name = this.name;
    mesh.castShadow = !!opts.cast;
    mesh.receiveShadow = opts.receive !== false;
    return mesh;
  }
}

/** colour helper: a THREE.Color from hex with brightness factor */
export function shade(c: Col, k = 1) { return new THREE.Color(c).multiplyScalar(k); }
export function mix(a: Col, b: Col, t: number) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }

// ---------------------------------------------------------------------------
// Sign atlas: many painted signs on one canvas, drawn as one mesh
// ---------------------------------------------------------------------------
export interface Region { x: number; y: number; w: number; h: number }
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export class Atlas {
  private regions: (Region & { draw: Draw })[] = [];
  private cx = 0; private cy = 0; private rowH = 0;
  private geos: THREE.BufferGeometry[] = [];
  constructor(public W = 1024, public H = 1024, public pad = 8) {}

  region(w: number, h: number, draw: Draw): Region {
    if (this.cx + w > this.W) { this.cx = 0; this.cy += this.rowH + this.pad; this.rowH = 0; }
    if (this.cy + h > this.H) console.warn('atlas full');
    const r = { x: this.cx, y: this.cy, w, h, draw };
    this.regions.push(r);
    this.cx += w + this.pad;
    this.rowH = Math.max(this.rowH, h);
    return r;
  }

  /** A plane of size (pw x ph) showing region r, placed by a matrix (plane faces local +z). */
  plane(r: Region, pw: number, ph: number, m: THREE.Matrix4) {
    const g = new THREE.PlaneGeometry(pw, ph);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const u0 = (r.x + 1) / this.W, u1 = (r.x + r.w - 1) / this.W;
    const v0 = 1 - (r.y + r.h - 1) / this.H, v1 = 1 - (r.y + 1) / this.H;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    g.applyMatrix4(m);
    this.geos.push(g.index ? g.toNonIndexed() : g);
  }

  build(opts: { emissive?: number } = {}): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const regions = this.regions;
    const mat = M.canvas((g) => {
      for (const r of regions) {
        g.save();
        g.translate(r.x, r.y);
        g.beginPath(); g.rect(0, 0, r.w, r.h); g.clip();
        r.draw(g, r.w, r.h);
        g.restore();
      }
    }, this.W, this.H, { emissive: opts.emissive });
    const merged = mergeGeometries(this.geos, false)!;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Painted wood board background for signs. */
export function paintBoard(g: CanvasRenderingContext2D, w: number, h: number, base: string, border: string, seed = 1) {
  const r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  // faint wood grain
  g.globalAlpha = 0.07;
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = r() > 0.5 ? '#000' : '#fff';
    g.lineWidth = 1 + r() * 2;
    const y = r() * h;
    g.beginPath(); g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.6, y + (r() - 0.5) * 8, w, y + (r() - 0.5) * 6);
    g.stroke();
  }
  g.globalAlpha = 1;
  if (border) {
    const bw = Math.max(4, Math.min(w, h) * 0.045);
    g.strokeStyle = border; g.lineWidth = bw;
    g.strokeRect(bw * 1.4, bw * 1.4, w - bw * 2.8, h - bw * 2.8);
  }
}

/** Chalkboard background (dark slate with smudges and a wooden frame drawn by geometry). */
export function chalkBoard(g: CanvasRenderingContext2D, w: number, h: number, seed = 3) {
  const r = rng(seed);
  g.fillStyle = '#2b302d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = r() * h, rr = 20 + r() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
}

export const CHALK_FONT = '"Chalkboard SE", "Marker Felt", "Segoe Print", "Comic Sans MS", cursive';
export const SERIF_FONT = '"Baskerville", "Georgia", "Times New Roman", serif';

/** Text that fits a width. */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, font: string, weight = '') {
  let s = size;
  g.font = `${weight} ${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 8) { s -= 2; g.font = `${weight} ${s}px ${font}`; }
  g.fillText(text, x, y);
  return s;
}

// ---------------------------------------------------------------------------
// Materials of our own
// ---------------------------------------------------------------------------
let hayM: THREE.Material | null = null;
/** Straw / hay with streaks (bales, loose hay, straw floor bedding). World space. */
export function hayMat() {
  if (hayM) return hayM;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  patchMaterial(m, {
    key: 'farm-hay',
    fragAfterMaps: /* glsl */ `
    {
      vec3 n = normalize(transformDirectionByInverseViewMatrix(normal, viewMatrix));
      vec3 a = abs(n);
      vec2 uv = a.y > 0.7 ? vWPos.xz : (a.x > a.z ? vWPos.zy : vWPos.xy);
      float s1 = vnoise(vec2(uv.x * 3.0, uv.y * 60.0));
      float s2 = vnoise(vec2(uv.x * 60.0 + uv.y * 4.0, uv.y * 7.0));
      float s3 = vnoise(uv * 140.0);
      float st = mix(s1, s2, 0.5);
      vec3 col = mix(vec3(0.52, 0.40, 0.17), vec3(0.86, 0.72, 0.38), st);
      col = mix(col, vec3(0.42, 0.33, 0.14), smoothstep(0.65, 0.95, s3) * 0.6);
      col *= 0.85 + 0.25 * vnoise(vWPos.xz * 2.0 + vWPos.y);
      diffuseColor.rgb = col;
    }`,
  });
  hayM = m;
  return m;
}

let dirtM: THREE.Material | null = null;
/** Packed dirt with scattered straw (barn floor). */
export function dirtStrawMat() {
  if (dirtM) return dirtM;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97 });
  patchMaterial(m, {
    key: 'farm-dirtstraw',
    fragAfterMaps: /* glsl */ `
    {
      vec2 p = vWPos.xz;
      float d = fbm3(p * 0.9) * 0.6 + vnoise(p * 7.0) * 0.4;
      vec3 col = mix(vec3(0.26, 0.19, 0.12), vec3(0.42, 0.32, 0.21), d);
      // straw flecks: thin random sticks
      float straw = 0.0;
      for (int i = 0; i < 3; i++) {
        float a = float(i) * 2.1 + 0.4;
        vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
        float s = vnoise(vec2(q.x * 9.0, q.y * 38.0));
        straw = max(straw, smoothstep(0.84, 0.95, s) * smoothstep(0.45, 0.8, vnoise(p * 0.6 + float(i) * 7.0)));
      }
      float bed = smoothstep(0.5, 0.8, fbm3(p * 0.35 + 3.0));
      col = mix(col, vec3(0.7, 0.57, 0.31), max(straw * 0.6, bed * 0.35 * (0.6 + 0.4 * vnoise(p * 30.0))));
      diffuseColor.rgb = col;
    }`,
  });
  dirtM = m;
  return m;
}

let wireM: THREE.MeshStandardMaterial | null = null;
/** Chicken wire: hexagon mesh, alpha cut. Needs UVs in metres / 0.3 (one tile = 0.3 m). */
export function chickenWireMat() {
  if (wireM) return wireM;
  const m = M.canvas((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,152,150,1)';
    g.lineWidth = 3;
    const cols = 4, rows = 4;
    const hw = w / cols, hh = h / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) {
      const x = i * hw + (j % 2) * hw * 0.5, y = j * hh;
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x + hw * 0.25, y + hh * 0.33); g.lineTo(x + hw * 0.25, y + hh * 0.66); g.lineTo(x, y + hh);
      g.moveTo(x + hw * 0.25, y + hh * 0.33); g.lineTo(x + hw * 0.5, y);
      g.moveTo(x + hw * 0.25, y + hh * 0.66); g.lineTo(x + hw * 0.5, y + hh);
      g.stroke();
    }
  }, 128, 128, { transparent: true }) as THREE.MeshStandardMaterial;
  m.map!.wrapS = m.map!.wrapT = THREE.RepeatWrapping;
  m.alphaTest = 0.3;
  m.side = THREE.DoubleSide;
  m.metalness = 0.6; m.roughness = 0.5;
  wireM = m;
  return m;
}

/** Plane geometry for a wire panel between two ground points (UVs tiled per 0.3 m). */
export function wirePanel(ax: number, ay: number, az: number, bx: number, by: number, bz: number, h: number) {
  const L = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BufferGeometry();
  const p = new Float32Array([ax, ay, az, bx, by, bz, bx, by + h, bz, ax, ay, az, bx, by + h, bz, ax, ay + h, az]);
  const t = 0.22;
  const uv = new Float32Array([0, 0, L / t, 0, L / t, h / t, 0, 0, L / t, h / t, 0, h / t]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

let ghGlassM: THREE.Material | null = null;
/** Clear greenhouse glass: lighter and clearer than window glass, faint green edge tint. */
export function greenhouseGlass() {
  if (ghGlassM) return ghGlassM;
  const m = new THREE.MeshStandardMaterial({ color: 0xd8ece6, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.3, side: THREE.DoubleSide });
  patchMaterial(m, { key: 'farm-ghglass', lamps: false });
  ghGlassM = m;
  return m;
}

/** Merge plain geometries (with UVs) into one mesh. */
export function mergeMesh(geos: THREE.BufferGeometry[], mat: THREE.Material) {
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  merged.computeBoundingSphere();
  return new THREE.Mesh(merged, mat);
}

/** Soft rising smoke puffs from a chimney: one Points draw call. */
export function chimneySmoke(pos: THREE.Vector3, opts: { n?: number; height?: number; size?: number; strength?: () => number } = {}) {
  const N = opts.n ?? 16;
  const seeds = new Float32Array(N * 3);
  const r = rng(77);
  for (let i = 0; i < N; i++) { seeds[i * 3] = r(); seeds[i * 3 + 1] = r(); seeds[i * 3 + 2] = r(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const u = {
    uTime: { value: 0 }, uAmt: { value: 1 }, uPx: { value: 1 }, uH: { value: opts.height ?? 6 }, uS: { value: opts.size ?? 1 },
    uCol: { value: new THREE.Color(0.8, 0.8, 0.8) }, uWind: { value: new THREE.Vector2(0.8, 0.6) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime, uAmt, uPx, uH, uS;
      uniform vec2 uWind;
      varying float vA;
      void main() {
        float life = 7.0 + aSeed.x * 4.0;
        float t = mod(uTime + aSeed.y * life, life) / life;
        vec3 p = vec3((aSeed.z - 0.5) * 0.2, t * uH, (aSeed.x - 0.5) * 0.2);
        p.xz += uWind * t * t * uH * 0.55;
        p.x += sin(t * 5.0 + aSeed.y * 9.0) * 0.25 * t;
        vA = smoothstep(0.0, 0.08, t) * (1.0 - t) * uAmt;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.5 + t * 2.4) * uS * uPx * 300.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uCol, a * a * vA * 0.35);
      }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.position.copy(pos);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return { points: pts, uniforms: u };
}

const vglowCache = new Map<string, THREE.Material>();
/** Vertex-coloured emissive (bulbs, coals): colour = glow colour. nightOnly fades with dusk. */
export function vglowMat(strength = 3, nightOnly = false) {
  const k = `${strength}-${nightOnly}`;
  let m = vglowCache.get(k);
  if (!m) {
    const sm = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x000000, roughness: 1 });
    patchMaterial(sm, {
      key: 'farm-vglow', lamps: false,
      fragHead: 'uniform float uGlowK; uniform float uGlowNight;',
      extraUniforms: { uGlowK: { value: strength }, uGlowNight: { value: nightOnly ? 1 : 0 } },
      fragAfterMaps: `totalEmissiveRadiance += vColor.rgb * uGlowK * mix(1.0, uWindowGlow, uGlowNight);`,
    });
    m = sm;
    vglowCache.set(k, m);
  }
  return m;
}

/** After Builder.build(): only meshes whose material is in `keep` cast shadows. */
export function castOnly(g: THREE.Object3D, keep: THREE.Material[]) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = keep.includes(m.material as THREE.Material);
  });
}
