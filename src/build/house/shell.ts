import * as THREE from 'three';
import { W } from '../../world';
import { Builder, wall, windowUnit, makeDoor, stairs, gableRoof, gableOutline, type Door, type Hole } from '../kit';
import { M } from '../materials';
import * as D from './dims';
import { quadSlab, lattice, type Props } from './util';
import type { HouseMats } from './mats';

const { X, Z, F, A, G, YB, P, RISE, W2, D2, IX, IZ, T, TI, CEIL, FD, RT, RS, ROV } = D;

/** Walls, floors, windows, doors, roof, chimney, porch, stairs and attic structure. */
export function buildShell(b: Builder, m: HouseMats, props: Props) {
  // axis-aligned box in local house coordinates
  const bx = (mat: THREE.Material, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, collide: boolean | 'nowalk' = false) =>
    b.boxMinMax(mat, X(Math.min(u0, u1)), Math.min(y0, y1), Z(Math.min(v0, v1)), X(Math.max(u0, u1)), Math.max(y0, y1), Z(Math.max(v0, v1)), { collide });

  // ---------------------------------------------------------------- floors
  bx(m.floor, -IX, F - 0.2, 0, IX, F, IZ, true); // living room (whole front)
  bx(m.floor, -IX, F - 0.2, -IZ, -1.7, F, 0, true); // bedroom
  bx(m.bathFloor, -1.7, F - 0.2, -IZ, 0.9, F, 0, true); // bathroom
  bx(m.floor, 0.9, F - 0.2, -IZ, IX, F, 0, true); // kitchen
  // foundation band and the water table board at the foot of the siding
  bx(m.brick, -W2 - 0.13, G - 0.3, -D2 - 0.13, W2 + 0.13, F - 0.1, D2 + 0.13, 'nowalk');
  bx(m.trim, -W2 - 0.135, F - 0.17, D2 + 0.1, W2 + 0.135, F + 0.03, D2 + 0.135);
  bx(m.trim, -W2 - 0.135, F - 0.17, -D2 - 0.135, W2 + 0.135, F + 0.03, -D2 - 0.1);
  bx(m.trim, -W2 - 0.135, F - 0.17, -D2 - 0.1, -W2 - 0.1, F + 0.03, D2 + 0.1);
  bx(m.trim, W2 + 0.1, F - 0.17, -D2 - 0.1, W2 + 0.135, F + 0.03, D2 + 0.1);

  // ---------------------------------------------------------------- exterior walls
  const hEave = P + 0.09 - YB;
  const hole = (c: number, w: number, y0: number, y1: number, start: number): Hole => ({ u0: c - w / 2 - start, u1: c + w / 2 - start, y0: y0 - YB, y1: y1 - YB });
  const WIN = { w: 0.95, y0: F + 0.75, y1: F + 2.35 }; // tall double-hung
  const frontWins = [-4.1, -1.85, 1.85, 4.1];
  wall(b, {
    a: [X(-W2 - 0.1), Z(D2)], b: [X(W2 + 0.1), Z(D2)], y: YB, h: hEave, t: T, outer: m.siding, inner: m.plaster, outSide: -1,
    holes: [hole(0, 0.96, F, F + 2.12, -W2 - 0.1), ...frontWins.map((u) => hole(u, WIN.w, WIN.y0, WIN.y1, -W2 - 0.1))],
  });
  const backWins = [
    { u: -2.2, w: 0.7, y0: F + 0.9, y1: F + 2.3, mun: [2, 4] as [number, number] }, // bedroom
    { u: -0.7, w: 0.6, y0: F + 1.3, y1: F + 2.1, mun: [2, 2] as [number, number] }, // bathroom
    { u: 3.75, w: 0.95, y0: F + 1.08, y1: F + 2.13, mun: [3, 2] as [number, number] }, // kitchen sink
  ];
  wall(b, {
    a: [X(-W2 - 0.1), Z(-D2)], b: [X(W2 + 0.1), Z(-D2)], y: YB, h: hEave, t: T, outer: m.siding, inner: m.plaster, outSide: 1,
    holes: [hole(1.61, 0.94, F, F + 2.12, -W2 - 0.1), ...backWins.map((w) => hole(w.u, w.w, w.y0, w.y1, -W2 - 0.1))],
  });
  // gable ends: the top edge follows the roof underside exactly
  const L = 2 * IZ;
  const hE = D.roofUnder(IZ) - YB;
  const attic = { w: 0.75, y0: A + 1.15, y1: A + 2.1 };
  wall(b, {
    a: [X(-W2), Z(-IZ)], b: [X(-W2), Z(IZ)], y: YB, h: hE, t: T, outer: m.siding, inner: m.plaster, outSide: -1,
    outline: gableOutline(L, hE, RISE * (IZ / D2)),
    holes: [hole(2, WIN.w, WIN.y0, WIN.y1, -IZ), hole(-2, WIN.w, WIN.y0, WIN.y1, -IZ), hole(0, attic.w, attic.y0, attic.y1, -IZ)],
  });
  const kWin = { v: -2.3, w: 0.9, y0: F + 1.08, y1: F + 2.13 };
  wall(b, {
    a: [X(W2), Z(-IZ)], b: [X(W2), Z(IZ)], y: YB, h: hE, t: T, outer: m.siding, inner: m.plaster, outSide: 1,
    outline: gableOutline(L, hE, RISE * (IZ / D2)),
    holes: [hole(2, WIN.w, WIN.y0, WIN.y1, -IZ), hole(kWin.v, kWin.w, kWin.y0, kWin.y1, -IZ), hole(0, attic.w, attic.y0, attic.y1, -IZ)],
  });
  // corner boards and the frieze under the eaves
  for (const su of [-1, 1]) for (const sv of [-1, 1]) {
    const ou = su * (W2 + 0.1), ov = sv * (D2 + 0.1);
    bx(m.trim, ou - su * 0.22, YB, ov, ou + su * 0.035, P - 0.1, ov + sv * 0.03);
    bx(m.trim, ou, YB, ov - sv * 0.2, ou + su * 0.035, P - 0.1, ov + sv * 0.03);
  }
  for (const sv of [-1, 1]) bx(m.trim, -W2 - 0.1, P - 0.34, sv * (D2 + 0.1), W2 + 0.1, P - 0.1, sv * (D2 + 0.125));

  // ---------------------------------------------------------------- windows
  const win = (u: number, v: number, y: number, w: number, h: number, n: [number, number], mun: [number, number], shutters: boolean) =>
    windowUnit(b, { x: X(u), y, z: Z(v), w, h, n, wallT: T, frame: m.trim, glass: m.glass, muntins: mun, shutters: shutters ? m.black : null });
  const wy = (WIN.y0 + WIN.y1) / 2, wh = WIN.y1 - WIN.y0;
  for (const u of frontWins) win(u, D2, wy, WIN.w, wh, [0, 1], [3, 4], true);
  for (const w of backWins) win(w.u, -D2, (w.y0 + w.y1) / 2, w.w, w.y1 - w.y0, [0, -1], w.mun, false);
  for (const s of [-1, 1]) {
    win(s * W2, 2, wy, WIN.w, wh, [s, 0], [3, 4], true);
    win(s * W2, 0, (attic.y0 + attic.y1) / 2, attic.w, attic.y1 - attic.y0, [s, 0], [2, 3], false);
  }
  win(-W2, -2, wy, WIN.w, wh, [-1, 0], [3, 4], true);
  win(W2, kWin.v, (kWin.y0 + kWin.y1) / 2, kWin.w, kWin.y1 - kWin.y0, [1, 0], [3, 2], false);

  // ---------------------------------------------------------------- interior walls
  const pl = m.plaster;
  wall(b, {
    a: [X(-IX), Z(0)], b: [X(IX), Z(0)], y: F, h: CEIL, t: TI, outer: pl, inner: pl, outSide: 1,
    holes: [{ u0: 0.24, u1: 1.18, y0: 0, y1: 2.12 }, { u0: 8.85, u1: 10.05, y0: 0, y1: 2.2 }],
  });
  wall(b, { a: [X(-1.7), Z(-IZ)], b: [X(-1.7), Z(-TI / 2)], y: F, h: CEIL, t: TI, outer: pl, inner: pl, outSide: 1 });
  wall(b, {
    a: [X(0.9), Z(-IZ)], b: [X(0.9), Z(-TI / 2)], y: F, h: CEIL, t: TI, outer: pl, inner: pl, outSide: 1,
    holes: [{ u0: 2.74, u1: 3.66, y0: 0, y1: 2.07 }],
  });
  // door linings and casings: along 'x' = wall runs along x at v = c
  const opening = (along: 'x' | 'z', c: number, s0: number, s1: number, h: number, t: number, inSide: boolean, outSide: boolean, casingMat = m.trim) => {
    const cw = 0.09, ct = 0.022;
    if (along === 'x') {
      bx(casingMat, s0 - 0.015, F, c - t / 2, s0, F + h, c + t / 2);
      bx(casingMat, s1, F, c - t / 2, s1 + 0.015, F + h, c + t / 2);
      bx(casingMat, s0 - 0.015, F + h - 0.015, c - t / 2, s1 + 0.015, F + h, c + t / 2);
      for (const sd of [-1, 1]) {
        if ((sd > 0 && !outSide) || (sd < 0 && !inSide)) continue;
        const f = c + sd * t / 2;
        bx(casingMat, s0 - cw, F, f, s0, F + h + cw, f + sd * ct);
        bx(casingMat, s1, F, f, s1 + cw, F + h + cw, f + sd * ct);
        bx(casingMat, s0 - cw - 0.02, F + h, f, s1 + cw + 0.02, F + h + cw + 0.03, f + sd * (ct + 0.008));
      }
    } else {
      bx(casingMat, c - t / 2, F, s0 - 0.015, c + t / 2, F + h, s0);
      bx(casingMat, c - t / 2, F, s1, c + t / 2, F + h, s1 + 0.015);
      bx(casingMat, c - t / 2, F + h - 0.015, s0 - 0.015, c + t / 2, F + h, s1 + 0.015);
      for (const sd of [-1, 1]) {
        if ((sd > 0 && !outSide) || (sd < 0 && !inSide)) continue;
        const f = c + sd * t / 2;
        bx(casingMat, f, F, s0 - cw, f + sd * ct, F + h + cw, s0);
        bx(casingMat, f, F, s1, f + sd * ct, F + h + cw, s1 + cw);
        bx(casingMat, f, F + h, s0 - cw - 0.02, f + sd * (ct + 0.008), F + h + cw + 0.03, s1 + cw + 0.02);
      }
    }
  };
  opening('x', D2, -0.48, 0.48, 2.12, T, true, true); // front door
  opening('x', -D2, 1.14, 2.08, 2.12, T, true, true); // back door
  opening('x', 0, -5.16, -4.22, 2.12, TI, true, true); // bedroom
  opening('x', 0, 3.45, 4.65, 2.2, TI, true, true); // kitchen
  opening('z', 0.9, -1.16, -0.24, 2.07, TI, true, true); // bathroom
  // thresholds
  bx(m.woodDark, -0.48, F - 0.03, D2 - 0.1, 0.48, F + 0.012, D2 + 0.16, true);
  bx(m.woodDark, 1.14, F - 0.03, -D2 - 0.16, 2.08, F + 0.012, -D2 + 0.1, true);
  // baseboards in the living room and bedroom (skip door holes)
  const base = (u0: number, v0: number, u1: number, v1: number) => bx(m.trim, u0, F, v0, u1, F + 0.13, v1);
  base(-IX, IZ - 0.02, -0.6, IZ); base(0.6, IZ - 0.02, IX, IZ);
  base(-IX, 0.06, -IX + 0.02, IZ); base(IX - 0.02, 0.06, IX, IZ);
  base(-IX, 0.06, -5.25, 0.08); base(-4.13, 0.06, D.ST_BOT_U, 0.08); base(D.ST_TOP_U, 0.06, 1.3, 0.08); base(2.8, 0.06, 3.36, 0.08); base(4.74, 0.06, IX, 0.08);
  base(-IX, -0.08, -5.25, -0.06); base(-4.13, -0.08, -1.76, -0.06);
  base(-IX, -IZ, -1.76, -IZ + 0.02); base(-IX, -IZ, -IX + 0.02, -0.06); base(-1.78, -IZ, -1.76, -0.06);

  // ---------------------------------------------------------------- doors
  const doors: Door[] = [];
  const doorPaint = M.paint('#76502f', 0.55);
  const white = M.paint('#efece3', 0.5);
  doors.push(makeDoor({ hinge: new THREE.Vector3(X(-0.47), F + 0.012, Z(D2)), w: 0.94, h: 2.1, dir: [1, 0], swing: 1, mat: doorPaint, glass: M.glass(0.6), name: 'front door' }));
  doors.push(makeDoor({ hinge: new THREE.Vector3(X(1.15), F + 0.012, Z(-D2)), w: 0.92, h: 2.1, dir: [1, 0], swing: -1, mat: doorPaint, glass: M.glass(0.6), name: 'back door' }));
  doors.push(makeDoor({ hinge: new THREE.Vector3(X(-5.15), F, Z(0)), w: 0.92, h: 2.1, dir: [1, 0], swing: 1, mat: white, name: 'bedroom door' }));
  doors.push(makeDoor({ hinge: new THREE.Vector3(X(0.9), F, Z(-0.25)), w: 0.9, h: 2.05, dir: [0, -1], swing: 1, mat: white, name: 'bathroom door' }));
  doors.forEach((d, i) => {
    // only the outside doors' leaves need to block the sun
    d.group.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) me.castShadow = i < 2 && !(me.material as THREE.Material).transparent; });
    W.scene.add(d.group);
  });

  // ---------------------------------------------------------------- ceiling / attic floor
  const slab = (u0: number, v0: number, u1: number, v1: number) => {
    bx(m.bead, u0, F + CEIL, v0, u1, F + 2.86, v1, true);
    bx(m.floor, u0, F + 2.86, v0, u1, A, v1, true);
  };
  slab(-IX, -IZ, IX, D.OPEN_V0);
  slab(-IX, D.OPEN_V1, IX, IZ);
  slab(-IX, D.OPEN_V0, D.OPEN_U0, D.OPEN_V1);
  slab(D.ST_TOP_U, D.OPEN_V0, IX, D.OPEN_V1);
  // living room ceiling joists
  for (let u = -4.8; u <= 4.81; u += 1.2) {
    let v0 = 0.06;
    if (u > D.OPEN_U0 - 0.1 && u < D.ST_TOP_U + 0.1) v0 = D.OPEN_V1;
    if (u > 1.25 && u < 2.85) v0 = 0.66;
    bx(m.woodDark, u - 0.06, F + CEIL - 0.15, v0, u + 0.06, F + CEIL, IZ);
  }
  // a beam along the stair opening edge
  bx(m.woodDark, -IX, F + CEIL - 0.17, D.OPEN_V1, IX, F + CEIL, D.OPEN_V1 + 0.14);

  // ---------------------------------------------------------------- stairs
  stairs(b, { x: X(D.ST_BOT_U), z: Z(D.ST_V), dir: [1, 0], w: D.ST_W, y0: F, y1: A, run: D.ST_RUN, mat: m.woodDark, riserMat: m.bead, stringer: null });
  const r = (A - F) / D.ST_N, slope = Math.atan2(r, D.ST_RUN);
  const railV = 1.02;
  {
    // closed stringer: a dark board along the nosing line on the open side, up to the ceiling
    const nose = (u: number) => F + r + (u - D.ST_BOT_U) * Math.tan(slope);
    const u0 = D.ST_BOT_U, u1 = D.ST_BOT_U + (F + CEIL - 0.02 - (F + r)) / Math.tan(slope);
    const len = (u1 - u0) / Math.cos(slope), cu = (u0 + u1) / 2, th = 0.26;
    b.box(m.woodDark, X(cu), nose(cu) - (th / 2) / Math.cos(slope) + 0.02, Z(D.ST_V + D.ST_W / 2 + 0.012), len, th, 0.025, { rotZ: slope, collide: false });
    bx(m.woodDark, u0 - 0.012, F, D.ST_V + D.ST_W / 2 - 0.0, u0 + 0.012, F + r + 0.02, D.ST_V + D.ST_W / 2 + 0.025);
  }
  // newel, sloped handrail and balusters on the open side, up to where it meets the ceiling
  bx(m.woodDark, D.ST_BOT_U - 0.05, F, railV - 0.05, D.ST_BOT_U + 0.05, F + 1.12, railV + 0.05);
  bx(m.woodDark, D.ST_BOT_U - 0.065, F + 1.12, railV - 0.065, D.ST_BOT_U + 0.065, F + 1.17, railV + 0.065);
  const railY = (u: number) => F + r + 0.9 + (u - (D.ST_BOT_U + D.ST_RUN / 2)) * Math.tan(slope);
  const uEnd = D.ST_BOT_U + D.ST_RUN / 2 + (F + CEIL - (F + r + 0.9)) / Math.tan(slope);
  {
    const u0 = D.ST_BOT_U, u1 = uEnd;
    const len = (u1 - u0) / Math.cos(slope);
    const cu = (u0 + u1) / 2;
    b.box(m.woodDark, X(cu), railY(cu) + 0.02, Z(railV), len, 0.07, 0.07, { rotZ: slope, collide: false });
    for (let i = 0; i < D.ST_N; i++) {
      const u = D.ST_BOT_U + (i + 0.5) * D.ST_RUN;
      if (u > u1 - 0.05) break;
      const y0 = F + r * (i + 1);
      bx(m.trim, u - 0.017, y0, railV - 0.017, u + 0.017, railY(u), railV + 0.017);
    }
    W.physics.addBox(X(D.ST_BOT_U), F, Z(railV - 0.04), X(u1), F + CEIL, Z(railV + 0.06), { walk: false });
  }
  // railing round the stairwell opening upstairs (open at the east end where you arrive)
  const rail = (u0: number, v0: number, u1: number, v1: number, y: number, h = 0.92, post = true) => {
    const alongX = Math.abs(v1 - v0) < 1e-3;
    const Lr = alongX ? Math.abs(u1 - u0) : Math.abs(v1 - v0);
    if (alongX) {
      bx(m.woodDark, u0, y + h - 0.06, v0 - 0.035, u1, y + h, v0 + 0.035);
      bx(m.trim, u0, y + 0.06, v0 - 0.02, u1, y + 0.1, v0 + 0.02);
    } else {
      bx(m.woodDark, u0 - 0.035, y + h - 0.06, v0, u0 + 0.035, y + h, v1);
      bx(m.trim, u0 - 0.02, y + 0.06, v0, u0 + 0.02, y + 0.1, v1);
    }
    const n = Math.max(1, Math.round(Lr / 0.12));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      bx(m.trim, u - 0.016, y + 0.1, v - 0.016, u + 0.016, y + h - 0.06, v + 0.016);
    }
    if (post) for (const [pu, pv] of [[u0, v0], [u1, v1]]) bx(m.woodDark, pu - 0.045, y, pv - 0.045, pu + 0.045, y + h + 0.06, pv + 0.045);
    W.physics.addBox(X(Math.min(u0, u1) - 0.05), y, Z(Math.min(v0, v1) - 0.05), X(Math.max(u0, u1) + 0.05), y + 1.3, Z(Math.max(v0, v1) + 0.05), { walk: false });
  };
  rail(D.OPEN_U0 - 0.04, 0.02, D.ST_TOP_U, 0.02, A);
  rail(D.OPEN_U0 - 0.04, D.OPEN_V1 + 0.04, D.ST_TOP_U, D.OPEN_V1 + 0.04, A);
  rail(D.OPEN_U0 - 0.04, 0.02, D.OPEN_U0 - 0.04, D.OPEN_V1 + 0.04, A, 0.92, false);

  // ---------------------------------------------------------------- attic: knee walls, slope colliders, collar ties
  for (const s of [-1, 1]) {
    bx(m.bead, -IX, A, s * (D.KNEE_V - 0.04), IX, A + D.KNEE_H + 0.03, s * (D.KNEE_V + 0.04));
    bx(m.trim, -IX, A, s * (D.KNEE_V - 0.055), IX, A + 0.12, s * (D.KNEE_V - 0.04));
    // keep the player under the tall part of the ceiling (head room ~1.95 m)
    W.physics.addBox(X(-IX), A, Z(s > 0 ? D.ATTIC_WALK_V + 0.28 : -D.KNEE_V - 0.1), X(IX), A + 3.2, Z(s > 0 ? D.KNEE_V + 0.1 : -D.ATTIC_WALK_V - 0.28), { walk: false });
  }
  const tieY = A + 2.55;
  const tieV = D2 * (1 - (tieY + 0.16 - P) / RISE) + 0.01; // ends where the tie's top meets the slope
  for (const u of [-4.7, -3.2, -1.6, 0.2, 3.4, 4.9]) bx(m.woodDark, u - 0.06, tieY, -tieV, u + 0.06, tieY + 0.16, tieV);

  // ---------------------------------------------------------------- roof
  gableRoof(b, { cx: X(0), cz: Z(0), y: P, len: 2 * (W2 + 0.1), span: 2 * D2, rise: RISE, ridge: 'x', overhang: D.OV, t: 0.12, mat: m.roofX, under: m.bead, fascia: m.trim });
  {
    // white rake boards on the gable edges
    const t = 0.12, half = D2, sl = Math.atan2(RISE, half);
    const tan = Math.tan(sl), cos = Math.cos(sl), sin = Math.sin(sl);
    const run = half + D.OV, hd = run / 2;
    const yl = P + RISE - hd * tan;
    const cy = yl + (cos * t) / 2;
    for (const e of [-1, 1]) for (const s of [-1, 1]) {
      const off = 0.06;
      b.box(m.trim, X(e * (W2 + 0.1 + D.OV + 0.02)), cy - off * cos, Z(s * (hd + (sin * t) / 2) - s * off * sin), 0.045, 0.27, run / cos + 0.04, { rotX: s * sl, collide: false });
    }
  }

  // ---------------------------------------------------------------- chimney + fireplace
  const { CH_U0, CH_U1, CH_V0, CH_V1, CH_TOP, FP_U } = D;
  bx(m.brick, CH_U0, F + CEIL, CH_V0, CH_U1, CH_TOP - 0.2, CH_V1, 'nowalk');
  bx(m.brick, CH_U0 - 0.07, CH_TOP - 0.2, CH_V0 - 0.07, CH_U1 + 0.07, CH_TOP - 0.07, CH_V1 + 0.07);
  bx(m.stone, CH_U0 - 0.04, CH_TOP - 0.07, CH_V0 - 0.04, CH_U1 + 0.04, CH_TOP, CH_V1 + 0.04);
  bx(m.black, CH_U0 + 0.15, CH_TOP - 0.02, CH_V0 + 0.14, CH_U1 - 0.15, CH_TOP + 0.005, CH_V1 - 0.14);
  props.cyl(X(FP_U - 0.18), CH_TOP, Z(0), 0.1, 0.32, '#9c5434');
  props.cyl(X(FP_U + 0.18), CH_TOP, Z(0), 0.1, 0.26, '#9c5434');
  // breast on the living room side of the spine wall, with a firebox
  const fb = { u0: FP_U - 0.4, u1: FP_U + 0.4, y1: F + 0.85, back: 0.2, front: 0.66 };
  bx(m.brick, 1.3, F, 0.06, fb.u0, F + CEIL, fb.front, 'nowalk');
  bx(m.brick, fb.u1, F, 0.06, 2.8, F + CEIL, fb.front, 'nowalk');
  bx(m.brick, fb.u0, fb.y1, 0.06, fb.u1, F + CEIL, fb.front, 'nowalk');
  bx(m.brick, fb.u0, F, 0.06, fb.u1, fb.y1, fb.back, 'nowalk');
  bx(m.stone, fb.u0, F, fb.back, fb.u1, F + 0.06, fb.front, 'nowalk');
  bx(m.black, fb.u0, F + 0.06, fb.back, fb.u0 + 0.02, fb.y1, fb.front - 0.01);
  bx(m.black, fb.u1 - 0.02, F + 0.06, fb.back, fb.u1, fb.y1, fb.front - 0.01);
  bx(m.black, fb.u0, F + 0.06, fb.back, fb.u1, fb.y1, fb.back + 0.02);
  bx(m.black, fb.u0, fb.y1 - 0.02, fb.back, fb.u1, fb.y1, fb.front - 0.01);
  bx(m.stone, 1.15, F, fb.front, 2.95, F + 0.05, fb.front + 0.42, true); // hearth
  bx(m.woodDark, 1.1, F + 1.24, fb.front - 0.04, 3.0, F + 1.31, fb.front + 0.2); // mantel shelf
  bx(m.woodDark, 1.22, F + 1.12, fb.front - 0.02, 2.88, F + 1.24, fb.front + 0.08);
  for (const u of [1.3, 2.8]) bx(m.woodDark, u - 0.05, F + 1.0, fb.front, u + 0.05, F + 1.24, fb.front + 0.12);

  buildPorch(bx, b, m);
  buildBackStoop(bx, b, m);
  return { doors };
}

