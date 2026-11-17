import * as THREE from 'three';
import { W } from '../world';
import { U, patchMaterial } from '../shaderlib';
import { M } from '../build/materials';
import { Builder } from '../build/kit';
import { Fire } from '../fx/fire';
import { heightAt, WATER_Y } from './terrain';
import { FENCE_MAIN, CHAIRS, FIRE_PIT, DOCK, SWING_OAK } from './layout';
import { mulberry32 } from '../noise';

// Outdoor pieces: the split-rail fence and the name sign over the gate, the
// Adirondack chairs round the campfire, the dock and rowboat, the rope swing.

const rnd = mulberry32(404);

// ---------------------------------------------------------------------------
export function buildFence() {
  const b = new Builder('fence', false);
  const post = M.wood('#4a3b2e', 0.55);
  const rail = M.wood('#55443a', 0.6);
  const { z, x0, x1, gateX, gateW } = FENCE_MAIN;
  const gL = gateX - gateW / 2, gR = gateX + gateW / 2;
  const run = (a: number, c: number) => {
    const n = Math.max(1, Math.round((c - a) / 2.7));
    const step = (c - a) / n;
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const x = a + i * step;
      const zz = z + (rnd() - 0.5) * 0.08;
      const y = heightAt(x, zz);
      b.box(post, x, y + 0.55, zz, 0.14, 1.3, 0.14, { rotY: (rnd() - 0.5) * 0.2, rotZ: (rnd() - 0.5) * 0.04 });
      const p = new THREE.Vector3(x, y, zz);
      if (prev) {
        const mid = prev.clone().add(p).multiplyScalar(0.5);
        const len = prev.distanceTo(p) + 0.25;
        const tilt = Math.atan2(p.y - prev.y, p.x - prev.x);
        for (const h of [0.5, 0.98]) {
          b.box(rail, mid.x, mid.y + h + (rnd() - 0.5) * 0.04, mid.z, len, 0.09, 0.07, { rotZ: tilt, rotY: (rnd() - 0.5) * 0.02 });
        }
        W.physics.addSegment(prev.x, prev.z, p.x, p.z, 0.08, Math.min(prev.y, p.y) - 0.5, Math.max(prev.y, p.y) + 1.15);
      }
      prev = p;
    }
  };
  run(x0, gL);
  run(gR, x1);
  // the gate: two tall posts and a crossbeam with the hanging name board
  const yL = heightAt(gL, z), yR = heightAt(gR, z);
  const top = Math.max(yL, yR) + 3.0;
  b.box(post, gL, (yL + top) / 2 - 0.2, z, 0.22, top - yL + 0.4, 0.22);
  b.box(post, gR, (yR + top) / 2 - 0.2, z, 0.22, top - yR + 0.4, 0.22);
  W.physics.addCylinder(gL, z, 0.16, yL - 0.5, top);
  W.physics.addCylinder(gR, z, 0.16, yR - 0.5, top);
  b.box(post, gateX, top, z, gateW + 0.9, 0.2, 0.2);
  b.box(post, gateX, top + 0.16, z, gateW + 1.3, 0.1, 0.26);
  // corner braces
  b.box(post, gL + 0.35, top - 0.35, z, 0.9, 0.1, 0.1, { rotZ: -0.75 });
  b.box(post, gR - 0.35, top - 0.35, z, 0.9, 0.1, 0.1, { rotZ: 0.75 });
  // little chains
  const chain = M.metal('#3a3632', 0.5);
  for (const s of [-1, 1]) b.box(chain, gateX + s * 0.95, top - 0.24, z, 0.025, 0.3, 0.025);
  W.scene.add(b.build());

  const sign = M.canvas((g, w, h) => {
    // a painted wooden board
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#5a3e28'); grd.addColorStop(1, '#3f2a1a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.18;
    for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#2a1a0e' : '#7a5838'; g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2); }
    g.globalAlpha = 1;
    g.strokeStyle = '#2a1a0e'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f3e3c2';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 600 84px "Iowan Old Style", Palatino, Georgia, serif';
    g.fillText('Hannah ka Ghar', w / 2, h / 2 - 6);
    g.font = '500 22px "Iowan Old Style", Palatino, Georgia, serif';
    g.fillStyle = '#e6c98e';
    g.fillText('✿   welcome home   ✿', w / 2, h - 34);
  }, 1024, 256);
  const boardGeo = new THREE.PlaneGeometry(2.4, 0.6);
  const front = new THREE.Mesh(boardGeo, sign);
  front.position.set(gateX, top - 0.66, z + 0.031);
  const back = new THREE.Mesh(boardGeo, sign);
  back.position.set(gateX, top - 0.66, z - 0.031);
  back.rotation.y = Math.PI;
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.66, 0.05), M.paint('#3a2818', 0.9));
  plank.position.set(gateX, top - 0.66, z);
  for (const m of [front, back, plank]) { m.castShadow = true; m.receiveShadow = true; W.scene.add(m); }
  // a lantern on each gate post, lit after dusk
  for (const x of [gL, gR]) {
    const lant = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), M.glow('#ffc070', 2.2, true));
    lant.position.set(x, top - 0.6, z + 0.2);
    W.scene.add(lant);
    W.lamps.add(new THREE.Vector3(x, top - 0.6, z + 0.35), '#ffb35c', 2.2, 7, { nightOnly: true, flicker: 0.3 });
  }
}

