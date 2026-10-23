import { STALLS, WHEEL, type StallId } from '@greedy/shared';
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { buildStall, buildWheelFace, stallLayout, WHEEL_FACE, type StallSignSpot } from '../models/market.js';
import { block, brick } from '../models/shapes.js';
import { NPC_CAST, NpcCharacter } from '../player/NpcCharacter.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { CanvasSign, type SignLine } from './CanvasSign.js';

/** A title in the reference's chunky outlined lettering. */
const title = (text: string, fill: string, size = 1): SignLine[] => [{ text, size, fill, stroke: '#3a1a08', strokeWidth: 0.16 }];

const STALL_TITLES: Readonly<Record<StallId, { fill: string; text: string }>> = {
  sell: { fill: '#ffffff', text: 'SELL' },
  fall: { fill: '#ffb21a', text: 'FALL HARVEST' },
  pets: { fill: '#ffd23a', text: 'PETS' },
  farmers: { fill: '#ffffff', text: 'FARMERS MARKET' },
  wheel: { fill: '#ffd23a', text: 'LUCKY WHEEL' },
  furniture: { fill: '#fff2d0', text: 'FURNITURE' },
  stands: { fill: '#ffb21a', text: 'MARKET STANDS' },
  gear: { fill: '#5ad8ff', text: 'GEAR SHOP' },
  worms: { fill: '#ff8ac0', text: 'WORMS' },
};

export interface StallView {
  readonly id: StallId;
  readonly keeper: NpcCharacter;
  readonly group: Group;
}

/**
 * THE MARKET: every stall (`models/market.ts`), its title board, its keeper,
 * the Lucky Wheel's spinning face, the Fall Harvest's ring of fire, and the
 * lamp posts along the market walk. Positions come from `STALLS`
 * (`shared/config/map.ts`); each stall is built facing +Z round its middle
 * and turned to its yaw.
 */
export class MarketScene {
  readonly root = new Group();
  readonly stalls: StallView[] = [];
  private wheelFace: Group | null = null;
  private wheelSpin = 0;
  private wheelTarget = 0;
  private wheelSpeed = 0;
  private readonly fire: Mesh[] = [];

