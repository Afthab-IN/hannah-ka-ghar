import * as THREE from 'three';

// Simple walking physics: the player is an upright cylinder that slides
// against axis-aligned boxes, vertical cylinders and thick segments. Box tops
// are walkable, so floors, porch decks and every stair step are just boxes.

export interface BoxCol { kind: 'box'; min: THREE.Vector3; max: THREE.Vector3; enabled: boolean; walk: boolean; id: number }
export interface CylCol { kind: 'cyl'; x: number; z: number; r: number; y0: number; y1: number; enabled: boolean; walk: boolean; id: number }
export interface SegCol { kind: 'seg'; ax: number; az: number; bx: number; bz: number; r: number; y0: number; y1: number; enabled: boolean; walk: boolean; id: number }
export type Collider = BoxCol | CylCol | SegCol;

const CELL = 6;

export class Physics {
  private grid = new Map<number, Collider[]>();
  private all: Collider[] = [];
  private nextId = 1;
  terrain: (x: number, z: number) => number = () => 0;
  water: (x: number, z: number) => boolean = () => false; // true where the player may not wade
  bound = { x: 0, z: 0, r: 1e9 };
  /** moving round obstacles, updated by their owners every frame */
  dynamic: { x: number; z: number; r: number; y0: number; y1: number }[] = [];

