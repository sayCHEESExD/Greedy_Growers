import { injectHudStyles } from './hudStyles.js';

/**
 * THE GREEDY GROWERS HUD, one stylesheet, injected once.
 *
 * The look is the reference video's: big brick-textured MARKET (green), PLOT
 * (brown) and SELL (red) buttons along the top; Shop, Items and Rebirth down
 * the left with their icons and a label under each; Emotes and Pets on the
 * right; the cash in big green outlined digits bottom-left; a row of numbered
 * brown slots for the hotbar; the yellow tutorial line under the buttons; the
 * weather chip and its timer bottom-right. Windows are brown, studded boards
 * with a red X.
 *
 * RESPONSIVE BY ONE UNIT: sizes are multiples of --u (one pixel of a
 * 1920x1080 layout, from hudStyles), floored by --f on small desktop windows,
 * so the whole HUD scales as one on a monitor and on a phone held sideways.
 *
 * NO BACKTICKS IN THE CSS: it is a template literal.
 */
let injected = false;

export const injectGameStyles = (): void => {
  if (injected) return;
  injected = true;
  injectHudStyles();
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
};

/** A brick pattern drawn in CSS: the reference's studded button faces. */
const BRICKS =
  'repeating-linear-gradient(0deg, rgba(0,0,0,0.13) 0 calc(3 * var(--u)), transparent calc(3 * var(--u)) calc(26 * var(--u))), ' +
  'repeating-linear-gradient(90deg, rgba(0,0,0,0.10) 0 calc(3 * var(--u)), transparent calc(3 * var(--u)) calc(44 * var(--u)))';

