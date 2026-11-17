import type { BuildCtx } from '../scene';
import { buildBirds } from './birds';
import { buildFireflies, buildButterflies } from './bugs';

// Everything that moves on its own: birds, bats, fireflies, butterflies and
// the farm animals.
export default async function build(_ctx: BuildCtx) {
  buildBirds();
  buildFireflies();
  buildButterflies();
  try {
    const animals = await import('./animals');
    await animals.default();
  } catch (e) {
    console.warn('animals not ready', e);
  }
}
