import * as THREE from 'three';
import { W } from '../../world';
import { M } from '../materials';
import { Builder, makeDoor } from '../kit';
import { GARDEN, GREENHOUSE } from '../../world/layout';
import { heightAt, padHeightAt } from '../../world/terrain';
import { VBuilder, V, rng, mat4, beam, greenhouseGlass, mergeMesh, castOnly } from './util';

// Kitchen garden (raised beds, scarecrow, picket fence, rose arbor over the
// gate) and a white-framed glass greenhouse with potting benches.

const at = (x: number, y: number, z: number, yaw = 0) => mat4({ x, y, z }, { x: 0, y: yaw, z: 0 });
const C = (h: string) => new THREE.Color(h);

export function buildGarden() {
  const white = M.trim('#f4f3ee');
  const brick = M.brick('#a4563a');
  const fb = new Builder('garden-frame'); // white picket fence + greenhouse frame + brick
  const st = new VBuilder('garden-static'); // beds, scarecrow, pots, benches (cast)
  const pl = new VBuilder('garden-plants', true); // everything green that sways
  const glassGeos: THREE.BufferGeometry[] = [];
  garden(fb, st, pl, white);
  greenhouse(fb, st, pl, white, brick, glassGeos);
  const fg = fb.build();
  castOnly(fg, [white, brick]);
  W.scene.add(fg);
  const sm = st.build(undefined, { cast: true });
  if (sm) W.scene.add(sm);
  const pm = pl.build(undefined, { cast: false });
  if (pm) W.scene.add(pm);
  const gm = mergeMesh(glassGeos, greenhouseGlass());
  gm.renderOrder = 2;
  W.scene.add(gm);
}

// ---------------------------------------------------------------------------
// plant helpers (base point at the soil, all into the swaying builder)
// ---------------------------------------------------------------------------
/** A double-sided ribbon through points (horizontal width per point): corn leaves, fronds. */
function leafStrip(pts: THREE.Vector3[], widths: number[]) {
  const pos: number[] = [];
  const side = (p: THREE.Vector3, i: number) => {
    const d = (pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)])).setY(0);
    const n = d.lengthSq() > 1e-8 ? V(-d.z, 0, d.x).normalize() : V(1, 0, 0);
    return [p.clone().addScaledVector(n, widths[i] / 2), p.clone().addScaledVector(n, -widths[i] / 2)];
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, a1] = side(pts[i], i), [b0, b1] = side(pts[i + 1], i + 1);
    for (const t of [[a0, b0, b1], [a0, b1, a1], [a0, b1, b0], [a0, a1, b1]]) for (const v of t) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const swayUp = (h: number, amt: number) => (p: THREE.Vector3) => Math.max(0, p.y / h) * amt;

function lettuce(pl: VBuilder, x: number, y: number, z: number, r: () => number) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, outer = i < 5;
    const d = outer ? 0.08 : 0.03, s = outer ? 0.075 : 0.055;
    const g = new THREE.IcosahedronGeometry(1, 0);
    pl.add(g, C(outer ? '#6ea83c' : '#a7d45c').multiplyScalar(0.85 + r() * 0.3), mat4({ x: x + Math.cos(a) * d, y: y + (outer ? 0.04 : 0.08), z: z + Math.sin(a) * d }, { x: outer ? 0.6 : 0.2, y: -a, z: 0 }, { x: s, y: s * 0.55, z: s * 1.2 }), 0.02);
  }
}

function cabbage(pl: VBuilder, x: number, y: number, z: number, r: () => number) {
  const head = new THREE.IcosahedronGeometry(0.12, 1);
  pl.add(head, C('#9cc4a0').multiplyScalar(0.9 + r() * 0.2), at(x, y + 0.11, z), 0.0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r();
    const g = new THREE.IcosahedronGeometry(1, 0);
    pl.add(g, C('#4f8a5b').multiplyScalar(0.85 + r() * 0.3), mat4({ x: x + Math.cos(a) * 0.14, y: y + 0.06, z: z + Math.sin(a) * 0.14 }, { x: 0.5, y: -a, z: 0 }, { x: 0.13, y: 0.04, z: 0.16 }), 0.02);
  }
}

function carrot(pl: VBuilder, st: VBuilder, x: number, y: number, z: number, r: () => number) {
  st.add(new THREE.CylinderGeometry(0.018, 0.012, 0.03, 6), '#e07b26', at(x, y + 0.01, z));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r(), t = 0.25 + r() * 0.2;
    const top = V(x + Math.cos(a) * 0.08, y + 0.18 + r() * 0.1, z + Math.sin(a) * 0.08);
    const g = new THREE.ConeGeometry(0.025, t, 4);
    g.translate(0, t / 2, 0);
    const dir = top.clone().sub(V(x, y, z)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
    pl.add(g, C('#5fa83a').multiplyScalar(0.8 + r() * 0.4), new THREE.Matrix4().compose(V(x, y + 0.02, z), q, V(1, 1, 0.3)), swayUp(t, 0.05));
  }
}

function tomato(pl: VBuilder, st: VBuilder, x: number, y: number, z: number, r: () => number) {
  const h = 1.2 + r() * 0.2;
  st.add(new THREE.CylinderGeometry(0.015, 0.015, h + 0.2, 5), '#9a7a52', at(x, y + h / 2 - 0.1, z));
  for (let i = 0; i < 8; i++) {
    const yy = 0.2 + (i / 8) * (h - 0.25);
    const a = r() * Math.PI * 2, d = 0.05 + r() * 0.1;
    const g = new THREE.IcosahedronGeometry(0.09 + r() * 0.06, 0);
    pl.add(g, C('#3f7a34').multiplyScalar(0.8 + r() * 0.4), mat4({ x: x + Math.cos(a) * d, y: y + yy, z: z + Math.sin(a) * d }, { x: r(), y: r() * 3, z: 0 }, { x: 1, y: 0.75, z: 1 }), yy / h * 0.07);
  }
  for (let i = 0; i < 7; i++) {
    const yy = 0.3 + r() * (h - 0.5), a = r() * Math.PI * 2, d = 0.12 + r() * 0.06;
    const c = r() < 0.75 ? '#d2322b' : r() < 0.5 ? '#e8822a' : '#8cbf4a';
    pl.add(new THREE.SphereGeometry(0.035 + r() * 0.012, 6, 4), c, at(x + Math.cos(a) * d, y + yy, z + Math.sin(a) * d), yy / h * 0.07);
  }
  // tie
  st.add(new THREE.TorusGeometry(0.03, 0.006, 3, 8), '#d8c9a4', at(x, y + h * 0.6, z, 0));
}

