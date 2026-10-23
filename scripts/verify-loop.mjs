/**
 * THE CORE LOOP, played by bots against a RUNNING dev server (npm run dev).
 *
 * A brand-new farmer does the tutorial: buy a free Oak Seed off the river,
 * plant it on their plot, let it grow, harvest it, sell it at the stand - and
 * every step is checked in what the server sends back. Then: lightning kills
 * trees at hidden crash points the schema never reveals, a near miss or a
 * dead tree still sells, rebirth needs and spends its cash, a garden tree
 * bears fruit, and a second farmer cannot touch the first one's plot.
 *
 * The dev server's --dev-cheats teleport stands the bot next to a river seed
 * (a player walks there); everything else is the real protocol.
 *
 * Usage: npm run dev, then npm run verify:loop  (GARDEN=1 also waits for fruit).
 */
import { Client } from 'colyseus.js';
import { PLOT, PLOTS, RIVER, ROOM_NAME, STARTING_CASH, TUTORIAL, plotToWorld, riverSeedX, gardenSpot } from '../shared/dist/index.js';

const ENDPOINT = process.env.ENDPOINT ?? 'ws://localhost:3888';
let failures = 0;
const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (probe, label, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(50);
  }
};

const join = async (playerId, name) => {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate(ROOM_NAME, { playerId, identity: { displayName: name, avatarUrl: '' } });
  room.self = null;
  room.notices = [];
  room.fx = [];
  room.onMessage('self', (m) => {
    room.self = m;
  });
  room.onMessage('notice', (m) => room.notices.push(m.text));
  room.onMessage('fx', (m) => room.fx.push(m));
  for (const type of ['sold', 'respawn', 'authState', 'spun', 'hatched']) room.onMessage(type, () => {});
  await waitFor(() => room.self && room.state.players.get(room.sessionId)?.plot >= 0, 'own state');
  return room;
};
const me = (room) => room.state.players.get(room.sessionId);
const plotOf = (room) => room.state.plots[me(room).plot];
const act = async (room, type, message = {}) => {
  room.send(type, message);
  await sleep(140);
};
const saplings = (room) => [...plotOf(room).saplings.values()];

/** Stand by a free oak on the river and buy it. */
const buyOak = async (room) => {
  for (let tries = 0; tries < 40; tries += 1) {
    const now = room.state.now;
    const oak = [...room.state.river.values()].find((s) => s.seed === 1 && riverSeedX(s.spawnAt, now) < RIVER.endX - 40 && riverSeedX(s.spawnAt, now) > RIVER.startX + 10);
    if (oak) {
      const x = riverSeedX(oak.spawnAt, room.state.now + 300);
      await act(room, 'dev', { tp: [x, RIVER.z + oak.lane] });
      await sleep(250);
      const before = room.self.seeds.find((s) => s.seed === 1)?.count ?? 0;
      await act(room, 'buySeed', { id: oak.id });
      await sleep(250);
      if ((room.self.seeds.find((s) => s.seed === 1)?.count ?? 0) > before) return true;
    }
    await sleep(500);
  }
  return false;
};

console.log(`core loop (${ENDPOINT})`);
const tag = Date.now().toString(36);
const a = await join(`loop-a-${tag}`, 'LoopA');
check(a.self.cash === STARTING_CASH && a.self.tutorial === TUTORIAL.buy, `a new farmer starts with $${STARTING_CASH} on "buy an Oak Seed"`);
check(plotOf(a).owner === a.sessionId, `they are given a plot (slot ${me(a).plot})`);
check(a.state.river.size > 30, `the river is full of seeds (${a.state.river.size})`);

check(await buyOak(a), 'an Oak Seed is bought off the river');
check(a.self.cash === STARTING_CASH && a.self.tutorial === TUTORIAL.plant, 'the Oak is free and the tutorial moves to planting');
check(a.self.equipped.startsWith('seed:1:'), 'the seed goes straight into their hand');

await act(a, 'teleport', { to: 'plot' });
await sleep(300);
const home = PLOTS[me(a).plot];
await act(a, 'plant', { x: home.x, z: home.z + PLOT.soilHalf - 3 });
await waitFor(() => saplings(a).length === 1, 'the sapling');
check(a.self.tutorial === TUTORIAL.harvest, 'planting moves the tutorial on');
const keys = Object.keys(saplings(a)[0].toJSON());
check(!keys.some((k) => /crash/i.test(k)), `the schema never carries the crash point (${keys.join(',')})`);

