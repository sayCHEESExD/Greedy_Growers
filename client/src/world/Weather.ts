import { type WeatherKind } from '@greedy/shared';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Fog,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  TorusGeometry,
  type Texture,
} from 'three';
import { isMobileGpu } from '../config/device.js';
import type { SceneManager } from '../rendering/SceneManager.js';
import type { Sky } from './Sky.js';

interface Look {
  top: number;
  mid: number;
  bottom: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  cloud: number;
  sun: number;
  sunColor: number;
  hemi: number;
  ambient: number;
  stars: number;
}

/**
 * Roblox daylight, bright and clear, and each event's own air: the
 * reference's sandstorm turns everything a hazy orange; mist whitens the
 * distance; a blizzard is cold and white; acid rain greens the sky; a meteor
 * shower brings the night out.
 */
const LOOKS: Readonly<Record<WeatherKind, Look>> = {
  clear: { top: 0x3f9ff0, mid: 0x9fd4fa, bottom: 0xd8eefc, fog: 0xcfe8fb, fogNear: 260, fogFar: 900, cloud: 0xffffff, sun: 2.5, sunColor: 0xfff4e0, hemi: 1.35, ambient: 0.62, stars: 0 },
  misty: { top: 0x8ab4d8, mid: 0xc8dcea, bottom: 0xe4eef4, fog: 0xd8e6ee, fogNear: 30, fogFar: 230, cloud: 0xf2f6f8, sun: 1.6, sunColor: 0xeef4ff, hemi: 1.3, ambient: 0.7, stars: 0 },
  sandstorm: { top: 0xd89a4a, mid: 0xe8b46a, bottom: 0xf0c27a, fog: 0xe0a85a, fogNear: 20, fogFar: 200, cloud: 0xf0c890, sun: 1.8, sunColor: 0xffd49a, hemi: 1.25, ambient: 0.66, stars: 0 },
  blizzard: { top: 0x9ab4cc, mid: 0xd4e2ee, bottom: 0xf0f4f8, fog: 0xe4ecf4, fogNear: 30, fogFar: 260, cloud: 0xf6f8fa, sun: 1.6, sunColor: 0xeef4ff, hemi: 1.35, ambient: 0.7, stars: 0 },
  acid: { top: 0x5a7a3a, mid: 0x9ab86a, bottom: 0xc4d89a, fog: 0xa8c47a, fogNear: 60, fogFar: 360, cloud: 0xb8d08a, sun: 1.3, sunColor: 0xe0ffb0, hemi: 1.15, ambient: 0.62, stars: 0 },
  rainbow: { top: 0x48a8f8, mid: 0xb4e0ff, bottom: 0xe8f6ff, fog: 0xd6eefc, fogNear: 300, fogFar: 1000, cloud: 0xffffff, sun: 2.7, sunColor: 0xfff8e8, hemi: 1.45, ambient: 0.66, stars: 0 },
  meteor: { top: 0x120a34, mid: 0x3a2a6a, bottom: 0x4a3a7a, fog: 0x2e2654, fogNear: 160, fogFar: 700, cloud: 0x5a4a7a, sun: 0.7, sunColor: 0xd8b8ff, hemi: 0.85, ambient: 0.55, stars: 1 },
  lucky: { top: 0x3fa0f0, mid: 0xa8dcfa, bottom: 0xfff2c8, fog: 0xf4ecd0, fogNear: 260, fogFar: 900, cloud: 0xfff8e0, sun: 2.7, sunColor: 0xffecb0, hemi: 1.4, ambient: 0.66, stars: 0 },
};

const BOX = 90;
const HEIGHT = 46;

let flakeTexture: Texture | null = null;
const flake = (): Texture => {
  if (flakeTexture) return flakeTexture;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  flakeTexture = new CanvasTexture(canvas);
  return flakeTexture;
};

/**
 * THE WEATHER YOU CAN SEE: the room's current event retints the sky, the fog
 * and the lights, and fills the air round the camera with dust, snow, rain,
 * mist or sparkles; a rainbow arcs over the map; meteors fall. Changes ease
 * in over a few seconds. A lightning strike flashes the whole sky.
 */
export class Weather {
  private kind: WeatherKind = 'clear';
  private readonly current: Look = { ...LOOKS.clear };
  private readonly motes: Points;
  private readonly rain: LineSegments;
  private readonly motePositions: Float32Array;
  private readonly rainPositions: Float32Array;
  private readonly moteCount: number;
  private readonly rainCount: number;
  private readonly rainbow: Group;
  private readonly meteors: Mesh[] = [];
  private flash = 0;
  private readonly scratch = { a: new Color(), b: new Color(), c: new Color(), d: new Color(), e: new Color() };

