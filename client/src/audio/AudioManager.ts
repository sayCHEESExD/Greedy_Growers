import alarmUrl from '../../../assets/audio/alarm.mp3?url';
import musicUrl from '../../../assets/audio/Background.mp3?url';
import cheerUrl from '../../../assets/audio/crowd-cheer.mp3?url';
import rumbleUrl from '../../../assets/audio/earth-rumble.mp3?url';
import fallUrl from '../../../assets/audio/fall.mp3?url';
import jumpUrl from '../../../assets/audio/jump.mp3?url';
import lightningUrl from '../../../assets/audio/Lightning.mp3?url';
import tornadoUrl from '../../../assets/audio/tornado.mp3?url';
import walkUrl from '../../../assets/audio/walk.mp3?url';
import winUrl from '../../../assets/audio/win.mp3?url';
import { logger } from '../util/logger.js';

const SCOPE = 'audio';

/** Master volumes per category. Music sits well under the gameplay sounds. */
const MUSIC_GAIN = 0.22;
const SFX_GAIN = 0.34;

/**
 * THE WALK HAS ITS OWN BUS, and that is the whole reason it can be heard.
 *
 * `SFX_GAIN` is deliberately low because it holds down a CROWD: a dozen
 * one-shot blips, thuds and arpeggios that may all fire at once, and the
 * ceiling that keeps them from piling into distortion is the same ceiling that
 * kept the one continuous sound in the game at a whisper. The footfalls are not
 * blips - they are the animal the player is riding, sounding for as long as
 * they are moving - so they are mixed on their own and answer to nothing but this.
 *
 * Raising `SFX_GAIN` instead would have shouted every menu click in the game.
 */
const WALK_GAIN = 0.9;

/*
 * TWO SUPPLIED FILES, and everything else synthesised.
 *
 * The asset set for this game ships a background track and a jump. They are
 * used as they are; everything else - the pluck of a harvest, the chime of
 * coins at the Sell Stand, a splash of water, the bell, the thunder - is built
 * from oscillators, noise and envelopes, which costs bytes measured in
 * hundreds against a 12 MB budget.
 *
 * The TRACK is streamed through an `<audio>` element rather than decoded into
 * a buffer: `decodeAudioData` would hold a two-minute stereo file as tens of
 * megabytes of uncompressed samples for something only ever played end to end.
 * It still routes through `musicBus`, which is what keeps the portal's
 * `music_volume`, the master volume and mute all working on it untouched.
 *
 * Check `npm run size:client` after changing either.
 *
 * THEY ARE IMPORTED, NOT FETCHED BY PATH. Vite emits each under a
 * content-hashed name in `assets/`, so a replaced sound gets a new URL (never
 * a stale cached copy) and a missing one fails the build instead of going
 * quietly silent. Their names carry no spaces: the game host answers a
 * percent-encoded space with 400 Bad Request, which is how the music and a
 * sound once vanished from production while working locally.
 */

/** The supplied background track (`assets/audio/Background.mp3`). Streamed, never decoded. */
const MUSIC_URL = musicUrl;

/** The supplied one-shots, by the sound they stand in for. */
const SAMPLE_URLS: Partial<Record<SoundName, string>> = {
  jump: jumpUrl,
  step: walkUrl,
  thunder: lightningUrl,
  cheer: cheerUrl,
  rumble: rumbleUrl,
  wind: tornadoUrl,
  alarm: alarmUrl,
  win: winUrl,
  fall: fallUrl,
};

/** Sounds that may overlap themselves: a Harvest Bell picks many crops at once. */
const LAYERED: ReadonlySet<SoundName> = new Set<SoundName>(['harvest']);

/**
 * Most one-shot voices allowed to sound at once.
 *
 * A ceiling rather than a hope. Web Audio nodes are one-shot by design - a
 * source cannot be replayed, so every sound is a new node - and the thing that
 * has to be bounded is therefore how many are alive at any moment, not how
 * many are ever made. Beyond this, a request is dropped rather than queued:
 * the twelfth simultaneous footfall is inaudible anyway.
 */
const MAX_VOICES = 12;

/** Keep a slider inside 0..1 whatever the portal sent. */
const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;