function corn(pl: VBuilder, x: number, y: number, z: number, r: () => number) {
  const h = 1.75 + r() * 0.4;
  const sway = swayUp(h, 0.12);
  const stalk = new THREE.CylinderGeometry(0.012, 0.02, h, 6);
  stalk.translate(0, h / 2, 0);
  pl.add(stalk, '#7aa04a', at(x, y, z), (p) => Math.max(0, p.y / h) * 0.12);
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const yy = 0.25 + (i / leaves) * (h - 0.5), a = i * 2.4 + r() * 0.6, L = 0.45 + r() * 0.25;
    const p0 = V(x, y + yy, z);
    const p1 = V(x + Math.cos(a) * L * 0.6, y + yy + 0.22, z + Math.sin(a) * L * 0.6);
    const p2 = V(x + Math.cos(a) * L, y + yy + 0.05, z + Math.sin(a) * L);
    const c = C('#6f9a3e').multiplyScalar(0.85 + r() * 0.3);
    pl.add(leafStrip([p0, p1, p2], [0.03, 0.06, 0.005]), c, undefined, (p) => Math.max(0, (p.y - y) / h) * 0.12);
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6;
    pl.add(new THREE.ConeGeometry(0.006, 0.22, 3, 1, true), '#dcc67e', mat4({ x: x + Math.cos(a) * 0.04, y: y + h + 0.08, z: z + Math.sin(a) * 0.04 }, { x: Math.sin(a) * 0.5, y: 0, z: Math.cos(a) * 0.5 }), 0.13);
  }
  const cob = new THREE.CylinderGeometry(0.022, 0.03, 0.18, 6);
  const ca = r() * Math.PI * 2;
  pl.add(cob, '#b8c46a', mat4({ x: x + Math.cos(ca) * 0.05, y: y + h * 0.55, z: z + Math.sin(ca) * 0.05 }, { x: Math.sin(ca) * 0.35, y: 0, z: -Math.cos(ca) * 0.35 }), h * 0.55 / h * 0.12);
  void sway;
}

function pumpkin(st: VBuilder, pl: VBuilder, x: number, y: number, z: number, rad: number, r: () => number) {
  const g = new THREE.SphereGeometry(1, 16, 9);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i), a = Math.atan2(pz, px);
    const k = 0.9 + 0.1 * Math.abs(Math.cos(a * 5));
    p.setXYZ(i, px * k, p.getY(i), pz * k);
  }
  g.computeVertexNormals();
  st.add(g, (q) => C('#e0761c').multiplyScalar(0.75 + 0.3 * Math.abs(Math.cos(Math.atan2(q.z, q.x) * 5)) * (0.8 + 0.2 * q.y)), mat4({ x, y: y + rad * 0.68, z }, { x: 0, y: r() * 3, z: 0 }, { x: rad, y: rad * 0.72, z: rad }));
  st.add(new THREE.CylinderGeometry(0.018, 0.026, 0.09, 6), '#5d6a2e', mat4({ x, y: y + rad * 1.4 + 0.02, z }, { x: 0.3, y: r(), z: 0.2 }));
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    pl.add(new THREE.IcosahedronGeometry(1, 0), C('#4a7a35').multiplyScalar(0.8 + r() * 0.3), mat4({ x: x + Math.cos(a) * rad * 1.6, y: y + 0.08, z: z + Math.sin(a) * rad * 1.6 }, { x: 0.3, y: a, z: 0 }, { x: 0.2, y: 0.05, z: 0.18 }), 0.03);
  }
}

