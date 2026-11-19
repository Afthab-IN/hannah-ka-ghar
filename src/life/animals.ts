import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { W } from '../world';
import { patchMaterial, U } from '../shaderlib';
import { heightAt, WATER_Y, pondDist } from '../world/terrain';
import { PADDOCK, COOP, BAKERY, HOUSE, POND } from '../world/layout';
import { mulberry32, makeSimplex } from '../noise';
import { Cat, Hen, collapse } from './critters';
import { buildFish } from './fish';

let _duckMat: THREE.Material | null = null;
const duckMat = () => (_duckMat ??= patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { key: 'duck' }));

// The farm animals: three horses in the paddock, Chai the cat who follows you
// about, hens round the coop and a family of ducks on the pond.

const rnd = mulberry32(99);
const noise = makeSimplex(7);
const loader = new GLTFLoader();
const load = (name: string) => loader.loadAsync(`./models/${name}.glb`);

function clip(g: { animations: THREE.AnimationClip[] }, name: string) {
  return g.animations.find((a) => a.name === name) || g.animations.find((a) => a.name.split('|').pop() === name)!;
}

function prepare(gltf: { scene: THREE.Object3D }, key: string) {
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach((mat, i) => {
      const sm = mat as THREE.MeshStandardMaterial;
      const isEye = /eye/i.test((mat as any).name || '');
      if (sm.metalness !== undefined) { sm.metalness = 0; sm.roughness = isEye ? 0.15 : key.startsWith('horse') ? 0.55 : 0.8; }
      patchMaterial(mat, {
        key: `${key}-${i}-${(mat as any).name}`,
        fragAfterLights: isEye ? '' : /* glsl */ `
          {
            // a soft sheen along the coat's silhouette, like light on short hair
            vec3 V = normalize(cameraPosition - vWPos);
            vec3 N = normalize(transformDirectionByInverseViewMatrix(normal, viewMatrix));
            float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
            reflectedLight.directDiffuse += (uLightCol * 0.16 + vec3(0.025)) * diffuseColor.rgb * rim;
          }
        `,
      });
    });
  });
}

class Animal {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  cur = '';
  pos = new THREE.Vector3();
  yaw = 0;
  constructor(src: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, names: string[], public height: number) {
    this.root = SkeletonUtils.clone(src.scene);
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const n of names) {
      const c = clip(src, n);
      if (c) this.actions.set(n, this.mixer.clipAction(c));
    }
    // normalise size from the rest pose
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root, true);
    const h = box.max.y - box.min.y;
    const s = h > 0 ? height / h : 1;
    this.root.scale.multiplyScalar(s);
    this.lift = -box.min.y * s;
    W.scene.add(this.root);
  }
  lift = 0;
  play(name: string, fade = 0.35, once = false, speed = 1) {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.cur === name && !once) return;
    const prev = this.actions.get(this.cur);
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.play();
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
    this.cur = name;
  }
  place(groundY: number) {
    this.root.position.set(this.pos.x, groundY + this.lift, this.pos.z);
    this.root.rotation.y = this.yaw;
  }
  turnTo(dx: number, dz: number, dt: number, rate = 2.2) {
    const want = Math.atan2(dx, dz); // models face +z
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    return Math.abs(d);
  }
}

