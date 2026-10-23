/**
 * Sanity checks on the SUPPLIED assets.
 *
 * These are the only files in the project that were authored elsewhere, and
 * none of them may be modified: a silent change should produce a loud failure
 * here rather than a character that animates wrongly weeks later.
 *
 * Everything else the game draws - every crop, tool, decoration, building and
 * icon - and every other noise it makes is generated at runtime, which is why
 * this list is short and why it stays short.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Known-good digests of the assets as supplied. Everything in `assets/` is
 * pinned so the folder stays exactly as it was handed over; only some of it
 * ships (see `UNSHIPPED_ASSETS` in client/vite.config.ts):
 *
 *   player/player.fbx + green.png   the bundled avatar body (every player
 *                                   until their Bloxity avatar loads)
 *   ui/shop.png                     the favicon and the loading screen's logo
 *   ui/*.png (imported)             the HUD's Shop, Items, Rebirth, Index, Top, Sound icons
 *   audio/* (imported)              music, lightning, cheers, weather, footsteps
 */
const EXPECTED = [
  { path: 'assets/player/player.fbx', md5: '4211d040bb7098791816ad92a0accaaa' },
  { path: 'assets/player/base_rig.fbx', md5: '4211d040bb7098791816ad92a0accaaa' },
  { path: 'assets/player/green.png', md5: '67421b6f13962ead111335ff50bf58fe' },
  { path: 'assets/ui/shop.png', md5: 'baf5b63cba7737b79dd63478a11768fa' },
  { path: 'assets/ui/inventory.png', md5: '012b566b91c89168b5e3b0f10fe692f1' },
  { path: 'assets/ui/rebirth.png', md5: '022dccdad65f256a546d2a14baf7512a' },
  { path: 'assets/ui/sound.png', md5: '225e1f3bc86303e689d3d56239724aa2' },
  { path: 'assets/ui/trophy.png', md5: 'e57cb95031c6a5feb6142eb05b53e7c1' },
  { path: 'assets/ui/upgrades.png', md5: 'a66cd7a0756b236dce197af4ba44febb' },
  { path: 'assets/audio/Background.mp3', md5: '1f1d91a0649db55386b984c3b55422a3' },
  { path: 'assets/audio/Lightning.mp3', md5: '10cafe0d9d3de9ee5870992c5da722f3' },
  { path: 'assets/audio/alarm.mp3', md5: '415f6ad1bce06e69b66e8da5108d9f96' },
  { path: 'assets/audio/crowd-cheer.mp3', md5: 'cd5e67068f40a83e645d5a725995a136' },
  { path: 'assets/audio/earth-rumble.mp3', md5: '2fbbb9e46d0cb506dbf715d8db57c28c' },
  { path: 'assets/audio/fall.mp3', md5: 'a6c361490b027a8effd0ac861936a5a7' },
  { path: 'assets/audio/jump.mp3', md5: '77c58db6921be7b0c7a61903d38bbf30' },
  { path: 'assets/audio/tornado.mp3', md5: '4f824551e24a104319ab8c30821de4d4' },
  { path: 'assets/audio/walk.mp3', md5: '36e604035c1fc558b5d4a0a1bb3b6205' },
  { path: 'assets/audio/win.mp3', md5: 'e10fb2df41fc12e50443c5e81c409d41' },
];

let failures = 0;

for (const asset of EXPECTED) {
  const full = new URL(asset.path, `file://${root.replace(/\\/g, '/')}`);
  let bytes;
  try {
    bytes = readFileSync(full);
  } catch {
    console.error(`  FAIL  ${asset.path} is missing`);
    failures += 1;
    continue;
  }
  const digest = createHash('md5').update(bytes).digest('hex');
  const size = statSync(full).size;
  if (digest !== asset.md5) {
    console.error(`  FAIL  ${asset.path} has changed (${digest})`);
    failures += 1;
  } else {
    console.log(`  ok    ${asset.path} (${size} bytes)`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} asset problem(s). The supplied files must never be modified.`);
  process.exit(1);
}
console.log('\nassets OK');
