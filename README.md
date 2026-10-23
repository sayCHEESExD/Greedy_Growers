# Greedy Growers

A browser multiplayer recreation of the Roblox game **Greedy Growers**: buy saplings as they float down the river,
plant them on your plot, and watch them grow - the longer you wait, the more a tree is worth, but lightning can
strike at any moment and your tree dies. Harvest, carry it to the Sell stand, reinvest in rarer seeds, ride out
weather events for mutations, and rebirth to unlock fertilizers, plot upgrades, the Index, pets, the Farmers
Market, Fall Harvest, furniture, market stands, the Lucky Wheel, the Gear Shop and worms.

Three.js client, authoritative Colyseus server (7 players and 7 plots per room), hosted on Bloxity.

## Play

| Action | PC | Mobile |
| --- | --- | --- |
| Walk / jump | WASD or arrows / Space | left stick / JUMP |
| Camera / zoom | right-drag (or left-drag) / wheel | drag |
| Buy, plant, harvest, sell, talk, like | E at the prompt (or click it) | tap the prompt |
| Plant where you click | click your soil with a seed in hand | tap |
| Hotbar / dialogue choices | 1-0 | tap |
| Items / Pets / mute | B (or G) / P / M | buttons |
| Furniture placement | click to place, R rotates, Esc cancels | tap |

Top buttons: **MARKET**, **PLOT**, **SELL**. Left: Shop (Bux), Items, Rebirth, Index (Rebirth 1). Right: Emotes,
Pets, the leaderboards, sound. The weather chip (bottom right) shows the current event and its timer.

## How it plays

- Every tree has a hidden lightning point rolled when it is planted: half die before 4x, a few pass 60x.
  Fertilizers, worms, Elephants and Turtles push it back. Harvest within 1.00x of it and the tree comes out
  **Shocked** (x2.5) or **Charged** (x7.5).
- Weather (4:30): Misty (Dewy x2, 50%), Sandstorm (Dusty x3, 35%), Blizzard (Frosted x3, 35%), Acid Rain
  (Radioactive x5, 20%), Rainbow (Golden x25, 7.5%), Meteor Shower (Cosmic x100, 2.5%), Lucky River (rare seeds 3x).
- Plant live trees in your garden row for fruit; sell fruit, hand it to the Farmers Market for Tickets, or list it
  on your Market Stand for other players.

## Develop

```bash
npm install
npm run dev
```

Client on http://localhost:6888, server on :3888. See `CLAUDE.md` for the rules, the verification scripts and the
layout.

## Deploy (Boxity Hosting, prod + stage)

`.github/workflows/deploy.yml` publishes every push to `main` (production channel) and `dev` (playtest channel) to
**prod** always, and to **stage** too once the repository has the `LEGION_DEPLOY_TOKEN_STAGE` secret. The platforms
are separate jobs of one matrix (`fail-fast: false`), so a stage failure never blocks prod. A manual run
(`workflow_dispatch`, input `target` = `staging` | `prod`) deploys any branch to one platform.

- **One build for both platforms.** No environment, API URL, base domain or server address goes into the client:
  the page is told its environment by Boxity (`Legion.SDK.environment()`, helper `client/src/bloxity/environment.ts`)
  and reaches its server through Boxity's matchmaker (`Legion.SDK.net.resolveEndpoint('seed-growers')`) on every
  connect. Nothing ever opens a socket to `<id>.host.bloxity.io`.
- **Backend:** built from the root `Dockerfile`, tagged per platform (`<channel>-<sha>` on prod,
  `stage-<channel>-<sha>` on staging) and rolled with `POST {legion}/v1/apps/seed-growers/deploy` with
  `roomSize: 7` (never `seatCap`). Hosting injects `PORT`, `MONGODB_URI`, `BLOXITY_ENV`, `BLOXITY_API_URL`,
  `BLOXITY_MATCHMAKER_URL`, `BLOXITY_PORTAL_URL`, `BLOXITY_STATIC_URL`, `BLOXITY_GAME_ID`, `BLOXITY_REPORT_TOKEN`,
  `MATCHMAKER_REPORT_URL` and `POD_NAME`; the server reads them in `server/src/config/serverConfig.ts`.
- **Frontend:** `client/dist`, zipped with `index.html` at the archive root, uploaded as the raw body to
  `POST {api}/v1/hosting/games/seed-growers/frontend?channel=<channel>&version=<sha>`.

| Branch | Channel | Frontend (play here) | Backend (HTTP: `/health`, webhooks) |
| --- | --- | --- | --- |
| `dev` | DEV | https://seed-growers.dev.play.bloxity.io | https://seed-growers.dev.host.bloxity.io |
| `main` | PROD | https://seed-growers.play.bloxity.io | https://seed-growers.host.bloxity.io |

The backend hosts are HTTP only. The game socket goes through the matchmaker (`resolveEndpoint`), never to
`wss://seed-growers[.dev].host.bloxity.io` directly (docs.bloxity.io > Multiplayer).

One-time setup:

1. Create the game `seed-growers` on https://hosting.bloxity.io (and on hosting.stage.bloxity.io for stage).
2. Add the repository secret `LEGION_DEPLOY_TOKEN`, and `LEGION_DEPLOY_TOKEN_STAGE` to ship to stage too.
3. After the first run, make the GHCR package `seed-growers-server` **public**, then re-run the workflow.
4. Gems store: create the SKUs in `shared/src/config/bux.ts` (`majestic_egg_1/3/10`, `lucky_river`,
   `weather_rainbow`, `weather_meteor`, `tickets_small`, `tickets_large`) in the Boxity catalogue and set
   `BLOXITY_WEBHOOK_SECRET` on the backend.

## Boxity integration

See `BLOXITY_CODE_METADATA.md` for the recorded answers (canDie: false, hasScore: true, room size 7).

- **Matchmaking, parties, Play with friends:** hosted case A - the SDK script tag
  (`sdk.bloxity.io/v1/legion-sdk.min.js`) loads before the bundle and every connect goes through
  `resolveEndpoint`, so Boxity seats parties and CrazyGames instant-join rooms itself. A dropped room re-resolves and
  rejoins; signing in mid-game switches profile on the live session (no reconnect).
- **Open Rooms:** `server/src/legion-room-reporter.ts` reports this pod's rooms every 2 s; `?roomId=` links are
  resolved through `{playUrl}/v1/dir/seed-growers/list` (`client/src/net/RoomLocator.ts`) and fall back to normal
  matchmaking when the room is gone or full.
- **Emotes:** `registerFeature('emotes')` on boot; `play_emote` clips from `{apiUrl}/v1/avatar/emotes` play on the
  rig (`client/src/bloxity/emotes.ts`) and replicate through `PlayerState.emoteId`. No emote UI of our own.
- **Chat bubbles:** `chat.onMessage` -> the SDK's bubble over the sender, matched by the verified Boxity account id
  the server replicates (`PlayerState.accountId`).
- **Leaderboards and stats:** declared in the browser (`shared/src/config/boxity.ts`), submitted by the SERVER from
  its own state (`server/src/bloxity/scoreReporter.ts` every 20 s, `statReporter.ts` every 60 s, both flushed on
  shutdown, both inert without `BLOXITY_REPORT_TOKEN`).
- **Guest progress:** a token verify answering `carriedFrom` copies the first carried Boxity guest save into an
  account that has no progress yet, and marks that guest save used.
- **Local dev:** the Vite dev server injects `window.BLOXITY_ENV = { env: 'local', ... }` (dev only) and the client
  connects straight to the local server on :3888. Catalogue fetches (avatars, emotes) then point at the local portal
  API, `localhost:4000`.
