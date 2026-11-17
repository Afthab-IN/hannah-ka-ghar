import * as THREE from 'three';
import { patchMaterial } from '../shaderlib';
import { mulberry32 } from '../noise';
import { heightAt, pathMask, soilMask, flowerMask, tallGrassMask, lawnMask, pondDist } from './terrain';
import { HOUSE, BAKERY, BARN, GREENHOUSE, COOP, GARDEN, FIRE_PIT, WINDMILL } from './layout';
import { flower3DGeos, flower3DMaterial, flowerColour } from './flowers3d';

// Grass tufts and wildflowers, generated in 12 m chunks around the player.
// Instances are shuffled, so drawing the first N of a chunk thins it evenly
// with distance.

const CHUNK = 16;

// footprints where nothing grows (buildings, porch, beds)
const NO_GROW: [number, number, number, number][] = [
  [HOUSE.x - HOUSE.w / 2 - 3.2, HOUSE.z - HOUSE.d / 2 - 0.8, HOUSE.x + HOUSE.w / 2 + 3.2, HOUSE.z + HOUSE.d / 2 + HOUSE.porchD + 1.2],
  [BAKERY.x - 4.5, BAKERY.z - 4.2, BAKERY.x + 5.2, BAKERY.z + 4.2],
  [BARN.x - 8, BARN.z - 10, BARN.x + 8, BARN.z + 10.5],
  [GREENHOUSE.x - 3.6, GREENHOUSE.z - 5, GREENHOUSE.x + 3.6, GREENHOUSE.z + 5],
  [COOP.x - 3.2, COOP.z - 3.2, COOP.x + 3.2, COOP.z + 3.2],
  [GARDEN.x - GARDEN.w / 2 - 0.4, GARDEN.z - GARDEN.d / 2 - 0.4, GARDEN.x + GARDEN.w / 2 + 0.4, GARDEN.z + GARDEN.d / 2 + 0.4],
  [FIRE_PIT.x - 1.3, FIRE_PIT.z - 1.3, FIRE_PIT.x + 1.3, FIRE_PIT.z + 1.3],
  [WINDMILL.x - 3, WINDMILL.z - 3, WINDMILL.x + 4, WINDMILL.z + 3],
];
export function noGrow(x: number, z: number) {
  for (const [a, b, c, d] of NO_GROW) if (x > a && x < c && z > b && z < d) return true;
  return false;
}
export function addNoGrow(x0: number, z0: number, x1: number, z1: number) { NO_GROW.push([x0, z0, x1, z1]); }

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
function buildTuftGeo(blades: number, seed: number, short = false): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const SEG = 3;
  const pos: number[] = [], nrm: number[] = [], sway: number[] = [], tip: number[] = [], side: number[] = [], tint: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (short ? 0.11 : 0.1);
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    // a few long blades, many medium, some short ones low in the clump
    const k = rnd();
    const h = (short ? 0.5 : 0.45) + k * k * 0.65;
    const w = (short ? 0.006 : 0.0065) + rnd() * 0.0055;
    const lean = short ? 0.04 + rnd() * 0.12 : 0.12 + rnd() * 0.45 * (0.5 + h);
    const dirA = a + (rnd() - 0.5) * 1.4;
    const dx = Math.cos(dirA), dz = Math.sin(dirA);
    const twist = (rnd() - 0.5) * 0.8;
    const tn = rnd();
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const y = t * h * (1 - lean * 0.25 * t);
      const bend = lean * t * t * h;
      const cx = ox + dx * bend, cz = oz + dz * bend;
      const facing = dirA + Math.PI / 2 + twist * t;
      const fx = Math.cos(facing), fz = Math.sin(facing);
      if (s === SEG) {
        // pointed tip
        pos.push(cx, y, cz);
        nrm.push(dx * 0.5, 0.85, dz * 0.5);
        sway.push(Math.pow(t, 1.6) * h * 0.45); tip.push(t); side.push(0); tint.push(tn);
        break;
      }
      const ww = w * (1 - Math.pow(t, 1.4) * 0.75);
      pos.push(cx - fx * ww, y, cz - fz * ww, cx + fx * ww, y, cz + fz * ww);
      // rounded across the blade: each edge normal leans out to its side
      const nx = dx * 0.4, nz = dz * 0.4;
      nrm.push(nx - fx * 0.6, 0.75, nz - fz * 0.6, nx + fx * 0.6, 0.75, nz + fz * 0.6);
      const sw = Math.pow(t, 1.6) * h * 0.45;
      sway.push(sw, sw); tip.push(t, t); side.push(-1, 1); tint.push(tn, tn);
    }
    for (let s = 0; s < SEG - 1; s++) {
      const i0 = base + s * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
    const last = base + (SEG - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  g.normalizeNormals();
  return g;
}

function buildGrassMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
  patchMaterial(m, {
    key: 'grass',
    wind: true,
    vertexHead: /* glsl */ `
      attribute float aTip;
      attribute float aSide;
      attribute float aTint;
      varying float vTip;
      varying float vSide;
      varying float vTint;
      varying float vFar;
    `,
    vsReplace: [[
      '#include <begin_vertex>',
      /* glsl */ `
      vTip = aTip;
      vSide = aSide;
      vTint = aTint;
      {
        vec4 io = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          io = instanceMatrix * io;
        #endif
        float d = length((modelMatrix * io).xyz - cameraPosition);
        vFar = smoothstep(10.0, 46.0, d);
        // widen far blades (there are fewer of them) and sink them at the edge
        transformed.xz *= 1.0 + vFar * 2.2;
        transformed.y *= 1.0 - smoothstep(46.0, 58.0, d);
      }
      `,
    ]],
    fragHead: /* glsl */ `
      varying float vTip;
      varying float vSide;
      varying float vTint;
      varying float vFar;
    `,
    fragAfterMaps: /* glsl */ `
      {
        // per-blade colour: lush, yellow-green, blue-green and the odd dry blade
        vec3 inst = diffuseColor.rgb;
        vec3 lush = vec3(0.13, 0.33, 0.05), yel = vec3(0.32, 0.42, 0.08), blu = vec3(0.1, 0.27, 0.1), dry = vec3(0.46, 0.42, 0.2);
        vec3 c = mix(lush, yel, smoothstep(0.35, 0.85, vTint));
        c = mix(c, blu, smoothstep(0.25, 0.0, vTint) * 0.8);
        c = mix(c, dry, step(0.965, vTint) * 0.85);
        c *= inst * 2.6;
        // darker in the clump, lighter and warmer toward the tip
        c *= mix(0.42, 1.0, smoothstep(0.0, 0.7, vTip));
        c = mix(c, c * vec3(1.15, 1.1, 0.75), smoothstep(0.6, 1.0, vTip) * 0.6);
        // a pale midrib and darker edges make each blade read as folded
        float rib = 1.0 - abs(vSide);
        c *= 0.8 + 0.3 * rib;
        c *= 0.92 + 0.16 * vnoise(vWPos.xz * 0.5);
        diffuseColor.rgb = c;
        roughnessFactor = mix(0.62, 0.9, vFar);
      }
    `,
    fragAfterLights: /* glsl */ `
      {
        // sunlight through the blades when looking toward the sun (golden hour glow)
        vec3 V = normalize(cameraPosition - vWPos);
        float back = pow(clamp(dot(-V, normalize(uLightDir)), 0.0, 1.0), 3.0);
        reflectedLight.directDiffuse += uLightCol * diffuseColor.rgb * vec3(0.9, 1.0, 0.55) * back * vTip * 0.45;
        reflectedLight.indirectDiffuse *= 0.6 + 0.5 * vTip;
      }
    `,
  });
  return m;
}

