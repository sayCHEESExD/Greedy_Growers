import { WEATHERS, formatMoney, formatTimer, type WeatherKind } from '@greedy/shared';
import inventoryIcon from '../../../assets/ui/inventory.png';
import rebirthIcon from '../../../assets/ui/rebirth.png';
import shopIcon from '../../../assets/ui/shop.png';
import soundIcon from '../../../assets/ui/sound.png';
import trophyIcon from '../../../assets/ui/trophy.png';
import upgradesIcon from '../../../assets/ui/upgrades.png';
import { el } from './Modal.js';
import { injectGameStyles } from './styles.js';

export interface HotbarItem {
  readonly ref: string;
  readonly name: string;
  readonly count?: number;
  readonly dead?: boolean;
  readonly fav?: boolean;
}

export interface HudHandlers {
  market(): void;
  plot(): void;
  sell(): void;
  shop(): void;
  items(): void;
  rebirth(): void;
  index(): void;
  leaderboard(): void;
  pets(): void;
  sound(): boolean;
  equip(ref: string): void;
  fertilizer(id: number): void;
  worm(id: number): void;
  skipTutorial(): void;
}

export interface PlantOption {
  readonly id: number;
  readonly label: string;
  readonly locked: boolean;
}

const WEATHER_ICON: Readonly<Record<WeatherKind, string>> = {
  clear: '☀️',
  misty: '🌫️',
  sandstorm: '🌪️',
  blizzard: '❄️',
  acid: '☢️',
  rainbow: '🌈',
  meteor: '☄️',
  lucky: '🍀',
};

