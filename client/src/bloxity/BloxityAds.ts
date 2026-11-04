import { logger } from '../util/logger.js';
import type {
  LegionAdPosition,
  LegionAdScreen,
  LegionAdScreenOptions,
  LegionAdSize,
  LegionReservedArea,
  LegionRewardedResult,
  LegionSdk,
} from './legionTypes.js';

const SCOPE = 'bloxity/ads';

type Ads = NonNullable<LegionSdk['ads']>;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Clear space kept between a banner and the panel (or Boxity's own UI). */
const GAP = 8;

/**
 * The sizes each position may take, best first. Wide strips go top and
 * bottom, skyscrapers on the sides, boxes in the corners - the shapes the
 * positions are for.
 */
const SIZES: Readonly<Record<LegionAdPosition, readonly LegionAdSize[]>> = {
  'top-left': ['300x250', '320x100', '320x50'],
  'top-center': ['728x90', '320x100', '320x50'],
  'top-right': ['300x250', '320x100', '320x50'],
  'middle-left': ['300x600', '160x600', '300x250'],
  'middle-right': ['300x600', '160x600', '300x250'],
  'bottom-left': ['300x250', '320x100', '320x50'],
  'bottom-center': ['728x90', '320x100', '320x50'],
  'bottom-right': ['300x250', '320x100', '320x50'],
};
const POSITIONS = Object.keys(SIZES) as LegionAdPosition[];

const dims = (size: LegionAdSize): [number, number] => {
  const [w, h] = size.split('x').map(Number);
  return [w ?? 0, h ?? 0];
};

/** Where a banner of this size would sit at this position, against the game's edges. */
const place = (position: LegionAdPosition, size: LegionAdSize, width: number, height: number): Rect => {
  const [w, h] = dims(size);
  const [row, col] = position.split('-') as [string, string];
  const x = col === 'left' ? 0 : col === 'right' ? width - w : (width - w) / 2;
  const y = row === 'top' ? 0 : row === 'bottom' ? height - h : (height - h) / 2;
  return { x, y, w, h };
};

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

/**
 * THE BANNER LAYOUT FOR A PANEL: for every position, the biggest size that
 * fits in the space the panel leaves on that edge - never over the panel,
 * never over Boxity's own toolbar and chat, never over another banner. A
 * position with no room is skipped. On a phone, where a panel fills most of
 * the screen, that is most of them: an ad that would cover the shop is worse
 * than no ad.
 */
export const panelAdLayout = (panel: Rect, reserved: readonly Rect[], width: number, height: number): LegionAdScreenOptions => {
  const blocked: Rect[] = [grow(panel, GAP), ...reserved.map((r) => grow(r, GAP))];
  const skip: LegionAdPosition[] = [];
  const sizes: Partial<Record<LegionAdPosition, LegionAdSize>> = {};
  for (const position of POSITIONS) {
    const fit = SIZES[position].find((size) => {
      const r = place(position, size, width, height);
      return r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height && !blocked.some((b) => overlaps(r, b));
    });
    if (!fit) {
      skip.push(position);
      continue;
    }
    sizes[position] = fit;
    blocked.push(grow(place(position, fit, width, height), GAP));
  }
  return { skip, sizes };
};

/**
 * THIS GAME'S BOXITY ADS. Boxity runs every ad itself, over the game; this
 * only asks for them, listens, and keeps the screen-ad layout honest:
 *
 *  - ad breaks pause and mute the game (`onBreak`);
 *  - a rewarded ad is asked for by placement, and while one is pending no
 *    screen layout is sent at all - the current one is re-sent after it;
 *  - a full-screen panel (shop, inventory, rebirth, index, pets, boards, a
 *    stall) is a 'panel' screen, its banners laid out round the panel so none
 *    covers it, re-sent ONLY when the layout actually changes (a resize, a
 *    panel opening, closing or changing size) - never every frame.
 *
 * Outside Boxity `isAvailable()` is false and none of this shows anything.
 */
export class BloxityAds {
  private screen: LegionAdScreen | null = null;
  private sentKey = '';
  private panel: HTMLElement | null = null;
  private reserved: readonly LegionReservedArea[] = [];
  private rewardedPending = false;
  private readonly observer: ResizeObserver;
  private resizeTimer = 0;

  constructor(private readonly api: () => Ads | null) {
    this.observer = new ResizeObserver(() => this.sync());
    window.addEventListener('resize', () => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.sync(), 150);
    });
  }

  /** Can a rewarded ad be shown right now? (Show a "Watch ad" button only while this is true.) */
  available(): boolean {
    try {
      return this.api()?.isAvailable() ?? false;
    } catch {
      return false;
    }
  }

  /** Pause and mute for the length of every ad break Boxity starts. */
  onBreak(start: () => void, end: () => void): void {
    const ads = this.api();
    if (!ads) return;
    try {
      ads.onBreakStart(() => start());
      ads.onBreakEnd(() => end());
    } catch (error) {
      logger.warn(SCOPE, `ad break hooks failed: ${String(error)}`);
    }
  }

  /**
   * Ask for a rewarded ad. Resolves with Boxity's result; only 'completed'
   * (with its reward token, for the SERVER to verify) is worth anything.
   */
  async showRewarded(placement: string): Promise<LegionRewardedResult> {
    const ads = this.api();
    if (!ads) return { status: 'disabled' };
    this.rewardedPending = true;
    try {
      const result = await ads.showRewarded(placement);
      logger.info(SCOPE, `rewarded '${placement}': ${JSON.stringify(result)}`);
      return result ?? { status: 'error' };
    } catch (error) {
      logger.warn(SCOPE, `rewarded '${placement}' failed: ${String(error)}`);
      return { status: 'error' };
    } finally {
      this.rewardedPending = false;
      // Whatever screen was current is sent again, now that it may be.
      this.sentKey = '';
      this.sync();
    }
  }

  /** The panel now covering the game (or null when none is). */
  setPanel(panel: HTMLElement | null): void {
    if (panel === this.panel) return;
    if (this.panel) this.observer.unobserve(this.panel);
    this.panel = panel;
    if (panel) this.observer.observe(panel);
    this.sync();
  }

  /** Boxity's own UI (toolbar, chat feed): banners keep off it too. */
  setReserved(areas: readonly LegionReservedArea[]): void {
    this.reserved = areas;
    this.sync();
  }

  /** Send the screen layout - only if it changed, and never while a rewarded ad is pending. */
  private sync(): void {
    if (this.rewardedPending) return;
    const ads = this.api();
    if (!ads) return;
    const panel = this.panel?.isConnected ? this.panel.getBoundingClientRect() : null;
    if (!panel || panel.width < 1 || panel.height < 1) {
      if (this.sentKey !== 'none') this.hide(ads);
      return;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    const options = panelAdLayout(
      { x: panel.left, y: panel.top, w: panel.width, h: panel.height },
      this.reserved.map((a) => ({ x: a.left, y: a.top, w: a.width, h: a.height })),
      width,
      height,
    );
    // No room anywhere: no screen at all rather than one with every spot skipped.
    if ((options.skip?.length ?? 0) >= POSITIONS.length) {
      if (this.sentKey !== 'none') this.hide(ads);
      return;
    }
    const key = JSON.stringify(options);
    if (key === this.sentKey) return;
    try {
      this.screen = ads.screen('panel', options);
      this.sentKey = key;
    } catch (error) {
      logger.warn(SCOPE, `screen ad failed: ${String(error)}`);
    }
  }

  private hide(ads: Ads): void {
    try {
      if (this.screen) this.screen.hide();
      else ads.hideScreen();
    } catch (error) {
      logger.warn(SCOPE, `screen ad hide failed: ${String(error)}`);
    }
    this.screen = null;
    this.sentKey = 'none';
  }
}
