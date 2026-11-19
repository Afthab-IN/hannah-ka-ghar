import * as THREE from 'three';
import { U, patchMaterial } from '../shaderlib';
import { W } from '../world';
import { mulberry32, makeSimplex } from '../noise';

// Birds: a flock of swallows looping over the meadow and pond, and a pair of
// hawks circling high above. Wings flap in the vertex shader. They go to roost
// at night, when a couple of bats come out instead.

function birdGeometry(span: number, body: number): THREE.BufferGeometry {
  // body: a slim diamond; wings: two swept quads hinged at the body (aWing = -1 / +1)
  const pos: number[] = [], wing: number[] = [], nrm: number[] = [];
  const tri = (a: number[], b: number[], c: number[], w: number) => {
    pos.push(...a, ...b, ...c);
    wing.push(w * (Math.abs(a[0]) / span), w * (Math.abs(b[0]) / span), w * (Math.abs(c[0]) / span));
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  };
  const L = body;
  // body (two triangles, a little volume)
  tri([0, 0.02, -L * 0.6], [-0.05 * L, 0, 0], [0.05 * L, 0, 0], 0);
  tri([-0.05 * L, 0, 0], [0, 0.015, L * 0.45], [0.05 * L, 0, 0], 0);
  // tail fork
  tri([-0.02, 0, L * 0.35], [-0.09 * L, 0, L * 0.7], [0, 0, L * 0.45], 0);
  tri([0.02, 0, L * 0.35], [0, 0, L * 0.45], [0.09 * L, 0, L * 0.7], 0);
  for (const s of [-1, 1]) {
    const root0 = [s * 0.04 * L, 0, -L * 0.18], root1 = [s * 0.04 * L, 0, L * 0.12];
    const tip = [s * span, 0, L * 0.25], mid = [s * span * 0.55, 0, -L * 0.12];
    tri(root0, mid, root1, s);
    tri(root1, mid, tip, s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  return g;
}

function birdMaterial(color: string) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
  patchMaterial(m, {
    key: 'bird-' + color,
    vertexHead: 'attribute float aWing; attribute float aPhase; attribute float aFlap;',
    vsReplace: [['#include <begin_vertex>', /* glsl */ `
      {
        float t = uTime * (7.0 + aPhase * 3.0) + aPhase * 30.0;
        // flap with glides: aFlap 0 = gliding, 1 = flapping
        float flap = sin(t) * mix(0.12, 0.85, aFlap);
        float isW = step(0.0001, abs(aWing));
        transformed.y += isW * abs(position.x) * sin(flap);
        transformed.x *= mix(1.0, cos(flap), isW);
      }
    `]],
  });
  return m;
}

interface Bird { pos: THREE.Vector3; vel: THREE.Vector3; phase: number; flap: number }

export function buildBirds() {
  const rnd = mulberry32(88);
  const n = makeSimplex(3);
  const group = new THREE.Group();
  group.name = 'birds';

  // ---- swallows ----
  const N = 14;
  const geo = birdGeometry(0.17, 0.2);
  const phase = new Float32Array(N), flap = new Float32Array(N);
  for (let i = 0; i < N; i++) phase[i] = rnd();
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  const flapAttr = new THREE.InstancedBufferAttribute(flap, 1);
  geo.setAttribute('aFlap', flapAttr);
  const sw = new THREE.InstancedMesh(geo, birdMaterial('#26282e'), N);
  sw.frustumCulled = false;
  sw.castShadow = false;
  group.add(sw);
  const birds: Bird[] = [];
  for (let i = 0; i < N; i++) birds.push({ pos: new THREE.Vector3((rnd() - 0.5) * 20, 12 + rnd() * 6, (rnd() - 0.5) * 20 - 10), vel: new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).multiplyScalar(6), phase: rnd(), flap: 1 });

  // ---- hawks ----
  const hawkGeo = birdGeometry(0.75, 0.6);
  const hp = new Float32Array([0.2, 0.7]);
  hawkGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(hp, 1));
  const hf = new THREE.InstancedBufferAttribute(new Float32Array([0, 0]), 1);
  hawkGeo.setAttribute('aFlap', hf);
  const hawks = new THREE.InstancedMesh(hawkGeo, birdMaterial('#3a2c22'), 2);
  hawks.frustumCulled = false;
  group.add(hawks);

  // ---- bats (night) ----
  const batGeo = birdGeometry(0.16, 0.1);
  batGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array([0.1, 0.5, 0.9]), 1));
  batGeo.setAttribute('aFlap', new THREE.InstancedBufferAttribute(new Float32Array([1.6, 1.6, 1.6]), 1));
  const bats = new THREE.InstancedMesh(batGeo, birdMaterial('#151418'), 3);
  bats.frustumCulled = false;
  group.add(bats);

  W.scene.add(group);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const center = new THREE.Vector3(), tmp = new THREE.Vector3();
  let presence = 1;
  const orient = (pos: THREE.Vector3, vel: THREE.Vector3, bank: number, scale: number) => {
    look.lookAt(new THREE.Vector3(), tmp.copy(vel).normalize(), up);
    q.setFromRotationMatrix(look);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bank));
    m4.compose(pos, q, s.setScalar(scale));
  };
  W.onUpdate((dt, t) => {
    presence += ((U.uNight.value > 0.55 || U.uRain.value > 0.5 ? 0 : 1) - presence) * (1 - Math.exp(-dt * 0.5));
    // flock target wanders round a loop over the meadow, pond and house lawn
    const a = t * 0.07;
    center.set(Math.sin(a) * 34 + n(t * 0.02, 1) * 18, 11 + 6 * n(t * 0.05, 4) + (1 - presence) * 40, -10 + Math.cos(a * 1.3) * 26);
    for (let i = 0; i < N; i++) {
      const b = birds[i];
      // steer to the flock centre with personal offsets, keep apart, swoop now and then
      const off = tmp.set(n(t * 0.15 + i, 0) * 9, n(t * 0.2 + i, 7) * 3, n(t * 0.15 + i, 13) * 9);
      const target = off.add(center);
      const acc = target.sub(b.pos).multiplyScalar(0.9);
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const d = b.pos.distanceTo(birds[j].pos);
        if (d < 1.6) acc.add(b.pos.clone().sub(birds[j].pos).multiplyScalar((1.6 - d) * 5));
      }
      b.vel.addScaledVector(acc, dt);
      const sp = b.vel.length();
      const want = 7.5 + 2 * Math.sin(t * 0.5 + i);
      b.vel.multiplyScalar(THREE.MathUtils.lerp(1, want / Math.max(sp, 0.01), Math.min(1, dt * 2)));
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y < 2.5) b.vel.y += dt * 8;
      b.flap = b.vel.y > 0.2 || Math.sin(t * 0.8 + i * 2) > -0.3 ? 1 : 0.15;
      flap[i] = THREE.MathUtils.lerp(flap[i], b.flap, Math.min(1, dt * 3));
      const bank = THREE.MathUtils.clamp(-acc.x * 0.02, -0.7, 0.7);
      orient(b.pos, b.vel, bank, presence);
      sw.setMatrixAt(i, m4);
    }
    sw.instanceMatrix.needsUpdate = true;
    flapAttr.needsUpdate = true;
    // hawks: wide lazy circles, high up, gliding
    for (let i = 0; i < 2; i++) {
      const r = 55 + i * 18, sp = 0.05 + i * 0.012;
      const ang = t * sp + i * 2.4;
      const p = new THREE.Vector3(10 + Math.cos(ang) * r, 48 + i * 9 + Math.sin(t * 0.1 + i) * 4, -60 + Math.sin(ang) * r);
      const v = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
      orient(p, v, 0.32, presence);
      hawks.setMatrixAt(i, m4);
    }
    hf.array[0] = Math.sin(t * 0.3) > 0.85 ? 0.6 : 0;
    hf.array[1] = Math.sin(t * 0.27 + 2) > 0.85 ? 0.6 : 0;
    hf.needsUpdate = true;
    hawks.instanceMatrix.needsUpdate = true;
    // bats: jittery loops near the house and pond after dark
    const night = 1 - presence;
    for (let i = 0; i < 3; i++) {
      const ang = t * (1.1 + i * 0.3) + i * 2;
      const p = new THREE.Vector3(4 + Math.cos(ang) * (7 + i * 2) + n(t + i, 3) * 3, 6 + Math.sin(t * 2.3 + i) * 1.5, -24 + Math.sin(ang * 1.3) * (8 + i));
      const v = new THREE.Vector3(-Math.sin(ang), Math.cos(t * 2.3 + i) * 0.4, Math.cos(ang * 1.3));
      orient(p, v, Math.sin(t * 3 + i) * 0.5, night);
      bats.setMatrixAt(i, m4);
    }
    bats.instanceMatrix.needsUpdate = true;
  });
  return group;
}
