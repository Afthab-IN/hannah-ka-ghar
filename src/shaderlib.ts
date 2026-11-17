import * as THREE from 'three';

// Uniforms shared by every patched material. The same {value} objects are
// referenced everywhere, so updating U.x.value once updates all shaders.
export const MAX_LAMPS = 8;
export const MAX_ROOMS = 8;

export const U = {
  uTime: { value: 0 },
  uLightDir: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() }, // active light (sun or moon), points TO the light
  uLightCol: { value: new THREE.Color(1, 1, 1) },
  uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() },
  uMoonDir: { value: new THREE.Vector3(-0.4, 0.5, -0.3).normalize() },
  uZenith: { value: new THREE.Color(0.2, 0.35, 0.6) },
  uHorizon: { value: new THREE.Color(0.8, 0.75, 0.65) },
  uSunGlow: { value: new THREE.Color(1, 0.8, 0.5) },
  uGround: { value: new THREE.Color(0.3, 0.38, 0.2) },
  uFogDensity: { value: 0.0016 },
  uNight: { value: 0 }, // 0 day .. 1 full night
  uDay: { value: 1 }, // daylight amount 0..1
  uCloudCover: { value: 0.45 },
  uCloudCol: { value: new THREE.Color(1, 1, 1) },
  uCloudShade: { value: new THREE.Color(0.5, 0.5, 0.55) },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindAmp: { value: 1.0 },
  uEnvPass: { value: 0 },
  // warm point lamps evaluated in the shader (no three.js lights, so they are cheap)
  uLampPos: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, -999, 0, 0)) }, // xyz, radius (0 = off)
  uLampCol: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3()) },
  // indoor volumes (axis-aligned boxes): ambient is dimmed inside them
  uRoomMin: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector3(9999, 9999, 9999)) },
  uRoomMax: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector3(-9999, -9999, -9999)) },
  uIndoorAmb: { value: 0.32 }, // how much sky ambient reaches inside
  uIndoorFill: { value: new THREE.Color(0.05, 0.04, 0.03) }, // warm bounce light inside by day
  uWindowGlow: { value: 0 }, // 0 day .. 1 night: lit windows
};

// Shared GLSL: the analytic atmosphere used by the sky dome and by the fog.
export const ATMO_GLSL = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec3 uSunDir;
uniform vec3 uGround;
uniform float uFogDensity;
uniform float uNight;
uniform float uDay;

vec3 atmosphere(vec3 dir) {
  float y = dir.y;
  float up = clamp(y, 0.0, 1.0);
  vec3 mid = mix(uZenith * 1.45, uHorizon, 0.3);
  vec3 sky = mix(uHorizon, mid, smoothstep(0.0, 0.3, pow(up, 0.8)));
  sky = mix(sky, uZenith, smoothstep(0.1, 0.9, up));
  sky += uHorizon * 0.16 * exp(-abs(y) * 22.0);
  float sd = max(dot(dir, normalize(uSunDir)), 0.0);
  float horizonBoost = 0.5 + 0.5 * exp(-up * 4.0);
  sky += uSunGlow * (pow(sd, 4.0) * 0.26 + pow(sd, 40.0) * 0.6) * horizonBoost;
  if (y < 0.0) sky = mix(sky, uGround, clamp(-y * 3.0, 0.0, 1.0));
  return sky;
}
`;

export const COMMON_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uLightCol;
uniform vec2 uWindDir;
uniform float uWindAmp;
uniform float uWindowGlow;
${ATMO_GLSL}
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p) { return h21(p.xy + p.z * 17.13); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
float fbm5(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

const LIGHTS_GLSL = /* glsl */ `
uniform vec4 uLampPos[${MAX_LAMPS}];
uniform vec3 uLampCol[${MAX_LAMPS}];
uniform vec3 uRoomMin[${MAX_ROOMS}];
uniform vec3 uRoomMax[${MAX_ROOMS}];
uniform float uIndoorAmb;
uniform vec3 uIndoorFill;
float indoorAt(vec3 p) {
  float k = 0.0;
  for (int i = 0; i < ${MAX_ROOMS}; i++) {
    vec3 a = p - uRoomMin[i];
    vec3 b = uRoomMax[i] - p;
    float e = min(min(min(a.x, b.x), min(a.z, b.z)), min(a.y, b.y));
    k = max(k, smoothstep(-0.02, 0.06, e));
  }
  return k;
}
`;

export const FOG_APPLY_GLSL = /* glsl */ `
{
  vec3 fogRay = vWPos - cameraPosition;
  float fogDist = length(fogRay);
  vec3 fogDir = fogRay / max(fogDist, 1e-4);
  float hAvg = max(0.0, (vWPos.y + cameraPosition.y) * 0.5);
  float dens = uFogDensity * (0.4 + 0.6 * exp(-hAvg * 0.03));
  float fogAmt = 1.0 - exp(-fogDist * dens);
  vec3 fogCol = atmosphere(normalize(vec3(fogDir.x, max(fogDir.y, 0.0) * 0.35 + 0.015, fogDir.z)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogAmt, 0.0, 1.0));
}
`;

const WIND_FN = /* glsl */ `
#ifdef USE_WIND
attribute float aSway;
vec3 windOffset(vec3 wp, float sway, vec3 origin) {
  float ph = dot(origin.xz, vec2(0.071, 0.053));
  float gust = 0.65 + 0.35 * sin(uTime * 0.37 + origin.x * 0.013 + origin.z * 0.009);
  float w = sin(uTime * 1.05 + ph) * 0.55 + sin(uTime * 2.2 + ph * 1.7 + wp.y * 0.35) * 0.22;
  float flutter = sin(uTime * 6.5 + wp.x * 2.1 + wp.z * 1.7) * 0.05 + sin(uTime * 9.1 + wp.x * 3.3 - wp.z * 2.2) * 0.03;
  vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y);
  return (d * (w * gust + 0.35 * gust) + vec3(0.0, flutter, 0.0) + d.zyx * vec3(-1.0, 0.0, 1.0) * flutter) * sway * uWindAmp;
}
#endif
`;

const PROJECT_REPLACE = /* glsl */ `
vec4 oWP = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  oWP = batchingMatrix * oWP;
#endif
#ifdef USE_INSTANCING
  oWP = instanceMatrix * oWP;