// ---------------------------------------------------------------------------
function adirondack(mat: THREE.Material, x: number, z: number, yaw: number) {
  const g = new Builder('chair', false);
  // local: sitter faces -z, seat centre at origin on the ground
  const seatH = 0.36;
  for (let i = 0; i < 5; i++) {
    const xx = -0.27 + i * 0.135;
    g.box(mat, xx, seatH, 0.02, 0.11, 0.025, 0.56, { rotX: -0.16 });
  }
  // back slats fanning out, tilted back
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2;
    g.box(mat, t * 0.2, 0.75, 0.38, 0.1, 0.9 + (1 - Math.abs(t)) * 0.12, 0.025, { rotX: -0.38, rotZ: -t * 0.08 });
  }
  g.box(mat, 0, 0.45, 0.3, 0.6, 0.06, 0.03, { rotX: -0.38 });
  g.box(mat, 0, 0.98, 0.47, 0.62, 0.06, 0.03, { rotX: -0.38 });
  // wide arms and legs
  for (const s of [-1, 1]) {
    g.box(mat, s * 0.37, 0.6, -0.02, 0.16, 0.025, 0.76);
    g.box(mat, s * 0.37, 0.3, -0.3, 0.06, 0.6, 0.06);
    g.box(mat, s * 0.33, 0.2, 0.3, 0.05, 0.4, 0.05);
    g.box(mat, s * 0.33, 0.3, 0.05, 0.04, 0.09, 0.8, { rotX: -0.16 });
  }
  const mesh = g.build();
  const y = heightAt(x, z);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  W.scene.add(mesh);
  W.physics.addBoxRot(x, y + 0.35, z, 0.8, 0.7, 0.8, yaw, { walk: false });
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  W.interact.add({
    pos: new THREE.Vector3(x, y + 0.5, z), radius: 0.5, range: 2.4,
    label: 'Sit down',
    onUse: () => W.mount({
      pose: () => ({ pos: new THREE.Vector3(x + fwd.x * 0.05, y + 1.05, z + fwd.z * 0.05), yaw }),
      exit: new THREE.Vector3(x + fwd.x * 0.9, y, z + fwd.z * 0.9),
      label: 'You sink into the chair',
      yawRange: 1.7,
    }),
  });
}

export function buildFirePit() {
  const cx = FIRE_PIT.x, cz = FIRE_PIT.z;
  const y = heightAt(cx, cz);
  // stone ring
  const stoneGeo = new THREE.IcosahedronGeometry(0.2, 1);
  const stones = new THREE.InstancedMesh(stoneGeo, M.stone('#8a857c'), 14);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const p = new THREE.Vector3(cx + Math.cos(a) * 0.75, 0, cz + Math.sin(a) * 0.75);
    p.y = heightAt(p.x, p.z) + 0.06;
    m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd())), new THREE.Vector3(1.2, 0.75, 1).multiplyScalar(0.8 + rnd() * 0.4));
    stones.setMatrixAt(i, m4);
  }
  stones.castShadow = stones.receiveShadow = true;
  W.scene.add(stones);
  W.physics.addCylinder(cx, cz, 0.85, y - 0.5, y + 0.25, { walk: true });
  const fire = new Fire({ pos: new THREE.Vector3(cx, y + 0.02, cz), scale: 0.85, lit: false, label: 'the campfire', lampRadius: 10, lampIntensity: 8 });
  // it lights itself at dusk, until you put it out or light it yourself
  let touched = false;
  const tog = fire.toggle.bind(fire);
  fire.toggle = () => { touched = true; tog(); };
  W.onUpdate(() => {
    if (!touched) fire.target = U.uWindowGlow.value > 0.55 ? 1 : 0;
  });
  W.scene.add(fire.group);
  // chairs face the fire: two natural wood, two painted dark like the photo
  const woods = [M.wood('#a46e3c', 0.15), M.paint('#2b2723', 0.7), M.wood('#9a6434', 0.2), M.paint('#2f2a26', 0.7)];
  CHAIRS.forEach((c, i) => {
    const yaw = Math.atan2(-(cx - c.x), -(cz - c.z));
    adirondack(woods[i], c.x, c.z, yaw);
  });
  // a little side table with mugs
  const t = new Builder('side table', false);
  const tx = (CHAIRS[0].x + CHAIRS[1].x) / 2 - 0.5, tz = (CHAIRS[0].z + CHAIRS[1].z) / 2;
  const ty = heightAt(tx, tz);
  const tw = M.wood('#9a6a3c', 0.25);
  t.box(tw, tx, ty + 0.45, tz, 0.5, 0.04, 0.5);
  for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) t.box(tw, tx + a * 0.2, ty + 0.22, tz + c * 0.2, 0.04, 0.46, 0.04);
  t.cyl(M.paint('#e8e2d6', 0.4), tx - 0.08, ty + 0.47, tz + 0.05, 0.045, 0.1, { seg: 12 });
  t.cyl(M.paint('#8a3a2a', 0.4), tx + 0.1, ty + 0.47, tz - 0.06, 0.045, 0.1, { seg: 12 });
  W.scene.add(t.build());
  W.physics.addBox(tx - 0.28, ty, tz - 0.28, tx + 0.28, ty + 0.5, tz + 0.28, { walk: false });
}

