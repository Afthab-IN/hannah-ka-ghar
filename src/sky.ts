import * as THREE from 'three';
import { U, COMMON_GLSL } from './shaderlib';
import { clamp, lerp } from './noise';

// ---------------------------------------------------------------------------
// Sky dome: analytic atmosphere, sun, moon, clouds and a proper starry night
// (layered stars with colour and twinkle, the Milky Way, shooting stars).
// ---------------------------------------------------------------------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
${COMMON_GLSL}
uniform vec3 uMoonDir;
uniform float uCloudCover;
uniform vec3 uCloudCol;
uniform vec3 uCloudShade;
uniform float uEnvPass;
uniform vec3 uSunDiscCol;

float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 h33(vec3 p) { return vec3(h3(p), h3(p + 31.7), h3(p + 71.3)); }

// one layer of stars: a random point in each cell of a 3D grid around the dome
vec3 starLayer(vec3 dir, float scale, float density, float size, float bright) {
  vec3 p = dir * scale;
  vec3 c = floor(p);
  vec3 r = h33(c);
  if (r.x > density) return vec3(0.0);
  vec3 sp = c + 0.2 + 0.6 * h33(c + 5.0);
  float d = length(p - sp);
  float m = r.y * r.y * r.y; // most stars faint, a few bright
  float core = exp(-d * d / (size * size * (0.5 + m * 1.5)));
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r.z * 4.0) + r.y * 60.0);
  // star colours from warm orange to blue-white
  vec3 col = mix(vec3(1.0, 0.72, 0.48), vec3(0.72, 0.82, 1.0), smoothstep(0.15, 0.85, r.z));
  col = mix(col, vec3(1.0), 0.45);
  return col * core * bright * (0.25 + 2.2 * m) * mix(1.0, tw, 0.8);
}

