import * as THREE from 'three';
import { patchMaterial } from '../shaderlib';

// Procedural surface materials, patterned in world space so nothing needs UVs.
// Use them on static geometry. For anything that moves (doors, animals,
// swings) use M.paint / M.plain so the pattern does not slide over it.

const HELPERS = /* glsl */ `
#define wNormal() normalize(transformDirectionByInverseViewMatrix(normal, viewMatrix))
#define bumpWorld(dN) normal = normalize(normal + (viewMatrix * vec4((dN), 0.0)).xyz)
vec2 triUV(vec3 p, vec3 n) { vec3 a = abs(n); return a.y > 0.7 ? p.xz : (a.x > a.z ? p.zy : p.xy); }
// world-space planar mapping with a tangent frame (for the photo textures)
void planar(vec3 p, vec3 n, out vec2 uv, out vec3 T, out vec3 B) {
  vec3 a = abs(n);
  if (a.y > 0.7) { uv = p.xz; T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, 1.0); }
  else if (a.x > a.z) { uv = vec2(p.z, p.y); T = vec3(0.0, 0.0, 1.0); B = vec3(0.0, 1.0, 0.0); }
  else { uv = vec2(p.x, p.y); T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 1.0, 0.0); }
}
#define applyNormalMap(nm, uv, T, B, wN, k) { vec3 tn_ = texture2D(nm, uv).xyz * 2.0 - 1.0; vec3 nw_ = normalize((T) * tn_.x * (k) + (B) * tn_.y * (k) + (wN) * max(tn_.z, 0.2)); normal = normalize((viewMatrix * vec4(nw_, 0.0)).xyz); }
float lumi(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

// Photo textures (Poly Haven, CC0) shared by all materials. Uniforms start as
// neutral 1x1 textures and swap to the real ones when they load; uTexOn fades
// the photo detail in so nothing pops.
const TL = new THREE.TextureLoader();
const texU = new Map<string, { value: THREE.Texture }>();
const neutral = (r: number, g: number, b: number) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; };
const GREY = neutral(150, 150, 150), FLAT = neutral(128, 128, 255);
function T(name: string, normal = false) {
  let u = texU.get(name);
  if (!u) {
    u = { value: normal ? FLAT : GREY };
    texU.set(name, u);
    const uu = u;
    TL.load(`./tex/${name}.jpg`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (!normal) t.colorSpace = THREE.SRGBColorSpace;
      uu.value = t;
    });
  }
  return u;
}

const cache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); cache.set(key, m); }
  return m;
}
const hex = (c: THREE.ColorRepresentation) => new THREE.Color(c);
const vec3 = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;

function std(key: string, params: THREE.MeshStandardMaterialParameters, glsl: string, extra: Partial<Parameters<typeof patchMaterial>[1]> = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, ...params });
  patchMaterial(m, { key, fragHead: HELPERS, fragAfterMaps: glsl, ...extra });
  return m;
}

export const M = {
  // white clapboard siding: photographed painted planks laid horizontally
  siding(color: THREE.ColorRepresentation = '#eef0ec', board = 0.19) {
    const c = hex(color);
    const k = `siding-${c.getHexString()}-${board}`;
    return cached(k, () => std(k, { roughness: 0.7 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv; vec3 Tt, Bt;
      planar(vWPos, n, uv, Tt, Bt);
      // rotate so the planks run horizontally; 20 planks per tile -> board width
      uv = vec2(uv.y, uv.x) / ${(board * 20).toFixed(3)};
      vec3 tmp = Tt; Tt = Bt; Bt = tmp;
      vec3 tex = texture2D(tSid, uv).rgb;
      float d = mix(1.0, clamp(lumi(tex) / 0.398, 0.55, 1.35), 0.85);
      // a soft shadow under each board's lip, in step with the texture's planks
      float f = fract(uv.x * 20.0);
      float lip = mix(0.82, 1.0, smoothstep(0.0, 0.12, f));
      float vert = 1.0 - smoothstep(0.5, 0.8, abs(n.y));
      diffuseColor.rgb = ${vec3(c)} * d * mix(1.0, lip, vert);
      roughnessFactor = mix(0.55, 0.85, texture2D(tSidR, uv).r);
      applyNormalMap(tSidN, uv, Tt, Bt, n, 0.9);
    }`, { extraUniforms: { tSid: T('planks'), tSidN: T('planks_n', true), tSidR: T('planks_r', true) }, fragHead: HELPERS + 'uniform sampler2D tSid, tSidN, tSidR;' }));
  },
  // vertical board and batten (barn red by default): weathered planks, stood upright and painted
  boards(color: THREE.ColorRepresentation = '#8e2a20', width = 0.3) {
    const c = hex(color);
    const k = `boards-${c.getHexString()}-${width}`;
    return cached(k, () => std(k, { roughness: 0.88 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv; vec3 Tt, Bt;
      planar(vWPos, n, uv, Tt, Bt);
      // the texture's planks are horizontal: turn them upright (about 7 per tile)
      uv = vec2(uv.y, uv.x) / ${(width * 7).toFixed(3)};
      vec3 tmp = Tt; Tt = Bt; Bt = tmp;
      vec3 tex = texture2D(tBrd, uv).rgb;
      float d = clamp(lumi(tex) / 0.052, 0.35, 1.8);
      vec3 col = ${vec3(c)} * mix(1.0, d, 0.75);
      // paint worn thin in places shows the grey wood
      float worn = smoothstep(0.62, 0.85, vnoise(uv * vec2(3.0, 12.0)) * 0.7 + vnoise(vWPos.xz * 0.7 + vWPos.y) * 0.3);
      diffuseColor.rgb = mix(col, tex * 2.2, worn * 0.45);
      applyNormalMap(tBrdN, uv, Tt, Bt, n, 1.0);
    }`, { extraUniforms: { tBrd: T('weathered'), tBrdN: T('weathered_n', true) }, fragHead: HELPERS + 'uniform sampler2D tBrd, tBrdN;' }));
  },
  // painted trim (window frames, porch posts, railings)
  trim(color: THREE.ColorRepresentation = '#f4f4f0') {
    const c = hex(color);
    return cached(`trim-${c.getHexString()}`, () => std(`trim-${c.getHexString()}`, { roughness: 0.5 }, /* glsl */ `
      diffuseColor.rgb = ${vec3(c)} * (0.97 + 0.04 * vnoise(vWPos.xz * 8.0 + vWPos.y * 5.0));
    `));
  },
  // standing seam metal roof: photographed ribbed sheet, repainted in `color`.
  // axis = world axis the seams are spaced along. noIndoor keeps attic volumes from dimming it.
  roofMetal(color: THREE.ColorRepresentation = '#2b3036', axis: 'x' | 'z' = 'x', spacing = 0.46, opts: { noIndoor?: boolean } = {}) {
    const c = hex(color);
    const k = `roof-${c.getHexString()}-${axis}-${spacing}-${!!opts.noIndoor}`;
    const other = axis === 'x' ? 'z' : 'x';
    return cached(k, () => std(k, { roughness: 0.45, metalness: 0.5, shadowSide: THREE.FrontSide }, /* glsl */ `
    {
      vec3 n = wNormal();
      // ribs run down the slope: u across the seams, v along the slope (9 ribs per tile)
      vec2 uv = vec2(vWPos.${axis}, vWPos.${other} + vWPos.y) / ${(spacing * 9).toFixed(3)};
      vec3 Tt = vec3(${axis === 'x' ? '1.0, 0.0, 0.0' : '0.0, 0.0, 1.0'});
      vec3 Bt = normalize(cross(n, Tt));
      vec3 tex = texture2D(tRoof, uv).rgb;
      float d = clamp(tex.r / 0.145, 0.5, 1.5);
      diffuseColor.rgb = ${vec3(c)} * mix(1.0, d, 0.6) * (0.92 + 0.12 * vnoise(vec2(uv.x * 3.0, uv.y * 0.3)));
      roughnessFactor = mix(0.3, 0.7, texture2D(tRoofR, uv).r);
      applyNormalMap(tRoofN, uv, Tt, Bt, n, 1.2);
    }`, { extraUniforms: { tRoof: T('metal'), tRoofN: T('metal_n', true), tRoofR: T('metal_r', true) }, fragHead: HELPERS + 'uniform sampler2D tRoof, tRoofN, tRoofR;', defines: opts.noIndoor ? { NO_INDOOR: '' } : undefined }));
  },
  // cedar shingles (for the bakery and small roofs)
  shingles(color: THREE.ColorRepresentation = '#6b4a36') {
    const c = hex(color);
    return cached(`shingle-${c.getHexString()}`, () => std(`shingle-${c.getHexString()}`, { roughness: 0.9 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv = triUV(vWPos, n);
      float row = floor(vWPos.y / 0.14);
      float u = (uv.x + h21(vec2(row, 1.0)) * 0.3) / 0.22;
      float id = floor(u);
      float fy = fract(vWPos.y / 0.14);
      float gap = 1.0 - smoothstep(0.0, 0.06, min(fract(u), 1.0 - fract(u)));
      vec3 col = ${vec3(c)} * (0.75 + 0.45 * h21(vec2(id, row)));
      col *= mix(0.6, 1.0, smoothstep(0.0, 0.25, fy));
      diffuseColor.rgb = col * (1.0 - gap * 0.5);
    }`));
  },
  brick(color: THREE.ColorRepresentation = '#8a3b2a') {
    const c = hex(color);
    return cached(`brick-${c.getHexString()}`, () => std(`brick-${c.getHexString()}`, { roughness: 0.9 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv; vec3 Tt, Bt;
      planar(vWPos, n, uv, Tt, Bt);
      uv /= 1.45;
      vec3 tex = texture2D(tBrk, uv).rgb;
      // the photo, brightened to a real brick albedo and nudged toward the requested colour
      vec3 want = ${vec3(c)};
      diffuseColor.rgb = mix(tex * 1.75, want * (lumi(tex) / 0.111), 0.35);
      applyNormalMap(tBrkN, uv, Tt, Bt, n, 1.2);
    }`, { extraUniforms: { tBrk: T('brick'), tBrkN: T('brick_n', true) }, fragHead: HELPERS + 'uniform sampler2D tBrk, tBrkN;' }));
  },
  // rounded fieldstone (fireplace, foundations, oven)
  stone(color: THREE.ColorRepresentation = '#8c867c') {
    const c = hex(color);
    return cached(`stone-${c.getHexString()}`, () => std(`stone-${c.getHexString()}`, { roughness: 0.92 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv = triUV(vWPos, n) * 3.2;
      vec2 i = floor(uv); vec2 f = fract(uv);
      float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(h21(i + g), h21(i + g + 13.1)) * 0.8 + 0.1;
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d;
      }
      float edge = smoothstep(0.02, 0.12, d2 - d1);
      vec3 col = ${vec3(c)} * (0.65 + 0.6 * h21(id)) * mix(vec3(1.0), vec3(1.05, 0.95, 0.85), h21(id + 3.0));
      col *= 0.85 + 0.25 * vnoise(uv * 6.0);
      diffuseColor.rgb = mix(vec3(0.3, 0.29, 0.27), col, edge);
    }`));
  },
  // wooden floor boards (photographed oak). axis = direction the boards run.
  // Greyish colours give weathered deck boards.
  woodFloor(color: THREE.ColorRepresentation = '#9a6a42', axis: 'x' | 'z' = 'x', width = 0.14) {
    const c = hex(color);
    const k = `floor-${c.getHexString()}-${axis}-${width}`;
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const deck = hsl.s < 0.18;
    return cached(k, () => std(k, { roughness: 0.55 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv; vec3 Tt, Bt;
      planar(vWPos, n, uv, Tt, Bt);
      // texture planks run along v; about 7 planks per tile
      ${axis === 'x' ? 'uv = vec2(vWPos.z, vWPos.x); Tt = vec3(0.0, 0.0, 1.0); Bt = vec3(1.0, 0.0, 0.0);' : 'uv = vec2(vWPos.x, vWPos.z); Tt = vec3(1.0, 0.0, 0.0); Bt = vec3(0.0, 0.0, 1.0);'}
      if (abs(n.y) < 0.7) { planar(vWPos, n, uv, Tt, Bt); }
      uv /= ${(width * 7).toFixed(3)};
      vec3 tex = texture2D(tFlr, uv).rgb;
      vec3 want = ${vec3(c)};
      ${deck
        ? 'diffuseColor.rgb = want * clamp(lumi(tex) / 0.134, 0.4, 1.7);'
        : 'diffuseColor.rgb = mix(tex, want * (lumi(tex) / 0.134), 0.35);'}
      roughnessFactor = mix(0.35, 0.75, texture2D(tFlrR, uv).r);
      applyNormalMap(tFlrN, uv, Tt, Bt, n, 0.8);
    }`, { extraUniforms: { tFlr: T('floor'), tFlrN: T('floor_n', true), tFlrR: T('floor_r', true) }, fragHead: HELPERS + 'uniform sampler2D tFlr, tFlrN, tFlrR;' }));
  },
  // generic wood for furniture, beams, fences. aged = greyer and rougher.
  wood(color: THREE.ColorRepresentation = '#6e4a2e', aged = 0) {
    const c = hex(color);
    const k = `wood-${c.getHexString()}-${aged}`;
    return cached(k, () => std(k, { roughness: 0.7 + aged * 0.25 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec3 a = abs(n);
      // grain runs along the longest world axis of the surface plane
      vec2 uv = triUV(vWPos, n);
      float g = vnoise(vec2(uv.x * 2.0, uv.y * 14.0)) * 0.5 + vnoise(vec2(uv.x * 3.0 + uv.y * 25.0, uv.y * 3.0)) * 0.5;
      float g2 = vnoise(vec2(uv.y * 2.0, uv.x * 14.0));
      float gr = mix(g, g2, 0.5);
      vec3 col = ${vec3(c)} * (0.78 + 0.38 * gr);
      col = mix(col, vec3(0.42, 0.4, 0.37) * (0.8 + 0.3 * gr), ${aged.toFixed(2)} * (0.6 + 0.4 * vnoise(uv * 3.0)));
      diffuseColor.rgb = col;
    }`));
  },
  // painted plaster walls inside (photographed plaster, repainted in `color`)
  plaster(color: THREE.ColorRepresentation = '#efe6d6') {
    const c = hex(color);
    return cached(`plaster-${c.getHexString()}`, () => std(`plaster-${c.getHexString()}`, { roughness: 0.92 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv; vec3 Tt, Bt;
      planar(vWPos, n, uv, Tt, Bt);
      uv /= 2.6;
      vec3 tex = texture2D(tPls, uv).rgb;
      diffuseColor.rgb = ${vec3(c)} * mix(1.0, clamp(lumi(tex) / 0.373, 0.75, 1.2), 0.6);
      applyNormalMap(tPlsN, uv, Tt, Bt, n, 0.5);
    }`, { extraUniforms: { tPls: T('plaster'), tPlsN: T('plaster_n', true) }, fragHead: HELPERS + 'uniform sampler2D tPls, tPlsN;' }));
  },
  // beadboard / wainscot panelling: the photographed planks stood upright, painted
  beadboard(color: THREE.ColorRepresentation = '#f1efe6', pitch = 0.1) {
    const c = hex(color);
    return cached(`bead-${c.getHexString()}-${pitch}`, () => std(`bead-${c.getHexString()}-${pitch}`, { roughness: 0.55 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv; vec3 Tt, Bt;
      planar(vWPos, n, uv, Tt, Bt);
      uv /= ${(pitch * 20).toFixed(3)};
      vec3 tex = texture2D(tBead, uv).rgb;
      diffuseColor.rgb = ${vec3(c)} * mix(1.0, clamp(lumi(tex) / 0.398, 0.55, 1.3), 0.8);
      applyNormalMap(tBeadN, uv, Tt, Bt, n, 0.9);
    }`, { extraUniforms: { tBead: T('planks'), tBeadN: T('planks_n', true) }, fragHead: HELPERS + 'uniform sampler2D tBead, tBeadN;' }));
  },
  // square tiles (bathroom, kitchen backsplash, bakery floor). checker = two-tone floor.
  // Plain wall tiles use photographed glazed tiles; checker floors stay procedural.
  tile(color: THREE.ColorRepresentation = '#f2f2ee', size = 0.15, checker: THREE.ColorRepresentation | null = null) {
    const c = hex(color);
    const c2 = checker ? hex(checker) : c;
    const k = `tile-${c.getHexString()}-${c2.getHexString()}-${size}`;
    if (!checker) {
      return cached(k, () => std(k, { roughness: 0.2 }, /* glsl */ `
      {
        vec3 n = wNormal();
        vec2 uv; vec3 Tt, Bt;
        planar(vWPos, n, uv, Tt, Bt);
        uv /= ${(size * 8).toFixed(3)};
        vec3 tex = texture2D(tTil, uv).rgb;
        diffuseColor.rgb = ${vec3(c)} * clamp(lumi(tex) / 0.582, 0.5, 1.15);
        roughnessFactor = mix(0.6, 0.12, smoothstep(0.35, 0.6, lumi(tex)));
        applyNormalMap(tTilN, uv, Tt, Bt, n, 1.0);
      }`, { extraUniforms: { tTil: T('tiles'), tTilN: T('tiles_n', true) }, fragHead: HELPERS + 'uniform sampler2D tTil, tTilN;' }));
    }
    return cached(k, () => std(k, { roughness: 0.25 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv = triUV(vWPos, n) / ${size.toFixed(3)};
      vec2 id = floor(uv); vec2 f = fract(uv);
      float grout = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
      vec3 col = mix(${vec3(c)}, ${vec3(c2)}, mod(id.x + id.y, 2.0));
      col *= 0.95 + 0.07 * h21(id);
      diffuseColor.rgb = mix(col, vec3(0.62, 0.6, 0.56), grout);
      roughnessFactor = mix(0.22, 0.85, grout);
    }`));
  },
  // soft fabric (sofas, beds, curtains, rugs)
  fabric(color: THREE.ColorRepresentation = '#7b8c6a', weave = 1) {
    const c = hex(color);
    const k = `fabric-${c.getHexString()}-${weave}`;
    return cached(k, () => std(k, { roughness: 0.95 }, /* glsl */ `
    {
      vec3 n = wNormal();
      vec2 uv = triUV(vWPos, n);
      float w = vnoise(uv * 160.0 * ${weave.toFixed(2)}) * 0.5 + vnoise(uv * 9.0) * 0.5;
      diffuseColor.rgb = ${vec3(c)} * (0.85 + 0.25 * w);
    }`, { }));
  },
  // a woven rug with a border and a simple diamond pattern (flat on the floor)
  rug(a: THREE.ColorRepresentation = '#8a3a2c', b: THREE.ColorRepresentation = '#d9c7a2', cx = 0, cz = 0, hx = 1.2, hz = 0.8) {
    const ca = hex(a), cb = hex(b);
    const k = `rug-${ca.getHexString()}-${cb.getHexString()}-${cx}-${cz}-${hx}-${hz}`;
    return cached(k, () => std(k, { roughness: 1.0 }, /* glsl */ `
    {
      vec2 p = (vWPos.xz - vec2(${cx.toFixed(3)}, ${cz.toFixed(3)})) / vec2(${hx.toFixed(3)}, ${hz.toFixed(3)});
      float border = step(0.82, max(abs(p.x), abs(p.y)));
      float band = step(0.74, max(abs(p.x), abs(p.y))) - border;
      float dia = step(0.5, fract((abs(p.x) * 1.4 + abs(p.y) * 2.0) * 2.0));
      vec3 col = mix(${vec3(ca)}, ${vec3(cb)}, dia * 0.6);
      col = mix(col, ${vec3(cb)}, band);
      col = mix(col, ${vec3(ca)} * 0.6, border);
      col *= 0.85 + 0.25 * vnoise(vWPos.xz * 120.0);
      diffuseColor.rgb = col;
    }`));
  },
  // plain painted / coloured surface without world patterns (safe on moving parts)
  paint(color: THREE.ColorRepresentation = '#ffffff', roughness = 0.55, metalness = 0) {
    const c = hex(color);
    const k = `paint-${c.getHexString()}-${roughness}-${metalness}`;
    return cached(k, () => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness, metalness });
      patchMaterial(m, { key: 'paint' });
      return m;
    });
  },
  metal(color: THREE.ColorRepresentation = '#9aa0a6', roughness = 0.35) {
    return M.paint(color, roughness, 0.9);
  },
  // emissive (bulbs, oven mouth). Night-only glow if nightOnly.
  glow(color: THREE.ColorRepresentation = '#ffcf8a', strength = 3, nightOnly = false) {
    const c = hex(color);
    const k = `glow-${c.getHexString()}-${strength}-${nightOnly}`;
    return cached(k, () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 });
      patchMaterial(m, {
        key: k, lamps: false,
        fragAfterMaps: `totalEmissiveRadiance += ${vec3(c)} * ${strength.toFixed(2)} * ${nightOnly ? 'uWindowGlow' : '1.0'};`,
      });
      return m;
    });
  },
  // window glass: reflective, and glowing warm from outside after dusk (lit = how bright)
  glass(lit = 1) {
    const k = `glass-${lit}`;
    return cached(k, () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x9fb4b8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.6 });
      patchMaterial(m, {
        key: k,
        fragAfterLights: /* glsl */ `
        {
          float camIn = indoorAt(cameraPosition);
          float g = uWindowGlow * ${lit.toFixed(2)} * (1.0 - camIn);
          reflectedLight.directDiffuse += vec3(1.0, 0.56, 0.24) * g * 0.7;
        }`,
        fragBeforeFog: /* glsl */ `
          gl_FragColor.a = mix(gl_FragColor.a, 0.92, uWindowGlow * ${lit.toFixed(2)} * (1.0 - indoorAt(cameraPosition)));
        `,
      });
      m.side = THREE.DoubleSide;
      return m;
    });
  },
  // a material from a canvas texture (signs, chalkboards, pictures). Not cached.
  canvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 256, opts: { emissive?: number; transparent?: boolean } = {}) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d')!, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, transparent: !!opts.transparent, alphaTest: opts.transparent ? 0.4 : 0 });
    if (opts.emissive) { m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = tex; m.emissiveIntensity = opts.emissive; }
    patchMaterial(m, { key: 'canvas' + (opts.transparent ? '-t' : '') });
    return m;
  },
};
