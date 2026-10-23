import { Mesh, MeshStandardMaterial, type Group } from 'three';
import type { PartBuilder } from '../render/PartBuilder.js';
import { PartBuilder as Builder } from '../render/PartBuilder.js';
import { ball, block, cone, cylinder, dome, shade } from '../models/shapes.js';
import { paintOutfit, type NpcOutfit } from './NpcSkin.js';
import { PlayerCharacter } from './PlayerCharacter.js';
import { playerModelLoader } from './PlayerModelLoader.js';

/**
 * A KEEPER: the Block City player model - the very same body and skeleton
 * every gardener wears - dressed for the job. The outfit is painted onto a
 * copy of the body's atlas (`NpcSkin`), and a hat, beard or pack is built
 * from blocks and worn on the head or back bone, so it breathes and turns
 * with them. The idle animation is the players' own.
 */

export type Hat = 'straw' | 'sunhat' | 'turban' | 'goggles' | 'visor' | 'explorer' | 'captain' | 'bandana' | 'cowboy' | 'top' | 'beanie' | 'none';
export type Pack = 'backpack' | 'none';

export interface NpcLook {
  readonly outfit: NpcOutfit;
  readonly hat: Hat;
  readonly hatColor: number;
  readonly trim?: number;
  readonly beard?: number;
  readonly pack?: Pack;
  /** Black shades over the eyes. */
  readonly shades?: boolean;
}

/**
 * HATS, built in the head's own frame: the head is a unit cube round the
 * origin (y -0.5..0.5), and the whole thing is scaled to the real head.
 */
const buildHat = (b: PartBuilder, look: NpcLook): void => {
  const c = look.hatColor;
  const trim = look.trim ?? 0xd8443a;
  switch (look.hat) {
    case 'straw':
      cylinder(b, 1.05, 1.05, 0.08, c, { y: 0.5 }, 'smooth', 14);
      cylinder(b, 0.56, 0.6, 0.42, c, { y: 0.72 }, 'smooth', 14);
      cylinder(b, 0.61, 0.61, 0.12, trim, { y: 0.58 }, 'smooth', 14);
      block(b, 0.06, 0.34, 0.06, 0x4cb83a, { x: 0.45, y: 0.8, z: 0.2, rz: -0.4 }, 'leaf');
      break;
    case 'sunhat':
      cylinder(b, 1.1, 1.1, 0.07, c, { y: 0.48 }, 'smooth', 16);
      dome(b, 0.58, c, { y: 0.5 });
      cylinder(b, 0.6, 0.6, 0.12, trim, { y: 0.57 }, 'smooth', 16);
      for (let i = 0; i < 3; i += 1) ball(b, 0.12, [0xff5a8a, 0xffffff, 0xffd23a][i]!, { x: 0.52 + i * 0.05, y: 0.66 + (i % 2) * 0.1, z: 0.25 - i * 0.18 }, 'smooth', 0);
      break;
    case 'turban':
      ball(b, 0.66, c, { y: 0.62, sy: 0.72 }, 'smooth', 1);
      cylinder(b, 0.6, 0.62, 0.22, shade(c, 0.9), { y: 0.46 }, 'smooth', 14);
      ball(b, 0.13, trim, { y: 0.6, z: 0.6 }, 'glow', 0);
      block(b, 0.06, 0.4, 0.06, 0xffffff, { y: 0.9, z: 0.5, rx: -0.4 });
      break;
    case 'goggles':
      // A bandana knotted on top, work goggles pushed up on the forehead.
      block(b, 1.08, 0.3, 1.08, c, { y: 0.44 });
      block(b, 0.3, 0.2, 0.3, c, { y: 0.44, z: -0.62, rx: 0.5 });
      block(b, 1.1, 0.1, 1.1, 0x3a3a3a, { y: 0.34 });
      for (const x of [-0.24, 0.24]) {
        cylinder(b, 0.2, 0.2, 0.12, 0x3a3a3a, { x, y: 0.34, z: 0.55, rx: Math.PI / 2 }, 'smooth', 10);
        cylinder(b, 0.14, 0.14, 0.13, 0x9ad8ff, { x, y: 0.34, z: 0.56, rx: Math.PI / 2 }, 'glow', 10);
      }
      break;
    case 'visor':
      block(b, 1.08, 0.24, 1.08, c, { y: 0.44 });
      block(b, 0.96, 0.06, 0.6, trim, { y: 0.38, z: 0.72 });
      break;
    case 'explorer':
      cylinder(b, 0.98, 0.98, 0.07, c, { y: 0.48 }, 'smooth', 14);
      cylinder(b, 0.54, 0.6, 0.46, c, { y: 0.72 }, 'smooth', 14);
      cylinder(b, 0.61, 0.61, 0.12, trim, { y: 0.55 }, 'smooth', 14);
      block(b, 0.06, 0.5, 0.2, 0xd8443a, { x: 0.6, y: 0.72, z: -0.1, rz: -0.3 });
      break;
    case 'captain':
      cylinder(b, 0.66, 0.6, 0.4, 0x1f2a4a, { y: 0.66 }, 'smooth', 14);
      cylinder(b, 0.62, 0.62, 0.08, 0xffffff, { y: 0.84 }, 'smooth', 14);
      block(b, 0.9, 0.06, 0.5, 0x1a1a1a, { y: 0.48, z: 0.52 });
      block(b, 0.3, 0.2, 0.04, 0xffd23a, { y: 0.66, z: 0.62 });
      break;
    case 'bandana':
      block(b, 1.08, 0.3, 1.08, c, { y: 0.4 });
      block(b, 0.34, 0.5, 0.1, c, { x: 0.25, y: 0.2, z: -0.58, rz: 0.3 });
      block(b, 0.34, 0.5, 0.1, c, { x: -0.1, y: 0.2, z: -0.6, rz: -0.25 });
      for (let i = 0; i < 4; i += 1) block(b, 0.1, 0.1, 0.02, 0xffffff, { x: -0.36 + i * 0.24, y: 0.42, z: 0.55 });
      cylinder(b, 0.08, 0.08, 0.04, 0xffd23a, { x: -0.56, y: -0.1, rz: Math.PI / 2 }, 'smooth', 8);
      break;
    case 'cowboy':
      // A wide brim curled up at the sides, a pinched crown and a band.
      block(b, 1.7, 0.07, 1.3, c, { y: 0.5 });
      block(b, 0.2, 0.07, 1.3, c, { x: 0.88, y: 0.6, rz: 0.5 });
      block(b, 0.2, 0.07, 1.3, c, { x: -0.88, y: 0.6, rz: -0.5 });
      block(b, 0.9, 0.42, 0.8, c, { y: 0.74 });
      block(b, 0.94, 0.1, 0.84, trim, { y: 0.58 });
      block(b, 0.2, 0.08, 0.82, shade(c, 0.85), { y: 0.96 });
      break;
    case 'top':
      cylinder(b, 0.95, 0.95, 0.07, c, { y: 0.5 }, 'smooth', 16);
      cylinder(b, 0.56, 0.56, 0.9, c, { y: 0.98 }, 'smooth', 16);
      cylinder(b, 0.57, 0.57, 0.16, trim, { y: 0.62 }, 'smooth', 16);
      break;
    case 'beanie':
      dome(b, 0.62, c, { y: 0.28, sy: 1.1 });
      cylinder(b, 0.6, 0.6, 0.2, shade(c, 0.85), { y: 0.36 }, 'smooth', 14);
      ball(b, 0.16, trim, { y: 0.98 }, 'smooth', 0);
      break;
    case 'none':
      break;
  }
  if (look.shades) {
    block(b, 0.98, 0.16, 0.06, 0x111111, { y: 0.1, z: 0.53 });
    for (const x of [-0.24, 0.24]) block(b, 0.34, 0.24, 0.07, 0x111111, { x, y: 0.04, z: 0.54 });
  }
  if (look.beard !== undefined) {
    block(b, 0.9, 0.34, 0.2, look.beard, { y: -0.36, z: 0.5 });
    block(b, 0.5, 0.2, 0.18, look.beard, { y: -0.58, z: 0.48 });
    block(b, 0.5, 0.1, 0.1, shade(look.beard, 0.9), { y: -0.12, z: 0.56 });
  }
};

