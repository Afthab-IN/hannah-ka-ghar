import * as THREE from 'three';
import { patchMaterial } from '../shaderlib';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSimplex, mulberry32 } from '../noise';
import { W } from '../world';
import type { Lamp } from '../lamps';
import type { LoopHandle } from '../audio';

// A wood fire: logs with glowing coals, animated flame cards, embers, a glow
// halo, a flickering warm lamp and a crackle loop. Used for the campfire, the
// fireplace and the bakery oven. scale 1 = campfire size.

export interface FireOpts {
  pos: THREE.Vector3; // centre of the fire bed
  scale?: number;
  lit?: boolean;
  logs?: boolean; // default true
  lampRadius?: number; // default 9 * scale
  lampIntensity?: number;
  sound?: boolean; // crackle loop (default true)
  label?: string; // e.g. "the fire"; adds an interaction to light / put out
  embers?: boolean;
  lampOffset?: THREE.Vector3; // move the light (e.g. in front of a firebox)
}

export class Fire {
  group = new THREE.Group();
  lit: number;
  target: number;
  lamp: Lamp;
  private flameMat: THREE.ShaderMaterial;
  private emberMat: THREE.ShaderMaterial | null = null;
  private glowMat: THREE.SpriteMaterial;
  private glow: THREE.Sprite;
  private n = makeSimplex(5);
  private fireLitU = { value: 1 };
  private loop: LoopHandle | null = null;
  private scale: number;