  private key(i: number, j: number) { return (i + 4096) * 8192 + (j + 4096); }
  private insert(c: Collider, x0: number, z0: number, x1: number, z1: number) {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = this.key(i, j);
        let a = this.grid.get(k);
        if (!a) { a = []; this.grid.set(k, a); }
        a.push(c);
      }
    this.all.push(c);
  }

  /** Axis-aligned box. walk: its top can be stood on (default true). */
  addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: { walk?: boolean } = {}): BoxCol {
    const c: BoxCol = {
      kind: 'box', id: this.nextId++, enabled: true, walk: opts.walk !== false,
      min: new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
    };
    this.insert(c, c.min.x, c.min.z, c.max.x, c.max.z);
    return c;
  }
  /** Box from a centre and full size. */
  addBoxC(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, opts: { walk?: boolean } = {}) {
    return this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, opts);
  }
  /** Box of size (sx, sy, sz) centred at (cx, cy, cz), rotated by yaw: stored as thick segment along its long side. */
  addBoxRot(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, opts: { walk?: boolean } = {}): Collider {
    const q = ((yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if (q < 1e-3 || Math.PI / 2 - q < 1e-3) {
      const swap = Math.round(yaw / (Math.PI / 2)) % 2 !== 0;
      return this.addBoxC(cx, cy, cz, swap ? sz : sx, sy, swap ? sx : sz, opts);
    }
    const long = Math.max(sx, sz), short = Math.min(sx, sz);
    const ax = sx >= sz ? 1 : 0;
    // local long axis -> world (yaw rotates +x toward -z like three's rotation.y)
    const dx = ax ? Math.cos(yaw) : Math.sin(yaw);
    const dz = ax ? -Math.sin(yaw) : Math.cos(yaw);
    const h = long / 2 - short / 2;
    return this.addSegment(cx - dx * h, cz - dz * h, cx + dx * h, cz + dz * h, short / 2, cy - sy / 2, cy + sy / 2, { walk: opts.walk !== false });
  }
  addCylinder(x: number, z: number, r: number, y0: number, y1: number, opts: { walk?: boolean } = {}): CylCol {
    const c: CylCol = { kind: 'cyl', id: this.nextId++, x, z, r, y0, y1, enabled: true, walk: !!opts.walk };
    this.insert(c, x - r, z - r, x + r, z + r);
    return c;
  }
  /** A thick line (fence rails, angled walls). */
  addSegment(ax: number, az: number, bx: number, bz: number, r: number, y0: number, y1: number, opts: { walk?: boolean } = {}): SegCol {
    const c: SegCol = { kind: 'seg', id: this.nextId++, ax, az, bx, bz, r, y0, y1, enabled: true, walk: !!opts.walk };
    this.insert(c, Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r);
    return c;
  }

  query(x: number, z: number, r: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const seen = new Set<number>();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const a = this.grid.get(this.key(i, j));
        if (!a) continue;
        for (const c of a) if (c.enabled && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
      }
    return out;
  }

  private tmp: Collider[] = [];

  /** Highest walkable surface under (x, z) that is no higher than maxY. */
  groundAt(x: number, z: number, maxY: number, r = 0.12): number {
    let g = this.terrain(x, z);
    for (const c of this.query(x, z, r, this.tmp)) {
      if (!c.walk) continue;
      let top = -Infinity;
      if (c.kind === 'box') {
        if (x > c.min.x - r && x < c.max.x + r && z > c.min.z - r && z < c.max.z + r) top = c.max.y;
      } else if (c.kind === 'cyl') {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) top = c.y1;
      } else {
        if (segDist(x, z, c) < c.r + r) top = c.y1;
      }
      if (top <= maxY && top > g) g = top;
    }
    return g;
  }

  /** True if something solid is directly over (x, z) between y0 and y1. */
  ceilingAt(x: number, z: number, y0: number, y1: number, r = 0.2): number {
    let ceil = Infinity;
    for (const c of this.query(x, z, r, this.tmp)) {
      let lo = Infinity;
      if (c.kind === 'box') {
        if (x > c.min.x - r && x < c.max.x + r && z > c.min.z - r && z < c.max.z + r) lo = c.min.y;
      } else if (c.kind === 'cyl') {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2) lo = c.y0;
      } else if (segDist(x, z, c) < c.r + r) lo = c.y0;
      if (lo > y0 && lo < y1 && lo < ceil) ceil = lo;
    }
    return ceil;
  }

  /**
   * Push a cylinder (feet at y, height h, radius r) out of everything it
   * overlaps above step height. Returns the corrected x, z in out.
   */
  resolve(pos: THREE.Vector3, r: number, h: number, step: number) {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const c of this.query(pos.x, pos.z, r + 0.5, this.tmp)) {
        const lo = pos.y + step, hi = pos.y + h;
        if (c.kind === 'box') {
          if (c.max.y <= lo || c.min.y >= hi) continue;
          const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
          const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
          let dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-10) {
            // centre inside the box: leave by the nearest face
            const px = [pos.x - c.min.x, c.max.x - pos.x], pz = [pos.z - c.min.z, c.max.z - pos.z];
            const m = Math.min(px[0], px[1], pz[0], pz[1]);
            if (m === px[0]) pos.x = c.min.x - r; else if (m === px[1]) pos.x = c.max.x + r;
            else if (m === pz[0]) pos.z = c.min.z - r; else pos.z = c.max.z + r;
          } else {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * r;
            pos.z = cz + (dz / d) * r;
          }
          moved = true;
        } else if (c.kind === 'cyl') {
          if (c.y1 <= lo || c.y0 >= hi) continue;
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz), rr = r + c.r;
          if (d >= rr) continue;
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          pos.x = c.x + nx * rr; pos.z = c.z + nz * rr;
          moved = true;
        } else {
          if (c.y1 <= lo || c.y0 >= hi) continue;
          const vx = c.bx - c.ax, vz = c.bz - c.az;
          const t = Math.max(0, Math.min(1, ((pos.x - c.ax) * vx + (pos.z - c.az) * vz) / (vx * vx + vz * vz || 1)));
          const qx = c.ax + vx * t, qz = c.az + vz * t;
          const dx = pos.x - qx, dz = pos.z - qz;
          const d = Math.hypot(dx, dz), rr = r + c.r;
          if (d >= rr) continue;
          const nx = d > 1e-6 ? dx / d : -vz, nz = d > 1e-6 ? dz / d : vx;
          const nl = Math.hypot(nx, nz) || 1;
          pos.x = qx + (nx / nl) * rr; pos.z = qz + (nz / nl) * rr;
          moved = true;
        }
      }
      if (!moved) break;
    }
    // moving things (horses, the cat) push back too
    for (const d of this.dynamic) {
      if (d.y1 <= pos.y + step || d.y0 >= pos.y + h) continue;
      const dx = pos.x - d.x, dz = pos.z - d.z;
      const dd = Math.hypot(dx, dz), rr = r + d.r;
      if (dd >= rr || dd < 1e-6) continue;
      pos.x = d.x + (dx / dd) * rr; pos.z = d.z + (dz / dd) * rr;
    }
    // stay inside the walkable world
    const bx = pos.x - this.bound.x, bz = pos.z - this.bound.z;
    const bd = Math.hypot(bx, bz);
    if (bd > this.bound.r) { pos.x = this.bound.x + (bx / bd) * this.bound.r; pos.z = this.bound.z + (bz / bd) * this.bound.r; }
  }

  /** Ray against colliders (for line of sight). Returns hit distance or Infinity. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, ignoreAt?: THREE.Vector3): number {
    let best = Infinity;
    const steps = Math.ceil(maxT / CELL) + 1;
    const seen = new Set<number>();
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxT, s * CELL);
      for (const c of this.query(o.x + d.x * t, o.z + d.z * t, CELL * 0.75, this.tmp)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        if (c.kind !== 'box') continue;
        if (ignoreAt && ignoreAt.x > c.min.x - 0.05 && ignoreAt.x < c.max.x + 0.05 && ignoreAt.y > c.min.y - 0.05 && ignoreAt.y < c.max.y + 0.3 && ignoreAt.z > c.min.z - 0.05 && ignoreAt.z < c.max.z + 0.05) continue;
        const hit = rayBox(o, d, c.min, c.max);
        if (hit < best && hit <= maxT) best = hit;
      }
    }
    return best;
  }
}

function segDist(x: number, z: number, c: SegCol) {
  const vx = c.bx - c.ax, vz = c.bz - c.az;
  const t = Math.max(0, Math.min(1, ((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(x - c.ax - vx * t, z - c.az - vz * t);
}

export function rayBox(o: THREE.Vector3, d: THREE.Vector3, mn: THREE.Vector3, mx: THREE.Vector3): number {
  let t0 = 0, t1 = Infinity;
  for (const ax of ['x', 'y', 'z'] as const) {
    const inv = 1 / (d[ax] || 1e-12);
    let ta = (mn[ax] - o[ax]) * inv, tb = (mx[ax] - o[ax]) * inv;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  return t0;
}