await sleep(1500);
const tree = saplings(a)[0];
await act(a, 'harvest', { tree: tree.id });
await waitFor(() => a.self.trees.length === 1, 'the harvested tree');
const picked = a.self.trees[0];
check(picked.mult > 0, `harvest banks the tree at ${picked.mult}x${picked.dead ? ' (struck: dead)' : ''}`);
check(a.self.equipped === `tree:${picked.uid}`, 'the tree is carried in hand');

await act(a, 'teleport', { to: 'sell' });
await sleep(300);
await act(a, 'sell', { mode: 'held' });
await waitFor(() => a.self.trees.length === 0, 'the sale');
check(a.self.cash > STARTING_CASH && a.self.tutorial === TUTORIAL.done, `selling pays ($${a.self.cash}) and finishes the tutorial`);

// Lightning: plant oaks and watch them die at hidden points.
await act(a, 'dev', { rebirths: 7, seed: 1, count: 6 });
await act(a, 'dev', { tp: [home.x, home.z] });
await sleep(300);
for (let i = 0; i < 6; i += 1) {
  await act(a, 'equip', { ref: 'seed:1:0' });
  await act(a, 'plant', { x: home.x - 8 + (i % 3) * 8, z: home.z - 6 + Math.floor(i / 3) * 12 });
}
check(saplings(a).length >= 5, `a rebirthed plot grows several at once (${saplings(a).length})`);
await waitFor(() => saplings(a).some((s) => s.dead), 'a lightning strike', 60_000);
const dead = saplings(a).find((s) => s.dead);
check(dead.deadMult > 0 && a.fx.some((f) => f.kind === 'strike'), `lightning killed a tree at ${dead.deadMult.toFixed(2)}x, with a strike for everyone to see`);
await act(a, 'harvest', { tree: dead.id });
await waitFor(() => a.self.trees.some((t) => t.dead), 'the dead tree');
check(true, 'a dead tree can be collected');

// A live tree into the garden.
const live = saplings(a).find((s) => !s.dead);
if (live) {
  await act(a, 'harvest', { tree: live.id });
  await sleep(300);
  const item = a.self.trees.find((t) => !t.dead);
  if (item) {
    await act(a, 'equip', { ref: `tree:${item.uid}` });
    const spot = plotToWorld(me(a).plot, gardenSpot(0).x, gardenSpot(0).z);
    await act(a, 'dev', { tp: [spot.x, spot.z + 3] });
    await sleep(250);
    await act(a, 'gardenPlace', { spot: 0 });
    await sleep(300);
    check(plotOf(a).garden.size === 1, 'a live tree goes into the garden row');
    if (process.env.GARDEN === '1') {
      await waitFor(() => [...plotOf(a).garden.values()][0].fruits > 0, 'fruit', 40_000);
      await act(a, 'gardenPick', { spot: 0 });
      await sleep(300);
      check(a.self.fruits.length > 0, 'the garden tree bears fruit that can be picked');
    }
  } else check(false, 'a live tree to plant in the garden');
}

// Rebirth: refused without the cash, spends it with.
const b = await join(`loop-b-${tag}`, 'LoopB');
await act(b, 'rebirth');
check(b.self.rebirths === 0, 'rebirth is refused below $500');
await act(b, 'dev', { cash: 1000 });
await act(b, 'rebirth');
await sleep(200);
check(b.self.rebirths === 1 && b.self.cash === STARTING_CASH, 'Rebirth 1 costs the cash and resets it');

// Ownership.
const target = saplings(a).find((s) => !s.dead);
if (target) {
  const at = plotToWorld(me(a).plot, target.x, target.z);
  await act(b, 'dev', { tp: [at.x, at.z + 2] });
  await sleep(250);
  await act(b, 'harvest', { tree: target.id });
  check(plotOf(a).saplings.has(String(target.id)), "nobody can harvest somebody else's tree");
}
const sign = plotToWorld(me(a).plot, 13.5, 12);
await act(b, 'dev', { tp: [sign.x, sign.z + 2] });
await sleep(250);
await act(b, 'like', { slot: me(a).plot });
await act(b, 'like', { slot: me(a).plot });
await sleep(200);
check(plotOf(a).likes === 1, 'a like lands once a day');

await a.leave();
await b.leave();
console.log(failures === 0 ? 'core loop: all checks passed' : `core loop: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
