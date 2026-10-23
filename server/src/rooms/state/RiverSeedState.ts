import { Schema, type } from '@colyseus/schema';

/** A seed floating down the river. Its position is a function of `spawnAt`. */
export class RiverSeedState extends Schema {
  @type('uint32') id = 0;
  @type('uint8') seed = 0;
  @type('uint16') mut = 0;
  @type('float64') spawnAt = 0;
  @type('float32') lane = 0;
}
