import { HOUSE } from '../../world/layout';
import { padHeightAt } from '../../world/terrain';

// Farmhouse dimensions. Local coordinates: u = x - HOUSE.x (east +),
// v = z - HOUSE.z (south / front +). Use X(u), Z(v) to get world positions.

export const HX = HOUSE.x;
export const HZ = HOUSE.z;
export const X = (u: number) => HX + u;
export const Z = (v: number) => HZ + v;

export const W2 = HOUSE.w / 2; // gable walls at u = +-W2 (wall centre)
export const D2 = HOUSE.d / 2; // front wall at v = +D2, back at -D2
export const T = 0.2; // exterior wall thickness
export const TI = 0.12; // interior partition thickness
export const IX = W2 - T / 2; // inner face of the gable walls
export const IZ = D2 - T / 2; // inner face of front / back walls

export const G = padHeightAt(HX, HZ); // ground (pad) height
export const F = G + HOUSE.floorLift; // ground floor
export const YB = F - 0.12; // base of the exterior walls (siding overlaps the floor edge)
export const CEIL = 2.85; // ground floor ceiling height
export const A = F + CEIL + 0.2; // attic floor
export const RISE = 4.2; // main roof rise above the wall plate (pitch about 37 degrees)
export const KNEE_V = D2 - 0.45; // knee walls at v = +-KNEE_V
export const KNEE_H = 1.1;
export const P = A + KNEE_H - RISE * (1 - KNEE_V / D2); // wall plate height (roof underside at the wall centre line)
export const OV = 0.35; // main roof overhang
export const roofUnder = (v: number) => P + RISE * (1 - Math.abs(v) / D2);
/** distance from the ridge where the attic ceiling is still 1.95 m up; colliders keep the player inside it */
export const ATTIC_WALK_V = D2 * (1 - (A + 1.95 - P) / RISE);

// porch
export const PD = HOUSE.porchD;
export const PORCH_FRONT = D2 + PD; // v of the front deck edge
export const PORCH_EAST = W2 + PD; // u of the east deck edge
export const FD = F - 0.04; // porch deck top
export const RT = F + 3.2; // porch roof top where it meets the wall
export const RS = 0.2; // porch roof slope (rise per metre)
export const ROV = 0.3; // porch roof overhang past the deck edge
export const BEAM_V = PORCH_FRONT - 0.15; // centre line of the front posts / beam
export const BEAM_U = PORCH_EAST - 0.15; // centre line of the east posts / beam
export const BEAM_TOP = RT - 0.12 - RS * (BEAM_V - (D2 + 0.1));
export const BEAM_BOT = BEAM_TOP - 0.22;

// ground floor plan
export const WING_U = -3.5; // wall between the west wing (bedroom, bathroom) and the hall
export const BB_V = -1.7; // wall between the bedroom (front) and the bathroom (back)
export const FW_U0 = 0.6; // fireplace wall (v = 0) runs from here to the east wall
export const CASE_U0 = 3.4, CASE_U1 = 5.2;
export const STUDY_U = 5.5; // study / library in the back east corner, behind the fireplace wall
export const STUDY_DOOR_U = 6.9;
export const DOOR_U = -0.6; // front door and steps (world x 0, where the path arrives) // wide cased opening in it, living room to kitchen
export const DOOR_W = 1.0; // interior doorways

// stairs: in the hall, climbing north
export const ST_U0 = -2.15, ST_U1 = -1.15;
export const ST_W = ST_U1 - ST_U0;
export const ST_RUN = 0.27;
export const ST_N = Math.max(1, Math.round((A - F) / 0.18));
export const ST_BOT_V = 4.0; // front edge of the first step
export const ST_TOP_V = ST_BOT_V - ST_N * ST_RUN; // where the attic floor starts
export const SO_V1 = 2.9; // stairwell opening in the attic floor: v from ST_TOP_V to SO_V1

// chimney (fireplace breast on the living room side of the fireplace wall)
export const FP_U = 2.3;
export const CH_U0 = FP_U - 0.4, CH_U1 = FP_U + 0.4, CH_V0 = -0.3, CH_V1 = 0.3;
export const CH_TOP = P + RISE + 1.05;

// attic: the bathroom fills the west gable end behind a partition at AB_U
export const AB_U = -5.0;
export const BACK_DOOR_U = -2.3; // back door (north wall), opening off the back hall

// west wing: a one-storey sunroom whose flat roof is the rooftop terrace (deck at attic level)
export const WING_U0 = -W2 - 4.0; // outer wall centre line, west side (about x -10.8)
export const WING_V = 4.2; // wing spans v -WING_V..WING_V (sits back from the front wall)
export const TERRACE_Y = A; // deck top, level with the attic floor
export const TDOOR_V = 0; // terrace door in the west gable (attic level)
export const SUN_DOOR_V = 2.4; // doorway from the bedroom into the sunroom (was the west window)
// balcony off the attic bedroom on the east gable; it sits just above the east porch roof
export const BAL_V0 = 0.9, BAL_V1 = 3.3, BAL_D = 1.3;
export const BAL_DOOR_V = 2.1;
export const BAL_Y = A + 0.36; // deck top (the porch roof meets the wall at RT, just above the attic floor)
export const BW_V = -0.6; // upstairs bathroom: hall wall under the ridge (bathroom north of it)
export const UPBATH_DOOR_U = -6.4;
