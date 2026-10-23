/**
 * THE HUD'S DRAWN ICONS: chunky cartoon pictures with a thick dark outline,
 * the reference's style - the carrot on the Seeds button, the coins on Sell,
 * the produce crate (Shop), the notebook (Index), the gift, the quest scroll,
 * the backpack and the pointing hand-arrow. Inline SVG: sharp at any size,
 * nothing to download.
 */
const O = '#1b1410';

export const CARROT_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<g stroke="${O}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
<path d="M58 30 C70 14 78 10 90 8 C84 20 78 26 64 36Z" fill="#4cc43a"/>
<path d="M56 30 C58 14 62 6 70 2 C70 16 68 24 62 34Z" fill="#6ad84a"/>
<path d="M60 34 C72 30 82 32 94 38 C82 44 74 44 64 40Z" fill="#3aa82e"/>
<path d="M62 36 C68 44 66 52 56 62 L18 94 C12 98 6 92 10 86 L42 44 C50 34 56 30 62 36Z" fill="#ff8a1a"/>
<path d="M30 70 L38 74 M40 56 L48 60 M22 82 L28 85" stroke-width="4"/>
</g></svg>`;

export const COINS_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<g stroke="${O}" stroke-width="5">
<ellipse cx="58" cy="58" rx="36" ry="30" fill="#e8a818"/>
<ellipse cx="58" cy="52" rx="36" ry="30" fill="#ffd23a"/>
<ellipse cx="58" cy="52" rx="24" ry="19" fill="#ffe46a" stroke-width="4"/>
<ellipse cx="36" cy="44" rx="30" ry="26" fill="#e8a818"/>
<ellipse cx="36" cy="38" rx="30" ry="26" fill="#ffd23a"/>
</g>
<text x="36" y="50" font-family="Arial Black, sans-serif" font-size="34" text-anchor="middle" fill="#e8a818" stroke="${O}" stroke-width="2.5">$</text>
</svg>`;

export const CRATE_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<g stroke="${O}" stroke-width="5" stroke-linejoin="round">
<path d="M28 22 C34 6 52 6 58 20" fill="#6a2a8a"/>
<circle cx="46" cy="22" r="14" fill="#8a3ab8"/>
<circle cx="74" cy="24" r="16" fill="#ff3a3a"/>
<path d="M86 12 C96 6 104 12 100 22 C92 24 86 20 86 12Z" fill="#4cc43a"/>
<path d="M24 30 C18 18 28 10 36 18" fill="#6ad84a"/>
<rect x="14" y="34" width="92" height="74" rx="6" fill="#d8943a"/>
<rect x="14" y="34" width="92" height="16" rx="4" fill="#e8a84a"/>
<path d="M14 66 H106 M14 86 H106" stroke-width="4"/>
<path d="M30 50 V108 M90 50 V108" stroke-width="4"/>
</g>
<text x="60" y="88" font-family="Arial Black, sans-serif" font-size="34" text-anchor="middle" fill="#ffd23a" stroke="${O}" stroke-width="3">$</text>
</svg>`;

export const BOOK_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<g stroke="${O}" stroke-width="5" stroke-linejoin="round">
<rect x="26" y="8" width="80" height="104" rx="8" fill="#1f3a6a"/>
<rect x="32" y="14" width="68" height="92" rx="5" fill="#27497e"/>
<g fill="none" stroke-width="5">
<path d="M18 20 C12 20 12 30 26 30"/><path d="M18 38 C12 38 12 48 26 48"/><path d="M18 56 C12 56 12 66 26 66"/>
<path d="M18 74 C12 74 12 84 26 84"/><path d="M18 92 C12 92 12 102 26 102"/>
</g>
<path d="M66 56 C66 40 70 32 76 30 M66 56 C54 54 48 60 46 66 M66 56 C58 68 60 76 64 82 M66 56 C78 60 82 68 80 76 M66 56 C80 50 88 44 88 36" fill="none" stroke="#ff9a3a" stroke-width="9"/>
<circle cx="66" cy="56" r="8" fill="#ffd23a"/>
<path d="M66 64 V96" stroke="#3aa82e" stroke-width="6"/>
<path d="M66 84 C74 78 80 80 82 84 C76 90 70 88 66 84Z" fill="#4cc43a"/>
</g></svg>`;

export const GIFT_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<g stroke="${O}" stroke-width="5" stroke-linejoin="round">
<path d="M60 34 C44 12 26 18 32 30 C36 38 50 38 60 34Z" fill="#3a8ae0"/>
<path d="M60 34 C76 12 94 18 88 30 C84 38 70 38 60 34Z" fill="#3a8ae0"/>
<rect x="16" y="36" width="88" height="22" rx="4" fill="#4ab0ff"/>
<rect x="22" y="58" width="76" height="52" rx="4" fill="#ffb42a"/>
<rect x="52" y="36" width="16" height="74" fill="#3a8ae0"/>
</g></svg>`;

export const SCROLL_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<g stroke="${O}" stroke-width="5" stroke-linejoin="round">
<rect x="24" y="18" width="72" height="84" rx="4" fill="#f4dca8"/>
<rect x="16" y="10" width="88" height="16" rx="8" fill="#c8904a"/>
<rect x="16" y="96" width="88" height="16" rx="8" fill="#c8904a"/>
<path d="M36 42 H84 M36 56 H84 M36 70 H70" stroke-width="5"/>
<circle cx="80" cy="82" r="10" fill="#e0343a"/>
</g></svg>`;

export const BAG_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<g stroke="#ffffff" stroke-width="7" stroke-linejoin="round" fill="none">
<path d="M34 26 C34 12 66 12 66 26"/>
<rect x="20" y="26" width="60" height="62" rx="16"/>
<rect x="32" y="56" width="36" height="22" rx="6"/>
</g></svg>`;

export const ARROW_SVG = `<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
<path d="M96 30 L58 4 V18 H6 V42 H58 V56 Z" transform="translate(100 60) rotate(180)" fill="#ffffff" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
</svg>`;

export const UP_ARROW_SVG = `<svg viewBox="0 0 60 70" xmlns="http://www.w3.org/2000/svg">
<path d="M30 4 L56 36 H40 V66 H20 V36 H4 Z" fill="#ffffff" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
</svg>`;

export const WEATHER_EMOJI: Readonly<Record<string, string>> = {
  clear: '☀️',
  rain: '🌧️',
  snow: '❄️',
  heatwave: '🔥',
  storm: '⛈️',
  night: '🌙',
  meteor: '☄️',
};
