import * as THREE from 'three';
import { U } from '../shaderlib';
import { W } from '../world';
import { mulberry32 } from '../noise';

// Gentle rain: thin streaks falling in a box that follows the camera,
// slanted a little by the wind, faded out when you are indoors.
export class Rain {
  lines: THREE.LineSegments;
  indoor = 0;
  constructor(count = 4500) {
    const rnd = mulberry32(5);
    const pos = new Float32Array(count * 6);
    const seed = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const s = [rnd(), rnd(), rnd()];
      for (let k = 0; k < 2; k++) {
        seed.set([s[0], s[1], s[2]], i * 6 + k * 3);
        pos[i * 6 + k * 3 + 1] = k; // 0 = head, 1 = tail
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uRain: U.uRain, uWindDir: U.uWindDir, uIndoor: { value: 0 }, uDay: U.uDay },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime, uRain, uIndoor;
        uniform vec2 uWindDir;
        varying float vA;
        const float BOX = 34.0, H = 20.0;
        void main() {
          vec3 c = cameraPosition;
          vec2 xz = c.xz + mod(aSeed.xz * BOX - c.xz, BOX) - BOX * 0.5;
          float speed = 7.5 + aSeed.y * 2.5;
          float y = c.y + H * 0.6 - mod(uTime * speed + aSeed.y * H, H);
          vec3 vel = vec3(uWindDir.x * 1.2, -speed, uWindDir.y * 1.2);
          vec3 p = vec3(xz.x, y, xz.y) - vel * 0.06 * position.y;
          // only a fraction of the streaks when the rain is light
          float on = step(aSeed.x * 0.999, uRain);
          vA = on * (0.5 - 0.5 * position.y + 0.15) * (1.0 - 0.9 * uIndoor);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        uniform float uDay;
        void main() { gl_FragColor = vec4(vec3(0.72, 0.78, 0.86) * (0.35 + 0.65 * uDay), vA * 0.6); }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(g, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 35;
    W.scene.add(this.lines);
    W.noReflect.push(this.lines);
    W.onUpdate(() => {
      this.lines.visible = U.uRain.value > 0.01;
      mat.uniforms.uIndoor.value = this.indoor;
    });
  }
}