type Bx = (mat: THREE.Material, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, collide?: boolean | 'nowalk') => void;

// ------------------------------------------------------------------ porch
function buildPorch(bx: Bx, b: Builder, m: HouseMats) {
  const PF = D.PORCH_FRONT, PE = D.PORCH_EAST;
  const wallV = D2 + 0.1, wallU = W2 + 0.1;
  // decks (front, and down the east side)
  bx(m.deck, -wallU, FD - 0.12, wallV, PE, FD, PF, true);
  bx(m.deck, wallU, FD - 0.12, -wallV, PE, FD, wallV, true);
  // rim boards
  bx(m.trim, -wallU - 0.03, FD - 0.27, PF, PE + 0.03, FD - 0.005, PF + 0.035);
  bx(m.trim, PE, FD - 0.27, -wallV - 0.03, PE + 0.035, FD - 0.005, PF + 0.035);
  bx(m.trim, -wallU - 0.035, FD - 0.27, wallV, -wallU, FD - 0.005, PF);
  bx(m.trim, wallU, FD - 0.27, -wallV - 0.035, PE + 0.03, FD - 0.005, -wallV);
  // skirting: dark void behind white lattice
  const ly0 = G - 0.08, ly1 = FD - 0.27;
  const sw = 0.95; // steps half width
  bx(m.black, -wallU + 0.04, ly0, PF - 0.08, -sw, ly1, PF - 0.05);
  bx(m.black, sw, ly0, PF - 0.08, PE - 0.06, ly1, PF - 0.05);
  bx(m.black, PE - 0.08, ly0, -wallV + 0.03, PE - 0.05, ly1, PF - 0.06);
  bx(m.black, -wallU + 0.03, ly0, wallV, -wallU + 0.06, ly1, PF - 0.06);
  bx(m.black, wallU, ly0, -wallV + 0.03, PE - 0.06, ly1, -wallV + 0.06);
  lattice(b, m.trim, 'x', Z(PF - 0.02), X(-wallU), X(-sw), ly0, ly1);
  lattice(b, m.trim, 'x', Z(PF - 0.02), X(sw), X(PE), ly0, ly1);
  lattice(b, m.trim, 'z', X(PE - 0.02), Z(-wallV), Z(PF), ly0, ly1);
  lattice(b, m.trim, 'z', X(-wallU + 0.02), Z(wallV), Z(PF), ly0, ly1);
  lattice(b, m.trim, 'x', Z(-wallV + 0.02), X(wallU), X(PE), ly0, ly1);

  // posts
  const BV = D.BEAM_V, BU = D.BEAM_U;
  const frontPosts = [-5.45, -3.25, -1.05, 1.05, 3.25, 5.5, BU];
  const eastPosts = [4.21, 2.17, 0.13, -1.91, -3.95];
  const post = (u: number, v: number) => {
    bx(m.trim, u - 0.075, FD, v - 0.075, u + 0.075, D.BEAM_BOT, v + 0.075, 'nowalk');
    bx(m.trim, u - 0.1, FD, v - 0.1, u + 0.1, FD + 0.14, v + 0.1);
    bx(m.trim, u - 0.1, D.BEAM_BOT - 0.08, v - 0.1, u + 0.1, D.BEAM_BOT - 0.03, v + 0.1);
  };
  for (const u of frontPosts) post(u, BV);
  for (const v of eastPosts) post(BU, v);
  // pilasters against the house at the porch ends
  bx(m.trim, -5.52, FD, wallV, -5.38, D.BEAM_BOT + 0.1, wallV + 0.05);
  bx(m.trim, wallU, FD, -3.95 - 0.07, wallU + 0.05, D.BEAM_BOT + 0.1, -3.95 + 0.07);
  // beams
  bx(m.trim, -wallU, D.BEAM_BOT, BV - 0.09, BU + 0.09, D.BEAM_TOP, BV + 0.09);
  bx(m.trim, BU - 0.09, D.BEAM_BOT, -wallV - 0.02, BU + 0.09, D.BEAM_TOP, BV + 0.09);
  // back-to-wall beams at the ends
  bx(m.trim, -5.52, D.BEAM_BOT, wallV, -5.38, D.BEAM_TOP, BV);
  bx(m.trim, wallU, D.BEAM_BOT, -4.02, BU, D.BEAM_TOP, -3.88);

  // railings between posts (open at the steps)
  const railing = (u0: number, v0: number, u1: number, v1: number) => {
    const alongX = Math.abs(v1 - v0) < 1e-3;
    const y = FD, h = 0.9;
    const len = alongX ? Math.abs(u1 - u0) : Math.abs(v1 - v0);
    if (alongX) {
      bx(m.trim, u0, y + h - 0.06, v0 - 0.045, u1, y + h, v0 + 0.045);
      bx(m.trim, u0, y + 0.09, v0 - 0.03, u1, y + 0.15, v0 + 0.03);
    } else {
      bx(m.trim, u0 - 0.045, y + h - 0.06, v0, u0 + 0.045, y + h, v1);
      bx(m.trim, u0 - 0.03, y + 0.09, v0, u0 + 0.03, y + 0.15, v1);
    }
    const n = Math.max(1, Math.round(len / 0.115));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      bx(m.trim, u - 0.019, y + 0.15, v - 0.019, u + 0.019, y + h - 0.06, v + 0.019);
    }
    const tu = alongX ? 0 : 0.06, tv = alongX ? 0.06 : 0;
    W.physics.addBox(X(Math.min(u0, u1) - tu), y - 0.2, Z(Math.min(v0, v1) - tv), X(Math.max(u0, u1) + tu), y + 1.35, Z(Math.max(v0, v1) + tv), { walk: false });
  };
  for (let i = 0; i < frontPosts.length - 1; i++) {
    const a = frontPosts[i], c = frontPosts[i + 1];
    if (a === -1.05) continue; // the steps
    railing(a + 0.075, BV, c - 0.075, BV);
  }
  const eastAll = [BV, ...eastPosts];
  for (let i = 0; i < eastAll.length - 1; i++) railing(BU, eastAll[i] - 0.075, BU, eastAll[i + 1] + 0.075);
  railing(-5.45, wallV, -5.45, BV - 0.075);
  railing(wallU, -3.95, BU - 0.075, -3.95);

  // front steps down to the path (the last riser is the deck edge)
  const stepsZ = PF + 0.9;
  stairs(b, { x: X(0), z: Z(stepsZ), dir: [0, -1], w: 2 * sw, y0: G - 0.02, y1: FD, run: 0.3, mat: m.deck, riserMat: m.trim, stringer: null });
  for (const s of [-1, 1]) {
    const u = s * 1.03;
    bx(m.trim, u - 0.06, G - 0.05, stepsZ - 0.14, u + 0.06, G + 1.0, stepsZ - 0.02, 'nowalk');
    bx(m.trim, u - 0.075, G + 1.0, stepsZ - 0.155, u + 0.075, G + 1.05, stepsZ - 0.005);
    // sloped handrail from the post down to the newel, over a sloped string board
    const y0 = FD + 0.88, y1 = G + 0.97;
    const v0 = BV + 0.08, v1 = stepsZ - 0.08;
    const ang = Math.atan2(y0 - y1, v1 - v0);
    const len = Math.hypot(y0 - y1, v1 - v0);
    b.box(m.trim, X(u), (y0 + y1) / 2, Z((v0 + v1) / 2), 0.07, 0.06, len, { rotX: ang, collide: false });
    const s0 = FD - 0.02, s1 = G + 0.1; // string board line from the deck edge to the bottom newel
    const sa = Math.atan2(s0 - s1, v1 - PF), sl = Math.hypot(s0 - s1, v1 - PF);
    b.box(m.trim, X(u), (s0 + s1) / 2, Z((PF + v1) / 2), 0.05, 0.2, sl, { rotX: sa, collide: false });
    for (let k = 1; k <= 5; k++) {
      const v = PF + ((v1 - PF) * k) / 6;
      const top = y0 + ((y1 - y0) * (v - v0)) / (v1 - v0);
      const bot = s0 + ((s1 - s0) * (v - PF)) / (v1 - PF);
      bx(m.trim, u - 0.019, bot, v - 0.019, u + 0.019, top, v + 0.019);
    }
  }

  // roof: two shed planes meeting in a hip over the corner
  const eV = PF + ROV, eU = PE + ROV, wU = -wallU - ROV, nV = -wallV - ROV;
  const yEdge = RT - RS * (eV - wallV);
  const p = (u: number, y: number, v: number) => new THREE.Vector3(X(u), y, Z(v));
  const front = [p(wU, RT, wallV), p(wallU, RT, wallV), p(eU, yEdge, eV), p(wU, yEdge, eV)];
  const east = [p(wallU, RT, nV), p(eU, yEdge, nV), p(eU, yEdge, eV), p(wallU, RT, wallV)];
  b.geo(m.roofX, quadSlab(front, 0.1), { x: 0, y: 0, z: 0 });
  b.geo(m.roofZ, quadSlab(east, 0.1), { x: 0, y: 0, z: 0 });
  const down = (q: THREE.Vector3[], dy: number) => q.map((v) => v.clone().setY(v.y - dy));
  b.geo(m.porchCeil, quadSlab(down(front, 0.1), 0.02), { x: 0, y: 0, z: 0 });
  b.geo(m.porchCeil, quadSlab(down(east, 0.1), 0.02), { x: 0, y: 0, z: 0 });
  // fascia boards on the roof edges
  bx(m.trim, wU, yEdge - 0.2, eV, eU + 0.03, yEdge + 0.01, eV + 0.03);
  bx(m.trim, eU, yEdge - 0.2, nV, eU + 0.03, yEdge + 0.01, eV + 0.03);
  {
    const run = eV - wallV, ang = Math.atan2(RS * run, run), len = Math.hypot(run, RS * run);
    b.box(m.trim, X(wU - 0.015), (RT + yEdge) / 2 - 0.08, Z((wallV + eV) / 2), 0.03, 0.2, len, { rotX: ang, collide: false });
    b.box(m.trim, X((wallU + eU) / 2), (RT + yEdge) / 2 - 0.08, Z(nV - 0.015), len, 0.2, 0.03, { rotZ: -ang, collide: false });
  }
}

