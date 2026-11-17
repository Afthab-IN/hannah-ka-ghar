import * as THREE from 'three';
import { patchMaterial, windDepthMaterial } from '../shaderlib';
import { mulberry32 } from '../noise';
import { daisyGeo, lupineGeo, yarrowGeo, flower3DMaterial } from './flowers3d';

// Garden plants for beds: leafy shrubs (boxwood), hydrangeas with mophead
// flowers, coneflowers, black-eyed susans, salvia and lupines. Shrubs are built
// from cards of real leaves (Poly Haven photos), so they read as foliage,
// not blobs. One instanced mesh per plant kind per bed.

// ---------------------------------------------------------------------------
// Shrub geometry: leaf cards on a rounded shell with inner fill
// ---------------------------------------------------------------------------
function shrubGeo(seed: number, cards: number, cardSize: number, squash = 0.85): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], sway: number[] = [], shade: number[] = [];
  const idx: number[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  const corner = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let c = 0; c < cards; c++) {
    const u = Math.max(-0.45, rnd() * 2 - 1), a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)).normalize();
    const depth = c < cards * 0.75 ? 0.78 + rnd() * 0.25 : 0.35 + rnd() * 0.35;
    // a rounded mound: centre at 0.45 x squash, bottom cards reach the ground
    const p = new THREE.Vector3(dir.x * 0.5 * depth, (0.45 + dir.y * 0.5 * depth) * squash, dir.z * 0.5 * depth);
    e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    q.setFromEuler(e);
    const s = cardSize * (0.8 + rnd() * 0.45);
    const sh = THREE.MathUtils.clamp(0.3 + depth * 0.55 + dir.y * 0.25, 0.2, 1.1);
    const b = pos.length / 3;
    for (const [cx, cy] of corner) {
      v.set(cx * s * 0.5, cy * s * 0.5, 0).applyQuaternion(q).add(p);
      v.y = Math.max(0.01, v.y);
      pos.push(v.x, v.y, v.z);
      const nn = dir.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.35, 0)).normalize();
      nrm.push(nn.x, nn.y, nn.z);
      uv.push((cx + 1) / 2, (cy + 1) / 2);
      sway.push(Math.max(0, v.y) * 0.05);
      shade.push(sh);
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const mats = new Map<string, { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }>();
function leafMat(tex: 'shrub' | 'foliage') {
  let m = mats.get(tex);
  if (m) return m;
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: blank, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
  patchMaterial(mat, {
    key: 'bedleaf-' + tex, wind: true,
    vertexHead: 'attribute float aShade; varying float vShade;',
    vsReplace: [['#include <begin_vertex>', 'vShade = aShade;']],
    fragHead: 'varying float vShade;',
    fragAfterMaps: 'diffuseColor.rgb *= mix(0.58, 1.22, vShade) * vec3(0.86, 1.02, 0.74);',
    fragAfterLights: /* glsl */ `
      {
        vec3 V = normalize(cameraPosition - vWPos);
        float back = pow(clamp(dot(-V, normalize(uLightDir)), 0.0, 1.0), 4.0);
        reflectedLight.directDiffuse += uLightCol * diffuseColor.rgb * back * 0.5 * vShade;
        reflectedLight.indirectDiffuse *= 0.55 + 0.6 * vShade;
      }
    `,
  });
  const depth = windDepthMaterial('bedleaf-' + tex, blank, 0.4);
  new THREE.TextureLoader().load(`./tex/${tex}.png`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    mat.map = t; mat.needsUpdate = true;
    depth.map = t; depth.needsUpdate = true;
  });
  m = { mat, depth };
  mats.set(tex, m);
  return m;
}

