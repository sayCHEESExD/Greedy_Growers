/**
 * Number formatting shared by the HUD, the world labels and the boards, so a
 * figure reads the same everywhere it appears. Greedy Growers' money runs
 * from $5 Oak Trees to septillions, so the suffixes go a long way.
 */

const SUFFIXES: readonly (readonly [number, string])[] = [
  [1e33, 'Dc'],
  [1e30, 'No'],
  [1e27, 'Oc'],
  [1e24, 'Sp'],
  [1e21, 'Sx'],
  [1e18, 'Qi'],
  [1e15, 'Qa'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** Truncate to `places` decimals (never round up a figure the player does not have) and drop trailing zeros. */
const trim = (value: number, places: number): string => {
  const factor = 10 ** places;
  const cut = Math.floor(value * factor + 1e-9) / factor;
  return cut.toFixed(places).replace(/\.?0+$/, '');
};

/** Compact display as the original prints it: 940, 10K, 2.5M, 41.62M, 1.75Qi. */
export const formatAmount = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  for (const [divisor, suffix] of SUFFIXES) {
    if (amount >= divisor) return `${trim(amount / divisor, 2)}${suffix}`;
  }
  return Math.floor(amount).toString();
};

/** Money with its dollar sign: "$10", "$41.62M". FREE is the caller's business. */
export const formatMoney = (value: number): string => `$${formatAmount(value)}`;

/** A seed's river price: "FREE" for the Oak. */
export const formatPrice = (value: number): string => (value <= 0 ? 'FREE' : formatMoney(value));

/** A growth multiplier as the tree labels print it: "0.43x", "3.97x", "107.87x". */
export const formatMult = (value: number): string => `${(Math.floor(Math.max(0, value) * 100) / 100).toFixed(2)}x`;

/** A multiplier bonus: x1.5, x25. */
export const formatMultiplier = (value: number): string => `x${trim(value, 2)}`;

/** Every digit, with commas. */
export const formatFull = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return amount < 1e21 ? amount.toLocaleString('en-US') : formatAmount(amount);
};

/** A countdown: "4:29", "1:02:03". */
export const formatTimer = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

/** A percentage: 45%, 4.5%, 0.5%. */
export const formatPercent = (value: number): string => `${trim(value, 2)}%`;
