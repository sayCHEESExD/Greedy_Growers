/**
 * STATIC CHECKS of the map: the plots never overlap each other, the river,
 * the stalls or the walls; every stall's counter can be reached; the spawn,
 * the teleports and each plot's entrance are clear of solids; the river runs
 * between the walls with room to wade.
 *
 * Usage: npm run verify:layout
 */
import {
  BOUNDS,
  PLACES,
  PLOT,
  PLOTS,
  RIVER,
  SPAWN,
  STALLS,
  WorldCollision,
  buildStaticSolids,
  gardenSpot,
  insideLawn,
  plotEntrance,
  stallFront,
} from '../shared/dist/index.js';

let failures = 0;
const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};

const collision = new WorldCollision();
const solids = buildStaticSolids();
const clear = (x, z) => !collision.occupied(x, z, 1);

console.log('plots');
let overlap = false;
for (let i = 0; i < PLOTS.length; i += 1) {
  for (let j = i + 1; j < PLOTS.length; j += 1) {
    const a = PLOTS[i];
    const b = PLOTS[j];
    if (Math.abs(a.x - b.x) < PLOT.lawnHalfX * 2 + 6 && Math.abs(a.z - b.z) < PLOT.lawnFront - PLOT.lawnBack + 6) overlap = true;
  }
}
check(!overlap, `the ${PLOTS.length} plots never overlap and keep lanes between them`);
check(PLOTS.every((p) => p.z + PLOT.lawnFront < RIVER.z - RIVER.half - 4), 'every plot is on the south bank, clear of the river');
check(PLOTS.every((p) => p.x - PLOT.lawnHalfX > BOUNDS.minX + 8 && p.x + PLOT.lawnHalfX < BOUNDS.maxX - 8 && p.z + PLOT.lawnBack > BOUNDS.minZ + 4), 'every plot is inside the walls');
check(
  PLOTS.every((p) => solids.every((s) => s.maxX < p.x - PLOT.lawnHalfX || s.minX > p.x + PLOT.lawnHalfX || s.maxZ < p.z + PLOT.lawnBack || s.minZ > p.z + PLOT.lawnFront)),
  'no solid stands on any plot',
);
check(PLOTS.every((p) => clear(plotEntrance(p.slot).x, plotEntrance(p.slot).z)), 'every plot entrance is clear');
check(PLOTS.every((p) => [0, 1, 2, 3, 4, 5, 6].every((i) => insideLawn(gardenSpot(i).x, gardenSpot(i).z))), 'every garden spot is on its lawn');

console.log('\nthe market');
check(STALLS.every((s) => s.z - s.hz > RIVER.z + RIVER.half + 4), 'every stall is on the north bank');
let stallsApart = true;
for (let i = 0; i < STALLS.length; i += 1) {
  for (let j = i + 1; j < STALLS.length; j += 1) {
    const a = STALLS[i];
    const b = STALLS[j];
    if (Math.abs(a.x - b.x) < a.hx + b.hx + 2 && Math.abs(a.z - b.z) < a.hz + b.hz + 2) stallsApart = false;
  }
}
check(stallsApart, 'no two stalls touch');
check(STALLS.every((s) => clear(stallFront(s).x, stallFront(s).z)), "every keeper's counter can be walked up to");

console.log('\nthe river and teleports');
check(RIVER.startX > BOUNDS.minX && RIVER.endX < BOUNDS.maxX, 'the river runs between the walls');
check(clear(SPAWN.x, SPAWN.z), 'the spawn is clear');
check(Object.values(PLACES).every((p) => clear(p.x, p.z)), 'every teleport target is clear');
let wade = true;
for (let x = RIVER.startX + 10; x < RIVER.endX - 10; x += 7) if (!clear(x, RIVER.z)) wade = false;
check(wade, 'the river can be waded end to end');

console.log(failures === 0 ? '\nlayout: all checks passed' : `\nlayout: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
