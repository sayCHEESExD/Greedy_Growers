import { Box3, Group, Vector3, type Mesh, type Object3D } from 'three';
import { PoseBuffer } from '../animation/PoseBuffer.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { ACTION_SECONDS, CHEER_SECONDS, bump, clamp, damp, ramp, type Motion } from './Motion.js';
import { EmotePlayer } from '../bloxity/emotes.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { playerModelLoader } from './PlayerModelLoader.js';

/** How tall the avatar stands, world units. */
export const AVATAR_HEIGHT = 3.4;

let unitScale = 0;

/** The scale that stands the bundled avatar AVATAR_HEIGHT tall (measured once from the loaded model). */
const avatarScale = (): number => {
  if (unitScale > 0) return unitScale;
  const probe = playerModelLoader.createInstance();
  probe.updateMatrixWorld(true);
  const height = new Box3().setFromObject(probe).getSize(new Vector3()).y;
  unitScale = height > 0.1 ? AVATAR_HEIGHT / height : 1;
  return unitScale;
};

/**
 * THE PLAYER'S OWN BLOXITY AVATAR: every gardener walks the island as
 * themselves.
 *
 *   root      the avatar's place on the player (normalised to AVATAR_HEIGHT)
 *     visual  what `BloxityAvatar` scales by the avatar's height proportion
 *       model the bundled body, or the player's Bloxity body once it loads
 *
 * `AvatarDresser` owns WHICH body is worn (through `body` / `setModel`), and
 * this class animates whatever it is, procedurally, on the rig's twelve bones:
 * idle and walk, the jump, the Roblox tool hold, digging, pouring, planting,
 * ringing and picking, and a cheer.
 */
export class AvatarBody {
  readonly root = new Group();
  readonly visual = new Group();
  private readonly defaultModel: Object3D;
  private model: Object3D;
  private rig: PlayerRig;
  private readonly animator = new AvatarAnimator();
  /** Boxity emote clips, laid over the animator's pose by bone name. */
  private readonly emotes = new EmotePlayer();

  constructor() {
    this.defaultModel = playerModelLoader.createInstance();
    this.model = this.defaultModel;
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.visual.add(this.model);
    this.root.add(this.visual);
    this.root.scale.setScalar(avatarScale());
    this.rig = new PlayerRig(this.model, this.model);
    this.emotes.bind(this.model);
    this.castShadows();
  }

  /** The body, for the dresser. */
  get body(): { visual: Group; model: Object3D } {
    return { visual: this.visual, model: this.model };
  }

  /** Wear a different body, or null for the bundled one. */
  setModel(next: Object3D | null): Object3D {
    const target = next ?? this.defaultModel;
    if (target === this.model) return target;
    const previous = this.model;
    previous.removeFromParent();
    releaseBody(previous);
    target.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.model = target;
    this.visual.add(target);
    this.rig = new PlayerRig(target, target);
    this.emotes.bind(target);
    this.castShadows();
    return target;
  }

  update(dt: number, motion: Motion): void {
    this.animator.update(dt, motion, this.rig, this.root);
    // After the pose: a clip is a delta over the BIND pose, blended on top.
    if (!this.emotes.apply(dt, motion.emote, motion.emoteTime)) motion.emote = '';
  }

  /** The rig, for measuring where the hand is. */
  get rigRef(): PlayerRig {
    return this.rig;
  }

  /** Stand in the bind pose (for measuring mounts). */
  bindPose(): void {
    this.rig.applyPose(new PoseBuffer());
  }

  reset(): void {
    this.animator.reset();
    this.root.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
  }

  private castShadows(): void {
    this.model.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
  }

  dispose(): void {
    releaseBody(this.model);
    this.root.removeFromParent();
  }
}

/** Let go of a Bloxity body's materials when it is swapped out. */
const releaseBody = (model: Object3D): void => {
  if (model.userData['bloxityBody'] !== true) return;
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
};

/**
 * The avatar's procedural animation, in the rig's convention (`PlayerRig`):
 * +X pitch swings a limb BACKWARD (so a limb raised forward is negative X),
 * +Z on a left limb swings it out to the side; a negative X on the spine or
 * neck bows it forward.
 */
class AvatarAnimator {
  private readonly pose = new PoseBuffer();
  private phase = 0;
  private time = Math.random() * 10;
  private move = 0;
  private air = 0;
  private dip = 0;
  private hold = 0;

  reset(): void {
    this.move = 0;
    this.air = 0;
    this.dip = 0;
  }