// ---------------------------------------------------------------------------
// Real grass clumps (Poly Haven, CC0) on crossed cards: they carry the meadow
// in the middle distance, where single blades would be too expensive.
// ---------------------------------------------------------------------------
function buildClumpGeo(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], sway: number[] = [];
  const idx: number[] = [];
  for (let q = 0; q < 3; q++) {
    const a = (q * Math.PI) / 3 + 0.2;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    const b = pos.length / 3;
    for (const [sx, y] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) {
      pos.push(cx * sx, y, cz * sx);
      uv.push((sx + 1) / 2, y);
      nrm.push(-Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3);
      sway.push(y * y * 0.3);
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.normalizeNormals();
  return g;
}

function buildClumpMaterial() {
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map: blank, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.85 });
  new THREE.TextureLoader().load('./tex/grass_clumps.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    m.map = t; m.needsUpdate = true;
  });
  patchMaterial(m, {
    key: 'clumps', wind: true,
    vertexHead: 'attribute float aType; varying float vClH;',
    vsReplace: [['#include <uv_vertex>', `
      #ifdef USE_MAP
        vMapUv.x = (vMapUv.x * 0.98 + 0.01 + aType) / 4.0;
      #endif
      vClH = uv.y;
    `]],
    fragHead: 'varying float vClH;',
    fragAfterMaps: 'diffuseColor.rgb *= mix(0.8, 1.25, vClH) * vec3(1.0, 1.12, 0.7);',
    fragAfterLights: /* glsl */ `
      {
        vec3 V = normalize(cameraPosition - vWPos);
        float back = pow(clamp(dot(-V, normalize(uLightDir)), 0.0, 1.0), 3.0);
        reflectedLight.directDiffuse += uLightCol * diffuseColor.rgb * vec3(0.9, 1.0, 0.55) * back * vClH * 0.4;
      }
    `,
  });
  return m;
}

