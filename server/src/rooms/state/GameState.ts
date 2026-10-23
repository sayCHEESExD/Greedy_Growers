import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { LEADERBOARD_SIZE, PLOT_COUNT } from '@greedy/shared';
import { PlayerState } from './PlayerState.js';
import { PlotState } from './PlotState.js';
import { RiverSeedState } from './RiverSeedState.js';

/** One row of one board. */
export class LeaderEntry extends Schema {
  /** The row's KEY, derived from the account id. NEVER DRAWN. */
  @type('string') handle = '';
  /** THE NAME THE BOARD SHOWS: the portal's display name, or empty. */
  @type('string') name = '';
  @type('string') avatarUrl = '';
  @type('float64') value = 0;
}

/** The boards: Cash, Total Earned, Rebirths, Biggest Tree. Fixed-length, written in place. */
export class LeaderboardState extends Schema {
  @type([LeaderEntry]) cash = rows();
  @type([LeaderEntry]) earned = rows();
  @type([LeaderEntry]) rebirths = rows();
  @type([LeaderEntry]) best = rows();
}

const rows = (): ArraySchema<LeaderEntry> => {
  const list = new ArraySchema<LeaderEntry>();
  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) list.push(new LeaderEntry());
  return list;
};

const plots = (): ArraySchema<PlotState> => {
  const list = new ArraySchema<PlotState>();
  for (let i = 0; i < PLOT_COUNT; i += 1) {
    const plot = new PlotState();
    plot.slot = i;
    list.push(plot);
  }
  return list;
};

/** Root replicated state for one room. */
export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([PlotState]) plots = plots();
  @type({ map: RiverSeedState }) river = new MapSchema<RiverSeedState>();
  /** The server's wall clock (ms), so every client times growth, the river and the weather on one clock. */
  @type('float64') now = 0;
  @type('float64') elapsed = 0;
  /** The weather now (index into the weather table), when it started and ends, and what comes next. */
  @type('uint8') weather = 0;
  @type('float64') weatherStart = 0;
  @type('float64') weatherEnds = 0;
  @type('uint8') weatherNext = 0;
  @type('float64') weatherNextAt = 0;
  /** When the next guaranteed Legendary and Mythic seeds come down the river. */
  @type('float64') legendaryAt = 0;
  @type('float64') mythicAt = 0;
  @type(LeaderboardState) leaderboard = new LeaderboardState();
}
