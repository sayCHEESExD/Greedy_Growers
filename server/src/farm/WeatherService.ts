import { WEATHERS, scheduledWeather, weatherIndex, type WeatherKind } from '@greedy/shared';
import type { RoomContext } from './RoomContext.js';

const HEADLINES: Readonly<Record<WeatherKind, string>> = {
  clear: 'The skies have cleared.',
  misty: 'A thick mist has rolled in!',
  sandstorm: 'A sandstorm has begun!',
  blizzard: 'A blizzard has begun!',
  acid: 'Acid rain is falling!',
  rainbow: 'A rainbow has appeared!',
  meteor: 'A meteor shower has begun!',
  lucky: 'The river is feeling lucky!',
};

/**
 * THE WEATHER: the clock's schedule, unless the room has been FORCED into an
 * event (the Shop's weather products), written into the room state for every
 * client to draw and count down.
 */
export class WeatherService {
  private forced: { kind: WeatherKind; startedAt: number; endsAt: number } | null = null;
  private current: WeatherKind | null = null;

  constructor(private readonly ctx: RoomContext) {}

  /** Start an event for the whole room now (a purchase). */
  force(kind: WeatherKind, by: string): void {
    const now = this.ctx.now();
    this.forced = { kind, startedAt: now, endsAt: now + WEATHERS[kind].seconds * 1000 };
    this.ctx.announce('gold', `${by || 'Someone'} started ${WEATHERS[kind].name} for the whole server!`);
    this.tick();
  }

  tick(): void {
    const now = this.ctx.now();
    const state = this.ctx.state;
    if (this.forced && now >= this.forced.endsAt) this.forced = null;
    const scheduled = scheduledWeather(now);
    const kind = this.forced?.kind ?? scheduled.kind;
    const startedAt = this.forced?.startedAt ?? scheduled.startedAt;
    const endsAt = this.forced?.endsAt ?? scheduled.endsAt;
    const index = weatherIndex(kind);
    if (state.weather !== index) state.weather = index;
    if (state.weatherStart !== startedAt) state.weatherStart = startedAt;
    if (state.weatherEnds !== endsAt) state.weatherEnds = endsAt;
    const next = weatherIndex(scheduled.next);
    if (state.weatherNext !== next) state.weatherNext = next;
    if (state.weatherNextAt !== scheduled.nextAt) state.weatherNextAt = scheduled.nextAt;
    if (this.current !== kind) {
      if (this.current !== null) this.ctx.announce(kind === 'clear' ? 'info' : 'gold', HEADLINES[kind]);
      this.current = kind;
    }
  }
}
