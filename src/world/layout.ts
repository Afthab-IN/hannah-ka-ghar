// Where everything sits. One source of truth for the map (metres, y up).
// +x east, -z north. The start view looks north across the meadow and pond
// to the farmhouse, with the sunset behind it (like the reference photo).

export interface Pad { x: number; z: number; hx: number; hz: number; margin: number; lift?: number }

export const START = { x: -0.6, z: 17.5, yaw: 0.04 }; // yaw 0 = looking toward -z

export const POND = { x: 9, z: 4, rx: 11.5, rz: 7.2, rot: 0.18 };

export const FIRE_PIT = { x: -4.2, z: 4.6 };
// Adirondack chairs around the fire pit (yaw = direction the sitter faces)
export const CHAIRS = [
  { x: -6.4, z: 6.3, yaw: 0.9 },
  { x: -5.6, z: 2.5, yaw: 2.3 },
  { x: -2.0, z: 6.6, yaw: -0.6 },
  { x: -1.9, z: 2.8, yaw: -2.2 },
];

// dock runs from the north-east shore into the pond
export const DOCK = { x: 14.2, z: -1.6, len: 6.5, w: 1.6, yaw: 0.35 }; // yaw: direction it points (0 = +z)

// split-rail fence between the meadow and the house lawn, with a gate on the path
export const FENCE_MAIN = { z: -12, x0: -72, x1: 72, gateX: 0.5, gateW: 3.2 };

// bigger in 2nd pass: the porch front edge stays at z -35.6 so the steps meet the path at (0, -34.5)
export const HOUSE = { x: 0, z: -42.8, w: 13.6, d: 9.6, porchD: 2.4, floorLift: 0.75 };
export const BAKERY = { x: -27, z: -38, w: 7, d: 6, yaw: Math.PI / 2 }; // door faces +x (toward the path)
export const COOP = { x: -34, z: -47 };
export const BARN = { x: 40, z: -62, w: 14, d: 18 }; // big doors face +z
export const PADDOCK = { x0: 24, x1: 56, z0: -42, z1: -18 }; // horses live here
export const GARDEN = { x: -13, z: -62, w: 14, d: 10 };
export const GREENHOUSE = { x: -29, z: -63, w: 6, d: 9 };
export const ORCHARD = { x0: -78, x1: -46, z0: -84, z1: -40, step: 6.5 };
export const WINDMILL = { x: 26, z: -104 };
export const SWING_OAK = { x: 17, z: -27 };
export const BIG_OAKS = [
  { x: -18, z: -24, s: 1.05 },
  { x: SWING_OAK.x, z: SWING_OAK.z, s: 1.15 },
  { x: -46, z: -14, s: 0.95 },
  { x: 62, z: -8, s: 1.0 },
  { x: -8, z: -84, s: 1.1 },
  { x: 70, z: -88, s: 0.9 },
  { x: -64, z: 22, s: 1.0 },
  { x: 48, z: 30, s: 0.85 },
];

// flat building pads (terrain is blended to the pad centre height)
export const PADS: Pad[] = [
  { x: HOUSE.x + 1.2, z: HOUSE.z + 1.2, hx: 10.8, hz: 8.2, margin: 9 },
  { x: BAKERY.x, z: BAKERY.z, hx: 5.5, hz: 5, margin: 7 },
  { x: BARN.x, z: BARN.z, hx: 10, hz: 12.5, margin: 9 },
  { x: GREENHOUSE.x, z: GREENHOUSE.z, hx: 4.2, hz: 5.6, margin: 5 },
  { x: GARDEN.x, z: GARDEN.z, hx: 8, hz: 6, margin: 6 },
  { x: WINDMILL.x, z: WINDMILL.z, hx: 3, hz: 3, margin: 5 },
  { x: COOP.x, z: COOP.z, hx: 3, hz: 3, margin: 3 },
];

// paths: polylines with a half width (dirt and gravel)
export const PATHS: { pts: [number, number][]; w: number }[] = [
  // from the meadow, through the gate, to the porch steps
  { pts: [[1.5, 40], [2.5, 22], [0.5, 8], [0.5, -12], [0.3, -26], [0, -34.5]], w: 0.75 },
  // to the bakery
  { pts: [[0.3, -26], [-8, -30], [-17, -35], [-23, -38]], w: 0.8 },
  // to the barn
  { pts: [[0.3, -26], [12, -36], [26, -46], [40, -50]], w: 1.2 },
  // round the back to the garden and greenhouse
  { pts: [[-8, -30], [-10.8, -40], [-11, -50], [-13, -56], [-24, -62]], w: 0.7 },
  // up the hill to the windmill
  { pts: [[26, -46], [28, -70], [24, -88], [26, -100]], w: 0.6 },
  // to the fire pit and dock
  { pts: [[2.5, 16], [-1.5, 8], [-3.6, 6.5]], w: 0.55 },
  { pts: [[0.5, -6], [8, -6], [12.5, -3.5]], w: 0.55 },
];

export const WALK_BOUND = { x: 0, z: -30, r: 132 };
