import {
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Bone,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { neckScale, type AvatarAppearance } from '@greedy/shared';
import { logger } from '../util/logger.js';
import {
  assetUrl,
  defaultSkinUrl,
  describeItem,
  fallbackItemPaths,
  plainSkinUrl,
  skinTextureUrl,
} from './bloxityAssets.js';
import { bloxityRiderFactory } from './BloxityRiderFactory.js';
import { isEquippedId, type LegionProportions } from './legionTypes.js';

const SCOPE = 'bloxity/avatar';

/**
 * Every slot that hangs a MESH on the body, and how each one is worn.
 *
 * Four ways, and the differences are Bloxity's, not this game's:
 *
 *  - `head`: a hat, hair or a mask. Three separate slots worn TOGETHER, all
 *    loaded the same way - an OBJ parented to `Neck1` at `(0, 0.8, 0)`. Hair
 *    and masks are filed on the CDN with the hats, which is why they share a
 *    fallback folder.
 *  - `back`: the back item, on `Spine2`, as it always was.
 *  - `rest`: neck, chest and waist. Authored in the body's MODEL space at the
 *    rest pose, so each is parented to its bone with the local matrix
 *    `restInverse(bone) * translate(origin)` - which undoes where the bone
 *    stood at rest and puts the item back where it was modelled.
 *  - `pair`: hands and shoes. One id, worn twice: the mesh on the left leaf
 *    joint and a copy mirrored across X on the right one. These follow the
 *    bone's world POSITION and ROTATION only, never its scale (see
 *    `BoneFollower`), because a leaf joint's scale is whatever the proportions
 *    left on the limb and a glove is not meant to stretch with a forearm.
 *
 * The `rest` and `pair` placements need the rest inverses of `player.glb`, so
 * they are worn on a Bloxity body only. The bundled `player.fbx` is a
 * different rig in different units, and a necklace placed with the wrong
 * body's rest pose floats a metre in front of it; the bundled body is only
 * ever the fallback for "the portal could not be reached", where a missing
 * necklace is the least of it.
 */
type ItemSlot = 'hat' | 'hair' | 'mask' | 'back' | 'neck' | 'chest' | 'waist' | 'hand' | 'shoes';

interface SlotRule {
  readonly field: keyof AvatarAppearance;
  readonly kind: 'head' | 'back' | 'rest' | 'pair';
  /** The bone it hangs on - the LEFT one, for a pair. */
  readonly bone: string;
  /** A pair's right-hand bone, which wears the mirrored copy. */
  readonly mirrorBone?: string;
  /** Where the item sits in the body's model space, GLB units. */
  readonly origin?: readonly [number, number, number];
  /**
   * The CDN folder to fall back to when the catalogue has no entry. Null for
   * the back item, whose CDN layout the spec does not give, so it keeps
   * needing the catalogue exactly as before.
   */
  readonly folder: string | null;
}

const SLOT_RULES: Readonly<Record<ItemSlot, SlotRule>> = {
  hat: { field: 'hatId', kind: 'head', bone: 'Neck1', folder: 'hats' },
  hair: { field: 'hairId', kind: 'head', bone: 'Neck1', folder: 'hats' },
  mask: { field: 'maskId', kind: 'head', bone: 'Neck1', folder: 'hats' },
  back: { field: 'backId', kind: 'back', bone: 'Spine2', folder: null },
  neck: { field: 'neckId', kind: 'rest', bone: 'Spine2', origin: [0, 4.8, 0], folder: 'neck' },
  chest: { field: 'chestId', kind: 'rest', bone: 'Spine2', origin: [0, 3.6, 0], folder: 'chest' },
  waist: { field: 'waistId', kind: 'rest', bone: 'Spine1', origin: [0, 2.4, 0], folder: 'waist' },
  hand: {
    field: 'handId',
    kind: 'pair',
    bone: 'ArmL2_leaf',
    mirrorBone: 'ArmR2_leaf',
    origin: [0, 0, 0],
    folder: 'hand',
  },
  shoes: {
    field: 'shoesId',
    kind: 'pair',
    bone: 'LegL2_leaf',
    mirrorBone: 'LegR2_leaf',
    origin: [0, 0, 0],
    folder: 'shoes',
  },
};

const ITEM_SLOTS = Object.keys(SLOT_RULES) as ItemSlot[];

/** What one worn slot put on the body, so taking it off is one call. */
interface Worn {
  readonly nodes: Object3D[];
  readonly release: () => void;
}

/**
 * Bloxity cosmetics, applied to a rider.
 *
 * Three things are applied, and the choice of which three is deliberate:
 *
 *  - the SKIN, as a texture swap on the rider's own material - with the face,
 *    shirt and pants already painted into it by Bloxity (`skinTextureUrl`);
 *  - the ITEMS - hat, hair, mask, back, neck, chest, waist, hands, shoes - as
 *    meshes on real bones (see `SLOT_RULES` for how each is hung);
 *  - the PROPORTIONS, as scales and offsets on those same bones.
 *
 * The body PARTS are not applied here: those replace geometry on the body
 * itself and so belong to whatever built it - see `BloxityRiderFactory`. This
 * class dresses whichever rider is currently mounted, Bloxity body or bundled
 * `player.fbx`, which is why `rebind` exists.
 *
 * Asset paths come from Bloxity's item catalogue wherever it has them; for the
 * slots the spec documents a CDN layout for, an item the catalogue does not
 * describe falls back to that layout rather than going unworn.
 */
export class BloxityAvatar {
  private riderVisual: Group;
  private riderModel: Object3D;
  private bones: ReadonlyMap<string, Bone>;
  /** True while the rider is a Bloxity body rather than the bundled one. */
  private wearingBloxityBody = false;

  /** The rider's own material, cloned so remote players keep the default. */
  private material: MeshStandardMaterial | null = null;
  /** The texture the model shipped with, to go back to when a skin is removed. */
  private defaultMap: Texture | null = null;

  private readonly worn = new Map<ItemSlot, Worn>();
  private readonly loadedTextures: Texture[] = [];

  /*
   * What is currently WORN in each slot.
   *
   * THREE states, not two, and the third is the whole reason this is not a
   * plain `string | null`: `undefined` means "nothing has been applied to this
   * body yet", `null` means "applied, and the answer was none".
   *
   * Collapsing those two is a real bug and it shipped. A rebind used to set
   * these to `null` to mean "re-wear everything", but for a player with no
   * skin equipped the WANTED value is also `null` - so the comparison in
   * `applySkin` matched, the load was skipped, and a freshly built Bloxity
   * body was left with no texture at all, which renders white.
   *
   * The skin's value is a KEY over skin, pants, shirt and face, because all
   * four decide the one texture the body wears. An item slot that is absent
   * from `currentItems` is the `undefined` state.
   */
  private currentSkin: string | null | undefined = undefined;
  private readonly currentItems = new Map<ItemSlot, string | null>();

  /**
   * Which load of each slot is the live one.
   *
   * By TOKEN, not by id: a player who goes hat A -> hat B -> hat A has two
   * loads of A in flight, and comparing ids would let both of them hang a hat.
   * A rebind clears this, which is what stops a load that started on the OLD
   * body from attaching to it after the new one has arrived.
   */
  private readonly slotTokens = new Map<ItemSlot, number>();
  private loadSerial = 0;

  private readonly objLoader = new OBJLoader();
  private readonly textureLoader = new TextureLoader();

  private disposed = false;

  constructor(riderVisual: Group, riderModel: Object3D) {
    this.riderVisual = riderVisual;
    this.riderModel = riderModel;
    this.bones = collectBones(riderModel);
    this.material = this.cloneRiderMaterial(riderModel);
    this.defaultMap = this.material?.map ?? null;
  }

  /**
   * Wear a look.
   *
   * Safe to call on every avatar event: each slot is compared against what is
   * already worn, so the common case - a proportions change - touches no
   * network at all.
   */
  apply(look: AvatarAppearance, proportions: LegionProportions): void {
    if (this.disposed) return;

    this.applySkin(look);
    for (const slot of ITEM_SLOTS) void this.applyItem(slot, look[SLOT_RULES[slot].field] ?? null);
    this.applyProportions(proportions);
  }

  /**
   * Follow the rider onto a new body.
   *
   * Called when the mount swaps in a Bloxity avatar, or swaps back to the
   * bundled one. Everything this class holds is bound to a particular model -
   * the bones it hangs items on, the material it re-skins - so a swap has to
   * re-collect all of it and then re-wear what was already worn, which is what
   * forgetting the `current*` state arranges: the next `apply` sees every slot
   * as changed and puts it back on the new body.
   */
  rebind(riderVisual: Group, riderModel: Object3D, bloxityBody: boolean): void {
    for (const [, worn] of this.worn) takeOff(worn);
    this.worn.clear();
    this.slotTokens.clear();

    this.riderVisual = riderVisual;
    this.riderModel = riderModel;
    this.bones = collectBones(riderModel);
    this.material = this.cloneRiderMaterial(riderModel);
    this.defaultMap = this.material?.map ?? null;
    this.wearingBloxityBody = bloxityBody;

    // UNDEFINED, not null: "not applied to this body yet". See the fields.
    this.currentSkin = undefined;
    this.currentItems.clear();
  }

  dispose(): void {
    this.disposed = true;
    for (const [, worn] of this.worn) takeOff(worn);
    this.worn.clear();
    this.slotTokens.clear();
    for (const texture of this.loadedTextures) texture.dispose();
    this.loadedTextures.length = 0;
    this.material?.dispose();
    this.material = null;
  }

  // ------------------------------------------------------------------ skin

  private applySkin(look: AvatarAppearance): void {
    const layers = [look.skinId, look.pantsId, look.shirtId, look.faceId];
    const wanted = layers.some((id) => isEquippedId(id)) ? layers.join('|') : null;
    if (wanted === this.currentSkin) return;
    this.currentSkin = wanted;
    void this.loadSkin(wanted, look);
  }

  /**
   * Put a skin on the body.
   *
   * Three sources, in the order the spec gives them:
   *
   *  - a face, shirt or pants worn: Bloxity's composited texture, which is
   *    the skin (or the default skin) with those layers already drawn on;
   *  - a skin alone: the catalogue's texture for it, or the CDN's
   *    `/skins/{id}.png` if the catalogue has none - the same file;
   *  - nothing at all: Bloxity's default skin on a Bloxity body. The bundled
   *    rider instead goes back to the texture it shipped with, because it has
   *    no Bloxity look to fall back to.
   */
  private async loadSkin(wanted: string | null, look: AvatarAppearance): Promise<void> {
    const material = this.material;
    if (!material) return;

    let url: string | null = skinTextureUrl(look);
    if (!url && look.skinId) {
      const item = await describeItem(look.skinId);
      const path = item?.assetPaths?.texture;
      url = path ? assetUrl(path) : plainSkinUrl(look.skinId);
    } else if (!url && this.wearingBloxityBody) {
      url = defaultSkinUrl();
    }

    // Still wanted? The player may have changed skin while this was in flight.
    if (this.disposed || this.currentSkin !== wanted) return;

    if (!url) {
      material.map = this.defaultMap;
      material.needsUpdate = true;
      return;
    }

    this.textureLoader.load(
      url,
      (texture) => {
        if (this.disposed || this.currentSkin !== wanted) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        // Bloxity skins are 64x64 pixel art. Smoothing them turns a face into
        // a smudge, which is why their own renderer filters them this way too.
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        this.loadedTextures.push(texture);
        material.map = texture;
        material.needsUpdate = true;
      },
      undefined,
      () => logger.warn(SCOPE, `skin ${wanted ?? 'default'} failed to load`),
    );
  }

  // ------------------------------------------------------------------ items

  /**
   * Hang one slot's item on real bones.
   *
   * To a BONE, not to the rider group: an item hung off the group would keep
   * its own idea of where the head is while the head moved, which is the same
   * class of mistake as copying a transform a frame late.
   */
  private async applyItem(slot: ItemSlot, id: string | null): Promise<void> {
    const wanted = isEquippedId(id) ? id : null;
    if (this.currentItems.has(slot) && this.currentItems.get(slot) === wanted) return;
    this.currentItems.set(slot, wanted);

    const token = (this.loadSerial += 1);
    this.slotTokens.set(slot, token);
    const live = (): boolean => !this.disposed && this.slotTokens.get(slot) === token;

    const existing = this.worn.get(slot);
    if (existing) {
      takeOff(existing);
      this.worn.delete(slot);
    }
    if (!wanted) return;

    const rule = SLOT_RULES[slot];
    const native = this.wearingBloxityBody;
    // Rest-pose and paired items are placed with `player.glb`'s rest inverses,
    // which mean nothing on the bundled body. See `ItemSlot`.
    if (!native && (rule.kind === 'rest' || rule.kind === 'pair')) return;

    const anchor = this.bones.get(rule.bone);
    const mirrorAnchor = rule.mirrorBone ? this.bones.get(rule.mirrorBone) : undefined;
    if (!anchor || (rule.mirrorBone && !mirrorAnchor)) {
      logger.warn(SCOPE, `no bone to hang a ${slot} on`);
      return;
    }

    const paths = await this.itemPaths(rule, wanted);
    if (!live()) return;
    if (!paths) {
      logger.warn(SCOPE, `${slot} ${wanted} has no mesh in the catalogue`);
      return;
    }

    try {
      const object = await this.objLoader.loadAsync(assetUrl(paths.mesh));
      if (!live()) {
        releaseObject(object);
        return;
      }

      /*
       * NO `flipY = false` HERE, AND THAT IS THE WHOLE DIFFERENCE.
       *
       * The skin above turns it off because it is applied to the GLB body, and
       * glTF puts the UV origin at the TOP left - which is why three.js flips
       * for that format. An accessory is an OBJ, and OBJ uses the OpenGL
       * convention with the origin at the BOTTOM left, which is already
       * three.js's default. Forcing the glTF rule onto it flipped every hat
       * and back item vertically, and a texture wrapped upside down over a
       * helmet does not read as upside down - it reads as smeared garbage,
       * which is exactly how it was reported.
       *
       * Bloxity's own renderer is the oracle: it sets `flipY` in precisely one
       * place in its whole bundle, on the skin, and loads every OBJ item with
       * nothing but the two filters below.
       */
      const texture = await this.textureLoader.loadAsync(assetUrl(paths.texture));
      if (!live()) {
        releaseObject(object);
        texture.dispose();
        return;
      }
      texture.colorSpace = SRGBColorSpace;
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;

      const material = new MeshStandardMaterial({ map: texture, roughness: 0.85 });
      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = material;
          child.castShadow = true;
        }
      });

      const nodes = this.place(rule, object, anchor, mirrorAnchor);
      if (nodes.length === 0) {
        releaseObject(object);
        texture.dispose();
        return;
      }
      this.worn.set(slot, {
        nodes,
        release: () => {
          releaseObject(object);
          texture.dispose();
        },
      });
      logger.info(SCOPE, `wearing ${slot} ${wanted}`);
    } catch {
      logger.warn(SCOPE, `${slot} ${wanted} failed to load`);
    }
  }

  /**
   * Where an item's mesh and texture live.
   *
   * The catalogue's `assetPaths` first, verbatim, exactly as for hats and back
   * items before; the CDN layout the spec documents only when the catalogue
   * has no usable entry. A pair may be catalogued as a `meshL`, so that is
   * accepted as its mesh too - the right one is the mirror, not a file.
   */
  private async itemPaths(
    rule: SlotRule,
    id: string,
  ): Promise<{ mesh: string; texture: string } | null> {
    const item = await describeItem(id);
    const mesh = item?.assetPaths?.mesh ?? item?.assetPaths?.meshL;
    const texture = item?.assetPaths?.texture;
    if (mesh && texture) return { mesh, texture };
    return rule.folder ? fallbackItemPaths(rule.folder, id) : null;
  }

  /** Hang a loaded item according to its slot's rule. Returns what was added. */
  private place(
    rule: SlotRule,
    object: Object3D,
    anchor: Bone,
    mirrorAnchor: Bone | undefined,
  ): Object3D[] {
    const native = this.wearingBloxityBody;
    const [ox, oy, oz] = rule.origin ?? [0, 0, 0];
    const origin = new Matrix4().makeTranslation(ox, oy, oz);

    switch (rule.kind) {
      case 'head':
      case 'back':
        // An item is sized against the BONE it hangs on, and the two bodies do
        // not share a bone space: `player.fbx` is authored in centimetres and
        // scaled down on load, while the Bloxity body is the rig these items
        // were made for. So a Bloxity body gets Bloxity's own numbers - scale
        // 1, a head item lifted 0.8 up the head bone, a back item sitting on
        // the spine - and the bundled body keeps the values tuned for it.
        object.scale.setScalar(native ? 1 : ITEM_SCALE);
        if (rule.kind === 'head') object.position.set(0, native ? BLOXITY_HAT_LIFT : HAT_LIFT, 0);
        else object.position.set(0, 0, native ? 0 : BACK_OFFSET);
        anchor.add(object);
        return [object];

      case 'rest': {
        const rest = bloxityRiderFactory.restInverse(anchor.name);
        if (!rest) return [];
        // Proportions here are applied by scaling and moving BONES (see
        // `applyProportions`), so an item parented to one follows them on its
        // own - no per-proportion correction is needed.
        object.matrixAutoUpdate = false;
        object.matrix.multiplyMatrices(rest, origin);
        anchor.add(object);
        return [object];
      }

      case 'pair': {
        const rest = bloxityRiderFactory.restInverse(anchor.name);
        const mirrorRest = mirrorAnchor ? bloxityRiderFactory.restInverse(mirrorAnchor.name) : undefined;
        if (!rest || !mirrorAnchor || !mirrorRest) return [];

        const left = new BoneFollower(anchor, this.riderModel, new Matrix4().multiplyMatrices(rest, origin));
        left.add(object);

        // The right one is the left one mirrored across the body's X - a
        // negative determinant, which three.js already answers by flipping
        // the winding, so the copy is not drawn inside out.
        const mirror = new Matrix4().makeScale(-1, 1, 1);
        const right = new BoneFollower(
          mirrorAnchor,
          this.riderModel,
          new Matrix4().multiplyMatrices(mirrorRest, mirror).multiply(origin),
        );
        right.add(object.clone());

        // Appended LAST under the model: the scene's matrix pass walks
        // children in order, so by the time it reaches these the bones they
        // follow have already been updated for this frame.
        this.riderModel.add(left, right);
        return [left, right];
      }
    }
  }

  // ----------------------------------------------------------- proportions

  /**
   * Apply the account's proportions.
   *
   * Scale and POSITION only - never rotation. `PlayerRig` rebuilds every
   * bone's quaternion from its rest pose on every single frame, so a rotation
   * written here would be gone before it was drawn; scale and position are
   * untouched by it and therefore survive.
   *
   * Because these move BONES rather than editing `skeleton.boneMatrices`,
   * every accessory follows them without a correction: the neck, chest and
   * waist items are children of the scaled spine bones, and the hand and shoe
   * pairs read their bone's world position, which the scaled spine and the
   * spread legs have already moved.
   */
  private applyProportions(p: LegionProportions): void {
    const num = (value: number, fallback = 1): number =>
      Number.isFinite(value) && value > 0 ? value : fallback;

    // Height scales the whole rider. The robot's seat is a fixed point, so
    // this grows the rider upward from where they sit rather than through the
    // robot's back.
    this.riderVisual.scale.setScalar(num(p.height));

    const spine1 = this.bones.get('Spine1');
    if (spine1) spine1.scale.x = num(p.torsoScaleX);

    const spine2 = this.bones.get('Spine2');
    if (spine2) spine2.scale.x = num(p.shoulderWidth);

    /*
     * The portal's head proportion, TIMES this game's own.
     *
     * Not `setScalar(num(p.headScale))`. That ran after the rig was bound and
     * overwrote the enlargement the pilot needs to be recognisable from the
     * chase camera, putting almost every player back on a head scale of
     * exactly 1. `neckScale` multiplies the two, so a player's own choice
     * still does what they chose.
     */
    const neck = this.bones.get('Neck1');
    if (neck) neck.scale.setScalar(neckScale(num(p.headScale)));

    for (const name of ['ArmL1', 'ArmR1'] as const) {
      const bone = this.bones.get(name);
      if (bone) bone.scale.y = num(p.armLength);
    }

    // `legOffsetX` is a straddle, so it moves the legs apart rather than
    // scaling them: the rider is sitting on a barrel, and that is the one
    // proportion this game's pose actually cares about.
    const straddle = Number.isFinite(p.legOffsetX) ? p.legOffsetX : 1;
    for (const [name, side] of [['LegL1', 1], ['LegR1', -1]] as const) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      bone.position.x = bone.userData['restX'] as number ?? bone.position.x;
      if (bone.userData['restX'] === undefined) bone.userData['restX'] = bone.position.x;
      bone.position.x = (bone.userData['restX'] as number) + side * (straddle - 1) * LEG_SPREAD;
    }
  }

  /**
   * Give the rider its own material.
   *
   * Every instance shares ONE material by design, which is exactly right until
   * one of them needs a different skin - at which point writing to it would
   * re-skin every remote player too.
   */
  private cloneRiderMaterial(model: Object3D): MeshStandardMaterial | null {
    let cloned: MeshStandardMaterial | null = null;
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const material = child.material;
      if (!(material instanceof MeshStandardMaterial)) return;
      cloned ??= material.clone();
      child.material = cloned;
    });
    return cloned;
  }
}

