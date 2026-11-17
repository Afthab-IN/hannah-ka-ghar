# Building guide (for anyone adding buildings to Sundown Meadow)

Vite + three r187 + TypeScript. Dev server: http://127.0.0.1:5247 (already running, hot reload). Typecheck: `npx tsc --noEmit` (no output = clean).

## Coordinates and layout
- Metres, y up, +x east, -z north. The start view stands in the meadow at (1.5, z 27) looking north (-z) at the farmhouse, sunset behind it.
- All positions live in `src/world/layout.ts` (HOUSE, BAKERY, BARN, PADDOCK, COOP, GARDEN, GREENHOUSE, WINDMILL, ...). Read it; do not edit it.
- Ground: `heightAt(x, z)` and `heightPad(i)` / `padHeightAt(x, z)` from `src/world/terrain.ts`. Every building sits on a flat pad (PADS in layout.ts, the terrain is blended flat there). Use `padHeightAt(cx, cz)` for the floor base and lift floors a little above it.

## Module shape
Your module `export default function build(ctx: BuildCtx)` (from `src/scene.ts`) adds meshes to `W.scene` and registers colliders, interactions, lamps and sounds through `W` (`src/world.ts`). It may return `{ beforeRender?, onResize? }` (usually nothing). Per-frame animation: `W.onUpdate((dt, time) => ...)`.
Preview only your module: `http://127.0.0.1:5247/?only=house&hour=12&view=x,eyeY,z,yaw,pitch` (several: `only=house,bakery`).

## Kit (`src/build/kit.ts`)
- `new Builder(name)`: collects static parts, `build()` merges them per material into a few meshes (do this: draw calls matter on iPad). `b.box(mat, cx, cy, cz, sx, sy, sz, {rotY, rotX, rotZ, collide})`, `b.boxMinMax(...)`, `b.cyl(mat, x, y0, z, r, h, {seg, rTop, collide, rotX, rotZ})`, `b.geo(mat, geometry, pos, rot, scale)` (any BufferGeometry, no collision). Boxes collide by default (walkable top). `collide: false` for decoration, `'nowalk'` for solid things you should not stand on. Rotated boxes (rotY only) become thick-segment colliders; boxes with rotX/rotZ never collide.
- `wall(b, { a:[x,z], b:[x,z], y, h, outline?, holes?, t?, outer, inner?, outSide })`: a wall slab with REAL holes (doors/windows), outer half in `outer` material, inner half in `inner`. `outSide: 1` puts the outer face on the side of normal (dz, -dx) of a->b (a wall running +x with outSide 1 faces -z); `outSide: -1` the other side. `holes: [{u0, u1, y0, y1}]` in wall space (u metres along a->b, y up from the wall base). Holes that reach the floor (y0 < 0.3) are walk-through; colliders are made automatically. `outline` lets you make gable ends: `gableOutline(L, eaveH, rise)`. Overlap walls at corners by t/2 so corners close.
- `windowUnit(b, { x, y, z, w, h, n:[nx,nz], frame, glass, muntins:[cols,rows], shutters?, sill?, casing? })`: frame, glass, muntins, sill, casings and optional shutters, centred in a hole you cut with `wall`. `n` is the outward normal.
- `makeDoor({ hinge: Vector3, w, h, dir:[dx,dz], swing: 1|-1, mat, knob?, glass?, name, sounds? })`: hinged door that opens with E/click/tap, has its own collider (disabled when open), plays door sounds. Add `door.group` to the scene. Use `M.paint(...)` for doors (moving parts must not use world-space patterns).
- `stairs(b, { x, z, dir:[dx,dz], w, y0, y1, run?, mat, riserMat?, stringer?, solidBelow? })`: steps of ~0.18 m rise; each step is a walkable collider. Returns the run length. The player can step up 0.36 m.
- `gableRoof(b, { cx, cz, y, len, span, rise, ridge:'x'|'z', overhang?, t?, mat, under?, fascia? })`: two sloped slabs plus ridge cap. `y` = wall plate height. Roofs do not collide. For attics, add knee walls / colliders so the player can't walk into the slope (head height 1.75).