/**
 * THE HUD, as the reference lays it out: MARKET / PLOT / SELL along the top,
 * Shop / Items / Rebirth (and the Index once it is unlocked) down the left,
 * Pets on the right (Boxity draws the emote picker itself), the cash bottom-left, the numbered hotbar
 * bottom-centre, the weather bottom-right, the yellow tutorial line and the
 * notices under the top buttons.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly cash: HTMLDivElement;
  private readonly tickets: HTMLDivElement;
  private readonly tokens: HTMLDivElement;
  private readonly rebirths: HTMLDivElement;
  private readonly hotbar: HTMLDivElement;
  private readonly plantbar: HTMLDivElement;
  private readonly guideLine: HTMLDivElement;
  private readonly notices: HTMLDivElement;
  private readonly skip: HTMLButtonElement;
  private readonly weatherTime: HTMLDivElement;
  private readonly weatherIcon: HTMLButtonElement;
  private readonly weatherCard: HTMLDivElement;
  private readonly weatherName: HTMLDivElement;
  private readonly weatherBlurb: HTMLDivElement;
  private readonly weatherNext: HTMLDivElement;
  private readonly top: Record<'market' | 'plot' | 'sell', HTMLButtonElement>;
  private readonly indexTile: HTMLButtonElement;
  private readonly indexDot: HTMLDivElement;
  private readonly shopBadge: HTMLDivElement;
  private readonly rebirthDot: HTMLDivElement;
  private readonly soundTile: HTMLButtonElement;
  private readonly leftRail: HTMLDivElement;
  private readonly rightRail: HTMLDivElement;
  /** The left rail's own tiles, so they can move between the rails and back. */
  private leftTiles: HTMLElement[] = [];
  private reservedBottom = 0;
  private hotbarSignature = '';
  private plantSignature = '';
  private lastCash = -1;
  private items: readonly HotbarItem[] = [];
  /**
   * KEYBOARD SHORTCUTS for the HUD's buttons (PC), so a player whose cursor
   * is locked to the camera never has to give it back to press one. Shown as
   * a key badge on each button; menus keep their own controls. P is Boxity's
   * pause menu on CrazyGames and is never bound.
   */
  private readonly shortcuts = new Map<string, HTMLButtonElement>();

  constructor(container: HTMLElement, private readonly on: HudHandlers) {
    injectGameStyles();
    this.root = el('div', 'gg-hud gg-font');
    container.appendChild(this.root);

    // Top: MARKET / PLOT / SELL.
    const top = el('div', 'gg-top');
    const button = (key: 'market' | 'plot' | 'sell', text: string, shortcut: string, act: () => void): HTMLButtonElement => {
      const b = el('button', `gg-top__btn gg-top__btn--${key} gg-outline`, text);
      b.type = 'button';
      b.addEventListener('click', act);
      this.bindShortcut(b, shortcut);
      top.appendChild(b);
      return b;
    };
    this.top = {
      market: button('market', 'MARKET', 'Z', () => on.market()),
      plot: button('plot', 'PLOT', 'X', () => on.plot()),
      sell: button('sell', 'SELL', 'C', () => on.sell()),
    };
    this.root.appendChild(top);

    // Left rail.
    const left = el('div', 'gg-rail gg-rail--left');
    this.leftRail = left;
    const tile = (parent: HTMLElement, label: string, icon: string, shortcut: string, act: () => void, emoji = false): HTMLButtonElement => {
      const t = el('button', 'gg-tile');
      t.type = 'button';
      if (emoji) t.appendChild(el('div', 'gg-tile__emoji', icon));
      else {
        const img = el('img', 'gg-tile__icon');
        img.src = icon;
        img.alt = '';
        img.draggable = false;
        t.appendChild(img);
      }
      t.appendChild(el('div', 'gg-tile__label gg-outline', label));
      t.addEventListener('click', act);
      this.bindShortcut(t, shortcut);
      parent.appendChild(t);
      return t;
    };
    const shop = tile(left, 'Shop', shopIcon, 'T', () => on.shop());
    this.shopBadge = el('div', 'gg-tile__badge gg-outline-thin', 'NEW');
    shop.appendChild(this.shopBadge);
    tile(left, 'Items', inventoryIcon, 'B', () => on.items());
    const rebirth = tile(left, 'Rebirth', rebirthIcon, 'R', () => on.rebirth());
    this.rebirthDot = el('div', 'gg-tile__dot');
    this.rebirthDot.hidden = true;
    rebirth.appendChild(this.rebirthDot);
    this.indexTile = tile(left, 'Index', upgradesIcon, 'I', () => on.index());
    this.indexDot = el('div', 'gg-tile__dot');
    this.indexDot.hidden = true;
    this.indexTile.appendChild(this.indexDot);
    this.indexTile.hidden = true;
    this.root.appendChild(left);

    // Right rail.
    this.leftTiles = [...left.children] as HTMLElement[];
    // Touch mode can switch on after Boxity first reports its corner (the
    // first touch), and the rails are laid out differently there.
    let touch = document.body.classList.contains('aoe-touch-mode');
    new MutationObserver(() => {
      const now = document.body.classList.contains('aoe-touch-mode');
      if (now !== touch) {
        touch = now;
        this.layoutRails();
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const right = el('div', 'gg-rail gg-rail--right');
    this.rightRail = right;
    tile(right, 'Pets', '🐶', 'J', () => on.pets(), true);
    tile(right, 'Top', trophyIcon, 'L', () => on.leaderboard());
    this.soundTile = tile(right, 'Sound', soundIcon, 'M', () => {
      const muted = on.sound();
      this.soundTile.style.opacity = muted ? '0.45' : '1';
    });
    this.root.appendChild(right);

    // Cash, tickets, tokens, rebirths.
    const purse = el('div', 'gg-cash');
    this.cash = el('div', 'gg-cash__money gg-outline', '$0');
    this.tickets = el('div', 'gg-cash__tickets gg-outline', '');
    this.tokens = el('div', 'gg-cash__tokens gg-outline', '');
    this.rebirths = el('div', 'gg-cash__rebirth gg-outline-thin', '');
    purse.append(this.rebirths, this.tokens, this.tickets, this.cash);
    this.root.appendChild(purse);
    // The rails dodge Boxity's corner and the purse; both change size after
    // boot (the web fonts arrive, new currencies add lines), so lay out again then.
    let purseHeight = 0;
    new ResizeObserver(() => {
      const h = Math.round(purse.getBoundingClientRect().height);
      if (h === purseHeight) return;
      purseHeight = h;
      requestAnimationFrame(() => this.layoutRails());
    }).observe(purse);
    void document.fonts?.ready.then(() => this.layoutRails());

    // Hotbar and the planting options over it.
    this.hotbar = el('div', 'gg-hotbar');
    this.root.appendChild(this.hotbar);
    this.plantbar = el('div', 'gg-plantbar');
    this.plantbar.hidden = true;
    this.root.appendChild(this.plantbar);

    // The tutorial line and the notices.
    this.guideLine = el('div', 'gg-guide gg-outline', '');
    this.guideLine.hidden = true;
    this.notices = el('div', 'gg-notices');
    this.skip = el('button', 'gg-skip', 'Skip tutorial');
    this.skip.type = 'button';
    this.skip.hidden = true;
    this.skip.addEventListener('click', () => on.skipTutorial());
    this.root.append(this.guideLine, this.notices, this.skip);

    // Weather.
    const weather = el('div', 'gg-weather');
    this.weatherTime = el('div', 'gg-weather__time gg-outline-thin', '');
    this.weatherIcon = el('button', 'gg-weather__icon', '☀️');
    this.weatherIcon.type = 'button';
    this.weatherCard = el('div', 'gg-weather__card');
    this.weatherCard.hidden = true;
    this.weatherName = el('div', 'gg-weather__name gg-outline', '');
    this.weatherBlurb = el('div', 'gg-weather__blurb gg-outline-thin', '');
    this.weatherNext = el('div', 'gg-weather__next gg-outline-thin', '');
    this.weatherCard.append(this.weatherName, this.weatherBlurb, this.weatherNext);
    this.weatherIcon.addEventListener('click', () => {
      this.weatherCard.hidden = !this.weatherCard.hidden;
    });
    weather.append(this.weatherCard, this.weatherTime, this.weatherIcon);
    this.root.appendChild(weather);
  }

  setCash(cash: number, tickets: number, tokens: number, rebirths: number): void {
    const text = formatMoney(cash);
    if (this.cash.textContent !== text) {
      this.cash.textContent = text;
      if (this.lastCash >= 0 && cash > this.lastCash) {
        this.cash.classList.remove('gg-cash__money--pop');
        void this.cash.offsetWidth;
        this.cash.classList.add('gg-cash__money--pop');
      }
    }
    this.lastCash = cash;
    const t = tickets > 0 ? `🎟️ ${tickets.toLocaleString('en-US')} Tickets` : '';
    if (this.tickets.textContent !== t) this.tickets.textContent = t;
    const k = tokens > 0 ? `🍂 ${tokens} Harvest Tokens` : '';
    if (this.tokens.textContent !== k) this.tokens.textContent = k;
    const r = rebirths > 0 ? `Rebirth ${rebirths}` : '';
    if (this.rebirths.textContent !== r) this.rebirths.textContent = r;
  }

  setRails(state: { indexUnlocked: boolean; indexReady: boolean; canRebirth: boolean; shopNew: boolean }): void {
    // A tile appearing or going changes the rail's height: lay the rails out again.
    if (this.indexTile.hidden === state.indexUnlocked) {
      this.indexTile.hidden = !state.indexUnlocked;
      this.layoutRails();
    }
    this.indexDot.hidden = !state.indexReady;
    this.rebirthDot.hidden = !state.canRebirth;
    this.shopBadge.hidden = !state.shopNew;
  }

  setHotbar(items: readonly HotbarItem[], equipped: string): void {
    const signature = `${equipped}|${items.map((i) => `${i.ref}:${i.name}:${i.count ?? ''}:${i.fav ? 1 : 0}`).join(',')}`;
    if (signature === this.hotbarSignature) return;
    this.hotbarSignature = signature;
    this.items = items;
    this.hotbar.replaceChildren(
      ...items.map((item, i) => {
        const slot = el('button', `gg-slot gg-outline-thin${item.ref === equipped ? ' gg-slot--on' : ''}${item.dead ? ' gg-slot--dead' : ''}`);
        slot.type = 'button';
        slot.appendChild(el('div', 'gg-slot__num', String((i + 1) % 10)));
        slot.appendChild(el('div', 'gg-slot__name', item.name));
        if (item.count !== undefined && item.count > 1) slot.appendChild(el('div', 'gg-slot__count', `x${item.count}`));
        if (item.fav) slot.appendChild(el('div', 'gg-slot__fav', '♥'));
        slot.addEventListener('click', () => this.on.equip(item.ref === equipped ? '' : item.ref));
        return slot;
      }),
    );
  }

  /** The number keys: select hotbar slot `index` (0-9), or put it away. */
  pressSlot(index: number, equipped: string): void {
    const item = this.items[index];
    if (!item) return;
    this.on.equip(item.ref === equipped ? '' : item.ref);
  }

  /** The fertilizer/worm chips shown while a seed is in hand. */
  setPlantBar(visible: boolean, fertilizers: readonly PlantOption[], fert: number, worms: readonly PlantOption[], worm: number): void {
    const touch = document.body.classList.contains('aoe-touch-mode');
    const signature = visible ? `${touch ? 'T' : 'D'}|${fert}|${worm}|${fertilizers.map((f) => `${f.id}${f.locked ? 'L' : ''}:${f.label}`).join(',')}|${worms.map((w) => w.label).join(',')}` : '';
    if (signature === this.plantSignature) return;
    this.plantSignature = signature;
    this.plantbar.hidden = !visible || (fertilizers.every((f) => f.locked) && worms.length === 0);
    if (this.plantbar.hidden) return;
    const chips: HTMLElement[] = [];
    const chip = (label: string, on: boolean, locked: boolean, act: () => void): void => {
      const c = el('button', `gg-chip gg-outline-thin${on ? ' gg-chip--on' : ''}${locked ? ' gg-chip--locked' : ''}`, label);
      c.type = 'button';
      if (!locked) c.addEventListener('click', act);
      chips.push(c);
    };
    if (touch) {
      // A phone has no room for a row of chips: one per choice, tapped to cycle.
      const cycle = (options: readonly PlantOption[], current: number, none: string, icon: string, pick: (id: number) => void): void => {
        const ids = [0, ...options.filter((o) => !o.locked).map((o) => o.id)];
        const label = options.find((o) => o.id === current)?.label ?? none;
        chip(`${icon} ${label} ▸`, current !== 0, false, () => pick(ids[(ids.indexOf(current) + 1) % ids.length] ?? 0));
      };
      if (fertilizers.some((f) => !f.locked)) cycle(fertilizers, fert, 'No Fertilizer', '🧪', (id) => this.on.fertilizer(id));
      if (worms.length > 0) cycle(worms, worm, 'No Worm', '🪱', (id) => this.on.worm(id));
      this.plantbar.replaceChildren(...chips);
      return;
    }
    chip('No Fertilizer', fert === 0, false, () => this.on.fertilizer(0));
    for (const f of fertilizers) if (!f.locked) chip(f.label, fert === f.id, f.locked, () => this.on.fertilizer(f.id));
    if (worms.length > 0) {
      chip('No Worm', worm === 0, false, () => this.on.worm(0));
      for (const w of worms) chip(w.label, worm === w.id, false, () => this.on.worm(w.id));
    }
    this.plantbar.replaceChildren(...chips);
  }

  guide(text: string, skippable = false): void {
    if (this.guideLine.textContent !== text) this.guideLine.textContent = text;
    this.guideLine.hidden = !text;
    this.skip.hidden = !skippable;
  }

  notice(text: string, kind: 'good' | 'bad' | 'info' | 'gold' = 'info'): void {
    const node = el('div', `gg-notice gg-notice--${kind} gg-outline`, text);
    this.notices.appendChild(node);
    while (this.notices.children.length > 4) this.notices.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 3400);
  }

  setWeather(kind: WeatherKind, secondsLeft: number, next: WeatherKind, nextIn: number, showNext: boolean): void {
    const def = WEATHERS[kind];
    const icon = WEATHER_ICON[kind];
    if (this.weatherIcon.textContent !== icon) this.weatherIcon.textContent = icon;
    const time = kind === 'clear' ? '' : formatTimer(secondsLeft);
    if (this.weatherTime.textContent !== time) this.weatherTime.textContent = time;
    const name = def.name.toUpperCase();
    if (this.weatherName.textContent !== name) this.weatherName.textContent = name;
    if (this.weatherBlurb.textContent !== def.blurb) this.weatherBlurb.textContent = def.blurb;
    const nextText = showNext ? `Next: ${WEATHERS[next].name} in ${formatTimer(nextIn)}` : 'Get the Weather Machine to see what comes next.';
    if (this.weatherNext.textContent !== nextText) this.weatherNext.textContent = nextText;
  }

  /** Pulse a top button (the tutorial pointing the way). */
  focus(which: 'market' | 'plot' | 'sell' | null): void {
    for (const [key, b] of Object.entries(this.top)) b.classList.toggle('gg-top__btn--focus', key === which);
  }

  /**
   * KEEP CLEAR OF BOXITY'S TOP-LEFT (its toolbar and chat feed), whose bottom
   * edge Boxity reports in CSS pixels; 0 when it draws nothing there.
   *
   * Desktop: the left rail drops below it, and goes two tiles wide if one
   * column would then run into the cash. A phone has no room under it at all,
   * so the left rail's tiles join the right rail, two tiles wide.
   */
  avoidReserved(bottom: number): void {
    this.reservedBottom = Math.max(0, bottom);
    this.layoutRails();
  }

  /** Re-run after a resize, with the last reported area. */
  layoutRails(): void {
    const touch = document.body.classList.contains('aoe-touch-mode');
    this.placeRails(touch && this.reservedBottom > 0);
    // A short screen where even two tiles wide the left rail meets the cash:
    // its tiles join the right rail instead.
    const cashTop = this.cash.parentElement?.getBoundingClientRect().top ?? window.innerHeight;
    if (!this.leftRail.hidden && this.leftRail.getBoundingClientRect().bottom > cashTop - 8) this.placeRails(true);
  }

  private placeRails(merge: boolean): void {
    const left = this.leftRail;
    if (merge) this.rightRail.prepend(...this.leftTiles);
    else left.append(...this.leftTiles);
    this.rightRail.classList.toggle('gg-rail--two', merge);
    left.hidden = merge;

    left.style.top = '';
    left.style.transform = '';
    left.classList.remove('gg-rail--two');
    if (merge) return;
    const clear = this.reservedBottom + 10;
    if (this.reservedBottom > 0 && left.getBoundingClientRect().top < clear) {
      left.style.top = `${clear}px`;
      left.style.transform = 'none';
    }
    // Wherever it ended up, a column that would run into the cash goes two tiles wide.
    const cashTop = this.cash.parentElement?.getBoundingClientRect().top ?? window.innerHeight;
    if (left.getBoundingClientRect().bottom > cashTop - 8) left.classList.add('gg-rail--two');
  }

  /** Give a button its shortcut key and the badge that shows it. */
  private bindShortcut(button: HTMLButtonElement, key: string): void {
    this.shortcuts.set(key.toLowerCase(), button);
    button.appendChild(el('span', 'gg-key gg-outline-thin', key));
    button.title = `${button.title || button.textContent || ''} (${key})`.trim();
  }

  /** Press the HUD button bound to a key. True if one was pressed. */
  pressShortcut(key: string): boolean {
    const button = this.shortcuts.get(key.toLowerCase());
    if (!button || button.hidden || button.disabled || !button.isConnected) return false;
    button.click();
    return true;
  }
}