// ---------------------------------------------------------------------------
async function horses() {
  const [brown, white] = await Promise.all([load('horse_brown'), load('horse_white')]);
  prepare(brown, 'horse-b');
  prepare(white, 'horse-w');
  const names = ['Idle', 'Idle_2', 'Idle_Headlow', 'Eating', 'Walk', 'Gallop', 'Idle_HitReact_Left'];
  const herd = [
    { name: 'Clover', src: brown, x: 32, z: -28 },
    { name: 'Pearl', src: white, x: 44, z: -24 },
    { name: 'Biscuit', src: brown, x: 48, z: -36 },
  ].map((h) => {
    const a = new Animal(h.src, names, 2.05);
    a.pos.set(h.x, 0, h.z);
    a.yaw = rnd() * 6.28;
    const dyn = { x: h.x, z: h.z, r: 0.85, y0: -100, y1: 100 };
    W.physics.dynamic.push(dyn);
    return { a, name: h.name, mode: 'graze', timer: 2 + rnd() * 5, target: new THREE.Vector3(), dyn, petT: 0 };
  });
  const m = 2.6;
  const inside = (x: number, z: number) => new THREE.Vector3(
    THREE.MathUtils.clamp(x, PADDOCK.x0 + m, PADDOCK.x1 - m), 0, THREE.MathUtils.clamp(z, PADDOCK.z0 + m, PADDOCK.z1 - m));
  const randomSpot = () => inside(PADDOCK.x0 + rnd() * (PADDOCK.x1 - PADDOCK.x0), PADDOCK.z0 + rnd() * (PADDOCK.z1 - PADDOCK.z0));
  const lines = ['nuzzles your hand', 'snorts softly and leans in', 'flicks an ear at you', 'nudges you for a treat'];
  for (const h of herd) {
    W.interact.add({
      pos: () => h.a.pos.clone().add(new THREE.Vector3(Math.sin(h.a.yaw) * 0.9, 1.5, Math.cos(h.a.yaw) * 0.9)),
      radius: 0.75, range: 3.2,
      label: () => `Pet ${h.name}`,
      onUse: () => {
        h.mode = 'pet'; h.timer = 3.5; h.petT = 0;
        const cam = W.camera.position;
        h.a.turnTo(cam.x - h.a.pos.x, cam.z - h.a.pos.z, 10, 100);
        h.a.play('Idle_2', 0.3);
        W.audio.play('horse_neigh', { pos: h.a.pos.clone().setY(heightAt(h.a.pos.x, h.a.pos.z) + 1.6), volume: 0.55, rate: 0.9 + rnd() * 0.2 });
        W.toast(`${h.name} ${lines[Math.floor(rnd() * lines.length)]}`);
      },
    });
  }
  let neighT = 20;
  W.onUpdate((dt, t) => {
    const cam = W.camera.position;
    for (const h of herd) {
      const a = h.a;
      h.timer -= dt;
      if (h.mode === 'pet') {
        if (h.timer <= 0) { h.mode = 'idle'; h.timer = 3; a.play('Idle'); }
      } else if (h.mode === 'walk' || h.mode === 'gallop' || h.mode === 'come') {
        const dx = h.target.x - a.pos.x, dz = h.target.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const off = a.turnTo(dx, dz, dt, h.mode === 'gallop' ? 2.8 : 1.6);
        const sp = (h.mode === 'gallop' ? 6.5 : 1.35) * Math.max(0.15, 1 - off / 1.5);
        a.play(h.mode === 'gallop' ? 'Gallop' : 'Walk', 0.4, false, h.mode === 'gallop' ? 1 : 0.95);
        a.pos.x += Math.sin(a.yaw) * sp * dt;
        a.pos.z += Math.cos(a.yaw) * sp * dt;
        if (d < 0.8 || h.timer <= 0) {
          if (h.mode === 'come') { h.mode = 'watch'; h.timer = 8 + rnd() * 6; a.play('Idle_2'); }
          else { h.mode = 'graze'; h.timer = 6 + rnd() * 12; a.play('Eating', 0.6); }
        }
      } else if (h.mode === 'watch') {
        a.turnTo(cam.x - a.pos.x, cam.z - a.pos.z, dt, 1.2);
        a.play(h.timer % 6 < 3 ? 'Idle' : 'Idle_Headlow');
        if (h.timer <= 0) { h.mode = 'graze'; h.timer = 5; a.play('Eating'); }
      } else {
        if (h.mode === 'graze') a.play('Eating', 0.6);
        else a.play(h.timer % 7 < 3.5 ? 'Idle' : 'Idle_Headlow', 0.5);
        if (h.timer <= 0) {
          // come over to the fence if someone is standing there
          const nearFence = cam.x > PADDOCK.x0 - 7 && cam.x < PADDOCK.x1 + 7 && cam.z > PADDOCK.z0 - 7 && cam.z < PADDOCK.z1 + 7;
          const r = rnd();
          if (nearFence && r < 0.4) { h.mode = 'come'; h.target.copy(inside(cam.x, cam.z)).add(new THREE.Vector3((rnd() - 0.5) * 3, 0, (rnd() - 0.5) * 3)); h.target.copy(inside(h.target.x, h.target.z)); h.timer = 25; }
          else if (r < 0.62) { h.mode = 'walk'; h.target.copy(randomSpot()); h.timer = 30; }
          else if (r < 0.68) { h.mode = 'gallop'; h.target.copy(randomSpot()); h.timer = 12; }
          else if (r < 0.8) { h.mode = 'idle'; h.timer = 4 + rnd() * 5; }
          else { h.mode = 'graze'; h.timer = 8 + rnd() * 12; }
        }
      }
      // keep apart and inside the fence
      for (const o of herd) {
        if (o === h) continue;
        const dx = a.pos.x - o.a.pos.x, dz = a.pos.z - o.a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.4 && d > 1e-3) { a.pos.x += (dx / d) * (2.4 - d) * 0.5; a.pos.z += (dz / d) * (2.4 - d) * 0.5; }
      }
      const c = inside(a.pos.x, a.pos.z);
      a.pos.x = c.x; a.pos.z = c.z;
      a.mixer.update(dt);
      a.place(heightAt(a.pos.x, a.pos.z));
      h.dyn.x = a.pos.x; h.dyn.z = a.pos.z;
    }
    neighT -= dt;
    if (neighT < 0) {
      neighT = 25 + rnd() * 40;
      const h = herd[Math.floor(rnd() * herd.length)];
      W.audio.play('horse_neigh', { pos: h.a.pos.clone().setY(heightAt(h.a.pos.x, h.a.pos.z) + 1.6), volume: 0.7, ref: 6, max: 140 });
    }
    void t;
  });
}

