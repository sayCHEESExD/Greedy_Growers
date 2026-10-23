import { CanvasTexture, DoubleSide, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { drawPortrait, portraitFor } from '../bloxity/Portraits.js';

const FONT = '"Grandstander", "Fredoka", "Baloo 2", "Segoe UI", system-ui, sans-serif';

export interface SignRow {
  readonly text: string;
  /** Relative height of the row. */
  readonly size?: number;
  readonly color?: string;
  /** A glyph drawn before the text: a coin, a thumb, an emoji. */
  readonly icon?: 'coin' | 'like' | string;
}

export interface SignContent {
  readonly rows: readonly SignRow[];
  /** A portrait (URL) in the top-right corner, like the garden sign's. */
  readonly portrait?: string;
  /** Dark "chalkboard" rows under the title (the garden sign's likes and worth). */
  readonly panels?: readonly SignRow[];
}

/**
 * A WOODEN SIGN, painted on a canvas: the garden's "Your Garden" board with
 * the owner's portrait, likes and worth; "Grow All"; "Expand Plot 100K";
 * "Buy House 250K". Redrawn only when what it says changes.
 */
export class WoodSign {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private signature = '';
  private content: SignContent | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
    pixelsPerUnit = 64,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * pixelsPerUnit);
    this.canvas.height = Math.round(height * pixelsPerUnit);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.texture.anisotropy = 4;
    this.material = new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide });
    this.mesh = new Mesh(new PlaneGeometry(width, height), this.material);
  }

  set(content: SignContent): void {
    const signature = JSON.stringify(content);
    if (signature === this.signature) return;
    this.signature = signature;
    this.content = content;
    this.draw();
  }

  private draw(): void {
    const content = this.content;
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !content) return;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);
    const pad = h * 0.06;
    // The board: warm planks with a dark rim.
    roundRect(ctx, pad * 0.3, pad * 0.3, w - pad * 0.6, h - pad * 0.6, h * 0.08);
    ctx.fillStyle = '#4a2c18';
    ctx.fill();
    roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, h * 0.06);
    const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
    grad.addColorStop(0, '#9a6238');
    grad.addColorStop(1, '#7a4a28');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 32, 14, 0.35)';
    ctx.lineWidth = Math.max(2, h * 0.012);
    const planks = 3;
    for (let i = 1; i < planks; i += 1) {
      const y = pad + ((h - pad * 2) * i) / planks;
      ctx.beginPath();
      ctx.moveTo(pad * 1.5, y);
      ctx.lineTo(w - pad * 1.5, y);
      ctx.stroke();
    }

    let portraitSize = 0;
    if (content.portrait) {
      const image = portraitFor(content.portrait, () => this.draw());
      portraitSize = h * 0.42;
      const cx = w - pad * 1.6 - portraitSize / 2;
      const cy = pad * 1.6 + portraitSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, portraitSize / 2 + h * 0.02, 0, Math.PI * 2);
      ctx.fillStyle = '#3a2010';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, portraitSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#e8e2d8';
      ctx.fill();
      if (image) drawPortrait(ctx, image, cx - portraitSize / 2, cy, portraitSize);
    }

    const panels = content.panels ?? [];
    const panelBand = panels.length > 0 ? (h - pad * 2) * 0.34 : 0;
    const rowsTop = pad * 1.4;
    const rowsHeight = h - pad * 2.8 - panelBand;
    const total = content.rows.reduce((sum, row) => sum + (row.size ?? 1), 0) || 1;
    let cursor = rowsTop;
    const textRight = portraitSize > 0 ? w - pad * 2.4 - portraitSize : w - pad * 2;
    for (const row of content.rows) {
      const band = ((row.size ?? 1) / total) * rowsHeight;
      const alignLeft = portraitSize > 0;
      drawRow(ctx, row, alignLeft ? pad * 2 : w / 2, cursor + band / 2, band * 0.78, textRight - pad * 2, alignLeft);
      cursor += band;
    }
    if (panels.length > 0) {
      const gap = pad * 0.8;
      const pw = (w - pad * 3 - gap * (panels.length - 1)) / panels.length;
      const py = h - pad * 1.5 - panelBand;
      panels.forEach((panel, i) => {
        const px = pad * 1.5 + i * (pw + gap);
        roundRect(ctx, px, py, pw, panelBand, panelBand * 0.2);
        ctx.fillStyle = 'rgba(40, 20, 8, 0.72)';
        ctx.fill();
        drawRow(ctx, panel, px + pw / 2, py + panelBand / 2, panelBand * 0.62, pw * 0.92, false);
      });
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.mesh.removeFromParent();
  }
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** A gold coin glyph. */
export const drawCoin = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void => {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#b8860b';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.06, r * 0.86, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd23a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.06, r * 0.56, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8a820';
  ctx.lineWidth = r * 0.14;
  ctx.stroke();
};

const drawRow = (ctx: CanvasRenderingContext2D, row: SignRow, x: number, y: number, size: number, room: number, left: boolean): void => {
  let fontSize = size;
  const iconSize = row.icon ? fontSize * 1.05 : 0;
  const measure = (): number => {
    ctx.font = `700 ${fontSize}px ${FONT}`;
    return ctx.measureText(row.text).width + (row.icon ? fontSize * 1.25 : 0);
  };
  for (let pass = 0; pass < 4 && measure() > room; pass += 1) fontSize *= room / measure();
  const total = measure();
  const start = left ? x : x - total / 2;
  if (row.icon) {
    const icx = start + (iconSize * fontSize) / size / 2;
    const r = (iconSize * fontSize) / size / 2;
    if (row.icon === 'coin') drawCoin(ctx, icx, y, r);
    else {
      ctx.font = `${r * 1.8}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.icon === 'like' ? '👍' : row.icon, icx, y + r * 0.1);
    }
  }
  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const tx = start + (row.icon ? fontSize * 1.25 : 0);
  ctx.lineWidth = fontSize * 0.16;
  ctx.strokeStyle = '#2a140a';
  ctx.strokeText(row.text, tx, y);
  ctx.fillStyle = row.color ?? '#ffffff';
  ctx.fillText(row.text, tx, y);
};
