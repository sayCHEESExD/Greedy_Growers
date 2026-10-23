import type { WeatherKind } from './weather.js';

/**
 * THE SHOP'S BUX PRODUCTS - this game's stand-in for the original's Robux shop
 * (the reference video shows the Majestic Egg at 1 / 3 / 10 eggs and Lucky
 * River; the guides add buying weather events).
 *
 * NO PRICES: Bloxity charges from its own catalogue, keyed by the SKU. This
 * table is only what the game hands over once the webhook says it was paid.
 */
export type BuxGrant =
  | { kind: 'egg'; id: number; count: number }
  | { kind: 'weather'; weather: WeatherKind }
  | { kind: 'tickets'; count: number };

export interface BuxProduct {
  readonly sku: string;
  readonly name: string;
  readonly blurb: string;
  readonly section: 'eggs' | 'weather' | 'tickets';
  readonly grant: BuxGrant;
}

export const BUX_PRODUCTS: readonly BuxProduct[] = [
  { sku: 'majestic_egg_1', name: '1 Majestic Egg', blurb: 'Flamingo 45% / Hedgehog 35% / Elephant 15% / Horse 4.5% / Pegasus 0.5%', section: 'eggs', grant: { kind: 'egg', id: 6, count: 1 } },
  { sku: 'majestic_egg_3', name: '3 Majestic Eggs', blurb: 'Three Majestic Eggs.', section: 'eggs', grant: { kind: 'egg', id: 6, count: 3 } },
  { sku: 'majestic_egg_10', name: '10 Majestic Eggs', blurb: 'Ten Majestic Eggs - the best deal.', section: 'eggs', grant: { kind: 'egg', id: 6, count: 10 } },
  { sku: 'lucky_river', name: 'Lucky River', blurb: 'Rarer seeds float down the river 3x as often for everyone. Lasts 2:40.', section: 'weather', grant: { kind: 'weather', weather: 'lucky' } },
  { sku: 'weather_rainbow', name: 'Rainbow', blurb: 'Start a Rainbow for the whole server: 7.5% Golden (x25).', section: 'weather', grant: { kind: 'weather', weather: 'rainbow' } },
  { sku: 'weather_meteor', name: 'Meteor Shower', blurb: 'Start a Meteor Shower for the whole server: 2.5% Cosmic (x100).', section: 'weather', grant: { kind: 'weather', weather: 'meteor' } },
  { sku: 'tickets_small', name: 'Bag of Tickets', blurb: '500 Tickets for eggs, gear and spins.', section: 'tickets', grant: { kind: 'tickets', count: 500 } },
  { sku: 'tickets_large', name: 'Chest of Tickets', blurb: '2,500 Tickets.', section: 'tickets', grant: { kind: 'tickets', count: 2500 } },
];

export const buxProduct = (sku: string): BuxProduct | undefined => BUX_PRODUCTS.find((p) => p.sku === sku);