// ---------------------------------------------------------------------------
// Flowers: crossed cards from a painted atlas
// ---------------------------------------------------------------------------
const FLOWER_TYPES = 6;
function paintFlowerAtlas(): THREE.CanvasTexture {
  const CW = 128, CH = 256;
  const cv = document.createElement('canvas');
  cv.width = CW * FLOWER_TYPES; cv.height = CH;
  const g = cv.getContext('2d')!;
  const rnd = mulberry32(77);
  const stem = (x: number, y0: number, y1: number, bend: number) => {
    g.strokeStyle = '#3f6a23';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + bend, (y0 + y1) / 2, x + bend * 0.6, y1); g.stroke();
  };
  const leafy = (x0: number) => {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = ['#355e1d', '#4c7a2a', '#2f5418'][i % 3];
      g.beginPath();
      const x = x0 + 30 + rnd() * 68, y = CH - 10 - rnd() * 50;
      g.ellipse(x, y, 4 + rnd() * 5, 16 + rnd() * 14, (rnd() - 0.5) * 1.2, 0, Math.PI * 2);
      g.fill();
    }
  };
  // 0: purple lupine spikes, 1: pink/magenta spikes
  for (const [k, cols] of [[0, ['#6b3fa8', '#7d4cc0', '#9a6ad6', '#5a338f', '#b48ae6']], [1, ['#c2418f', '#d65aa8', '#e98ac4', '#a8327a', '#f0b2d8']]] as [number, string[]][]) {
    const x0 = k * CW;
    leafy(x0);
    for (let s = 0; s < 3; s++) {
      const x = x0 + 34 + s * 30 + (rnd() - 0.5) * 10;
      const top = 30 + rnd() * 60;
      stem(x, CH, top + 20, (rnd() - 0.5) * 10);
      for (let i = 0; i < 46; i++) {
        const t = i / 46;
        const y = top + t * 120;
        const w = 4 + t * 9;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        g.beginPath();
        g.ellipse(x + (rnd() - 0.5) * w * 2, y, 3.4 + t * 2, 2.8 + t * 1.5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // 2: yellow daisies / black-eyed susans, 3: orange, 4: white clusters
  const daisies = (k: number, petal: string, petal2: string, centre: string, n: number, size: number) => {
    const x0 = k * CW;
    leafy(x0);
    for (let s = 0; s < n; s++) {
      const x = x0 + 20 + rnd() * 88, y = 30 + rnd() * 120;
      stem(x, CH, y, (rnd() - 0.5) * 18);
      const r = size * (0.75 + rnd() * 0.5);
      for (let p = 0; p < 11; p++) {
        const a = (p / 11) * Math.PI * 2 + rnd() * 0.2;
        g.fillStyle = rnd() < 0.5 ? petal : petal2;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.45, r * 0.55, r * 0.2, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = centre;
      g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
    }
  };
  daisies(2, '#f2c21b', '#f7d64a', '#4a2a0c', 5, 13);
  daisies(3, '#f08a1c', '#f5a63a', '#7a3a08', 4, 11);
  // 4: little white flowers in clusters
  {
    const x0 = 4 * CW;
    leafy(x0);
    for (let s = 0; s < 4; s++) {
      const x = x0 + 25 + rnd() * 78, y = 60 + rnd() * 90;
      stem(x, CH, y + 8, (rnd() - 0.5) * 16);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = rnd() < 0.8 ? '#f4f2ea' : '#e9e2f4';
        g.beginPath(); g.arc(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 20, 2.5 + rnd() * 2, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // 5: tall grass seed heads (golden)
  {
    const x0 = 5 * CW;
    for (let s = 0; s < 7; s++) {
      const x = x0 + 14 + rnd() * 100, top = 20 + rnd() * 70;
      g.strokeStyle = '#9a8a44'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, CH); g.quadraticCurveTo(x + 6, (CH + top) / 2, x + (rnd() - 0.5) * 16, top); g.stroke();
      g.fillStyle = '#d8c070';
      for (let i = 0; i < 10; i++) { g.beginPath(); g.ellipse(x + (rnd() - 0.5) * 6, top + i * 4, 2, 4, 0.3, 0, Math.PI * 2); g.fill(); }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // swap the painted yellow and orange heads for photographed celandines and dandelions
  const img = new Image();
  img.onload = () => {
    for (const [col, srcs] of [[2, [0, 1]], [3, [2, 3]]] as [number, number[]][]) {
      const x0 = col * CW;
      g.clearRect(x0, 0, CW, CH);
      leafy(x0);
      const n = col === 2 ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const x = x0 + 22 + (k / Math.max(1, n - 1)) * 84 + (rnd() - 0.5) * 10, y = 34 + rnd() * 110;
        stem(x, CH, y + 8, (rnd() - 0.5) * 16);
        const sz = (col === 2 ? 38 : 46) * (0.8 + rnd() * 0.4);
        const si = srcs[k % srcs.length];
        g.drawImage(img, si * 128 + 2, 66, 124, 124, x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    tex.needsUpdate = true;
  };
  img.src = './tex/flower_heads.png';
  return tex;
}

function buildFlowerGeo(): THREE.BufferGeometry {
  // two crossed quads, uv.x later offset by the atlas column per instance
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], sway: number[] = [];
  const idx: number[] = [];
  for (let q = 0; q < 2; q++) {
    const a = q * Math.PI / 2 + 0.3;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    const b = pos.length / 3;
    const verts = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (const [s, y] of verts) {
      pos.push(cx * s, y, cz * s);
      uv.push((s + 1) / 2, y);
      nrm.push(0, 1, 0);
      sway.push(y * y * 0.35);
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  return g;
}

function buildFlowerMaterial(tex: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  patchMaterial(m, {
    key: 'flowers',
    wind: true,
    vertexHead: 'attribute float aType;',
    vsReplace: [['#include <uv_vertex>', `
      #ifdef USE_MAP
        vMapUv.x = (vMapUv.x + aType) / ${FLOWER_TYPES.toFixed(1)};
      #endif
    `]],
    fragAfterLights: /* glsl */ `
      {
        vec3 V = normalize(cameraPosition - vWPos);
        float back = pow(clamp(dot(-V, normalize(uLightDir)), 0.0, 1.0), 3.0);
        reflectedLight.directDiffuse += uLightCol * diffuseColor.rgb * back * 0.4;
      }
    `,
  });
  return m;
}

// ---------------------------------------------------------------------------
// Chunks
// ---------------------------------------------------------------------------
interface Chunk { clumps: THREE.InstancedMesh | null; cN: number; lawn: THREE.InstancedMesh | null; lN: number; grass: THREE.InstancedMesh; flowers: THREE.InstancedMesh | null; near: { m: THREE.InstancedMesh; n: number }[]; gN: number; fN: number; cx: number; cz: number }

export class Meadow {
  group = new THREE.Group();
  private chunks = new Map<string, Chunk>();
  private tufts: THREE.BufferGeometry[];
  private lawnTuft: THREE.BufferGeometry;
  private clumpGeo: THREE.BufferGeometry;
  private clumpMat: THREE.Material;
  private grassMat: THREE.Material;
  private flowerGeo: THREE.BufferGeometry;
  private flowerMat: THREE.Material;
  private radius: number;
  private density: number;
  private genBudget = 0;

  constructor(quality: 'low' | 'med' | 'high') {
    this.tufts = [buildTuftGeo(9, 1), buildTuftGeo(8, 2)];
    this.lawnTuft = buildTuftGeo(18, 3, true);
    this.clumpGeo = buildClumpGeo();
    this.clumpMat = buildClumpMaterial();
    this.grassMat = buildGrassMaterial();
    this.flowerGeo = buildFlowerGeo();
    this.flowerMat = buildFlowerMaterial(paintFlowerAtlas());
    this.radius = quality === 'high' ? 58 : quality === 'med' ? 50 : 40;
    this.density = quality === 'high' ? 1 : quality === 'med' ? 0.7 : 0.45;
    this.group.name = 'meadow';
  }

  private makeChunk(ci: number, cj: number): Chunk {
    const rnd = mulberry32((ci * 73856093) ^ (cj * 19349663));
    const x0 = ci * CHUNK, z0 = cj * CHUNK;
    type T = { x: number; z: number; y: number; s: number; h: number; r: number; c: THREE.Color; t?: number };
    const gl: T[] = [], fl: T[] = [], ll: T[] = [], cl: T[] = [];
    const sp = 0.31 / Math.sqrt(this.density);
    const n = Math.floor(CHUNK / sp);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + (i + rnd()) * sp, z = z0 + (j + rnd()) * sp;
      if (noGrow(x, z)) continue;
      const pm = pathMask(x, z);
      if (pm > 0.35 + rnd() * 0.3) continue;
      if (soilMask(x, z) > 0.45 + rnd() * 0.3) continue;
      const pd = pondDist(x, z);
      if (pd < 0.97) continue;
      const tall = tallGrassMask(x, z);
      const lawn = lawnMask(x, z);
      const y = heightAt(x, z) - 0.03;
      // grass height: lawn short, meadow knee-high, reeds tall at the bank
      let h = THREE.MathUtils.lerp(0.15, 0.36 + rnd() * 0.26, tall) * (1 - pm * 0.6);
      if (pd < 1.4) h = 0.6 + rnd() * 0.45;
      const hue = rnd();
      col.setRGB(0.36 + hue * 0.06, 0.38 + hue * 0.03, 0.36);
      if (lawn > 0.5) col.setRGB(0.4, 0.42, 0.36);
      if (lawn > 0.5) ll.push({ x, z, y, s: 0.75 + rnd() * 0.3, h: 0.13 + rnd() * 0.06, r: rnd() * 6.28, c: col.clone() });
      else {
        gl.push({ x, z, y, s: 0.9 + rnd() * 0.5, h, r: rnd() * 6.28, c: col.clone() });
        if (rnd() < 0.22) cl.push({ x: x + (rnd() - 0.5) * 0.3, z: z + (rnd() - 0.5) * 0.3, y: y - 0.02, s: 0.7 + rnd() * 0.4, h: h * (0.85 + rnd() * 0.3) + 0.04, r: rnd() * 6.28, c: col.clone().multiplyScalar(3.4 + rnd() * 0.8), t: Math.floor(rnd() * 4) });
      }
      const fm = flowerMask(x, z);
      if (fm > 0.02 && rnd() < fm * 0.95) {
        // purple and pink spikes dominate, like the photo, with gold daisies scattered through
        const k = rnd();
        const t = k < 0.42 ? 0 : k < 0.6 ? 1 : k < 0.78 ? 2 : k < 0.86 ? 3 : k < 0.95 ? 4 : 5;
        const fh = (t <= 1 ? 0.5 : 0.38) + rnd() * 0.26;
        fl.push({ x: x + (rnd() - 0.5) * 0.2, z: z + (rnd() - 0.5) * 0.2, y, s: fh * (0.7 + rnd() * 0.5), h: fh, r: rnd() * 6.28, c: col.set(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.3), t });
      } else if (tall > 0.8 && rnd() < 0.04) {
        fl.push({ x, z, y, s: 0.8, h: 0.8 + rnd() * 0.3, r: rnd() * 6.28, c: col.set(1, 1, 1), t: 5 });
      }
    }
    // shuffle so drawing a prefix thins evenly
    for (const a of [gl, fl, ll, cl]) for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const geo = this.tufts[(ci + cj) & 1];
    const grass = new THREE.InstancedMesh(geo, this.grassMat, Math.max(1, gl.length));
    gl.forEach((g, i) => {
      m4.compose(p.set(g.x, g.y, g.z), q.setFromAxisAngle(up, g.r), s.set(g.s, g.h, g.s));
      grass.setMatrixAt(i, m4);
      grass.setColorAt(i, g.c);
    });
    grass.count = gl.length;
    grass.receiveShadow = true;
    grass.castShadow = false;
    grass.frustumCulled = true;
    grass.geometry = geo;
    grass.computeBoundingSphere();
    let flowers: THREE.InstancedMesh | null = null;
    if (fl.length) {
      const fg = this.flowerGeo.clone();
      const types = new Float32Array(fl.length);
      fl.forEach((f, i) => (types[i] = f.t!));
      fg.setAttribute('aType', new THREE.InstancedBufferAttribute(types, 1));
      flowers = new THREE.InstancedMesh(fg, this.flowerMat, fl.length);
      fl.forEach((f, i) => {
        m4.compose(p.set(f.x, f.y, f.z), q.setFromAxisAngle(up, f.r), s.set(f.s * 0.5, f.h, f.s * 0.5));
        flowers!.setMatrixAt(i, m4);
        flowers!.setColorAt(i, f.c);
      });
      flowers.receiveShadow = true;
      flowers.computeBoundingSphere();
    }
    // the same flowers as real 3D plants, shown when the chunk is close
    const near: { m: THREE.InstancedMesh; n: number }[] = [];
    const geos3 = flower3DGeos();
    const byGeo = new Map<THREE.BufferGeometry, typeof fl>();
    for (const f of fl) { const g3 = geos3[f.t!]; if (!byGeo.has(g3)) byGeo.set(g3, []); byGeo.get(g3)!.push(f); }
    for (const [g3, list] of byGeo) {
      const geo3 = g3.clone();
      const cols = new Float32Array(list.length * 3);
      list.forEach((f, i) => { const cc = flowerColour(f.t!, rnd()); cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b; });
      geo3.setAttribute('aFCol', new THREE.InstancedBufferAttribute(cols, 3));
      const m3 = new THREE.InstancedMesh(geo3, flower3DMaterial(), list.length);
      list.forEach((f, i) => {
        const hs = f.t === 5 ? f.h * 0.75 : f.h * 1.05;
        m4.compose(p.set(f.x, f.y, f.z), q.setFromAxisAngle(up, f.r), s.set(hs, hs, hs));
        m3.setMatrixAt(i, m4);
      });
      m3.receiveShadow = true;
      m3.visible = false;
      m3.computeBoundingSphere();
      near.push({ m: m3, n: list.length });
      this.group.add(m3);
    }
    let lawnM: THREE.InstancedMesh | null = null;
    if (ll.length) {
      lawnM = new THREE.InstancedMesh(this.lawnTuft, this.grassMat, ll.length);
      ll.forEach((g, i) => {
        m4.compose(p.set(g.x, g.y, g.z), q.setFromAxisAngle(up, g.r), s.set(g.s, g.h, g.s));
        lawnM!.setMatrixAt(i, m4);
        lawnM!.setColorAt(i, g.c);
      });
      lawnM.receiveShadow = true;
      lawnM.computeBoundingSphere();
      this.group.add(lawnM);
    }
    let clumps: THREE.InstancedMesh | null = null;
    if (cl.length) {
      const cg = this.clumpGeo.clone();
      const types = new Float32Array(cl.length);
      cl.forEach((g, i) => (types[i] = g.t!));
      cg.setAttribute('aType', new THREE.InstancedBufferAttribute(types, 1));
      clumps = new THREE.InstancedMesh(cg, this.clumpMat, cl.length);
      cl.forEach((g, i) => {
        m4.compose(p.set(g.x, g.y, g.z), q.setFromAxisAngle(up, g.r), s.set(g.s, g.h, g.s));
        clumps!.setMatrixAt(i, m4);
        clumps!.setColorAt(i, g.c);
      });
      clumps.receiveShadow = true;
      clumps.computeBoundingSphere();
      this.group.add(clumps);
    }
    const c: Chunk = { clumps, cN: cl.length, lawn: lawnM, lN: ll.length, grass, flowers, near, gN: gl.length, fN: fl.length, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2 };
    this.group.add(grass);
    if (flowers) this.group.add(flowers);
    return c;
  }

  update(cam: THREE.Vector3) {
    const R = this.radius;
    const i0 = Math.floor((cam.x - R) / CHUNK), i1 = Math.floor((cam.x + R) / CHUNK);
    const j0 = Math.floor((cam.z - R) / CHUNK), j1 = Math.floor((cam.z + R) / CHUNK);
    this.genBudget = 2; // build at most a couple of chunks a frame
    const seen = new Set<string>();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const cx = (i + 0.5) * CHUNK, cz = (j + 0.5) * CHUNK;
      const d = Math.hypot(cx - cam.x, cz - cam.z) - CHUNK * 0.7;
      if (d > R) continue;
      const k = `${i},${j}`;
      seen.add(k);
      let c = this.chunks.get(k);
      if (!c) {
        if (this.genBudget-- <= 0) continue;
        c = this.makeChunk(i, j);
        this.chunks.set(k, c);
      }
      const dd = Math.max(0, d);
      // density falls with distance
      const f = dd < 7 ? 1 : dd < 14 ? 0.5 : 0.22;
      // single blades only up close; real grass clumps carry the distance
      c.grass.visible = c.gN > 0 && dd < 19;
      if (c.clumps) { c.clumps.visible = true; c.clumps.count = Math.floor(c.cN * (dd < 30 ? 1 : 0.6)); }
      if (c.lawn) { c.lawn.visible = true; c.lawn.count = Math.floor(c.lN * f); }
      c.grass.count = Math.max(0, Math.floor(c.gN * f));
      if (c.flowers) {
        const close = dd < 8;
        c.flowers.visible = !close;
        c.flowers.count = Math.floor(c.fN * Math.min(1, f * 1.6));
        for (const nm of c.near) { nm.m.visible = close; nm.m.count = Math.floor(nm.n * Math.min(1, f * 1.8)); }
      }
    }
    for (const [k, c] of this.chunks) {
      if (seen.has(k)) continue;
      c.grass.visible = false;
      if (c.flowers) c.flowers.visible = false;
      if (c.lawn) c.lawn.visible = false;
      if (c.clumps) c.clumps.visible = false;
      for (const nm of c.near) nm.m.visible = false;
    }
  }
}