/** A pack on the back: an adventurer's rucksack with a bedroll. Built in world units round the back mount. */
const buildPack = (b: PartBuilder): void => {
  block(b, 1.1, 1.3, 0.55, 0x8a5a2a, { z: -0.1 });
  block(b, 0.8, 0.5, 0.2, 0x6a4020, { y: -0.2, z: -0.45 });
  cylinder(b, 0.26, 0.26, 1.3, 0x3a8a4a, { y: 0.8, z: -0.05, rz: Math.PI / 2 }, 'smooth', 8);
  cone(b, 0.12, 0.2, 0xffd23a, { x: 0.4, y: 0.4, z: -0.42, rx: -Math.PI / 2 }, 'smooth', 6);
};

export class NpcCharacter {
  readonly character = new PlayerCharacter();
  private readonly material: MeshStandardMaterial;

  constructor(look: NpcLook) {
    const atlas = playerModelLoader.atlasImage;
    this.material = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    if (atlas) this.material.map = paintOutfit(atlas, look.outfit);
    this.character.body.model.traverse((child) => {
      if ((child as Mesh).isMesh) (child as Mesh).material = this.material;
    });
    if (look.hat !== 'none' || look.beard !== undefined) {
      const hat = new Builder();
      buildHat(hat, look);
      this.character.wear(hat.build('npc-hat'), 'head');
    }
    if (look.pack === 'backpack') {
      const pack = new Builder();
      buildPack(pack);
      this.character.wear(pack.build('npc-pack'), 'back');
    }
  }

  get root(): Group {
    return this.character.root;
  }

  update(delta: number): void {
    this.character.update(delta);
  }

  dispose(): void {
    this.material.dispose();
    this.character.root.removeFromParent();
  }
}

// ------------------------------------------------------------ the cast

