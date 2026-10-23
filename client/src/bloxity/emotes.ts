import { Euler, MathUtils, Quaternion, type Bone, type Object3D } from 'three';
import { logger } from '../util/logger.js';
import { bloxityEnvironment } from './environment.js';

const SCOPE = 'bloxity/emotes';

/**
 * BOXITY EMOTES: the catalogue, and the player that puts a clip on a rig.
 *
 * Boxity draws the emote picker itself and tells the game which emote to play
 * (`play_emote`, a catalogue id). This file does the rest: it fetches
 * `{apiUrl}/v1/avatar/emotes` ONCE, and plays a clip on any body that carries
 * the standard Bloxity bone names - the player's Bloxity body (player.glb) and
 * the bundled one, which binds the same names.
 *
 * Nothing here owns ids. No emote is hardcoded, none is counted, ownership is
 * never checked (Boxity only sends what the player is entitled to), and an id
 * the catalogue does not know is ignored without a word.
 */

/** One key: [timeSeconds, xDegrees, yDegrees, zDegrees]. */
type EmoteKey = readonly [number, number, number, number];

export interface EmoteClip {
  readonly len: number;
  readonly loop: boolean;
  /** Bone name -> keys, in time order. */
  readonly tracks: Readonly<Record<string, readonly EmoteKey[]>>;
}

interface EmoteEntry {
  readonly id: string;
  readonly name: string;
  readonly clip: EmoteClip;
}

const clips = new Map<string, EmoteClip>();
let loading: Promise<void> | null = null;

const isKey = (value: unknown): value is EmoteKey =>
  Array.isArray(value) && value.length >= 4 && value.slice(0, 4).every((n) => typeof n === 'number' && Number.isFinite(n));

/** A clip off the wire, or null when it is not one this code can play. */
const readClip = (raw: unknown): EmoteClip | null => {
  const source = (raw ?? {}) as { len?: unknown; loop?: unknown; tracks?: unknown };
  const len = typeof source.len === 'number' && source.len > 0 ? source.len : 0;
  if (!len || !source.tracks || typeof source.tracks !== 'object') return null;
  const tracks: Record<string, EmoteKey[]> = {};
  for (const [bone, keys] of Object.entries(source.tracks as Record<string, unknown>)) {
    if (!Array.isArray(keys)) continue;
    const valid = keys.filter(isKey).slice().sort((a, b) => a[0] - b[0]);
    if (valid.length) tracks[bone] = valid;
  }
  return { len, loop: source.loop === true, tracks };
};

/**
 * Fetch the catalogue, once per page. Safe to call any number of times; never
 * throws. A failed fetch is logged and retried on the next call, so a player
 * who emotes after a blip still gets their wave.
 */
export const loadEmoteCatalogue = (): Promise<void> => {
  if (loading) return loading;
  loading = fetch(`${bloxityEnvironment().apiUrl}/v1/avatar/emotes`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as unknown;
      const list = (Array.isArray(body) ? body : ((body as { emotes?: unknown })?.emotes ?? [])) as unknown[];
      for (const raw of list) {
        const entry = raw as Partial<EmoteEntry>;
        const clip = readClip(entry?.clip);
        if (typeof entry?.id === 'string' && clip) clips.set(entry.id, clip);
      }
      logger.info(SCOPE, `catalogue: ${clips.size} emotes`);
    })
    .catch((error: unknown) => {
      logger.warn(SCOPE, `catalogue unavailable: ${String(error)}`);
      loading = null;
    });
  return loading;
};

/** The clip for an id, or null (unknown, or the catalogue has not arrived). */
export const emoteClip = (id: string): EmoteClip | null => (id ? (clips.get(id) ?? null) : null);

/** A real emote id as it may cross the wire: short, plain characters. */
export const isEmoteId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id);

/** Seconds a clip blends in (and out, when walking ends it). */
const BLEND_SECONDS = 0.1;

const smoothstep = (s: number): number => s * s * (3 - 2 * s);

const scratchEuler = new Euler(0, 0, 0, 'XYZ');
const scratchDelta = new Quaternion();
const scratchTarget = new Quaternion();

/**
 * The clip's value for one track at `time`: smoothstep between keys, clamped
 * outside the key range. Writes degrees into `out`.
 */
const sample = (keys: readonly EmoteKey[], time: number, out: [number, number, number]): void => {
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (time <= first[0] || keys.length === 1) {
    out[0] = first[1];
    out[1] = first[2];
    out[2] = first[3];
    return;
  }
  if (time >= last[0]) {
    out[0] = last[1];
    out[1] = last[2];
    out[2] = last[3];
    return;
  }
  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i]!;
    if (time > b[0]) continue;
    const a = keys[i - 1]!;
    const span = b[0] - a[0];
    const s = smoothstep(span > 0 ? (time - a[0]) / span : 1);
    out[0] = a[1] + (b[1] - a[1]) * s;
    out[1] = a[2] + (b[2] - a[2]) * s;
    out[2] = a[3] + (b[3] - a[3]) * s;
    return;
  }
};

/**
 * PLAYS A CLIP ON ONE BODY, on top of whatever pose the animator already
 * wrote this frame: each track is a DEGREE DELTA over the bone's BIND pose,
 * euler XYZ, right-multiplied onto the bind quaternion - then blended with the
 * animated pose by the clip's weight. Bones the body does not have are ignored.
 */
export class EmotePlayer {
  private readonly bones = new Map<string, { bone: Bone; bind: Quaternion }>();
  private clip: EmoteClip | null = null;
  private time = 0;
  private weight = 0;
  private readonly value: [number, number, number] = [0, 0, 0];

  /** Bind to a body. Called with each body the character wears, before it animates. */
  bind(model: Object3D): void {
    this.bones.clear();
    model.traverse((child) => {
      const bone = child as Bone;
      if (bone.isBone && !this.bones.has(bone.name)) this.bones.set(bone.name, { bone, bind: bone.quaternion.clone() });
    });
  }

  /**
   * Run one frame. `id` is the emote the character is playing ('' for none),
   * `time` the seconds since it began. Returns false once a one-shot clip has
   * finished, so the owner can clear it. Never throws.
   */
  apply(dt: number, id: string, time: number): boolean {
    try {
      const clip = emoteClip(id);
      const playing = clip !== null && time >= 0 && (clip.loop || time <= clip.len);
      if (playing) {
        if (clip !== this.clip) this.weight = 0;
        this.clip = clip;
        this.time = clip.loop ? time % clip.len : time;
      }
      this.weight = MathUtils.clamp(this.weight + (playing ? dt : -dt) / BLEND_SECONDS, 0, 1);
      const active = this.clip;
      if (!active || this.weight <= 0) {
        if (!playing) this.clip = null;
        return playing || clip === null;
      }
      for (const [name, keys] of Object.entries(active.tracks)) {
        const binding = this.bones.get(name);
        if (!binding) continue;
        sample(keys, this.time, this.value);
        scratchEuler.set(
          MathUtils.degToRad(this.value[0]),
          MathUtils.degToRad(this.value[1]),
          MathUtils.degToRad(this.value[2]),
          'XYZ',
        );
        scratchDelta.setFromEuler(scratchEuler);
        scratchTarget.copy(binding.bind).multiply(scratchDelta);
        binding.bone.quaternion.slerp(scratchTarget, this.weight);
      }
      return playing || clip === null;
    } catch (error) {
      logger.warn(SCOPE, `emote frame skipped: ${String(error)}`);
      this.clip = null;
      this.weight = 0;
      return false;
    }
  }
}
