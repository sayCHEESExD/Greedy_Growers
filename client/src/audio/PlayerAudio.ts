import type { AudioManager } from './AudioManager.js';

const MIN_AUDIBLE_SPEED = 2.5;
const MAX_STEPS_PER_SECOND = 6;

export interface PlayerAudioInput {
  readonly horizontalSpeed: number;
  readonly isGrounded: boolean;
  readonly jumpedEdge: boolean;
  readonly landedEdge: boolean;
  /** Hip height: the stride length. */
  readonly hip: number;
}

/**
 * The local player's movement sounds: the supplied walking loop (or a soft
 * synthesised footfall per stride until it loads), the jump and the landing.
 */
export class PlayerAudio {
  private stride = 0;
  private sinceBeat = 0;

  constructor(private readonly audio: AudioManager) {}

  update(delta: number, player: PlayerAudioInput): void {
    const size = Math.max(0.5, player.hip);
    const pitch = Math.min(1.6, Math.max(0.45, 2.2 / size));
    if (player.jumpedEdge) this.audio.play('jump');
    if (player.landedEdge) this.audio.play('land', Math.min(1, 0.4 + size * 0.12), 0, pitch);

    this.sinceBeat += delta;
    // The supplied walking loop, when it has loaded; the synthesised footfall otherwise.
    const walking = player.isGrounded && player.horizontalSpeed >= MIN_AUDIBLE_SPEED;
    if (this.audio.setFootsteps(walking, Math.min(1, player.horizontalSpeed / 17))) return;
    if (!player.isGrounded || player.horizontalSpeed < MIN_AUDIBLE_SPEED) {
      this.stride = 0;
      return;
    }
    this.stride += player.horizontalSpeed * delta;
    // A stride is about one leg length.
    if (this.stride < size * 1.3) return;
    this.stride = 0;
    if (this.sinceBeat < 1 / MAX_STEPS_PER_SECOND) return;
    this.sinceBeat = 0;
    this.audio.play('step', Math.min(1, 0.25 + size * 0.1), 0, pitch);
  }
}
