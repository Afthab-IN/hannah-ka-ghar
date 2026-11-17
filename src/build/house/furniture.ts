import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../../shaderlib';

// Photoscanned CC0 furniture (Poly Haven). Each model is loaded once, its
// meshes merged into one geometry, and every placement of the same model
// becomes one instance of an InstancedMesh (one draw call per model).

export const FURN = [
  'Sofa_01', 'ArmChair_01', 'Rockingchair_01', 'CoffeeTable_01', 'dining_table', 'dining_chair_02',
  'old_bed_frame', 'ClassicNightstand_01', 'painted_wooden_nightstand', 'wooden_bookshelf_worn', 'painted_wooden_cabinet',
] as const;
export type FurnName = (typeof FURN)[number];

/** which way each model faces in its own file, as a yaw that turns it to face local -z (our furniture convention) */
export const FACE: Record<FurnName, number> = {
  Sofa_01: Math.PI, ArmChair_01: Math.PI, Rockingchair_01: Math.PI, CoffeeTable_01: 0, dining_table: 0, dining_chair_02: Math.PI,
  old_bed_frame: 0, ClassicNightstand_01: Math.PI, painted_wooden_nightstand: Math.PI, wooden_bookshelf_worn: Math.PI, painted_wooden_cabinet: Math.PI,
};

/** the two heaviest scans (22k and 50k triangles) stand indoors where only low sun reaches through
 * small north and east windows; they skip the sun's shadow pass to keep the triangle count sane */
export const NO_SUN_SHADOW = new Set<FurnName>([]); // the heavy scans were simplified (tools: _tools/simplify.mjs), so all cast shadows again

export interface Template { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; size: THREE.Vector3 }
export type Templates = Partial<Record<FurnName, Template>>;

export async function loadFurniture(): Promise<Templates> {
  const loader = new GLTFLoader();
  const out: Templates = {};
  await Promise.all(FURN.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`./models/furniture/${name}/${name}.gltf`);
      gltf.scene.updateMatrixWorld(true);
      const geos: THREE.BufferGeometry[] = [];
      let mat: THREE.MeshStandardMaterial | null = null;
      gltf.scene.traverse((o) => {
        const me = o as THREE.Mesh;
        if (!me.isMesh) return;
        geos.push(me.geometry.clone().applyMatrix4(me.matrixWorld));
        mat = mat ?? (me.material as THREE.MeshStandardMaterial);
      });
      if (!geos.length || !mat) return;
      // keep only the attributes every part has, so they merge
      const common = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => g.attributes[k]));
      for (const g of geos) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
      const geo = geos.length > 1 ? mergeGeometries(geos.map((g) => (g.index ? g : g)), false) : geos[0];
      if (!geo) return;
      // origin at the centre of the footprint, on the floor
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const c = bb.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -bb.min.y, -c.z);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const m = mat as THREE.MeshStandardMaterial;
      if (name !== 'old_bed_frame') m.metalness = 0;
      patchMaterial(m, { key: 'furn-' + name });
      out[name] = { geo, mat: m, size: bb.getSize(new THREE.Vector3()) };
    } catch (e) {
      console.warn('furniture model failed to load', name, e);
    }
  }));
  return out;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** Collects placements, then builds one (instanced) mesh per model. */
export class Furniture {
  private slots = new Map<FurnName, THREE.Matrix4[]>();
  meshes = new Map<FurnName, THREE.InstancedMesh>();
  constructor(public t: Templates) {}
  has(name: FurnName) { return !!this.t[name]; }
  size(name: FurnName) { return this.t[name]?.size ?? new THREE.Vector3(1, 1, 1); }
  /** matrix for a model centred at (x, y floor, z), facing local -z turned by yaw, scaled */
  matrix(name: FurnName, x: number, y: number, z: number, yaw: number, s: number | [number, number, number] = 1, out = new THREE.Matrix4()) {
    const sc = typeof s === 'number' ? [s, s, s] : s;
    _e.set(0, yaw + FACE[name], 0, 'YXZ');
    return out.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sc[0], sc[1], sc[2]));
  }
  /** returns the instance index */
  add(name: FurnName, x: number, y: number, z: number, yaw: number, s: number | [number, number, number] = 1) {
    let a = this.slots.get(name);
    if (!a) { a = []; this.slots.set(name, a); }
    a.push(this.matrix(name, x, y, z, yaw, s));
    return a.length - 1;
  }
  build(group: THREE.Group) {
    for (const [name, list] of this.slots) {
      const t = this.t[name];
      if (!t) continue;
      const mesh = new THREE.InstancedMesh(t.geo, t.mat, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = !NO_SUN_SHADOW.has(name);
      mesh.receiveShadow = true;
      mesh.name = 'furn-' + name;
      group.add(mesh);
      this.meshes.set(name, mesh);
    }
  }
  /** move one instance (rocking chairs) */
  set(name: FurnName, i: number, m: THREE.Matrix4) {
    const mesh = this.meshes.get(name);
    if (!mesh) return;
    mesh.setMatrixAt(i, m);
    mesh.instanceMatrix.needsUpdate = true;
  }
}
