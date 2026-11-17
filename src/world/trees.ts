import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial, windDepthMaterial } from '../shaderlib';
import { mulberry32 } from '../noise';

// Procedural broadleaf trees: tube branches with sway, and crowns of leaf
// cluster cards whose normals point out from the crown so they shade like
// soft volumes. Oaks, fruit trees and cheap distant trees.

export type TreeKind = 'oak' | 'fruit' | 'far' | 'poplar';
export interface TreeVariant { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry; fruit?: THREE.BufferGeometry; height: number; swingLimb?: THREE.Vector3 }

function leafTexture(kind: 'leaf' | 'fruit'): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const rnd = mulberry32(kind === 'leaf' ? 5 : 9);
  // twigs radiating from the middle, each carrying real leaf shapes
  const drawLeaf = (x: number, y: number, ang: number, len: number, wid: number, light: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const hue = (kind === 'leaf' ? 84 : 96) + rnd() * 26;
    const sat = 34 + rnd() * 22;
    const l = 13 + light * 22;
    const grd = g.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, `hsl(${hue}, ${sat}%, ${l * 0.75}%)`);
    grd.addColorStop(0.6, `hsl(${hue + 4}, ${sat}%, ${l}%)`);
    grd.addColorStop(1, `hsl(${hue + 8}, ${sat - 6}%, ${l * 1.08}%)`);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.9, len, 0);
    g.bezierCurveTo(len * 0.7, wid * 0.9, len * 0.25, wid, 0, 0);
    g.fill();
    // midrib and a few veins
    g.strokeStyle = `hsla(${hue + 10}, 30%, ${l + 14}%, 0.55)`;
    g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0); g.stroke();
    g.lineWidth = 0.6;
    for (let v = 1; v < 5; v++) {
      const vx = (len * v) / 5.5;
      g.beginPath(); g.moveTo(vx, 0); g.lineTo(vx + len * 0.12, -wid * 0.6); g.moveTo(vx, 0); g.lineTo(vx + len * 0.12, wid * 0.6); g.stroke();
    }
    g.restore();
  };
  const twigs = 9;
  for (let t = 0; t < twigs; t++) {
    const a0 = (t / twigs) * Math.PI * 2 + rnd() * 0.5;
    const L = S * (0.28 + rnd() * 0.16);
    const cx = S / 2, cy = S / 2;
    g.strokeStyle = '#3b2e1e';
    g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(cx, cy);
    const ex = cx + Math.cos(a0) * L, ey = cy + Math.sin(a0) * L;
    g.quadraticCurveTo(cx + Math.cos(a0 + 0.3) * L * 0.5, cy + Math.sin(a0 + 0.3) * L * 0.5, ex, ey);
    g.stroke();
    const n = 7 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const tt = 0.25 + (k / n) * 0.8;
      const px = cx + (ex - cx) * tt, py = cy + (ey - cy) * tt;
      const side = k % 2 ? 1 : -1;
      const ang = a0 + side * (0.6 + rnd() * 0.5);
      const len = S * (0.075 + rnd() * 0.04) * (1.1 - tt * 0.3);
      drawLeaf(px, py, ang, len, len * (0.32 + rnd() * 0.08), 0.45 + rnd() * 0.6);
    }
    drawLeaf(ex, ey, a0, S * 0.08, S * 0.027, 0.7 + rnd() * 0.4);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let leafMat: THREE.MeshStandardMaterial | null = null;
