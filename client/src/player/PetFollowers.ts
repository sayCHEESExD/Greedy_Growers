import { Group } from 'three';
import { meshesFor } from '../render/PartBuilder.js';
import { petGeometry } from '../models/pets.js';

interface Follower {
  id: number;
  readonly group: Group;
  x: number;
  z: number;
  yaw: number;
}

/**
 * A PLAYER'S PETS, trotting behind them: up to three, each at its own spot in
 * a little wedge behind the owner, easing after them with a hop in the step.
 * Lives in the world, not on the character, so the pets lag and turn on
 * their own.
 */
export class PetFollowers {
  readonly root = new Group();
  private readonly followers: Follower[] = [];

  /** The pet ids out now (0 = empty slot). */
  set(ids: readonly number[]): void {
    for (let i = 0; i < 3; i += 1) {
      const id = ids[i] ?? 0;
      const current = this.followers[i];
      if (current?.id === id) continue;
      current?.group.removeFromParent();
      if (!id) {
        if (current) this.followers[i] = { ...current, id: 0, group: new Group() };
        continue;
      }
      const geometry = petGeometry(id);
      const group = geometry ? meshesFor(geometry, `pet-${id}`, true) : new Group();
      this.root.add(group);
      this.followers[i] = { id, group, x: current?.x ?? 0, z: current?.z ?? 0, yaw: current?.yaw ?? 0 };
    }
  }

  update(delta: number, time: number, x: number, y: number, z: number, yaw: number, moving: boolean): void {
    const offsets = [
      [-2.6, -3],
      [2.6, -3],
      [0, -5.2],
    ] as const;
    this.followers.forEach((f, i) => {
      if (!f.id) return;
      const [ox, oz] = offsets[i]!;
      const tx = x + Math.cos(yaw) * ox + Math.sin(yaw) * oz;
      const tz = z - Math.sin(yaw) * ox + Math.cos(yaw) * oz;
      const gap = Math.hypot(tx - f.x, tz - f.z);
      if (gap > 30) {
        f.x = tx;
        f.z = tz;
      }
      const k = 1 - Math.exp(-delta * 5);
      f.x += (tx - f.x) * k;
      f.z += (tz - f.z) * k;
      if (gap > 0.3) f.yaw = Math.atan2(tx - f.x, tz - f.z);
      const hop = moving || gap > 0.6 ? Math.abs(Math.sin(time * 9 + i)) * 0.45 : Math.sin(time * 2 + i) * 0.05 + 0.05;
      f.group.position.set(f.x, y + hop, f.z);
      f.group.rotation.y = f.yaw;
    });
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
