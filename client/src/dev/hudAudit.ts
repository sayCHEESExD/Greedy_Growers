/**
 * DEV ONLY: `window.__hudAudit()` reports where every HUD group sits, which
 * of them overlap or leave the screen, and anything drawn in the top-left
 * corner (which the portal reserves). Never shipped: `main.ts` installs it
 * under `import.meta.env.DEV` only.
 */
const GROUPS: Readonly<Record<string, string>> = {
  top: '.gg-top',
  railL: '.gg-rail--left',
  railR: '.gg-rail--right',
  cash: '.gg-cash',
  hotbar: '.gg-hotbar',
  plantbar: '.gg-plantbar',
  weather: '.gg-weather',
  guide: '.gg-guide',
  skip: '.gg-skip',
  account: '.aoe-account',
  stick: '.aoe-touch__stick',
  jump: '.aoe-touch__jump',
  fps: '.aoe-fps',
};

interface Box {
  x: number;
  y: number;
  r: number;
  b: number;
}

const visible = (el: Element): boolean => {
  if (el.closest('[hidden]')) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width >= 1 && r.height >= 1;
};

export const hudAudit = (): string => {
  const W = innerWidth;
  const H = innerHeight;
  const rects: Record<string, Box> = {};
  for (const [key, selector] of Object.entries(GROUPS)) {
    const el = document.querySelector(selector);
    if (!el || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    rects[key] = { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
  }
  const topLeft = new Set<string>();
  document.querySelectorAll('.gg-hud *, .aoe-account, .aoe-account *, .aoe-fps, .aoe-touch *').forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.left < W * 0.18 && r.top < H * 0.2) topLeft.add(String(el.className || el.tagName).slice(0, 40));
  });
  const overlaps: string[] = [];
  const keys = Object.keys(rects);
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = rects[keys[i]!]!;
      const b = rects[keys[j]!]!;
      if (a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b) overlaps.push(`${keys[i]}/${keys[j]}`);
    }
  }
  const off = keys.filter((k) => {
    const r = rects[k]!;
    return r.x < 0 || r.y < 0 || r.r > W || r.b > H;
  });
  const root = getComputedStyle(document.documentElement);
  return JSON.stringify({
    size: `${W}x${H}`,
    touch: document.body.classList.contains('aoe-touch-mode'),
    f: root.getPropertyValue('--f').trim(),
    topLeft: [...topLeft],
    overlaps,
    off,
    rects,
  });
};

export const install = (): void => {
  (window as Window & { __hudAudit?: () => string }).__hudAudit = hudAudit;
};
