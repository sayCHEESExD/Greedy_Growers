import { mutationBit, type MutationKey } from './mutations.js';
import { hashInts, rng, weightedPick } from '../util/random.js';

/**
 * WEATHER. Each event lasts 4:30 (the original's figure) and gives every seed
 * and fruit a chance at its mutation: seeds spawned on the river during it,
 * saplings growing on the plots, fruit ripening in the gardens.
 *
 * The schedule is a function of the wall clock, so every room agrees and a
 * client can count it down without being told: an 8-minute cycle, clear for
 * 3:30, then one event, picked by weight from the cycle's number. A room may
 * be FORCED into an event (the Shop's weather products); the room's state
 * carries that override.
 */
export type WeatherKind = 'clear' | 'misty' | 'sandstorm' | 'blizzard' | 'acid' | 'rainbow' | 'meteor' | 'lucky';

export interface WeatherDef {
  readonly kind: WeatherKind;
  readonly name: string;
  /** The mutation it gives, and the chance per seed/fruit. */
  readonly mutation: MutationKey | null;
  readonly chance: number;
  /** Text for the weather card. */
  readonly blurb: string;
  /** Weight in the schedule. */
  readonly weight: number;
  /** Seconds it lasts. */
  readonly seconds: number;
  /** Rarer seeds on the river (Lucky River). */
  readonly riverLuck: number;
}

export const EVENT_SECONDS = 270;
export const CYCLE_SECONDS = 480;
const CLEAR_SECONDS = CYCLE_SECONDS - EVENT_SECONDS;

export const WEATHERS: Readonly<Record<WeatherKind, WeatherDef>> = {
  clear: { kind: 'clear', name: 'Clear Skies', mutation: null, chance: 0, blurb: 'A calm day on the farm. Lightning can still strike at any moment!', weight: 0, seconds: 0, riverLuck: 1 },
  misty: { kind: 'misty', name: 'Misty', mutation: 'dewy', chance: 0.5, blurb: 'Seeds and fruits have a 50% chance to become Dewy!', weight: 26, seconds: EVENT_SECONDS, riverLuck: 1 },
  sandstorm: { kind: 'sandstorm', name: 'Sandstorm', mutation: 'dusty', chance: 0.35, blurb: 'Seeds and fruits have a 35% chance to become Dusty!', weight: 22, seconds: EVENT_SECONDS, riverLuck: 1 },
  blizzard: { kind: 'blizzard', name: 'Blizzard', mutation: 'frosted', chance: 0.35, blurb: 'Seeds and fruits have a 35% chance to become Frosted!', weight: 20, seconds: EVENT_SECONDS, riverLuck: 1 },
  acid: { kind: 'acid', name: 'Acid Rain', mutation: 'radioactive', chance: 0.2, blurb: 'Seeds and fruits have a 20% chance to become Radioactive!', weight: 14, seconds: EVENT_SECONDS, riverLuck: 1 },
  lucky: { kind: 'lucky', name: 'Lucky River', mutation: null, chance: 0, blurb: 'Rarer seeds float down the river 3x as often!', weight: 10, seconds: 160, riverLuck: 3 },
  rainbow: { kind: 'rainbow', name: 'Rainbow', mutation: 'golden', chance: 0.075, blurb: 'Seeds and fruits have a 7.5% chance to become Golden!', weight: 6, seconds: EVENT_SECONDS, riverLuck: 1 },
  meteor: { kind: 'meteor', name: 'Meteor Shower', mutation: 'cosmic', chance: 0.025, blurb: 'Seeds and fruits have a 2.5% chance to become Cosmic!', weight: 2, seconds: EVENT_SECONDS, riverLuck: 1 },
};

export const WEATHER_ORDER: readonly WeatherKind[] = ['misty', 'sandstorm', 'blizzard', 'acid', 'lucky', 'rainbow', 'meteor'];

/** Stable numeric id for the replicated state. */
export const weatherIndex = (kind: WeatherKind): number => ['clear', ...WEATHER_ORDER].indexOf(kind);
export const weatherFromIndex = (index: number): WeatherKind => (['clear', ...WEATHER_ORDER][index] as WeatherKind | undefined) ?? 'clear';

export interface WeatherNow {
  readonly kind: WeatherKind;
  /** Wall clock (ms) the current spell started and ends. */
  readonly startedAt: number;
  readonly endsAt: number;
  /** The next event and when it starts. */
  readonly next: WeatherKind;
  readonly nextAt: number;
}

const eventOfCycle = (cycle: number): WeatherKind => {
  const random = rng(hashInts(cycle, 0x5eed));
  return weightedPick(random, WEATHER_ORDER.map((kind) => [kind, WEATHERS[kind].weight] as const));
};

/** The scheduled weather at a wall-clock time. */
export const scheduledWeather = (now: number): WeatherNow => {
  const cycleMs = CYCLE_SECONDS * 1000;
  const cycle = Math.floor(now / cycleMs);
  const cycleStart = cycle * cycleMs;
  const eventStart = cycleStart + CLEAR_SECONDS * 1000;
  const kind = eventOfCycle(cycle);
  const eventEnd = eventStart + WEATHERS[kind].seconds * 1000;
  if (now >= eventStart && now < eventEnd) {
    return { kind, startedAt: eventStart, endsAt: eventEnd, next: eventOfCycle(cycle + 1), nextAt: eventStart + cycleMs };
  }
  if (now < eventStart) return { kind: 'clear', startedAt: cycleStart, endsAt: eventStart, next: kind, nextAt: eventStart };
  const nextKind = eventOfCycle(cycle + 1);
  const nextAt = cycleStart + cycleMs + CLEAR_SECONDS * 1000;
  return { kind: 'clear', startedAt: eventEnd, endsAt: nextAt, next: nextKind, nextAt };
};

export const weatherMutationBit = (kind: WeatherKind): number => {
  const m = WEATHERS[kind].mutation;
  return m ? mutationBit(m) : 0;
};
