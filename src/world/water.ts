import * as THREE from 'three';
import { U, ATMO_GLSL } from '../shaderlib';
import { heightAt, WATER_Y, pondDist } from './terrain';
import { POND } from './layout';
import { mulberry32 } from '../noise';
import { patchMaterial } from '../shaderlib';

// The pond: planar reflection of the farm and the sky, gentle ripples, a dark
// peaty body, soft shoreline, plus lily pads and cattails.

export class PlanarReflection {
  rt: THREE.WebGLRenderTarget;
  textureMatrix = new THREE.Matrix4();
  cam = new THREE.PerspectiveCamera();
  private plane = new THREE.Plane();
  private clip = new THREE.Vector4();
  private q = new THREE.Vector4();
  private v = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private rot = new THREE.Matrix4();
  private normal = new THREE.Vector3(0, 1, 0);
  private origin = new THREE.Vector3(0, WATER_Y, 0);
  frame = 0;
  every = 1;

  constructor(w: number, h: number, public scale = 0.5) {
    this.rt = new THREE.WebGLRenderTarget(Math.max(2, w * scale), Math.max(2, h * scale), { type: THREE.HalfFloatType, samples: 2 });
  }
  setSize(w: number, h: number) { this.rt.setSize(Math.max(2, Math.floor(w * this.scale)), Math.max(2, Math.floor(h * this.scale))); }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]) {
    if (this.frame++ % this.every !== 0) return;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < this.origin.y) return;
    const view = this.v.subVectors(this.origin.set(camPos.x, WATER_Y, camPos.z), camPos);
    view.reflect(this.normal).negate().add(this.origin);
    this.rot.extractRotation(camera.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rot).add(camPos);
    const target = new THREE.Vector3().subVectors(this.origin, this.lookAt).reflect(this.normal).negate().add(this.origin);
    const rc = this.cam;
    rc.position.copy(view);
    rc.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(this.normal);
    rc.lookAt(target);
    rc.far = camera.far; rc.near = camera.near;
    rc.layers.set(0);
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix);
    this.textureMatrix.multiply(rc.matrixWorldInverse);
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.origin);
    this.plane.applyMatrix4(rc.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = rc.projectionMatrix;
    const q = this.q;
    q.x = (Math.sign(this.clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(this.clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    this.clip.multiplyScalar(2.0 / this.clip.dot(q));
    pm.elements[2] = this.clip.x; pm.elements[6] = this.clip.y; pm.elements[10] = this.clip.z + 1.0 - 0.003; pm.elements[14] = this.clip.w;
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevTarget = renderer.getRenderTarget();
    const prevNeeds = renderer.shadowMap.needsUpdate;
    const prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false; // the main pass refreshes shadows, not the reflection
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevAuto;
    renderer.shadowMap.needsUpdate = prevNeeds;
    hide.forEach((o, i) => (o.visible = vis[i]));
  }
}

export function buildPond(reflection: PlanarReflection) {
  // a disc mesh slightly bigger than the pond; terrain hides what is outside
  const R = 1.12;
  const rings = 26, segs = 96;
  const pos: number[] = [], depth: number[] = [];
  const idx: number[] = [];
  const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
  pos.push(POND.x, WATER_Y, POND.z);
  depth.push(WATER_Y - heightAt(POND.x, POND.z));
  for (let r = 1; r <= rings; r++) {
    const rr = (r / rings) * R;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const wob = 1 + 0.07 * Math.sin(a * 3 + 1.3) + 0.05 * Math.sin(a * 5 - 0.4);
      const u = Math.cos(a) * rr * POND.rx * wob, v = Math.sin(a) * rr * POND.rz * wob;
      const x = POND.x + u * c + v * s, z = POND.z - u * s + v * c;
      pos.push(x, WATER_Y, z);
      depth.push(WATER_Y - heightAt(x, z));
    }
  }
  for (let k = 0; k < segs; k++) idx.push(0, 1 + ((k + 1) % segs), 1 + k);
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs, a1 = 1 + r * segs;
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % segs;
      idx.push(a0 + k, a0 + k1, a1 + k, a0 + k1, a1 + k1, a1 + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uRefl: { value: reflection.rt.texture },
      uTexMat: { value: reflection.textureMatrix },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying float vDepth;
      varying vec3 vWPos;
      varying vec4 vRefl;
      uniform mat4 uTexMat;
      void main() {
        vDepth = aDepth;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vRefl = uTexMat * wp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uRefl;
      uniform float uTime;
      uniform vec3 uLightDir;
      uniform vec3 uLightCol;
      uniform vec2 uWindDir;
      ${ATMO_GLSL}
      varying float vDepth;
      varying vec3 vWPos;
      varying vec4 vRefl;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      float waves(vec2 p) {
        float t = uTime;
        float h = vn(p * 0.9 + uWindDir * t * 0.35) * 0.5;
        h += vn(p * 2.3 - uWindDir.yx * t * 0.5) * 0.25;
        h += vn(p * 5.1 + vec2(t * 0.3, -t * 0.2)) * 0.12;
        return h;
      }
      void main() {
        if (vDepth < -0.02) discard;
        vec2 p = vWPos.xz;
        float e = 0.08;
        float h0 = waves(p);
        vec3 N = normalize(vec3((h0 - waves(p + vec2(e, 0.0))) * 0.35, 1.0, (h0 - waves(p + vec2(0.0, e))) * 0.35));
        vec3 V = normalize(cameraPosition - vWPos);
        float cosT = clamp(dot(N, V), 0.0, 1.0);
        float F = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
        vec2 ruv = vRefl.xy / vRefl.w + N.xz * 0.035;
        vec3 refl = texture2D(uRefl, ruv).rgb;
        // the water body: peaty green-brown, lighter where shallow
        float sh = smoothstep(0.0, 0.9, vDepth);
        vec3 body = mix(vec3(0.07, 0.08, 0.04), vec3(0.012, 0.025, 0.02), sh);
        vec3 skyAmb = atmosphere(vec3(0.0, 1.0, 0.0)) * 0.25;
        body *= 0.6 + skyAmb * 2.0;
        vec3 col = mix(body, refl, clamp(F * 0.9 + 0.32, 0.0, 1.0));
        // sun / moon glitter
        vec3 L = normalize(uLightDir);
        vec3 Hh = normalize(L + V);
        float spec = pow(max(dot(N, Hh), 0.0), 220.0) * 3.5;
        col += uLightCol * spec * 0.25;
        // fog
        float dist = length(vWPos - cameraPosition);
        float fogAmt = 1.0 - exp(-dist * uFogDensity * 0.8);
        vec3 fd = normalize(vWPos - cameraPosition);
        col = mix(col, atmosphere(normalize(vec3(fd.x, 0.02, fd.z))), fogAmt);
        float a = smoothstep(0.0, 0.12, vDepth);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pond';
  mesh.renderOrder = 5;
  return mesh;
}

/** Lily pads, lilies and cattails round the pond. */
export function buildPondPlants(): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(31);
  const c = Math.cos(POND.rot), s = Math.sin(POND.rot);
  const at = (d: number, a: number) => {
    const wob = 1 + 0.07 * Math.sin(a * 3 + 1.3) + 0.05 * Math.sin(a * 5 - 0.4);
    const u = Math.cos(a) * d * POND.rx * wob, v = Math.sin(a) * d * POND.rz * wob;
    return new THREE.Vector3(POND.x + u * c + v * s, 0, POND.z - u * s + v * c);
  };
  // lily pads
  const padGeo = new THREE.CircleGeometry(0.17, 18, 0.25, Math.PI * 2 - 0.5);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3f6a24, roughness: 0.5, side: THREE.DoubleSide });
  patchMaterial(padMat, { key: 'lilypad', fragAfterMaps: 'diffuseColor.rgb *= 0.8 + 0.3 * vnoise(vWPos.xz * 9.0);' });
  const pads: THREE.Vector3[] = [];
  for (let cl = 0; cl < 6; cl++) {
    const a0 = rnd() * Math.PI * 2, d0 = 0.55 + rnd() * 0.3;
    for (let i = 0; i < 9; i++) pads.push(at(d0 + (rnd() - 0.5) * 0.12, a0 + (rnd() - 0.5) * 0.35));
  }
  const padIm = new THREE.InstancedMesh(padGeo, padMat, pads.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  pads.forEach((p, i) => {
    m4.compose(p.setY(WATER_Y + 0.012), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), sc.setScalar(0.7 + rnd() * 0.6));
    padIm.setMatrixAt(i, m4);
  });
  padIm.receiveShadow = true;
  g.add(padIm);
  // a few lilies
  const lilyGeo = new THREE.ConeGeometry(0.06, 0.06, 7, 1, true);
  lilyGeo.translate(0, 0.03, 0);
  const lilyMat = new THREE.MeshStandardMaterial({ color: 0xf2c4d8, roughness: 0.5, emissive: 0x301018, side: THREE.DoubleSide });
  const lilies = new THREE.InstancedMesh(lilyGeo, lilyMat, 10);
  for (let i = 0; i < 10; i++) {
    const p = pads[Math.floor(rnd() * pads.length)].clone();
    m4.compose(p.setY(WATER_Y + 0.02).add(new THREE.Vector3(0.08, 0, 0.05)), q.setFromEuler(new THREE.Euler(Math.PI, 0, 0)), sc.setScalar(1));
    lilies.setMatrixAt(i, m4);
  }
  g.add(lilies);
  // cattails: a stalk with a brown head, in clumps along the bank
  const stalk = new THREE.CylinderGeometry(0.008, 0.012, 1.7, 4);
  stalk.translate(0, 0.85, 0);
  const head = new THREE.CapsuleGeometry(0.03, 0.16, 3, 6);
  head.translate(0, 1.45, 0);
  const swayS = new Float32Array(stalk.attributes.position.count);
  for (let i = 0; i < swayS.length; i++) swayS[i] = Math.max(0, stalk.attributes.position.getY(i)) * 0.06;
  stalk.setAttribute('aSway', new THREE.BufferAttribute(swayS, 1));
  const swayH = new Float32Array(head.attributes.position.count).fill(1.45 * 0.06);
  head.setAttribute('aSway', new THREE.BufferAttribute(swayH, 1));
  const stalkMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x5a7a30, roughness: 0.8 }), { key: 'cattail-stalk', wind: true });
  const headMat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 }), { key: 'cattail-head', wind: true });
  const tails: THREE.Matrix4[] = [];
  for (let cl = 0; cl < 9; cl++) {
    const a0 = rnd() * Math.PI * 2;
    for (let i = 0; i < 14; i++) {
      const p = at(0.9 + rnd() * 0.22, a0 + (rnd() - 0.5) * 0.3);
      if (pondDist(p.x, p.z) < 0.85) continue;
      const y = Math.max(heightAt(p.x, p.z), WATER_Y - 0.2);
      tails.push(new THREE.Matrix4().compose(p.setY(y), q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.15, rnd() * 6, (rnd() - 0.5) * 0.15)), sc.setScalar(0.7 + rnd() * 0.45)));
    }
  }
  const st = new THREE.InstancedMesh(stalk, stalkMat, tails.length);
  const hd = new THREE.InstancedMesh(head, headMat, tails.length);
  tails.forEach((m, i) => { st.setMatrixAt(i, m); hd.setMatrixAt(i, m); });
  st.castShadow = hd.castShadow = true;
  g.add(st, hd);
  return g;
}