// ---------------------------------------------------------------------------
function cat() {
  const c = new Cat();
  W.scene.add(c.root);
  // Chai waits on the porch steps until you come by
  const home = new THREE.Vector3(HOUSE.x + 1.6, 0, HOUSE.z + HOUSE.d / 2 + HOUSE.porchD + 0.9);
  const pos = home.clone();
  let yaw = 0;
  let y = W.physics.groundAt(pos.x, pos.z, 50);
  let mode: 'home' | 'follow' = 'home';
  let still = 0, stuck = 0, meowT = 6, petT = 0, moving = false;
  let purr: ReturnType<typeof W.audio.loop> | null = null;
  const lastPos = pos.clone();
  const turnTo = (dx: number, dz: number, dt: number, rate: number) => {
    let d = Math.atan2(dx, dz) - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    return d;
  };
  W.interact.add({
    pos: () => pos.clone().setY(y + 0.25), radius: 0.4, range: 2.6,
    label: 'Pet Chai',
    onUse: () => {
      mode = 'follow';
      petT = 3.4;
      purr?.stop(0.1);
      purr = W.audio.loop('cat_purr', { pos: pos.clone().setY(y + 0.3), volume: 0.9, ref: 1, max: 10 });
      setTimeout(() => purr?.stop(0.6), 3600);
      W.toast(rnd() < 0.5 ? 'Chai purrs and rubs against your hand' : 'Chai closes her eyes and purrs');
    },
  });
  W.onUpdate((dt) => {
    const cam = W.camera.position;
    const dist = Math.hypot(cam.x - pos.x, cam.z - pos.z);
    if (mode === 'home' && dist < 7) { mode = 'follow'; if (meowT < 0) { W.audio.play('cat_meow', { pos, volume: 0.8 }); meowT = 25; } }
    meowT -= dt;
    // look at you when you're close
    const rel = Math.atan2(cam.x - pos.x, cam.z - pos.z) - yaw;
    const relN = Math.atan2(Math.sin(rel), Math.cos(rel));
    c.lookYaw += ((dist < 5 && Math.abs(relN) < 1.4 ? relN * 0.7 : 0) - c.lookYaw) * Math.min(1, dt * 4);
    if (petT > 0) {
      petT -= dt;
      turnTo(cam.x - pos.x, cam.z - pos.z, dt, 3);
      c.pose = 'nuzzle';
      moving = false;
    } else {
      const goal = mode === 'home' || dist > 45 ? home : new THREE.Vector3(cam.x, 0, cam.z);
      const gd = Math.hypot(goal.x - pos.x, goal.z - pos.z);
      const near = mode === 'home' ? 0.4 : 1.6;
      const startAt = mode === 'home' ? 0.7 : 3.0;
      if (gd > (moving ? near : startAt)) {
        moving = true;
        const run = gd > 7;
        c.pose = run ? 'run' : 'walk';
        const off = turnTo(goal.x - pos.x, goal.z - pos.z, dt, 5);
        const sp = (run ? 3.8 : 0.9) * Math.max(0.2, 1 - Math.abs(off) / 1.6);
        const next = new THREE.Vector3(pos.x + Math.sin(yaw) * sp * dt, y, pos.z + Math.cos(yaw) * sp * dt);
        W.physics.resolve(next, 0.14, 0.32, 0.38);
        if (!W.physics.water(next.x, next.z)) { pos.x = next.x; pos.z = next.z; }
        still = 0;
      } else {
        moving = false;
        still += dt;
        c.pose = still < 1.5 ? 'stand' : still % 16 > 11 ? 'groom' : 'sit';
      }
      if (mode === 'follow' && dist > 60) mode = 'home';
    }
    // stuck behind something while you walk away: hop over to you when nobody is looking
    const movedNow = pos.distanceTo(lastPos);
    lastPos.copy(pos);
    if (mode === 'follow' && moving && dist > 5 && movedNow < 0.01 * dt * 60) stuck += dt; else stuck = 0;
    if (stuck > 4) {
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(W.camera.quaternion).setY(0).normalize().multiplyScalar(2.5);
      pos.set(cam.x + back.x, 0, cam.z + back.z);
      stuck = 0;
    }
    const gy = W.physics.groundAt(pos.x, pos.z, y + 0.4);
    y += (gy - y) * Math.min(1, dt * 12);
    if (Math.abs(gy - y) > 1) y = gy;
    c.root.visible = dist < 80;
    c.update(dt, 0);
    c.root.position.set(pos.x, y, pos.z);
    c.root.rotation.y = yaw;
  });
}

