import * as THREE from 'three';
import type { Physics } from './physics';

// Things you can use: doors, chairs, horses, bread, the fireplace...
// Each one is a sphere in the world. The one under the crosshair (or under a
// tap on touch screens) within range, and not behind a wall, is the target.

export interface Interactable {
  pos: THREE.Vector3 | (() => THREE.Vector3);
  radius: number;
  label: string | (() => string); // shown as "E  <label>"
  onUse: () => void;
  range?: number; // how close you must be (default 3)
  enabled?: () => boolean;
}

const tmpV = new THREE.Vector3();
const tmpO = new THREE.Vector3();

export class Interactions {
  items: Interactable[] = [];
  target: Interactable | null = null;
  constructor(private physics: Physics) {}

  add(it: Interactable) { this.items.push(it); return it; }
  remove(it: Interactable) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); }

  posOf(it: Interactable) { return typeof it.pos === 'function' ? it.pos() : it.pos; }
  labelOf(it: Interactable) { return typeof it.label === 'function' ? it.label() : it.label; }

  /** Best target along a ray (origin o, unit direction d). */
  pick(o: THREE.Vector3, d: THREE.Vector3): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      const p = this.posOf(it);
      const range = it.range ?? 3;
      tmpV.subVectors(p, o);
      const along = tmpV.dot(d);
      if (along < -it.radius || along > range + it.radius) continue;
      const perp2 = tmpV.lengthSq() - along * along;
      // generous: a little extra room around small things
      const r = it.radius + 0.08 + along * 0.03;
      if (perp2 > r * r) continue;
      if (tmpO.copy(p).sub(o).length() > range + it.radius) continue;
      const score = along + Math.sqrt(Math.max(perp2, 0)) * 2;
      if (score < bestScore) {
        // not behind a wall
        const wall = this.physics.raycast(o, d, Math.max(0, along - it.radius - 0.05), p);
        if (wall < along - it.radius - 0.05) continue;
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  update(o: THREE.Vector3, d: THREE.Vector3) {
    this.target = this.pick(o, d);
    return this.target;
  }

  use(it = this.target) { if (it) it.onUse(); }
}
