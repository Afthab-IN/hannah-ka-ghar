import * as THREE from 'three';
import { U, MAX_ROOMS } from './shaderlib';
import { W } from './world';
import { buildTerrain, heightAt, inPond, WATER_Y } from './world/terrain';
import { START, WALK_BOUND } from './world/layout';
import { buildSkyDome, TimeOfDay, SkyEnvironment } from './sky';
import { buildPost, GRADE_PRESETS } from './post';
import { Player } from './player';
import { UI, type Place } from './ui';
import { buildEverything, PLACES } from './scene';

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && /Mac|iPad/.test(navigator.userAgent));
const quality = (params.get('q') || (isTouch ? 'med' : 'high')) as 'low' | 'med' | 'high';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const maxDpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);
let dpr = Math.min(maxDpr, quality === 'low' ? 0.85 : quality === 'med' ? 1.0 : 1.25);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 6000);
W.scene = scene;
W.camera = camera;

function indoorAtCPU(p: THREE.Vector3) {
  for (let i = 0; i < MAX_ROOMS; i++) {
    const a = U.uRoomMin.value[i], b = U.uRoomMax.value[i];
    if (p.x > a.x && p.x < b.x && p.y > a.y && p.y < b.y && p.z > a.z && p.z < b.z) return 1;
  }
  return 0;
}

