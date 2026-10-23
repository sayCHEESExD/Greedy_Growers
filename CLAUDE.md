# Greedy Growers

Browser multiplayer recreation of the Roblox game Greedy Growers: Three.js client, Colyseus server, npm workspaces
(`shared` / `server` / `client`), hosted on Bloxity (`window.Legion.SDK`). Infrastructure (networking, prediction,
persistence, Bloxity identity/avatars/Bux, deploy) comes from the sibling `D:\Garden Horizons` / `D:\+1 Monkey
Evolution` lineage; the world, systems, models and UI are this game's own. The user's gameplay video of the original
is the design source of truth; +1 Monkey Evolution is the ART-STYLE reference only (stud-tile terrain, cube-cluster
foliage, grass-capped terraces, bright Roblox lighting), never the layout.

## Commands

```bash
npm run dev                 # builds shared, then server (tsx watch, :3888, --dev-cheats) + Vite client (:6888)
npm run build               # shared + server + client (client/dist)
npm run typecheck           # all workspaces
npm run verify              # verify:progression + verify:layout + verify:assets (static)
npm run verify:loop         # needs npm run dev: bots play the tutorial loop, lightning, garden, rebirth, ownership
npm run verify:capacity     # needs a running server: 10 clients, expects 7-per-room routing
npm run verify:persistence  # spawns its own server on :3889: guests, accounts, grants, restarts (JSON + Mongo)
npm run size:client         # client/dist size against the 12 MB budget (~5.4 MB)
```

In dev the game exposes `window.__greedy.game` (`game.net.dev({...})` sends the dev-cheat message: `cash`,
`tickets`, `seed`+`count`+`mut`, `rebirths`, `egg`, `grow` (to a multiplier, never past the lightning),
`tutorialDone`, `discoverAll`, `weather`, `tp: [x, z]`, `crashes`). The server accepts it only with `--dev-cheats`,
never in production. A hidden preview pane throttles rAF, so screenshots lag; drive it with JS (step frames with
`game.update(1/60, performance.now())`). `window.__hudAudit()` (dev only) reports HUD group rects, overlaps, anything
off screen and anything in the top-left corner, which must stay EMPTY (the portal owns it) on every size, PC and touch.

Do NOT use python from the Bash tool. Use node/sed. Never embed backticks in shell strings (heredocs included):
write the file with the Write tool or a .cjs in the scratchpad.

## Non-negotiable rules

- Ports: server **3888**, Vite **6888**, preview 4888 (most of 2567-3870 belong to sibling games). Room
  `greedygrowers`, Bloxity game id `seed-growers`, 7 per room = 7 plots.
- **Client build under 12 MB.** Audio and HUD icons are IMPORTED (content-hashed); `vite.config.ts` prunes the raw
  copies (only `ui/shop.png` ships as a file, for the favicon and boot logo). `verify-assets` pins every supplied file.
- **THE CRASH POINT IS SECRET.** Every sapling's lightning multiplier is rolled by the server at planting
  (`rollCrash`, `shared/config/economy.ts`: P(crash > m) = 4 / (4 + m)), kept in `PlotService.hidden` and the saved
  profile, and NEVER written to the schema. Clients get `plantedAt`/`rate`/`boost` and compute the multiplier.
  `verify:loop` asserts the schema carries no crash field.
- **Server-authoritative economy.** Buying river seeds, planting, harvesting, garden, selling, rebirth, stalls,
  pets, codes and stands are validated against the server's position of the player, their own plot, hand and purse
  (`server/src/farm/*`). Cash and inventory are PRIVATE (`SelfState`, the `self` message); plots and the river are
  public schema.
