import surfacePackSource from "./SnapshotSurfacePack.shader?raw";
import { snapshotIdentityBits, type SnapshotSurfaceProjection } from "./SnapshotSurfaceEncoding";
import { destroyPhotoResources } from "./SeedWorldPhotoResources";
import type { GpuPhoto } from "./SeedWorldPhotoImage";
import type { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { SeedWorldFrameCapture } from "./SeedWorldFrameCapture";
import {
  AntiAliasing,
  BackgroundMode,
  Camera,
  CameraClearFlags,
  Color,
  CompareFunction,
  DepthTextureMode,
  Renderer,
  RenderTarget,
  Texture2D,
  TextureFormat,
  Blitter,
  Material,
  Shader,
  TextureFilterMode,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";
import type { SeedWorldPickBatch, SeedWorldPickSource } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";

import { FrozenViewIdentityTexture } from "./FrozenViewIdentityTexture";
import type { ViewFrame, ViewCaptureMetadata } from "./SeedWorldViewSnapshot";
import type { ViewRef } from "./SeedWorldViewSnapshot";

import { RuntimePickOcclusion } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-pick-occlusion";
const PICK_MACRO = "RENDERER_WORLD_PICK";
const PICK_BASE = "renderer_WorldPickBase";

/** Immutable photo identity/depth capture, using the visible geometry and coverage. */
export class SeedWorldPicker {
  private texture?: Texture2D;
  private depth?: Texture2D;
  private surfacePack?: Material;
  private target?: RenderTarget;

  private readonly savedColor = new Color();
  private readonly black = new Color(0, 0, 0, 1);
  private readonly bindings: { batch?: SeedWorldPickBatch; base: number; prepared: boolean }[] = [];
  private bindingCount = 0;
  private identityCount = 0;
  private savedMask = 0;
  private readonly materials: (Material | undefined)[] = [];
  private readonly compares: number[] = [];
  private materialCount = 0;
  private readonly pickedRenderers = new Set<Renderer>();
  private readonly occlusion = new RuntimePickOcclusion();
  private rendering = false;
  private epoch = 0;
  private frameCapture?: SeedWorldFrameCapture;
  private readonly materialEpochs = new WeakMap<Material, number>();
  private readonly collectBound = this.collect.bind(this);

  constructor(private readonly camera: Camera) {}

  private collect(batch: SeedWorldPickBatch): void {
    if (!(batch.renderer.entity.layer & this.savedMask) || batch.count <= 0) return;
    if (this.identityCount + batch.count > 0xffffff) throw new Error("World picking exceeds the 24-bit identity range");
    if (this.pickedRenderers.has(batch.renderer)) throw new Error("Duplicate renderer in world pick source");
    this.pickedRenderers.add(batch.renderer);
    const index = this.bindingCount++;
    let binding = this.bindings[index];
    if (!binding) this.bindings[index] = binding = { base: 0, prepared: false };
    binding.batch = batch;
    binding.base = this.identityCount + 1;
    binding.prepared = false;
    this.identityCount += batch.count;
  }
  private overrideMaterial(material: Material): void {
    if (this.materialEpochs.get(material) === this.epoch) return;
    this.materialEpochs.set(material, this.epoch);
    this.materials[this.materialCount] = material;
    this.compares[this.materialCount++] =
      material.shaderData.getFloat("material_WorldPickDepthCompare") ?? CompareFunction.Less;
    material.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.Less);
  }

  /** Exercise the exact photo/identity paths before the screenshot command is exposed. No retained snapshot or readback. */
  async prepareSnapshot(visit: SeedWorldPickSource, signal?: AbortSignal, budget?: ImageResourceBudget): Promise<void> {
    signal?.throwIfAborted();
    this.frameCapture ??= this.camera.entity.addComponent(SeedWorldFrameCapture);
    await this.frameCapture.request(
      (photo) => {
        const frame = this.captureIdentity(
          visit,
          () => ({ entityId: 0, componentId: 0, componentType: "warmup" }),
          photo,
          budget
        );
        frame.identities.dispose();
        photo.dispose();
      },
      signal,
      budget
    );
  }

  /** Wait for the next normal camera frame; consume its color and draw IDs without advancing simulation. */
  capture(
    visit: SeedWorldPickSource,
    resolveRef: (batch: SeedWorldPickBatch) => ViewRef,
    signal?: AbortSignal,
    budget?: ImageResourceBudget,
    ready?: () => boolean
  ): Promise<ViewFrame> {
    this.frameCapture ??= this.camera.entity.addComponent(SeedWorldFrameCapture);
    return this.frameCapture.request(
      (photo) => this.captureIdentity(visit, resolveRef, photo, budget),
      signal,
      budget,
      ready
    );
  }

  /** Called synchronously in the captured color frame, before asynchronous image encoding. */
  private captureViewMetadata(): ViewCaptureMetadata {
    const { worldPosition: p, worldForward: f } = this.camera.entity.transform;
    return {
      capturedAt: new Date().toISOString(),
      viewer: {
        position: [p.x, p.y, p.z],
        forward: [f.x, f.y, f.z]
      }
    };
  }

  private captureIdentity(
    visit: SeedWorldPickSource,
    resolveRef: (batch: SeedWorldPickBatch) => ViewRef,
    image: GpuPhoto,
    budget?: ImageResourceBudget
  ): ViewFrame {
    const { width, height } = image;
    const metadata = this.captureViewMetadata();
    // Scratch ID + depth + packed output. Only the packed RGBA8 survives capture.
    const release = budget?.reserve("temporary", width * height * 12);
    let result: ViewFrame | undefined;
    let packed: Texture2D | undefined, packedTarget: RenderTarget | undefined;
    try {
      // No simulation step can separate color, identity and depth.
      this.render(visit, {
        width,
        height,
        consume: () => {
          const ranges = this.bindings.slice(0, this.bindingCount).map(({ base, batch }) => {
            const ref = { ...resolveRef(batch!) },
              instanced = !!batch!.instanced || batch!.count > 1;
            return {
              base,
              count: batch!.count,
              ref,
              instanced,
              keys: instanced ? Array.from({ length: batch!.count }, (_, index) => batch!.resolve(index)) : undefined
            };
          });
          const camera = this.camera,
            engine = camera.engine;
          const inverseProjection = camera.projectionMatrix.clone().invert();
          const v = camera.viewport,
            identityBits = snapshotIdentityBits(this.identityCount);
          const projection: SnapshotSurfaceProjection = {
            identityBits,
            near: camera.nearClipPlane,
            far: camera.farClipPlane,
            inverseProjection: Array.from(inverseProjection.elements),
            cameraWorld: Array.from(camera.viewMatrix.clone().invert().elements),
            viewport: [v.x, v.y, v.z, v.w]
          };
          if (!(projection.near > 0) || !Number.isFinite(projection.far) || projection.far <= projection.near)
            throw new Error("Snapshot depth requires finite clipping distances with 0 < near < far");
          if (!this.surfacePack) {
            this.surfacePack = new Material(
              engine,
              Shader.find("SeedWorld/SnapshotSurfacePack") ?? Shader.create(surfacePackSource)
            );
            this.surfacePack.isGCIgnored = true;
          }
          const data = this.surfacePack.shaderData;
          data.setTexture("material_SurfaceDepth", this.depth!);
          data.setMatrix("material_InverseProjection", inverseProjection);
          data.setVector4("material_SurfaceViewport", v);
          data.setVector4(
            "material_SurfaceEncoding",
            new Vector4(
              projection.near,
              projection.far,
              1 / Math.log2(projection.far / projection.near),
              2 ** (32 - identityBits) - 1
            )
          );
          data.setVector4(
            "material_DepthByteScale",
            new Vector4(
              0,
              identityBits >= 16 ? 0 : 2 ** (identityBits - 8),
              identityBits >= 24 ? 0 : 2 ** (identityBits - 16),
              2 ** (identityBits - 24)
            )
          );
          packed = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false, false);
          packed.filterMode = TextureFilterMode.Point;
          packed.wrapModeU = packed.wrapModeV = TextureWrapMode.Clamp;
          packedTarget = new RenderTarget(engine, width, height, packed, null, 1);
          // Camera.render() clears the Engine context before returning. Blitter requires
          // the just-rendered camera for uniform binding; restore its context afterwards.
          const context = (engine as unknown as { _renderContext: { camera: Camera | null; flipProjection: boolean } })
            ._renderContext;
          const priorCamera = context.camera,
            priorFlip = context.flipProjection;
          try {
            context.camera = camera;
            Blitter.blitTexture(engine, this.texture!, packedTarget, 0, undefined, this.surfacePack);
          } finally {
            context.camera = priorCamera;
            context.flipProjection = priorFlip;
          }
          result = {
            width,
            height,
            image,
            metadata,
            identities: new FrozenViewIdentityTexture(packed, ranges, projection)
          };
        }
      });
      if (!result) throw new Error("View snapshot is unavailable");
      return result;
    } finally {
      this.surfacePack?.shaderData.setTexture("material_SurfaceDepth", null!);
      const scratch = [this.target, this.texture, this.depth, packedTarget, result ? undefined : packed];
      this.target = undefined;
      this.texture = undefined;
      this.depth = undefined;
      destroyPhotoResources(scratch, release);
    }
  }

  private render(visit: SeedWorldPickSource, capture: { width: number; height: number; consume: () => void }): void {
    const camera = this.camera;
    // Color and IDs share the delivered image resolution, avoiding native-DPR readback costs.
    const { width, height } = capture;
    if (this.rendering) throw new Error("Photo identity capture is not reentrant");
    if (width * height > 16 * 1024 * 1024) throw new Error("Viewport exceeds snapshot memory budget");
    this.resize(width, height);
    const background = camera.scene!.background;
    this.rendering = true;
    this.epoch++;
    const target = camera.renderTarget,
      clear = camera.clearFlags,
      mask = camera.cullingMask;
    const capturedProjection = camera.projectionMatrix.clone();
    const capturedViewport = camera.viewport.clone();
    const customProjection = (camera as unknown as { _isCustomProjectionMatrix: boolean })._isCustomProjectionMatrix;
    const hdr = camera.enableHDR,
      post = camera.enablePostProcess,
      aa = camera.antiAliasing;
    const depthMode = camera.depthTextureMode,
      opaque = camera.opaqueTextureEnabled;
    const ssr = camera.screenSpaceReflection.renderingEnabled,
      ao = camera.scene!.ambientOcclusion.enabled;
    const backgroundMode = background.mode;
    this.savedColor.copyFrom(background.solidColor);
    this.savedMask = mask;
    this.bindingCount = 0;
    this.identityCount = 0;
    try {
      // Final Pass color contains the camera viewport, not the whole screen. Draw IDs
      // into that same image extent without applying the screen viewport a second time.
      if (capturedProjection) {
        camera.projectionMatrix = capturedProjection;
        camera.viewport.set(0, 0, 1, 1);
      }
      camera.renderTarget = this.target!;
      camera.clearFlags = CameraClearFlags.All;
      camera.enableHDR = camera.enablePostProcess = camera.opaqueTextureEnabled = false;
      camera.antiAliasing = AntiAliasing.None;
      camera.depthTextureMode = DepthTextureMode.None;
      camera.screenSpaceReflection.renderingEnabled = false;
      camera.scene!.ambientOcclusion.enabled = false;
      background.mode = BackgroundMode.SolidColor;
      background.solidColor = this.black;
      visit(this.collectBound);
      // Clone unregistered materials before registered batches borrow shared shaders.
      this.occlusion.prepare(camera, this.pickedRenderers);
      for (let i = 0; i < this.bindingCount; i++) {
        const binding = this.bindings[i]!,
          batch = binding.batch!,
          renderer = batch.renderer;
        const materials = renderer.getMaterials();
        for (let j = 0; j < materials.length; j++) if (materials[j]) this.overrideMaterial(materials[j]!);
        if (batch.prepare) {
          binding.prepared = true;
          batch.prepare();
        }
        renderer.shaderData.setFloat(PICK_BASE, binding.base);
        renderer.shaderData.setFloat("renderer_WorldPickInstanced", batch.instanced ? 1 : 0);
        renderer.shaderData.enableMacro(PICK_MACRO);
      }
      // A single ID render owns its depth test, including unregistered occluders.
      camera.clearFlags = CameraClearFlags.All;
      camera.render();
      capture.consume();
    } finally {
      for (let i = this.bindingCount - 1; i >= 0; i--) {
        const binding = this.bindings[i]!,
          batch = binding.batch!;
        if (binding.prepared) batch.restore?.();
        batch.renderer.shaderData.disableMacro(PICK_MACRO);
        binding.batch = undefined;
        binding.prepared = false;
      }
      this.bindingCount = 0;
      this.pickedRenderers.clear();
      this.occlusion.restore();
      while (this.materialCount) {
        const i = --this.materialCount;
        this.materials[i]!.shaderData.setFloat("material_WorldPickDepthCompare", this.compares[i]!);
        this.materials[i] = undefined;
      }
      camera.renderTarget = target;
      if (capturedViewport) camera.viewport.copyFrom(capturedViewport);
      if (capturedProjection) {
        camera.projectionMatrix = capturedProjection;
        if (!customProjection) camera.resetProjectionMatrix();
      }
      camera.clearFlags = clear;
      camera.cullingMask = mask;
      camera.enableHDR = hdr;
      camera.enablePostProcess = post;
      camera.antiAliasing = aa;
      camera.depthTextureMode = depthMode;
      camera.opaqueTextureEnabled = opaque;
      camera.screenSpaceReflection.renderingEnabled = ssr;
      camera.scene!.ambientOcclusion.enabled = ao;
      background.mode = backgroundMode;
      background.solidColor = this.savedColor;
      this.rendering = false;
    }
  }

  dispose(): void {
    this.frameCapture?.destroy();
    this.frameCapture = undefined;
    this.surfacePack?.destroy(true);
    this.surfacePack = undefined;
    this.releaseTarget();
  }

  private releaseTarget(): void {
    this.target?.destroy(true);
    this.texture?.destroy(true);
    this.depth?.destroy(true);
    this.depth = undefined;
    this.target = undefined;
    this.texture = undefined;
  }

  private resize(width: number, height: number): void {
    if (this.target?.width === width && this.target.height === height) return;
    this.releaseTarget();
    const texture = new Texture2D(this.camera.engine, width, height, TextureFormat.R8G8B8A8, false, false);
    let depth: Texture2D | undefined;
    try {
      depth = new Texture2D(this.camera.engine, width, height, TextureFormat.Depth24Stencil8, false);
      texture.filterMode = depth.filterMode = TextureFilterMode.Point;
      texture.wrapModeU = texture.wrapModeV = depth.wrapModeU = depth.wrapModeV = TextureWrapMode.Clamp;
      this.target = new RenderTarget(this.camera.engine, width, height, texture, depth, 1);
      this.depth = depth;
      this.texture = texture;
    } catch (error) {
      depth?.destroy(true);
      texture.destroy(true);
      throw error;
    }
  }
}