const CSS = `
/*
 * HIDDEN MEANS HIDDEN. The browser's own [hidden] rule is display:none at the
 * lowest priority, so any class here that sets display (flex, grid) would
 * silently override it and leave a "closed" element on screen. This wins.
 */
[hidden] { display: none !important; }
:root {
  --gg-font: "Fredoka", "Grandstander", "Baloo 2", "Comic Sans MS", system-ui, sans-serif;
  --gg-ink: #14100c;
  --gg-wood: #7a4a24;
  --gg-wood-dark: #5a3216;
  --gg-wood-light: #9a6236;
}
.gg-font { font-family: var(--gg-font); font-weight: 700; letter-spacing: 0.01em; }
.gg-outline, .gh-outline {
  color: #ffffff;
  text-shadow:
    2px 0 0 var(--gg-ink), -2px 0 0 var(--gg-ink), 0 2px 0 var(--gg-ink), 0 -2px 0 var(--gg-ink),
    2px 2px 0 var(--gg-ink), -2px 2px 0 var(--gg-ink), 2px -2px 0 var(--gg-ink), -2px -2px 0 var(--gg-ink),
    0 3px 3px rgba(0, 0, 0, 0.3);
}
.gg-outline-thin, .gh-outline-thin {
  color: #ffffff;
  text-shadow: 1.5px 0 0 var(--gg-ink), -1.5px 0 0 var(--gg-ink), 0 1.5px 0 var(--gg-ink), 0 -1.5px 0 var(--gg-ink), 0 2px 2px rgba(0, 0, 0, 0.3);
}
.gg-hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; user-select: none; -webkit-user-select: none; }
.gg-hud > * { pointer-events: auto; }
.gg-hud [hidden], .gg-hidden, .gh-world [hidden] { display: none !important; }
.gg-hud button, .gg-window button { font-family: var(--gg-font); }
.gg-font button { font-family: var(--gg-font); }

/* ------------------------------------------------------------ top buttons */
.gg-top {
  position: fixed;
  top: max(calc(6px * var(--f)), calc(10 * var(--u)), env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: calc(22 * var(--u));
  z-index: 24;
}
.gg-top__btn {
  width: calc(196 * var(--u));
  height: calc(60 * var(--u));
  min-width: calc(76px * var(--f));
  min-height: calc(26px * var(--f));
  border: max(calc(2px * var(--f)), calc(3 * var(--u))) solid #ffffff;
  border-radius: calc(6 * var(--u));
  box-shadow: 0 0 0 max(calc(1.5px * var(--f)), calc(3 * var(--u))) #1a1410, 0 calc(4 * var(--u)) calc(8 * var(--u)) rgba(0,0,0,0.35);
  cursor: pointer;
  font-size: max(calc(13px * var(--f)), calc(40 * var(--u)));
  font-weight: 600;
  padding: 0;
  transition: transform 80ms ease, filter 80ms ease;
}
.gg-top__btn { position: relative; }
/* A button's keyboard shortcut (PC only): a small dark key cap on its corner. */
.gg-key {
  position: absolute;
  right: calc(-8 * var(--u));
  bottom: calc(-8 * var(--u));
  min-width: max(calc(13px * var(--f)), calc(30 * var(--u)));
  padding: 0 calc(5 * var(--u));
  font-size: max(calc(9px * var(--f)), calc(22 * var(--u)));
  line-height: max(calc(13px * var(--f)), calc(30 * var(--u)));
  font-weight: 700;
  color: #ffffff;
  text-align: center;
  background: #1a1410;
  border: max(1px, calc(2 * var(--u))) solid #ffffff;
  border-radius: calc(5 * var(--u));
  pointer-events: none;
}
body.aoe-touch-mode .gg-key { display: none; }
/* The crosshair while the cursor is locked to the camera. */
.gg-crosshair {
  position: fixed;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  pointer-events: none;
  z-index: 21;
  background:
    linear-gradient(#ffffff, #ffffff) center / 2px 100% no-repeat,
    linear-gradient(#ffffff, #ffffff) center / 100% 2px no-repeat;
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000);
}
.gg-crosshair[hidden] { display: none; }
.gg-top__btn:hover { filter: brightness(1.08); transform: translateY(calc(-2 * var(--u))); }
.gg-top__btn:active { transform: translateY(calc(2 * var(--u))); }
.gg-top__btn--market { background: ${BRICKS}, #3fd23a; }
.gg-top__btn--plot { background: ${BRICKS}, #b0907a; }
.gg-top__btn--sell { background: ${BRICKS}, #e8314a; }
.gg-top__btn--focus { animation: gg-pulse 0.9s ease-in-out infinite; }
@keyframes gg-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }

/* ------------------------------------------------------------------ rails */
.gg-rail {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: calc(16 * var(--u));
  z-index: 22;
}
.gg-rail--left { left: max(calc(6px * var(--f)), calc(18 * var(--u)), env(safe-area-inset-left, 0px)); top: 47%; }
.gg-rail--right { right: max(calc(6px * var(--f)), calc(18 * var(--u)), env(safe-area-inset-right, 0px)); top: 42%; }
/* Two tiles wide, when one column would not fit beside Boxity's own UI. */
.gg-rail--two { display: grid; grid-template-columns: repeat(2, auto); }
.gg-tile {
  position: relative;
  width: calc(108 * var(--u));
  min-width: calc(44px * var(--f));
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 90ms ease;
}
.gg-tile:hover { transform: scale(1.07) rotate(-2deg); }
.gg-tile:active { transform: scale(0.95); }
.gg-tile__icon { width: calc(84 * var(--u)); height: calc(84 * var(--u)); min-width: calc(34px * var(--f)); min-height: calc(34px * var(--f)); object-fit: contain; filter: drop-shadow(0 calc(3 * var(--u)) 0 rgba(0,0,0,0.25)); }
.gg-tile__emoji { font-size: max(calc(28px * var(--f)), calc(70 * var(--u))); line-height: 1; filter: drop-shadow(0 calc(3 * var(--u)) 0 rgba(0,0,0,0.3)); }
.gg-tile__label { font-size: max(calc(11px * var(--f)), calc(30 * var(--u))); margin-top: calc(-6 * var(--u)); font-weight: 600; }
.gg-tile__badge {
  position: absolute;
  top: calc(-10 * var(--u));
  right: calc(-6 * var(--u));
  font-size: max(calc(9px * var(--f)), calc(22 * var(--u)));
  color: #ffe23a;
  font-style: italic;
  font-weight: 700;
  transform: rotate(8deg);
}
.gg-tile__dot { position: absolute; top: 0; right: calc(6 * var(--u)); width: calc(22 * var(--u)); height: calc(22 * var(--u)); min-width: 9px; min-height: 9px; border-radius: 50%; background: #ff3a3a; border: calc(3 * var(--u)) solid #fff; }

/* ------------------------------------------------------------------- cash */
.gg-cash {
  position: fixed;
  left: max(calc(8px * var(--f)), calc(26 * var(--u)), env(safe-area-inset-left, 0px));
  bottom: max(calc(70px * var(--f)), calc(160 * var(--u)));
  z-index: 22;
  pointer-events: none !important;
  display: flex;
  flex-direction: column;
  gap: calc(4 * var(--u));
}
.gg-cash__money {
  font-size: max(calc(20px * var(--f)), calc(64 * var(--u)));
  color: #4dff4a;
  font-weight: 700;
  line-height: 1;
  transform-origin: left center;
}
.gg-cash__money--pop { animation: gg-pop 0.45s ease-out; }
@keyframes gg-pop { 0% { transform: scale(1); } 30% { transform: scale(1.22); } 100% { transform: scale(1); } }
.gg-cash__tickets { font-size: max(calc(12px * var(--f)), calc(34 * var(--u))); color: #ffd84a; }
.gg-cash__tokens { font-size: max(calc(11px * var(--f)), calc(28 * var(--u))); color: #ff9a3a; }
.gg-cash__rebirth { font-size: max(calc(10px * var(--f)), calc(26 * var(--u))); color: #ff8ad8; }

/* ----------------------------------------------------------------- hotbar */
.gg-hotbar {
  position: fixed;
  left: 50%;
  bottom: max(calc(6px * var(--f)), calc(12 * var(--u)), env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  display: flex;
  gap: calc(10 * var(--u));
  z-index: 23;
}
.gg-slot {
  position: relative;
  width: calc(112 * var(--u));
  height: calc(104 * var(--u));
  min-width: calc(46px * var(--f));
  min-height: calc(42px * var(--f));
  border-radius: calc(10 * var(--u));
  background: rgba(70, 40, 18, 0.82);
  border: max(calc(1.5px * var(--f)), calc(3 * var(--u))) solid rgba(0,0,0,0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(4 * var(--u));
  color: #fff;
  text-align: center;
  font-size: max(calc(8px * var(--f)), calc(19 * var(--u)));
  line-height: 1.05;
  overflow: hidden;
}
.gg-slot--on { border-color: #ffffff; background: rgba(110, 66, 30, 0.92); transform: translateY(calc(-6 * var(--u))); }
.gg-slot__num { position: absolute; top: calc(2 * var(--u)); left: 50%; transform: translateX(-50%); font-size: max(calc(9px * var(--f)), calc(20 * var(--u))); }
.gg-slot__name { margin-top: calc(12 * var(--u)); overflow-wrap: anywhere; max-height: 100%; }
.gg-slot__count { position: absolute; top: calc(2 * var(--u)); right: calc(6 * var(--u)); color: #ffe066; }
.gg-slot__fav { position: absolute; top: calc(2 * var(--u)); left: calc(6 * var(--u)); color: #ff5a8a; }
.gg-slot--dead .gg-slot__name { color: #ff8a8a; }
.gg-slot--empty { opacity: 0.55; }

/* -------------------------------------------------------- planting options */
.gg-plantbar {
  position: fixed;
  left: 50%;
  bottom: max(calc(56px * var(--f)), calc(126 * var(--u)));
  transform: translateX(-50%);
  display: flex;
  gap: calc(8 * var(--u));
  z-index: 23;
}
.gg-chip {
  border: calc(3 * var(--u)) solid rgba(0,0,0,0.5);
  border-radius: calc(30 * var(--u));
  padding: calc(6 * var(--u)) calc(16 * var(--u));
  background: rgba(40, 28, 18, 0.8);
  color: #fff;
  cursor: pointer;
  font-size: max(calc(10px * var(--f)), calc(24 * var(--u)));
  min-height: calc(22px * var(--f));
}
.gg-chip--on { background: #4dbb3a; border-color: #ffffff; }
.gg-chip--locked { opacity: 0.5; }

/* --------------------------------------------------------- guide & notices */
.gg-guide {
  position: fixed;
  left: 50%;
  top: max(calc(48px * var(--f)), calc(126 * var(--u)));
  transform: translateX(-50%);
  font-size: max(calc(16px * var(--f)), calc(46 * var(--u)));
  color: #ffe23a !important;
  white-space: nowrap;
  z-index: 21;
  pointer-events: none !important;
}
.gg-notices {
  position: fixed;
  left: 50%;
  top: max(calc(70px * var(--f)), calc(184 * var(--u)));
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(4 * var(--u));
  z-index: 21;
  pointer-events: none !important;
}
.gg-notice { font-size: max(calc(12px * var(--f)), calc(32 * var(--u))); animation: gg-notice 3.4s ease-out forwards; white-space: nowrap; }
.gg-notice--good { color: #8dff6a; }
.gg-notice--bad { color: #ff6a6a; }
.gg-notice--gold { color: #ffe066; }
.gg-notice--info { color: #ffffff; }
@keyframes gg-notice { 0% { opacity: 0; transform: translateY(calc(8 * var(--u))); } 8% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; } }
.gg-skip { position: fixed; left: 50%; transform: translateX(-50%); top: max(calc(76px * var(--f)), calc(184 * var(--u))); z-index: 21; font-size: max(calc(10px * var(--f)), calc(22 * var(--u))); background: rgba(0,0,0,0.35); border: 0; border-radius: calc(20 * var(--u)); color: #fff; padding: calc(4 * var(--u)) calc(14 * var(--u)); cursor: pointer; }

/* ------------------------------------------------------------------ weather */
.gg-weather {
  position: fixed;
  right: max(calc(6px * var(--f)), calc(16 * var(--u)), env(safe-area-inset-right, 0px));
  bottom: max(calc(6px * var(--f)), calc(12 * var(--u)), env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  z-index: 22;
}
.gg-weather__time { font-size: max(calc(10px * var(--f)), calc(26 * var(--u))); }
.gg-weather__icon {
  width: calc(96 * var(--u));
  height: calc(96 * var(--u));
  min-width: calc(38px * var(--f));
  min-height: calc(38px * var(--f));
  border-radius: calc(10 * var(--u));
  border: calc(3 * var(--u)) solid rgba(0,0,0,0.4);
  background: rgba(30, 30, 40, 0.55);
  cursor: pointer;
  font-size: max(calc(20px * var(--f)), calc(56 * var(--u)));
  display: flex;
  align-items: center;
  justify-content: center;
}
.gg-weather__card {
  position: absolute;
  right: 0;
  bottom: calc(110 * var(--u));
  width: calc(560 * var(--u));
  min-width: calc(200px * var(--f));
  background: rgba(70, 40, 20, 0.92);
  border: calc(4 * var(--u)) solid #2a1a0c;
  border-radius: calc(10 * var(--u));
  padding: calc(14 * var(--u)) calc(18 * var(--u));
}
.gg-weather__name { font-size: max(calc(14px * var(--f)), calc(40 * var(--u))); }
.gg-weather__blurb { font-size: max(calc(11px * var(--f)), calc(28 * var(--u))); margin-top: calc(6 * var(--u)); }
.gg-weather__next { font-size: max(calc(10px * var(--f)), calc(22 * var(--u))); margin-top: calc(8 * var(--u)); color: #ffe066; }

/* --------------------------------------------------------------- dialogue */
/* A keeper's conversation: a wooden card above the hotbar, their name, their line, numbered choices. */
.gg-dialogue {
  position: fixed;
  left: 50%;
  bottom: max(calc(96px * var(--f)), calc(230 * var(--u)));
  transform: translateX(-50%);
  width: min(92vw, max(calc(300px * var(--f)), calc(820 * var(--u))));
  display: flex;
  flex-direction: column;
  gap: calc(10 * var(--u));
  padding: calc(18 * var(--u)) calc(22 * var(--u));
  background: rgba(40, 24, 12, 0.88);
  border: max(2px, calc(4 * var(--u))) solid #ffffff;
  border-radius: calc(14 * var(--u));
  box-shadow: 0 0 0 max(1.5px, calc(3 * var(--u))) #1a1410, 0 calc(6 * var(--u)) calc(16 * var(--u)) rgba(0,0,0,0.4);
  z-index: 26;
}
.gg-dialogue__who { font-size: max(calc(12px * var(--f)), calc(30 * var(--u))); color: #ffd23a; font-weight: 700; }
.gg-dialogue__line { font-size: max(calc(13px * var(--f)), calc(34 * var(--u))); color: #ffffff; margin-bottom: calc(4 * var(--u)); }
.gg-dialogue__opt {
  display: flex;
  align-items: center;
  gap: calc(12 * var(--u));
  width: 100%;
  background: rgba(255, 255, 255, 0.10);
  border: max(1px, calc(2 * var(--u))) solid rgba(255, 255, 255, 0.35);
  border-radius: calc(9 * var(--u));
  color: #ffffff;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: max(calc(13px * var(--f)), calc(34 * var(--u)));
  font-weight: 600;
  padding: calc(10 * var(--u)) calc(14 * var(--u));
  transition: background 80ms ease, transform 80ms ease;
}
.gg-dialogue__opt:hover { background: rgba(255, 224, 102, 0.22); color: #ffe066; transform: translateX(calc(4 * var(--u))); }
.gg-dialogue__num {
  flex: none;
  min-width: max(calc(20px * var(--f)), calc(46 * var(--u)));
  line-height: max(calc(20px * var(--f)), calc(46 * var(--u)));
  text-align: center;
  color: #14100c;
  background: #ffd23a;
  border-radius: calc(7 * var(--u));
  font-weight: 700;
}
body.aoe-touch-mode .gg-dialogue { bottom: calc(env(safe-area-inset-bottom, 0px) + 96px); width: min(60vw, 420px); }

/* ---------------------------------------------------------------- windows */
.gg-shade { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.15); }
.gg-shade[hidden] { display: none !important; }
.gg-window {
  width: calc(1000 * var(--u));
  min-width: min(96vw, calc(320px * var(--f)));
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--gg-wood);
  border: calc(6 * var(--u)) solid #3a2410;
  border-radius: calc(12 * var(--u));
  box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0,0,0,0.45);
  color: #fff;
  overflow: hidden;
}
.gg-window--wide { width: calc(1240 * var(--u)); }
.gg-window--narrow { width: calc(760 * var(--u)); }
.gg-window__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(10 * var(--u)) calc(16 * var(--u));
  background: ${BRICKS}, var(--gg-wood-dark);
  border-bottom: calc(4 * var(--u)) solid #3a2410;
}
.gg-window__title { font-size: max(calc(18px * var(--f)), calc(54 * var(--u))); font-weight: 600; }
.gg-x {
  width: calc(64 * var(--u));
  height: calc(64 * var(--u));
  min-width: calc(28px * var(--f));
  min-height: calc(28px * var(--f));
  background: #e8202a;
  border: calc(4 * var(--u)) solid #ffffff;
  border-radius: calc(6 * var(--u));
  color: #fff;
  font-size: max(calc(16px * var(--f)), calc(40 * var(--u)));
  cursor: pointer;
  box-shadow: 0 0 0 calc(3 * var(--u)) #1a1410;
}
.gg-window__body { padding: calc(16 * var(--u)); overflow-y: auto; display: flex; flex-direction: column; gap: calc(14 * var(--u)); }
.gg-section { background: rgba(0,0,0,0.18); border-radius: calc(10 * var(--u)); padding: calc(12 * var(--u)); }
.gg-section__title { font-size: max(calc(14px * var(--f)), calc(38 * var(--u))); margin-bottom: calc(8 * var(--u)); }
.gg-row { display: flex; align-items: center; gap: calc(12 * var(--u)); flex-wrap: wrap; }
.gg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(150 * var(--u)), 1fr)); gap: calc(10 * var(--u)); }
.gg-card {
  position: relative;
  background: rgba(0,0,0,0.22);
  border: calc(3 * var(--u)) solid rgba(0,0,0,0.35);
  border-radius: calc(10 * var(--u));
  padding: calc(8 * var(--u));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(4 * var(--u));
  font-size: max(calc(10px * var(--f)), calc(22 * var(--u)));
  text-align: center;
  cursor: pointer;
  color: #fff;
}
.gg-card:hover { border-color: rgba(255,255,255,0.6); }
.gg-card--on { border-color: #7dff4a; background: rgba(60, 120, 40, 0.35); }
.gg-card--locked { opacity: 0.45; filter: grayscale(0.6); }
.gg-card__icon { width: calc(90 * var(--u)); height: calc(90 * var(--u)); min-width: 36px; min-height: 36px; image-rendering: auto; }
.gg-card__name { font-size: max(calc(11px * var(--f)), calc(25 * var(--u))); }
.gg-card__sub { font-size: max(calc(9px * var(--f)), calc(20 * var(--u))); opacity: 0.92; }
.gg-card__fav { position: absolute; top: calc(4 * var(--u)); right: calc(6 * var(--u)); color: #ff5a8a; font-size: max(calc(12px * var(--f)), calc(28 * var(--u))); }
.gg-btn {
  border: calc(4 * var(--u)) solid #ffffff;
  box-shadow: 0 0 0 calc(3 * var(--u)) #1a1410;
  border-radius: calc(8 * var(--u));
  padding: calc(8 * var(--u)) calc(22 * var(--u));
  min-height: calc(26px * var(--f));
  font-size: max(calc(12px * var(--f)), calc(32 * var(--u)));
  color: #fff;
  cursor: pointer;
  background: ${BRICKS}, #3fbf3a;
}
.gg-btn:hover { filter: brightness(1.1); }
.gg-btn:disabled { filter: grayscale(0.8) brightness(0.8); cursor: default; }
.gg-btn--red { background: ${BRICKS}, #e0303a; }
.gg-btn--grey { background: ${BRICKS}, #8a8a90; }
.gg-btn--blue { background: ${BRICKS}, #2f8ae0; }
.gg-btn--gold { background: ${BRICKS}, #e8a81a; }
.gg-btn--small { padding: calc(4 * var(--u)) calc(12 * var(--u)); font-size: max(calc(10px * var(--f)), calc(24 * var(--u))); border-width: calc(3 * var(--u)); }
.gg-tabs { display: flex; gap: calc(8 * var(--u)); flex-wrap: wrap; }
.gg-tab { background: rgba(0,0,0,0.3); border: calc(3 * var(--u)) solid rgba(0,0,0,0.4); border-radius: calc(8 * var(--u)); color: #fff; padding: calc(6 * var(--u)) calc(14 * var(--u)); cursor: pointer; font-size: max(calc(11px * var(--f)), calc(26 * var(--u))); }
.gg-tab--on { background: #ffffff; color: #3a2410; }
.gg-input { background: rgba(255,255,255,0.92); border: calc(3 * var(--u)) solid #3a2410; border-radius: calc(8 * var(--u)); padding: calc(6 * var(--u)) calc(12 * var(--u)); font-family: var(--gg-font); font-size: max(calc(12px * var(--f)), calc(28 * var(--u))); color: #3a2410; min-width: 0; }
.gg-note { font-size: max(calc(10px * var(--f)), calc(24 * var(--u))); opacity: 0.9; }
.gg-warn { color: #ff4a4a; font-size: max(calc(11px * var(--f)), calc(28 * var(--u))); text-align: center; }

/* Rebirth window */
.gg-rebirth__unlocks { display: flex; gap: calc(14 * var(--u)); justify-content: center; flex-wrap: wrap; }
.gg-rebirth__unlock { background: var(--gg-wood-light); border: calc(3 * var(--u)) solid #3a2410; border-radius: calc(10 * var(--u)); padding: calc(10 * var(--u)) calc(18 * var(--u)); display: flex; align-items: center; gap: calc(10 * var(--u)); font-size: max(calc(12px * var(--f)), calc(30 * var(--u))); }
.gg-rebirth__unlock span:first-child { font-size: max(calc(18px * var(--f)), calc(48 * var(--u))); }
.gg-bar { position: relative; height: calc(64 * var(--u)); min-height: 22px; background: #e8e8e8; border: calc(4 * var(--u)) solid #3a2410; border-radius: calc(8 * var(--u)); overflow: hidden; }
.gg-bar__fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(#8dff5a, #4dcc2a); }
.gg-bar__text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: max(calc(13px * var(--f)), calc(36 * var(--u))); color: #fff; }
.gg-yellow { color: #ffe23a; }

/* Shop sections (the reference's Majestic Egg banner) */
.gg-banner { border-radius: calc(10 * var(--u)); padding: calc(12 * var(--u)); background: linear-gradient(120deg, #3a7aff, #b04ae8, #ff7ad9); display: flex; gap: calc(12 * var(--u)); align-items: center; flex-wrap: wrap; }
.gg-banner--green { background: linear-gradient(120deg, #2a8a3a, #6ad84a, #ffe23a); }
.gg-banner--gold { background: linear-gradient(120deg, #c87a1a, #ffd23a, #fff2a0); }
.gg-odds { display: flex; gap: calc(8 * var(--u)); flex-wrap: wrap; }
.gg-odd { background: rgba(0,0,0,0.3); border-radius: calc(8 * var(--u)); padding: calc(6 * var(--u)) calc(10 * var(--u)); text-align: center; font-size: max(calc(9px * var(--f)), calc(22 * var(--u))); }

/* Hatch and wheel results */
.gg-reveal { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(16 * var(--u)); background: radial-gradient(rgba(255, 240, 160, 0.4), rgba(0,0,0,0.55)); pointer-events: auto; }
.gg-reveal[hidden] { display: none !important; }
.gg-reveal__img { width: calc(320 * var(--u)); height: calc(320 * var(--u)); min-width: 140px; min-height: 140px; animation: gg-hatch 0.9s ease-out; }
@keyframes gg-hatch { 0% { transform: scale(0.2) rotate(-30deg); } 60% { transform: scale(1.15) rotate(8deg); } 100% { transform: none; } }
.gg-reveal__title { font-size: max(calc(22px * var(--f)), calc(64 * var(--u))); }
.gg-reveal__sub { font-size: max(calc(13px * var(--f)), calc(34 * var(--u))); }

/* --------------------------------------------------------- world overlay */
.gh-world { position: fixed; inset: 0; pointer-events: none; z-index: 15; overflow: hidden; font-family: var(--gg-font); font-weight: 700; }
.gh-label { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; white-space: nowrap; line-height: 1.04; transform-origin: 50% 100%; }
.gg-l-mut { font-size: max(calc(10px * var(--f)), calc(26 * var(--u))); }
.gg-l-name { font-size: max(calc(13px * var(--f)), calc(38 * var(--u))); }
.gg-l-rarity { font-size: max(calc(11px * var(--f)), calc(32 * var(--u))); }
.gg-l-price { font-size: max(calc(11px * var(--f)), calc(32 * var(--u))); color: #4dff4a; }
.gg-l-value { font-size: max(calc(15px * var(--f)), calc(46 * var(--u))); color: #4dff4a; }
.gg-l-value--dead { color: #ff3a3a; }
.gg-l-mult { font-size: max(calc(10px * var(--f)), calc(28 * var(--u))); }
.gg-l-small { font-size: max(calc(9px * var(--f)), calc(22 * var(--u))); }
.gg-l-lock { font-size: max(calc(11px * var(--f)), calc(30 * var(--u))); }
.gh-prompt {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: calc(10 * var(--u));
  pointer-events: auto;
  cursor: pointer;
}
.gh-prompt__key {
  width: calc(44 * var(--u));
  height: calc(44 * var(--u));
  min-width: 22px;
  min-height: 22px;
  border-radius: calc(8 * var(--u));
  background: rgba(30, 30, 30, 0.55);
  border: calc(3 * var(--u)) solid rgba(255,255,255,0.75);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: max(calc(11px * var(--f)), calc(24 * var(--u)));
}
.gh-prompt__text { display: flex; flex-direction: column; }
.gh-prompt__object { display: none; }
.gh-prompt__action { font-size: max(calc(11px * var(--f)), calc(26 * var(--u))); font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.8) !important; }
.gh-bubble { position: absolute; transform: translate(-50%, -100%); background: rgba(255,255,255,0.95); color: #2a1a0a !important; text-shadow: none !important; border-radius: calc(14 * var(--u)); padding: calc(8 * var(--u)) calc(14 * var(--u)); font-size: max(calc(11px * var(--f)), calc(26 * var(--u))); max-width: calc(520 * var(--u)); white-space: normal; text-align: center; }
.gh-popup { position: absolute; transform: translate(-50%, -50%); font-size: max(calc(15px * var(--f)), calc(46 * var(--u))); animation: gg-rise 1.2s ease-out forwards; pointer-events: none; }
@keyframes gg-rise { 0% { opacity: 0; transform: translate(-50%, 0) scale(0.6); } 15% { opacity: 1; transform: translate(-50%, -30%) scale(1.1); } 100% { opacity: 0; transform: translate(-50%, -260%) scale(1); } }

/* ------------------------------------------------------------ loading/conn */
.gg-flash { position: fixed; inset: 0; background: #ffffff; z-index: 14; pointer-events: none; opacity: 0; }

/* -------------------------------------------------------------- touch mode */
/*
 * A PHONE ON ITS SIDE: the joystick owns the bottom-left and JUMP the
 * bottom-right, the portal the top-left corner. So the rails start under the
 * top-left fifth of the screen and stay compact, the cash sits beside the joystick, the
 * fertilizer chips wrap over the hotbar on the right, and the weather sits
 * left of the account chip with its card opening downward.
 */
body.aoe-touch-mode .gg-rail { top: max(22vh, calc(56px + env(safe-area-inset-top, 0px))); transform: none; gap: 3px; }
body.aoe-touch-mode .gg-tile { width: 46px; min-width: 46px; }
body.aoe-touch-mode .gg-tile__icon { width: 30px; height: 30px; min-width: 30px; min-height: 30px; }
body.aoe-touch-mode .gg-tile__emoji { font-size: 26px; }
body.aoe-touch-mode .gg-tile__label { font-size: 10px; margin-top: -2px; }
body.aoe-touch-mode .gg-cash { top: auto; bottom: max(8px, env(safe-area-inset-bottom, 0px)); left: calc(env(safe-area-inset-left, 0px) + 40px + var(--aoe-stick-radius, 64px) * 2); }
body.aoe-touch-mode .gg-cash__money { font-size: max(calc(18px * var(--f)), calc(52 * var(--u))); }
body.aoe-touch-mode .gg-hotbar { left: auto; right: calc(env(safe-area-inset-right, 0px) + var(--aoe-jump-size, 62px) + 36px); transform: none; }
body.aoe-touch-mode .gg-plantbar { left: auto; right: calc(env(safe-area-inset-right, 0px) + var(--aoe-jump-size, 62px) + 36px); transform: none; max-width: 50vw; flex-wrap: wrap; justify-content: flex-end; }
body.aoe-touch-mode .gg-chip { font-size: 11px; padding: 3px 10px; }
/* A short phone: the rails go two tiles wide so they end well above the joystick and JUMP. */
@media (max-height: 340px) {
  body.aoe-touch-mode .gg-rail { display: grid; grid-template-columns: repeat(2, 46px); gap: 3px; }
}
body.aoe-touch-mode .gg-weather { bottom: auto; top: max(4px, env(safe-area-inset-top, 0px)); right: calc(env(safe-area-inset-right, 0px) + 84px); }
body.aoe-touch-mode .gg-weather__card { bottom: auto; top: calc(100% + 6px); }
@media (max-height: 480px) {
  .gg-slot { width: calc(84 * var(--u)); height: calc(84 * var(--u)); }
  .gg-guide { top: max(calc(40px * var(--f)), calc(110 * var(--u))); }
}
`;