let leafDepth: THREE.MeshDepthMaterial | null = null;
let woodMat: THREE.MeshStandardMaterial | null = null;
let fruitMat: THREE.MeshStandardMaterial | null = null;
export function treeMaterials() {
  if (leafMat) return { leafMat, leafDepth: leafDepth!, woodMat: woodMat!, fruitMat: fruitMat! };
  const tex = leafTexture('leaf');
  leafMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8 });
  // photoreal leaves (Poly Haven, CC0) replace the painted ones once loaded
  const loader = new THREE.TextureLoader();
  loader.load('./tex/leaves_1k.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    leafMat!.map = t;
    leafDepth!.map = t;
    leafMat!.needsUpdate = true;
    leafDepth!.needsUpdate = true;
  });
  patchMaterial(leafMat, {
    key: 'leaves', wind: true,
    vertexHead: 'attribute float aShade; varying float vShade;',
    vsReplace: [['#include <begin_vertex>', 'vShade = aShade;']],
    fragHead: 'varying float vShade;',
    fragAfterMaps: /* glsl */ `
      diffuseColor.rgb *= mix(0.42, 1.1, vShade) * vec3(0.82, 1.0, 0.72);
    `,
    fragAfterLights: /* glsl */ `
      {
        vec3 V = normalize(cameraPosition - vWPos);
        float back = pow(clamp(dot(-V, normalize(uLightDir)), 0.0, 1.0), 4.0);
        reflectedLight.directDiffuse += uLightCol * diffuseColor.rgb * back * 0.6 * vShade;
        reflectedLight.indirectDiffuse *= 0.55 + 0.6 * vShade;
      }
    `,
  });
  leafDepth = windDepthMaterial('leaves', tex, 0.42);
  woodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  loader.load('./tex/bark.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    woodMat!.map = t; woodMat!.needsUpdate = true;
  });
  loader.load('./tex/bark_n.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    woodMat!.normalMap = t; woodMat!.normalScale.set(1.2, 1.2); woodMat!.needsUpdate = true;
  });
  patchMaterial(woodMat, {
    key: 'bark', wind: true,
    fragAfterMaps: /* glsl */ `
      {
        vec3 wN = normalize(transformDirectionByInverseViewMatrix(normal, viewMatrix));
        #ifndef USE_MAP
          diffuseColor.rgb = mix(vec3(0.12, 0.1, 0.08), vec3(0.32, 0.28, 0.24), vnoise(vec2((vWPos.x + vWPos.z) * 9.0, vWPos.y * 1.5)));
        #endif
        diffuseColor.rgb *= vec3(0.95, 0.92, 0.88);
        // moss on the upper sides of limbs and the shady foot of the trunk
        float moss = smoothstep(0.55, 0.85, vnoise(vWPos.xz * 2.5 + vWPos.y * 0.7)) * smoothstep(0.0, 0.6, wN.y + 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.24, 0.09), moss * 0.5);
      }
    `,
  });
  fruitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  patchMaterial(fruitMat, { key: 'fruit', wind: true });
  return { leafMat, leafDepth, woodMat, fruitMat };
}

// ---------------------------------------------------------------------------
interface Branch { pts: THREE.Vector3[]; r0: number; r1: number; depth: number }

function tube(b: Branch, radial: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(b.pts);
  const segs = Math.max(2, b.pts.length * 2);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  // taper the radius along the length
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const sway = new Float32Array(pos.count);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const r = THREE.MathUtils.lerp(b.r0, b.r1, t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      n.fromBufferAttribute(nrm, k);
      v.copy(c).addScaledVector(n, r);
      pos.setXYZ(k, v.x, v.y, v.z);
      sway[k] = Math.max(0, (v.y - 1.2) * 0.012) * (b.depth + 0.4);
    }
  }
  geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  // uv in metres: around the trunk and along it (bark tiles every ~0.9 m)
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const len = curve.getLength();
  const rAvg = (b.r0 + b.r1) / 2;
  for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) {
    const k = i * (radial + 1) + j;
    uv.setXY(k, (j / radial) * Math.max(1, Math.round((Math.PI * 2 * rAvg) / 0.9 * 2) / 2), ((i / segs) * len) / 0.9);
  }
  return geo;
}

