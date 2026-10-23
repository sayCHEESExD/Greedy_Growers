import { MapSchema, Schema, type } from '@colyseus/schema';

/**
 * A SAPLING growing on a plot's soil, in the plot's LOCAL frame. Growth is a
 * timestamp and a rate: every client computes the multiplier itself. The
 * crash point is NOT here - it lives on the server only - so nobody can read
 * when the lightning will come.
 */
export class SaplingState extends Schema {
  @type('uint32') id = 0;
  @type('uint8') seed = 0;
  @type('uint16') mut = 0;
  @type('float32') x = 0;
  @type('float32') z = 0;
  @type('float64') plantedAt = 0;
  /** Multiplier per second. */
  @type('float32') rate = 0;
  /** Multiplier added on top (Miracle Grow). */
  @type('float32') boost = 0;
  @type('uint8') fert = 0;
  @type('boolean') dead = false;
  /** The multiplier at the strike. */
  @type('float32') deadMult = 0;
  @type('float64') deadAt = 0;
  /** A Prediction Potion reading: the tree will safely reach this (0 = none). */
  @type('float32') predicted = 0;
}

/** A harvested tree replanted in the garden row, bearing fruit. */
export class GardenTreeState extends Schema {
  @type('uint8') spot = 0;
  @type('uint8') seed = 0;
  @type('uint16') mut = 0;
  @type('float32') mult = 1;
  /** Fruits hanging (0-3), each with its own mutation bits. */
  @type('uint8') fruits = 0;
  @type('uint16') f0 = 0;
  @type('uint16') f1 = 0;
  @type('uint16') f2 = 0;
  @type('float64') nextAt = 0;
}

export class FurnitureState extends Schema {
  @type('uint32') id = 0;
  @type('uint8') kind = 0;
  @type('float32') x = 0;
  @type('float32') z = 0;
  @type('uint8') rot = 0;
}

/** One fruit offered on a plot's Market Stand. */
export class StandSlotState extends Schema {
  @type('uint8') seed = 0;
  @type('uint16') mut = 0;
  @type('float32') mult = 1;
  @type('float64') price = 0;
}

/**
 * ONE OF THE FIFTEEN PLOTS. Empty until a player is given it; then its soil,
 * garden, furniture and stand are everyone's to see.
 */
export class PlotState extends Schema {
  @type('uint8') slot = 0;
  @type('string') owner = '';
  @type('string') ownerName = '';
  @type('string') ownerAvatar = '';
  @type('uint32') likes = 0;
  /** Saplings that may grow at once, and garden spots open. */
  @type('uint8') capacity = 1;
  @type('uint8') gardenSpots = 3;
  @type('uint8') rebirths = 0;
  /** Market Stands unlocked (Rebirth 4). */
  @type('boolean') hasStand = false;
  @type({ map: SaplingState }) saplings = new MapSchema<SaplingState>();
  @type({ map: GardenTreeState }) garden = new MapSchema<GardenTreeState>();
  @type({ map: FurnitureState }) furniture = new MapSchema<FurnitureState>();
  @type({ map: StandSlotState }) stand = new MapSchema<StandSlotState>();
}