// ---------------------------------------------------------------------------
// The garden
// ---------------------------------------------------------------------------
function garden(fb: Builder, st: VBuilder, pl: VBuilder, white: THREE.Material) {
  const r = rng(321);
  const ROWS = [-58.7, -60.9, -63.1, -65.3];
  const XS: [number, number][] = [[-19.3, -13.7], [-12.3, -6.7]];
  const BH = 0.42, BW = 1.2;
  const kinds = [['lettuce', 'cabbage'], ['carrot', 'pumpkin'], ['tomato', 'tomato'], ['corn', 'corn']];
  ROWS.forEach((zc, ri) => XS.forEach(([xa, xb], ci) => {
    const g = Math.min(heightAt(xa, zc), heightAt(xb, zc), heightAt((xa + xb) / 2, zc)) - 0.04;
    const top = g + BH;
    const wood = () => C('#7c5b3b').multiplyScalar(0.8 + r() * 0.35);
    for (const s of [-1, 1]) st.box(wood(), (xa + xb) / 2, g + BH / 2, zc + s * (BW / 2 - 0.025), xb - xa, BH, 0.05);
    for (const x of [xa + 0.025, xb - 0.025]) st.box(wood(), x, g + BH / 2, zc, 0.05, BH, BW - 0.1);
    for (const x of [xa, xb]) for (const s of [-1, 1]) st.box('#6a4c30', x + (x === xa ? 0.04 : -0.04), g + BH / 2 + 0.03, zc + s * (BW / 2 - 0.04), 0.08, BH + 0.06, 0.08);
    st.box('#4a3424', (xa + xb) / 2, top - 0.06, zc, xb - xa - 0.1, 0.02, BW - 0.1);
    // soil clods
    for (let i = 0; i < 10; i++) st.add(new THREE.IcosahedronGeometry(0.06 + r() * 0.04, 0), '#3e2c1e', mat4({ x: xa + 0.2 + r() * (xb - xa - 0.4), y: top - 0.06, z: zc + (r() - 0.5) * (BW - 0.3) }, { x: r(), y: r(), z: r() }, { x: 1, y: 0.4, z: 1 }));
    W.physics.addBox(xa, g, zc - BW / 2, xb, top + 0.02, zc + BW / 2, { walk: false });
    const soil = top - 0.05;
    const kind = kinds[ri][ci];
    if (kind === 'lettuce' || kind === 'cabbage' || kind === 'carrot') {
      const step = kind === 'carrot' ? 0.2 : kind === 'cabbage' ? 0.42 : 0.3;
      const rows = kind === 'carrot' ? 3 : 2;
      for (let x = xa + 0.25; x < xb - 0.15; x += step) for (let k = 0; k < rows; k++) {
        const z = zc + (k - (rows - 1) / 2) * (BW - 0.35) / Math.max(1, rows - 1) + (r() - 0.5) * 0.04;
        const xx = x + (r() - 0.5) * 0.05;
        if (kind === 'lettuce') lettuce(pl, xx, soil, z, r);
        else if (kind === 'cabbage') cabbage(pl, xx, soil, z, r);
        else carrot(pl, st, xx, soil, z, r);
      }
    } else if (kind === 'tomato') {
      for (let x = xa + 0.45; x < xb - 0.2; x += 0.85) for (const s of [-0.28, 0.28]) tomato(pl, st, x + (r() - 0.5) * 0.1, soil, zc + s, r);
    } else if (kind === 'corn') {
      for (let x = xa + 0.25; x < xb - 0.15; x += 0.42) for (const s of [-0.35, 0, 0.35]) corn(pl, x + (r() - 0.5) * 0.12, soil, zc + s + (r() - 0.5) * 0.08, r);
    } else if (kind === 'pumpkin') {
      for (let i = 0; i < 6; i++) pumpkin(st, pl, xa + 0.45 + i * 0.9 + (r() - 0.5) * 0.2, soil, zc + (r() - 0.5) * 0.4, 0.17 + r() * 0.09, r);
      // vines
      for (let i = 0; i < 8; i++) {
        const x0 = xa + 0.3 + r() * (xb - xa - 0.6), z0 = zc + (r() - 0.5) * 0.8;
        pl.rod('#5d8a3a', V(x0, soil + 0.02, z0), V(x0 + (r() - 0.5) * 0.9, soil + 0.02, z0 + (r() - 0.5) * 0.5), 0.01, 4, 0.01);
      }
    }
  }));

  // scarecrow at the north end of the centre path, facing the gate
  scarecrow(st, pl, -13.0, -66.35, 0, r);
  // watering can by the first bed
  {
    const x = -13.45, z = -57.85, g = heightAt(x, z);
    wateringCan(st, x, g, z, 0.9, '#4f6f52');
    W.interact.add({
      pos: new THREE.Vector3(x, g + 0.25, z), radius: 0.3, label: 'Water the garden',
      onUse: () => { W.audio.play('water_lap', { pos: new THREE.Vector3(x, g, z), volume: 0.6, rate: 1.3 }); W.toast('You give the beds a good drink. The tomatoes look grateful.'); },
    });
  }

  // white picket fence with a rose arbor over the gate (south side)
  const FX0 = -20.3, FX1 = -5.7, FZ0 = -67.4, FZ1 = -56.6;
  const GATE = [-13.75, -12.25];
  const pw = 0.075, ph = 1.0;
  const shape = new THREE.Shape([new THREE.Vector2(-pw / 2, 0), new THREE.Vector2(pw / 2, 0), new THREE.Vector2(pw / 2, ph - 0.06), new THREE.Vector2(0, ph), new THREE.Vector2(-pw / 2, ph - 0.06)]);
  const picket = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
  picket.translate(0, 0, -0.01);
  const side = (ax: number, az: number, bx: number, bz: number, outN: [number, number]) => {
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    const yaw = Math.atan2(-dz, dx);
    for (let u = 0.07; u < L - 0.03; u += 0.135) {
      const x = ax + dx * u, z = az + dz * u;
      if (az === FZ1 && bz === FZ1 && x > GATE[0] - 0.05 && x < GATE[1] + 0.05) continue;
      fb.add(white, picket, mat4({ x: x + outN[0] * 0.035, y: heightAt(x, z) - 0.06, z: z + outN[1] * 0.035 }, { x: 0, y: yaw, z: 0 }));
    }
    const nPost = Math.max(1, Math.round(L / 2.0));
    for (let i = 0; i <= nPost; i++) {
      const x = ax + dx * L * (i / nPost), z = az + dz * L * (i / nPost), g = heightAt(x, z);
      fb.box(white, x, g + 0.5, z, 0.09, 1.16, 0.09, { collide: false });
      fb.box(white, x, g + 1.09, z, 0.12, 0.03, 0.12, { collide: false });
      if (i < nPost) {
        const x2 = ax + dx * L * ((i + 1) / nPost), z2 = az + dz * L * ((i + 1) / nPost), g2 = heightAt(x2, z2);
        for (const y of [0.22, 0.78]) beam(fb, white, V(x, g + y, z), V(x2, g2 + y, z2), 0.03, 0.07);
      }
    }
  };
  side(FX0, FZ0, FX1, FZ0, [0, -1]);
  side(FX0, FZ0, FX0, FZ1, [-1, 0]);
  side(FX1, FZ0, FX1, FZ1, [1, 0]);
  side(FX0, FZ1, GATE[0], FZ1, [0, 1]);
  side(GATE[1], FZ1, FX1, FZ1, [0, 1]);
  const gm = Math.min(heightAt(FX0, FZ0), heightAt(FX1, FZ1));
  for (const [ax, az, bx, bz] of [[FX0, FZ0, FX1, FZ0], [FX0, FZ0, FX0, FZ1], [FX1, FZ0, FX1, FZ1], [FX0, FZ1, GATE[0], FZ1], [GATE[1], FZ1, FX1, FZ1]]) W.physics.addSegment(ax, az, bx, bz, 0.06, gm - 1, gm + 3);
  // arbor
  {
    const zc = FZ1, g = heightAt(-13, zc), top = 2.25;
    for (const x of GATE) for (const dz of [-0.22, 0.22]) {
      fb.box(white, x, g + top / 2, zc + dz, 0.08, top, 0.08, { collide: false });
      W.physics.addCylinder(x, zc + dz, 0.07, g, g + top);
    }
    for (const x of GATE) for (let k = 0; k < 6; k++) beam(fb, white, V(x, g + 0.2 + k * 0.33, zc - 0.22), V(x, g + 0.36 + k * 0.33, zc + 0.22), 0.02, 0.025);
    for (const dz of [-0.22, 0.22]) {
      const arc = new THREE.TorusGeometry(0.75, 0.04, 5, 16, Math.PI);
      arc.scale(1, 0.55, 1);
      fb.add(white, arc, at(-13, g + top, zc + dz));
    }
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * Math.PI, x = -13 + Math.cos(a) * 0.75, y = g + top + Math.sin(a) * 0.75 * 0.55;
      fb.box(white, x, y + 0.03, zc, 0.04, 0.04, 0.62, { collide: false });
    }
    // climbing roses
    const rr = rng(8);
    for (let i = 0; i < 70; i++) {
      const t = rr();
      let x: number, y: number;
      if (t < 0.6) { const sx = rr() < 0.5 ? GATE[0] : GATE[1]; x = sx + (rr() - 0.5) * 0.12; y = g + 0.3 + rr() * (top - 0.3); }
      else { const a = rr() * Math.PI; x = -13 + Math.cos(a) * 0.75; y = g + top + Math.sin(a) * 0.41; }
      const z = zc + (rr() - 0.5) * 0.5;
      pl.add(new THREE.IcosahedronGeometry(0.07 + rr() * 0.05, 0), C('#3f6e35').multiplyScalar(0.8 + rr() * 0.4), at(x, y, z, rr() * 3), 0.02);
      if (rr() < 0.55) pl.add(new THREE.IcosahedronGeometry(0.035 + rr() * 0.015, 0), rr() < 0.5 ? '#e05a7a' : rr() < 0.5 ? '#f3a0b4' : '#c8283c', at(x + (rr() - 0.5) * 0.08, y + 0.04, z + (rr() - 0.5) * 0.1), 0.02);
    }
  }
}

