import type { PartBuilder } from '../render/PartBuilder.js';
import { ball, block, brick, cone, cylinder, shade, wedge } from './shapes.js';

const WOOD = 0x8a5228;
const WOOD_DARK = 0x6a3a1a;

/**
 * FURNITURE (Rebirth 4): farm pieces bought with Tickets and placed on a
 * plot's lawn. Built round their own origin, on the ground, facing +Z.
 */
export const buildFurniture = (b: PartBuilder, kind: number): void => {
  switch (kind) {
    case 1: // Hay Bale
      brick(b, 3, 1.6, 2, 0xe8c25a, { y: 0.8 });
      for (const x of [-0.8, 0.8]) block(b, 0.12, 1.64, 2.04, 0xb8862a, { x, y: 0.8 });
      break;
    case 2: // Wooden Bench
      brick(b, 4.2, 0.3, 1.2, WOOD, { y: 1.2 });
      brick(b, 4.2, 1, 0.25, WOOD, { y: 1.9, z: -0.55 });
      for (const x of [-1.8, 1.8]) for (const z of [-0.4, 0.4]) block(b, 0.25, 1.2, 0.25, WOOD_DARK, { x, y: 0.6, z });
      break;
    case 3: // Scarecrow
      block(b, 0.3, 4.6, 0.3, WOOD_DARK, { y: 2.3 });
      block(b, 3.4, 0.25, 0.25, WOOD_DARK, { y: 3.2 });
      brick(b, 1.6, 2, 0.9, 0x3a6ac8, { y: 2.8 });
      brick(b, 1.3, 1.3, 1.1, 0xe8c25a, { y: 4.4 });
      cylinder(b, 1.3, 1.3, 0.12, 0x7a4a1e, { y: 5.1 }, 'smooth', 12);
      cylinder(b, 0.7, 0.8, 0.8, 0x7a4a1e, { y: 5.5 }, 'smooth', 12);
      break;
    case 4: // Pumpkin Pile
      for (const [x, y, z, s] of [
        [-0.6, 0.6, 0, 0.8],
        [0.7, 0.55, 0.2, 0.7],
        [0, 0.5, -0.7, 0.65],
        [0.1, 1.3, -0.1, 0.55],
      ] as const) {
        ball(b, s, 0xff8a1a, { x, y, z, sy: 0.78 }, 'smooth', 1);
        block(b, 0.12, 0.35, 0.12, 0x4f7a2a, { x, y: y + s * 0.85, z });
      }
      break;
    case 5: // Lamp Post
      brick(b, 0.5, 5, 0.5, 0x3a3a42, { y: 2.5 });
      block(b, 1, 1, 1, 0xfff2b0, { y: 5.4 }, 'glow');
      block(b, 1.3, 0.3, 1.3, 0x3a3a42, { y: 6.05 });
      break;
    case 6: // Wheelbarrow
      wedge(b, 2, 1, 2.6, 0xd8443a, { y: 1.3, ry: Math.PI });
      brick(b, 2, 0.2, 2.6, shade(0xd8443a, 0.8), { y: 0.8 });
      cylinder(b, 0.5, 0.5, 0.25, 0x2a2a2a, { y: 0.5, z: 1.4, rz: Math.PI / 2 }, 'smooth', 10);
      for (const x of [-0.7, 0.7]) block(b, 0.15, 0.15, 2, WOOD, { x, y: 1, z: -1.6 });
      break;
    case 7: // Picnic Table
      brick(b, 4.4, 0.3, 2.2, WOOD, { y: 1.8 });
      for (const z of [-1.6, 1.6]) brick(b, 4.4, 0.25, 0.7, WOOD, { y: 1, z });
      for (const x of [-1.8, 1.8]) block(b, 0.3, 1.8, 3.6, WOOD_DARK, { x, y: 0.9, rx: 0 });
      block(b, 1.6, 0.04, 1.2, 0xe02b2b, { y: 1.97 });
      break;
    case 8: // Flower Bed
      brick(b, 3, 0.6, 1.6, WOOD, { y: 0.3 });
      for (let i = 0; i < 6; i += 1) {
        block(b, 0.12, 0.9, 0.12, 0x3fae3a, { x: -1.1 + (i % 3) * 1.1, y: 1, z: i < 3 ? -0.35 : 0.35 }, 'leaf');
        block(b, 0.45, 0.45, 0.45, [0xff5a8a, 0xffd23a, 0xffffff, 0x8ab8ff, 0xff8a2a, 0xc77dff][i]!, { x: -1.1 + (i % 3) * 1.1, y: 1.55, z: i < 3 ? -0.35 : 0.35 });
      }
      break;
    case 9: // Windmill
      brick(b, 3, 7, 3, 0xd8c8a8, { y: 3.5 });
      cone(b, 2.4, 2.4, 0xd8443a, { y: 8.2 }, 'smooth', 4);
      for (let i = 0; i < 4; i += 1) block(b, 0.6, 4.4, 0.15, 0xf4f0e6, { y: 6.2, z: 1.7, rz: (i * Math.PI) / 2 + 0.3 });
      break;
    case 10: // Old Tractor
      brick(b, 4, 1.6, 2.4, 0xd8321e, { y: 1.6 });
      brick(b, 1.8, 1.6, 2, 0xd8321e, { x: -0.9, y: 3.2 });
      block(b, 1.6, 1.2, 1.9, 0x9ad8ff, { x: -0.9, y: 3.3 }, 'smooth');
      for (const [x, r] of [
        [-1.4, 1.2],
        [1.6, 0.8],
      ] as const) for (const z of [-1.35, 1.35]) cylinder(b, r, r, 0.6, 0x2a2a2a, { x, y: r, z, rx: Math.PI / 2 }, 'smooth', 12);
      block(b, 0.3, 1.4, 0.3, 0x3a3a3a, { x: 1.4, y: 3 });
      break;
    case 11: // Gazebo
      brick(b, 6, 0.4, 6, 0xf4f0e6, { y: 0.2 });
      for (const x of [-2.6, 2.6]) for (const z of [-2.6, 2.6]) brick(b, 0.5, 4.4, 0.5, 0xffffff, { x, y: 2.6, z });
      cone(b, 4.6, 2.6, 0x3fae3a, { y: 6.1, ry: Math.PI / 4 }, 'smooth', 4);
      break;
    case 12: // Custom Sign
      block(b, 0.3, 2.4, 0.3, WOOD_DARK, { y: 1.2 });
      brick(b, 2.4, 1.2, 0.3, WOOD, { y: 2.6 });
      break;
    default:
      brick(b, 1, 1, 1, 0xffffff, { y: 0.5 });
  }
};
