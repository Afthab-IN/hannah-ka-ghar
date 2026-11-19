import * as THREE from 'three';
import { Physics } from './physics';
import { Interactions } from './interact';
import { Lamps } from './lamps';
import { Sound } from './audio';

// Shared services every builder module uses. main.ts fills scene/camera.

export type Updater = (dt: number, time: number) => void;

export interface Mount {
  /** world pose of the seat each frame (eye position) and the base yaw the sitter faces */
  pose: () => { pos: THREE.Vector3; yaw: number };
  /** where to put the player when they get up */
  exit: THREE.Vector3;
  label?: string; // e.g. "Get up"
  onLeave?: () => void;
  yawRange?: number; // how far you can turn your head (radians, default 1.6)
  pitch?: number; // starting look up/down (e.g. 1.0 to lie back and look at the stars)
}

class World {
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  physics = new Physics();
  interact = new Interactions(this.physics);
  lamps = new Lamps();
  audio = new Sound();
  updaters: Updater[] = [];
  /** set by the player module */
  mount: (m: Mount) => void = () => {};
  toast: (msg: string) => void = () => {};
  /** time of day (sky.ts TimeOfDay): W.tod.hour, W.tod.setHour(h) eases to an hour */
  tod: any = null;
  /** put something in the player's hand (shown bottom right), or null to empty it. label e.g. "a sourdough loaf" */
  hold: (obj: THREE.Object3D | null, label?: string) => void = () => {};
  held: { obj: THREE.Object3D; label: string } | null = null;
  /** objects hidden from the pond reflection (grass etc.) */
  noReflect: THREE.Object3D[] = [];

  onUpdate(fn: Updater) { this.updaters.push(fn); }
}

export const W = new World();
