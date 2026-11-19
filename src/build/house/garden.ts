import * as THREE from 'three';
import { W } from '../../world';
import type { Builder } from '../kit';
import { M } from '../materials';
import { mulberry32 } from '../../noise';
import { plantBed } from '../../world/plants';
import * as D from './dims';
import type { HouseMats } from './mats';

const { X, Z, G } = D;

// Flower beds along the front of the porch and down the east side: warm dark
// mulch, a little stone edging, and the shared plant kit for the planting.

interface Bed { u0: number; u1: number; v0: number; v1: number; along: 'x' | 'z'; seed: number }

export function buildGarden(b: Builder, m: HouseMats) {
  const rnd = mulberry32(909);
  const PF = D.PORCH_FRONT, PE = D.PORCH_EAST;
  const depth = 0.95;
  const beds: Bed[] = [
    // west of the steps
    { u0: -D.W2 - 0.1, u1: D.DOOR_U - 1.22, v0: PF + 0.04, v1: PF + 0.04 + depth, along: 'x', seed: 11 },
    // east of the steps (a gap by the steps is left for Chai the cat)
    { u0: 2.1, u1: PE + 0.04, v0: PF + 0.04, v1: PF + 0.04 + depth, along: 'x', seed: 23 },
    // down the east side of the porch
    { u0: PE + 0.04, u1: PE + 0.04 + 0.85, v0: -D.D2 - 0.3, v1: PF + 0.04 + depth, along: 'z', seed: 37 },
  ];
  const mulch = m.mulch;
  const yTop = G + 0.03;
  for (const bd of beds) b.boxMinMax(mulch, X(bd.u0), G - 0.06, Z(bd.v0), X(bd.u1), yTop, Z(bd.v1), { collide: false });

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
  const [fb0, fb1, eb] = beds;
  stones(fb0.u0, fb0.v1, fb0.u1, fb0.v1);
  stones(fb0.u1, fb0.v0 + 0.1, fb0.u1, fb0.v1);
  stones(fb0.u0, fb0.v0 + 0.1, fb0.u0, fb0.v1);
  stones(fb1.u0, fb1.v1, eb.u1, fb1.v1);
  stones(fb1.u0, fb1.v0 + 0.1, fb1.u0, fb1.v1);
  stones(eb.u1, eb.v0, eb.u1, eb.v1 - 0.1);
  stones(eb.u0 + 0.1, eb.v0, eb.u1, eb.v0);

  // planting, inside the edging; the porch is on the low side of every bed
  const inset = 0.08;
  const groups: THREE.Group[] = [];
  const plant = (u0: number, v0: number, u1: number, v1: number, along: 'x' | 'z', seed: number) =>
    groups.push(plantBed({ x0: X(u0), z0: Z(v0), x1: X(u1), z1: Z(v1) }, G, { seed, backSide: -1, along }));
  plant(fb0.u0 + inset, fb0.v0, fb0.u1 - inset, fb0.v1 - inset, 'x', fb0.seed);
  // the front-east bed runs round the corner; the east bed starts behind it
  plant(fb1.u0 + inset, fb1.v0, eb.u1 - inset, fb1.v1 - inset, 'x', fb1.seed);
  plant(eb.u0, eb.v0 + inset, eb.u1 - inset, fb1.v0, 'z', eb.seed);
  W.scene.add(mergeBeds(groups));
}

/** The three beds share their plant geometries and materials: merge them kind by kind
 * (bed-boxwood, bed-cone...) into one instanced mesh each, a third of the draw calls. */
function mergeBeds(groups: THREE.Group[]): THREE.Group {
  const out = new THREE.Group();
  out.name = 'house-beds';
  const byKind = new Map<string, THREE.InstancedMesh[]>();
  for (const g of groups) for (const o of g.children) {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh) { out.add(o.clone()); continue; }
    const a = byKind.get(im.name) ?? [];
    a.push(im);
    byKind.set(im.name, a);
  }
  const m4 = new THREE.Matrix4();
  for (const [name, list] of byKind) {
    const first = list[0];
    const total = list.reduce((n, im) => n + im.count, 0);
    const geo = first.geometry.clone();
    // per-instance attributes (flower colours) are concatenated in the same order
    for (const k of Object.keys(geo.attributes)) {
      const attr = geo.attributes[k] as THREE.InstancedBufferAttribute;
      if (!attr.isInstancedBufferAttribute) continue;
      const arr = new Float32Array(total * attr.itemSize);
      let off = 0;
      for (const im of list) {
        const src = im.geometry.attributes[k] as THREE.InstancedBufferAttribute;
        arr.set((src.array as Float32Array).subarray(0, im.count * attr.itemSize), off);
        off += im.count * attr.itemSize;
      }
      geo.setAttribute(k, new THREE.InstancedBufferAttribute(arr, attr.itemSize));
    }
    const mesh = new THREE.InstancedMesh(geo, first.material, total);
    let i = 0;
    for (const im of list) for (let j = 0; j < im.count; j++) { im.getMatrixAt(j, m4); mesh.setMatrixAt(i++, m4); }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    if (first.customDepthMaterial) mesh.customDepthMaterial = first.customDepthMaterial;
    mesh.computeBoundingSphere();
    mesh.name = name;
    out.add(mesh);
    for (const im of list) im.geometry !== first.geometry && im.geometry.dispose();
  }
  return out;
}
