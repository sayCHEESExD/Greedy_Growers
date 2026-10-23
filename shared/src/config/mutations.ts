/**
 * MUTATIONS: a tree or fruit carries a set of them as BITS, and its value is
 * multiplied by every one it has (the guides leave stacking unspecified; the
 * game shows stacked mutations selling for more, so they multiply).
 *
 * Multipliers are the original's: Dewy x2, Shocked x2.5, Dusty x3, Frosted x3,
 * Infested x5 (after Update 5.0), Radioactive x5, Charged x7.5, Slimy x10,
 * Golden x25, Scaled x25, Cosmic x100. Huge (Pig) is undocumented: x4 here.
 */
export interface MutationDef {
  readonly bit: number;
  readonly key: string;
  readonly name: string;
  readonly multiplier: number;
  /** Text colour on labels and cards. */
  readonly color: string;
  /** How it is obtained, for the Index. */
  readonly source: string;
  /** Tickets for discovering it. */
  readonly indexTickets: number;
}

export const MUTATIONS: readonly MutationDef[] = [
  { bit: 1 << 0, key: 'dewy', name: 'Dewy', multiplier: 2, color: '#8fe3ff', source: 'Misty weather (50%)', indexTickets: 25 },
  { bit: 1 << 1, key: 'shocked', name: 'Shocked', multiplier: 2.5, color: '#fff35a', source: 'Harvest within 1.00x of a lightning strike (under 25x)', indexTickets: 50 },
  { bit: 1 << 2, key: 'dusty', name: 'Dusty', multiplier: 3, color: '#e0b46a', source: 'Sandstorm weather (35%)', indexTickets: 50 },
  { bit: 1 << 3, key: 'frosted', name: 'Frosted', multiplier: 3, color: '#cfefff', source: 'Blizzard weather (35%)', indexTickets: 50 },
  { bit: 1 << 4, key: 'infested', name: 'Infested', multiplier: 5, color: '#9aa33a', source: 'Roach pet', indexTickets: 75 },
  { bit: 1 << 5, key: 'radioactive', name: 'Radioactive', multiplier: 5, color: '#7dff4a', source: 'Acid Rain weather (20%)', indexTickets: 75 },
  { bit: 1 << 6, key: 'charged', name: 'Charged', multiplier: 7.5, color: '#5ad8ff', source: 'Harvest within 1.00x of a lightning strike (over 25x)', indexTickets: 100 },
  { bit: 1 << 7, key: 'slimy', name: 'Slimy', multiplier: 10, color: '#4aff9a', source: 'Frog pet', indexTickets: 100 },
  { bit: 1 << 8, key: 'golden', name: 'Golden', multiplier: 25, color: '#ffd23a', source: 'Rainbow weather (7.5%)', indexTickets: 150 },
  { bit: 1 << 9, key: 'scaled', name: 'Scaled', multiplier: 25, color: '#5aa85a', source: 'Alligator pet', indexTickets: 150 },
  { bit: 1 << 10, key: 'cosmic', name: 'Cosmic', multiplier: 100, color: '#c77dff', source: 'Meteor Shower weather (2.5%)', indexTickets: 250 },
  { bit: 1 << 11, key: 'huge', name: 'Huge', multiplier: 4, color: '#ff9a4a', source: 'Pig pet', indexTickets: 75 },
];

const BY_KEY = new Map(MUTATIONS.map((m) => [m.key, m]));

export type MutationKey =
  | 'dewy'
  | 'shocked'
  | 'dusty'
  | 'frosted'
  | 'infested'
  | 'radioactive'
  | 'charged'
  | 'slimy'
  | 'golden'
  | 'scaled'
  | 'cosmic'
  | 'huge';

export const mutationBit = (key: MutationKey): number => BY_KEY.get(key)!.bit;

export const ALL_MUTATION_BITS = MUTATIONS.reduce((bits, m) => bits | m.bit, 0);

/** The value multiplier of a set of mutation bits. */
export const mutationMultiplier = (bits: number): number => {
  let k = 1;
  for (const m of MUTATIONS) if (bits & m.bit) k *= m.multiplier;
  return k;
};

/** The mutations in a set of bits, in table order. */
export const mutationsOf = (bits: number): MutationDef[] => MUTATIONS.filter((m) => (bits & m.bit) !== 0);

/** "Dusty", "Dusty Golden". */
export const mutationLabel = (bits: number): string => mutationsOf(bits).map((m) => m.name).join(' ');