function wateringCan(st: VBuilder, x: number, y: number, z: number, yaw: number, col: string) {
  const base = at(x, y, z, yaw);
  const M4 = (p: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(base, p);
  const body = new THREE.CylinderGeometry(0.1, 0.11, 0.22, 14);
  body.translate(0, 0.11, 0);
  st.add(body, col, base);
  st.add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 14), '#3a5540', M4(at(0, 0.22, 0)));
  const sp0 = V(0.08, 0.05, 0).applyMatrix4(base), sp1 = V(0.32, 0.27, 0).applyMatrix4(base);
  st.rod(col, sp0, sp1, 0.014, 6);
  const rose = new THREE.CylinderGeometry(0.035, 0.015, 0.05, 8);
  rose.rotateZ(-Math.PI / 2 + 0.75);
  st.add(rose, col, M4(at(0.33, 0.28, 0)));
  const h = new THREE.TorusGeometry(0.09, 0.012, 5, 12, Math.PI);
  st.add(h, col, M4(mat4({ x: -0.02, y: 0.21, z: 0 }, { x: 0, y: 0, z: 0 })));
}

function scarecrow(st: VBuilder, pl: VBuilder, x: number, z: number, yaw: number, r: () => number) {
  const g = heightAt(x, z);
  const base = at(x, g, z, yaw);
  const P = (px: number, py: number, pz: number, rot?: THREE.Vector3Like, sc?: THREE.Vector3Like) => new THREE.Matrix4().multiplyMatrices(base, mat4({ x: px, y: py, z: pz }, rot, sc));
  const plaid = (q: THREE.Vector3) => {
    const a = Math.abs(Math.sin(q.x * 38)) > 0.82 ? 0.55 : 1, b = Math.abs(Math.sin(q.y * 38)) > 0.82 ? 0.55 : 1;
    return C('#b0392b').multiplyScalar(a * b * (Math.abs(Math.sin((q.x + q.y) * 90)) > 0.9 ? 1.25 : 1));
  };
  const post = new THREE.CylinderGeometry(0.04, 0.045, 2.3, 7);
  post.translate(0, 1.15, 0);
  st.add(post, '#6b5038', P(0, -0.2, -0.05));
  const bar = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6);
  bar.rotateZ(Math.PI / 2);
  st.add(bar, '#6b5038', P(0, 1.55, -0.05));
  st.add(new THREE.BoxGeometry(0.48, 0.55, 0.24, 12, 14, 2), plaid, P(0, 1.3, 0));
  for (const s of [-1, 1]) {
    st.add(new THREE.BoxGeometry(0.42, 0.15, 0.15, 10, 4, 2), plaid, P(s * 0.44, 1.52, -0.02, { x: 0, y: 0, z: -s * 0.08 }));
    for (let k = 0; k < 4; k++) {
      const c = new THREE.ConeGeometry(0.02, 0.16, 4);
      c.rotateZ(-s * Math.PI / 2);
      st.add(c, '#e0c26a', P(s * 0.71, 1.5 + (k - 1.5) * 0.03, -0.02 + (r() - 0.5) * 0.06, { x: 0, y: 0, z: (r() - 0.5) * 0.6 }));
    }
  }
  st.add(new THREE.BoxGeometry(0.46, 0.26, 0.26), '#3d5a80', P(0, 0.95, 0));
  for (const s of [-1, 1]) {
    st.add(new THREE.BoxGeometry(0.06, 0.55, 0.02), '#3d5a80', P(s * 0.13, 1.3, 0.13));
    st.add(new THREE.BoxGeometry(0.17, 0.62, 0.17), '#3d5a80', P(s * 0.12, 0.52, 0.01, { x: 0.05, y: 0, z: s * 0.04 }));
    for (let k = 0; k < 3; k++) st.add(new THREE.ConeGeometry(0.02, 0.14, 4), '#e0c26a', P(s * 0.12 + (k - 1) * 0.04, 0.18, 0.02, { x: Math.PI, y: 0, z: (k - 1) * 0.3 }));
  }
  st.add(new THREE.BoxGeometry(0.16, 0.14, 0.02), '#3d5a80', P(0, 1.14, 0.13));
  // head
  st.add(new THREE.SphereGeometry(0.16, 14, 10), '#cdb68b', P(0, 1.8, 0, undefined, { x: 1, y: 1.08, z: 0.95 }));
  for (const s of [-1, 1]) st.add(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 8), '#2a2420', P(s * 0.055, 1.84, 0.148, { x: Math.PI / 2, y: 0, z: 0 }));
  const nose = new THREE.ConeGeometry(0.022, 0.09, 6);
  nose.rotateX(Math.PI / 2);
  st.add(nose, '#e07b26', P(0, 1.79, 0.19));
  for (let k = -2; k <= 2; k++) st.add(new THREE.BoxGeometry(0.018, 0.006, 0.006), '#2a2420', P(k * 0.03, 1.73 - Math.abs(k) * -0.006 - 0.006 * (2 - Math.abs(k)), 0.148));
  st.add(new THREE.TorusGeometry(0.075, 0.015, 4, 12), '#a88c58', P(0, 1.63, 0, { x: Math.PI / 2, y: 0, z: 0 }));
  // straw hat with a red band
  st.add(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20), '#d8b86a', P(0, 1.93, 0, { x: -0.12, y: 0, z: 0.05 }));
  st.add(new THREE.CylinderGeometry(0.12, 0.14, 0.15, 14), '#d2b062', P(0, 2.01, -0.01, { x: -0.12, y: 0, z: 0.05 }));
  st.add(new THREE.CylinderGeometry(0.142, 0.142, 0.035, 14), '#8f2b21', P(0, 1.965, -0.005, { x: -0.12, y: 0, z: 0.05 }));
  // a crow on the arm
  st.add(new THREE.SphereGeometry(0.07, 10, 7), '#1b1b1e', P(0.62, 1.66, -0.02, undefined, { x: 1.4, y: 0.9, z: 0.9 }));
  st.add(new THREE.SphereGeometry(0.045, 9, 6), '#1b1b1e', P(0.7, 1.74, -0.02));
  const beak = new THREE.ConeGeometry(0.014, 0.05, 5);
  beak.rotateZ(-Math.PI / 2);
  st.add(beak, '#3a3328', P(0.76, 1.735, -0.02));
  st.add(new THREE.BoxGeometry(0.12, 0.01, 0.06), '#1b1b1e', P(0.52, 1.66, -0.02, { x: 0, y: 0, z: 0.4 }));
  W.physics.addCylinder(x, z, 0.3, g, g + 2.2);
  void pl;
}