// ---------------------------------------------------------------------------
function chickens() {
  const centre = new THREE.Vector3((COOP.x + BAKERY.x) / 2 - 1, 0, (COOP.z + BAKERY.z) / 2 - 2);
  const kinds: ('brown' | 'white' | 'speckled')[] = ['brown', 'brown', 'white', 'speckled', 'brown', 'white', 'brown'];
  const hens = kinds.map((k, i) => {
    const h = new Hen(k, 100 + i);
    W.scene.add(h.root);
    const pos = new THREE.Vector3(centre.x + (rnd() - 0.5) * 8, 0, centre.z + (rnd() - 0.5) * 8);
    return { h, pos, yaw: rnd() * 6.28, mode: 'peck' as 'peck' | 'walk' | 'run' | 'stand', timer: rnd() * 4, target: new THREE.Vector3() };
  });
  W.audio.loop('chickens', { pos: centre.clone().setY(heightAt(centre.x, centre.z) + 0.5), volume: 0.55, ref: 3, max: 40 });
  W.onUpdate((dt) => {
    const cam = W.camera.position;
    for (const c of hens) {
      c.timer -= dt;
      const pd = Math.hypot(cam.x - c.pos.x, cam.z - c.pos.z);
      if (pd < 1.6 && c.mode !== 'run') {
        c.mode = 'run'; c.timer = 1.2;
        c.target.set(c.pos.x - (cam.x - c.pos.x) * 2, 0, c.pos.z - (cam.z - c.pos.z) * 2);
      }
      if (c.mode === 'run' || c.mode === 'walk') {
        let d = Math.atan2(c.target.x - c.pos.x, c.target.z - c.pos.z) - c.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        c.yaw += THREE.MathUtils.clamp(d, -dt * 8, dt * 8);
        const sp = c.mode === 'run' ? 2.2 : 0.45;
        const next = new THREE.Vector3(c.pos.x + Math.sin(c.yaw) * sp * dt, heightAt(c.pos.x, c.pos.z), c.pos.z + Math.cos(c.yaw) * sp * dt);
        W.physics.resolve(next, 0.12, 0.4, 0.3);
        c.pos.x = next.x; c.pos.z = next.z;
        if (c.timer <= 0 || Math.hypot(c.target.x - c.pos.x, c.target.z - c.pos.z) < 0.25) { c.mode = 'peck'; c.timer = 2 + rnd() * 5; }
      } else if (c.timer <= 0) {
        const r = rnd();
        if (r < 0.45) {
          c.mode = 'walk'; c.timer = 6;
          c.target.set(c.pos.x + (rnd() - 0.5) * 4, 0, c.pos.z + (rnd() - 0.5) * 4);
          if (c.target.distanceTo(centre) > 8) c.target.lerp(centre, 0.6);
        } else { c.mode = r < 0.85 ? 'peck' : 'stand'; c.timer = 2 + rnd() * 5; }
      }
      c.h.root.visible = pd < 70;
      if (!c.h.root.visible) continue;
      c.h.pose = c.mode;
      c.h.update(dt);
      c.h.root.position.set(c.pos.x, heightAt(c.pos.x, c.pos.z), c.pos.z);
      c.h.root.rotation.y = c.yaw;
    }
  });
}

