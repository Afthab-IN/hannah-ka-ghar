import type { BuildCtx } from '../scene';
import { BARN, GREENHOUSE, WINDMILL } from '../world/layout';
import { buildBarn } from './farm/barn';
import { buildGarden } from './farm/garden';
import { buildWindmill } from './farm/windmill';

// The working farm: the red barn, its yard and the paddock fence, the
// vegetable garden and greenhouse, and the windmill on the hill.

export const FARM_PLACES = [
  { name: 'Inside the barn', x: BARN.x + 0.6, z: BARN.z + BARN.d / 2 - 2.2, yaw: 0.12 },
  { name: 'Greenhouse', x: GREENHOUSE.x + 2.3, z: GREENHOUSE.z + 0.3, yaw: Math.PI / 2 + 0.35 },
  { name: 'Under the windmill', x: WINDMILL.x - 3.5, z: WINDMILL.z + 6, yaw: -0.5 },
];

export default function build(ctx: BuildCtx) {
  buildBarn(ctx);
  buildGarden();
  buildWindmill();
}
