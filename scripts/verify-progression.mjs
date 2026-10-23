/**
 * STATIC CHECKS of the game's tables, against the original game's published
 * figures and against playability: the seed list, the river odds, the
 * mutation multipliers, the weather chances, the fertilizers, the rebirth
 * ladder, the pets and eggs - and a simulated greedy farmer, to show waiting
 * pays a little and costs a lot, and that Rebirth 1 is reachable.
 *
 * Usage: npm run verify:progression
 */
import {
  CRASH_K,
  DEAD_SHARE,
  EGGS,
  FERTILIZERS,
  MAX_PLAYERS_PER_ROOM,
  MUTATIONS,
  PETS,
  PLOT_COUNT,
  REBIRTHS,
  RIVER_SEEDS,
  SEEDS,
  STARTING_CASH,
  WEATHERS,
  WHEEL,
  WORMS,
  petsOfEgg,
  rollCrash,
  scheduledWeather,
  treeValue,
  deadValue,
  RARITIES,
  plotCapacity,
  gardenCapacity,
  mutationMultiplier,
  formatAmount,
  rng,
} from '../shared/dist/index.js';

let failures = 0;
const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

console.log('the seeds (Update 1.2 list)');
const expect = [
  ['Oak', 'common', 0, 5],
  ['Pine', 'common', 25, 5],
  ['Apple', 'rare', 200, 9],
  ['Peach', 'rare', 350, 9],
  ['Fig', 'rare', 500, 9],
  ['Orange', 'epic', 10_000, 15],
  ['Lemon', 'epic', 15_000, 15],
  ['Avocado', 'epic', 20_000, 15],
  ['Cherry', 'legendary', 2.5e6, 120],
  ['Mango', 'legendary', 5e6, 120],
  ['Coconut', 'legendary', 1e7, 120],
  ['Banana', 'mythic', 3e9, 300],
  ['Starfruit', 'mythic', 4.5e9, 300],
  ['Dragon Fruit', 'mythic', 7e9, 300],
  ['Glowing', 'celestial', 5e11, 400],
  ['Blooming', 'celestial', 7.5e11, 400],
  ['Magic', 'secret', 5e14, 660],
  ['Pizza', 'secret', 8.5e14, 660],
  ['Diamond', 'divine', 1e18, 1000],
  ['Void', 'divine', 1.75e18, 1000],
];
check(RIVER_SEEDS.length === 20, '20 seeds ride the river');
for (const [name, rarity, price, oneIn] of expect) {
  const seed = SEEDS.find((s) => s.name === name);
  check(seed && seed.rarity === rarity && seed.price === price && seed.oneIn === oneIn, `${name}: ${rarity}, $${formatAmount(price)}, 1 in ${oneIn}`);
}
check(SEEDS.find((s) => s.name === 'Oak').base === 5, 'an Oak tree is worth $5 at 1.00x (the video: 1.16x = $5, 3.97x = $19)');
check(Math.floor(treeValue(SEEDS[0], 3.97, 0)) === 19, 'Oak at 3.97x = $19, as in the video');
check(Math.floor(treeValue(SEEDS[1], 2.67, 0)) === 66, 'Pine at 2.67x = $66, as in the video');
check(close(deadValue(SEEDS[1], 6.1, 0), 61, 0.02), `a dead Pine struck at 6.10x is worth ~$60 (the video's sale: $${deadValue(SEEDS[1], 6.1, 0).toFixed(1)})`);

console.log('\nmutations');
const multipliers = { Dewy: 2, Shocked: 2.5, Dusty: 3, Frosted: 3, Infested: 5, Radioactive: 5, Charged: 7.5, Slimy: 10, Golden: 25, Scaled: 25, Cosmic: 100 };
for (const [name, k] of Object.entries(multipliers)) check(MUTATIONS.find((m) => m.name === name)?.multiplier === k, `${name} x${k}`);
check(new Set(MUTATIONS.map((m) => m.bit)).size === MUTATIONS.length, 'every mutation has its own bit');
check(mutationMultiplier(MUTATIONS[0].bit | MUTATIONS[2].bit) === 6, 'stacked mutations multiply (Dewy x Dusty = x6)');

console.log('\nweather (4:30 events)');
const chances = { misty: 0.5, sandstorm: 0.35, blizzard: 0.35, acid: 0.2, rainbow: 0.075, meteor: 0.025 };
for (const [kind, chance] of Object.entries(chances)) check(WEATHERS[kind].chance === chance && WEATHERS[kind].seconds === 270, `${WEATHERS[kind].name}: ${chance * 100}% for 4:30`);
const seen = new Set();
for (let t = 0; t < 400; t += 1) seen.add(scheduledWeather(1.7e12 + t * 480_000).kind);
check(seen.size >= 7, `the schedule cycles through every event (${[...seen].join(', ')})`);

