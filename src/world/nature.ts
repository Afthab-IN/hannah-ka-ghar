import * as THREE from 'three';
import type { BuildCtx, Built } from '../scene';
import { W } from '../world';
import { heightAt, pondDist } from './terrain';
import { BIG_OAKS, SWING_OAK, ORCHARD, WALK_BOUND, PADS } from './layout';
import { makeTree, treeInstances, type TreeVariant } from './trees';
import { Meadow, addNoGrow } from './grass';
import { PlanarReflection, buildPond, buildPondPlants } from './water';
import { buildFence, buildFirePit, buildDock, buildSwing } from './props';
import { mulberry32 } from '../noise';

export default function build(ctx: BuildCtx): Built {
  const rnd = mulberry32(2024);
  const scene = W.scene;

  // ---- trees ----
  const oaks = [makeTree('oak', 11), makeTree('oak', 23), makeTree('oak', 37)];
  const swingOak = makeTree('oak', 51, { swingLimb: true });
  const byVariant = new Map<TreeVariant, { x: number; y: number; z: number; rot: number; s: number }[]>();
  const put = (v: TreeVariant, x: number, z: number, rot: number, s: number, trunkR: number) => {
    const y = heightAt(x, z);
    if (!byVariant.has(v)) byVariant.set(v, []);
    byVariant.get(v)!.push({ x, y, z, rot, s });
    if (trunkR > 0) W.physics.addCylinder(x, z, trunkR * s, y - 1, y + 4);
    addNoGrow(x - trunkR * s, z - trunkR * s, x + trunkR * s, z + trunkR * s);
  };
  BIG_OAKS.forEach((o, i) => {
    if (o.x === SWING_OAK.x && o.z === SWING_OAK.z) put(swingOak, o.x, o.z, 0, o.s, 0.5);
    else put(oaks[i % 3], o.x, o.z, rnd() * 6.28, o.s, 0.5);
  });
  // orchard rows
  const fruit = [makeTree('fruit', 61), makeTree('fruit', 67)];
  for (let x = ORCHARD.x0 + 2; x <= ORCHARD.x1 - 2; x += ORCHARD.step) {
    for (let z = ORCHARD.z0 + 2; z <= ORCHARD.z1 - 2; z += ORCHARD.step) {
      if (rnd() < 0.08) continue;
      put(fruit[Math.floor(rnd() * 2)], x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.8, rnd() * 6.28, 0.9 + rnd() * 0.3, 0.16);
    }
  }
  // a few medium trees dotted round the farm (not on pads, paths or the pond)
  const fars = [makeTree('far', 71), makeTree('far', 73), makeTree('far', 79)];
  const clear = (x: number, z: number, r: number) => {
    if (pondDist(x, z) < 1.6) return false;
    for (const p of PADS) if (Math.abs(x - p.x) < p.hx + r && Math.abs(z - p.z) < p.hz + r) return false;
    return true;
  };
  let tries = 0, placed = 0;
  while (placed < 14 && tries++ < 400) {
    const a = rnd() * Math.PI * 2, r = 45 + rnd() * 80;
    const x = WALK_BOUND.x + Math.cos(a) * r, z = WALK_BOUND.z + Math.sin(a) * r;
    if (!clear(x, z, 8) || Math.abs(x) < 25 && z > -20) continue;
    put(oaks[placed % 3], x, z, rnd() * 6.28, 0.75 + rnd() * 0.35, 0.45);
    placed++;
  }
  // tree belts beyond the walkable land, thicker on the ridge behind the house
  const farItems: { v: TreeVariant; x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 140 + rnd() * 520;
    const cx = WALK_BOUND.x + Math.cos(a) * r, cz = WALK_BOUND.z + Math.sin(a) * r;
    const ang = rnd() * Math.PI;
    const len = 20 + rnd() * 90;
    const n = Math.floor(len / 4.2);
    for (let k = 0; k < n; k++) {
      const t = (k / n - 0.5) * len;
      farItems.push({ v: fars[Math.floor(rnd() * 3)], x: cx + Math.cos(ang) * t + (rnd() - 0.5) * 5, z: cz + Math.sin(ang) * t + (rnd() - 0.5) * 5, s: 1.0 + rnd() * 0.8 });
    }
  }
  for (let x = -300; x <= 340; x += 4 + rnd() * 4) {
    const z = -190 - 30 * Math.sin(x * 0.01) + (rnd() - 0.5) * 20;
    farItems.push({ v: fars[Math.floor(rnd() * 3)], x, z, s: 1.0 + rnd() * 0.6 });
  }
  for (const f of farItems) {
    if (Math.hypot(f.x - WALK_BOUND.x, f.z - WALK_BOUND.z) < WALK_BOUND.r + 6) continue;
    put(f.v, f.x, f.z, rnd() * 6.28, f.s, 0);
  }
  const trees = new THREE.Group();
  trees.name = 'trees';
  for (const [v, items] of byVariant) {
    const g = treeInstances(v, items, !fars.includes(v));
    trees.add(g);
    // the far tree belts are too distant to matter in the pond's reflection
    if (fars.includes(v)) W.noReflect.push(g);
  }
  scene.add(trees);

  // ---- grass and flowers ----
  const meadow = new Meadow(ctx.quality);
  scene.add(meadow.group);
  W.noReflect.push(meadow.group);

  // ---- pond ----
  const refl = new PlanarReflection(window.innerWidth, window.innerHeight, ctx.quality === 'high' ? 0.5 : 0.35);
  if (ctx.quality !== 'high') refl.every = 2;
  const pond = buildPond(refl);
  (window as any).__refl = refl;
  scene.add(pond);
  scene.add(buildPondPlants());

  // ---- outdoor pieces ----
  buildFence();
  buildFirePit();
  buildDock();
  const limbLocal = swingOak.swingLimb!;
  const so = BIG_OAKS.find((o) => o.x === SWING_OAK.x && o.z === SWING_OAK.z)!;
  buildSwing(new THREE.Vector3(SWING_OAK.x + limbLocal.x * so.s, heightAt(SWING_OAK.x, SWING_OAK.z) + limbLocal.y * so.s, SWING_OAK.z + limbLocal.z * so.s));

  const camPos = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  return {
    onResize: (w, h) => refl.setSize(w, h),
    beforeRender: (cam) => {
      camPos.setFromMatrixPosition(cam.matrixWorld);
      meadow.update(camPos);
      // the pond reflection only matters when the pond is on screen
      const pc = cam as THREE.PerspectiveCamera;
      projScreen.multiplyMatrices(pc.projectionMatrix, pc.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
      if (!pond.geometry.boundingSphere) pond.geometry.computeBoundingSphere();
      if (frustum.intersectsSphere(pond.geometry.boundingSphere!)) refl.render(ctx.renderer, scene, pc, [pond, ...W.noReflect]);
    },
  };
}
