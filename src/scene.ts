import * as THREE from 'three';
import type { Place } from './ui';
import { START, HOUSE, BAKERY, BARN, PADDOCK, DOCK, FIRE_PIT, ORCHARD, GARDEN, WINDMILL, SWING_OAK } from './world/layout';

// Builds every part of the farm. Each module adds itself to W.scene and
// registers colliders, interactions, lamps and updaters through W.

export interface BuildCtx { renderer: THREE.WebGLRenderer; quality: 'low' | 'med' | 'high'; sun: THREE.DirectionalLight }
export interface Built { onResize?: (w: number, h: number) => void; beforeRender?: (cam: THREE.Camera) => void }

const BASE_PLACES: Place[] = [
  { name: 'The meadow', x: START.x, z: START.z, yaw: START.yaw },
  { name: 'Front porch', x: HOUSE.x + 2.5, z: HOUSE.z + HOUSE.d / 2 + 1.6, yaw: Math.PI * 0.9 },
  { name: 'Crumb & Clover', x: BAKERY.x + 6.5, z: BAKERY.z + 1, yaw: -Math.PI / 2 },
  { name: 'Horses', x: PADDOCK.x0 - 2, z: (PADDOCK.z0 + PADDOCK.z1) / 2, yaw: -Math.PI / 2 },
  { name: 'Barn', x: BARN.x, z: BARN.z + BARN.d / 2 + 6, yaw: 0 },
  { name: 'Fire pit', x: FIRE_PIT.x + 1.5, z: FIRE_PIT.z + 3.5, yaw: 0.3 },
  { name: 'Pond dock', x: DOCK.x - 1.5, z: DOCK.z - 3, yaw: Math.PI * 0.85 },
  { name: 'Swing oak', x: SWING_OAK.x - 3, z: SWING_OAK.z + 5, yaw: 0.5 },
  { name: 'Garden', x: GARDEN.x + 2, z: GARDEN.z + GARDEN.d / 2 + 3, yaw: 0 },
  { name: 'Orchard', x: (ORCHARD.x0 + ORCHARD.x1) / 2, z: ORCHARD.z1 + 4, yaw: 0 },
  { name: 'Windmill hill', x: WINDMILL.x - 2, z: WINDMILL.z + 8, yaw: 0.2 },
];

import { HOUSE_PLACES } from './build/house';
import { BAKERY_PLACES } from './build/bakery';
import { FARM_PLACES } from './build/farm';
// outdoor spots first, then the insides of buildings
export const PLACES: Place[] = [
  BASE_PLACES[0], BASE_PLACES[1], ...HOUSE_PLACES,
  BASE_PLACES[2], ...BAKERY_PLACES, BASE_PLACES[3], BASE_PLACES[4], ...FARM_PLACES.filter((p: Place) => p.name !== 'Under the windmill'),
  ...BASE_PLACES.slice(5),
];

type Mod = (ctx: BuildCtx) => Promise<Built | void> | Built | void;
const MODULES: Record<string, () => Promise<{ default: Mod }>> = {
  nature: () => import('./world/nature'),
  house: () => import('./build/house'),
  bakery: () => import('./build/bakery'),
  farm: () => import('./build/farm'),
  life: () => import('./life/index'),
};

export async function buildEverything(ctx: BuildCtx): Promise<Built> {
  const only = new URLSearchParams(location.search).get('only');
  const want = only ? only.split(',') : Object.keys(MODULES);
  const parts: Built[] = [];
  for (const k of want) {
    if (!MODULES[k]) continue;
    try {
      const mod = await MODULES[k]();
      const r = await mod.default(ctx);
      if (r) parts.push(r);
    } catch (e) {
      console.error(`module ${k} failed`, e);
    }
  }
  return {
    onResize: (w, h) => parts.forEach((p) => p.onResize?.(w, h)),
    beforeRender: (cam) => parts.forEach((p) => p.beforeRender?.(cam)),
  };
}