console.log('\nthe lightning');
const N = 200_000;
let under4 = 0;
let over60 = 0;
let random = rng(12345);
for (let i = 0; i < N; i += 1) {
  const c = rollCrash(random());
  if (c < CRASH_K) under4 += 1;
  if (c > 60) over60 += 1;
}
check(Math.abs(under4 / N - 0.5) < 0.01, `half of all trees are struck before ${CRASH_K}x (${((under4 / N) * 100).toFixed(1)}%)`);
check(over60 / N > 0.04 && over60 / N < 0.09, `a few survive past 60x (${((over60 / N) * 100).toFixed(1)}%)`);
// Expected value of waiting to a target, in multiples of the seed: rises but flattens.
const ev = (target) => {
  let total = 0;
  random = rng(999);
  for (let i = 0; i < 50_000; i += 1) {
    const c = rollCrash(random());
    total += c > target ? target : c * DEAD_SHARE;
  }
  return total / 50_000;
};
const ev2 = ev(2);
const ev5 = ev(5);
const ev20 = ev(20);
check(ev5 > ev2 && ev20 > ev5 && ev20 - ev5 < ev5, `greed pays a little: EV x${ev2.toFixed(2)} at 2x, x${ev5.toFixed(2)} at 5x, x${ev20.toFixed(2)} at 20x`);

console.log('\nfertilizers and rebirth');
check(FERTILIZERS.map((f) => f.crash).join(',') === '1.5,2.5,4,6', 'fertilizers multiply the crash point 1.5 / 2.5 / 4 / 6');
check(FERTILIZERS.map((f) => f.speed).join(',') === '0.25,0.5,0.75,1', 'and speed growth +25 / +50 / +75 / +100%');
check(REBIRTHS[0].cost === 500 && REBIRTHS[1].cost === 250_000, 'Rebirth 1 costs $500, Rebirth 2 $250K');
check(REBIRTHS[5].cost === 1e20 && REBIRTHS[6].cost === 1e26, 'Rebirth 6 costs $100Qi, Rebirth 7 $100Sp');
check(REBIRTHS.every((r, i) => i === 0 || r.cost > REBIRTHS[i - 1].cost), 'every rebirth costs more than the last');
check(REBIRTHS[0].unlocks.map((u) => u.name).join(',') === 'Basic Fertilizer,Plot Upgrade,Index', 'Rebirth 1 unlocks Basic Fertilizer, Plot Upgrade and the Index');
check(plotCapacity(0) === 1 && plotCapacity(1) === 2 && plotCapacity(7) === 5, 'one sapling at first, five at Rebirth 7');
check(gardenCapacity(0) === 3 && gardenCapacity(7) === 7, 'three garden spots at first, seven at Rebirth 7');
check(PLOT_COUNT === MAX_PLAYERS_PER_ROOM, `one plot for each of the ${MAX_PLAYERS_PER_ROOM} players in a room`);

console.log('\npets, eggs, worms, the wheel');
check(EGGS.filter((e) => !e.special).map((e) => e.tickets).join(',') === '100,200,500,1000,2000', 'eggs cost 100 / 200 / 500 / 1,000 / 2,000 Tickets');
for (const egg of EGGS) {
  const total = petsOfEgg(egg.id).reduce((s, p) => s + p.chance, 0);
  check(Math.abs(total - 100) < 1e-6, `${egg.name}: its pets' chances add to 100%`);
}
check(petsOfEgg(6).map((p) => `${p.name} ${p.chance}`).join(', ') === 'Flamingo 45, Hedgehog 35, Elephant 15, Horse 4.5, Pegasus 0.5', "the Majestic Egg's odds are the video's");
check(PETS.length === 23, `${PETS.length} pets`);
check(WORMS.length === 12, '12 worms');
check(WHEEL.length === 6, 'six wheel slices');

console.log('\na greedy new farmer');
// The best seed it can afford (Oak, Pine, the Rares), harvesting at 3x, ~22 s a round trip: Rebirth 1 inside 20 minutes.
let cash = STARTING_CASH;
let seconds = 0;
random = rng(4242);
while (cash < REBIRTHS[0].cost && seconds < 3600) {
  const seed = [...SEEDS].filter((x) => x.oneIn > 0 && x.price <= cash * 0.6).pop() ?? SEEDS[0];
  cash -= seed.price;
  const crash = rollCrash(random());
  const target = 3;
  const mult = crash > target ? target : crash;
  cash += crash > target ? treeValue(seed, mult, 0) : deadValue(seed, mult, 0);
  seconds += mult / RARITIES[seed.rarity].growth + 22;
}
check(seconds < 20 * 60, `reaches the $500 for Rebirth 1 in ${(seconds / 60).toFixed(1)} minutes`);

console.log(failures === 0 ? '\nprogression: all checks passed' : `\nprogression: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
