import { Vector3, type PerspectiveCamera } from 'three';
import { el } from './Modal.js';
import { injectGameStyles } from './styles.js';

export interface LabelLine {
  readonly text: string;
  readonly className: string;
  readonly color?: string;
}

export interface PromptSpec {
  readonly key: string;
  readonly object: string;
  readonly action: string;
  readonly activate: () => void;
}

const V = new Vector3();

/**
 * INTERFACE IN THE WORLD, drawn as HTML over the canvas: the status over a
 * nearby plant ("Carrot / Harvestable / Unripe (1.0x)"), the proximity prompt
 * ("[E] Harvest"), a keeper's line over their head, and the little "+$30"
 * pops. Nodes are pooled per id and only moved each frame, so nothing is
 * created or destroyed while the player walks about.
 */
export class WorldOverlay {
  private readonly root: HTMLDivElement;
  private readonly labels = new Map<string, { node: HTMLDivElement; signature: string; used: boolean }>();
  private readonly prompt: HTMLDivElement;
  private readonly promptKey: HTMLSpanElement;
  private readonly promptObject: HTMLSpanElement;
  private readonly promptAction: HTMLSpanElement;
  private promptActivate: (() => void) | null = null;
  private promptUsed = false;
  private readonly bubbles = new Map<string, { node: HTMLDivElement; until: number; x: number; y: number; z: number }>();
  private camera: PerspectiveCamera | null = null;
  private width = 1;
  private height = 1;

  constructor(container: HTMLElement) {
    injectGameStyles();
    this.root = el('div', 'gh-world gh-font');
    container.appendChild(this.root);
    this.prompt = el('div', 'gh-prompt');
    this.promptKey = el('span', 'gh-prompt__key', 'E');
    const text = el('div', 'gh-prompt__text');
    this.promptObject = el('span', 'gh-prompt__object gh-outline-thin');
    this.promptAction = el('span', 'gh-prompt__action gh-outline');
    text.append(this.promptObject, this.promptAction);
    this.prompt.append(this.promptKey, text);
    this.prompt.hidden = true;
    this.prompt.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.promptActivate?.();
    });
    this.root.appendChild(this.prompt);
  }

  /** Start a frame: remember the camera, mark every label unused. */
  begin(camera: PerspectiveCamera, width: number, height: number): void {
    this.camera = camera;
    this.width = width;
    this.height = height;
    for (const label of this.labels.values()) label.used = false;
    this.promptUsed = false;
  }

  /** Screen position of a world point, or null when it is behind the camera or off screen. */
  project(x: number, y: number, z: number): { x: number; y: number; depth: number } | null {
    const camera = this.camera;
    if (!camera) return null;
    V.set(x, y, z).project(camera);
    if (V.z > 1 || V.z < -1) return null;
    const sx = (V.x * 0.5 + 0.5) * this.width;
    const sy = (-V.y * 0.5 + 0.5) * this.height;
    if (sx < -80 || sy < -80 || sx > this.width + 80 || sy > this.height + 80) return null;
    return { x: sx, y: sy, depth: V.z };
  }

  label(id: string, x: number, y: number, z: number, lines: readonly LabelLine[], scale = 1): void {
    const at = this.project(x, y, z);
    if (!at) return;
    let label = this.labels.get(id);
    if (!label) {
      label = { node: el('div', 'gh-label'), signature: '', used: true };
      this.root.appendChild(label.node);
      this.labels.set(id, label);
    }
    label.used = true;
    const signature = lines.map((line) => `${line.className}|${line.text}|${line.color ?? ''}`).join('\n');
    if (signature !== label.signature) {
      label.signature = signature;
      label.node.replaceChildren(
        ...lines.map((line) => {
          const node = el('div', `${line.className} gh-outline-thin`, line.text);
          if (line.color) node.style.color = line.color;
          return node;
        }),
      );
    }
    label.node.hidden = false;
    label.node.style.left = `${at.x}px`;
    label.node.style.top = `${at.y}px`;
    const s = Math.round(scale * 100) / 100;
    if (label.node.dataset['s'] !== String(s)) {
      label.node.dataset['s'] = String(s);
      label.node.style.transform = `translate(-50%, -100%) scale(${s})`;
    }
    label.node.style.zIndex = String(Math.round((1 - at.depth) * 10000));
  }

  /** The one proximity prompt this frame (the nearest thing to do). */
  setPrompt(spec: PromptSpec, x: number, y: number, z: number, touch: boolean): void {
    const at = this.project(x, y, z);
    if (!at) return;
    this.promptUsed = true;
    this.promptActivate = spec.activate;
    const key = touch ? '👆' : spec.key;
    if (this.promptKey.textContent !== key) this.promptKey.textContent = key;
    if (this.promptObject.textContent !== spec.object) this.promptObject.textContent = spec.object;
    if (this.promptAction.textContent !== spec.action) this.promptAction.textContent = spec.action;
    this.prompt.hidden = false;
    this.prompt.style.left = `${at.x}px`;
    this.prompt.style.top = `${at.y}px`;
  }

  /** Press the current prompt (the E key). True if there was one. */
  activatePrompt(): boolean {
    if (!this.promptUsed || !this.promptActivate) return false;
    this.promptActivate();
    return true;
  }

  get hasPrompt(): boolean {
    return this.promptUsed;
  }

  /** A line of speech over someone's head for a few seconds. */
  say(id: string, text: string, x: number, y: number, z: number, seconds = 4): void {
    let bubble = this.bubbles.get(id);
    if (!bubble) {
      bubble = { node: el('div', 'gh-bubble gh-outline-thin'), until: 0, x, y, z };
      this.root.appendChild(bubble.node);
      this.bubbles.set(id, bubble);
    }
    bubble.node.textContent = text;
    bubble.until = performance.now() + seconds * 1000;
    bubble.x = x;
    bubble.y = y;
    bubble.z = z;
  }

  /** Take a line of speech down at once (the conversation it belonged to ended). */
  hush(id: string): void {
    const bubble = this.bubbles.get(id);
    if (!bubble) return;
    bubble.node.remove();
    this.bubbles.delete(id);
  }

  /** A little rising "+$30" at a world point (or at a screen point). */
  pop(text: string, kind: 'gold' | 'green', world: { x: number; y: number; z: number } | null, screen?: { x: number; y: number }): void {
    const at = world ? this.project(world.x, world.y, world.z) : screen ?? null;
    if (!at) return;
    const node = el('div', `gh-popup gh-popup--${kind} gh-outline`, text);
    node.style.color = kind === 'gold' ? '#ffe066' : '#9dff7a';
    node.style.left = `${at.x}px`;
    node.style.top = `${at.y}px`;
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 1250);
  }

  /** Finish a frame: hide what was not drawn, move the bubbles. */
  end(): void {
    for (const label of this.labels.values()) if (!label.used) label.node.hidden = true;
    if (!this.promptUsed) {
      this.prompt.hidden = true;
      this.promptActivate = null;
    }
    const now = performance.now();
    for (const [id, bubble] of this.bubbles) {
      if (now > bubble.until) {
        bubble.node.remove();
        this.bubbles.delete(id);
        continue;
      }
      const at = this.project(bubble.x, bubble.y, bubble.z);
      bubble.node.hidden = !at;
      if (at) {
        bubble.node.style.left = `${at.x}px`;
        bubble.node.style.top = `${at.y}px`;
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
