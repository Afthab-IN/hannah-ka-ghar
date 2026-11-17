import * as THREE from 'three';
import { U } from '../shaderlib';
import { W } from '../world';
import { mulberry32 } from '../noise';

// Soft wood smoke from a chimney: GPU puffs that rise, grow and drift with the
// wind. `active` (0..1) fades it in and out (e.g. only while a fire is lit).

export class Smoke {
  points: THREE.Points;
  active = 1;
  private mat: THREE.ShaderMaterial;
  constructor(pos: THREE.Vector3, opts: { count?: number; size?: number; rise?: number } = {}) {
    const N = opts.count ?? 46;
    const rnd = mulberry32(Math.floor(pos.x * 13 + pos.z * 7));
    const seeds = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { seeds[i * 3] = rnd(); seeds[i * 3 + 1] = rnd(); seeds[i * 3 + 2] = rnd(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.uTime, uWindDir: U.uWindDir, uLightCol: U.uLightCol, uHorizon: U.uHorizon, uNight: U.uNight,
        uOrigin: { value: pos.clone() }, uActive: { value: 1 }, uPx: { value: 1 }, uSize: { value: opts.size ?? 1 }, uRise: { value: opts.rise ?? 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uActive, uPx, uSize, uRise;
        uniform vec2 uWindDir;
        uniform vec3 uOrigin;
        varying float vA;
        varying float vT;
        void main() {
          float life = 7.0 + aSeed.x * 4.0;
          float t = mod(uTime + aSeed.y * life, life) / life;
          vec3 p = uOrigin;
          p.y += t * 7.0 * uRise;
          p.xz += uWindDir * t * t * 6.0 + vec2(sin(t * 6.0 + aSeed.z * 9.0), cos(t * 5.0 + aSeed.x * 7.0)) * t * 0.7;
          vT = t;
          vA = smoothstep(0.0, 0.08, t) * (1.0 - t) * uActive;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uPx * uSize * (0.6 + t * 3.2) * 260.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uLightCol, uHorizon;
        uniform float uNight;
        varying float vA;
        varying float vT;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.1, d) * vA * 0.22;
          vec3 col = mix(vec3(0.62, 0.6, 0.58), vec3(0.75, 0.74, 0.72), vT) * (0.35 + 0.65 * min(vec3(1.0), uLightCol * 0.18 + uHorizon * 0.5));
          col *= 1.0 - uNight * 0.7;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 40;
    W.scene.add(this.points);
    W.onUpdate(() => {
      this.mat.uniforms.uActive.value += (this.active - this.mat.uniforms.uActive.value) * 0.02;
      this.mat.uniforms.uPx.value = Math.min(2, window.devicePixelRatio || 1);
      this.points.visible = this.mat.uniforms.uActive.value > 0.01;
    });
  }
}