// ---------------------------------------------------------------------------
// Flower geometries for beds
// ---------------------------------------------------------------------------
function moppheadGeo(seed: number): THREE.BufferGeometry {
  // a dome of small four-petal florets (hydrangea flower head), unit radius 1
  const rnd = mulberry32(seed);
  const pos: number[] = [], col: number[] = [], petal: number[] = [];
  const n = 46;
  for (let i = 0; i < n; i++) {
    const u = rnd() * 0.95 + 0.05, a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a));
    const c = d.clone().multiplyScalar(0.92 + rnd() * 0.1);
    const t1 = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0.3, 1, 0.1)).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
    const s = 0.2 + rnd() * 0.07;
    const shade = 0.7 + rnd() * 0.45;
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2 + rnd() * 0.3, a1 = a0 + 1.0;
      const p0 = c.clone().addScaledVector(d, 0.02);
      const p1 = c.clone().addScaledVector(t1, Math.cos(a0) * s).addScaledVector(t2, Math.sin(a0) * s);
      const p2 = c.clone().addScaledVector(t1, Math.cos(a1) * s).addScaledVector(t2, Math.sin(a1) * s);
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      col.push(shade * 1.1, shade * 1.1, shade * 1.1, shade, shade, shade, shade, shade, shade);
      petal.push(1, 1, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPetal', new THREE.Float32BufferAttribute(petal, 1));
  g.computeVertexNormals();
  const sway = new Float32Array(pos.length / 3).fill(0.02);
  g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  return g;
}

let geos: Record<string, THREE.BufferGeometry> | null = null;
function bedGeos() {
  if (geos) return geos;
  geos = {
    boxwood: shrubGeo(3, 110, 0.32, 0.8),
    foliage: shrubGeo(5, 70, 0.42, 0.75),
    mophead: moppheadGeo(7),
    // coneflower: drooping pink petals round a tall orange cone
    cone: daisyGeo(21, 12, [0.42, 0.16, 0.04], 3.2, 0.05),
    susan: daisyGeo(23, 13, [0.12, 0.05, 0.01]),
    salvia: lupineGeo(25),
    yarrow: yarrowGeo(27),
  };
  return geos;
}

const PAL: Record<string, string[]> = {
  mophead: ['#7d8fe0', '#9aa6ee', '#c58ad0', '#e6a4c8', '#f2eef4', '#6f7fd6'],
  cone: ['#d86aa6', '#c95b98', '#e889b8'],
  susan: ['#f4b512', '#f7c430', '#eda40c'],
  salvia: ['#5a34b8', '#6a3fc8', '#4a2ca0'],
  yarrow: ['#f6f2ea', '#f0b8cc', '#f6f2ea'],
};

// ---------------------------------------------------------------------------
export interface BedOpts { seed?: number; shrubs?: 'back' | 'none'; along?: 'x' | 'z'; backSide?: -1 | 1 }

/**
 * Fill a bed (world-space rectangle) at ground height y. Shrubs and
 * hydrangeas go along the back (the side toward the house: backSide -1 means
 * the low coordinate across the bed), perennials in front.
 */