  update(dt: number, m: Motion, rig: PlayerRig, root: Group): void {
    this.time += dt;
    const p = this.pose;
    p.reset();
    const speed = m.speed;
    this.move = damp(this.move, clamp(speed / 3, 0, 1), 8, dt);
    this.air = damp(this.air, m.grounded ? 0 : 1, 10, dt);
    this.hold = damp(this.hold, m.holding ? 1 : 0, 12, dt);
    if (m.landed) this.dip = 1;
    this.dip = Math.max(0, this.dip - dt * 4);

    // --------------------------------------------------------- the walk
    if (speed > 0.2) this.phase = (this.phase + (speed / 4.4) * Math.PI * dt) % (Math.PI * 2);
    const sin = Math.sin(this.phase);
    const cos = Math.cos(this.phase);
    const ground = 1 - this.air;
    const legs = 0.7 * this.move * ground;
    p.add('LegL1', -legs * sin);
    p.add('LegR1', legs * sin);
    p.add('LegL2', 0.35 * Math.max(0, cos) * this.move * ground);
    p.add('LegR2', 0.35 * Math.max(0, -cos) * this.move * ground);
    const arms = 0.7 * this.move * ground;
    p.add('ArmL1', arms * sin, 0, 0.06);
    // The right arm swings only when the hand is empty; with a tool it is held out in front.
    p.add('ArmR1', -arms * sin * (1 - this.hold), 0, -0.06);
    p.add('Spine1', -0.04 * this.move, 0.08 * legs * sin);
    // ------------------------------------------------------------ idle
    const still = (1 - this.move) * ground;
    const breath = Math.sin(this.time * 2.2);
    p.add('Spine1', breath * 0.025 * still);
    p.add('Neck1', 0, Math.sin(this.time * 0.45) * 0.14 * still);
    p.add('ArmL1', breath * 0.03 * still, 0, 0.03 * still);
    // ------------------------------------------------------------- air
    p.add('LegL1', -0.5 * this.air);
    p.add('LegR1', 0.3 * this.air);
    p.add('ArmL1', -0.3 * this.air, 0, 1.2 * this.air);
    p.add('ArmR1', -0.3 * this.air * (1 - this.hold), 0, -1.2 * this.air * (1 - this.hold));
    // Landing squash.
    const dip = this.dip * this.dip;
    p.add('LegL1', -0.35 * dip);
    p.add('LegR1', -0.35 * dip);
    p.add('LegL2', 0.7 * dip);
    p.add('LegR2', 0.7 * dip);
    // ------------------------------------------------------------ hold
    // THE ROBLOX TOOL HOLD: the right arm straight out in front, the elbow soft.
    p.add('ArmR1', -1.5 * this.hold + 0.04 * Math.sin(this.phase * 2) * this.move * this.hold);
    p.add('ArmR2', -0.1 * this.hold);
    // ---------------------------------------------------------- action
    if (m.actionTime >= 0) {
      const t = m.actionTime / ACTION_SECONDS;
      if (t <= 1) {
        const k = bump(t, 0, 1);
        switch (m.actionKind) {
          case 'dig':
            // Down into the soil and back: the shoulder drops, the back bends.
            p.add('ArmR1', 0.9 * k);
            p.add('Spine1', -0.35 * k);
            p.add('ArmL1', -0.5 * k);
            break;
          case 'pour':
            // Tip the can forward.
            p.add('ArmR1', 0.35 * k, 0, 0.25 * k);
            p.add('Spine1', -0.12 * k);
            break;
          case 'plant':
            // Crouch and reach to the ground.
            p.add('Spine1', -0.55 * k);
            p.add('ArmR1', 0.7 * k);
            p.add('LegL1', -0.5 * k);
            p.add('LegR1', -0.5 * k);
            p.add('LegL2', 0.9 * k);
            p.add('LegR2', 0.9 * k);
            break;
          case 'ring': {
            const shake = Math.sin(t * Math.PI * 8) * 0.35 * k;
            p.add('ArmR1', -0.9 * k, 0, shake);
            break;
          }
          case 'pick':
            p.add('ArmR1', -0.6 * k);
            p.add('ArmL1', -1.1 * k);
            p.add('Spine1', -0.3 * k);
            break;
        }
      }
    }
    // ------------------------------------------------------------ cheer
    if (m.cheerTime >= 0 && m.cheerTime < CHEER_SECONDS) {
      const env = ramp(m.cheerTime, 0, 0.15) * (1 - ramp(m.cheerTime, CHEER_SECONDS - 0.25, CHEER_SECONDS));
      const pump = Math.abs(Math.sin(m.cheerTime * 9));
      p.add('ArmL1', -2.7 * env * (0.8 + 0.2 * pump), 0, 0.3 * env);
      p.add('ArmR1', (-2.7 + 1.5 * this.hold) * env * (0.8 + 0.2 * (1 - pump)), 0, -0.3 * env);
      p.add('Neck1', 0.25 * env);
    }
    root.rotation.x = 0;
    root.position.y = -0.1 * dip;
    rig.applyPose(p);
  }
}