async function init() {
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // ---- land + physics ----
  const terrain = buildTerrain(quality);
  scene.add(terrain);
  W.physics.terrain = heightAt;
  W.physics.water = (x, z) => inPond(x, z) && heightAt(x, z) < WATER_Y - 0.35;
  W.physics.bound = { x: WALK_BOUND.x, z: WALK_BOUND.z, r: WALK_BOUND.r };

  // ---- sky + light ----
  const sky = buildSkyDome();
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 4);
  sun.castShadow = true;
  const smap = quality === 'high' ? 4096 : quality === 'med' ? 2048 : 1024;
  sun.shadow.mapSize.set(smap, smap);
  const SH = 42;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -SH; sc.right = SH; sc.top = SH; sc.bottom = -SH; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const tod = new TimeOfDay(sun);
  W.tod = tod;
  const startHour = params.has('hour') ? parseFloat(params.get('hour')!) : 18.95;
  tod.setHour(startHour, true);
  const env = new SkyEnvironment(renderer, sky.material as THREE.Material);
  scene.environment = env.update();

  // ---- everything on the farm ----
  const built = await buildEverything({ renderer, quality, sun });

  // ---- player ----
  const player = new Player(camera, canvas);
  player.place(START.x, START.z, START.yaw);
  player.update(0);

  // ---- post ----
  const post = buildPost(renderer, scene, camera, window.innerWidth, window.innerHeight);
  post.setPreset({ ...GRADE_PRESETS[0], bloom: 0.42, glow: 0.12, vignette: 0.32, warmth: 0.015 });
  (post.grade.uniforms as any).uGrain.value = 0.18;

  // ---- UI ----
  const cycle = { on: !params.has('hour'), speed: 1 / 75 }; // game hours per real second (a day in 30 min)
  const ui = new UI({
    start: () => {
      W.audio.unlock();
      player.active = true;
      if (!isTouch) canvas.requestPointerLock?.();
      ui.showPause(false);
    },
    getHour: () => tod.hour,
    setHour: (h) => tod.setHour(h),
    cycle,
    setSound: (on) => W.audio.setEnabled(on),
    travel: (p: Place) => {
      if (player.mount) player.stand();
      player.place(p.x, p.z, p.yaw);
      if (p.y !== undefined) player.pos.y = W.physics.groundAt(p.x, p.z, p.y + 0.5);
      if (!isTouch) canvas.requestPointerLock?.();
    },
    places: PLACES,
    use: () => useOrEat(),
    jump: () => player.jump(),
  }, isTouch);
  W.toast = (m) => ui.toast(m);
  // things in your hand (bread from the bakery): shown bottom right, E with nothing targeted eats it
  scene.add(camera);
  W.hold = (obj, label) => {
    if (W.held) camera.remove(W.held.obj);
    W.held = obj ? { obj, label: label || 'it' } : null;
    if (obj) {
      obj.position.set(0.3, -0.27, -0.6);
      obj.rotation.set(0.35, -0.5, 0.1);
      obj.traverse((o) => { o.castShadow = false; });
      camera.add(obj);
    }
  };
  const eat = () => {
    if (!W.held) return;
    const what = W.held.label;
    W.hold(null);
    ui.toast(`You eat ${what}. Still warm. Delicious.`);
  };
  const useOrEat = () => { if (W.interact.target) W.interact.use(); else eat(); };
  player.onUseRequest = useOrEat;
  player.onTapPick = (nx, ny) => {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const it = W.interact.pick(rc.ray.origin, rc.ray.direction);
    if (it) W.interact.use(it);
  };
  document.addEventListener('pointerlockchange', () => ui.showPause(!document.pointerLockElement && player.active && !ui.panelOpen()));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyT' && player.active) { tod.setHour(tod.target + 1); }
  });

  // ambience beds
  const birds = W.audio.loop('birds_day', { volume: 0 });
  const wind = W.audio.loop('wind_meadow', { volume: 0.25 });
  const crickets = W.audio.loop('crickets_night', { volume: 0 });

  // ---- resize ----
  const onResize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    post.composer.setPixelRatio(dpr);
    post.setSize(w, h);
    built.onResize?.(w * dpr, h * dpr);
  };
  window.addEventListener('resize', onResize);
  onResize();

  // debug view from the URL: ?view=x,y,z,yaw,pitch
  if (params.has('view')) {
    const [x, y, z, yaw, pitch] = params.get('view')!.split(',').map(Number);
    const g = W.physics.groundAt(x, z, y - 0.9);
    player.free = y - g > 2.6;
    player.pos.set(x, player.free ? y - 1.62 : g, z);
    player.yaw = yaw || 0; player.pitch = pitch || 0;
  }

  // ---- loop ----
  const clock = new THREE.Timer();
  let envTimer = 0;
  let frames = 0, acc = 0, slowFor = 0, fastFor = 0, lockedUp = false;
  const stats = { fps: 0, ms: 0, dpr, calls: 0, tris: 0 };
  const camDir = new THREE.Vector3();
  let ambTimer = 0;
  let indoorAdapt = 0;
  let owlT = 30;
  const owlSpots = [new THREE.Vector3(-18, 9, -24), new THREE.Vector3(17, 9, -27), new THREE.Vector3(-46, 8, -14), new THREE.Vector3(62, 8, -8)];
  // shadows refresh every other frame: swaying leaves read the same at 30 Hz
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  let shadowTick = 0;
  const frame = () => {
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.1);
    U.uTime.value += dt;
    const time = U.uTime.value;
    if (cycle.on && player.active) tod.setHour(tod.target + dt * cycle.speed, true);
    tod.update(dt);
    (sky.material as THREE.ShaderMaterial).uniforms.uSunDiscCol.value.copy(sun.color).multiplyScalar(11);

    envTimer -= dt;
    if (tod.changed && envTimer <= 0) {
      scene.environment = env.update();
      tod.changed = false;
      envTimer = 0.25;
    }
    scene.environmentIntensity = tod.state.envIntensity;
    // eyes adjust when you step inside
    const inside = indoorAtCPU(camera.position);
    indoorAdapt += (inside - indoorAdapt) * (1 - Math.exp(-dt * 2.2));
    renderer.toneMappingExposure = tod.state.exposure * (1 + indoorAdapt * (0.9 + 0.6 * U.uNight.value));

    player.update(dt);

    // shadow box follows the player, snapped to texels so edges don't crawl
    const L = U.uLightDir.value;
    const fwd = camDir.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
    const cx = camera.position.x + fwd.x * SH * 0.45, cz = camera.position.z + fwd.z * SH * 0.45;
    const texel = (SH * 2) / smap;
    sun.target.position.set(Math.round(cx / texel) * texel, heightAt(cx, cz), Math.round(cz / texel) * texel);
    sun.position.copy(sun.target.position).addScaledVector(L, 160);
    sun.target.updateMatrixWorld();

    for (const f of W.updaters) f(dt, time);
    W.lamps.update(dt, camera.position, time);
    W.audio.updateListener(camera);

    // ambience: birds by day, crickets by night
    ambTimer -= dt;
    if (ambTimer <= 0) {
      ambTimer = 0.5;
      const night = U.uNight.value, day = U.uDay.value;
      birds.setVolume(0.55 * day * (1 - night), 1.5);
      crickets.setVolume(0.5 * night, 1.5);
      wind.setVolume(0.18 + 0.1 * night, 1.5);
    }
    // an owl in the oaks now and then after dark
    owlT -= dt;
    if (owlT < 0) {
      owlT = 45 + Math.random() * 60;
      if (U.uNight.value > 0.6) W.audio.play('owl', { pos: owlSpots[Math.floor(Math.random() * owlSpots.length)], volume: 0.7, ref: 6, max: 160 });
    }

    // what is under the crosshair
    if (player.active && !player.mount) {
      const it = W.interact.update(camera.position, camDir.set(0, 0, -1).applyQuaternion(camera.quaternion));
      ui.setTarget(it ? W.interact.labelOf(it) : W.held ? `Eat ${W.held.label}` : null);
    } else ui.setTarget(null);
    ui.tick(tod.hour, U.uNight.value);

    shadowTick++;
    if (shadowTick % 2 === 0 || tod.dirty || player.running) renderer.shadowMap.needsUpdate = true;
    built.beforeRender?.(camera);
    (post.grade.uniforms as any).uTime.value = time;
    renderer.info.reset();
    post.composer.render(dt);
    stats.calls = renderer.info.render.calls;
    stats.tris = renderer.info.render.triangles;

    frames++; acc += dt;
    if (acc >= 1) {
      stats.fps = frames / acc;
      stats.ms = (acc / frames) * 1000;
      if (stats.fps < 42 && dpr > 0.75) { slowFor++; fastFor = 0; if (slowFor >= 2) { dpr = Math.max(0.75, dpr - 0.15); stats.dpr = dpr; onResize(); slowFor = 0; lockedUp = true; } }
      else if (stats.fps > 58 && dpr < maxDpr && !lockedUp) { fastFor++; slowFor = 0; if (fastFor >= 3) { dpr = Math.min(maxDpr, dpr + 0.15); stats.dpr = dpr; onResize(); fastFor = 0; } }
      else { slowFor = 0; fastFor = 0; }
      frames = 0; acc = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  document.getElementById('loader')?.classList.add('done');
  (window as any).__meadow = {
    W, U, sun, sky, terrain, env, renderer, scene, camera, tod, player, stats, post, ui, built, heightAt,
    setDpr: (v: number) => { dpr = v; stats.dpr = v; lockedUp = true; onResize(); },
    // y = eye height. Near the ground the player stands on whatever is below; high up it is a free camera.
    view: (x: number, y: number, z: number, yaw: number, pitch: number) => {
      const g = W.physics.groundAt(x, z, y - 0.9);
      player.free = y - g > 2.6;
      player.pos.set(x, player.free ? y - 1.62 : g, z);
      player.yaw = yaw; player.pitch = pitch; player.update(0);
    },
  };
}

init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loader');
  if (l) l.innerHTML = `<div class="ld-word">Hannah ka Ghar</div><div class="ld-sub">Could not start: ${String(e?.message || e)}</div>`;
});
