import { VISIBLE_REMOTE_PLAYERS } from '@greedy/shared';
import type { Scene, Vector3 } from 'three';
import type { NetPlayerState } from '../net/netTypes.js';
import type { HeldModelFactory } from './held.js';
import { RemotePlayer } from './RemotePlayer.js';

const RANK_INTERVAL = 0.3;
const SWAP_MARGIN = 16;

/**
 * Every other player in the room: a registry, and a VISIBILITY POLICY.
 *
 * Every remote is TRACKED on every patch. Only the `VISIBLE_REMOTE_PLAYERS`
 * nearest are DRAWN.
 */
export class RemotePlayerManager {
  private readonly players = new Map<string, RemotePlayer>();
  private readonly visible = new Set<string>();
  private readonly scene: Scene;
  private sinceRank = RANK_INTERVAL;
  private readonly ranked: { id: string; distance: number }[] = [];

  constructor(scene: Scene, private readonly heldModels: HeldModelFactory) {
    this.scene = scene;
  }

  get count(): number {
    return this.players.size;
  }

  get drawnCount(): number {
    return this.visible.size;
  }

  add(sessionId: string, state: NetPlayerState): void {
    if (this.players.has(sessionId)) return;
    this.players.set(sessionId, new RemotePlayer(state, this.heldModels));
    this.sinceRank = RANK_INTERVAL;
  }

  update(sessionId: string, state: NetPlayerState): void {
    this.players.get(sessionId)?.apply(state);
  }

  /** The remote whose verified Boxity account this is, or null. */
  byAccount(accountId: string): RemotePlayer | null {
    if (!accountId) return null;
    for (const player of this.players.values()) if (player.accountId === accountId) return player;
    return null;
  }

  has(sessionId: string): boolean {
    return this.players.has(sessionId);
  }

  /** Drop every remote not in `present` (they left the room). */
  retain(present: ReadonlySet<string>): void {
    for (const id of [...this.players.keys()]) if (!present.has(id)) this.remove(id);
  }

  remove(sessionId: string): void {
    const player = this.players.get(sessionId);
    if (!player) return;
    this.hide(sessionId, player);
    player.dispose();
    this.players.delete(sessionId);
    this.sinceRank = RANK_INTERVAL;
  }

  /** Every remote currently drawn. */
  forEachVisible(visit: (player: RemotePlayer) => void): void {
    for (const id of this.visible) {
      const player = this.players.get(id);
      if (player) visit(player);
    }
  }

  advance(delta: number, local: Vector3 | null): void {
    this.sinceRank += Math.max(0, delta);
    if (this.sinceRank >= RANK_INTERVAL && local) {
      this.sinceRank = 0;
      this.rank(local);
    }
    for (const id of this.visible) this.players.get(id)?.update(delta);
  }

  dispose(): void {
    for (const [id, player] of this.players) {
      this.hide(id, player);
      player.dispose();
    }
    this.players.clear();
    this.visible.clear();
  }

  private rank(local: Vector3): void {
    this.ranked.length = 0;
    for (const [id, player] of this.players) {
      const dx = player.position.x - local.x;
      const dy = player.position.y - local.y;
      const dz = player.position.z - local.z;
      this.ranked.push({ id, distance: Math.sqrt(dx * dx + dy * dy + dz * dz) });
    }

    const scored = this.ranked.map((entry) => ({
      id: entry.id,
      score: this.visible.has(entry.id) ? entry.distance - SWAP_MARGIN : entry.distance,
    }));
    scored.sort((a, b) => a.score - b.score);

    const winners = new Set<string>();
    for (let i = 0; i < scored.length && winners.size < VISIBLE_REMOTE_PLAYERS; i += 1) {
      const entry = scored[i];
      if (!entry) continue;
      winners.add(entry.id);
    }

    for (const id of [...this.visible]) {
      if (winners.has(id)) continue;
      const player = this.players.get(id);
      if (player) this.hide(id, player);
    }
    for (const id of winners) {
      if (this.visible.has(id)) continue;
      const player = this.players.get(id);
      if (player) this.show(id, player);
    }
  }

  private show(id: string, player: RemotePlayer): void {
    this.scene.add(player.character.root, player.pets.root);
    this.visible.add(id);
  }

  private hide(id: string, player: RemotePlayer): void {
    if (!this.visible.delete(id)) return;
    player.character.root.removeFromParent();
    player.pets.root.removeFromParent();
  }
}