- **Values are the original's where published** (see `verify-progression.mjs`): the 20 river seeds with prices,
  rarities and 1-in-N odds; guaranteed Legendary every 5:00, Mythic every 10:00; mutations Dewy x2 ... Cosmic x100,
  multiplied together; weather chances and 4:30 events; fertilizers 1.5/2.5/4/6x crash and +25..100% speed;
  eggs 100..2,000 Tickets; Rebirth 1 $500, 2 $250K, 6 $100Qi, 7 $100Sp; Majestic Egg odds from the video. Tree
  value = seed base (price, Oak $5) x multiplier x mutations; dead = 40% (fits the video's sales). Unpublished
  numbers (growth speeds, Rebirth 3-5 costs, pet passive strengths, fruit values) are this game's and documented
  at their definitions.
- **Near miss**: harvesting within 1.00x of the crash point makes the tree Shocked (<25x) or Charged (>=25x).
- **Weather is the clock** (`scheduledWeather`, an 8-minute cycle: 3:30 clear then one event) unless a room is
  forced (Bux weather / dev). Weather rolls once per sapling per event (`hidden.rolledAt`), at spawn for river seeds
  and per fruit for gardens.
- **Plot-local coordinates**: saplings, garden spots, furniture are stored relative to the plot middle
  (`plotToWorld`/`plotToLocal`), so a returning player may get another slot.
- **Placement rules are shared** (`furnitureProblem` in `shared/config/items.ts`): server enforces, client previews.
- **Art style: a polished Roblox game.** Everything is block-built with `PartBuilder` (merged meshes, stud shader).
  Trees: `client/src/models/greedyTrees.ts` (15 families x 5 growth stages + dead + mutation paints, geometry cached
  per key; `treeHeight` sizes by multiplier). Stalls `models/market.ts`, pets `models/pets.ts`, furniture
  `models/furniture.ts`. NPCs are the player FBX re-dressed (`player/NpcCharacter.ts`, `NPC_CAST`).
- **Responsive HUD: one unit** `--u`; styles in `client/src/ui/styles.ts` (`gg-` classes), touch rules at its end.
- **PC controls**: in free roam a click on the world locks the cursor to the camera (`MouseLook`), clicks then pick
  at the crosshair, Escape releases; any menu or keeper dialogue releases it. HUD buttons have shortcut keys with
  badges (`Hud.bindShortcut`): MARKET Z, PLOT X, SELL C, Shop T, Items B/G, Rebirth R, Index I, Pets J, Top L,
  Sound M. Never bind P.
- **Keeper dialogue** ends in one place (`Game.closeTalk`): options, speech bubble and counter window go together the
  moment the player leaves the Talk prompt's reach, picks Nevermind or presses Escape.

## Layout facts (`shared/config/map.ts`)

- Bounds x -186..186, z -104..150, beige studded walls round it, the stadium behind the Greedy Tree past the north
  wall. Beyond the walls: Monkey Evolution terrain walls (`world/Wild.ts` `terrainWall`, sandstone tiers + turf) with
  plants placed ONLY on the ledges it returns, and giant trees on the valley floor. NOTHING floats: every prop takes
  the ground (0) or a ledge/step top as its y.
- The river runs along z = 0 (half-width 7) from the stepped waterfall cliff (west, x -152; three steps with pools,
  the giant autumn tree on the top step) to a stone-arch tunnel (east, x 172); seeds ride 4 lanes at 4.2 u/s, one
  every 1.5 s. The canal and falls are noise shaders in `FarmWorld.ts` (no tiled texture).
- North bank: the Sell stand (26, 20), Fall Harvest with its ring of fire (-50, 26), the stall row at z 58 west to
  east: Lucky Wheel, Pets, Farmers Market, Furniture, Market Stands, Gear Shop, Worms (x -102..100); the glowing
  Greedy Tree (0, 108), leaderboards (56, 106), the fenced palm/blossom garden along the bank x 52..168, z 16..42,
  the guaranteed-spawn board by the source (-124, 15). Spawn (0, 26). Stall models: `models/market.ts`, placed by
  `world/MarketScene.ts`.
- South bank: 7 plots in one row at z -52, x -150..150 step 50. Each: 32x32 soil (diamond lattice), the garden row
  behind (z -25, up to 7 spots), sign at (19.5, 18.5) on legs behind its board, market stand at (-19.5, 18.5), lawn
  x+-22, z -32..21.

## Progress and identity

Per-key storage (`server/src/persistence/`), Mongo via `MONGODB_URI` else JSON (`GREEDY_DATA_DIR`, default
`server/data`), profile read at join, Bloxity token verified server-side, guest -> account migration, webhook Bux
grants (`shared/config/bux.ts`: Majestic Eggs, weather, Ticket packs). Profile: `StoredProfile.ts`.

## Boxity rules (see README "Boxity integration" and BLOXITY_CODE_METADATA.md)

- Every Boxity URL comes from the told environment: `client/src/bloxity/environment.ts` in the browser,
  `serverConfig.bloxity` on the server. Never write api./play./static.bloxity.io anywhere else.
- Production connects ONLY via `Legion.SDK.net.resolveEndpoint` (new Client per resolve). Never a server URL in the
  build, never `<id>.host.bloxity.io` for the socket. Dev builds connect to ws://<host>:3888.
- Never build emote or chat UI, never bind P, never draw Log in inside Boxity. Stats and leaderboard scores are read
  from server-owned state only (`server/src/bloxity/`).
