import { M } from '../materials';

// Every material the farmhouse uses. One Builder merges everything per
// material, so each entry here is about one draw call.
export function houseMats() {
  return {
    siding: M.siding('#eef0eb', 0.18),
    trim: M.trim('#f6f5f0'),
    glass: M.glass(1),
    black: M.paint('#1c1e21', 0.6),
    roofX: M.roofMetal('#2b3036', 'x', 0.46, { noIndoor: true }),
    roofZ: M.roofMetal('#2b3036', 'z', 0.46, { noIndoor: true }),
    brick: M.brick('#8a3b2a'),
    deck: M.woodFloor('#8e887d', 'z', 0.12),
    porchCeil: M.beadboard('#c9a27a'),
    stone: M.stone('#8e877c'),
    mulch: M.paint('#3f2c1f', 0.95),
    plaster: M.plaster('#efe6d6'),
    floor: M.woodFloor('#93633e', 'x', 0.14),
    bathFloor: M.tile('#efefe9', 0.2, '#2e2e2c'),
    tileWall: M.tile('#f3f1ea', 0.13),
    bead: M.beadboard('#f8e9e9'),
    woodDark: M.wood('#5a3a24'),
    woodLight: M.wood('#a5733f'),
    cabinet: M.trim('#9db19f'),
    linen: M.fabric('#d8ccb5'),
    rust: M.fabric('#8a4630'),
    green: M.fabric('#55705e'),
    iron: M.metal('#2a2a2a', 0.5),
  };
}
export type HouseMats = ReturnType<typeof houseMats>;