  constructor(private o: FireOpts) {
    const s = (this.scale = o.scale ?? 1);
    this.lit = this.target = o.lit === false ? 0 : 1;
    this.group.position.copy(o.pos);
    const rnd = mulberry32(12);

    if (o.logs !== false) {
      const logMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
      patchMaterial(logMat, {
        key: 'firelog',
        fragAfterMaps: /* glsl */ `
          {
            float g = vnoise(vec2(vWPos.y * 30.0, atan(vWPos.x - uFirePos.x, vWPos.z - uFirePos.z) * 4.0));
            vec3 c = mix(vec3(0.1, 0.07, 0.045), vec3(0.24, 0.17, 0.1), g);
            float d = length(vWPos.xz - uFirePos.xz);
            float char = 1.0 - smoothstep(0.1, 0.5 * uFireScale, vWPos.y - uFirePos.y + d * 0.4);
            diffuseColor.rgb = mix(c, vec3(0.02), char * 0.85);
            totalEmissiveRadiance += vec3(1.0, 0.3, 0.05) * char * smoothstep(0.5, 0.8, vnoise(vWPos.xz * 18.0 / uFireScale + uTime * 0.6)) * 2.5 * uFireLit;
          }
        `,
        fragHead: 'uniform vec3 uFirePos; uniform float uFireLit; uniform float uFireScale;',
        extraUniforms: { uFirePos: { value: o.pos }, uFireLit: this.fireLitU, uFireScale: { value: s } },
      });
      const parts: THREE.BufferGeometry[] = [];
      const tmp = new THREE.Object3D();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rnd() * 0.3;
        tmp.position.set(Math.cos(a) * 0.24 * s, 0.34 * s, Math.sin(a) * 0.24 * s);
        tmp.rotation.set(0, -a, 0);
        tmp.rotateZ(0.6);
        tmp.updateMatrix();
        parts.push(new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 1.1 * s, 7).applyMatrix4(tmp.matrix));
      }
      const logs = new THREE.Mesh(mergeGeometries(parts, false)!, logMat);
      logs.castShadow = false;
      logs.receiveShadow = true;
      this.group.add(logs);
    }

    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLit: { value: 1 }, uSeed: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime, uLit, uSeed;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.1; a *= 0.5; } return s; }
        void main() {
          vec2 uv = vUv;
          float t = uTime * 1.6 + uSeed * 10.0;
          float y = uv.y / max(uLit, 0.05);
          float n = fbm(vec2(uv.x * 4.0 + uSeed * 3.0, uv.y * 3.0 - t * 2.2));
          float w = 0.5 - abs(uv.x - 0.5 + (n - 0.5) * 0.25 * uv.y);
          float shape = smoothstep(0.0, 0.35, w) * (1.0 - smoothstep(0.15, 0.95, y + (n - 0.5) * 0.5));
          float core = smoothstep(0.12, 0.42, w) * (1.0 - smoothstep(0.0, 0.45, y + (n - 0.5) * 0.4));
          float f = clamp(shape * (0.6 + n), 0.0, 1.0);
          vec3 col = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.18), f);
          col = mix(col, vec3(1.0, 0.92, 0.6), core);
          gl_FragColor = vec4(col * f * uLit * 2.6, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flameGeo = new THREE.PlaneGeometry(0.95 * s, 1.6 * s);
    flameGeo.translate(0, 0.8 * s, 0);
    for (let i = 0; i < 3; i++) {
      const mat = this.flameMat.clone();
      mat.uniforms.uSeed.value = i * 0.37;
      mat.uniforms.uTime = this.flameMat.uniforms.uTime;
      mat.uniforms.uLit = this.flameMat.uniforms.uLit;
      const f = new THREE.Mesh(flameGeo, mat);
      f.rotation.y = (i / 3) * Math.PI;
      f.position.y = 0.08 * s;
      f.renderOrder = 20;
      this.group.add(f);
    }

    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const gg = gc.getContext('2d')!;
    const grad = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,170,80,1)');
    grad.addColorStop(0.3, 'rgba(255,110,30,0.35)');
    grad.addColorStop(1, 'rgba(255,80,10,0)');
    gg.fillStyle = grad;
    gg.fillRect(0, 0, 128, 128);
    this.glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.setScalar(3.6 * s);
    this.glow.position.y = 0.55 * s;
    this.glow.renderOrder = 21;
    this.group.add(this.glow);

    if (o.embers !== false) {
      const N = Math.round(120 * s);
      const seeds = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { seeds[i * 3] = rnd(); seeds[i * 3 + 1] = rnd(); seeds[i * 3 + 2] = rnd(); }
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      eg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
      this.emberMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uLit: { value: 1 }, uPx: { value: 1 }, uS: { value: s } },
        vertexShader: /* glsl */ `
          attribute vec3 aSeed;
          uniform float uTime, uLit, uPx, uS;
          varying float vA;
          void main() {
            float life = 2.0 + aSeed.x * 1.8;
            float t = mod(uTime + aSeed.y * 10.0, life) / life;
            vec3 p = vec3((aSeed.z - 0.5) * 0.5, 0.25, (aSeed.x - 0.5) * 0.5) * uS;
            p.y += t * (2.0 + aSeed.y * 3.0) * uS;
            p.x += sin(t * 6.0 + aSeed.y * 20.0) * 0.3 * t * uS;
            p.z += cos(t * 5.0 + aSeed.z * 20.0) * 0.3 * t * uS;
            vA = (1.0 - t) * smoothstep(0.0, 0.08, t) * uLit;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.5 + aSeed.z * 2.0) * uPx * 16.0 / -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vec3(1.0, 0.45, 0.1) * smoothstep(0.5, 0.0, d) * vA * 6.0, 1.0);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const embers = new THREE.Points(eg, this.emberMat);
      embers.frustumCulled = false;
      embers.renderOrder = 22;
      this.group.add(embers);
    }

    this.lamp = W.lamps.add(o.pos.clone().add(o.lampOffset ?? new THREE.Vector3(0, 0.7 * s, 0)), '#ff8a3c', o.lampIntensity ?? 7, o.lampRadius ?? 9 * s, { flicker: 1 });
    if (o.sound !== false) this.loop = W.audio.loop('fire_crackle', { pos: o.pos, volume: this.lit, ref: 1.5 * s + 0.5, max: 30 });
    if (o.label) {
      W.interact.add({
        pos: o.pos.clone().add(new THREE.Vector3(0, 0.4 * s, 0)),
        radius: 0.6 * s + 0.2,
        range: 3,
        label: () => (this.target > 0.5 ? `Put out ${o.label}` : `Light ${o.label}`),
        onUse: () => this.toggle(),
      });
    }
    W.onUpdate((dt, time) => this.update(dt, time));
  }

  toggle() {
    this.target = this.target > 0.5 ? 0 : 1;
    if (this.target > 0.5) W.audio.play('fire_crackle', { pos: this.o.pos, volume: 0.3, rate: 1.4 });
  }

  update(dt: number, time: number) {
    this.lit += (this.target - this.lit) * (1 - Math.exp(-dt * (this.target > this.lit ? 2.5 : 1.6)));
    const flick = 0.82 + 0.12 * this.n(time * 3.1, 0.5) + 0.08 * this.n(time * 9.3, 4.1);
    this.lamp.on = this.lit > 0.02;
    this.lamp.intensity = (this.o.lampIntensity ?? 7) * this.lit;
    this.flameMat.uniforms.uTime.value = time;
    this.flameMat.uniforms.uLit.value = this.lit;
    if (this.emberMat) {
      this.emberMat.uniforms.uTime.value = time;
      this.emberMat.uniforms.uLit.value = this.lit;
      this.emberMat.uniforms.uPx.value = window.devicePixelRatio || 1;
    }
    this.glowMat.opacity = this.lit * flick * 0.3;
    this.glow.scale.setScalar(3.2 * this.scale * (0.9 + 0.1 * flick));
    this.fireLitU.value = this.lit;
    this.loop?.setVolume(this.lit * 0.9, 0.3);
  }
}