// ------------------------------------------------------------------ back stoop with a little hood over the door
function buildBackStoop(bx: Bx, b: Builder, m: HouseMats) {
  const u0 = 0.75, u1 = 2.47, v0 = -D2 - 0.1, v1 = -D2 - 1.2;
  bx(m.deck, u0, FD - 0.12, v1, u1, FD, v0, true);
  bx(m.trim, u0 - 0.03, FD - 0.27, v1 - 0.03, u1 + 0.03, FD - 0.005, v1);
  bx(m.trim, u0 - 0.03, FD - 0.27, v1, u0, FD - 0.005, v0);
  bx(m.trim, u1, FD - 0.27, v1, u1 + 0.03, FD - 0.005, v0);
  bx(m.black, u0 + 0.04, G - 0.08, v1 + 0.04, u1 - 0.04, FD - 0.27, v0);
  stairs(b, { x: X((u0 + u1) / 2), z: Z(v1 - 0.9), dir: [0, 1], w: 1.2, y0: G - 0.02, y1: FD, run: 0.3, mat: m.deck, riserMat: m.trim, stringer: null });
  // side rails on the landing
  for (const u of [u0 + 0.04, u1 - 0.04]) {
    bx(m.trim, u - 0.04, FD, v1 + 0.0, u + 0.04, FD + 0.95, v1 + 0.08, 'nowalk');
    bx(m.trim, u - 0.035, FD + 0.86, v1, u + 0.035, FD + 0.92, v0);
    for (let k = 1; k < 9; k++) { const v = v1 + ((v0 - v1) * k) / 9; bx(m.trim, u - 0.017, FD + 0.1, v - 0.017, u + 0.017, FD + 0.86, v + 0.017); }
    W.physics.addBox(X(u - 0.05), FD, Z(v1), X(u + 0.05), FD + 1.3, Z(v0), { walk: false });
  }
  // hood roof on brackets
  const hy = F + 2.62, out = 1.0;
  const q = (u: number, y: number, v: number) => new THREE.Vector3(X(u), y, Z(v));
  const hood = [q(u0 - 0.1, hy, v0), q(u1 + 0.1, hy, v0), q(u1 + 0.1, hy - 0.25, v0 - out), q(u0 - 0.1, hy - 0.25, v0 - out)];
  b.geo(m.roofX, quadSlab(hood, 0.08), { x: 0, y: 0, z: 0 });
  b.geo(m.porchCeil, quadSlab(hood.map((v) => v.clone().setY(v.y - 0.08)), 0.02), { x: 0, y: 0, z: 0 });
  bx(m.trim, u0 - 0.1, hy - 0.42, v0 - out - 0.03, u1 + 0.1, hy - 0.24, v0 - out);
  for (const u of [u0 - 0.02, u1 + 0.02]) {
    bx(m.trim, u - 0.04, hy - 0.75, v0 - 0.06, u + 0.04, hy - 0.1, v0);
    b.box(m.trim, X(u), hy - 0.42, Z(v0 - 0.38), 0.07, 0.07, 0.75, { rotX: 0.75, collide: false });
  }
}
