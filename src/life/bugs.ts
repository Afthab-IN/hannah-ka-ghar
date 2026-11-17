import * as THREE from 'three';
import { U, patchMaterial } from '../shaderlib';
import { W } from '../world';
import { mulberry32, makeSimplex } from '../noise';
import { heightAt, flowerMask, pondDist } from '../world/terrain';
import { POND } from '../world/layout';

// Fireflies over the meadow and the pond at night, butterflies over the
// flowers by day. Both follow the player around so they're always nearby.

export function buildFireflies() {
  const rnd = mulberry32(17);
  const N = 420;
  const seeds = new Float32Array(N * 4);
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // home spots: mostly over flowers and round the pond
    let x = 0, z = 0;
    for (let k = 0; k < 30; k++) {
      x = (rnd() - 0.5) * 120; z = (rnd() - 0.5) * 110 - 2;
      const pd = pondDist(x, z);
      if (pd > 0.95 && (flowerMask(x, z) > 0.3 || pd < 1.8) && rnd() < 0.9) break;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = heightAt(x, z) + 0.4 + rnd() * 1.6; pos[i * 3 + 2] = z;
    seeds[i * 4] = rnd(); seeds[i * 4 + 1] = rnd(); seeds[i * 4 + 2] = rnd(); seeds[i * 4 + 3] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uNight: U.uNight, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uNight, uPx;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.25 + aSeed.x * 0.3) + aSeed.y * 40.0;
        p += vec3(sin(t) * 1.4 + sin(t * 2.3) * 0.4, sin(t * 1.7 + aSeed.z * 6.0) * 0.35, cos(t * 0.8) * 1.4 + cos(t * 1.9) * 0.3);
        // slow blinking: a soft pulse every few seconds
        float ph = fract(uTime * (0.18 + aSeed.w * 0.2) + aSeed.z);
        float blink = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.12, 0.42, ph));
        vA = blink * uNight;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * (3.0 + 60.0 / -mv.z) * (0.6 + 0.4 * blink);
        gl_Position = projectionMatrix * mv;
        if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.8, 1.0, 0.4) * (pow(core, 3.0) * 6.0 + pow(core, 1.2) * 0.6) * vA, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 30;
  W.scene.add(pts);
  W.noReflect.push(pts);
  W.onUpdate(() => { mat.uniforms.uPx.value = Math.min(2, window.devicePixelRatio || 1); pts.visible = U.uNight.value > 0.02; });
  return pts;
}

// ---------------------------------------------------------------------------
export function buildButterflies() {
  const rnd = mulberry32(23);
  const n = makeSimplex(41);
  const N = 16;
  // one butterfly = two wing quads hinged on the body line (x = 0)
  const pos: number[] = [], uv: number[] = [], side: number[] = [];
  for (const s of [-1, 1]) {
    const q = [[0, 0, -0.04], [s * 0.07, 0, -0.06], [0, 0, 0.04], [s * 0.06, 0, 0.05]];
    const tri = [0, 1, 2, 1, 3, 2];
    for (const k of tri) { pos.push(...q[k]); uv.push(Math.abs(q[k][0]) / 0.07, (q[k][2] + 0.06) / 0.11); side.push(s); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) phase[i] = rnd();
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
  patchMaterial(mat, {
    key: 'butterfly',
    vertexHead: 'attribute float aSide; attribute float aPhase; varying vec2 vBU;',
    vsReplace: [['#include <begin_vertex>', /* glsl */ `
      {
        float flap = 0.2 + 1.1 * (0.5 + 0.5 * sin(uTime * 16.0 + aPhase * 50.0));
        float ax = abs(position.x);
        transformed.x = sign(position.x) * ax * cos(flap);
        transformed.y = ax * sin(flap);
        vBU = uv;
      }
    `]],
    fragHead: 'varying vec2 vBU;',
    fragAfterMaps: /* glsl */ `
      {
        // wing pattern: dark edge, bright body of the wing, a couple of eye spots
        float edge = smoothstep(0.75, 0.95, vBU.x) + smoothstep(0.85, 1.0, vBU.y) * 0.6;
        float spot = smoothstep(0.12, 0.06, length(vBU - vec2(0.6, 0.65)));
        vec3 base = diffuseColor.rgb;
        diffuseColor.rgb = mix(base, vec3(0.05, 0.04, 0.03), clamp(edge, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.92, 0.8), spot);
      }
    `,
  });
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.frustumCulled = false;
  const cols = ['#f3a02a', '#f6d24a', '#ffffff', '#5a9be0', '#e86a2a', '#f0c060'];
  for (let i = 0; i < N; i++) im.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  W.scene.add(im);
  const bs = Array.from({ length: N }, () => ({ home: new THREE.Vector3(), pos: new THREE.Vector3(), seed: rnd() * 100, rest: 0 }));
  const pick = (b: typeof bs[0], around: THREE.Vector3) => {
    for (let k = 0; k < 20; k++) {
      const x = around.x + (rnd() - 0.5) * 30, z = around.z + (rnd() - 0.5) * 30;
      if (flowerMask(x, z) > 0.25 || k === 19) { b.home.set(x, heightAt(x, z) + 0.6, z); break; }
    }
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let init = false;
  W.onUpdate((dt, t) => {
    const cam = W.camera.position;
    const day = U.uDay.value * (1 - U.uNight.value);
    im.visible = day > 0.05;
    if (!im.visible) return;
    bs.forEach((b, i) => {
      if (!init || b.home.distanceTo(cam) > 26) { pick(b, cam); b.pos.copy(b.home); }
      const k = t * 0.5 + b.seed;
      const target = new THREE.Vector3(b.home.x + n(k, 1) * 3.5, b.home.y + 0.35 * n(k * 2, 5) + Math.abs(Math.sin(t * 3 + i)) * 0.15, b.home.z + n(k, 9) * 3.5);
      const prev = b.pos.clone();
      b.pos.lerp(target, Math.min(1, dt * 1.6));
      const v = b.pos.clone().sub(prev);
      const yaw = Math.atan2(v.x, v.z);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m4.compose(b.pos, q, s.setScalar(1.3 * day));
      im.setMatrixAt(i, m4);
      if (rnd() < dt * 0.05) pick(b, cam);
    });
    init = true;
    im.instanceMatrix.needsUpdate = true;
  });
  void POND;
  return im;
}