vec3 starrySky(vec3 dir) {
  vec3 s = vec3(0.0);
  s += starLayer(dir, 140.0, 0.55, 0.09, 1.6);
  s += starLayer(dir, 260.0, 0.6, 0.11, 0.9);
  s += starLayer(dir, 520.0, 0.75, 0.14, 0.55);
  // the Milky Way: a soft band along a tilted great circle with dark dust lanes
  vec3 mwN = normalize(vec3(0.42, 0.38, 0.82));
  float b = dot(dir, mwN);
  vec3 t1 = normalize(cross(mwN, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(mwN, t1);
  vec2 bp = vec2(dot(dir, t1), dot(dir, t2));
  float ang = atan(bp.y, bp.x);
  float width = 0.11 + 0.05 * sin(ang * 2.0 + 1.0);
  float band = exp(-b * b / (width * width));
  float clumps = fbm5(vec2(ang * 5.0, b * 22.0)) ;
  float dust = smoothstep(0.45, 0.7, fbm5(vec2(ang * 9.0 + 3.0, b * 40.0))) * exp(-b * b / (width * width * 0.18));
  float core = 0.6 + 0.8 * exp(-pow(ang - 0.6, 2.0) * 1.2);
  vec3 mw = mix(vec3(0.42, 0.45, 0.62), vec3(0.75, 0.66, 0.58), exp(-b * b / (width * width * 0.3))) * band * (0.25 + clumps * 0.9) * core;
  mw *= 1.0 - dust * 0.75;
  s += mw * 0.32;
  // extra faint stars inside the band
  s += starLayer(dir, 900.0, 0.85, 0.16, 0.7) * band * 1.5;
  return s;
}

// a shooting star every few seconds, somewhere up high
vec3 meteor(vec3 dir) {
  float P = 7.0;
  float k = floor(uTime / P);
  float t = mod(uTime, P);
  float dur = 0.7 + 0.5 * h21(vec2(k, 2.0));
  if (t > dur || h21(vec2(k, 9.0)) > 0.75) return vec3(0.0);
  float az = h21(vec2(k, 1.0)) * 6.2832;
  float el = 0.45 + 0.6 * h21(vec2(k, 3.0));
  vec3 start = normalize(vec3(cos(az) * cos(el), sin(el), sin(az) * cos(el)));
  vec3 side = normalize(cross(start, vec3(0.0, 1.0, 0.0)));
  vec3 tang = normalize(side * (h21(vec2(k, 4.0)) > 0.5 ? 1.0 : -1.0) - vec3(0.0, 0.35, 0.0));
  float prog = t / dur;
  vec3 head = normalize(start + tang * prog * 0.5);
  vec3 tail = normalize(start + tang * max(prog * 0.5 - 0.12, 0.0));
  vec3 ab = head - tail;
  float u = clamp(dot(dir - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float d = length(dir - (tail + ab * u));
  float fade = sin(prog * 3.14159);
  float line = exp(-d * d / 0.0000035) * u * u;
  return vec3(0.85, 0.9, 1.0) * line * fade * 3.0;
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = atmosphere(dir);
  vec3 sd = normalize(uSunDir);
  float cosSun = dot(dir, sd);
  vec3 md = normalize(uMoonDir);
  float cm = dot(dir, md);

  float cov = 0.0;
  vec3 cc = vec3(0.0);
  float fade = 0.0;
  if (dir.y > 0.0) {
    // stretched sunset-style cloud bands
    vec2 cp = dir.xz / (dir.y + 0.1) * 1.1 + uWindDir * uTime * 0.005;
    vec2 cq = vec2(cp.x * 0.75, cp.y * 1.6);
    float n = fbm5(cq * 1.3);
    cov = smoothstep(0.72 - uCloudCover * 0.5, 0.95 - uCloudCover * 0.5, n);
    float n2 = fbm5(cq * 1.3 + normalize(sd.xz + 1e-4) * 0.09);
    float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
    cc = mix(uCloudShade, uCloudCol, lit);
    cc += uSunGlow * pow(max(cosSun, 0.0), 10.0) * (1.0 - cov) * 1.2;
    // moonlit edges at night
    cc += vec3(0.1, 0.12, 0.16) * pow(max(cm, 0.0), 12.0) * uNight * (1.0 - cov) * 2.0;
    fade = smoothstep(0.0, 0.16, dir.y);
  }

  if (uNight > 0.01 && dir.y > -0.02 && uEnvPass < 0.5) {
    float horizonFade = smoothstep(-0.02, 0.18, dir.y);
    vec3 stars = starrySky(dir) + meteor(dir);
    // the moon washes out the faint stars nearby
    stars *= 1.0 - 0.7 * pow(max(cm, 0.0), 30.0);
    col += stars * uNight * horizonFade * (1.0 - cov * fade);
    // moon disc with soft maria, plus a halo
    float disc = smoothstep(0.99962, 0.99975, cm);
    vec3 mt = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
    vec3 mb = cross(mt, md);
    vec2 mp = vec2(dot(dir, mt), dot(dir, mb)) * 50.0;
    float maria = smoothstep(0.45, 0.7, fbm3(mp * 3.0 + 2.0));
    col += vec3(0.95, 0.94, 0.88) * disc * (1.0 - maria * 0.3) * 4.0 * uNight;
    col += vec3(0.32, 0.38, 0.55) * pow(max(cm, 0.0), 80.0) * 0.5 * uNight;
    col += vec3(0.14, 0.17, 0.26) * pow(max(cm, 0.0), 8.0) * 0.25 * uNight;
  }

  if (dir.y > 0.0) {
    col = mix(col, cc, cov * fade * 0.94);
    col = mix(col, uHorizon * 0.9, 0.1 * smoothstep(0.4, 0.8, fbm3(dir.xz / (dir.y + 0.1) * 0.4 + 9.0)) * fade * (1.0 - uNight));
  }

  if (uEnvPass < 0.5) {
    float disc = smoothstep(0.99955, 0.99975, cosSun);
    col += uSunDiscCol * disc * smoothstep(-0.02, 0.01, dir.y) * (1.0 - cov * fade * 0.8);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildSkyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: { ...U, uSunDiscCol: { value: new THREE.Color(40, 34, 26) } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}

// ---------------------------------------------------------------------------
// Time of day, keyed by sun elevation (degrees) and blended.
// ---------------------------------------------------------------------------
interface SkyKey {
  e: number;
  zen: string; hor: string; glow: string; ground: string;
  sky: number;
  sun: string; sunI: number;
  cloud: string; shade: string; cloudI: number;
  fog: number;
  env: number;
  exposure: number;
}

const KEYS: SkyKey[] = [
  { e: -30, zen: '#040918', hor: '#0d1830', glow: '#0c1428', ground: '#05080a', sky: 1.0, sun: '#000000', sunI: 0, cloud: '#1a2236', shade: '#080c16', cloudI: 1, fog: 0.0012, env: 1.5, exposure: 1.7 },
  { e: -11, zen: '#0a1432', hor: '#24305a', glow: '#382a52', ground: '#0a0e10', sky: 1.0, sun: '#000000', sunI: 0, cloud: '#343456', shade: '#121428', cloudI: 1, fog: 0.0013, env: 1.2, exposure: 1.55 },
  { e: -4, zen: '#24346a', hor: '#c27a70', glow: '#e07a50', ground: '#1c1e16', sky: 1.0, sun: '#ff6a36', sunI: 0.0, cloud: '#9a6e8a', shade: '#3a3458', cloudI: 1, fog: 0.0011, env: 1.0, exposure: 1.2 },
  { e: 1.5, zen: '#4a5c9c', hor: '#f4a26a', glow: '#ff9a50', ground: '#2c3218', sky: 1.0, sun: '#ff9c5a', sunI: 3.0, cloud: '#e8a6a0', shade: '#6e5a86', cloudI: 1.1, fog: 0.0012, env: 0.95, exposure: 1.02 },
  { e: 7, zen: '#4a70b2', hor: '#f0c098', glow: '#ffc080', ground: '#3a4420', sky: 1.05, sun: '#ffc68a', sunI: 4.4, cloud: '#ffd8bc', shade: '#8a8098', cloudI: 1.15, fog: 0.0011, env: 0.85, exposure: 0.92 },
  { e: 20, zen: '#4474ba', hor: '#d8d8c8', glow: '#ffe2b8', ground: '#4a5428', sky: 1.1, sun: '#ffe8c8', sunI: 4.8, cloud: '#ffffff', shade: '#a0a2b0', cloudI: 1.25, fog: 0.0010, env: 0.68, exposure: 0.8 },
  { e: 45, zen: '#3d6fb8', hor: '#cfdbe0', glow: '#fff0d8', ground: '#4e5a2a', sky: 1.15, sun: '#fff4e4', sunI: 5.2, cloud: '#ffffff', shade: '#a8aeba', cloudI: 1.35, fog: 0.0009, env: 0.62, exposure: 0.76 },
  { e: 70, zen: '#3a6cb4', hor: '#cfd9de', glow: '#fff4e6', ground: '#4e5a2a', sky: 1.15, sun: '#fff6ea', sunI: 5.4, cloud: '#ffffff', shade: '#aab0ba', cloudI: 1.35, fog: 0.0009, env: 0.62, exposure: 0.75 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function lerpHex(out: THREE.Color, a: string, b: string, t: number, scale = 1) {
  tmpA.set(a); tmpB.set(b);
  out.copy(tmpA).lerp(tmpB, t).multiplyScalar(scale);
}

export interface SkyState {
  hour: number;
  sunElev: number;
  exposure: number;
  envIntensity: number;
  lightIntensity: number;
  moonMode: boolean;
}

export const SUNRISE = 6.0, SUNSET = 19.2;
export function sunFromHour(hour: number) {
  const span = SUNSET - SUNRISE;
  const e = 62 * Math.sin((Math.PI * (hour - SUNRISE)) / span);
  // the sun rises behind the meadow and sets behind the farmhouse
  const a = THREE.MathUtils.degToRad(160 - ((hour - SUNRISE) / span) * 178);
  return { elev: e, az: a };
}

export class TimeOfDay {
  hour = 18.9;
  target = 18.9;
  cloudCover = 0.42;
  cloudTarget = 0.42;
  state: SkyState = { hour: 18.9, sunElev: 5, exposure: 0.9, envIntensity: 1, lightIntensity: 4, moonMode: false };
  dirty = true;
  changed = true;
  rain = 0;
  rainTarget = 0;
  constructor(public light: THREE.DirectionalLight) {}

  forward = false;
  /** forward: always run the clock ahead (sleeping through the night), never backwards */
  setHour(h: number, instant = false, forward = false) {
    h = ((h % 24) + 24) % 24;
    this.target = h;
    this.forward = forward;
    if (instant) { this.hour = h; this.dirty = true; }
  }

  update(dt: number) {
    let diff = this.target - this.hour;
    if (this.forward) { if (diff < 0) diff += 24; }
    else if (diff > 12) diff -= 24; else if (diff < -12) diff += 24;
    if (this.forward && Math.abs(diff) < 1e-3) this.forward = false;
    if (Math.abs(diff) > 1e-4) {
      const step = diff * (1 - Math.exp(-dt * 1.6));
      this.hour = (((this.hour + (Math.abs(step) < 1e-4 ? diff : step)) % 24) + 24) % 24;
      this.dirty = true;
    }
    const rd = this.rainTarget - this.rain;
    if (Math.abs(rd) > 1e-3) { this.rain += rd * (1 - Math.exp(-dt * 0.35)); this.dirty = true; U.uRain.value = this.rain; }
    const cd = this.cloudTarget - this.cloudCover;
    if (Math.abs(cd) > 1e-4) { this.cloudCover += cd * (1 - Math.exp(-dt * 1.5)); U.uCloudCover.value = this.cloudCover; }
    if (this.dirty) this.apply();
  }

  apply() {
    const h = this.hour;
    // below the horizon the elevation keeps sinking toward midnight
    let elev: number, az: number;
    if (h >= SUNRISE && h <= SUNSET) ({ elev, az } = sunFromHour(h));
    else {
      const sinceSet = h > SUNSET ? h - SUNSET : h + 24 - SUNSET;
      const nightLen = 24 - (SUNSET - SUNRISE);
      elev = -38 * Math.sin((Math.PI * sinceSet) / nightLen);
      az = THREE.MathUtils.degToRad(-18 - (sinceSet / nightLen) * 182);
    }
    const er = THREE.MathUtils.degToRad(elev);
    const sunDir = new THREE.Vector3(Math.cos(er) * Math.sin(az), Math.sin(er), -Math.cos(er) * Math.cos(az)).normalize();
    U.uSunDir.value.copy(sunDir);

    let i = 0;
    while (i < KEYS.length - 2 && elev > KEYS[i + 1].e) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = clamp((elev - a.e) / (b.e - a.e), 0, 1);
    const sky = lerp(a.sky, b.sky, t);
    lerpHex(U.uZenith.value, a.zen, b.zen, t, sky);
    lerpHex(U.uHorizon.value, a.hor, b.hor, t, sky);
    lerpHex(U.uSunGlow.value, a.glow, b.glow, t, 1.0);
    lerpHex(U.uGround.value, a.ground, b.ground, t, 1.0);
    const cloudI = lerp(a.cloudI, b.cloudI, t);
    lerpHex(U.uCloudCol.value, a.cloud, b.cloud, t, cloudI);
    lerpHex(U.uCloudShade.value, a.shade, b.shade, t, 1.0);
    U.uFogDensity.value = lerp(a.fog, b.fog, t);
    // rain: grey, softer sky, thicker haze, dimmer sun
    const r = this.rain;
    if (r > 0.001) {
      const grey = (c: THREE.Color, k: number) => { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; c.lerp(new THREE.Color(l, l, l * 1.05), r * 0.75).multiplyScalar(1 - r * k); };
      grey(U.uZenith.value, 0.25); grey(U.uHorizon.value, 0.15); grey(U.uSunGlow.value, 0.6);
      grey(U.uCloudCol.value, 0.35); grey(U.uCloudShade.value, 0.3);
      U.uFogDensity.value *= 1 + r * 3.0;
      U.uCloudCover.value = this.cloudCover + (0.98 - this.cloudCover) * r;
    }
    const night = clamp((-elev - 3) / 10, 0, 1);
    U.uNight.value = night;
    U.uDay.value = clamp((elev + 3) / 14, 0, 1);
    U.uWindowGlow.value = 1 - THREE.MathUtils.smoothstep(elev, -3, 9);

    // one directional light: the sun by day, the moon by night
    const sunI = lerp(a.sunI, b.sunI, t) * clamp((elev + 0.5) / 2.5, 0, 1);
    const moonDir = new THREE.Vector3(0.38, 0.52, -0.76).normalize();
    U.uMoonDir.value.copy(moonDir);
    const moonI = 1.1 * night;
    const sunCol = new THREE.Color();
    lerpHex(sunCol, a.sun, b.sun, t);
    if (sunI >= moonI) {
      U.uLightDir.value.copy(sunDir.y < 0.03 ? new THREE.Vector3(sunDir.x, 0.03, sunDir.z).normalize() : sunDir);
      this.light.color.copy(sunCol);
      this.light.intensity = sunI * (1 - 0.72 * this.rain);
      this.state.moonMode = false;
    } else {
      U.uLightDir.value.copy(moonDir);
      this.light.color.set('#a4baf0');
      this.light.intensity = moonI;
      this.state.moonMode = true;
    }
    U.uLightCol.value.copy(this.light.color).multiplyScalar(this.light.intensity);
    // indoor bounce: warm by day, nothing at night
    U.uIndoorFill.value.setRGB(0.075, 0.062, 0.046).multiplyScalar(0.25 + 0.75 * U.uDay.value);
    U.uIndoorAmb.value = lerp(0.18, 0.3, U.uDay.value);

    this.state.hour = this.hour;
    this.state.sunElev = elev;
    this.state.exposure = lerp(a.exposure, b.exposure, t);
    this.state.envIntensity = lerp(a.env, b.env, t) * (1 - 0.2 * this.rain);
    this.state.lightIntensity = this.light.intensity;
    this.dirty = false;
    this.changed = true;
  }
}

// PMREM of the sky (no sun disc, no stars), refreshed when the sky changes.
export class SkyEnvironment {
  pmrem: THREE.PMREMGenerator;
  scene = new THREE.Scene();
  rt: THREE.WebGLRenderTarget | null = null;
  constructor(private renderer: THREE.WebGLRenderer, skyMat: THREE.Material) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
    m.frustumCulled = false;
    this.scene.add(m);
  }
  update(): THREE.Texture {
    U.uEnvPass.value = 1;
    const old = this.rt;
    this.rt = this.pmrem.fromScene(this.scene, 0, 0.1, 100, { size: 128 } as any);
    U.uEnvPass.value = 0;
    if (old) old.dispose();
    return this.rt.texture;
  }
}