export function plantBed(rect: { x0: number; z0: number; x1: number; z1: number }, y: number, opts: BedOpts = {}): THREE.Group {
  const rnd = mulberry32(opts.seed ?? 77);
  const G = bedGeos();
  const group = new THREE.Group();
  group.name = 'flower-bed';
  const along = opts.along ?? (Math.abs(rect.x1 - rect.x0) >= Math.abs(rect.z1 - rect.z0) ? 'x' : 'z');
  const back = opts.backSide ?? -1;
  const a0 = along === 'x' ? Math.min(rect.x0, rect.x1) : Math.min(rect.z0, rect.z1);
  const a1 = along === 'x' ? Math.max(rect.x0, rect.x1) : Math.max(rect.z0, rect.z1);
  const c0 = along === 'x' ? Math.min(rect.z0, rect.z1) : Math.min(rect.x0, rect.x1);
  const c1 = along === 'x' ? Math.max(rect.z0, rect.z1) : Math.max(rect.x0, rect.x1);
  const depth = c1 - c0;
  // position across the bed: 0 = back (by the house) .. 1 = front
  const at = (a: number, t: number) => {
    const c = back < 0 ? c0 + t * depth : c1 - t * depth;
    return along === 'x' ? new THREE.Vector3(a, y, c) : new THREE.Vector3(c, y, a);
  };
  type I = { p: THREE.Vector3; s: number; r: number; col?: THREE.Color };
  const lists: Record<string, I[]> = { boxwood: [], foliage: [], mophead: [], cone: [], susan: [], salvia: [], yarrow: [] };
  // back row: boxwood with a hydrangea every other gap
  if (opts.shrubs !== 'none') {
    let a = a0 + 0.35;
    let k = 0;
    while (a < a1 - 0.3) {
      const hyd = k % 2 === 1;
      const s = hyd ? 0.75 + rnd() * 0.15 : 0.5 + rnd() * 0.15;
      const p = at(a, Math.min(0.32, (s * 0.5) / depth + 0.05));
      if (hyd) {
        lists.foliage.push({ p, s, r: rnd() * 6.28 });
        // flower heads sitting in the top of the bush
        const colHex = PAL.mophead[Math.floor(rnd() * PAL.mophead.length)];
        for (let h = 0; h < 8; h++) {
          const ang = rnd() * 6.28, rr = rnd() * s * 0.32;
          const hp = p.clone().add(new THREE.Vector3(Math.cos(ang) * rr, s * (0.52 + rnd() * 0.12) - rr * 0.4, Math.sin(ang) * rr));
          lists.mophead.push({ p: hp, s: 0.11 + rnd() * 0.045, r: rnd() * 6.28, col: new THREE.Color(colHex).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.08) });
        }
      } else lists.boxwood.push({ p, s, r: rnd() * 6.28 });
      a += hyd ? 0.85 : 0.6 + rnd() * 0.1;
      k++;
    }
  }
  // perennials in drifts across the front two thirds
  const kinds = ['cone', 'susan', 'salvia', 'yarrow', 'cone', 'susan'];
  const drift = 0.7;
  for (let a = a0 + 0.2; a < a1 - 0.1; a += drift) {
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const n = 10 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const aa = a + rnd() * drift;
      if (aa > a1 - 0.08) continue;
      const t = (opts.shrubs === 'none' ? 0.1 : 0.45) + rnd() * (opts.shrubs === 'none' ? 0.8 : 0.48);
      const p = at(aa, Math.min(0.94, t));
      const h = kind === 'salvia' ? 0.45 + rnd() * 0.15 : kind === 'yarrow' ? 0.5 + rnd() * 0.15 : 0.55 + rnd() * 0.2;
      const pal = PAL[kind];
      lists[kind].push({ p, s: h, r: rnd() * 6.28, col: new THREE.Color(pal[Math.floor(rnd() * pal.length)]) });
    }
  }
  // low leafy filler between everything so no mulch gaps show at the front
  for (let a = a0 + 0.15; a < a1 - 0.1; a += 0.4) {
    lists.boxwood.push({ p: at(a + rnd() * 0.2, 0.78 + rnd() * 0.18), s: 0.28 + rnd() * 0.12, r: rnd() * 6.28 });
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const add = (key: string, geo: THREE.BufferGeometry, mat: THREE.Material, list: I[], opts2: { depth?: THREE.Material; cast?: boolean; flower?: boolean } = {}) => {
    if (!list.length) return;
    let g = geo;
    if (opts2.flower) {
      g = geo.clone();
      const cols = new Float32Array(list.length * 3);
      list.forEach((it, i) => { const c = it.col ?? new THREE.Color(1, 1, 1); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; });
      g.setAttribute('aFCol', new THREE.InstancedBufferAttribute(cols, 3));
    }
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((it, i) => {
      const sy = key === 'boxwood' || key === 'foliage' ? it.s * (0.85 + (i % 3) * 0.08) : it.s;
      m4.compose(it.p, q.setFromAxisAngle(up, it.r), sc.set(it.s, sy, it.s));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = !!opts2.cast;
    im.receiveShadow = true;
    if (opts2.depth) im.customDepthMaterial = opts2.depth;
    im.computeBoundingSphere();
    im.name = 'bed-' + key;
    group.add(im);
  };
  const box = leafMat('shrub'), fol = leafMat('foliage');
  add('boxwood', G.boxwood, box.mat, lists.boxwood, { depth: box.depth, cast: true });
  add('foliage', G.foliage, fol.mat, lists.foliage, { depth: fol.depth, cast: true });
  const fm = flower3DMaterial();
  const moph = lists.mophead;
  add('mophead', G.mophead, fm, moph, { flower: true });
  // all perennials share one draw call: merge their geometries per kind is not possible
  // with different shapes, so each kind is its own instanced mesh
  add('cone', G.cone, fm, lists.cone, { flower: true });
  add('susan', G.susan, fm, lists.susan, { flower: true });
  add('salvia', G.salvia, fm, lists.salvia, { flower: true });
  add('yarrow', G.yarrow, fm, lists.yarrow, { flower: true });
  return group;
}

