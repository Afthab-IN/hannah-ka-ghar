import * as THREE from 'three';
import { U, MAX_LAMPS } from './shaderlib';

// Warm point lamps, evaluated in the patched shaders (not three.js lights).
// Each frame the nearest active lamps to the camera fill the shader slots.

export interface Lamp {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number; // multiplier on colour
  radius: number;
  on: boolean;
  nightOnly: boolean; // follows dusk automatically (porch lights, lanterns)
  flicker: number; // 0 steady .. 1 firelight
  level: number; // current fade 0..1
}

export class Lamps {
  list: Lamp[] = [];
  private seed = 0;

  add(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, radius: number, opts: { on?: boolean; nightOnly?: boolean; flicker?: number } = {}): Lamp {
    const l: Lamp = {
      pos: pos.clone(), color: new THREE.Color(color), intensity, radius,
      on: opts.on !== false, nightOnly: !!opts.nightOnly, flicker: opts.flicker || 0, level: 0,
    };
    this.list.push(l);
    return l;
  }

  update(dt: number, camPos: THREE.Vector3, time: number) {
    const dusk = U.uWindowGlow.value;
    const scored: { l: Lamp; s: number; k: number }[] = [];
    for (const l of this.list) {
      const want = l.on ? (l.nightOnly ? dusk : 1) : 0;
      l.level += (want - l.level) * (1 - Math.exp(-dt * 3));
      if (l.level < 0.01) continue;
      const d = l.pos.distanceTo(camPos);
      if (d > l.radius + 60) continue;
      scored.push({ l, s: d - l.radius * 0.5, k: l.level });
    }
    scored.sort((a, b) => a.s - b.s);
    for (let i = 0; i < MAX_LAMPS; i++) {
      const p = U.uLampPos.value[i], c = U.uLampCol.value[i];
      const e = scored[i];
      if (!e) { p.set(0, -999, 0, 0); c.set(0, 0, 0); continue; }
      const l = e.l;
      let f = 1;
      if (l.flicker > 0) {
        const s = (this.seed + i * 7.3);
        f = 1 - l.flicker * (0.18 * (0.5 + 0.5 * Math.sin(time * 9.1 + s)) + 0.12 * (0.5 + 0.5 * Math.sin(time * 23.7 + s * 3.1)));
      }
      p.set(l.pos.x, l.pos.y, l.pos.z, l.radius);
      // night exposure is high, so lamps are toned down after dark to stay warm, not white
      c.set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * e.k * f * (1 - 0.45 * U.uNight.value));
    }
  }
}