// ---------------------------------------------------------------------------
function duckMesh(kind: 'drake' | 'hen' | 'chick'): THREE.Group {
  const g = new THREE.Group();
  const mk = (c: string, rough = 0.6) => patchMaterial(new THREE.MeshStandardMaterial({ color: c, roughness: rough }), { key: 'duck-' + c });
  const bodyC = kind === 'drake' ? '#8a8478' : kind === 'hen' ? '#8a6a48' : '#c9a85a';
  const headC = kind === 'drake' ? '#1d5a32' : kind === 'hen' ? '#7a5a3a' : '#d8bc6a';
  const s = kind === 'chick' ? 0.45 : 1;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mk(bodyC));
  body.scale.set(0.85, 0.62, 1.35);
  body.position.y = 0.05;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), mk(kind === 'drake' ? '#2a2a2a' : bodyC));
  tail.rotation.x = -Math.PI / 2 - 0.5;
  tail.position.set(0, 0.1, -0.21);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.12, 8), mk(headC));
  neck.position.set(0, 0.16, 0.14);
  neck.rotation.x = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), mk(headC, 0.35));
  head.position.set(0, 0.25, 0.17);
  const bill = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.09), mk(kind === 'drake' ? '#d8b23a' : '#c4862a'));
  bill.position.set(0, 0.235, 0.255);
  g.add(body, tail, neck, head, bill);
  if (kind === 'drake') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 14), mk('#f4f2ea'));
    ring.rotation.x = Math.PI / 2 - 0.25;
    ring.position.set(0, 0.12, 0.13);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mk('#6a3a28'));
    chest.position.set(0, 0.07, 0.12);
    g.add(ring, chest);
  }
  g.scale.setScalar(s);
  collapse(g, duckMat());
  return g;
}