// ---------------------------------------------------------------------------
// The greenhouse
// ---------------------------------------------------------------------------
function greenhouse(fb: Builder, st: VBuilder, pl: VBuilder, white: THREE.Material, brick: THREE.Material, glass: THREE.BufferGeometry[]) {
  const X0 = GREENHOUSE.x - GREENHOUSE.w / 2, X1 = GREENHOUSE.x + GREENHOUSE.w / 2; // -32, -26
  const Z0 = GREENHOUSE.z - GREENHOUSE.d / 2, Z1 = GREENHOUSE.z + GREENHOUSE.d / 2; // -67.5, -58.5
  const CXg = GREENHOUSE.x;
  const g = padHeightAt(GREENHOUSE.x, GREENHOUSE.z);
  const F = g + 0.08;
  const KW = 0.55, EH = 2.3, RISE = 1.55; // knee wall top, eave and ridge above the floor
  const DZ0 = GREENHOUSE.z - 0.5, DZ1 = GREENHOUSE.z + 0.5; // door on the east side
  const kw = 0.2;
  const r = rng(99);

  // brick floor + knee walls (door gap on the east)
  fb.boxMinMax(brick, X0 + kw / 2, g - 0.3, Z0 + kw / 2, X1 - kw / 2, F, Z1 - kw / 2);
  fb.boxMinMax(brick, X0 - kw / 2, g - 0.3, Z0 - kw / 2, X1 + kw / 2, F + KW, Z0 + kw / 2);
  fb.boxMinMax(brick, X0 - kw / 2, g - 0.3, Z1 - kw / 2, X1 + kw / 2, F + KW, Z1 + kw / 2);
  fb.boxMinMax(brick, X0 - kw / 2, g - 0.3, Z0 + kw / 2, X0 + kw / 2, F + KW, Z1 - kw / 2);
  fb.boxMinMax(brick, X1 - kw / 2, g - 0.3, Z0 + kw / 2, X1 + kw / 2, F + KW, DZ0 - 0.05);
  fb.boxMinMax(brick, X1 - kw / 2, g - 0.3, DZ1 + 0.05, X1 + kw / 2, F + KW, Z1 - kw / 2);
  fb.boxMinMax(brick, X1 - kw / 2, g - 0.3, DZ0 - 0.05, X1 + kw / 2, F, DZ1 + 0.05);
  // a stepping stone at the door
  fb.boxMinMax(brick, X1 + kw / 2, g - 0.2, DZ0, X1 + 0.75, g + 0.04, DZ1, { collide: false });

  const NC = { collide: false } as const;
  const sill = F + KW;
  // sill plates
  for (const [x0, z0, x1, z1] of [[X0 - 0.13, Z0 - 0.13, X1 + 0.13, Z0 + 0.13], [X0 - 0.13, Z1 - 0.13, X1 + 0.13, Z1 + 0.13], [X0 - 0.13, Z0, X0 + 0.13, Z1], [X1 - 0.13, Z0, X1 + 0.13, DZ0 - 0.05], [X1 - 0.13, DZ1 + 0.05, X1 + 0.13, Z1]])
    fb.boxMinMax(white, x0, sill, z0, x1, sill + 0.05, z1, NC);
  const top = F + EH, ridge = F + EH + RISE;
  const roofY = (x: number) => top + RISE * (1 - Math.abs(x - CXg) / (GREENHOUSE.w / 2));
  // long sides: mullions, eave plate, transom
  for (const x of [X0, X1]) {
    for (let z = Z0; z <= Z1 + 1e-3; z += 0.75) {
      if (x === X1 && z > DZ0 - 0.1 && z < DZ1 + 0.1) continue;
      const big = Math.abs(z - Z0) < 1e-3 || Math.abs(z - Z1) < 1e-3;
      fb.box(white, x, (sill + top) / 2, z, big ? 0.1 : 0.05, top - sill, big ? 0.1 : 0.06, NC);
    }
    fb.box(white, x, top, (Z0 + Z1) / 2, 0.12, 0.09, Z1 - Z0 + 0.1, NC);
    if (x === X0) fb.box(white, x, F + 1.45, (Z0 + Z1) / 2, 0.06, 0.04, Z1 - Z0, NC);
    else for (const [a, c] of [[Z0, DZ0 - 0.05], [DZ1 + 0.05, Z1]]) fb.box(white, x, F + 1.45, (a + c) / 2, 0.06, 0.04, c - a, NC);
  }
  // door frame
  for (const z of [DZ0 - 0.04, DZ1 + 0.04]) fb.box(white, X1, (F + top) / 2, z, 0.1, top - F, 0.08, NC);
  fb.box(white, X1, F + 2.12, (DZ0 + DZ1) / 2, 0.1, 0.06, DZ1 - DZ0 + 0.16, NC);
  // gable ends: mullions up to the roof line, transom
  for (const z of [Z0, Z1]) {
    for (let x = X0 + 0.75; x < X1 - 0.1; x += 0.75) fb.box(white, x, (sill + roofY(x)) / 2, z, 0.05, roofY(x) - sill, 0.06, NC);
    fb.box(white, CXg, F + 1.45, z, X1 - X0, 0.04, 0.06, NC);
    fb.box(white, CXg, top, z, X1 - X0, 0.05, 0.08, NC);
    for (const s of [-1, 1]) beam(fb, white, V(CXg + s * (GREENHOUSE.w / 2 + 0.06), top - 0.02, z), V(CXg, ridge + 0.02, z), 0.09, 0.09);
    // finial
    st.add(new THREE.SphereGeometry(0.06, 8, 6), '#f4f3ee', at(CXg, ridge + 0.14, z));
    st.add(new THREE.ConeGeometry(0.025, 0.2, 6), '#f4f3ee', at(CXg, ridge + 0.27, z));
  }
  // roof: rafters, ridge beam, purlins
  for (let z = Z0; z <= Z1 + 1e-3; z += 0.75) for (const s of [-1, 1]) beam(fb, white, V(CXg + s * (GREENHOUSE.w / 2), top + 0.02, z), V(CXg, ridge, z), 0.045, 0.06);
  fb.box(white, CXg, ridge, (Z0 + Z1) / 2, 0.1, 0.1, Z1 - Z0 + 0.2, NC);
  for (const s of [-1, 1]) {
    const x = CXg + s * (GREENHOUSE.w / 4);
    fb.box(white, x, roofY(x) + 0.02, (Z0 + Z1) / 2, 0.05, 0.04, Z1 - Z0, { rotZ: 0, collide: false });
  }
  // glass: long sides (with the door gap), gable pentagons, roof
  const quad = (x: number, y0: number, y1: number, z0: number, z1: number, along: 'z' | 'x', zc?: number) => {
    const w = along === 'z' ? z1 - z0 : z1 - z0;
    const geo = new THREE.PlaneGeometry(w, y1 - y0);
    if (along === 'z') geo.rotateY(Math.PI / 2);
    geo.translate(along === 'z' ? x : (z0 + z1) / 2, (y0 + y1) / 2, along === 'z' ? (z0 + z1) / 2 : zc!);
    glass.push(geo);
  };
  quad(X0, sill + 0.05, top - 0.03, Z0, Z1, 'z');
  quad(X1, sill + 0.05, top - 0.03, Z0, DZ0 - 0.08, 'z');
  quad(X1, sill + 0.05, top - 0.03, DZ1 + 0.08, Z1, 'z');
  quad(X1, F + 2.15, top - 0.03, DZ0 - 0.08, DZ1 + 0.08, 'z');
  for (const z of [Z0, Z1]) {
    const hw = GREENHOUSE.w / 2;
    const sh = new THREE.Shape([new THREE.Vector2(-hw, sill + 0.05), new THREE.Vector2(hw, sill + 0.05), new THREE.Vector2(hw, top), new THREE.Vector2(0, ridge), new THREE.Vector2(-hw, top)]);
    const sg = new THREE.ShapeGeometry(sh);
    sg.translate(CXg, 0, z);
    glass.push(sg);
  }
  for (const s of [-1, 1]) {
    const hw = GREENHOUSE.w / 2, len = Math.hypot(hw, RISE);
    const geo = new THREE.PlaneGeometry(len, Z1 - Z0 + 0.1);
    geo.rotateX(-Math.PI / 2);
    geo.rotateZ(-s * Math.atan2(RISE, hw));
    geo.translate(CXg + s * hw / 2, (top + ridge) / 2 + 0.03, (Z0 + Z1) / 2);
    glass.push(geo);
  }
  // two roof vents propped open on the east slope
  for (const zc of [-65.2, -60.8]) {
    const hw = GREENHOUSE.w / 2, ang = Math.atan2(RISE, hw), open = 0.32;
    const hx = CXg + 0.08, hy = ridge - 0.04;
    const L = 0.85, wv = 0.72;
    const a = ang + open;
    const cx = hx + Math.cos(a) * L / 2, cy = hy - Math.sin(a) * L / 2 + 0.06;
    fb.box(white, cx, cy, zc, L, 0.04, wv, { rotZ: -a, collide: false });
    const geo = new THREE.PlaneGeometry(L - 0.08, wv - 0.08);
    geo.rotateX(-Math.PI / 2);
    geo.rotateZ(-a);
    geo.translate(cx, cy + 0.025, zc);
    glass.push(geo);
    st.rod('#26272a', V(cx + 0.25, roofY(cx + 0.25) + 0.03, zc + wv / 2 - 0.05), V(cx + 0.2, cy + 0.02, zc + wv / 2 - 0.05), 0.008, 4);
  }

  // colliders (box per wall, door gap on the east)
  W.physics.addBox(X0 - 0.12, g, Z0 - 0.12, X0 + 0.12, F + EH, Z1 + 0.12, { walk: false });
  W.physics.addBox(X0 - 0.12, g, Z0 - 0.12, X1 + 0.12, F + EH, Z0 + 0.12, { walk: false });
  W.physics.addBox(X0 - 0.12, g, Z1 - 0.12, X1 + 0.12, F + EH, Z1 + 0.12, { walk: false });
  W.physics.addBox(X1 - 0.12, g, Z0 - 0.12, X1 + 0.12, F + EH, DZ0 - 0.02, { walk: false });
  W.physics.addBox(X1 - 0.12, g, DZ1 + 0.02, X1 + 0.12, F + EH, Z1 + 0.12, { walk: false });
  W.physics.addBox(X1 - 0.12, F + 2.1, DZ0, X1 + 0.12, F + EH, DZ1, { walk: false });

  // door (opens outward)
  const door = makeDoor({ hinge: new THREE.Vector3(X1, F, DZ0 + 0.02), w: DZ1 - DZ0 - 0.04, h: 2.06, dir: [0, 1], swing: 1, mat: M.paint('#f4f3ee', 0.5), knob: M.paint('#b8913f', 0.3, 0.8), glass: greenhouseGlass(), name: 'greenhouse door' });
  W.scene.add(door.group);
  door.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== M.paint('#f4f3ee', 0.5)) m.castShadow = false; });

  // ---- inside: potting benches, staging table, pots, trays, hanging baskets ----
  const bench = (x0: number, x1: number, z0: number, z1: number, h: number) => {
    const wood = '#8a6a4a';
    for (let x = x0 + 0.03; x < x1; x += 0.11) st.box(C(wood).multiplyScalar(0.85 + r() * 0.3), x + 0.04, F + h - 0.02, (z0 + z1) / 2, 0.08, 0.035, z1 - z0);
    for (const x of [x0 + 0.04, x1 - 0.04]) for (let z = z0 + 0.05; z < z1; z += Math.max(1.2, (z1 - z0 - 0.1) / Math.ceil((z1 - z0) / 1.6))) st.box('#6a4c30', x, F + h / 2, Math.min(z, z1 - 0.05), 0.06, h, 0.06);
    for (const x of [x0 + 0.04, x1 - 0.04]) st.box('#6a4c30', x, F + h - 0.07, (z0 + z1) / 2, 0.05, 0.06, z1 - z0);
    st.box('#7a5a3c', (x0 + x1) / 2, F + 0.25, (z0 + z1) / 2, x1 - x0 - 0.08, 0.03, z1 - z0 - 0.08);
    W.physics.addBox(x0, F, z0, x1, F + h, z1, { walk: false });
    return F + h;
  };
  const bW0 = bench(X0 + 0.15, X0 + 0.95, Z0 + 0.2, Z1 - 0.2, 0.85);
  const bE1 = bench(X1 - 0.95, X1 - 0.15, Z0 + 0.2, DZ0 - 0.45, 0.85);
  const bE2 = bench(X1 - 0.95, X1 - 0.15, DZ1 + 0.45, Z1 - 0.2, 0.85);
  const bC = bench(CXg - 0.6, CXg + 0.6, -66.4, -60.4, 0.75);
  void bE2;

  const pot = (x: number, y: number, z: number, rad: number, kind: number) => {
    const h = rad * 1.1;
    const p = new THREE.CylinderGeometry(rad, rad * 0.72, h, 8, 1, true);
    p.translate(0, h / 2, 0);
    st.add(p, C('#b9643d').multiplyScalar(0.85 + r() * 0.25), at(x, y, z));
    const rim = new THREE.CylinderGeometry(rad * 1.1, rad * 1.06, rad * 0.25, 8, 1, true);
    st.add(rim, '#c46d44', at(x, y + h - rad * 0.12, z));
    st.add(new THREE.CircleGeometry(rad * 1.0, 8).rotateX(-Math.PI / 2), '#3e2c1e', at(x, y + h - 0.02, z));
    const sy = y + h - 0.02;
    if (kind === 0) { // seedlings
      for (let k = 0; k < 2; k++) {
        const a = k * 2.6 + r();
        pl.rod('#7fb04a', V(x, sy, z), V(x + Math.cos(a) * 0.02, sy + 0.05, z + Math.sin(a) * 0.02), 0.003, 3, 0.01);
        for (const s of [-1, 1]) pl.add(new THREE.SphereGeometry(0.014, 5, 3), '#8fcf54', mat4({ x: x + Math.cos(a) * 0.02 + s * 0.012, y: sy + 0.055, z: z + Math.sin(a) * 0.02 }, undefined, { x: 1.4, y: 0.4, z: 0.8 }), 0.012);
      }
    } else if (kind === 1) { // herb bush
      for (let k = 0; k < 6; k++) pl.add(new THREE.IcosahedronGeometry(rad * 0.55, 0), C('#4f8a3c').multiplyScalar(0.8 + r() * 0.4), at(x + (r() - 0.5) * rad, sy + rad * 0.4 + r() * rad * 0.5, z + (r() - 0.5) * rad, r() * 3), 0.02);
    } else if (kind === 2) { // geranium
      for (let k = 0; k < 6; k++) pl.add(new THREE.IcosahedronGeometry(rad * 0.5, 0), C('#3f7a34').multiplyScalar(0.85 + r() * 0.3), at(x + (r() - 0.5) * rad, sy + rad * 0.35 + r() * rad * 0.3, z + (r() - 0.5) * rad), 0.02);
      const fc = ['#d8283c', '#f06d8c', '#f3eef0', '#e8505b'][Math.floor(r() * 4)];
      for (let k = 0; k < 3; k++) pl.add(new THREE.IcosahedronGeometry(rad * 0.28, 0), fc, at(x + (r() - 0.5) * rad * 1.2, sy + rad * 0.9 + r() * 0.05, z + (r() - 0.5) * rad * 1.2), 0.03);
    } else if (kind === 3) { // succulent rosette
      for (let k = 0; k < 10; k++) {
        const a = k * 2.4, d = (k / 10) * rad * 0.7;
        pl.add(new THREE.IcosahedronGeometry(rad * 0.25, 0), C('#8fb3a0').multiplyScalar(0.85 + r() * 0.3), mat4({ x: x + Math.cos(a) * d, y: sy + 0.02 + (1 - k / 10) * 0.03, z: z + Math.sin(a) * d }, { x: 0.6, y: -a, z: 0 }, { x: 0.7, y: 0.4, z: 1.3 }), 0.0);
      }
    } else { // fern fronds
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + r(), L = rad * 2.5;
        const p1 = V(x + Math.cos(a) * L * 0.5, sy + L * 0.45, z + Math.sin(a) * L * 0.5), p2 = V(x + Math.cos(a) * L, sy + L * 0.2, z + Math.sin(a) * L);
        for (const [a0, a1] of [[V(x, sy, z), p1], [p1, p2]]) {
          const d = a1.clone().sub(a0), len = d.length();
          const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), d.normalize());
          pl.add(new THREE.BoxGeometry(len, 0.005, rad * 0.4), '#4e9a3e', new THREE.Matrix4().compose(a0.clone().add(a1).multiplyScalar(0.5), q, V(1, 1, 1)), 0.03);
        }
      }
    }
  };
  const fillBench = (x0: number, x1: number, z0: number, z1: number, y: number) => {
    for (let z = z0 + 0.16; z < z1 - 0.12; z += 0.24 + r() * 0.06) {
      if (r() < 0.16) {
        // seedling tray
        const tz = z + 0.12;
        st.box('#1f2321', (x0 + x1) / 2, y + 0.03, tz, x1 - x0 - 0.2, 0.06, 0.32);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) pl.add(new THREE.IcosahedronGeometry(0.02, 0), '#8fcf54', at(x0 + 0.18 + i * (x1 - x0 - 0.36) / 5, y + 0.075, tz - 0.1 + j * 0.1), 0.01);
        z += 0.25;
        continue;
      }
      for (const dx of [-0.19, 0.19]) {
        if (r() < 0.2) continue;
        const rad = 0.055 + r() * 0.045;
        pot((x0 + x1) / 2 + dx + (r() - 0.5) * 0.05, y, z + (r() - 0.5) * 0.06, rad, Math.floor(r() * 5));
      }
    }
  };
  // a tiered plant stand at the south end
  {
    const sx = CXg, sz = Z1 - 0.6;
    for (let k = 0; k < 3; k++) {
      const ty = F + 0.35 + k * 0.38, tz = sz + 0.2 - k * 0.22;
      st.box('#8a6a4a', sx, ty, tz, 1.4, 0.035, 0.24);
      for (let i = 0; i < 4; i++) pot(sx - 0.5 + i * 0.33 + (r() - 0.5) * 0.04, ty + 0.018, tz, 0.07 + r() * 0.03, [2, 1, 3, 2][(i + k) % 4]);
    }
    for (const dx of [-0.68, 0.68]) st.beam('#6a4c30', V(sx + dx, F, sz + 0.3), V(sx + dx, F + 1.15, sz - 0.3), 0.04, 0.05);
    W.physics.addBox(sx - 0.72, F, sz - 0.35, sx + 0.72, F + 1.2, sz + 0.35, { walk: false });
  }
  fillBench(X0 + 0.15, X0 + 0.95, Z0 + 0.2, Z1 - 0.2, bW0);
  fillBench(X1 - 0.95, X1 - 0.15, Z0 + 0.2, DZ0 - 0.45, bE1);
  fillBench(X1 - 0.95, X1 - 0.15, DZ1 + 0.45, Z1 - 0.2, bE1);
  // staging table: bigger pots (tomatoes in pots, ferns, geraniums) + a trowel
  for (let i = 0; i < 6; i++) pot(CXg + (i % 2 ? 0.28 : -0.28), bC, -66.0 + i * 0.95 + (r() - 0.5) * 0.1, 0.12 + r() * 0.04, [4, 2, 1, 4, 2, 1][i]);
  // a lemon tree in a big pot by the north end
  {
    const x = CXg, z = Z0 + 0.65, h = 0.42;
    const p = new THREE.CylinderGeometry(0.3, 0.22, h, 16);
    p.translate(0, h / 2, 0);
    st.add(p, '#b9643d', at(x, F, z));
    st.add(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 7), '#6b5038', at(x, F + h + 0.45, z));
    for (let k = 0; k < 14; k++) {
      const a = r() * Math.PI * 2, d = r() * 0.38;
      pl.add(new THREE.IcosahedronGeometry(0.16 + r() * 0.08, 0), C('#3f7a34').multiplyScalar(0.8 + r() * 0.3), at(x + Math.cos(a) * d, F + h + 0.95 + (r() - 0.5) * 0.4, z + Math.sin(a) * d), 0.03);
    }
    for (let k = 0; k < 9; k++) {
      const a = r() * Math.PI * 2, d = 0.25 + r() * 0.2;
      pl.add(new THREE.SphereGeometry(0.035, 8, 6), '#f2d22e', mat4({ x: x + Math.cos(a) * d, y: F + h + 0.8 + r() * 0.4, z: z + Math.sin(a) * d }, undefined, { x: 1, y: 1.25, z: 1 }), 0.03);
    }
    W.physics.addCylinder(x, z, 0.32, F, F + 1.8);
  }
  // compost bags under the west bench, a watering can by the door
  for (let i = 0; i < 3; i++) {
    const bag = new THREE.SphereGeometry(1, 10, 8);
    st.add(bag, i % 2 ? '#3f5a3a' : '#5a4630', mat4({ x: X0 + 0.55, y: F + 0.12, z: -66.6 + i * 0.75 }, { x: 0, y: r(), z: 0 }, { x: 0.3, y: 0.12, z: 0.22 }));
  }
  wateringCan(st, X1 - 0.5, F, DZ1 + 0.25, 2.4, '#9aa3a6');
  W.interact.add({
    pos: new THREE.Vector3(CXg, bC + 0.15, -63.2), radius: 0.6, label: 'Water the seedlings',
    onUse: () => { W.audio.play('water_lap', { pos: new THREE.Vector3(CXg, bC, -63.2), volume: 0.5, rate: 1.4 }); W.toast('You water the seedlings. The greenhouse smells of wet soil and tomato leaves.'); },
  });
  // hanging baskets from the ridge
  for (const z of [-66.2, -64.4, -61.6, -59.8]) {
    const by = ridge - 0.95, bx = CXg;
    const bk = new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    st.add(bk, '#5a4a30', at(bx, by + 0.02, z));
    st.add(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 12), '#4a6a32', at(bx, by + 0.02, z));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      st.rod('#3a3a3a', V(bx + Math.cos(a) * 0.19, by + 0.02, z + Math.sin(a) * 0.19), V(bx, ridge - 0.06, z), 0.004, 3);
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, d = 0.17;
      const len = 0.25 + r() * 0.45;
      for (let s = 0; s < 4; s++) {
        const t = s / 3;
        pl.add(new THREE.IcosahedronGeometry(0.04 - t * 0.012, 0), C('#4e8a3a').multiplyScalar(0.8 + r() * 0.4), at(bx + Math.cos(a) * (d + t * 0.05), by + 0.02 - t * len, z + Math.sin(a) * (d + t * 0.05)), 0.02 + t * 0.03);
      }
      if (r() < 0.6) pl.add(new THREE.IcosahedronGeometry(0.03, 1), ['#c25ad8', '#f3eef0', '#f06d8c'][k % 3], at(bx + Math.cos(a) * 0.12, by + 0.08, z + Math.sin(a) * 0.12), 0.02);
    }
    for (let k = 0; k < 6; k++) pl.add(new THREE.IcosahedronGeometry(0.07, 0), '#4e8a3a', at(bx + (r() - 0.5) * 0.2, by + 0.1, z + (r() - 0.5) * 0.2), 0.02);
  }
}
