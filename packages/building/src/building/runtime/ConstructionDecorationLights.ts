import {
  Entity,
  PointLight,
  ShaderProperty,
  ShadowType,
  Script,
  type ShaderMacro,
  type Camera,
  type Scene
} from "@galacean/engine";
import {
  ConstructionDecorationLightPolicy,
  type ConstructionDecorationLight
} from "./ConstructionDecorationLightPolicy";
export { constructionDecorationLights } from "./ConstructionDecorationLightPolicy";
export type { ConstructionDecorationLight } from "./ConstructionDecorationLightPolicy";
const positionRangeProperty = ShaderProperty.getByName("scene_MasonryLightPositionRange");
const colorIntensityProperty = ShaderProperty.getByName("scene_MasonryLightColorIntensity");
const pointMaskProperty = ShaderProperty.getByName("scene_MasonryPointMask");
const legacyMaskProperty = ShaderProperty.getByName("scene_MasonryLegacyMask");
const fallbackMaskProperty = ShaderProperty.getByName("scene_MasonryFallbackMask");
class ConstructionLightSync extends Script {
  sync: (() => void) | undefined;
  onBeginRender() {
    this.sync?.();
  }
}
/** One scene-owned pool. Instantiate once beside the camera's scene, call update
 * from the normal frame loop with the complete resident/preview descriptor set,
 * and dispose before its parent. It does not own or edit authoring documents. */
