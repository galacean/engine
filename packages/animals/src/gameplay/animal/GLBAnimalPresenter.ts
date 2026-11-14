import {
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  Color,
  Camera,
  Entity,
  MeshRenderer,
  PBRMaterial,
  SkinnedMeshRenderer,
  WrapMode,
  type GLTFResource
} from "@galacean/engine";
import type { AnimalAction, AnimalMotion } from "./Animal";
import type { AnimalPresenter } from "./AnimalPresenter";
import type { AnimalLodProfile } from "./AnimalSpeciesAsset";
import { AnimalModelLod } from "./AnimalLod";

/** Asset-specific animation and appearance mapping; never part of an animal's behavior definition. */
export interface GLBAnimalProfile {
  readonly scale: number;
  readonly tintMaterial: string;
  readonly walkSpeed: number;
  readonly clips: Readonly<Record<AnimalAction, string>>;
  /** Conservative animation bounds in the imported skin root's local coordinates. */
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  /** Optional three-level geometry binding; omission keeps the authored single mesh. */
  readonly lod?: AnimalLodProfile;
}

/** An independent skin, controller and tint that borrow shared GLB meshes, textures and clips. */
export class GLBAnimalPresenter implements AnimalPresenter {
  private readonly _root: Entity;
  private readonly _animator: Animator;
  private readonly _controller: AnimatorController;
  private readonly _materials: PBRMaterial[] = [];
  private _action: AnimalAction | null = null;
  private _clipState: AnimalAction | null = null;
  private _lastActionTime = 0;
  private _landingHeight = 1;
  private _landingProgress = 0;
  private _disposed = false;
  private _lod?: AnimalModelLod;

  /**
   * Instantiate one animal from a host-owned, loaded GLB.
   * @param parent Host entity whose transform defines the roaming world.
   * @param resource Shared GLB retained by the host resource manager.
   * @param profile Clip names, scale, tint slot and authored animation bounds.
   * @param color Per-animal feather colour; other materials retain their asset colours.
   */
  constructor(
    parent: Entity,
    resource: GLTFResource,
    private readonly profile: GLBAnimalProfile,
    color: Color
  ) {
    const clips = resource.animations ?? [];
    for (const name of Object.values(profile.clips)) {
      if (!clips.some((clip) => clip.name === name)) throw new Error(`Missing animal animation: ${name}`);
    }
    this._root = parent.createChild("GLB animal");
    this._controller = new AnimatorController(parent.engine);
    try {
      this._root.transform.setScale(profile.scale, profile.scale, profile.scale);
      const model = resource.instantiateSceneRoot();
      this._root.addChild(model);
      const animators: Animator[] = [];
      model.getComponentsIncludeChildren(Animator, animators);
      if (animators.length !== 1) throw new Error(`Animal GLB requires one Animator; found ${animators.length}`);
      this._animator = animators[0];
      // Only the host's simulation clock advances this animator, including pause and time scaling.
      this._animator.enabled = false;
      const layer = new AnimatorControllerLayer("Animal motions");
      this._controller.addLayer(layer);
      for (const [action, name] of Object.entries(profile.clips)) {
        const state = layer.stateMachine.addState(action);
        state.clip = clips.find((clip) => clip.name === name)!;
        state.wrapMode = action === "takeOff" || action === "land" ? WrapMode.Once : WrapMode.Loop;
      }
      this._animator.animatorController = this._controller;
      const renderers: MeshRenderer[] = [];
      model.getComponentsIncludeChildren(MeshRenderer, renderers);
      for (const renderer of renderers) {
        renderer.castShadows = renderer.receiveShadows = true;
        if (renderer instanceof SkinnedMeshRenderer) {
          renderer.localBounds.min.set(...profile.bounds.min);
          renderer.localBounds.max.set(...profile.bounds.max);
        }
        const materials = renderer.getMaterials();
        for (let i = 0; i < materials.length; i++) {
          const material = materials[i];
          if (material instanceof PBRMaterial && material.name === profile.tintMaterial) {
            const tinted = material.clone();
            tinted.baseColor.copyFrom(color);
            renderer.setMaterial(i, tinted);
            this._materials.push(tinted);
          }
        }
      }
      if (!this._materials.length) throw new Error(`Missing animal tint material: ${profile.tintMaterial}`);
      if (profile.lod) this._lod = new AnimalModelLod(model, profile.lod);
    } catch (error) {
      this._root.destroy();
      for (const material of this._materials) material.destroy();
      this._controller.destroy();
      throw error;
    }
  }

  /** Switch geometry only; independent behavior and movement keep their state. */
  updateLod(screenRelativeHeight: number): void {
    if (!this._disposed) this._lod?.updateProjectedHeight(screenRelativeHeight);
  }

  /** Resolve the authored three-level LOD against a live camera. */
  updateCameraLod(camera: Camera): void {
    if (!this._disposed) this._lod?.updateCamera(camera);
  }

  /** Advance the independent GLB animation from the same clock as movement and behavior. */
  update(m: AnimalMotion, seconds: number): void {
    if (this._disposed) return;
    this._root.transform.setPosition(m.x, m.y, m.z);
    this._root.transform.setRotation((m.pitch * 180) / Math.PI, (m.yaw * 180) / Math.PI, (m.bank * 180) / Math.PI);
    const changed = m.action !== this._action || m.actionTime < this._lastActionTime;
    if (changed) {
      this._action = m.action;
      this._landingHeight = Math.max(m.y, 0.001);
      this._landingProgress = 0;
    }
    this._lastActionTime = m.actionTime;
    // Take-off can outlast the authored opening gesture while the host is still climbing.
    const takeOff = this._controller.layers[0].stateMachine.findStateByName("takeOff");
    const clipState = m.action === "takeOff" && m.actionTime >= takeOff.clip!.length ? "fly" : m.action;
    if (changed || clipState !== this._clipState) {
      this._clipState = clipState;
      this._animator.play(clipState, 0);
    }
    const state = this._controller.layers[0].stateMachine.findStateByName(clipState);
    if (m.action === "land") {
      // Folding follows the actual descent, so a short authored clip cannot close the wings high in the air.
      const progress = Math.max(this._landingProgress, Math.min(1, 1 - m.y / this._landingHeight));
      state.speed = seconds > 0 ? ((progress - this._landingProgress) * state.clip!.length) / seconds : 0;
      this._landingProgress = progress;
    } else {
      state.speed = clipState === "walk" || clipState === "run" ? m.speed / this.profile.walkSpeed : 1;
    }
    this._animator.update(seconds);
  }

  /** Release this instance's skin, controller and cloned tint materials; keep shared GLB data alive. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._root.destroy();
    for (const material of this._materials) material.destroy();
    this._controller.destroy();
  }
}
