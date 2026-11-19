import * as THREE from 'three';
import { W } from '../world';
import { U, patchMaterial } from '../shaderlib';
import { WATER_Y, pondDist } from '../world/terrain';
import { POND } from '../world/layout';
import { mulberry32 } from '../noise';

// Fish that leap out of the pond now and then: a silver or golden fish arcs
// through the air, then a splash, droplets and rings spreading on the water.

function fishGeo(): THREE.BufferGeometry {
  // a slim body (squashed sphere) with a forked tail fin, pointing along +z
  const body = new THREE.SphereGeometry(1, 14, 10);
  body.scale(0.045, 0.06, 0.17);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, 0, 0.07, -0.26, 0, 0, -0.21, 0, 0, -0.15, 0, 0, -0.21, 0, -0.07, -0.26], 3));
  tail.computeVertexNormals();
  const dorsal = new THREE.BufferGeometry();
  dorsal.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, 0.05, 0, 0.1, -0.03, 0, 0.05, -0.07], 3));
  dorsal.computeVertexNormals();
  const parts = [body.toNonIndexed(), tail, dorsal];
  parts.forEach((p) => { if (p.attributes.uv) p.deleteAttribute('uv'); });
  const pos: number[] = [], nrm: number[] = [];
  for (const p of parts) { pos.push(...(p.attributes.position.array as Float32Array)); nrm.push(...(p.attributes.normal.array as Float32Array)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

export function buildFish() {
  const rnd = mulberry32(61);
  const mats = [
    patchMaterial(new THREE.MeshStandardMaterial({ color: '#c9ced2', roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide }), { key: 'fish-silver' }),
    patchMaterial(new THREE.MeshStandardMaterial({ color: '#e08a2c', roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide }), { key: 'fish-gold' }),
  ];
  const geo = fishGeo();
  const fish = new THREE.Mesh(geo, mats[0]);
  fish.visible = false;
  fish.castShadow = true;
  W.scene.add(fish);

  // rings: a few expanding circles on the water
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uAge: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uAge; varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = 0.0;
        for (int i = 0; i < 3; i++) {
          float rr = uAge * 0.55 - float(i) * 0.16;
          if (rr <= 0.0) continue;
          a += smoothstep(0.035, 0.0, abs(r - rr)) * (1.0 - rr);
        }
        a *= smoothstep(1.6, 0.6, uAge);
        gl_FragColor = vec4(vec3(0.85, 0.9, 0.95), clamp(a, 0.0, 1.0) * 0.55);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), ringMat);
  ring.visible = false;
  ring.renderOrder = 6;
  W.scene.add(ring);

  // droplets
  const N = 26;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(N * 3);
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dc = document.createElement('canvas');
  dc.width = dc.height = 32;
  const dg = dc.getContext('2d')!;
  const grd = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = grd; dg.fillRect(0, 0, 32, 32);
  const dMat = new THREE.PointsMaterial({ color: '#e8f0f4', size: 0.035, map: new THREE.CanvasTexture(dc), transparent: true, opacity: 0.85, depthWrite: false });
  const drops = new THREE.Points(dGeo, dMat);
  drops.frustumCulled = false;
  drops.visible = false;
  W.scene.add(drops);
  const dVel: THREE.Vector3[] = Array.from({ length: N }, () => new THREE.Vector3());

  const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
  const spot = () => {
    for (let k = 0; k < 30; k++) {
      const u = (rnd() - 0.5) * POND.rx * 1.6, v = (rnd() - 0.5) * POND.rz * 1.6;
      const p = new THREE.Vector3(POND.x + u * c + v * s, WATER_Y, POND.z - u * s + v * c);
      if (pondDist(p.x, p.z) < 0.72) return p;
    }
    return new THREE.Vector3(POND.x, WATER_Y, POND.z);
  };

  let wait = 3 + rnd() * 4;
  let t = -1, dur = 0.7, height = 0.5;
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  let splashAt = -1, dropT = -1;
  const splash = (p: THREE.Vector3, big: number) => {
    ring.position.set(p.x, WATER_Y + 0.015, p.z);
    ring.scale.setScalar(0.6 + big * 0.6);
    ring.visible = true;
    splashAt = 0;
    drops.visible = true;
    dropT = 0;
    for (let i = 0; i < N; i++) {
      dPos[i * 3] = p.x; dPos[i * 3 + 1] = WATER_Y + 0.02; dPos[i * 3 + 2] = p.z;
      const a = rnd() * 6.28, sp = 0.4 + rnd() * 0.9 * big;
      dVel[i].set(Math.cos(a) * sp, 1.4 + rnd() * 1.8 * big, Math.sin(a) * sp);
    }
    if (W.camera.position.distanceTo(p) < 70) W.audio.splash(p, 0.35 + big * 0.35);
  };

  W.onUpdate((dt) => {
    // fish rest at night
    if (t < 0) {
      wait -= dt * (U.uNight.value > 0.7 ? 0.25 : 1);
      if (wait <= 0) {
        from.copy(spot());
        const ang = rnd() * 6.28, len = 0.6 + rnd() * 0.8;
        to.set(from.x + Math.cos(ang) * len, WATER_Y, from.z + Math.sin(ang) * len);
        if (pondDist(to.x, to.z) > 0.85) to.copy(from);
        dur = 0.55 + rnd() * 0.35;
        height = 0.3 + rnd() * 0.45;
        fish.material = mats[rnd() < 0.7 ? 0 : 1];
        fish.scale.setScalar(0.8 + rnd() * 0.7);
        t = 0;
        fish.visible = true;
        splash(from, 0.5);
      }
    } else {
      t += dt;
      const k = Math.min(1, t / dur);
      const p = new THREE.Vector3().lerpVectors(from, to, k);
      p.y = WATER_Y - 0.05 + Math.sin(k * Math.PI) * height;
      // nose follows the arc
      const dy = Math.cos(k * Math.PI) * height * Math.PI;
      const dh = from.distanceTo(to) || 0.01;
      fish.position.copy(p);
      fish.rotation.set(-Math.atan2(dy, dh), Math.atan2(to.x - from.x, to.z - from.z), Math.sin(t * 20) * 0.1, 'YXZ');
      if (k >= 1) {
        fish.visible = false;
        t = -1;
        wait = 4 + rnd() * 9;
        splash(to, 1);
      }
    }
    if (splashAt >= 0) {
      splashAt += dt;
      ringMat.uniforms.uAge.value = splashAt;
      if (splashAt > 1.8) { ring.visible = false; splashAt = -1; }
    }
    if (dropT >= 0) {
      dropT += dt;
      for (let i = 0; i < N; i++) {
        dVel[i].y -= 9.8 * dt;
        dPos[i * 3] += dVel[i].x * dt; dPos[i * 3 + 1] = Math.max(WATER_Y, dPos[i * 3 + 1] + dVel[i].y * dt); dPos[i * 3 + 2] += dVel[i].z * dt;
      }
      dGeo.attributes.position.needsUpdate = true;
      dMat.opacity = 0.85 * Math.max(0, 1 - dropT / 0.9);
      if (dropT > 0.9) { drops.visible = false; dropT = -1; }
    }
  });
}
