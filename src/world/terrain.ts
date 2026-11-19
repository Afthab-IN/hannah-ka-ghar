import * as THREE from 'three';
import { makeSimplex, fbm, smoothstep, clamp } from '../noise';
import { patchMaterial } from '../shaderlib';
import { PADS, POND, PATHS, HOUSE, BAKERY, COOP, BARN, PADDOCK, GARDEN, GREENHOUSE, FENCE_MAIN, FIRE_PIT, ORCHARD } from './layout';

const n1 = makeSimplex(11);
const n2 = makeSimplex(23);
const n3 = makeSimplex(37);
const n4 = makeSimplex(51);

// ---------------------------------------------------------------------------
// Height
// ---------------------------------------------------------------------------
function baseHeight(x: number, z: number): number {
  // gentle rise from the pond up to the house, then a hill behind it
  let h = 2.6 * smoothstep(12, -46, z);
  h += 8.0 * smoothstep(-62, -128, z) * (1 - 0.55 * smoothstep(40, 110, Math.abs(x - 22)));
  h += 1.3 * fbm(n1, x * 0.011, z * 0.011, 3);
  h += 0.22 * n2(x * 0.06, z * 0.06);
  // rolling farmland beyond the walkable area, then hills on the horizon
  const r = Math.hypot(x, z + 30);
  const far = smoothstep(115, 250, r);
  h += far * (16 * (fbm(n3, x * 0.0045, z * 0.0045, 4) * 0.5 + 0.5) + 5 * n2(x * 0.012, z * 0.012));
  h += smoothstep(320, 1500, r) * 46 * (0.55 + 0.45 * n4(x * 0.0018 + 3, z * 0.0018));
  return h;
}

function pondD(x: number, z: number): number {
  const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
  const dx = x - POND.x, dz = z - POND.z;
  const u = (dx * c - dz * s) / POND.rx;
  const v = (dx * s + dz * c) / POND.rz;
  // wobbly shoreline
  const a = Math.atan2(v, u);
  const wob = 1 + 0.07 * Math.sin(a * 3 + 1.3) + 0.05 * Math.sin(a * 5 - 0.4);
  return Math.hypot(u, v) / wob;
}

const padY = PADS.map((p) => baseHeight(p.x, p.z) + (p.lift || 0));
export const WATER_Y = baseHeight(POND.x, POND.z) - 0.25;

export function heightAt(x: number, z: number): number {
  let h = baseHeight(x, z);
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i];
    const dx = Math.max(Math.abs(x - p.x) - p.hx, 0);
    const dz = Math.max(Math.abs(z - p.z) - p.hz, 0);
    const dd = Math.hypot(dx, dz);
    if (dd < p.margin) h = padY[i] + (h - padY[i]) * smoothstep(0, p.margin, dd);
  }
  const d = pondD(x, z);
  if (d < 2.4) {
    // a shelf that keeps the bank just above the water, then the basin
    const bank = WATER_Y + 0.12 + 0.45 * (d - 1);
    const shoreH = h + (Math.max(h, bank) - h) * (1 - smoothstep(1.4, 2.4, d));
    if (d >= 1) h = shoreH;
    else {
      const bottom = WATER_Y - 0.1 - 1.6 * (1 - d * d);
      h = bottom + (WATER_Y + 0.05 - bottom) * smoothstep(0.82, 1.0, d);
    }
  }
  return h;
}

export function heightPad(i: number) { return padY[i]; }
export function padHeightAt(x: number, z: number): number {
  // height of the pad whose centre is nearest (buildings use this for floors)
  let best = 0, bd = 1e9;
  PADS.forEach((p, i) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = i; } });
  return padY[best];
}
export function inPond(x: number, z: number) { return pondD(x, z) < 1; }
export function pondDist(x: number, z: number) { return pondD(x, z); }