/**
 * THE KEEPERS of Greedy Growers' market, each dressed for their stall:
 *
 *   Buck (Sell)          the reference's seller: a yellow "noob" in a teal shirt, cowboy hat and shades
 *   Farmer Hank (Fall)   straw hat, white beard, denim overalls over a plaid shirt
 *   Penny (Pets)         a pet keeper: beanie, a green apron with a paw badge
 *   Martha (Farmers)     a market grandma: sun hat, flowered apron
 *   Mr. Spins (Wheel)    a showman: top hat, black suit, red bow
 *   Woody (Furniture)    a carpenter: bandana, tool belt
 *   Dee (Market Stands)  a merchant: visor, gold-buttoned waistcoat
 *   Gus (Gear Shop)      a tinkerer: goggles, blue overalls
 *   Wiggles (Worms)      an angler: explorer hat and a rucksack
 */
export const NPC_CAST: Readonly<Record<string, NpcLook>> = {
  sell: {
    outfit: { skin: 0xf5d63a, hair: 0x3a2a1a, shirt: 0x2fa8b8, sleeves: 0xf5d63a, pants: 0x4f8a3a, shoes: 0x2a2a2a, details: [{ kind: 'collar', color: 0x2fa8b8 }] },
    hat: 'cowboy',
    hatColor: 0xb07a3a,
    trim: 0x5a3a1a,
    shades: true,
  },
  fall: {
    outfit: {
      skin: 0xf2c8a0,
      hair: 0xe8e8e8,
      shirt: 0xd8443a,
      pants: 0x3a5a9a,
      shoes: 0x5a3a1a,
      details: [
        { kind: 'stripes', color: 0xa82e28, every: 1 },
        { kind: 'overalls', color: 0x3a5a9a, button: 0xffd23a },
      ],
    },
    hat: 'straw',
    hatColor: 0xf2d27a,
    trim: 0xd8443a,
    beard: 0xf2f2f2,
  },
  pets: {
    outfit: { skin: 0xe8b890, hair: 0x8a3a1a, shirt: 0xf6e6c8, pants: 0x5a4a3a, shoes: 0x3a2a1a, details: [{ kind: 'apron', color: 0x4cb83a, pocket: 0x3a8a2a }, { kind: 'badge', color: 0xff9a3a }] },
    hat: 'beanie',
    hatColor: 0xff7a3a,
    trim: 0xffffff,
  },
  farmers: {
    outfit: { skin: 0xf6d2b0, hair: 0xd8d8d8, shirt: 0xff8ab8, pants: 0x6a4a8a, shoes: 0x3a2a1a, details: [{ kind: 'apron', color: 0xfff4e0, pocket: 0xff5a8a }] },
    hat: 'sunhat',
    hatColor: 0xf6e2a8,
    trim: 0x4cb83a,
  },
  wheel: {
    outfit: { skin: 0xf2c8a0, hair: 0x1a1a1a, shirt: 0x1a1a1a, sleeves: 0x1a1a1a, pants: 0x1a1a1a, shoes: 0x0a0a0a, details: [{ kind: 'collar', color: 0xffffff }, { kind: 'badge', color: 0xe02b2b }, { kind: 'buttons', color: 0xffd23a }] },
    hat: 'top',
    hatColor: 0x1a1a1a,
    trim: 0xe02b2b,
  },
  furniture: {
    outfit: { skin: 0xc8905a, hair: 0x3a2a1a, shirt: 0x5a8ac8, pants: 0x6a5a3a, shoes: 0x3a2a1a, details: [{ kind: 'belt', color: 0x6a4020, buckle: 0xc0c4cc }, { kind: 'stripes', color: 0x3a6aa8, every: 2 }] },
    hat: 'bandana',
    hatColor: 0xe0443a,
  },
  stands: {
    outfit: { skin: 0xe8b890, hair: 0x2a1a0a, shirt: 0xf6f6f6, pants: 0x4a4a52, shoes: 0x2a2a2a, details: [{ kind: 'vest', color: 0xd8443a, button: 0xffd23a }, { kind: 'belt', color: 0x5a3a22, buckle: 0xffd23a }] },
    hat: 'visor',
    hatColor: 0xd8443a,
    trim: 0xffd23a,
  },
  gear: {
    outfit: { skin: 0xf6d2b0, hair: 0xd89a3a, shirt: 0xf2f2f2, pants: 0x3a6ac8, shoes: 0x3a3a3a, details: [{ kind: 'overalls', color: 0x3a6ac8, button: 0xc0c4cc }, { kind: 'belt', color: 0x6a4020, buckle: 0xc0c4cc }] },
    hat: 'goggles',
    hatColor: 0xe0443a,
  },
  worms: {
    outfit: { skin: 0xc8905a, hair: 0x3a2a1a, shirt: 0x6a8a3a, pants: 0x5a4a2a, shoes: 0x3a2a1a, details: [{ kind: 'sash', color: 0x8a5a2a }, { kind: 'belt', color: 0x4a2e1a, buckle: 0xffd23a }] },
    hat: 'explorer',
    hatColor: 0x6a7a3a,
    trim: 0x3a2a1a,
    pack: 'backpack',
    beard: 0x3a2a1a,
  },
};
