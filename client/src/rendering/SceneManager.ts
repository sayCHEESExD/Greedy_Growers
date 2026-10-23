import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { PALETTE, WORLD_FOG } from '../config/worldVisuals.js';

/**
 * The scene root and the base lighting rig: a bright island day - a sky-blue
 * hemisphere over a grass-green bounce, a soft ambient so no flank is ever
 * black, and a warm sun that casts the shadows. `Weather` retunes all three,
 * and the fog, to the current weather.
 */
export class SceneManager {
  readonly scene = new Scene();
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly ambient: AmbientLight;

  constructor() {
    this.scene.fog = new Fog(PALETTE.fog, WORLD_FOG.near, WORLD_FOG.far);
    this.setBackground();

    this.hemi = new HemisphereLight(0xdcefff, 0x8aa070, 1.3);
    this.hemi.position.set(0, 80, 0);
    this.scene.add(this.hemi);

    this.ambient = new AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambient);

    this.sun = new DirectionalLight(0xfff6e4, 2.2);
    this.sun.position.set(40, 90, -30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  /** Keep the shadow frustum over the player. */
  followShadow(x: number, y: number, z: number): void {
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + 40, y + 90, z - 30);
    this.sun.target.updateMatrixWorld();
  }

  setBackground(color: number = PALETTE.fog): void {
    if (this.scene.background instanceof Color) this.scene.background.setHex(color);
    else this.scene.background = new Color(color);
  }
}