export function normalAt(x: number, z: number, out = new THREE.Vector3()) {
  const e = 0.4;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

// ---------------------------------------------------------------------------
// Ground masks (also used on the CPU to place grass and flowers)
// ---------------------------------------------------------------------------
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

export function pathMask(x: number, z: number): number {
  let m = 0;
  const wob = 1 + 0.25 * n2(x * 0.35, z * 0.35);
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      if (x < Math.min(ax, bx) - 4 || x > Math.max(ax, bx) + 4 || z < Math.min(az, bz) - 4 || z > Math.max(az, bz) + 4) continue;
      const d = segDist(x, z, ax, az, bx, bz);
      m = Math.max(m, 1 - smoothstep(p.w * 0.7 * wob, p.w * 1.2 * wob, d));
    }
  }
  return m;
}

function boxD(x: number, z: number, cx: number, cz: number, hx: number, hz: number) {
  const dx = Math.max(Math.abs(x - cx) - hx, 0), dz = Math.max(Math.abs(z - cz) - hz, 0);
  return Math.hypot(dx, dz);
}

export function lawnMask(x: number, z: number): number {
  // mown lawn around the buildings, inside the fence
  if (z > FENCE_MAIN.z + 1.5) return 0;
  let m = 1 - smoothstep(10, 20, boxD(x, z, HOUSE.x, HOUSE.z, HOUSE.w / 2, HOUSE.d / 2));
  m = Math.max(m, 1 - smoothstep(6, 12, boxD(x, z, BAKERY.x, BAKERY.z, 4, 4)));
  m = Math.max(m, 1 - smoothstep(4, 9, boxD(x, z, GARDEN.x, GARDEN.z, GARDEN.w / 2, GARDEN.d / 2)));
  m = Math.max(m, 1 - smoothstep(3, 7, boxD(x, z, GREENHOUSE.x, GREENHOUSE.z, 3, 4.5)));
  const edge = n1(x * 0.08, z * 0.08) * 3;
  return m * (1 - smoothstep(-2 + edge, 1 + edge, z - FENCE_MAIN.z));
}

export function soilMask(x: number, z: number): number {
  let m = 0;
  // vegetable beds: rows inside the garden
  const gx = x - GARDEN.x, gz = z - GARDEN.z;
  if (Math.abs(gx) < GARDEN.w / 2 - 0.6 && Math.abs(gz) < GARDEN.d / 2 - 0.6) {
    const row = Math.abs(((gz + 100) % 2.2) - 1.1);
    m = Math.max(m, 1 - smoothstep(0.55, 0.7, row));
  }
  // worn paddock ground near the barn door and the water trough
  if (x > PADDOCK.x0 && x < PADDOCK.x1 && z > PADDOCK.z0 && z < PADDOCK.z1) {
    m = Math.max(m, 0.55 * (1 - smoothstep(2, 9, Math.hypot(x - (PADDOCK.x0 + 6), z - (PADDOCK.z0 + 4)))));
    m = Math.max(m, 0.35 * smoothstep(0.5, 0.75, n3(x * 0.15, z * 0.15)));
  }
  m = Math.max(m, 1 - smoothstep(4, 7, Math.hypot(x - BARN.x, z - (BARN.z + BARN.d / 2 + 3))));
  // chicken yard
  m = Math.max(m, 0.75 * (1 - smoothstep(2.5, 5.5, Math.hypot(x - COOP.x, z - COOP.z))));
  // trampled ring round the fire pit
  m = Math.max(m, 0.6 * (1 - smoothstep(1.2, 2.6, Math.hypot(x - FIRE_PIT.x, z - FIRE_PIT.z))));
  return m;
}