/**
 * A node that follows a bone's world POSITION and ROTATION, but not its scale.
 *
 * What the hand and shoe pairs hang from. Their spec is
 * `compose(bone world position, bone world rotation, scale) * local`, written
 * every frame - and rather than ask the game loop for a per-frame hook, this
 * does the write inside the matrix pass three.js already runs before every
 * render: `updateMatrixWorld` is overridden, so the scene's own traversal
 * keeps it current, shadows and all, with no call to wire in anywhere.
 *
 * The scale composed in is the MODEL root's world scale rather than a literal
 * 1. Bloxity's renderer draws its character at scale 1; here the same body is
 * shrunk to this game's height and then sized by the player's height
 * proportion, and `local` carries rest offsets in GLB units - so "scale 1" in
 * their world is the model's own scale in this one. What is dropped is the
 * scale the BONES carry (arm length, shoulder width), which is the point.
 */
class BoneFollower extends Group {
  private readonly bone: Bone;
  private readonly model: Object3D;
  private readonly local: Matrix4;

  constructor(bone: Bone, model: Object3D, local: Matrix4) {
    super();
    this.bone = bone;
    this.model = model;
    this.local = local;
    this.matrixAutoUpdate = false;
  }

  override updateMatrixWorld(force?: boolean): void {
    this.follow();
    for (const child of this.children) child.updateMatrixWorld(force ?? true);
  }

