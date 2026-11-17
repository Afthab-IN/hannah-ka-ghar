import * as THREE from 'three';
import { W } from '../../world';
import { Builder } from '../kit';
import { M } from '../materials';
import * as D from './dims';
import { Frame, type Atlas, type Props, type Shades } from './util';
import { R } from './atlas';
import type { HouseMats } from './mats';
import type { Furniture } from './furniture';

const { X, Z, F, FD } = D;

interface Ctx { b: Builder; m: HouseMats; props: Props; atlas: Atlas; shades: Shades; fu: Furniture }

// ---------------------------------------------------------------------------
// The photoscanned rocking chair: one instance each, rolled on its runners
// while someone sits in it.
// ---------------------------------------------------------------------------
function rockingModel(fu: Furniture, x: number, y: number, z: number, yaw: number) {
  const name = 'Rockingchair_01' as const;
  const i = fu.add(name, x, y, z, yaw);
  const base = fu.matrix(name, x, y, z, yaw);
  const R = 0.9; // runner radius
  const cur = base.clone(), rock = new THREE.Matrix4(), t1 = new THREE.Matrix4(), t2 = new THREE.Matrix4();
  // in the model's own space the sitter faces +z
  const eyeLocal = new THREE.Vector3(0, 1.1, -0.12);
  const eye = new THREE.Vector3();
  W.physics.addCylinder(x, z, 0.38, y, y + 1.0);
  let seated = false, phase = 0, amp = 0, still = true;
  W.onUpdate((dt) => {
    amp += ((seated ? 0.085 : 0) - amp) * (1 - Math.exp(-dt * (seated ? 1.2 : 2.5)));
    if (amp < 1e-4 && !seated) { if (!still) { fu.set(name, i, base); cur.copy(base); still = true; } return; }
    still = false;
    phase += dt * 2.0;
    const th = Math.sin(phase) * amp;
    // rotate about the runners' arc centre, and roll along the floor as it tips
    rock.makeTranslation(0, R, -R * th).multiply(t1.makeRotationX(th)).multiply(t2.makeTranslation(0, -R, 0));
    cur.multiplyMatrices(base, rock);
    fu.set(name, i, cur);
  });
  const at = new THREE.Vector3(0, 0.6, 0).applyMatrix4(base);
  const exit = new THREE.Vector3(0, 0, 0.9).applyMatrix4(base);
  W.interact.add({
    pos: at, radius: 0.42, range: 2.4, label: 'Sit in the rocking chair',
    onUse: () => {
      seated = true;
      W.mount({
        pose: () => ({ pos: eye.copy(eyeLocal).applyMatrix4(cur), yaw }),
        exit, label: 'Rocking gently', yawRange: 1.5,
        onLeave: () => { seated = false; },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// A wooden rocking chair (moving, so plain paint). Local frame faces -z.
// ---------------------------------------------------------------------------
function rockingChair(x: number, y: number, z: number, yaw: number) {
  const wood = M.paint('#7a5233', 0.62);
  const c = new Builder('rocker', false);
  const rockY = (lz: number) => 0.025 + (lz * lz) / 1.8;
  for (const s of [-1, 1]) {
    const n = 6, z0 = -0.46, z1 = 0.5;
    for (let k = 0; k < n; k++) {
      const za = z0 + ((z1 - z0) * k) / n, zb = z0 + ((z1 - z0) * (k + 1)) / n;
      const ya = rockY(za), yb = rockY(zb);
      c.box(wood, s * 0.24, (ya + yb) / 2, (za + zb) / 2, 0.035, 0.045, Math.hypot(zb - za, yb - ya) + 0.01, { rotX: -Math.atan2(yb - ya, zb - za) });
    }
    for (const lz of [-0.19, 0.2]) c.box(wood, s * 0.22, (rockY(lz) + 0.47) / 2, lz, 0.04, 0.47 - rockY(lz), 0.04);
    // arm and its support
    c.box(wood, s * 0.27, 0.68, -0.03, 0.07, 0.03, 0.52);
    c.box(wood, s * 0.27, 0.58, -0.22, 0.035, 0.2, 0.035);
    // back post, leaning back
    const lean = 0.2;
    c.box(wood, s * 0.23, 0.47 + 0.34, 0.21 + 0.34 * Math.tan(lean), 0.045, 0.7, 0.045, { rotX: lean });
  }
  c.box(wood, 0, 0.47, 0.0, 0.5, 0.04, 0.46, { rotX: 0.06 });
  c.box(wood, 0, 0.5, -0.01, 0.44, 0.03, 0.42, { rotX: 0.06 });
  const lean = 0.2, tz = (yy: number) => 0.21 + (yy - 0.47) * Math.tan(lean);
  c.box(wood, 0, 1.12, tz(1.12), 0.52, 0.09, 0.03, { rotX: lean });
  c.box(wood, 0, 0.6, tz(0.6), 0.44, 0.05, 0.025, { rotX: lean });
  for (let i = -2; i <= 2; i++) c.box(wood, i * 0.085, 0.86, tz(0.86), 0.035, 0.48, 0.02, { rotX: lean });
  for (const lz of [-0.19, 0.2]) c.box(wood, 0, 0.16, lz, 0.44, 0.03, 0.03);
  const g = c.build();
  const pivot = new THREE.Group();
  pivot.add(g);
  pivot.position.set(x, y, z);
  pivot.rotation.order = 'YXZ';
  pivot.rotation.y = yaw;
  W.scene.add(pivot);
  W.physics.addCylinder(x, z, 0.36, y, y + 1.1);

  let seated = false, phase = 0, amp = 0;
  const eyeLocal = new THREE.Vector3(0, 1.12, 0.1);
  const eye = new THREE.Vector3();
  W.onUpdate((dt) => {
    amp += ((seated ? 0.085 : 0) - amp) * (1 - Math.exp(-dt * (seated ? 1.2 : 2.5)));
    if (amp < 1e-4 && !seated) { if (pivot.rotation.x !== 0) pivot.rotation.x = 0; return; }
    phase += dt * 2.0;
    pivot.rotation.x = Math.sin(phase) * amp;
  });
  const f = new Frame(x, y, z, yaw);
  W.interact.add({
    pos: f.p(0, 0.6, 0), radius: 0.42, range: 2.4, label: 'Sit in the rocking chair',
    onUse: () => {
      seated = true;
      W.mount({
        pose: () => { pivot.updateMatrixWorld(); return { pos: eye.copy(eyeLocal).applyMatrix4(pivot.matrixWorld), yaw }; },
        exit: f.p(0, 0, -0.85),
        label: 'Rocking gently',
        yawRange: 1.5,
        onLeave: () => { seated = false; },
      });
    },
  });
}

export function buildPorchLife(c: Ctx) {
  const { b, m, props, atlas, shades } = c;
  const bx = (mat: THREE.Material, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, collide: boolean | 'nowalk' = false) =>
    b.boxMinMax(mat, X(Math.min(u0, u1)), Math.min(y0, y1), Z(Math.min(v0, v1)), X(Math.max(u0, u1)), Math.max(y0, y1), Z(Math.max(v0, v1)), { collide });

  // two rocking chairs looking out over the meadow, a little table between
  const wallV = D.D2 + 0.1, PF = D.PORCH_FRONT;
  const rv = wallV + 0.62;
  for (const u of [2.75, 4.0]) {
    if (c.fu.has('Rockingchair_01')) rockingModel(c.fu, X(u), FD, Z(rv), Math.PI);
    else rockingChair(X(u), FD, Z(rv), Math.PI);
  }
  {
    const tx = X(3.38), tz = Z(rv - 0.1);
    b.cyl(m.woodDark, tx, FD, tz, 0.04, 0.5, { seg: 8 });
    b.cyl(m.woodDark, tx, FD, tz, 0.17, 0.03, { seg: 12 });
    b.cyl(m.woodDark, tx, FD + 0.5, tz, 0.24, 0.035, { seg: 16 });
    W.physics.addCylinder(tx, tz, 0.25, FD, FD + 0.55);
    props.cyl(tx - 0.06, FD + 0.535, tz, 0.065, 0.2, '#f1e7c8');
    props.cyl(tx - 0.06, FD + 0.735, tz, 0.03, 0.02, '#e9d36a');
    props.cyl(tx + 0.1, FD + 0.535, tz + 0.08, 0.035, 0.1, '#efe08a');
    props.cyl(tx + 0.12, FD + 0.535, tz - 0.08, 0.035, 0.1, '#efe08a');
  }

  // hanging lantern in front of the door (comes on at dusk)
  {
    const lu = 0.85, lv = wallV + 0.75;
    const ceil = D.RT - 0.12 - D.RS * (lv - (D.D2 + 0.1));
    const y1 = F + 2.5, y0 = F + 2.16;
    b.cyl(m.iron, X(lu), y1, Z(lv), 0.006, ceil - y1, { seg: 5 });
    b.cyl(m.iron, X(lu), y1 - 0.02, Z(lv), 0.07, 0.04, { seg: 4, rTop: 0.02 });
    for (const [du, dv] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) bx(m.iron, lu + du * 0.09 - 0.012, y0, lv + dv * 0.09 - 0.012, lu + du * 0.09 + 0.012, y1 - 0.02, lv + dv * 0.09 + 0.012);
    bx(m.iron, lu - 0.11, y0 - 0.03, lv - 0.11, lu + 0.11, y0, lv + 0.11);
    bx(m.iron, lu - 0.11, y1 - 0.05, lv - 0.11, lu + 0.11, y1 - 0.02, lv + 0.11);
    const lamp = W.lamps.add(new THREE.Vector3(X(lu), y0 + 0.16, Z(lv)), '#ffc27a', 3.2, 7.5, { nightOnly: true });
    shades.add(lamp, new THREE.BoxGeometry(0.17, y1 - y0 - 0.06, 0.17).translate(X(lu), (y0 + y1) / 2 - 0.02, Z(lv)), 1.3);
    shades.bulb(lamp, X(lu), y0 + 0.15, Z(lv), 0.035, 2.4);
  }
  // wall lantern by the back door
  {
    const lu = D.BACK_DOOR_U + 0.75, lv = -D.D2 - 0.1, y = F + 1.95;
    bx(m.iron, lu - 0.05, y - 0.2, lv - 0.03, lu + 0.05, y + 0.15, lv);
    bx(m.iron, lu - 0.1, y + 0.12, lv - 0.2, lu + 0.1, y + 0.16, lv - 0.02);
    const lamp = W.lamps.add(new THREE.Vector3(X(lu), y, Z(lv - 0.14)), '#ffc27a', 2.6, 6.5, { nightOnly: true });
    shades.add(lamp, new THREE.BoxGeometry(0.14, 0.22, 0.14).translate(X(lu), y, Z(lv - 0.12)), 1.3);
  }

  // the name board, hung from the porch beam over the steps
  {
    const w = 1.1, h = 0.31;
    const yTop = D.BEAM_BOT - 0.1;
    for (const s of [-1, 1]) {
      b.cyl(m.iron, X(s * 0.42), yTop - 0.01, Z(D.BEAM_V), 0.006, 0.12, { seg: 4 });
      props.ball(X(s * 0.42), yTop, Z(D.BEAM_V), 0.014, 0.014, 0.014, '#2a2a2a');
    }
    atlas.box(X(0), yTop - h / 2, Z(D.BEAM_V), w, h, 0.035, [R.wood, R.wood, R.wood, R.wood, R.sign, R.signBack]);
    // a little gooseneck barn light on the beam so the board reads after dark
    const gy = D.BEAM_TOP - 0.02, gv = D.BEAM_V + 0.09;
    b.box(m.iron, X(0), gy - 0.04, Z(gv + 0.01), 0.05, 0.08, 0.02, { collide: false });
    b.box(m.iron, X(0), gy + 0.02, Z(gv + 0.12), 0.018, 0.018, 0.24, { rotX: -0.35, collide: false });
    b.cyl(m.iron, X(0), gy - 0.05, Z(gv + 0.25), 0.07, 0.06, { seg: 10, rTop: 0.02 });
    const signLamp = W.lamps.add(new THREE.Vector3(X(0), gy - 0.1, Z(gv + 0.32)), '#ffd09a', 1.8, 2.6, { nightOnly: true });
    shades.add(signLamp, new THREE.CylinderGeometry(0.05, 0.05, 0.01, 10).translate(X(0), gy - 0.055, Z(gv + 0.25)), 2.0);
  }

  // doormat, ferns by the door, pumpkins by the steps
  props.box(X(0), FD + 0.006, Z(wallV + 0.38), 0.95, 0.012, 0.5, '#9a7b4f');
  const fern = (u: number, v: number) => {
    props.cyl(X(u), FD, Z(v), 0.19, 0.34, '#e9e4d8');
    props.cyl(X(u), FD + 0.34, Z(v), 0.205, 0.04, '#e9e4d8');
    props.ball(X(u), FD + 0.46, Z(v), 0.22, 0.16, 0.22, '#4a7236');
    // arching fronds: long thin leaves tipped outward and down
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
      const d = 0.2 + (i % 3) * 0.04;
      props.ball(X(u + Math.sin(a) * d), FD + 0.5 - (i % 3) * 0.04, Z(v + Math.cos(a) * d), 0.045, 0.025, 0.24, i % 2 ? '#4f7a3a' : '#5e8a44', a, 0.45 + (i % 3) * 0.12);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      props.ball(X(u + Math.sin(a) * 0.08), FD + 0.62, Z(v + Math.cos(a) * 0.08), 0.04, 0.025, 0.2, '#5e8a44', a, -0.5);
    }
    W.physics.addCylinder(X(u), Z(v), 0.24, FD, FD + 0.6);
  };
  fern(-0.92, wallV + 0.28);
  fern(0.92, wallV + 0.28);
  const pumpkin = (u: number, v: number, r: number, col = '#d9772b') => {
    props.ball(X(u), FD + r * 0.68, Z(v), r, r * 0.7, r, col);
    props.cyl(X(u), FD + r * 1.3, Z(v), 0.018, 0.08, '#6b5a2e', 0, 0.2, 0.1);
  };
  pumpkin(1.42, PF - 0.42, 0.17);
  pumpkin(1.72, PF - 0.36, 0.12, '#e6a04a');
  pumpkin(1.55, PF - 0.68, 0.1, '#efe6d0');
  pumpkin(-1.4, PF - 0.4, 0.15);
  W.physics.addCylinder(X(1.55), Z(PF - 0.48), 0.28, FD, FD + 0.3);
  W.physics.addCylinder(X(-1.4), Z(PF - 0.4), 0.17, FD, FD + 0.3);

  // a bench on the east porch
  {
    const f = new Frame(X(D.W2 + 0.1 + 0.52), FD, Z(0.6), -Math.PI / 2);
    const w = 1.5;
    for (let k = 0; k < 4; k++) f.box(b, m.woodLight, 0, 0.45, -0.18 + k * 0.11, w, 0.03, 0.09);
    for (let k = 0; k < 3; k++) f.box(b, m.woodLight, 0, 0.62 + k * 0.12, 0.2, w, 0.07, 0.025, 0.12);
    for (const s of [-1, 1]) {
      f.box(b, m.woodDark, s * (w / 2 - 0.06), 0.22, -0.15, 0.05, 0.44, 0.05);
      f.box(b, m.woodDark, s * (w / 2 - 0.06), 0.45, 0.2, 0.05, 0.9, 0.05, 0.12);
      f.box(b, m.woodDark, s * (w / 2 - 0.02), 0.66, 0.0, 0.05, 0.03, 0.42);
    }
    f.solid(w, 0.9, 0.5);
    const seatPos = f.p(0, 0.5, 0);
    W.interact.add({
      pos: seatPos, radius: 0.5, range: 2.4, label: 'Sit on the bench',
      onUse: () => W.mount({ pose: () => ({ pos: f.p(0.2, 1.1, 0.05), yaw: -Math.PI / 2 }), exit: f.p(0, 0, -0.75), label: 'Sitting', yawRange: 1.5 }),
    });
    props.box(X(D.W2 + 0.6), FD + 0.5, Z(0.15), 0.36, 0.08, 0.36, '#c9a46a', 0.2);
  }
}