// ---------------------------------------------------------------------------
export function buildDock() {
  const dir = new THREE.Vector3(Math.sin(DOCK.yaw), 0, Math.cos(DOCK.yaw));
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  const deckY = WATER_Y + 0.38;
  const b = new Builder('dock', false);
  const plank = M.wood('#7a6450', 0.55);
  const postM = M.wood('#4c3c2e', 0.7);
  const yawRot = Math.atan2(dir.x, dir.z); // rotY that maps local +z onto dir
  // start a bit up the bank
  const start = new THREE.Vector3(DOCK.x, 0, DOCK.z).addScaledVector(dir, -1.2);
  const L = DOCK.len + 1.2;
  const n = Math.round(L / 0.16);
  for (let i = 0; i < n; i++) {
    const p = start.clone().addScaledVector(dir, (i + 0.5) * (L / n));
    const y = Math.max(deckY, heightAt(p.x, p.z) + 0.05);
    b.box(plank, p.x, y - 0.03, p.z, DOCK.w + (rnd() - 0.5) * 0.04, 0.05, L / n - 0.012, { rotY: yawRot + (rnd() - 0.5) * 0.015, collide: false });
  }
  // stringers and posts
  for (const s of [-1, 1]) {
    const mid = start.clone().addScaledVector(dir, L / 2).addScaledVector(side, s * (DOCK.w / 2 - 0.08));
    b.box(postM, mid.x, deckY - 0.12, mid.z, 0.08, 0.16, L, { rotY: yawRot, collide: false });
    for (let k = 0; k <= 3; k++) {
      const p = start.clone().addScaledVector(dir, 0.6 + (k * (L - 0.8)) / 3).addScaledVector(side, s * (DOCK.w / 2 + 0.02));
      const bottom = Math.min(heightAt(p.x, p.z), WATER_Y - 0.6) - 0.3;
      b.box(postM, p.x, (bottom + deckY + 0.4) / 2, p.z, 0.13, deckY + 0.4 - bottom, 0.13, { rotY: yawRot, collide: false });
    }
  }
  W.scene.add(b.build());
  // walkable deck collider (a long thick segment) and the end posts
  const a = start.clone().addScaledVector(dir, 0.1), e = start.clone().addScaledVector(dir, L - 0.1);
  W.physics.addSegment(a.x, a.z, e.x, e.z, DOCK.w / 2 - 0.05, deckY - 0.4, deckY, { walk: true });

  // the rowboat, tied up along the end of the dock
  const boat = buildRowboat();
  const bp = start.clone().addScaledVector(dir, L - 1.9).addScaledVector(side, DOCK.w / 2 + 0.85);
  boat.position.set(bp.x, WATER_Y - 0.06, bp.z);
  const boatYaw = yawRot + 0.12;
  boat.rotation.y = boatYaw;
  W.scene.add(boat);
  // a rope from the boat to a dock post
  W.onUpdate((dt, t) => {
    boat.position.y = WATER_Y - 0.06 + Math.sin(t * 1.1) * 0.025;
    boat.rotation.z = Math.sin(t * 0.9) * 0.025;
    boat.rotation.x = Math.sin(t * 0.7 + 1) * 0.015;
  });
  W.interact.add({
    pos: () => boat.position.clone().add(new THREE.Vector3(0, 0.3, 0)), radius: 0.9, range: 3,
    label: 'Sit in the rowboat',
    onUse: () => W.mount({
      pose: () => ({ pos: boat.localToWorld(new THREE.Vector3(0, 0.95, 0.15)), yaw: boatYaw + Math.PI }),
      exit: start.clone().addScaledVector(dir, L - 1.9).setY(deckY),
      label: 'The boat rocks gently',
      yawRange: 2.4,
    }),
  });
  W.audio.loop('water_lap', { pos: new THREE.Vector3(DOCK.x, WATER_Y, DOCK.z).addScaledVector(dir, DOCK.len * 0.6), volume: 0.5, ref: 2, max: 25 });
}