  constructor(
    private readonly scene: SceneManager,
    private readonly sky: Sky,
  ) {
    const mobile = isMobileGpu();
    this.moteCount = mobile ? 500 : 1100;
    this.rainCount = mobile ? 500 : 1100;
    this.motePositions = new Float32Array(this.moteCount * 3);
    for (let i = 0; i < this.moteCount; i += 1) {
      this.motePositions[i * 3] = (Math.random() - 0.5) * BOX;
      this.motePositions[i * 3 + 1] = Math.random() * HEIGHT;
      this.motePositions[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const moteGeometry = new BufferGeometry();
    moteGeometry.setAttribute('position', new BufferAttribute(this.motePositions, 3));
    this.motes = new Points(moteGeometry, new PointsMaterial({ map: flake(), size: 0.8, transparent: true, depthWrite: false, color: 0xffffff, fog: false }));
    this.motes.frustumCulled = false;
    this.motes.visible = false;

    this.rainPositions = new Float32Array(this.rainCount * 6);
    for (let i = 0; i < this.rainCount; i += 1) {
      const x = (Math.random() - 0.5) * BOX;
      const y = Math.random() * HEIGHT;
      const z = (Math.random() - 0.5) * BOX;
      this.rainPositions.set([x, y, z, x + 0.1, y + 1.4, z], i * 6);
    }
    const rainGeometry = new BufferGeometry();
    rainGeometry.setAttribute('position', new BufferAttribute(this.rainPositions, 3));
    this.rain = new LineSegments(rainGeometry, new LineBasicMaterial({ color: 0x9aff5a, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;

    // The rainbow: seven bands arcing over the market.
    this.rainbow = new Group();
    const bands = [0xff3a3a, 0xff9a2a, 0xffe23a, 0x4ae05a, 0x3a9aff, 0x4a4ad8, 0xb04ae8];
    bands.forEach((color, i) => {
      const band = new Mesh(new TorusGeometry(200 - i * 5, 2.6, 4, 48, Math.PI), new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, fog: false, side: DoubleSide, depthWrite: false }));
      this.rainbow.add(band);
    });
    this.rainbow.position.set(0, -20, 240);
    this.rainbow.visible = false;

    for (let i = 0; i < 6; i += 1) {
      const meteor = new Mesh(new TorusGeometry(1, 0.6, 4, 6), new MeshBasicMaterial({ color: 0xffb8f4, fog: false }));
      meteor.visible = false;
      this.meteors.push(meteor);
    }
    scene.scene.add(this.motes, this.rain, this.rainbow, ...this.meteors);
  }

  get currentKind(): WeatherKind {
    return this.kind;
  }

  /** A lightning flash (a strike landed). */
  strike(strength = 1): void {
    this.flash = Math.max(this.flash, strength);
  }

  update(delta: number, kind: WeatherKind, time: number, cx: number, cz: number): void {
    this.kind = kind;
    const target = LOOKS[kind];
    const t = 1 - Math.exp(-delta * 0.8);
    const c = this.current;
    const s = this.scratch;
    const blend = (from: number, to: number, out: Color): number => out.setHex(from).lerp(s.e.setHex(to), t).getHex();
    c.top = blend(c.top, target.top, s.a);
    c.mid = blend(c.mid, target.mid, s.a);
    c.bottom = blend(c.bottom, target.bottom, s.a);
    c.fog = blend(c.fog, target.fog, s.a);
    c.cloud = blend(c.cloud, target.cloud, s.a);
    c.sunColor = blend(c.sunColor, target.sunColor, s.a);
    c.sun += (target.sun - c.sun) * t;
    c.hemi += (target.hemi - c.hemi) * t;
    c.ambient += (target.ambient - c.ambient) * t;
    c.stars += (target.stars - c.stars) * t;
    c.fogNear += (target.fogNear - c.fogNear) * t;
    c.fogFar += (target.fogFar - c.fogFar) * t;

    this.flash = Math.max(0, this.flash - delta * 3.2);
    const lift = this.flash;
    this.sky.setColors(s.a.setHex(c.top).lerp(s.e.setHex(0xe8f0ff), lift * 0.7), s.b.setHex(c.mid).lerp(s.e.setHex(0xffffff), lift * 0.6), s.c.setHex(c.bottom), s.d.setHex(c.cloud), c.stars);
    const fog = this.scene.scene.fog as Fog;
    fog.color.setHex(c.fog);
    fog.near = c.fogNear;
    fog.far = c.fogFar;
    this.scene.setBackground(c.fog);
    this.scene.sun.intensity = c.sun + lift * 3;
    this.scene.sun.color.setHex(c.sunColor);
    this.scene.hemi.intensity = c.hemi + lift * 1.2;
    this.scene.ambient.intensity = c.ambient + lift * 0.4;

    // The air.
    const motes = kind === 'sandstorm' || kind === 'blizzard' || kind === 'misty' || kind === 'meteor' || kind === 'lucky';
    this.motes.visible = motes;
    this.rain.visible = kind === 'acid';
    this.rainbow.visible = kind === 'rainbow';
    const material = this.motes.material as PointsMaterial;
    if (motes) {
      const look = {
        sandstorm: { color: 0xf0c27a, size: 0.7, fall: 0.6, wind: 26 },
        blizzard: { color: 0xffffff, size: 0.7, fall: 5, wind: 8 },
        misty: { color: 0xffffff, size: 2.4, fall: 0.2, wind: 1.5 },
        meteor: { color: 0xffb8f0, size: 0.35, fall: 0.3, wind: 0 },
        lucky: { color: 0xffe066, size: 0.45, fall: -0.6, wind: 0 },
      }[kind as 'sandstorm' | 'blizzard' | 'misty' | 'meteor' | 'lucky'];
      material.color.setHex(look.color);
      material.size = look.size;
      material.opacity = kind === 'misty' ? 0.35 : 0.9;
      const p = this.motePositions;
      for (let i = 0; i < this.moteCount; i += 1) {
        const k = i * 3;
        p[k + 1]! -= look.fall * delta * (0.7 + (i % 5) * 0.12);
        p[k]! += (look.wind + Math.sin(time + i) * 2) * delta;
        if (p[k + 1]! < 0) p[k + 1] = HEIGHT;
        if (p[k + 1]! > HEIGHT) p[k + 1] = 0;
      }
      (this.motes.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      this.motes.position.set(Math.round(cx / BOX) * BOX, 0, Math.round(cz / BOX) * BOX);
      this.wrap(this.motePositions, 3, cx - this.motes.position.x, cz - this.motes.position.z);
    }
    if (this.rain.visible) {
      const p = this.rainPositions;
      const fall = 60 * delta;
      for (let i = 0; i < this.rainCount; i += 1) {
        const k = i * 6;
        p[k + 1]! -= fall;
        p[k + 4]! -= fall;
        if (p[k + 1]! < 0) {
          p[k + 1] = HEIGHT;
          p[k + 4] = HEIGHT + 1.4;
        }
      }
      (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      this.rain.position.set(Math.round(cx / BOX) * BOX, 0, Math.round(cz / BOX) * BOX);
      this.wrap(this.rainPositions, 6, cx - this.rain.position.x, cz - this.rain.position.z, 2);
    }
    // Meteors streak down across the sky.
    this.meteors.forEach((meteor, i) => {
      meteor.visible = kind === 'meteor';
      if (!meteor.visible) return;
      const phase = ((time * 0.25 + i * 0.37) % 1);
      const sx = cx - 120 + i * 50;
      meteor.position.set(sx + phase * 90, 140 - phase * 130, cz + 60 - i * 30);
      meteor.scale.setScalar(1.4 + (i % 3) * 0.5);
    });
  }

  /** Keep every particle within half a box of the viewer (in the cloud's frame). */
  private wrap(positions: Float32Array, stride: number, ox: number, oz: number, pairs = 1): void {
    const half = BOX / 2;
    for (let i = 0; i < positions.length; i += stride) {
      for (const axis of [0, 2]) {
        const centre = axis === 0 ? ox : oz;
        let v = positions[i + axis]!;
        let shift = 0;
        if (v < centre - half) shift = BOX;
        else if (v > centre + half) shift = -BOX;
        if (shift === 0) continue;
        v += shift;
        positions[i + axis] = v;
        if (pairs === 2) positions[i + 3 + axis]! += shift;
      }
    }
  }

  dispose(): void {
    this.motes.geometry.dispose();
    this.rain.geometry.dispose();
  }
}
