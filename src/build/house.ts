import * as THREE from 'three';
import type { BuildCtx } from '../scene';
import { W } from '../world';
import { Builder } from './kit';
import { addIndoorVolume } from '../shaderlib';
import * as D from './house/dims';
import { houseMats } from './house/mats';
import { Props, Atlas, Shades } from './house/util';
import { buildShell } from './house/shell';
import { buildInterior } from './house/interior';
import { buildPorchLife } from './house/porch';
import { buildGarden } from './house/garden';
import { ATLAS_SIZE, drawAtlas } from './house/atlas';
import { MIRROR } from './house/interior';
import { buildWing } from './house/wing';
import { loadFurniture, Furniture } from './house/furniture';

// Hannah ka Ghar: the white clapboard farmhouse on the rise. 1.5 storeys,
// wraparound porch, a living room with a fireplace, kitchen, bedroom and bath
// downstairs, and a bedroom under the roof.

const { X, Z, F, A, G } = D;

export const HOUSE_PLACES: { name: string; x: number; z: number; yaw: number; y?: number }[] = [
  { name: 'Living room', x: X(6.6), z: Z(4.6), yaw: Math.atan2(4.3, 3.9), y: F },
  { name: 'Kitchen', x: X(4.3), z: Z(-0.8), yaw: 0.9, y: F },
  { name: 'Study', x: X(6.9), z: Z(-0.9), yaw: 0.6, y: F },
  { name: 'Bathroom', x: X(D.WING_U - 0.55), z: Z(-2.45), yaw: Math.PI / 2 + 0.35, y: F },
  { name: 'Attic bedroom', x: X(2.2), z: Z(-2.2), yaw: Math.atan2(-5.8, -2.2), y: A },
  { name: 'Upstairs bathroom', x: X(D.UPBATH_DOOR_U), z: Z(-1.4), yaw: Math.PI / 2 - 0.3, y: A },
  { name: 'Rooftop terrace', x: X(-D.W2 - 1.2), z: Z(0.3), yaw: Math.PI / 2, y: A },
  { name: 'Balcony', x: X(D.W2 + 0.45), z: Z(D.BAL_DOOR_V), yaw: -Math.PI / 2, y: D.BAL_Y },
  { name: 'Back door', x: X(D.BACK_DOOR_U), z: Z(-D.D2 - 2.8), yaw: Math.PI, y: G },
];

export default async function build(_ctx: BuildCtx) {
  const m = houseMats();
  const b = new Builder('farmhouse');
  // photoscanned furniture (falls back to the hand-made pieces if a model fails to load)
  const fu = new Furniture(await loadFurniture());
  const props = new Props();
  const atlas = new Atlas(ATLAS_SIZE);
  const shades = new Shades();

  buildShell(b, m, props);
  buildInterior({ b, m, props, atlas, shades, fu });
  buildPorchLife({ b, m, props, atlas, shades, fu });
  buildWing({ b, m, props, atlas, shades, fu });
  buildGarden(b, m);

  const g = b.build();
  // interior-only and very small surfaces do not need to cast sun shadows
  const noCast = new Set<THREE.Material>([m.linen, m.rust, m.green, m.tileWall, m.bathFloor, m.bead, m.porchCeil, m.stone, m.mulch, m.cabinet, m.iron, m.floor, m.deck, m.woodLight, MIRROR]);
  g.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && noCast.has(mesh.material as THREE.Material)) mesh.castShadow = false; });
  W.scene.add(g);
  const furn = new THREE.Group();
  furn.name = 'house-furniture';
  fu.build(furn);
  W.scene.add(furn);
  W.scene.add(props.build('house-props'));
  W.scene.add(atlas.build(drawAtlas));
  const sh = shades.build();
  if (sh) W.scene.add(sh);

  // ground floor and attic. The attic box reaches up to the ridge, so the roof above
  // the footprint sits inside it: the roof uses a material that ignores indoor volumes.
  const ix = D.W2 - 0.03, iz = D.D2 - 0.03, yc = F + D.CEIL + 0.02;
  addIndoorVolume(new THREE.Vector3(X(-ix), F - 0.3, Z(-iz)), new THREE.Vector3(X(ix), yc, Z(iz)));
  addIndoorVolume(new THREE.Vector3(X(-ix), yc, Z(-iz)), new THREE.Vector3(X(ix), D.P + D.RISE + 0.08, Z(iz)));
}
