import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const COUNT = 10;
const GAP = 2.2;

/**
 * THE GUIDING TRAIL: white chevrons ">>>" laid on the ground from the player
 * toward where the tutorial wants them - the Seed Shop, a soil bed, the ripe
 * carrot, the Sell Stand - sliding along it so the way reads at a glance.
 */
export class Chevrons {
  readonly root = new Group();
  private readonly marks: Mesh[] = [];
  private readonly material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });

  constructor() {
    const left = new BoxGeometry(0.28, 0.05, 1.1);
    left.rotateY(0.7);
    left.translate(-0.33, 0, 0.3);
    const right = new BoxGeometry(0.28, 0.05, 1.1);
    right.rotateY(-0.7);
    right.translate(0.33, 0, 0.3);
    const chevron = mergeGeometries([left, right], false)!;
    left.dispose();
    right.dispose();
    for (let i = 0; i < COUNT; i += 1) {
      const mark = new Mesh(chevron, this.material);
      mark.renderOrder = 3;
      this.marks.push(mark);
      this.root.add(mark);
    }
    this.root.visible = false;
  }

  /** Point the trail from (fx, fz) toward (tx, tz); null hides it. */
  update(from: { x: number; y: number; z: number } | null, to: { x: number; z: number } | null, time: number, ground = 0.08): void {
    if (!from || !to) {
      this.root.visible = false;
      return;
    }
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 3) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const yaw = Math.atan2(dx, dz);
    const ux = dx / distance;
    const uz = dz / distance;
    const slide = (time * 2.2) % GAP;
    this.marks.forEach((mark, i) => {
      const along = 1.8 + i * GAP + slide;
      const visible = along < distance - 1;
      mark.visible = visible;
      if (!visible) return;
      mark.position.set(from.x + ux * along, from.y + ground, from.z + uz * along);
      mark.rotation.y = yaw;
      const fade = Math.min(1, (distance - 1 - along) / 3);
      mark.scale.setScalar(0.6 + 0.4 * fade);
    });
  }

  dispose(): void {
    this.marks[0]?.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