function buildRowboat(): THREE.Group {
  // hull: half-elliptic sections along the length, pointed bow at +z
  const L = 3.3, segU = 24, segV = 8;
  const width = (u: number) => 0.68 * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * u)), 0.65) * (u > 0.75 ? 1 - Math.pow((u - 0.75) / 0.25, 2) * 0.92 : 1);
  const depth = (u: number) => 0.42 - 0.1 * Math.pow(Math.abs(u - 0.45) * 2, 2);
  const outPos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segU; i++) {
    const u = i / segU;
    const z = (u - 0.5) * L;
    const w = Math.max(0.02, width(u)), d = depth(u);
    for (let j = 0; j <= segV; j++) {
      const th = (j / segV) * Math.PI; // 0 = left rim, pi = right rim
      const x = -Math.cos(th) * w;
      const y = -Math.sin(th) * d + 0.42 + (u > 0.8 ? (u - 0.8) * 0.5 : 0);
      outPos.push(x, y, z);
    }
  }
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
    const a = i * (segV + 1) + j, b = a + segV + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const g = new THREE.Group();
  const outside = new THREE.Mesh(hull, M.paint('#e9e4d8', 0.6));
  const inMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 0.85, side: THREE.BackSide }), { key: 'boat-inside' });
  const inside = new THREE.Mesh(hull, inMat);
  outside.castShadow = true;
  g.add(outside, inside);
  const wood = M.paint('#8a6a4a', 0.8);
  // transom, thwarts, rim
  const b = new Builder('boat', false);
  b.box(wood, 0, 0.36, -L / 2 + 0.03, width(0) * 2 * 0.95, 0.3, 0.05);
  for (const z of [-0.7, 0.15, 0.85]) b.box(wood, 0, 0.32, z, width(z / L + 0.5) * 2 - 0.05, 0.04, 0.24);
  const oarM = M.paint('#b08a5c', 0.7);
  b.box(oarM, 0.25, 0.45, 0.1, 0.05, 0.04, 2.3, { rotY: 0.08, rotZ: 0.1 });
  b.box(oarM, -0.25, 0.45, 0.1, 0.05, 0.04, 2.3, { rotY: -0.08, rotZ: -0.1 });
  const inner = b.build();
  inner.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  g.add(inner);
  return g;
}

// ---------------------------------------------------------------------------
/** Rope swing hanging from the oak's low limb (limb = world position of the attach point). */
export function buildSwing(limb: THREE.Vector3) {
  const pivot = new THREE.Group();
  pivot.position.copy(limb);
  W.scene.add(pivot);
  const ground = heightAt(limb.x, limb.z + 0.2);
  const len = limb.y - ground - 0.55;
  const rope = M.paint('#b9a27c', 0.95);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 5), rope);
    r.position.set(s * 0.26, -len / 2, 0);
    r.castShadow = true;
    pivot.add(r);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.24), M.paint('#7a5a3a', 0.8));
  seat.position.set(0, -len, 0);
  seat.castShadow = true;
  pivot.add(seat);
  let ang = 0, vel = 0, riding = false, lastSide = 0;
  W.onUpdate((dt) => {
    // pendulum: pumping while you sit, settling when you leave
    const g = 9.8 / Math.max(1, len);
    const acc = -g * Math.sin(ang) - vel * (riding ? 0.05 : 0.6);
    vel += acc * dt;
    if (riding && Math.abs(ang) < 0.55) vel += Math.sign(vel || 1) * dt * 0.9;
    ang += vel * dt;
    pivot.rotation.x = ang;
    const sideNow = Math.sign(vel);
    if (riding && sideNow !== lastSide && Math.abs(ang) > 0.25) W.audio.play('swing_creak', { pos: limb, volume: 0.35, rate: 0.9 + Math.random() * 0.2 });
    lastSide = sideNow;
  });
  W.interact.add({
    pos: () => seat.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.2, 0)), radius: 0.45, range: 2.6,
    label: 'Sit on the swing',
    onUse: () => {
      riding = true;
      if (Math.abs(vel) < 0.1) vel = 0.6;
      W.mount({
        pose: () => ({ pos: seat.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.95, 0)), yaw: Math.PI }),
        exit: new THREE.Vector3(limb.x, ground, limb.z + 1.4),
        label: 'Wheee',
        yawRange: 1.4,
        onLeave: () => (riding = false),
      });
    },
  });
  void SWING_OAK;
}