#endif
oWP = modelMatrix * oWP;
#ifdef USE_WIND
{
  vec4 io = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    io = instanceMatrix * io;
  #endif
  io = modelMatrix * io;
  oWP.xyz += windOffset(oWP.xyz, aSway, io.xyz);
}
#endif
vWPos = oWP.xyz;
vec4 mvPosition = viewMatrix * oWP;
gl_Position = projectionMatrix * mvPosition;
`;

// Lamps + indoor ambient, injected just before <lights_fragment_end> so it can
// scale the indirect light before three applies it.
const LAMPS_BEFORE_END = /* glsl */ `
{
  #ifdef NO_INDOOR
    float indoorK = 0.0;
  #else
    float indoorK = indoorAt(vWPos);
  #endif
  float ambK = mix(1.0, uIndoorAmb, indoorK);
  irradiance *= ambK;
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    iblIrradiance *= ambK;
    radiance *= mix(1.0, uIndoorAmb * 0.7, indoorK);
  #endif
  irradiance += uIndoorFill * indoorK * 3.14159;
  vec3 wN = inverseTransformDirection(normal, viewMatrix);
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    vec4 lp = uLampPos[i];
    if (lp.w <= 0.0) continue;
    vec3 d = lp.xyz - vWPos;
    float dist = length(d);
    if (dist > lp.w) continue;
    vec3 Ld = d / max(dist, 1e-3);
    float fall = 1.0 - dist / lp.w;
    float att = fall * fall / (1.0 + dist * dist * 0.35);
    float ndl = clamp(dot(wN, Ld) * 0.85 + 0.15, 0.0, 1.0);
    reflectedLight.directDiffuse += uLampCol[i] * att * ndl * material.diffuseColor;
  }
}
`;

export interface PatchOpts {
  key: string;
  wind?: boolean;
  fog?: boolean;
  lamps?: boolean; // default true (needs a lit material with a .diffuseColor material struct)
  vertexHead?: string;
  vertexAfterProject?: string;
  fragHead?: string;
  fragAfterMaps?: string; // after <normal_fragment_maps>: can edit diffuseColor, normal, roughnessFactor, totalEmissiveRadiance
  fragAfterLights?: string; // after <lights_fragment_end>: can edit reflectedLight
  fragBeforeFog?: string;
  extraUniforms?: Record<string, THREE.IUniform>;
  vsReplace?: Array<[string, string]>;
  fsReplace?: Array<[string, string]>;
  defines?: Record<string, string | number | boolean>;
}

export function patchMaterial<T extends THREE.Material>(mat: T, o: PatchOpts): T {
  const fog = o.fog !== false;
  const lamps = o.lamps !== false;
  if (o.wind) (mat as any).defines = { ...(mat as any).defines, USE_WIND: '' };
  if (o.defines) (mat as any).defines = { ...(mat as any).defines, ...o.defines };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, o.extraUniforms || {});
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\n${COMMON_GLSL}\n${WIND_FN}\nvarying vec3 vWPos;\n${o.vertexHead || ''}`);
    for (const [inc, code] of o.vsReplace || []) vs = vs.replace(inc, `${inc}\n${code}`);
    vs = vs.replace('#include <project_vertex>', PROJECT_REPLACE + (o.vertexAfterProject || ''));
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${COMMON_GLSL}\n${LIGHTS_GLSL}\nvarying vec3 vWPos;\n${o.fragHead || ''}`);
    for (const [inc, code] of o.fsReplace || []) fs = fs.replace(inc, `${inc}\n${code}`);
    if (o.fragAfterMaps) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${o.fragAfterMaps}`);
    if (lamps) fs = fs.replace('#include <lights_fragment_end>', `${LAMPS_BEFORE_END}\n#include <lights_fragment_end>`);
    if (o.fragAfterLights) fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${o.fragAfterLights}`);
    fs = fs.replace('#include <fog_fragment>', `${o.fragBeforeFog || ''}\n${fog ? FOG_APPLY_GLSL : ''}`);
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'meadow-' + o.key;
  return mat;
}

// Depth material for shadows that sways with the same wind and respects alpha cut-outs.
export function windDepthMaterial(key: string, map?: THREE.Texture | null, alphaTest = 0): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest });
  return patchMaterial(m, { key: 'depth-' + key, wind: true, fog: false, lamps: false });
}

// Register an indoor volume (dims the sky ambient inside it). Returns the slot.
let roomCount = 0;
export function addIndoorVolume(min: THREE.Vector3, max: THREE.Vector3): number {
  if (roomCount >= MAX_ROOMS) { console.warn('too many indoor volumes'); return -1; }
  U.uRoomMin.value[roomCount].copy(min);
  U.uRoomMax.value[roomCount].copy(max);
  return roomCount++;
}
