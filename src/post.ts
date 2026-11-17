import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export interface GradePreset {
  name: string;
  bloom: number;
  bloomRadius: number;
  contrast: number;
  saturation: number;
  warmth: number; // + warm, - cool
  lift: number; // raises the blacks
  vignette: number;
  shadowTint: [number, number, number];
  highTint: [number, number, number];
  glow: number; // soft diffusion around highlights
}

export const GRADE_PRESETS: GradePreset[] = [
  { name: 'Soft glow', bloom: 0.5, bloomRadius: 0.75, contrast: 1.07, saturation: 1.05, warmth: 0.02, lift: 0.0, vignette: 0.28, shadowTint: [0.0, 0.004, 0.012], highTint: [0.015, 0.006, -0.01], glow: 0.18 },
  { name: 'Golden film', bloom: 0.32, bloomRadius: 0.6, contrast: 1.1, saturation: 1.06, warmth: 0.06, lift: 0.018, vignette: 0.38, shadowTint: [0.01, 0.0, -0.006], highTint: [0.03, 0.012, -0.02], glow: 0.1 },
  { name: 'Clean', bloom: 0.2, bloomRadius: 0.5, contrast: 1.0, saturation: 1.0, warmth: 0.0, lift: 0.0, vignette: 0.15, shadowTint: [0, 0, 0], highTint: [0, 0, 0], glow: 0.0 },
  { name: 'Faded memory', bloom: 0.36, bloomRadius: 0.8, contrast: 0.9, saturation: 0.82, warmth: 0.035, lift: 0.05, vignette: 0.3, shadowTint: [0.01, 0.006, 0.012], highTint: [0.02, 0.01, -0.005], glow: 0.22 },
  { name: 'Vivid', bloom: 0.3, bloomRadius: 0.55, contrast: 1.14, saturation: 1.2, warmth: 0.02, lift: 0.0, vignette: 0.25, shadowTint: [0, 0.004, 0.01], highTint: [0.01, 0.004, -0.01], glow: 0.05 },
];

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uWarmth: { value: 0 },
    uLift: { value: 0 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.35 },
    uShadowTint: { value: new THREE.Vector3() },
    uHighTint: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uContrast, uSaturation, uWarmth, uLift, uVignette, uGrain;
    uniform vec3 uShadowTint, uHighTint;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      // a hint of lateral chromatic aberration at the frame edges
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // already display-referred (after tone mapping)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col += uShadowTint * (1.0 - smoothstep(0.0, 0.5, l)) + uHighTint * smoothstep(0.45, 1.0, l);
      col += vec3(uWarmth, uWarmth * 0.35, -uWarmth * 0.6);
      col = col * (1.0 - uLift) + uLift;
      float vig = smoothstep(0.85, 0.2, length(c * vec2(1.0, 0.85)) * 1.25);
      col *= mix(1.0, vig, uVignette);
      // film grain, luminance weighted, re-seeded every frame
      float gr = hash(vUv * uRes + fract(uTime * 7.31) * 913.0) + hash(vUv * uRes * 1.37 - fract(uTime * 3.17) * 377.0) - 1.0;
      col += gr * uGrain * 0.085 * (0.35 + 0.65 * (1.0 - abs(l - 0.45) * 1.6));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export function buildPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.7, 2.2);
  composer.addPass(bloom);
  // bloom is soft by nature: run its blur chain at half resolution
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (bw: number, bh: number) => bloomSetSize(Math.max(1, Math.round(bw / 2)), Math.max(1, Math.round(bh / 2)));
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const setPreset = (p: GradePreset) => {
    bloom.strength = p.bloom;
    bloom.radius = p.bloomRadius;
    const u = grade.uniforms as any;
    u.uContrast.value = p.contrast;
    u.uSaturation.value = p.saturation;
    u.uWarmth.value = p.warmth;
    u.uLift.value = p.lift;
    u.uVignette.value = p.vignette;
    u.uShadowTint.value.set(...p.shadowTint);
    u.uHighTint.value.set(...p.highTint);
  };
  const setSize = (w2: number, h2: number) => {
    composer.setSize(w2, h2);
    (grade.uniforms as any).uRes.value.set(w2 * renderer.getPixelRatio(), h2 * renderer.getPixelRatio());
  };
  return { composer, bloom, grade, setPreset, setSize };
}
