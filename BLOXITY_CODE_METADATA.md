---
gameSlug: seed-growers
hostingId: seed-growers
canDie: false
hasScore: true
rewards: true
roomSize: 7
partyPlay: automatic (hosted on Boxity, Colyseus through the Boxity matchmaker)
playWithFriends: automatic (Boxity matchmaker; the game makes no private rooms of its own)
---

# Greedy Growers - Boxity integration facts

- **canDie: false.** The player character never dies or respawns. Lightning kills TREES (a tree turns dead and
  sells for 40%), which is not a player death, so the game shows no Boxity death screen. Decided by the developer.
- **hasScore: true.** Leaderboards mirror the in-game boards, all-time, higher wins, reported by the SERVER from
  state it owns (`server/src/bloxity/scoreReporter.ts`, every 20 s and on shutdown), declared in the browser on boot so the trophy button shows:
  - `cash` - Cash (current balance, `latest`, compact)
  - `earned` - Total Earned (`best`, compact)
  - `rebirths` - Rebirths (`best`, number)
  - `best_tree` - Biggest Tree, the most valuable live tree harvested (`best`, compact)
- **Profile stats** ("Only in this game", `server/src/bloxity/statReporter.ts`): Rebirths, Trees Harvested, Trees
  Planted, Lightning Strikes, Pets Owned, Biggest Tree, Total Earned (definitions in `shared/src/config/boxity.ts`). Currency values above Boxity's ceiling are
  omitted, never clamped.
- **Room size** 7 (`MAX_PLAYERS_PER_ROOM`): one plot per player.
- **rewards: true.** One rewarded ad, chosen by the developer: at the Sell stand, "Watch an ad: next sale pays 2x"
  (placement `double-sale`, a 10-minute cooldown). Granted by the SERVER only after
  `POST {BLOXITY_API_URL}/v1/ads/reward/verify` answers `valid: true` for the ad's token
  (`server/src/bloxity/adReward.ts`); the bonus is saved on the profile until the next sale spends it.
- **Ad breaks** pause and mute the game (`Game.setAdBreak`). **Screen ads**: every full-screen panel (shop, items,
  rebirth, index, pets, boards, the stalls) is a `panel` screen; `client/src/bloxity/BloxityAds.ts` lays the banners
  out round the open panel (and Boxity's toolbar) so none covers it, skipping positions with no room, and re-sends
  only when that layout changes - never while a rewarded ad is pending. There is no menu, lobby or results screen.
- **Death screen:** none, because canDie is false.