function ducks() {
  const family = [duckMesh('drake'), duckMesh('hen'), duckMesh('chick'), duckMesh('chick'), duckMesh('chick'), duckMesh('chick')];
  family.forEach((d) => W.scene.add(d));
  const trail: THREE.Vector3[] = [];
  const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
  const at = (u: number, v: number) => new THREE.Vector3(POND.x + u * c + v * s, WATER_Y, POND.z - u * s + v * c);
  let lead = at(0, 0), heading = 0, target = at(3, 2), quackT = 8;
  let crumbs: THREE.Vector3 | null = null, crumbT = 0;
  const pickTarget = () => {
    for (let k = 0; k < 20; k++) {
      const p = at((rnd() - 0.5) * POND.rx * 1.3, (rnd() - 0.5) * POND.rz * 1.3);
      if (pondDist(p.x, p.z) < 0.7) return p;
    }
    return at(0, 0);
  };
  // toss crumbs from the bank or the dock while holding something from the bakery
  W.interact.add({
    pos: () => {
      const p = W.camera.position.clone();
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(W.camera.quaternion);
      return p.addScaledVector(f, 1.5);
    },
    radius: 0.6, range: 3,
    enabled: () => !!W.held && pondDist(W.camera.position.x, W.camera.position.z) < 1.35,
    label: 'Toss crumbs to the ducks',
    onUse: () => {
      const p = W.camera.position.clone();
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(W.camera.quaternion).setY(0).normalize();
      crumbs = p.addScaledVector(f, 2.5).setY(WATER_Y);
      if (pondDist(crumbs.x, crumbs.z) > 0.9) crumbs.lerp(at(0, 0), 0.3);
      crumbT = 12;
      W.audio.play('duck_quack', { pos: lead, volume: 0.9 });
      W.toast('The ducks paddle over for the crumbs');
    },
  });
  W.onUpdate((dt, t) => {
    crumbT -= dt;
    const goal = crumbs && crumbT > 0 ? crumbs : target;
    const dx = goal.x - lead.x, dz = goal.z - lead.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6 && !(crumbs && crumbT > 0)) target = pickTarget();
    const want = Math.atan2(dx, dz);
    let dd = want - heading; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    heading += THREE.MathUtils.clamp(dd, -dt * 1.2, dt * 1.2);
    const sp = crumbs && crumbT > 0 ? (d > 0.8 ? 0.9 : 0) : 0.45 + 0.15 * noise(t * 0.2, 1);
    lead.x += Math.sin(heading) * sp * dt;
    lead.z += Math.cos(heading) * sp * dt;
    if (pondDist(lead.x, lead.z) > 0.85) { target = pickTarget(); heading += dt * 2; }
    trail.unshift(lead.clone());
    if (trail.length > 600) trail.pop();
    family.forEach((m, i) => {
      // the hen follows the drake, the ducklings follow in a line
      const lag = i === 0 ? 0 : 40 + i * 28;
      const p = trail[Math.min(trail.length - 1, lag)] || lead;
      const q = trail[Math.min(trail.length - 1, lag + 6)] || p;
      m.position.set(p.x + (i > 1 ? Math.sin(t * 2 + i) * 0.05 : 0), WATER_Y - 0.02 + Math.sin(t * 2.2 + i) * 0.01, p.z);
      const hd = Math.atan2(p.x - q.x, p.z - q.z);
      if (Number.isFinite(hd) && (p.x !== q.x || p.z !== q.z)) m.rotation.y = hd;
      // ducklings dip their heads now and then
      m.rotation.x = i > 1 && Math.sin(t * 0.7 + i * 3) > 0.92 ? 0.5 : 0;
    });
    quackT -= dt;
    const near = Math.hypot(W.camera.position.x - lead.x, W.camera.position.z - lead.z) < 30;
    if (quackT < 0 && near && U.uNight.value < 0.6) { quackT = 10 + rnd() * 25; W.audio.play('duck_quack', { pos: lead, volume: 0.6, rate: 0.95 + rnd() * 0.1 }); }
  });
}

export default async function build() {
  ducks();
  buildFish();
  cat();
  chickens();
  const jobs = [horses()];
  const res = await Promise.allSettled(jobs);
  res.forEach((r) => { if (r.status === 'rejected') console.warn('animal failed', r.reason); });
}
