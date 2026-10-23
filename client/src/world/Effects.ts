import { BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { buildFruit } from '../models/greedyTrees.js';
import { PartBuilder } from '../render/PartBuilder.js';

const MAX_PARTICLES = 900;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  spin: number;
  color: number;
}

interface Flyer {
  readonly object: Object3D;
  readonly from: Vector3;
  t: number;
  readonly duration: number;
  readonly target: () => Vector3;
  readonly arc: number;
}

interface Bolt {
  readonly object: Group;
  life: number;
}

const M = new Matrix4();
const Q = new Quaternion();
const S = new Vector3();
const P = new Vector3();
const C = new Color();

/**
 * THE WORLD'S LITTLE MOMENTS: a splash when a plant is watered, a puff of
 * soil when a seed goes in, sparkles, confetti for a purchase, a golden ring
 * for the Harvest Bell, lightning and falling stars - and the harvested fruit
 * that hops off the plant and flies into your backpack.
 *
 * Particles are ONE instanced mesh of tiny cubes; a burst is a few writes.
 */
export class Effects {
  readonly root = new Group();
  private readonly mesh: InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly boltMaterial = new MeshBasicMaterial({ color: 0xfff6a0, fog: false });

  constructor() {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) this.mesh.setColorAt(i, C.setHex(0xffffff));
    this.root.add(this.mesh);
  }

  private emit(x: number, y: number, z: number, count: number, colors: readonly number[], speed: number, up: number, gravity: number, size: number, life: number): void {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * v,
        vy: up * (0.6 + Math.random() * 0.6),
        vz: Math.sin(a) * v,
        life: 0,
        max: life * (0.7 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.6),
        gravity,
        spin: Math.random() * 6,
        color: colors[i % colors.length]!,
      });
    }
  }

  water(x: number, y: number, z: number): void {
    this.emit(x, y + 1.2, z, 16, [0x6ad0ff, 0x9fe4ff, 0xffffff], 3, 5, 18, 0.2, 0.7);
  }

  plant(x: number, y: number, z: number): void {
    this.emit(x, y + 0.3, z, 12, [0x7a4a2c, 0x5a3a22, 0x8a5a38], 2.5, 4, 20, 0.22, 0.6);
    this.emit(x, y + 0.4, z, 5, [0x8aff6a], 1, 3, 2, 0.14, 0.8);
  }

  dig(x: number, y: number, z: number): void {
    this.emit(x, y + 0.3, z, 20, [0x7a4a2c, 0x5a3a22, 0x9a6a3a], 4, 6, 22, 0.28, 0.8);
  }

  sparkle(x: number, y: number, z: number, color = 0xffe066): void {
    this.emit(x, y + 1, z, 18, [color, 0xffffff], 2, 4, -1.5, 0.2, 1.1);
  }

  confetti(x: number, y: number, z: number): void {
    this.emit(x, y + 2, z, 50, [0xff4a5a, 0xffd23a, 0x4ad0ff, 0x6ae05a, 0xff7ad9, 0xffffff], 6, 12, 14, 0.3, 1.8);
  }

  bell(x: number, y: number, z: number): void {
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2;
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      this.particles.push({ x, y: y + 1.5, z, vx: Math.cos(a) * 14, vy: 0.5, vz: Math.sin(a) * 14, life: 0, max: 1, size: 0.35, gravity: 0, spin: 0, color: i % 2 ? 0xffd23a : 0xfff6b0 });
    }
    this.sparkle(x, y + 1, z);
  }

  /** A lightning bolt: a jagged column of glowing blocks from the sky down to the plant. */
  strike(x: number, y: number, z: number, color = 0xfff6a0): void {
    const bolt = new Group();
    const material = color === 0xfff6a0 ? this.boltMaterial : new MeshBasicMaterial({ color, fog: false });
    let px = x;
    let pz = z;
    const segments = 9;
    const top = 60;
    for (let i = 0; i < segments; i += 1) {
      const y0 = y + top - (i * top) / segments;
      const nx = i === segments - 1 ? x : x + (Math.random() - 0.5) * 6;
      const nz = i === segments - 1 ? z : z + (Math.random() - 0.5) * 6;
      const y1 = y + top - ((i + 1) * top) / segments;
      const length = Math.hypot(nx - px, y1 - y0, nz - pz);
      const segment = new BoltSegment(material, 0.6, length);
      segment.position.set((px + nx) / 2, (y0 + y1) / 2, (pz + nz) / 2);
      segment.lookAt(nx, y1, nz);
      bolt.add(segment);
      px = nx;
      pz = nz;
    }
    this.root.add(bolt);
    this.bolts.push({ object: bolt, life: 0.35 });
    this.emit(x, y + 0.6, z, 26, [0xfff04a, 0xffffff, color], 5, 6, 12, 0.24, 0.9);
    // Smoke curling up from the scorched soil.
    this.emit(x, y + 0.8, z, 22, [0x3a3a3e, 0x55555a, 0x2a2a2e], 1.6, 3, -1.2, 0.7, 2.4);
  }

  /** A falling star: a glowing streak down to the plant, then a burst. */
  meteor(x: number, y: number, z: number): void {
    const b = new PartBuilder();
    b.box(1.2, 1.2, 1.2, 0xffc8f4, 'glow');
    b.box(0.6, 0.6, 4, 0xff9ae8, 'glow', { z: -2.4 });
    const star = b.build('meteor', false);
    const from = new Vector3(x - 40, y + 70, z - 30);
    star.position.copy(from);
    star.lookAt(x, y, z);
    this.root.add(star);
    this.flyers.push({ object: star, from, t: 0, duration: 1.1, target: () => P.set(x, y, z).clone(), arc: 0 });
    setTimeout(() => this.emit(x, y + 0.6, z, 34, [0xff9ae8, 0xffffff, 0xb89cff], 6, 9, 10, 0.28, 1.2), 1100);
  }

  /** A picked fruit hops up off the tree and flies to the player. */
  fruit(seedId: number, x: number, y: number, z: number, target: () => Vector3): void {
    const b = new PartBuilder();
    buildFruit(b, seedId, 1.2);
    const fruit = b.build('picked-fruit', false);
    const from = new Vector3(x, y + 0.8, z);
    fruit.position.copy(from);
    this.root.add(fruit);
    this.flyers.push({ object: fruit, from, t: 0, duration: 0.65, target, arc: 3 });
    this.sparkle(x, y, z, 0xb8ff8a);
  }

  /** A harvest: leaves and coins burst from the foot of the tree. */
  harvest(x: number, y: number, z: number): void {
    this.emit(x, y + 1.5, z, 26, [0x4cb83a, 0x6fcf4a, 0x3a9a2a], 5, 8, 14, 0.35, 1);
    this.emit(x, y + 1, z, 14, [0xffd23a, 0xffe066], 4, 10, 18, 0.3, 1.1);
  }

  /** A rebirth: a column of confetti and light round the player. */
  rebirth(x: number, y: number, z: number): void {
    for (let i = 0; i < 4; i += 1) this.confetti(x, y + i * 2, z);
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      this.particles.push({ x: x + Math.cos(a) * 2, y: y + 0.5, z: z + Math.sin(a) * 2, vx: Math.cos(a) * 2, vy: 14 + (i % 4) * 2, vz: Math.sin(a) * 2, life: 0, max: 1.4, size: 0.4, gravity: 4, spin: 0, color: i % 2 ? 0xff5ad8 : 0xfff2a0 });
    }
  }

  update(delta: number): void {
    const dt = Math.min(0.05, Math.max(0, delta));
    let write = 0;
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      if (p.y < 0.05 && p.gravity > 0) {
        p.y = 0.05;
        p.vy *= -0.3;
      }
      const fade = 1 - (p.life / p.max) ** 2;
      Q.setFromAxisAngle(S.set(0.3, 1, 0.2).normalize(), p.spin + p.life * 5);
      M.compose(P.set(p.x, p.y, p.z), Q, S.setScalar(p.size * fade));
      this.particles[write] = p;
      this.mesh.setMatrixAt(write, M);
      this.mesh.setColorAt(write, C.setHex(p.color));
      write += 1;
    }
    this.particles.length = write;
    this.mesh.count = write;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.flyers.length - 1; i >= 0; i -= 1) {
      const f = this.flyers[i]!;
      f.t += dt;
      if (f.t < 0) {
        f.object.rotation.y += dt * 4;
        continue;
      }
      const k = Math.min(1, f.t / f.duration);
      const to = f.target();
      const ease = k * k * (3 - 2 * k);
      f.object.position.lerpVectors(f.from, to, ease);
      f.object.position.y += Math.sin(k * Math.PI) * f.arc;
      f.object.rotation.y += dt * 8;
      f.object.scale.setScalar(Math.max(0.05, 1 - k * 0.8));
      if (k >= 1) {
        this.flyers.splice(i, 1);
        disposeObject(f.object);
      }
    }

    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.bolts[i]!;
      bolt.life -= dt;
      bolt.object.visible = Math.floor(bolt.life * 30) % 3 !== 0;
      if (bolt.life <= 0) {
        this.bolts.splice(i, 1);
        disposeObject(bolt.object);
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.boltMaterial.dispose();
    this.root.removeFromParent();
  }
}

/** One bolt segment: a thin glowing box stretched along its length. */
class BoltSegment extends Group {
  constructor(material: MeshBasicMaterial, width: number, length: number) {
    super();
    const b = new PartBuilder();
    b.box(width, width, length, 0xfff6a0, 'glow');
    const built = b.build('bolt', false);
    built.traverse((child) => {
      const mesh = child as unknown as { isMesh?: boolean; material: unknown };
      if (mesh.isMesh) mesh.material = material;
    });
    this.add(built);
  }
}

const disposeObject = (object: Object3D): void => {
  object.removeFromParent();
  object.traverse((child) => {
    const mesh = child as unknown as { isMesh?: boolean; geometry?: { dispose(): void } };
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
};