  constructor() {
    for (const stall of STALLS) {
      const group = new Group();
      const b = new PartBuilder();
      buildStall(b, stall.id);
      group.add(b.build(`stall-${stall.id}`));
      const t = STALL_TITLES[stall.id];
      const layout = stallLayout(stall.id);
      // The title on the face of the stall's wooden title board.
      group.add(placeSign(new CanvasSign(layout.title.w, layout.title.h, title(t.text, t.fill)), layout.title));
      if (layout.sold) group.add(placeSign(new CanvasSign(layout.sold.w, layout.sold.h, title('SOLD', '#ffe2b8')), layout.sold));
      if (stall.id === 'wheel') {
        const face = new PartBuilder();
        buildWheelFace(face, WHEEL.map((s) => s.color));
        this.wheelFace = face.build('wheel-face');
        this.wheelFace.position.set(WHEEL_FACE.x, WHEEL_FACE.y, WHEEL_FACE.z);
        this.wheelFace.scale.setScalar(WHEEL_FACE.scale);
        group.add(this.wheelFace);
      }
      if (stall.id === 'fall') {
        // The ring of fire round the Fall Harvest stand.
        const ring = new Mesh(ringGeometry(stall.hx + 5, 0.9, 48), new MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.85, fog: false, side: DoubleSide }));
        ring.position.y = 0.12;
        group.add(ring);
        this.fire.push(ring);
      }
      const keeper = new NpcCharacter(NPC_CAST[stall.id]!);
      keeper.root.position.set(layout.keeper.x, layout.keeper.y, layout.keeper.z);
      group.add(keeper.root);
      group.position.set(stall.x, 0, stall.z);
      group.rotation.y = stall.yaw;
      this.root.add(group);
      this.stalls.push({ id: stall.id, keeper, group });
    }
    this.buildLamps();
  }

  /** Lamp posts along the market walk, between the stalls. */
  private buildLamps(): void {
    const b = new PartBuilder();
    const row = STALLS.filter((s) => s.id !== 'sell' && s.id !== 'fall').sort((a, c) => a.x - c.x);
    const spots: [number, number][] = [];
    for (let i = 0; i + 1 < row.length; i += 1) spots.push([(row[i]!.x + row[i + 1]!.x) / 2, row[i]!.z - 6]);
    for (const [x, z] of spots) {
      // The stalls' wood and stone, a lantern on top.
      brick(b, 1.2, 0.6, 1.2, 0x8e8e96, { x, y: 0.3, z });
      brick(b, 0.7, 6.8, 0.7, 0x6a3a1a, { x, y: 3.6, z });
      block(b, 1.6, 0.25, 1.6, 0x2a2a30, { x, y: 7.1, z });
      block(b, 1.1, 1.2, 1.1, 0xffe08a, { x, y: 7.8, z }, 'glow');
      for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]] as const) block(b, 0.16, 1.2, 0.16, 0x2a2a30, { x: x + dx, y: 7.8, z: z + dz });
      block(b, 1.8, 0.3, 1.8, 0x2a2a30, { x, y: 8.5, z });
      block(b, 0.9, 0.3, 0.9, 0x2a2a30, { x, y: 8.8, z });
    }
    this.root.add(b.build('lamps'));
  }

  /** Spin the Lucky Wheel to land on a slice (the server already chose it). */
  spinWheel(slice: number): void {
    const n = WHEEL.length;
    // Slice i's middle sits (i + 0.5)/n of a turn clockwise from the top; turning the
    // face by that much (rotation.z is anticlockwise) brings it under the top pointer.
    const target = ((slice + 0.5) / n) * Math.PI * 2;
    const base = Math.ceil(this.wheelSpin / (Math.PI * 2)) * Math.PI * 2;
    this.wheelTarget = base + Math.PI * 2 * 5 + ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.wheelSpeed = 1;
  }

  /** True while the wheel is still turning. */
  get wheelSpinning(): boolean {
    return this.wheelSpeed > 0;
  }

  update(delta: number, time: number): void {
    for (const ring of this.fire) {
      const m = ring.material as MeshBasicMaterial;
      m.opacity = 0.65 + Math.sin(time * 6) * 0.2;
      ring.scale.setScalar(1 + Math.sin(time * 3) * 0.02);
    }
    if (this.wheelFace) {
      if (this.wheelSpeed > 0) {
        const left = this.wheelTarget - this.wheelSpin;
        const step = Math.max(0.02, left * 2.2) * delta;
        this.wheelSpin = Math.min(this.wheelTarget, this.wheelSpin + step);
        if (this.wheelTarget - this.wheelSpin < 0.002) this.wheelSpeed = 0;
      } else this.wheelSpin += delta * 0.25;
      this.wheelFace.rotation.z = this.wheelSpin;
    }
    for (const stall of this.stalls) stall.keeper.update(delta);
  }
}

/** Hang a canvas sign at a spot (the face of a title board), just proud of the wood. */
const placeSign = (sign: CanvasSign, at: StallSignSpot): Mesh => {
  sign.mesh.position.set(at.x, at.y, at.z);
  sign.mesh.rotation.z = at.rz ?? 0;
  return sign.mesh;
};

/** A flat ring on the ground (the fire round the Fall Harvest stand, the Greedy Tree's halos). */
export const ringGeometry = (radius: number, width: number, segments: number): BufferGeometry => {
  const positions: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const r0 = radius - width / 2;
    const r1 = radius + width / 2;
    const p = (a: number, r: number): [number, number, number] => [Math.cos(a) * r, 0, Math.sin(a) * r];
    positions.push(...p(a0, r0), ...p(a1, r1), ...p(a0, r1), ...p(a0, r0), ...p(a1, r0), ...p(a1, r1));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
};