/** Seconds a given sound refuses to retrigger, so nothing can machine-gun. */
const COOLDOWNS: Readonly<Record<SoundName, number>> = {
  jump: 0.15,
  land: 0.14,
  step: 0.1,
  buy: 0.12,
  refuse: 0.3,
  drop: 0.15,
  claim: 0.3,
  unlock: 0.3,
  win: 0.4,
  plant: 0.08,
  harvest: 0.05,
  sell: 0.2,
  water: 0.15,
  dig: 0.12,
  bell: 0.5,
  pop: 0.05,
  click: 0.04,
  like: 0.3,
  thunder: 0.8,
  sparkle: 0.2,
  open: 0.1,
  cheer: 2,
  rumble: 3,
  wind: 3,
  alarm: 2,
  fall: 0.5,
};

export type SoundName =
  | 'jump'
  | 'land'
  | 'step'
  | 'buy'
  | 'refuse'
  | 'drop'
  | 'claim'
  | 'unlock'
  | 'win'
  | 'plant'
  | 'harvest'
  | 'sell'
  | 'water'
  | 'dig'
  | 'bell'
  | 'pop'
  | 'click'
  | 'like'
  | 'thunder'
  | 'cheer'
  | 'rumble'
  | 'wind'
  | 'alarm'
  | 'fall'
  | 'sparkle'
  | 'open';

