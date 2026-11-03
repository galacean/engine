import { registerWaterContentRestorer } from "../resources/WaterContentRestorer";
import { registerWaterMeshContentRestorer } from "../resources/WaterMeshContentRestorer";
import {
  VertexAttribute,
  type Engine,
  type Entity,
  Material,
  MeshRenderer,
  ModelMesh,
  Script,
  Shader,
  Texture2D,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";
import {
  WATER_CONTACT_EFFECT_KINDS,
  resolveWaterContactEffectsLook,
  type WaterContactEffectsLook
} from "../../authoring/effects/WaterContactEffectsLook";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "../query/WaterSurfaceProvider";
import { destroyWaterOwnedMesh } from "../resources/destroyWaterOwnedMesh";
import { waterContactEffectActivation, type WaterContactEffectSource } from "./WaterContactEffectSource";
import { createWaterContactSurfaceMask, WATER_CONTACT_MASK_SIZE } from "./WaterContactSurfaceMask";
import shaderSource from "../../shaders/effects/WaterContactEffects.shader?raw";

/** Generic visual consumer of a published water provider. Never mutates water or terrain. */
export class WaterContactEffects {
  readonly root: Entity;
  private mesh?: ModelMesh;
  private readonly emitters: {
    source: WaterContactEffectSource;
    entity: Entity;
    renderer: MeshRenderer;
    material: Material;
    velocity: Vector3;
    normal: Vector3;
    contactMask?: Texture2D;
    maskDirty: boolean;
  }[] = [];
  private readonly sample = createWaterSurfaceSample();
  private readonly position = new Vector3();
  private readonly origin = new Vector3();
  private look?: WaterContactEffectsLook;
  private destroyed = false;
  private fixedTime?: number;
  private visible = true;
  private activeCount = 0;
  constructor(
    private readonly engine: Engine,
    parent: Entity,
    sources: readonly WaterContactEffectSource[],
    private readonly provider: WaterSurfaceProvider,
    private readonly textures: ReadonlyMap<string, Texture2D>
  ) {
    this.root = parent.createChild("water-contact-effects");
    try {
      const mesh = (this.mesh = new ModelMesh(engine));
      const positions: Vector3[] = [],
        uv: Vector2[] = [],
        indices: number[] = [];
      for (let particle = 0; particle < 24; particle++) {
        for (const corner of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1]
        ]) {
          positions.push(new Vector3(particle, 0, 0));
          uv.push(new Vector2(...corner));
        }
        const i = particle * 4;
        indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      }
      mesh.setPositions(positions);
      mesh.setUVs(uv);
      mesh.setIndices(new Uint16Array(indices));
      mesh.addSubMesh(0, indices.length);
      // Conservative bounds include the maximum validated size/lifetime/rise and bounded advection.
      mesh.bounds.min.set(-100, -140, -100);
      mesh.bounds.max.set(100, 100, 100);
      mesh.uploadData(true);
      registerWaterMeshContentRestorer(engine, mesh, () => ({
        vertexCount: 96,
        indices: new Uint16Array(
          Array.from({ length: 24 }, (_, particle) => {
            const i = particle * 4;
            return [i, i + 2, i + 1, i + 1, i + 2, i + 3];
          }).flat()
        ),
        read: (attribute, vertex, component) =>
          attribute === VertexAttribute.Position
            ? component === 0
              ? Math.floor(vertex / 4)
              : 0
            : component === 0
              ? vertex % 2
              : Math.floor((vertex % 4) / 2)
      }));
      const shader = Shader.find("Water/ContactEffects") ?? Shader.create(shaderSource);
      const ids = new Set<string>();
      for (const source of sources) {
        if (
          !source.id ||
          ids.has(source.id) ||
          !WATER_CONTACT_EFFECT_KINDS.includes(source.kind) ||
          !Number.isFinite(source.seed) ||
          !Number.isFinite(source.width) ||
          source.width <= 0 ||
          source.width > 30 ||
          source.samplePosition.length !== 3 ||
          source.offset.length !== 3 ||
          ![...source.samplePosition, ...source.offset].every(Number.isFinite)
        )
          throw new RangeError("Invalid water contact effect source.");
        ids.add(source.id);
        const entity = this.root.createChild(source.id);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.priority = 10;
        renderer.castShadows = renderer.receiveShadows = false;
        const material = new Material(engine, shader);
        renderer.setMaterial(material);
        this.emitters.push({
          source: structuredClone(source),
          entity,
          renderer,
          material,
          velocity: new Vector3(),
          normal: new Vector3(0, 1, 0),
          maskDirty: true
        });
        entity.isActive = false;
      }
      const owner = this;
      class ContactEffectsUpdate extends Script {
        override onUpdate() {
          owner.update();
        }
      }
      this.root.addComponent(ContactEffectsUpdate);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  setLook(input?: WaterContactEffectsLook) {
    const look = input && resolveWaterContactEffectsLook(input);
    // Resolve all dependencies before changing any live material.
    if (look)
      for (const kind of WATER_CONTACT_EFFECT_KINDS)
        if (!this.textures.has(look[kind].textureId))
          throw new Error(`Missing water effect texture: ${look[kind].textureId}`);
    if (look)
      for (const emitter of this.emitters) {
        const style = look[emitter.source.kind],
          data = emitter.material.shaderData;
        data.setTexture("material_EffectAtlas", this.textures.get(style.textureId)!);
        data.setVector4("material_EffectColor", new Vector4(...style.color, 1));
        data.setVector4(
          "material_EffectShape",
          new Vector4(style.size, style.opacity, style.density, emitter.source.width)
        );
        data.setVector4(
          "material_EffectMotion",
          new Vector4(style.lifetime, style.rise, style.spread, emitter.source.kind === "mist" ? 0.2 : 0.65)
        );
        data.setVector4(
          "material_EffectAtlasInfo",
          new Vector4(style.atlasColumns, style.atlasRows, WATER_CONTACT_EFFECT_KINDS.indexOf(emitter.source.kind), 0)
        );
        data.setFloat("material_EffectSeed", emitter.source.seed);
      }
    const previous = this.look?.whitewater;
    const next = look?.whitewater;
    if (previous?.size !== next?.size || previous?.spread !== next?.spread || previous?.lifetime !== next?.lifetime)
      this.invalidateSurface();
    this.look = look;
    this.update();
  }
  /** Rebuild contact masks after the provider publishes a changed macro surface. */
  invalidateSurface() {
    for (const emitter of this.emitters) emitter.maskDirty = true;
  }
  setTime(time?: number) {
    if (time !== undefined && (!Number.isFinite(time) || time < 0)) throw new RangeError("Invalid effect time.");
    this.fixedTime = time;
    this.update();
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    this.update();
  }
  get metrics() {
    return {
      emitterCount: this.emitters.length,
      activeEmitterCount: this.activeCount,
      particleCapacity: this.emitters.length * 24,
      time: this.fixedTime ?? this.engine.time.elapsedTime,
      destroyed: this.destroyed
    };
  }
  private update() {
    if (this.destroyed) return;
    this.activeCount = 0;
    const time = this.fixedTime ?? this.engine.time.elapsedTime;
    for (const emitter of this.emitters) {
      const { source, entity, material } = emitter;
      const style = this.look?.[source.kind];
      this.position.set(...source.samplePosition);
      const hit =
        this.visible &&
        !!style?.enabled &&
        style.opacity > 0 &&
        style.density > 0 &&
        this.provider.sampleSurface(this.position, this.sample);
      const activation = hit
        ? waterContactEffectActivation(this.sample.waterVelocity.length(), this.sample.waterDepth)
        : 0;
      entity.isActive = activation > 0;
      if (!entity.isActive) continue;
      this.activeCount++;
      this.origin.copyFrom(this.sample.surfacePosition);
      this.origin.x += source.offset[0];
      this.origin.y += source.offset[1];
      this.origin.z += source.offset[2];
      entity.transform.worldPosition = this.origin;
      if (source.kind === "whitewater" && emitter.maskDirty && this.root.isActiveInHierarchy) {
        const radius = source.width / 2 + style!.spread / 2 + style!.size * 1.7 + 3 * style!.lifetime * 0.65 + 0.2;
        const pixels = createWaterContactSurfaceMask(this.provider, this.origin, this.sample.surfaceNormal, radius);
        const mask = (emitter.contactMask ??= new Texture2D(
          this.engine,
          WATER_CONTACT_MASK_SIZE,
          WATER_CONTACT_MASK_SIZE,
          TextureFormat.R8G8B8A8,
          false,
          false
        ));
        mask.filterMode = TextureFilterMode.Bilinear;
        mask.wrapModeU = mask.wrapModeV = TextureWrapMode.Clamp;
        mask.setPixelBuffer(pixels);
        // This mask is invalidated on look/provider changes, not redrawn every frame.
        // Replace the recipe on each upload, retaining only the latest 65x65 RGBA mask.
        registerWaterContentRestorer(this.engine, mask, () => mask.setPixelBuffer(pixels));
        material.shaderData.setTexture("material_ContactSurfaceMask", mask);
        material.shaderData.setVector4(
          "material_ContactMaskBounds",
          new Vector4(this.origin.x, this.origin.z, radius, WATER_CONTACT_MASK_SIZE)
        );
        emitter.maskDirty = false;
      }
      const data = material.shaderData;
      data.setFloat("material_EffectTime", time);
      data.setFloat("material_EffectActivation", activation);
      emitter.velocity.copyFrom(this.sample.waterVelocity);
      emitter.normal.copyFrom(this.sample.surfaceNormal);
      data.setVector3("material_EffectVelocity", emitter.velocity);
      data.setVector3("material_EffectNormal", emitter.normal);
    }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.activeCount = 0;
    this.root.destroy();
    this.emitters.forEach((e) => {
      e.material.destroy();
      e.contactMask?.destroy(true);
    });
    this.emitters.length = 0;
    if (this.mesh) destroyWaterOwnedMesh(this.mesh);
  }
}
