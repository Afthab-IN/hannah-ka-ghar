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
import { loadFurniture, Furniture } from './house/furniture';

// Hannah ka Ghar: the white clapboard farmhouse on the rise. 1.5 storeys,
// wraparound porch, a living room with a fireplace, kitchen, bedroom and bath
// downstairs, and a bedroom under the roof.

const { X, Z, F, A, G } = D;

export const HOUSE_PLACES: { name: string; x: number; z: number; yaw: number; y?: number }[] = [
  { name: 'Living room', x: X(5.4), z: Z(3.9), yaw: Math.atan2(2.5, 3.24), y: F },
  { name: 'Kitchen', x: X(3.9), z: Z(-0.8), yaw: 0.55, y: F },
  { name: 'Bathroom', x: X(D.WING_U - 0.55), z: Z(-0.95), yaw: Math.PI / 2 + 0.35, y: F },
  { name: 'Attic bedroom', x: X(1.6), z: Z(-1.9), yaw: Math.atan2(-4.4, -1.9), y: A },
  { name: 'Upstairs bathroom', x: X(D.AB_U - 0.6), z: Z(0.15), yaw: Math.PI / 2 + 0.1, y: A },
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