export function flowerMask(x: number, z: number): number {
  // wildflower meadow south of the fence, densest in the foreground
  if (pondD(x, z) < 1.25) return 0;
  const south = smoothstep(FENCE_MAIN.z + 2, FENCE_MAIN.z + 10, z);
  const near = 1 - smoothstep(60, 110, Math.hypot(x - 2, z - 12));
  const patches = smoothstep(-0.25, 0.45, fbm(n4, x * 0.035, z * 0.035, 3));
  let m = south * near * (0.25 + 0.75 * patches);
  // the band in front of the chairs and pond is full of flowers (like the photo)
  m = Math.max(m, (1 - smoothstep(6, 16, Math.abs(z - 15))) * (1 - smoothstep(26, 40, Math.abs(x - 4))) * 0.95);
  m *= smoothstep(1.4, 2.6, Math.hypot(x - FIRE_PIT.x, z - FIRE_PIT.z));
  // a few patches up by the orchard
  if (x > ORCHARD.x0 - 8 && x < ORCHARD.x1 + 8 && z > ORCHARD.z0 - 8 && z < ORCHARD.z1 + 8) m = Math.max(m, 0.4 * patches);
  return m * (1 - pathMask(x, z));
}

// tall meadow grass vs short lawn: 0 short .. 1 tall
export function tallGrassMask(x: number, z: number): number {
  const lawn = lawnMask(x, z);
  const pd = pondD(x, z);
  const reeds = pd > 1.0 && pd < 1.5 ? 1 : 0;
  return Math.max(reeds, (1 - lawn) * (0.75 + 0.25 * smoothstep(-0.3, 0.4, n1(x * 0.05, z * 0.05))));
}

