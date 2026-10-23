import { petById, type PetDef } from '@greedy/shared';
import type { BufferGeometry } from 'three';
import { PartBuilder, type PartKind } from '../render/PartBuilder.js';
import { ball, block, cone, shade, wedge } from './shapes.js';

/**
 * THE PETS, block-built like everything else: a body plan per kind of animal
 * (rodent, bunny, dog, cat, bird, bug, cow, pig, frog, turtle, monkey, gator,
 * flamingo, horse) dressed in the pet's colours. About a metre tall, facing
 * +Z, feet on y = 0.
 */
const eyes = (b: PartBuilder, x: number, y: number, z: number, gap: number, s = 0.16): void => {
  for (const side of [-1, 1]) {
    block(b, s, s, 0.06, 0xffffff, { x: x + side * gap, y, z });
    block(b, s * 0.55, s * 0.55, 0.07, 0x111111, { x: x + side * gap, y, z: z + 0.01 });
  }
};

const legs = (b: PartBuilder, color: number, w: number, h: number, dx: number, dz: number): void => {
  for (const x of [-dx, dx]) for (const z of [-dz, dz]) block(b, w, h, w, color, { x, y: h / 2, z });
};

export const buildPet = (b: PartBuilder, pet: PetDef): void => {
  const { body, accent, detail } = pet;
  switch (pet.shape) {
    case 'rodent': {
      const spiky = pet.name === 'Hedgehog';
      b.box(0.9, 0.7, 1.1, body, 'flat', { y: 0.45 });
      b.box(0.6, 0.55, 0.5, accent, 'flat', { y: 0.55, z: 0.65 });
      eyes(b, 0, 0.66, 0.91, 0.14, 0.12);
      ball(b, 0.08, 0x2a1a1a, { y: 0.55, z: 0.92 }, 'smooth', 0);
      for (const side of [-1, 1]) block(b, 0.22, 0.26, 0.06, accent, { x: side * 0.24, y: 0.92, z: 0.55 });
      if (spiky) for (let i = 0; i < 8; i += 1) cone(b, 0.12, 0.35, detail, { x: -0.3 + (i % 4) * 0.2, y: 0.85, z: -0.3 + Math.floor(i / 4) * 0.35, rx: -0.6 }, 'smooth', 4);
      else block(b, 0.25, 0.25, 0.9, body, { y: 0.8, z: -0.75, rx: -0.9 });
      legs(b, detail, 0.18, 0.15, 0.28, 0.35);
      break;
    }
    case 'bunny':
      b.box(0.8, 0.75, 0.95, body, 'flat', { y: 0.45 });
      b.box(0.65, 0.6, 0.55, body, 'flat', { y: 0.95, z: 0.4 });
      for (const side of [-1, 1]) block(b, 0.16, 0.6, 0.1, accent, { x: side * 0.17, y: 1.5, z: 0.35, rz: side * 0.15 });
      eyes(b, 0, 1, 0.68, 0.14, 0.12);
      ball(b, 0.16, 0xffffff, { y: 0.55, z: -0.5 }, 'smooth', 0);
      legs(b, body, 0.2, 0.16, 0.25, 0.3);
      break;
    case 'dog':
    case 'cat': {
      const cat = pet.shape === 'cat';
      b.box(0.8, 0.65, 1.3, body, 'flat', { y: 0.7 });
      b.box(0.75, 0.65, 0.65, body, 'flat', { y: 1.15, z: 0.75 });
      b.box(0.4, 0.3, 0.3, accent, 'flat', { y: 1.0, z: 1.15 });
      ball(b, 0.08, 0x1a1a1a, { y: 1.1, z: 1.31 }, 'smooth', 0);
      eyes(b, 0, 1.28, 1.08, 0.16, 0.12);
      for (const side of [-1, 1]) {
        if (cat) cone(b, 0.15, 0.3, body, { x: side * 0.22, y: 1.6, z: 0.7 }, 'smooth', 4);
        else block(b, 0.18, 0.4, 0.12, detail, { x: side * 0.38, y: 1.25, z: 0.65 });
      }
      block(b, 0.16, 0.16, 0.7, cat ? body : detail, { y: 1.05, z: -0.85, rx: cat ? -1.1 : -0.6 });
      legs(b, cat ? body : accent, 0.2, 0.4, 0.26, 0.45);
      if (pet.name === 'Raccoon') for (const side of [-1, 1]) block(b, 0.22, 0.12, 0.05, 0x1a1a1a, { x: side * 0.16, y: 1.28, z: 1.1 });
      break;
    }
    case 'bird':
      b.box(0.75, 0.75, 0.85, body, 'flat', { y: 0.65 });
      b.box(0.6, 0.55, 0.55, pet.name === 'Woodpecker' || pet.name === 'Magpie' ? body : accent, 'flat', { y: 1.15, z: 0.3 });
      b.box(0.62, 0.45, 0.2, accent, 'flat', { y: 0.65, z: 0.42 });
      cone(b, 0.12, 0.35, detail === 0x2a1a0a ? 0xffb21a : detail, { y: 1.1, z: 0.72, rx: Math.PI / 2 }, 'smooth', 4);
      eyes(b, 0, 1.25, 0.58, 0.16, 0.11);
      for (const side of [-1, 1]) block(b, 0.12, 0.5, 0.6, shade(body, 0.85), { x: side * 0.42, y: 0.7, z: -0.05 });
      block(b, 0.5, 0.12, 0.5, shade(body, 0.8), { y: 0.55, z: -0.6, rx: -0.4 });
      if (pet.name === 'Chicken' || pet.name === 'Woodpecker') block(b, 0.12, 0.25, 0.3, detail === 0xffb21a ? accent : detail, { y: 1.5, z: 0.3 });
      for (const side of [-1, 1]) block(b, 0.08, 0.3, 0.08, 0xffb21a, { x: side * 0.16, y: 0.15 });
      break;
    case 'bug':
      b.box(0.8, 0.35, 1.1, body, 'flat', { y: 0.3 });
      b.box(0.5, 0.3, 0.35, accent, 'flat', { y: 0.32, z: 0.7 });
      for (const side of [-1, 1]) block(b, 0.04, 0.04, 0.8, detail, { x: side * 0.12, y: 0.55, z: 1.1, rx: -0.5, ry: side * 0.3 });
      for (let i = -1; i <= 1; i += 1) for (const side of [-1, 1]) block(b, 0.5, 0.06, 0.06, detail, { x: side * 0.5, y: 0.2, z: i * 0.3, rz: side * 0.4 });
      break;
    case 'cow':
    case 'pig': {
      const pig = pet.shape === 'pig';
      const big = pet.name === 'Elephant';
      b.box(1.1, 0.85, 1.5, body, 'flat', { y: 0.95 });
      b.box(0.85, 0.75, 0.6, body, 'flat', { y: 1.3, z: 0.95 });
      b.box(0.6, 0.35, 0.25, pig ? accent : 0xffc4cc, 'flat', { y: 1.1, z: 1.3 });
      eyes(b, 0, 1.48, 1.26, 0.2, 0.12);
      if (!pig && !big && pet.name !== 'Sheep') {
        for (let i = 0; i < 3; i += 1) block(b, 0.5, 0.4, 0.04, accent, { x: -0.56, y: 0.9 + (i % 2) * 0.2, z: -0.4 + i * 0.4 });
        for (const side of [-1, 1]) cone(b, 0.1, 0.3, 0xf2e6c8, { x: side * 0.35, y: 1.8, z: 0.85 }, 'smooth', 4);
      }
      if (pet.name === 'Sheep') for (let i = 0; i < 6; i += 1) ball(b, 0.38, 0xffffff, { x: -0.3 + (i % 2) * 0.6, y: 1.3, z: -0.5 + Math.floor(i / 2) * 0.5 }, 'flat', 0);
      if (big) {
        block(b, 0.3, 0.9, 0.3, body, { y: 0.8, z: 1.4, rx: 0.3 });
        for (const side of [-1, 1]) block(b, 0.1, 0.8, 0.7, shade(body, 0.9), { x: side * 0.5, y: 1.3, z: 0.85 });
      }
      for (const side of [-1, 1]) block(b, 0.22, 0.2, 0.1, shade(body, 0.85), { x: side * 0.42, y: 1.6, z: 0.8 });
      legs(b, pig ? body : detail === 0xffb0c0 ? 0x3a3a3a : shade(body, 0.8), 0.28, 0.55, 0.36, 0.5);
      break;
    }
    case 'frog':
      b.box(1, 0.6, 1, body, 'flat', { y: 0.4 });
      b.box(0.8, 0.12, 0.3, accent, 'flat', { y: 0.35, z: 0.45 });
      for (const side of [-1, 1]) {
        b.box(0.3, 0.3, 0.3, body, 'flat', { x: side * 0.28, y: 0.8, z: 0.3 });
        block(b, 0.16, 0.16, 0.06, 0x111111, { x: side * 0.28, y: 0.82, z: 0.46 });
        block(b, 0.35, 0.18, 0.6, shade(body, 0.85), { x: side * 0.55, y: 0.12, z: -0.1 });
      }
      break;
    case 'turtle':
      b.box(1.2, 0.5, 1.4, accent, 'flat', { y: 0.55 });
      b.box(1, 0.3, 1.2, shade(accent, 1.15), 'flat', { y: 0.9 });
      for (let i = 0; i < 4; i += 1) block(b, 0.3, 0.06, 0.3, detail, { x: -0.25 + (i % 2) * 0.5, y: 1.06, z: -0.3 + Math.floor(i / 2) * 0.6 });
      b.box(0.45, 0.4, 0.5, body, 'flat', { y: 0.5, z: 0.9 });
      eyes(b, 0, 0.6, 1.16, 0.12, 0.1);
      legs(b, body, 0.28, 0.3, 0.45, 0.5);
      break;
    case 'monkey':
      b.box(0.8, 0.9, 0.6, body, 'flat', { y: 0.95 });
      b.box(0.75, 0.7, 0.65, body, 'flat', { y: 1.7 });
      b.box(0.55, 0.45, 0.1, accent, 'flat', { y: 1.62, z: 0.34 });
      eyes(b, 0, 1.75, 0.4, 0.14, 0.12);
      for (const side of [-1, 1]) {
        block(b, 0.2, 0.25, 0.1, accent, { x: side * 0.44, y: 1.75 });
        block(b, 0.2, 0.8, 0.2, body, { x: side * 0.5, y: 0.9, rz: side * 0.2 });
        block(b, 0.22, 0.55, 0.22, body, { x: side * 0.2, y: 0.28 });
      }
      block(b, 0.12, 0.12, 0.9, body, { y: 0.7, z: -0.6, rx: -0.9 });
      break;
    case 'gator':
      b.box(0.8, 0.45, 1.6, body, 'flat', { y: 0.35 });
      wedge(b, 0.7, 0.3, 0.9, body, { y: 0.32, z: 1.15, ry: Math.PI });
      b.box(0.6, 0.12, 0.8, accent, 'flat', { y: 0.15, z: 1.15 });
      for (let i = 0; i < 4; i += 1) block(b, 0.1, 0.12, 0.08, detail, { x: (i % 2 ? 1 : -1) * 0.28, y: 0.25, z: 1 + i * 0.12 });
      for (const side of [-1, 1]) block(b, 0.16, 0.16, 0.16, 0xffd23a, { x: side * 0.22, y: 0.62, z: 0.75 });
      block(b, 0.3, 0.25, 1.2, body, { y: 0.3, z: -1.3 });
      legs(b, body, 0.25, 0.25, 0.42, 0.5);
      break;
    case 'tall':
      // The Flamingo: a stick leg, a curved neck, a black-tipped beak.
      b.box(0.8, 0.6, 1.1, body, 'flat', { y: 1.8 });
      block(b, 0.16, 1.4, 0.16, accent, { y: 2.6, z: 0.4, rx: 0.2 });
      b.box(0.36, 0.36, 0.5, body, 'flat', { y: 3.3, z: 0.6 });
      cone(b, 0.1, 0.4, detail, { y: 3.2, z: 0.95, rx: 1.8 }, 'smooth', 4);
      eyes(b, 0, 3.38, 0.86, 0.09, 0.08);
      block(b, 0.08, 1.6, 0.08, accent, { y: 0.8 });
      block(b, 0.08, 0.8, 0.08, accent, { x: 0.15, y: 1.3, z: -0.2, rx: 0.8 });
      break;
    case 'horse': {
      const pegasus = pet.name === 'Pegasus';
      b.box(0.8, 0.8, 1.6, body, 'flat', { y: 1.4 });
      b.box(0.5, 0.9, 0.5, body, 'flat', { y: 2, z: 0.9, rx: 0.4 });
      b.box(0.45, 0.4, 0.75, body, 'flat', { y: 2.35, z: 1.25 });
      eyes(b, 0, 2.45, 1.4, 0.18, 0.1);
      block(b, 0.16, 0.9, 0.5, accent, { y: 2.3, z: 0.7, rx: 0.4 });
      block(b, 0.2, 0.9, 0.2, accent, { y: 1.3, z: -0.95, rx: -0.4 });
      legs(b, body, 0.22, 1, 0.28, 0.6);
      if (pegasus) for (const side of [-1, 1]) {
        block(b, 1.2, 0.12, 0.7, 0xffffff, { x: side * 0.95, y: 1.95, z: 0.1, rz: side * 0.5 });
        block(b, 0.9, 0.1, 0.5, detail, { x: side * 1.55, y: 2.35, z: 0.1, rz: side * 0.7 });
      }
      break;
    }
  }
};

const cache = new Map<number, Partial<Record<PartKind, BufferGeometry>>>();

/** A pet's merged geometry, shared by every follower of that kind. */
export const petGeometry = (id: number): Partial<Record<PartKind, BufferGeometry>> | null => {
  const pet = petById(id);
  if (!pet) return null;
  let g = cache.get(id);
  if (!g) {
    const b = new PartBuilder();
    buildPet(b, pet);
    g = b.geometries();
    cache.set(id, g);
  }
  return g;
};

/** An egg, for the hatch screen and the pet stall. */
export const buildEgg = (b: PartBuilder, color: number, spots: number, s = 1): void => {
  ball(b, 0.8 * s, color, { y: 0.95 * s, sy: 1.25 }, 'flat', 1);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    block(b, 0.26 * s, 0.26 * s, 0.06, spots, { x: Math.cos(a) * 0.74 * s, y: (0.8 + (i % 2) * 0.4) * s, z: Math.sin(a) * 0.74 * s, ry: -a + Math.PI / 2 });
  }
};