export class ConstructionDecorationLights {
  private static readonly publishers = new WeakMap<Scene, ConstructionDecorationLights>();
  readonly policy: ConstructionDecorationLightPolicy;
  readonly root: Entity;
  readonly metrics = { active: 0, allocated: 0, updates: 0 };
  private readonly emitters: PointLight[] = [];
  private readonly positions = new Float32Array(32);
  private readonly colors = new Float32Array(32);
  private disposed = false;
  private camera?: Camera;
  private cameraSync?: ConstructionLightSync;
  private readonly macros: ShaderMacro[] = [];
  private readonly cameraPosition = new Float64Array(3).fill(NaN);
  private readonly policyCamera = new Float64Array(3);
  private inputLights: ConstructionDecorationLight[] = [];
  private sameLights(lights: readonly ConstructionDecorationLight[]): boolean {
    if (lights.length !== this.inputLights.length) return false;
    for (let i = 0; i < lights.length; i++) {
      const a = lights[i],
        b = this.inputLights[i];
      if (a.id !== b.id || a.ownerId !== b.ownerId || a.intensity !== b.intensity || a.range !== b.range) return false;
      for (let c = 0; c < 3; c++) if (a.position[c] !== b.position[c] || a.color[c] !== b.color[c]) return false;
    }
    return true;
  }
  constructor(parent: Entity, budget = 4) {
    this.policy = new ConstructionDecorationLightPolicy(budget);
    this.root = parent.createChild("MasonryLocalLights");
    this.root.isActive = false;
    for (let i = 0; i < budget; i++) {
      const emitter = this.root.createChild("slot-" + i).addComponent(PointLight);
      emitter.shadowType = ShadowType.None;
      emitter.color.set(0, 0, 0, 1);
      emitter.distance = 3.5;
      // Keep the scene's light count stable after construction: idle slots carry
      // zero energy, avoiding shader-variant churn as the camera moves.
      this.emitters.push(emitter);
    }
    this.metrics.allocated = budget;
  }
  update(lights: readonly ConstructionDecorationLight[], camera: Camera, deltaSeconds = 1 / 60): void {
    if (this.disposed) return;
    const cameraChanged = this.camera !== camera;
    if (cameraChanged) {
      this.cameraSync?.destroy();
      this.camera = camera;
      this.cameraSync = camera.entity.addComponent(ConstructionLightSync);
      this.cameraSync.sync = () => this.publishIdentity();
    }
    const p = camera.entity.transform.worldPosition;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw Error("Finite light camera/time required");
    const sameLights = this.sameLights(lights);
    if (
      !cameraChanged &&
      this.policy.settled &&
      sameLights &&
      this.cameraPosition[0] === p.x &&
      this.cameraPosition[1] === p.y &&
      this.cameraPosition[2] === p.z &&
      ConstructionDecorationLights.publishers.get(this.root.scene!) === this
    )
      return;
    const policyCamera = this.policyCamera;
    policyCamera[0] = p.x;
    policyCamera[1] = p.y;
    policyCamera[2] = p.z;
    const slots = this.policy.update(lights, policyCamera, deltaSeconds);
    this.cameraPosition[0] = p.x;
    this.cameraPosition[1] = p.y;
    this.cameraPosition[2] = p.z;
    if (!sameLights) this.inputLights = lights.map((l) => ({ ...l, position: [...l.position], color: [...l.color] }));
    this.positions.fill(0);
    this.colors.fill(0);
    this.metrics.active = 0;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i],
        light = slot.descriptor,
        energy = (light?.intensity ?? 0) * slot.weight,
        emitter = this.emitters[i];
      if (light) {
        const position = light.position,
          x = position[0],
          y = position[1],
          z = position[2],
          offset = i * 4;
        emitter.entity.transform.setWorldPosition(x, y, z);
        emitter.distance = light.range;
        emitter.color.set(light.color[0] * energy, light.color[1] * energy, light.color[2] * energy, 1);
        this.positions[offset] = x;
        this.positions[offset + 1] = y;
        this.positions[offset + 2] = z;
        this.positions[offset + 3] = light.range;
        this.colors[offset] = light.color[0];
        this.colors[offset + 1] = light.color[1];
        this.colors[offset + 2] = light.color[2];
        this.colors[offset + 3] = energy;
        if (energy > 0) this.metrics.active++;
      } else emitter.color.set(0, 0, 0, 1);
    }
    this.metrics.updates++;
    this.root.isActive = this.metrics.active > 0;
    ConstructionDecorationLights.publishers.set(this.root.scene!, this);
    this.publish();
  }
  private publish() {
    const data = this.root.scene!.shaderData;
    data.setFloatArray(positionRangeProperty, this.positions);
    data.setFloatArray(colorIntensityProperty, this.colors);
  }
  private publishIdentity() {
    // LightManager packs the scene before onBeginRender. Read the same public
    // macro count and the light's engine-owned index; never match by position or
    // assume that removing another light preserves its unordered-array slot.
    const scene = this.root.scene!;
    if (ConstructionDecorationLights.publishers.get(scene) !== this) return;
    const macros = this.macros;
    macros.length = 0;
    scene.shaderData.getMacros(macros);
    let count = 0;
    for (let i = 0, n = macros.length; i < n; i++) {
      if (macros[i].name === "SCENE_POINT_LIGHT_COUNT") {
        count = Number(macros[i].value ?? 0);
        break;
      }
    }
    let owned = 0,
      legacy = 0,
      fallback = 0;
    if (this.root.isActiveInHierarchy) {
      for (let slot = 0; slot < this.emitters.length; slot++) {
        const light = this.emitters[slot],
          index = (light as PointLight & { _lightIndex: number })._lightIndex;
        const local = this.colors[slot * 4 + 3] > Math.fround(0.0001);
        if (light.enabled && index >= 0 && index < count) {
          owned |= 1 << index;
          if (local) legacy |= 1 << index;
        } else if (local) fallback |= 1 << slot;
      }
    }
    macros.length = 0;
    scene.shaderData.setInt(pointMaskProperty, owned);
    scene.shaderData.setInt(legacyMaskProperty, legacy);
    scene.shaderData.setInt(fallbackMaskProperty, fallback);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cameraSync?.destroy();
    this.cameraSync = undefined;
    this.camera = undefined;
    this.positions.fill(0);
    this.colors.fill(0);
    this.metrics.active = 0;
    if (ConstructionDecorationLights.publishers.get(this.root.scene!) === this) {
      this.publish();
      for (const name of ["scene_MasonryPointMask", "scene_MasonryLegacyMask", "scene_MasonryFallbackMask"])
        this.root.scene!.shaderData.setInt(name, 0);
      ConstructionDecorationLights.publishers.delete(this.root.scene!);
    }
    this.root.destroy();
  }
}