// ---------------------------------------------------------------------------
// Mask texture for the ground shader: R path, G lawn, B soil, A flowers
// ---------------------------------------------------------------------------
export const SPLAT_RECT = { x: -170, z: -200, size: 340 };
function buildSplat(): THREE.DataTexture {
  const N = 1024;
  const data = new Uint8Array(N * N * 4);
  const s = SPLAT_RECT.size / N;
  for (let j = 0; j < N; j++) {
    const z = SPLAT_RECT.z + (j + 0.5) * s;
    for (let i = 0; i < N; i++) {
      const x = SPLAT_RECT.x + (i + 0.5) * s;
      const k = (j * N + i) * 4;
      data[k] = pathMask(x, z) * 255;
      data[k + 1] = lawnMask(x, z) * 255;
      data[k + 2] = soilMask(x, z) * 255;
      data[k + 3] = flowerMask(x, z) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Mesh: one grid, dense in the middle and coarse at the horizon
// ---------------------------------------------------------------------------
export function buildTerrain(quality: 'low' | 'med' | 'high' = 'high'): THREE.Mesh {
  const N = quality === 'high' ? 400 : quality === 'med' ? 300 : 240;
  const CX = 0, CZ = -30;
  const c1 = 125, c2 = 2300;
  const map = (t: number) => c1 * t + c2 * Math.sign(t) * Math.abs(t) ** 4;
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const nrm = new Float32Array((N + 1) * (N + 1) * 3);
  const xs = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) xs[i] = map(-1 + (2 * i) / N);
  const v = new THREE.Vector3();
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = CX + xs[i], z = CZ + xs[j];
      const k = (j * (N + 1) + i) * 3;
      pos[k] = x; pos[k + 1] = heightAt(x, z); pos[k + 2] = z;
      // wider normal footprint far away keeps the distance smooth
      const e = Math.max(0.4, Math.abs(xs[Math.min(i + 1, N)] - xs[i]) * 0.5);
      const hx = heightAt(x + e, z) - heightAt(x - e, z);
      const hz = heightAt(x, z + e) - heightAt(x, z - e);
      v.set(-hx, 2 * e, -hz).normalize();
      nrm[k] = v.x; nrm[k + 1] = v.y; nrm[k + 2] = v.z;
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let p = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[p++] = a; idx[p++] = c; idx[p++] = b;
    idx[p++] = b; idx[p++] = c; idx[p++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();

  const splat = buildSplat();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  // photographed ground (Poly Haven, CC0): grass detail, the dirt path and garden soil
  const white = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  white.needsUpdate = true;
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flat.needsUpdate = true;
  const uGrassT = { value: white as THREE.Texture }, uPathT = { value: white as THREE.Texture }, uPathN = { value: flat as THREE.Texture }, uSoilT = { value: white as THREE.Texture }, uTexOn = { value: 0 };
  const tl = new THREE.TextureLoader();
  let loaded = 0;
  const ld = (url: string, u: { value: THREE.Texture }, srgb: boolean) => tl.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    u.value = t;
    if (++loaded === 4) uTexOn.value = 1;
  });
  ld('./tex/ground_grass.jpg', uGrassT, true);
  ld('./tex/path.jpg', uPathT, true);
  ld('./tex/path_n.jpg', uPathN, false);
  ld('./tex/soil.jpg', uSoilT, true);
  patchMaterial(mat, {
    key: 'terrain',
    extraUniforms: {
      uSplat: { value: splat },
      uSplatRect: { value: new THREE.Vector3(SPLAT_RECT.x, SPLAT_RECT.z, SPLAT_RECT.size) },
      uWaterY: { value: WATER_Y },
      uPond: { value: new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz) },
      uGrassT, uPathT, uPathN, uSoilT, uTexOn,
      uPondRot: { value: POND.rot },
    },
    fragHead: /* glsl */ `
      uniform sampler2D uSplat;
      uniform vec3 uSplatRect;
      uniform float uWaterY;
      uniform vec4 uPond;
      uniform sampler2D uGrassT, uPathT, uPathN, uSoilT;
      uniform float uTexOn;
      uniform float uPondRot;
      float pondD(vec2 p) {
        float c = cos(uPondRot), s = sin(uPondRot);
        vec2 d = p - uPond.xy;
        vec2 q = vec2((d.x * c - d.y * s) / uPond.z, (d.x * s + d.y * c) / uPond.w);
        float a = atan(q.y, q.x);
        return length(q) / (1.0 + 0.07 * sin(a * 3.0 + 1.3) + 0.05 * sin(a * 5.0 - 0.4));
      }
    `,
    fragAfterMaps: /* glsl */ `
    {
      vec2 suv = (vWPos.xz - uSplatRect.xy) / uSplatRect.z;
      float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
      vec4 sp = texture2D(uSplat, clamp(suv, 0.0, 1.0)) * inside;
      vec2 p = vWPos.xz;
      float n = fbm3(p * 0.08);
      float nf = vnoise(p * 1.7);
      float dist = length(vWPos - cameraPosition);
      // meadow grass: lush green with warmer, drier patches
      vec3 lush = vec3(0.16, 0.30, 0.07);
      vec3 dry = vec3(0.34, 0.37, 0.12);
      vec3 grass = mix(lush, dry, smoothstep(0.35, 0.8, n) * 0.6);
      grass *= 0.8 + 0.35 * nf;
      // mown lawn: brighter, with faint mowing stripes
      vec3 lawn = mix(vec3(0.15, 0.3, 0.06), vec3(0.24, 0.4, 0.09), vnoise(p * 0.6)) * (0.82 + 0.3 * nf);
      lawn *= 0.9 + 0.1 * vnoise(p * 9.0);
      lawn *= 0.95 + 0.05 * step(0.5, fract(p.x * 0.33 + p.y * 0.05));
      grass = mix(grass, lawn, sp.g);
      // real ground detail close up: soil and blades seen from above
      vec3 gd = texture2D(uGrassT, p / 3.2).rgb;
      vec3 gd2 = texture2D(uGrassT, p / 11.0 + 0.37).rgb;
      float gl = dot(mix(gd, gd2, 0.4), vec3(0.3, 0.59, 0.11));
      float near = 1.0 - smoothstep(25.0, 90.0, dist);
      grass *= mix(1.0, clamp(0.45 + gl * 2.4, 0.5, 1.5), uTexOn * near * 0.85);
      // wildflowers read as a purple and gold haze in the distance
      float fl = sp.a * smoothstep(8.0, 40.0, dist);
      vec3 flowerHaze = mix(vec3(0.42, 0.24, 0.5), vec3(0.62, 0.5, 0.18), step(0.62, vnoise(p * 0.9)));
      grass = mix(grass, flowerHaze, fl * 0.35 * smoothstep(0.3, 0.7, vnoise(p * 2.3 + 4.0)));
      // dirt path with gravel speckle
      vec3 dirt = mix(vec3(0.3, 0.24, 0.17), vec3(0.4, 0.33, 0.24), vnoise(p * 2.5));
      dirt *= 0.86 + 0.14 * vnoise(p * 22.0) + 0.08 * vnoise(p * 60.0);
      // a worn track: grass creeps back in along the middle and edges
      dirt = mix(dirt, grass * 0.9, 0.35 * smoothstep(0.45, 0.8, vnoise(p * 1.3 + 3.0)));
      vec3 soil = mix(vec3(0.17, 0.11, 0.07), vec3(0.26, 0.18, 0.11), vnoise(p * 4.0));
      soil = mix(soil, texture2D(uSoilT, p / 1.6).rgb * 0.85, uTexOn * 0.85);
      vec3 pathTex = texture2D(uPathT, p / 2.4).rgb;
      dirt = mix(dirt, mix(pathTex, vec3(dot(pathTex, vec3(0.33))), 0.35) * vec3(0.92, 0.88, 0.8), uTexOn * 0.8);
      vec3 col = grass;
      col = mix(col, soil, sp.b);
      col = mix(col, dirt, smoothstep(0.2, 0.85, sp.r));
      // wet, darker bank and a muddy pond bed
      float above = vWPos.y - uWaterY;
      float nearPond = 1.0 - smoothstep(1.2, 1.7, pondD(p));
      col = mix(col, col * vec3(0.55, 0.62, 0.42), (1.0 - smoothstep(0.05, 0.5, above)) * nearPond);
      col = mix(col, vec3(0.11, 0.1, 0.06), (1.0 - smoothstep(-0.05, 0.1, above)) * nearPond);
      // far patchwork fields and hedgerows
      float far = smoothstep(140.0, 260.0, length(vWPos.xz - vec2(0.0, -30.0)));
      if (far > 0.0) {
        vec2 q = p * 0.012;
        vec2 cell = floor(q + vec2(vnoise(q * 3.0), vnoise(q * 3.0 + 7.0)) * 0.35);
        float r = h21(cell);
        vec3 field = r < 0.3 ? vec3(0.17, 0.3, 0.07) : r < 0.55 ? vec3(0.24, 0.34, 0.09) : r < 0.68 ? vec3(0.36, 0.36, 0.14) : r < 0.86 ? vec3(0.13, 0.24, 0.06) : vec3(0.21, 0.3, 0.08);
        vec2 fq = fract(q + vec2(vnoise(q * 3.0), vnoise(q * 3.0 + 7.0)) * 0.35);
        float hedge = 1.0 - smoothstep(0.0, 0.035, min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y)));
        field = mix(field, vec3(0.06, 0.11, 0.03), hedge * 0.85);
        field *= 0.85 + 0.25 * vnoise(p * 0.2);
        col = mix(col, field, far);
      }
      diffuseColor.rgb = col;
      {
        // bumpy, stony dirt on the paths
        vec3 tn = texture2D(uPathN, p / 2.4).xyz * 2.0 - 1.0;
        float pm = smoothstep(0.2, 0.85, sp.r) * uTexOn * (1.0 - far);
        vec3 wN0 = normalize(transformDirectionByInverseViewMatrix(normal, viewMatrix));
        vec3 wN1 = normalize(wN0 * tn.z + vec3(1.0, 0.0, 0.0) * tn.x * 1.4 - vec3(0.0, 0.0, 1.0) * tn.y * 1.4);
        normal = normalize((viewMatrix * vec4(normalize(mix(wN0, wN1, pm)), 0.0)).xyz);
      }
      roughnessFactor = mix(0.95, 0.6, (1.0 - smoothstep(0.0, 0.3, above)) * nearPond);
      // wet after rain: darker ground, shiny paths
      diffuseColor.rgb *= 1.0 - uRain * (0.22 + 0.18 * sp.r);
      roughnessFactor = mix(roughnessFactor, 0.35 + 0.4 * (1.0 - sp.r), uRain * 0.8);
    }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.frustumCulled = false;
  return mesh;
}
