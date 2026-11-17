import * as THREE from 'three';
import { W } from '../../world';
import { M } from '../materials';
import { WINDMILL } from '../../world/layout';
import { heightAt, padHeightAt } from '../../world/terrain';
import { VBuilder, V, mat4, vcolMat, Atlas, paintBoard, SERIF_FONT } from './util';

// An American farm water-pumping windmill on the hill behind the barn: a
// steel lattice tower, an 18-blade wheel that turns, a tail vane, and a round
// galvanised stock tank.

const at = (x: number, y: number, z: number, yaw = 0) => mat4({ x, y, z }, { x: 0, y: yaw, z: 0 });

export function buildWindmill() {
  const cx = WINDMILL.x, cz = WINDMILL.z;
  const g = padHeightAt(cx, cz);
  const metal = vcolMat({ metal: 0.6, rough: 0.45, noise: 0.14 });
  const t = new VBuilder('windmill-tower');
  const steel = '#9da3a6', dark = '#6f7477';
  const TH = 9.8, B = 1.25, TT = 0.3;

  // ---- tower: four legs, girts, X braces, ladder, platform ----
  const corner = (i: number, y: number) => {
    const k = B + (TT - B) * (y / TH);
    const sx = i === 0 || i === 3 ? -1 : 1, sz = i < 2 ? -1 : 1;
    return V(cx + sx * k, g + y, cz + sz * k);
  };
  for (let i = 0; i < 4; i++) t.beam(steel, corner(i, -0.3), corner(i, TH), 0.08, 0.08);
  const girts = [0.35, 2.3, 4.1, 5.75, 7.2, 8.5, 9.5];
  for (let gi = 0; gi < girts.length; gi++) {
    const y = girts[gi];
    for (let i = 0; i < 4; i++) {
      t.beam(dark, corner(i, y), corner((i + 1) % 4, y), 0.05, 0.05);
      if (gi < girts.length - 1) {
        const y2 = girts[gi + 1];
        t.rod(dark, corner(i, y), corner((i + 1) % 4, y2), 0.012, 4);
        t.rod(dark, corner((i + 1) % 4, y), corner(i, y2), 0.012, 4);
      }
    }
  }
  // ladder up the south face
  {
    const steps = 26;
    for (const s of [-1, 1]) {
      const a = V(cx + s * 0.2, g, cz + B + 0.05), b = V(cx + s * 0.15, g + 9.3, cz + TT + 0.05 + (B - TT) * (0.5 / TH));
      t.rod(steel, a, b, 0.018, 5);
    }
    for (let k = 1; k < steps; k++) {
      const y = (k / steps) * 9.3, kz = B + (TT - B) * (y / TH) + 0.05;
      t.rod(steel, V(cx - 0.19, g + y, cz + kz), V(cx + 0.19, g + y, cz + kz), 0.01, 4);
    }
  }
  // platform
  {
    const y = g + 9.3, s = 0.85;
    for (let k = -3; k <= 3; k++) t.box('#6a5a48', cx + k * 0.24, y, cz, 0.2, 0.04, s * 2);
    t.box(dark, cx, y - 0.04, cz - s, s * 2, 0.06, 0.06);
    t.box(dark, cx, y - 0.04, cz + s, s * 2, 0.06, 0.06);
  }
  // pump rod + pump at the base, pipe to the tank
  t.rod(steel, V(cx, g + 9.9, cz), V(cx, g + 0.9, cz), 0.018, 5);
  t.box('#4d5356', cx, g + 0.45, cz, 0.25, 0.9, 0.25);
  t.add(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8).rotateZ(Math.PI / 2).translate(0.25, 0, 0), '#4d5356', at(cx, g + 0.8, cz));
  const TX = cx + 2.35, TZ = cz + 2.4, TR = 1.3;
  t.rod('#4d5356', V(cx + 0.5, g + 0.8, cz), V(TX - TR * 0.7, g + 0.75, TZ - TR * 0.7), 0.04, 6);
  // footings
  for (let i = 0; i < 4; i++) { const c = corner(i, 0); t.box('#9b968c', c.x, g + 0.05, c.z, 0.45, 0.3, 0.45); W.physics.addCylinder(c.x, c.z, 0.25, g - 0.5, g + 2); }
  W.physics.addBox(cx - 0.18, g, cz - 0.18, cx + 0.18, g + 1, cz + 0.18, { walk: false });

  // ---- stock tank ----
  {
    const tg = heightAt(TX, TZ);
    const h = 0.68;
    const tank = new THREE.CylinderGeometry(TR, TR, h, 64, 1, true);
    const p = tank.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.012 * Math.sin(a * 64); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    tank.computeVertexNormals();
    tank.translate(0, h / 2, 0);
    t.add(tank, '#a8adb0', at(TX, tg, TZ));
    const inner = new THREE.CylinderGeometry(TR - 0.02, TR - 0.02, h, 40, 1, true);
    inner.scale(-1, 1, 1);
    inner.translate(0, h / 2, 0);
    t.add(inner, '#7d8386', at(TX, tg, TZ));
    t.add(new THREE.TorusGeometry(TR, 0.035, 5, 40), '#b9bec1', mat4({ x: TX, y: tg + h, z: TZ }, { x: Math.PI / 2, y: 0, z: 0 }));
    const water = new THREE.CircleGeometry(TR - 0.03, 32);
    water.rotateX(-Math.PI / 2);
    const wm = new THREE.Mesh(water, M.paint('#2c4650', 0.06, 0.45));
    wm.position.set(TX, tg + h - 0.12, TZ);
    wm.receiveShadow = true;
    W.scene.add(wm);
    W.physics.addCylinder(TX, TZ, TR + 0.05, tg - 0.3, tg + h);
    // float valve
    t.add(new THREE.SphereGeometry(0.08, 8, 6), '#c9a24c', at(TX - TR * 0.6, tg + h - 0.1, TZ - TR * 0.4));
  }
  const tm = t.build(metal, { cast: true })!;
  W.scene.add(tm);

  // ---- the head (turns slowly into the breeze) with the wheel and tail ----
  const head = new THREE.Group();
  head.position.set(cx, g + TH + 0.1, cz);
  W.scene.add(head);
  const hb = new VBuilder('windmill-head');
  hb.add(new THREE.CylinderGeometry(0.22, 0.26, 0.18, 14), dark, at(0, 0.09, 0));
  hb.box('#b4b9bc', 0, 0.38, 0.05, 0.42, 0.42, 0.75);
  const nose = new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.rotateX(Math.PI / 2);
  hb.add(nose, '#b4b9bc', at(0, 0.38, 0.42));
  hb.add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).rotateX(Math.PI / 2), dark, at(0, 0.42, 0.65));
  // tail boom (two converging arms) and the vane
  const tailZ = -2.5;
  hb.beam(steel, V(0, 0.5, -0.25), V(0, 0.75, tailZ), 0.06, 0.06);
  hb.beam(steel, V(0, 0.28, -0.25), V(0, 0.5, tailZ), 0.05, 0.05);
  hb.beam(dark, V(0, 0.4, -1.2), V(0, 0.65, -1.2), 0.03, 0.03);
  hb.box('#d6d9da', 0, 0.75, tailZ - 0.55, 0.02, 0.95, 1.3);
  hb.box(dark, 0, 0.75, tailZ - 0.55, 0.035, 1.0, 0.04);
  hb.box(dark, 0, 1.24, tailZ - 0.55, 0.035, 0.04, 1.32);
  hb.box(dark, 0, 0.26, tailZ - 0.55, 0.035, 0.04, 1.32);
  const hm = hb.build(metal, { cast: true })!;
  head.add(hm);
  // name painted on both sides of the vane
  const atlas = new Atlas(512, 256);
  const nr = atlas.region(512, 200, (gg, w, h) => {
    paintBoard(gg, w, h, '#d9dcdc', '#8f2b21', 3);
    gg.fillStyle = '#8f2b21'; gg.textAlign = 'center';
    gg.font = `bold 92px ${SERIF_FONT}`;
    gg.fillText('HANNAH', w / 2, 128);
    gg.font = `bold 34px ${SERIF_FONT}`;
    gg.fillText('KA GHAR', w / 2, 172);
  });
  for (const s of [-1, 1]) atlas.plane(nr, 1.22, 0.48, mat4({ x: s * 0.012, y: 0.78, z: tailZ - 0.55 }, { x: 0, y: s * Math.PI / 2, z: 0 }));
  const am = atlas.build()!;
  head.add(am);

  // ---- the wheel: hub, rings, spokes and 18 pitched blades ----
  const wheel = new THREE.Group();
  wheel.position.set(0, 0.42, 0.9);
  head.add(wheel);
  const wb = new VBuilder('windmill-wheel');
  wb.add(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 12).rotateX(Math.PI / 2), dark, new THREE.Matrix4());
  for (const rr of [0.48, 1.0, 1.48]) wb.add(new THREE.TorusGeometry(rr, 0.016, 4, 48), steel, new THREE.Matrix4());
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    wb.rod(dark, V(Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.08), V(Math.cos(a) * 1.48, Math.sin(a) * 1.48, 0), 0.016, 4);
    wb.rod(dark, V(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.12), V(Math.cos(a + 0.26) * 1.0, Math.sin(a + 0.26) * 1.0, 0), 0.01, 4);
  }
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(1.02, 1, 0.012, 3, 1, 1);
    const p = blade.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), u = (x + 0.51) / 1.02;
      const w = 0.17 + u * 0.15;
      p.setY(k, p.getY(k) * w);
      p.setZ(k, p.getZ(k) + Math.pow(p.getY(k) / (w / 2 || 1), 2) * -0.015); // a little curve across the blade
    }
    blade.computeVertexNormals();
    const m = new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeRotationX(0.55));
    m.setPosition(Math.cos(a) * 0.99, Math.sin(a) * 0.99, 0);
    wb.add(blade, '#cdd1d3', m);
  }
  const wm = wb.build(metal, { cast: true })!;
  wheel.add(wm);

  const baseYaw = -0.12; // wheel faces the farmhouse, a little turned
  let spin = 0;
  W.onUpdate((dt, time) => {
    const gust = 0.65 + 0.35 * Math.sin(time * 0.21) + 0.2 * Math.sin(time * 0.73 + 1.1);
    spin += dt * 1.9 * Math.max(0.25, gust);
    wheel.rotation.z = -spin;
    head.rotation.y = baseYaw + 0.1 * Math.sin(time * 0.05) + 0.04 * Math.sin(time * 0.17);
  });
}
