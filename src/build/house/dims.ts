import { HOUSE } from '../../world/layout';
import { padHeightAt } from '../../world/terrain';

// Farmhouse dimensions. Local coordinates: u = x - HOUSE.x (east +),
// v = z - HOUSE.z (south / front +). Use X(u), Z(v) to get world positions.

export const HX = HOUSE.x;
export const HZ = HOUSE.z;
export const X = (u: number) => HX + u;
export const Z = (v: number) => HZ + v;

export const W2 = HOUSE.w / 2; // 5.5: gable walls at u = +-W2 (wall centre)
export const D2 = HOUSE.d / 2; // 4: front wall at v = +D2, back at -D2
export const T = 0.2; // exterior wall thickness
export const TI = 0.12; // interior partition thickness
export const IX = W2 - T / 2; // 5.4 inner face of the gable walls
export const IZ = D2 - T / 2; // 3.9 inner face of front / back walls

export const G = padHeightAt(HX, HZ); // ground (pad) height
export const F = G + HOUSE.floorLift; // ground floor
export const YB = F - 0.12; // base of the exterior walls (siding overlaps the floor edge)
export const CEIL = 2.7; // ground floor ceiling height
export const A = F + 2.9; // attic floor
export const RISE = 3.5; // main roof rise above the wall plate
export const KNEE_V = 3.55; // knee walls at v = +-KNEE_V
export const KNEE_H = 1.1;
export const P = A + KNEE_H - RISE * (1 - KNEE_V / D2); // wall plate height (roof underside at the wall centre line)
export const OV = 0.35; // main roof overhang
export const roofUnder = (v: number) => P + RISE * (1 - Math.abs(v) / D2);
/** distance from the ridge where the attic ceiling is still above head + margin; colliders keep the player inside it */
export const ATTIC_WALK_V = 2.58;

// porch
export const PD = HOUSE.porchD; // 2.4
export const PORCH_FRONT = D2 + 0.1 + PD - 0.1; // v of the front deck edge (6.4)
export const PORCH_EAST = W2 + 0.1 + PD - 0.1; // u of the east deck edge (7.9)
export const FD = F - 0.04; // porch deck top
export const RT = F + 3.05; // porch roof top where it meets the wall
export const RS = 0.2; // porch roof slope (rise per metre)
export const ROV = 0.3; // porch roof overhang past the deck edge
export const BEAM_V = PORCH_FRONT - 0.15; // centre line of the front posts / beam (6.25)
export const BEAM_U = PORCH_EAST - 0.15; // centre line of the east posts / beam (7.75)
export const BEAM_TOP = RT - 0.12 - RS * (BEAM_V - (D2 + 0.1));
export const BEAM_BOT = BEAM_TOP - 0.22;

// stairs (along the south face of the spine wall, climbing east)
export const ST_W = 0.92;
export const ST_V = 0.07 + ST_W / 2; // centre line v (0.53)
export const ST_RUN = 0.27;
export const ST_N = Math.max(1, Math.round((A - F) / 0.18));
export const ST_TOP_U = 0.6; // u where the flight ends (attic floor starts)
export const ST_BOT_U = ST_TOP_U - ST_N * ST_RUN; // -3.72
export const OPEN_U0 = -2.8; // stairwell opening in the attic floor
export const OPEN_V0 = 0.06, OPEN_V1 = 1.0;

// chimney (fireplace breast on the living room side of the spine wall)
export const FP_U = 2.05;
export const CH_U0 = 1.6, CH_U1 = 2.5, CH_V0 = -0.3, CH_V1 = 0.3;
export const CH_TOP = P + RISE + 1.05;