## Materials (`src/build/materials.ts`, `M.*`, cached, world-space patterns, no UVs needed)
`M.siding(color, board)`, `M.boards(color, width)` (vertical board and batten), `M.trim(color)`, `M.roofMetal(color, axis, spacing)` (standing seam; axis = world axis the seams are spaced along), `M.shingles(color)`, `M.brick(color)`, `M.stone(color)`, `M.woodFloor(color, axis, width)`, `M.wood(color, aged)`, `M.plaster(color)`, `M.beadboard(color)`, `M.tile(color, size, checkerColor?)`, `M.fabric(color)`, `M.rug(a, b, cx, cz, hx, hz)`, `M.paint(color, roughness, metalness)` (plain, safe on moving parts), `M.metal(color)`, `M.glow(color, strength, nightOnly)` (emissive, e.g. bulbs), `M.glass(lit)` (window glass that glows warm from outside after dusk; lit 0..1), `M.canvas(draw, w, h, {emissive, transparent})` (signs, chalkboards, pictures; a canvas 2D draw callback; needs geometry with UVs, so add it as its own Mesh, e.g. a PlaneGeometry, not through Builder).
Patterns are world-aligned, so keep big pattern surfaces axis-aligned. Anything that moves: `M.paint`.

## Services (`W` from `src/world.ts`)
- `W.physics.addBox(x0,y0,z0,x1,y1,z1,{walk})`, `addBoxC(cx,cy,cz,sx,sy,sz)`, `addCylinder(x,z,r,y0,y1)`, `addSegment(ax,az,bx,bz,r,y0,y1)`. Colliders have `.enabled`. Player: cylinder r 0.28, height 1.75, step 0.36, eye 1.62.
- `W.interact.add({ pos, radius, label, onUse, range?, enabled? })`: something you can use; label like "Take a croissant" (shown as "E  Take a croissant", or a button on iPad). pos may be a function for moving things.
- `W.lamps.add(pos, color, intensity, radius, { on, nightOnly, flicker })`: warm point light evaluated in the shaders (no three.js lights please). The nearest 8 active lamps to the camera are used, so add as many as make sense. intensity ~2 to 4 for a room lamp, radius 5 to 8. `nightOnly: true` fades with dusk. Returns a lamp with `.on` you can toggle (lamp switch interaction is nice).
- `W.audio.play(name, { pos, volume, rate })` and `W.audio.loop(name, { pos, volume, ref, max })`: clips from `public/audio/<name>.mp3` (missing ones are silent). Names: door_open, door_close, fire_crackle, shop_bell, horse_neigh, horse_snort, chickens, cat_meow, cat_purr, owl, swing_creak, water_lap, step_wood_1..3.
- `W.mount({ pose: () => ({ pos: eyeWorldPos, yaw }), exit: Vector3, label, yawRange, onLeave })`: sit the player (chairs, bed, rocking chair). Yaw: 0 looks toward -z, +yaw turns toward -x (three.js rotation.y). The pose function is called every frame, so rocking chairs and swings can move.
- `W.toast(msg)`: short message at the bottom. `W.tod.hour`, `W.tod.setHour(h)` (eases there; e.g. sleeping in a bed until 7 am). `W.hold(object3D, 'a warm sourdough loaf')`: put a small mesh in the player's hand.
- `addIndoorVolume(min: Vector3, max: Vector3)` from `src/shaderlib.ts`: marks an interior box so sky light is dimmed inside it and the eye adapts when you walk in. 8 slots in total for the whole farm. Inset by half the wall thickness so outer wall faces stay outside.
- Fire: `new Fire({ pos, scale, lit, logs, label, lampRadius, lampIntensity, sound })` from `src/fx/fire.ts` (fireplace ~0.45 scale, `label: 'the fire'` makes it toggleable).

## Testing
- Screenshots (headless Chrome with GPU): `node tools/shoot.cjs '{"out":"shots/<yours>","url":"http://127.0.0.1:5247/?only=house&hour=12","views":[{"name":"front","view":[0,1.7,-25,0,0],"wait":2500},{"name":"night","hour":22,"view":[0,1.7,-25,0,0]}]}'`. `view` = [x, eyeY, z, yaw, pitch]: near the ground it stands on whatever walkable surface is under it (eye = floor + 1.62); more than 2.6 m above the ground it becomes a free flying camera. Then look at the JPGs (Read tool). Make contact sheets with PIL to save tokens.
- `eval` in a view runs JS in the page: `window.__meadow` has `player` (pos, yaw, keys:Set, active), `W`, `tod`, `camera`, `stats` (fps, calls, tris). To test walking: `{"eval":"const p=__meadow.player; p.active=true; p.keys.add('KeyW')","wait":3000}` then `{"measure":"(()=>{const p=__meadow.player; p.keys.clear(); return p.pos})()"}`.
- Only one headless Chrome at a time from you, and close it (the tool does). The laptop is shared with other work.