/**
 * Every sound in the game, synthesised.
 *
 * EVERY sound is synthesised - oscillators and envelopes cost bytes measured
 * in the hundreds, and a pack of wavs is the easiest way to spend the 12 MB
 * budget. There is no music and there are no samples: this build ships not one
 * audio file.
 *
 * THREE rules hold the whole thing together:
 *
 *  - ONE context, ONE music voice. The `started` flag and the single
 *    `startMusic` call are what make a doubled track impossible rather than
 *    merely unlikely.
 *  - ONE-SHOTS ARE BOUNDED, twice: a per-sound cooldown stops the same effect
 *    retriggering every frame, and a hard voice ceiling stops the mix from
 *    ever containing more than a dozen of them.
 *  - ONLY THE LOCAL PLAYER makes noise. A busy room would otherwise put the
 *    footfalls, the leaps and the deaths of every other pilot into a mix the
 *    player is trying to hear their own machine in.
 *
 * Nothing here starts until the player's first gesture: browsers refuse to run
 * an AudioContext before one, and a context created earlier merely sits
 * suspended and confuses everything downstream.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  /** The walking loop's own bus. See `WALK_GAIN`. */
  private walkBus: GainNode | null = null;
  /** The safety limiter every bus passes through. See `resume`. */
  private limiter: DynamicsCompressorNode | null = null;

  /** Live one-shot voices, so the ceiling can be enforced. */
  private voices = 0;
  /** Wall-clock of the last play, per sound. */
  private readonly lastPlayed = new Map<SoundName, number>();

  /**
   * The music, as a streaming element rather than a decoded buffer.
   *
   * `decodeAudioData` would hold the whole track in memory uncompressed - a
   * three-minute stereo file is over thirty megabytes once decoded, for
   * something that is only ever played start to finish. An element streams it,
   * loops it natively, and still routes through Web Audio, which is what keeps
   * the portal's music slider and the mute working.
   */
  private musicElement: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  /**
   * The track, downloaded ONCE into memory (still compressed, ~3 MB) and
   * played from an object URL. A streamed element keeps a network request open
   * for the whole session and re-requests the file at every loop point; one
   * dropped request errors the element, and an errored element never plays
   * again - which is how the music used to vanish partway through a session.
   */
  private musicBlobUrl: string | null = null;
  private musicFetch: Promise<void> | null = null;
  /** The music watchdog's timer, and when the track last visibly advanced. */
  private musicTimer: number | null = null;
  private musicLastTime = -1;
  private musicStuckSince = 0;
  private musicRebuiltAt = -Infinity;

  /**
   * Decoded one-shot samples, by name.
   *
   * A sound is only in here once it has actually decoded, which is what makes
   * the fallback in `play` a simple lookup: until then - and for ever, if the
   * file is missing or the fetch is blocked - the synthesised voice is used
   * instead, so a blocked asset is a different sound rather than silence.
   */
  private readonly samples = new Map<SoundName, AudioBuffer>();
  /** Set once the fetches have been kicked off, so they happen exactly once. */
  private samplesRequested = false;

  /**
   * The sampled sound currently playing, per name. At most ONE each.
   *
   * The cooldowns were tuned against the synthesised voices, every one of which
   * was SHORTER than its own cooldown - the death lasted 0.5s behind a 0.6s
   * cooldown - so a one-shot could never catch its own tail. The recorded files
   * are far longer (both about 1.8s), which quietly breaks that: two deaths
   * 0.7s apart would clear the cooldown and sound on top of each other, and
   * jumps would stack until they hit the voice ceiling.
   *
   * So a sampled sound REPLACES itself rather than layering. The trigger and
   * the gain are untouched - every jump still plays the jump - it simply
   * restarts instead of doubling, which is what keeps "no overlapping deaths"
   * true now that the sound outlasts its cooldown.
   */
  private readonly activeSamples = new Map<SoundName, AudioBufferSourceNode>();

  /**
   * THE WALKING LOOP, and it is a loop rather than a one-shot per stride.
   *
   * The supplied `robot steps.mp3` is nearly three seconds of a mech WALKING -
   * several footfalls, not one - so firing it on every stride would restart it
   * before it had played its first step and the mech would sound like it was
   * stuttering on one foot. Looped instead, with its playback rate tied to the
   * pace, it is what it was recorded as: the sound of the machine walking, for
   * as long as the machine is walking.
   *
   * It is deliberately NOT counted against `voices`. That ceiling exists to
   * bound how many one-shots can pile up; this is one node whose lifetime is
   * "while the player is moving", and letting it be dropped by a busy moment
   * would silence the feet for the rest of the walk.
   */
  private footsteps: AudioBufferSourceNode | null = null;
  private footstepGain: GainNode | null = null;

  private muted = false;
  private started = false;

  /** The portal's master and music sliders, 0..1. Both default to full. */
  private masterLevel = 1;
  private musicLevel = 1;

  constructor() {
    // The track downloads while the game loads (no gesture needed to fetch), so it is
    // usually already in memory by the first click that starts the audio.
    this.fetchMusic();
  }

  /**
   * Bring the audio up, on a real user gesture.
   *
   * Safe to call repeatedly - it is wired to every gesture precisely because
   * no single one of them is guaranteed to be the one the browser accepts.
   */
  resume(): void {
    if (this.muted) return;
    if (!this.context) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
      } catch (error) {
        logger.warn(SCOPE, `no audio context: ${String(error)}`);
        return;
      }

      this.master = this.context.createGain();
      // Built at the level the portal has ALREADY set: settings arrive before
      // the first user gesture, so a context created at full volume would be
      // loud for exactly as long as it took the next slider change to arrive.
      this.master.gain.value = this.muted ? 0 : this.masterLevel;

      /*
       * A SAFETY LIMITER, and it is what buys the mix its headroom.
       *
       * Web Audio's destination HARD CLIPS at plus or minus one. Without
       * something at the end of the chain, every level in this file has to be
       * chosen so that the loudest possible sum of music, walk and a dozen
       * one-shots still lands under that - which is why everything was pinned
       * so low that the mech could not be heard walking. This catches the
       * coincidences instead, so each sound can be set at the level it should
       * be rather than at the level the worst case allows.
       *
       * It sits AFTER the master gain, so mute and the portal's volume slider
       * work exactly as they did: at zero, nothing reaches it at all.
       *
       * Conservative on purpose, and the threshold is CHOSEN rather than
       * guessed: with the portal's sliders at maximum the music track peaks at
       * about -5 dBFS on its own, so a threshold below that would have the
       * limiter riding the soundtrack all the time. At -3 it is untouched by
       * any single source and only ever catches a sum.
       */
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 4;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      this.master.connect(this.limiter);
      this.limiter.connect(this.context.destination);

      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = MUSIC_GAIN * this.musicLevel;
      this.musicBus.connect(this.master);

      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = SFX_GAIN;
      this.sfxBus.connect(this.master);

      this.walkBus = this.context.createGain();
      this.walkBus.gain.value = WALK_GAIN;
      this.walkBus.connect(this.master);
    }

    void this.context.resume().catch(() => undefined);

    if (!this.started) {
      this.started = true;
      this.startMusic();
      this.loadSamples();
      logger.info(SCOPE, 'audio started');
    }

    // Every gesture is also a chance to bring the music back if anything stopped it.
    this.ensureMusic();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Silence everything, or bring it back. The music keeps its own time. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    // The loop is the one voice that would otherwise keep running: master gain
    // silences it, but a muted game should not be holding a source open.
    if (muted) this.stopFootsteps();
    this.applyMaster();
  }

  /**
   * The portal's master volume, 0..1.
   *
   * Kept SEPARATE from mute rather than folded into it: they are two different
   * statements - "I set this to 30%" and "silence, now" - and a mute that
   * overwrote the level would hand back the wrong one when it lifted. The
   * master gain is the product of the two, so unmuting restores whatever the
   * slider said.
   */
  setMasterVolume(level: number): void {
    this.masterLevel = clamp01(level);
    this.applyMaster();
  }

  /** The portal's music volume, 0..1, against the game's own tuned mix. */
  setMusicVolume(level: number): void {
    this.musicLevel = clamp01(level);
    if (this.musicBus && this.context) {
      this.musicBus.gain.setTargetAtTime(
        MUSIC_GAIN * this.musicLevel,
        this.context.currentTime,
        0.05,
      );
    }
  }

  private applyMaster(): void {
    if (this.master && this.context) {
      const target = this.muted ? 0 : this.masterLevel;
      this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.05);
    }

    // A muted stream is PAUSED, not merely silenced. Leaving it running would
    // keep decoding a file nobody can hear, and on a phone that is battery
    // spent on nothing.
    if (this.muted) this.musicElement?.pause();
    else this.ensureMusic();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Play a one-shot.
   *
   * Refused if the same sound played within its cooldown, or if the voice
   * ceiling is already reached. Both refusals are silent: a sound that cannot
   * be heard is not an error.
   */
  /**
   * Drive the walking loop.
   *
   * @param active true while the mech is on the ground and actually moving
   * @param pace   0..1, how fast it is going as a fraction of its own top
   * @returns false when there is no recording to play, so the caller can fall
   *          back to the synthesised per-stride footfall instead
   *
   * Called every frame. Starting, stopping and re-rating are all idempotent,
   * because the caller has no business tracking which of those it did last.
   */
  setFootsteps(active: boolean, pace: number): boolean {
    const ctx = this.context;
    // ITS OWN BUS, not the one-shot bus. See `WALK_GAIN`.
    const bus = this.walkBus;
    const buffer = this.samples.get('step');
    if (!ctx || !bus || !buffer) {
      this.stopFootsteps();
      return false;
    }
    if (!active || this.muted || ctx.state !== 'running') {
      this.stopFootsteps();
      return true;
    }

    if (!this.footsteps || !this.footstepGain) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const envelope = ctx.createGain();
      // From silence, so setting off never begins with a click.
      envelope.gain.value = 0;
      source.connect(envelope);
      envelope.connect(bus);
      source.start();
      this.footsteps = source;
      this.footstepGain = envelope;
    }

    /*
     * Pace changes the RATE, within a band a recording can be stretched over
     * without sounding like a different machine.
     *
     * The same reasoning as the animation's cadence clamp: a late-game mech
     * covers four hundred units a second and an unclamped cadence is a tone
     * rather than a walk. The sense of speed comes from the world going past.
     */
    const level = clamp01(pace);
    const now = ctx.currentTime;
    // Under 1 across the whole band: the recording's own cadence is quicker
    // than this mech's, and the gait it has to agree with is a slow one.
    this.footsteps.playbackRate.setTargetAtTime(0.85 + level * 0.3, now, 0.08);
    /*
     * LOUD ENOUGH TO BE THE MACHINE YOU ARE RIDING.
     *
     * The arithmetic is the reason rather than taste. The walk recording and
     * the music track are within half a decibel of each other (-12.3 dBFS RMS
     * against -11.9), so whatever each is multiplied by IS the balance between
     * them - and the music reaches the master at MUSIC_GAIN, 0.22. A walk that
     * only matches that figure does not read as loud: the music is broadband
     * and the walk is mostly low end, so at equal level the track MASKS it.
     * It has to sit clearly ABOVE the music to be heard as what it is.
     *
     * The band is narrow on purpose. A mech walking slowly is still a mech
     * walking; this is not a fade, it is the difference between a stroll and a
     * full stride.
     */
    this.footstepGain.gain.setTargetAtTime(0.72 + level * 0.28, now, 0.05);
    return true;
  }

  /** Stop the walking loop, fading out so it does not click. */
  private stopFootsteps(): void {
    const source = this.footsteps;
    const envelope = this.footstepGain;
    this.footsteps = null;
    this.footstepGain = null;
    if (!source) return;
    const ctx = this.context;
    if (envelope && ctx) {
      const now = ctx.currentTime;
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setValueAtTime(envelope.gain.value, now);
      envelope.gain.linearRampToValueAtTime(0, now + 0.06);
      try {
        source.stop(now + 0.08);
      } catch {
        // Already stopped; nothing to do.
      }
      return;
    }
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
  }

  /**
   * Play a one-shot. `delay` (seconds) schedules it on the audio clock, so a
   * sound can land exactly on an animation's impact frame.
   */
  play(name: SoundName, intensity = 1, delay = 0, pitch = 1): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted || ctx.state !== 'running') return;

    const called = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (called - last < COOLDOWNS[name]) return;
    if (this.voices >= MAX_VOICES) return;
    this.lastPlayed.set(name, called);
    const now = called + Math.max(0, delay);

    const level = Math.min(Math.max(intensity, 0), 1);
    switch (name) {
      case 'jump':
        if (this.playSample('jump', now, 0.5)) break;
        this.blip(now, 'sine', 300, 700, 0.12, 0.25);
        break;
      case 'land':
        this.thud(now, 0.25 + level * 0.25);
        break;
      case 'step':
        this.thud(now, 0.06 + level * 0.2, 110 + 60 * Math.min(1.6, pitch));
        break;
      case 'drop':
        this.arpeggio(now, [12, 16, 19], 0.05, 'triangle', 0.3);
        break;
      case 'refuse':
        this.blip(now, 'square', 220, 150, 0.16, 0.22);
        break;
      case 'win':
        if (this.playSample('win', now, 0.55)) break;
        this.arpeggio(now, [0, 4, 7, 12], 0.09, 'triangle', 0.5);
        break;
      case 'claim':
        this.arpeggio(now, [0, 5, 9, 12], 0.07, 'triangle', 0.42);
        break;
      case 'unlock':
        this.arpeggio(now, [0, 4, 7, 12, 16], 0.06, 'triangle', 0.4);
        break;
      case 'buy':
        this.arpeggio(now, [7, 12], 0.05, 'square', 0.22);
        this.blip(now + 0.1, 'triangle', 1800, 2400, 0.08, 0.12);
        break;
      case 'plant':
        // A soft dig into soil and a little pop.
        this.noise(now, 0.08, 0.16 * level, 600);
        this.blip(now + 0.05, 'sine', 420 * pitch, 640 * pitch, 0.09, 0.18);
        break;
      case 'harvest':
        // A bright pluck, pitched by how big the crop is.
        this.blip(now, 'triangle', 660 * pitch, 990 * pitch, 0.1, 0.3 * (0.6 + 0.4 * level));
        this.blip(now + 0.06, 'sine', 1320 * pitch, 1480 * pitch, 0.12, 0.14);
        break;
      case 'sell':
        // Coins: a run of little metallic chimes.
        for (let i = 0; i < 5; i += 1) this.blip(now + i * 0.05, 'triangle', 1900 + i * 180, 2100 + i * 200, 0.07, 0.12);
        this.arpeggio(now + 0.22, [0, 4, 7], 0.05, 'square', 0.18);
        break;
      case 'water':
        // A splash: filtered noise washing down.
        this.sweep(now, 0.35, 0.22 * level, 2400, 700, 1.1);
        this.noise(now + 0.05, 0.25, 0.08, 3200);
        break;
      case 'dig':
        this.noise(now, 0.1, 0.24 * level, 380);
        this.thud(now, 0.3, 110);
        break;
      case 'bell':
        // A ringing bell: two sine partials with long tails.
        this.blip(now, 'sine', 880, 876, 1.2, 0.3);
        this.blip(now, 'sine', 2210, 2200, 0.9, 0.12);
        this.blip(now + 0.35, 'sine', 880, 876, 1.1, 0.24);
        break;
      case 'pop':
        this.blip(now, 'sine', 500 * pitch, 900 * pitch, 0.06, 0.2);
        break;
      case 'click':
        this.blip(now, 'square', 1200, 900, 0.03, 0.08);
        break;
      case 'like':
        this.arpeggio(now, [0, 7, 12, 19], 0.06, 'sine', 0.3);
        break;
      case 'thunder':
        if (this.playSample('thunder', now, 0.75 * Math.max(0.35, level))) break;
        this.noise(now, 1.4, 0.35 * level, 180);
        this.thud(now, 0.6, 60);
        this.blip(now, 'sawtooth', 90, 40, 0.8, 0.12);
        break;
      case 'sparkle':
        this.arpeggio(now, [12, 19, 24, 28], 0.04, 'sine', 0.2);
        break;
      case 'open':
        this.blip(now, 'triangle', 520, 780, 0.08, 0.14);
        break;
      case 'cheer':
        if (!this.playSample('cheer', now, 0.5)) this.arpeggio(now, [0, 4, 7, 12, 16, 19], 0.07, 'triangle', 0.4);
        break;
      case 'rumble':
        if (!this.playSample('rumble', now, 0.45)) this.noise(now, 1.6, 0.25, 120);
        break;
      case 'wind':
        if (!this.playSample('wind', now, 0.3)) this.sweep(now, 2, 0.15, 800, 300, 0.8);
        break;
      case 'alarm':
        if (!this.playSample('alarm', now, 0.4)) this.arpeggio(now, [0, 12, 0, 12], 0.15, 'square', 0.2);
        break;
      case 'fall':
        if (!this.playSample('fall', now, 0.5)) this.blip(now, 'sine', 600, 200, 0.4, 0.2);
        break;
    }
  }

  dispose(): void {
    this.stopMusicWatch();
    this.teardownMusic();
    if (this.musicBlobUrl) URL.revokeObjectURL(this.musicBlobUrl);
    this.musicBlobUrl = null;
    this.musicFetch = null;
    this.samples.clear();
    this.activeSamples.clear();
    this.samplesRequested = false;
    this.started = false;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.stopFootsteps();
    this.sfxBus = null;
    this.walkBus = null;
    this.limiter = null;
  }

  // -------------------------------------------------------------- the music

  /**
   * Start the background track: ONCE per session, from behind the `started`
   * flag, and from then on the watchdog keeps it playing. A failure here is
   * silent on purpose: a blocked or missing track is a game without music, not
   * a game that stops.
   */
  private startMusic(): void {
    this.fetchMusic();
    this.buildMusic(0);
    this.startMusicWatch();
  }

  /** Download the track into memory once; later (re)builds play from it. */
  private fetchMusic(): void {
    if (this.musicFetch) return;
    this.musicFetch = fetch(MUSIC_URL)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || this.musicBlobUrl) return;
        this.musicBlobUrl = URL.createObjectURL(blob);
        // Still streaming from the network? Move over to memory at the same spot.
        if (this.musicElement && this.musicElement.src !== this.musicBlobUrl) this.rebuildMusic('now in memory', true);
      })
      .catch(() => {
        // The stream stays in use, and the next rebuild tries the download again.
        this.musicFetch = null;
      });
  }

  /**
   * THE ONE MUSIC ELEMENT, built and wired to the music bus. There is never
   * more than one: whatever was there before is torn down first.
   */
  private buildMusic(at: number): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    this.teardownMusic();

    const element = new Audio(this.musicBlobUrl ?? MUSIC_URL);
    element.loop = true;
    // Same-origin, but stated anyway: without it the element is tainted and
    // `createMediaElementSource` produces silence rather than an error.
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';
    if (at > 0) {
      const seek = (): void => {
        if (Number.isFinite(element.duration) && element.duration > 0) element.currentTime = at % element.duration;
      };
      element.addEventListener('loadedmetadata', seek, { once: true });
    }
    // Anything that stops the track without being asked to sends it straight to the watchdog.
    element.addEventListener('pause', this.onMusicInterrupted);
    element.addEventListener('ended', this.onMusicInterrupted);
    element.addEventListener('error', this.onMusicInterrupted);

    try {
      this.musicSource = ctx.createMediaElementSource(element);
      this.musicSource.connect(bus);
    } catch (error) {
      logger.warn(SCOPE, `music not routed: ${String(error)}`);
      return;
    }
    this.musicElement = element;
    this.musicLastTime = -1;
    this.musicStuckSince = 0;
    if (!this.muted) void element.play().catch(() => undefined);
  }

  /** Stop and release the music element, so a replacement never plays over it. */
  private teardownMusic(): void {
    const element = this.musicElement;
    this.musicElement = null;
    if (element) {
      element.removeEventListener('pause', this.onMusicInterrupted);
      element.removeEventListener('ended', this.onMusicInterrupted);
      element.removeEventListener('error', this.onMusicInterrupted);
      element.pause();
      // Dropping the src releases the request and the decoder.
      element.removeAttribute('src');
      element.load();
    }
    this.musicSource?.disconnect();
    this.musicSource = null;
  }

  /** Rebuild the element where the track had got to (rate-limited, so a broken file cannot spin). */
  private rebuildMusic(reason: string, force = false): void {
    const now = performance.now();
    if (!force && now - this.musicRebuiltAt < 5000) return;
    this.musicRebuiltAt = now;
    // Where the track had got to: an errored element may have reset its clock, so fall
    // back to the last position the watchdog saw it playing.
    const current = this.musicElement?.currentTime ?? 0;
    const at = current > 0 ? current : Math.max(0, this.musicLastTime);
    logger.info(SCOPE, `music rebuilt (${reason})`);
    // A failed download is retried; the new element streams meanwhile.
    this.fetchMusic();
    this.buildMusic(Number.isFinite(at) ? at : 0);
  }

  /** Music is wanted whenever audio has started and the game is not muted. */
  private get musicWanted(): boolean {
    return this.started && !this.muted && !!this.context && !!this.musicBus;
  }

  /**
   * THE MUSIC WATCHDOG. Called every couple of seconds, on every gesture, when
   * the tab comes back into view, and whenever the element stops on its own:
   * if music is wanted and is not playing, it resumes the context, replays the
   * element, or rebuilds it if it has errored, ended or stalled.
   */
  private ensureMusic(): void {
    if (!this.musicWanted) return;
    const ctx = this.context!;
    // Suspended by the browser (a background tab, an output device change): bring it back
    // - permitted once the page has had a gesture, and every gesture retries anyway.
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);

    const element = this.musicElement;
    if (!element || element.error || element.ended) {
      this.rebuildMusic(element ? (element.error ? `error ${element.error.code}` : 'ended') : 'missing');
      return;
    }
    if (element.paused) {
      void element.play().catch(() => undefined);
      return;
    }
    // Playing, but has it actually moved? A stream can hang with no error at all.
    const time = element.currentTime;
    const now = performance.now();
    if (time !== this.musicLastTime) {
      this.musicLastTime = time;
      this.musicStuckSince = now;
    } else if (ctx.state === 'running' && now - this.musicStuckSince > (this.musicBlobUrl ? 8000 : 20000)) {
      // From memory it cannot be waiting on the network, so 8s still is broken; a
      // stream still downloading on a slow line is given longer before it is replaced.
      this.rebuildMusic('stalled');
    }
  }

  /** The element stopped without being asked: look again a moment later (a mute pauses it on purpose). */
  private readonly onMusicInterrupted = (): void => {
    if (!this.musicWanted) return;
    window.setTimeout(() => this.ensureMusic(), 250);
  };

  private readonly onVisible = (): void => {
    if (document.visibilityState === 'visible') this.ensureMusic();
  };

  private startMusicWatch(): void {
    if (this.musicTimer !== null) return;
    this.musicTimer = window.setInterval(() => this.ensureMusic(), 2000);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
    window.addEventListener('pageshow', this.onVisible);
    this.context?.addEventListener('statechange', this.onVisible);
  }

  private stopMusicWatch(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
    window.removeEventListener('pageshow', this.onVisible);
    this.context?.removeEventListener('statechange', this.onVisible);
  }

  // --------------------------------------------------------- the one-shots

  /**
   * Fetch and decode the supplied one-shots.
   *
   * Fire and forget, and every failure is swallowed: a sample that does not
   * arrive simply never enters `samples`, and `playSample` returns false, and
   * the synthesised voice is used instead. A blocked asset is therefore a
   * DIFFERENT SOUND rather than silence, which is the whole reason the
   * fallback exists.
   *
   * Requested once, behind a flag, because `resume()` is wired to every
   * gesture and fetching the same two files on every click would be a slow
   * leak nobody would look for.
   */
  private loadSamples(): void {
    if (this.samplesRequested) return;
    this.samplesRequested = true;
    const ctx = this.context;
    if (!ctx) return;

    for (const [name, url] of Object.entries(SAMPLE_URLS)) {
      void fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((data) => (data ? ctx.decodeAudioData(data) : null))
        .then((buffer) => {
          if (buffer) this.samples.set(name as SoundName, buffer);
        })
        .catch(() => undefined);
    }
  }

  /**
   * Play a decoded sample, if one is available.
   *
   * @returns false when nothing was decoded, so the caller synthesises
   *          instead. That fallback is the whole shape of this method: a
   *          missing or blocked file changes which sound plays and nothing
   *          else.
   *
   * A sampled sound REPLACES itself rather than layering. The cooldowns are
   * tuned against the synthesised voices, every one of which is shorter than
   * its own cooldown; a recorded file need not be, so without this two of them
   * could overlap.
   */
  private playSample(sample: SoundName, when: number, gain: number, rate = 1, length = 0, voice: SoundName = sample, offset = 0): boolean {
    const ctx = this.context;
    const bus = this.sfxBus;
    const buffer = this.samples.get(sample);
    if (!ctx || !bus || !buffer) return false;
    const name = voice;

    if (!LAYERED.has(name)) this.activeSamples.get(name)?.stop();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.min(2.5, Math.max(0.3, rate));
    const envelope = ctx.createGain();
    envelope.gain.value = gain;
    source.connect(envelope);
    envelope.connect(bus);

    this.voices += 1;
    this.activeSamples.set(name, source);
    source.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      if (this.activeSamples.get(name) === source) this.activeSamples.delete(name);
    };
    source.start(when, offset);
    if (length > 0) {
      // Cut short with a fade, so a clipped roar does not click.
      envelope.gain.setValueAtTime(gain, when + length * 0.7);
      envelope.gain.linearRampToValueAtTime(0, when + length);
      source.stop(when + length + 0.02);
    }
    return true;
  }

  private blip(
    at: number,
    shape: OscillatorType,
    from: number,
    to: number,
    length: number,
    gain: number,
  ): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);

    osc.connect(envelope);
    envelope.connect(bus);
    this.hold(osc, envelope, at, length);
  }

  /** A short band-passed noise burst: the crack of teeth, the rake of claws. */
  private noise(at: number, length: number, gain: number, frequency: number): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.2;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    this.hold(source, envelope, at, length);
  }

  /** A push against the air: a short filtered noise burst with a low thump. */
  private thud(at: number, gain: number, frequency = 150): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, at + 0.09);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);

    osc.connect(envelope);
    envelope.connect(bus);
    this.hold(osc, envelope, at, 0.12);
  }

  /** A band-passed noise burst whose centre SWEEPS: a swipe, a whoosh, a rasp. */
  private sweep(at: number, length: number, gain: number, from: number, to: number, q = 1.8): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(40, from), at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + length);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + length * 0.35);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(bus);
    this.hold(source, envelope, at, length);
  }

  private arpeggio(
    at: number,
    semitones: readonly number[],
    step: number,
    shape: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    for (let i = 0; i < semitones.length; i += 1) {
      if (this.voices >= MAX_VOICES) return;
      const osc = ctx.createOscillator();
      osc.type = shape;
      osc.frequency.value = 440 * 2 ** ((semitones[i] as number) / 12);

      const start = at + i * step;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + step * 2.2);

      osc.connect(envelope);
      envelope.connect(bus);
      this.hold(osc, envelope, start, step * 2.2);
    }
  }

  /**
   * Start a voice, count it, and make sure it is uncounted exactly once.
   *
   * The counting is the whole reason `MAX_VOICES` means anything: a node that
   * started without being counted, or one that ended without being uncounted,
   * would leave the ceiling either useless or permanently closed.
   */
  private hold(
    osc: AudioScheduledSourceNode,
    envelope: GainNode,
    at: number,
    length: number,
    onDone?: () => void,
  ): void {
    this.voices += 1;
    osc.start(at);
    osc.stop(at + length + 0.02);
    osc.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      osc.disconnect();
      envelope.disconnect();
      onDone?.();
    };
  }
}