  override updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    if (updateParents) {
      this.model.updateWorldMatrix(true, false);
      this.bone.updateWorldMatrix(true, false);
    }
    this.follow();
    if (updateChildren) for (const child of this.children) child.updateWorldMatrix(false, true);
  }

  private follow(): void {
    this.bone.matrixWorld.decompose(followPosition, followRotation, followScratch);
    this.model.matrixWorld.decompose(followScratch, followScratchRotation, followScale);
    this.matrixWorld.compose(followPosition, followRotation, followScale).multiply(this.local);
    this.matrixWorldNeedsUpdate = false;
  }
}

const followPosition = new Vector3();
const followRotation = new Quaternion();
const followScale = new Vector3();
const followScratch = new Vector3();
const followScratchRotation = new Quaternion();

/** Take one worn slot off the body and let go of its GPU resources. */
const takeOff = (worn: Worn): void => {
  for (const node of worn.nodes) node.removeFromParent();
  worn.release();
};

/** Dispose an item's geometry and material - once each, a pair shares both. */
const releaseObject = (object: Object3D): void => {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    geometries.add(child.geometry as BufferGeometry);
    const material = child.material as Material | Material[];
    for (const entry of Array.isArray(material) ? material : [material]) materials.add(entry);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
};

/** How big a CDN item is, in the bone space it hangs in. */
const ITEM_SCALE = 0.9;
/** A head item sits above the head bone's origin, on the bundled body. */
const HAT_LIFT = 0.55;
/**
 * The same lift on a Bloxity body.
 *
 * Bloxity's own figure, not a tuned one: their renderer parents a hat - and
 * hair, and a mask - to the head bone at `(0, 0.8, 0)`. These items are
 * authored for that rig, so the number that makes them sit right is theirs.
 */
const BLOXITY_HAT_LIFT = 0.8;
/** A back item sits behind the chest. */
const BACK_OFFSET = -0.35;
/** World units the legs move apart per unit of `legOffsetX`. */
const LEG_SPREAD = 0.12;

/** The rig's bones, by name. Same first-bone rule `PlayerRig` uses. */
const collectBones = (model: Object3D): Map<string, Bone> => {
  const found = new Map<string, Bone>();
  model.traverse((child) => {
    const bone = child as Bone;
    if (bone.isBone && !found.has(bone.name)) found.set(bone.name, bone);
  });
  return found;
};