export function makeTree(kind: TreeKind, seed: number, opts: { swingLimb?: boolean } = {}): TreeVariant {
  const rnd = mulberry32(seed);
  const branches: Branch[] = [];
  const tips: { p: THREE.Vector3; r: number }[] = [];
  const H = kind === 'oak' ? 4.2 + rnd() * 1.2 : kind === 'fruit' ? 1.5 + rnd() * 0.4 : kind === 'poplar' ? 3 : 3 + rnd();
  const spread = kind === 'oak' ? 5.5 + rnd() * 1.5 : kind === 'fruit' ? 2.0 : kind === 'poplar' ? 1.2 : 3.4;
  const trunkR = kind === 'oak' ? 0.46 : kind === 'fruit' ? 0.13 : kind === 'poplar' ? 0.25 : 0.3;
  // trunk
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4);
  const trunk: Branch = { pts: [new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(lean.x * 0.3, H * 0.45, lean.z * 0.3), new THREE.Vector3(lean.x, H, lean.z)], r0: trunkR * 1.45, r1: trunkR * 0.7, depth: 0 };
  branches.push(trunk);
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const pts = [from.clone()];
    const d = dir.clone().normalize();
    let p = from.clone();
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      d.x += (rnd() - 0.5) * 0.35; d.z += (rnd() - 0.5) * 0.35;
      d.y += (kind === 'oak' ? 0.04 : 0.12) + (rnd() - 0.5) * 0.2;
      d.normalize();
      p = p.clone().addScaledVector(d, len / steps);
      pts.push(p);
    }
    branches.push({ pts, r0: r, r1: r * 0.45, depth });
    if (depth < (kind === 'far' ? 1 : 2)) {
      const kids = kind === 'oak' ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        const t = 0.5 + rnd() * 0.5;
        const at = pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))];
        const nd = d.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.4, rnd() * 0.6, (rnd() - 0.5) * 1.4)).normalize();
        grow(at, nd, len * (0.55 + rnd() * 0.15), r * 0.5, depth + 1);
      }
    } else tips.push({ p: p.clone(), r: len * 0.9 });
  };
  const limbs = kind === 'oak' ? 5 + Math.floor(rnd() * 2) : kind === 'fruit' ? 4 : kind === 'poplar' ? 3 : 4;
  const top = trunk.pts[2];
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rnd() * 0.6;
    const up = kind === 'poplar' ? 2.5 : kind === 'oak' ? 0.85 + rnd() * 0.5 : kind === 'far' ? 1.3 : 0.9;
    const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a));
    const at = top.clone().addScaledVector(new THREE.Vector3(0, -1, 0), rnd() * H * 0.25);
    grow(at, dir, spread * (0.6 + rnd() * 0.3), trunkR * 0.55, 1);
  }
  let swingLimb: THREE.Vector3 | undefined;
  if (opts.swingLimb) {
    // a long, low, near-horizontal limb toward +z for the rope swing
    const from = new THREE.Vector3(0, H * 0.82, 0);
    const pts = [from, new THREE.Vector3(0.2, H * 0.86, 1.6), new THREE.Vector3(0.3, H * 0.9, 3.0), new THREE.Vector3(0.35, H * 0.98, 4.4)];
    branches.push({ pts, r0: trunkR * 0.5, r1: trunkR * 0.26, depth: 0.2 });
    swingLimb = new THREE.Vector3(0.28, H * 0.9 - trunkR * 0.3, 2.9);
    tips.push({ p: pts[3].clone().add(new THREE.Vector3(0, 0.6, 0.4)), r: 1.6 });
  }

  const radial = kind === 'far' ? 4 : 8;
  const wood = mergeGeometries(branches.filter((b) => kind !== 'far' || b.depth < 1).map((b) => tube(b, b.depth >= 2 ? 4 : b.depth >= 1 ? 6 : radial)), false)!;

  // leaf cards around every tip, plus a fuller shell round the crown
  const crownC = new THREE.Vector3();
  tips.forEach((t) => crownC.add(t.p));
  crownC.divideScalar(Math.max(1, tips.length));
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], sway: number[] = [], shade: number[] = [];
  const idx: number[] = [];
  let crownR = 0;
  tips.forEach((t) => (crownR = Math.max(crownR, t.p.distanceTo(crownC) + t.r)));
  const cardsPer = kind === 'far' ? 6 : kind === 'fruit' ? 16 : 24;
  const size = kind === 'far' ? 2.6 : kind === 'fruit' ? 0.85 : 1.15;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const corner = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const fruitSpots: THREE.Vector3[] = [];
  for (const t of tips) {
    for (let c = 0; c < cardsPer; c++) {
      const p = t.p.clone().add(new THREE.Vector3((rnd() - 0.5) * 2, (rnd() - 0.3) * 1.4, (rnd() - 0.5) * 2).multiplyScalar(t.r * 0.75));
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      q.setFromEuler(e);
      const s = size * (0.75 + rnd() * 0.5);
      const outward = n.copy(p).sub(crownC).normalize();
      // shade: inner cards and the underside are darker
      const dOut = p.distanceTo(crownC) / Math.max(crownR, 0.1);
      const sh = THREE.MathUtils.clamp(0.25 + dOut * 0.7 + outward.y * 0.25, 0.15, 1.1);
      const b = pos.length / 3;
      for (const [cx, cy] of corner) {
        v.set(cx * s * 0.5, cy * s * 0.5, 0).applyQuaternion(q).add(p);
        pos.push(v.x, v.y, v.z);
        const nn = outward.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.35, 0)).normalize();
        nrm.push(nn.x, nn.y, nn.z);
        uv.push((cx + 1) / 2, (cy + 1) / 2);
        sway.push(Math.max(0, v.y - 1.5) * 0.03 + 0.06);
        shade.push(sh);
      }
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      if (kind === 'fruit' && rnd() < 0.5) fruitSpots.push(p.clone().addScaledVector(outward, 0.3));
    }
  }
  // a shell of cards over a rounded crown so the silhouette is full, not an umbrella
  {
    const bb = new THREE.Box3();
    tips.forEach((t) => bb.expandByPoint(t.p));
    const cc = bb.getCenter(new THREE.Vector3());
    const sz = bb.getSize(new THREE.Vector3());
    const rx = sz.x / 2 + size * 0.9, rz = sz.z / 2 + size * 0.9;
    const ry = Math.max(sz.y / 2 + size, (rx + rz) * 0.32);
    cc.y += ry * 0.12;
    const shell = kind === 'far' ? 40 : kind === 'fruit' ? 100 : 400;
    for (let c = 0; c < shell; c++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const dirv = new THREE.Vector3(r * Math.cos(a), u * 0.9 + 0.1, r * Math.sin(a)).normalize();
      if (dirv.y < -0.55) continue;
      const depthK = 0.72 + rnd() * 0.3;
      const p = new THREE.Vector3(cc.x + dirv.x * rx * depthK, cc.y + dirv.y * ry * depthK, cc.z + dirv.z * rz * depthK);
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
      q.setFromEuler(e);
      const s = size * (0.9 + rnd() * 0.6);
      const sh = THREE.MathUtils.clamp(0.45 + depthK * 0.4 + dirv.y * 0.3, 0.2, 1.1);
      const b0 = pos.length / 3;
      for (const [cx, cy] of corner) {
        v.set(cx * s * 0.5, cy * s * 0.5, 0).applyQuaternion(q).add(p);
        pos.push(v.x, v.y, v.z);
        const nn = dirv.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.3, 0)).normalize();
        nrm.push(nn.x, nn.y, nn.z);
        uv.push((cx + 1) / 2, (cy + 1) / 2);
        sway.push(Math.max(0, v.y - 1.5) * 0.03 + 0.06);
        shade.push(sh);
      }
      idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
      if (kind === 'fruit' && rnd() < 0.35) fruitSpots.push(p.clone().addScaledVector(dirv, 0.25));
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  leaves.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  leaves.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  leaves.setIndex(idx);
  leaves.computeBoundingSphere();

  let fruit: THREE.BufferGeometry | undefined;
  if (fruitSpots.length) {
    // a few dozen apples per tree is plenty; keep the outermost ones
    fruitSpots.sort((p, q) => q.distanceTo(crownC) - p.distanceTo(crownC));
    fruitSpots.length = Math.min(fruitSpots.length, 36);
    const parts: THREE.BufferGeometry[] = [];
    const red = new THREE.Color('#c4321e'), orange = new THREE.Color('#e08a2a');
    for (const p of fruitSpots) {
      const g = new THREE.IcosahedronGeometry(0.075, 1);
      g.translate(p.x, p.y, p.z);
      const col = (rnd() < 0.7 ? red : orange).clone().multiplyScalar(0.8 + rnd() * 0.3);
      const cols = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < cols.length; i += 3) { cols[i] = col.r; cols[i + 1] = col.g; cols[i + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const sw = new Float32Array(g.attributes.position.count).fill(Math.max(0, p.y - 1.5) * 0.03 + 0.06);
      g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
      g.deleteAttribute('uv');
      parts.push(g);
    }
    fruit = mergeGeometries(parts, false)!;
  }
  let height = 0;
  (leaves.attributes.position.array as Float32Array).forEach((y, i) => { if (i % 3 === 1) height = Math.max(height, y); });
  return { wood, leaves, fruit, height, swingLimb };
}

/** Place many copies of one variant. */
export function treeInstances(v: TreeVariant, items: { x: number; y: number; z: number; rot: number; s: number }[], castShadow = true): THREE.Group {
  const { leafMat, leafDepth, woodMat, fruitMat } = treeMaterials();
  const g = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, depth?: THREE.Material) => {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { m4.compose(p.set(it.x, it.y, it.z), q.setFromAxisAngle(up, it.rot), s.setScalar(it.s)); im.setMatrixAt(i, m4); });
    im.castShadow = castShadow;
    im.receiveShadow = true;
    if (depth) im.customDepthMaterial = depth;
    im.computeBoundingSphere();
    g.add(im);
    return im;
  };
  mk(v.wood, woodMat);
  mk(v.leaves, leafMat, leafDepth);
  if (v.fruit) { fruitMat.vertexColors = true; mk(v.fruit, fruitMat); }
  return g;
}
