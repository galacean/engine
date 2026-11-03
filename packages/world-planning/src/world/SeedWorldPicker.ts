import { SeedWorldPickSnapshot, type SnapshotIdentity } from "./SeedWorldPickSnapshot";
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
  ScreenSpaceReflectionActivationMode,
  Texture2D,
  TextureFormat,
  Matrix,
  Vector3,
  type Material
} from "@galacean/engine";
import type { SeedWorldPickBatch, SeedWorldPickSource } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";

import { FrozenViewIdentityTexture } from "./FrozenViewIdentityTexture";
import type { ViewFrame } from "./SeedWorldViewSnapshot";
import type { ViewRef } from "./SeedWorldViewSnapshot";

import { RuntimePickOcclusion } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-pick-occlusion";
const PICK_MACRO = "RENDERER_WORLD_PICK";
const PICK_BASE = "renderer_WorldPickBase";

/** Point and immutable-view framebuffer picking. IDs and unregistered occluders share one render with the original geometry and coverage. */
export class SeedWorldPicker {
  /** Borrowed world-space fragment from the latest successful pick; copy before the next pick. */
  hitPosition?: Vector3;
  private texture?: Texture2D;
  private target?: RenderTarget;
  private readonly pixel = new Uint8Array(4);

  private readonly inverse = new Matrix();
  private readonly position = new Vector3();
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

  /** Render real visible variants without reading pixels or publishing a selection. */
  warmup(visit: SeedWorldPickSource): void {
    this.render(0, 0, visit, true);
  }

  /** Exercise the exact photo/identity paths before the screenshot command is exposed. No retained snapshot or readback. */
  async prepareSnapshot(visit: SeedWorldPickSource, signal?: AbortSignal, budget?: ImageResourceBudget): Promise<void> {
    signal?.throwIfAborted();
    this.frameCapture ??= this.camera.entity.addComponent(SeedWorldFrameCapture);
    await this.frameCapture.request(
      (photo) => {
        const release = budget?.reserve("temporary", photo.width * photo.height * 8);
        try {
          this.render(0, 0, visit, false, { width: photo.width, height: photo.height, consume: () => {} });
        } finally {
          photo.dispose();
          this.releaseTarget();
          release?.();
        }
      },
      signal,
      budget
    );
  }

  /** Coordinates are drawing-buffer pixels, with the same top-left origin as the canvas. */
  pick(x: number, y: number, visit: SeedWorldPickSource): string | undefined {
    this.hitPosition = undefined;
    return this.render(x, y, visit, false);
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
    return this.frameCapture.request((photo) => this.captureIdentity(visit, resolveRef, photo), signal, budget, ready);
  }

  observe(signal?: AbortSignal, budget?: ImageResourceBudget) {
    this.frameCapture ??= this.camera.entity.addComponent(SeedWorldFrameCapture);
    return this.frameCapture.request(
      async (photo) => {
        try {
          return await photo.export([], signal);
        } finally {
          photo.dispose();
        }
      },
      signal,
      budget
    );
  }

  /** Task-local CPU identity/depth snapshot using the shared occlusion-aware pick pass. */
  capturePointer(width: number, height: number, visit: SeedWorldPickSource): SeedWorldPickSnapshot {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width * height > 1280 * 1280
    )
      throw new Error("Pick snapshot exceeds image dimensions");
    const camera = this.camera;
    let result: SeedWorldPickSnapshot | undefined;
    try {
      this.render(0, 0, visit, false, {
        width,
        height,
        consume: () => {
          const identities = new Uint8Array(width * height * 4);
          this.texture!.getPixelBuffer(0, 0, width, height, 0, identities);
          const visible = new Set<number>();
          for (let offset = 0; offset < identities.length; offset += 4)
            visible.add(identities[offset]! | (identities[offset + 1]! << 8) | (identities[offset + 2]! << 16));
          visible.delete(0);
          const objects = new Map<number, SnapshotIdentity>();
          let bindingIndex = 0;
          const regions = new Map<object, SnapshotIdentity | undefined>();
          for (const id of [...visible].sort((a, b) => a - b)) {
            while (
              bindingIndex < this.bindingCount &&
              id >= this.bindings[bindingIndex]!.base + this.bindings[bindingIndex]!.batch!.count
            )
              bindingIndex++;
            if (bindingIndex >= this.bindingCount) break;
            const { batch, base } = this.bindings[bindingIndex]!;
            if (id < base) continue;
            if (batch!.needsPosition) {
              const key = batch!.snapshotKey ?? batch!;
              if (!regions.has(key)) regions.set(key, batch!.snapshotResolver?.());
              const region = regions.get(key);
              if (region) objects.set(id, region);
            } else {
              const objectId = batch!.resolve(id - base);
              if (objectId) objects.set(id, objectId);
            }
          }
          for (let i = 0; i < this.bindingCount; i++)
            this.bindings[i]!.batch!.renderer.shaderData.enableMacro("RENDERER_WORLD_PICK_DEPTH");
          camera.render();
          const depths = new Uint8Array(identities.length);
          this.texture!.getPixelBuffer(0, 0, width, height, 0, depths);
          const inverse = new Matrix();
          Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, inverse);
          inverse.invert();
          const viewport = camera.viewport;
          result = new SeedWorldPickSnapshot(width, height, identities, depths, objects, inverse, [
            viewport.x,
            viewport.y,
            viewport.z,
            viewport.w
          ]);
        }
      });
      if (!result) throw new Error("Pick snapshot is unavailable");
      return result;
    } finally {
      this.releaseTarget();
    }
  }

  /** Freeze color and pointer identity in the same normal frame; encoding may then await. */
  observePointer(visit: SeedWorldPickSource, signal: AbortSignal, budget: ImageResourceBudget, ready?: () => boolean) {
    this.frameCapture ??= this.camera.entity.addComponent(SeedWorldFrameCapture);
    return this.frameCapture.request(
      async (photo) => {
        let snapshot: SeedWorldPickSnapshot | undefined;
        let release: (() => void) | undefined;
        try {
          signal.throwIfAborted();
          const releaseScratch = budget.reserve("temporary", photo.width * photo.height * 16);
          try {
            snapshot = this.capturePointer(photo.width, photo.height, visit);
          } finally {
            releaseScratch();
          }
          release = budget.reserve("identity", snapshot.byteLength);
          const image = await photo.export([], signal);
          signal.throwIfAborted();
          return { image, snapshot };
        } catch (error) {
          snapshot?.dispose();
          throw error;
        } finally {
          release?.();
          photo.dispose();
        }
      },
      signal,
      budget,
      ready
    );
  }

  private captureIdentity(
    visit: SeedWorldPickSource,
    resolveRef: (batch: SeedWorldPickBatch) => ViewRef,
    image: GpuPhoto
  ): ViewFrame {
    const { width, height } = image;
    let result: ViewFrame | undefined;
    let detachedTarget: RenderTarget | undefined;
    try {
      // Runs synchronously in the normal camera's onEndRender: no simulation step
      // can separate the frozen color from the identity pass.
      this.render(0, 0, visit, false, {
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
          result = { width, height, image, identities: new FrozenViewIdentityTexture(this.texture!, ranges) };
          detachedTarget = this.target;
          this.texture = undefined;
          this.target = undefined;
        }
      });
      if (!result) throw new Error("View snapshot is unavailable");
      return result;
    } finally {
      detachedTarget?.destroy(true);
    }
  }

  private render(
    x: number,
    y: number,
    visit: SeedWorldPickSource,
    warmup: boolean,
    capture?: { width: number; height: number; consume: () => void; prepare?: () => void }
  ): string | undefined {
    const camera = this.camera;
    const canvas = camera.engine.canvas;
    // Color and IDs share the delivered image resolution, avoiding native-DPR readback costs.
    const width = capture?.width ?? canvas.width;
    const height = capture?.height ?? canvas.height;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) return;
    if (this.rendering) throw new Error("World picking is not reentrant");
    if (capture && width * height > 16 * 1024 * 1024) throw new Error("Viewport exceeds snapshot memory budget");
    this.resize(width, height);
    const background = camera.scene!.background;
    this.rendering = true;
    this.epoch++;
    const target = camera.renderTarget,
      clear = camera.clearFlags,
      mask = camera.cullingMask;
    const hdr = camera.enableHDR,
      post = camera.enablePostProcess,
      aa = camera.antiAliasing;
    const depthMode = camera.depthTextureMode,
      opaque = camera.opaqueTextureEnabled;
    const ssr = camera.screenSpaceReflection.activationMode,
      ao = camera.scene!.ambientOcclusion.enabled;
    const backgroundMode = background.mode;
    this.savedColor.copyFrom(background.solidColor);
    this.savedMask = mask;
    this.bindingCount = 0;
    this.identityCount = 0;
    try {
      camera.renderTarget = this.target!;
      camera.clearFlags = CameraClearFlags.All;
      camera.enableHDR = camera.enablePostProcess = camera.opaqueTextureEnabled = false;
      camera.antiAliasing = AntiAliasing.None;
      camera.depthTextureMode = DepthTextureMode.None;
      camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOff;
      camera.scene!.ambientOcclusion.enabled = false;
      background.mode = BackgroundMode.SolidColor;
      background.solidColor = this.black;
      visit(this.collectBound);
      // Clone unregistered materials before registered batches borrow shared shaders.
      if (!capture?.prepare) this.occlusion.prepare(camera, this.pickedRenderers);
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
      if (capture?.prepare) {
        capture.prepare();
        return;
      }
      // A single ID render owns its depth test, including unregistered occluders.
      camera.clearFlags = CameraClearFlags.All;
      camera.render();
      if (capture) {
        capture.consume();
        return;
      }
      if (warmup) {
        for (let i = 0; i < this.bindingCount; i++)
          this.bindings[i]!.batch!.renderer.shaderData.enableMacro("RENDERER_WORLD_PICK_DEPTH");
        camera.render();
        return;
      }
      this.texture!.getPixelBuffer(Math.floor(x), Math.floor(y), 1, 1, 0, this.pixel);
      const id = this.pixel[0]! | (this.pixel[1]! << 8) | (this.pixel[2]! << 16);
      let hit: (typeof this.bindings)[number] | undefined;
      for (let i = 0; i < this.bindingCount; i++) {
        const binding = this.bindings[i]!;
        if (id >= binding.base && id < binding.base + binding.batch!.count) {
          hit = binding;
          break;
        }
      }
      if (!hit) return;
      for (let i = 0; i < this.bindingCount; i++)
        this.bindings[i]!.batch!.renderer.shaderData.enableMacro("RENDERER_WORLD_PICK_DEPTH");
      camera.render();
      this.texture!.getPixelBuffer(Math.floor(x), Math.floor(y), 1, 1, 0, this.pixel);
      const depth = (this.pixel[0]! | (this.pixel[1]! << 8) | (this.pixel[2]! << 16)) / 0xffffff;
      const inverse = this.inverse;
      Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, inverse);
      inverse.invert();
      const viewport = camera.viewport;
      const position = this.position;
      position.set(
        (((Math.floor(x) + 0.5) / width - viewport.x) / viewport.z) * 2 - 1,
        1 - (((Math.floor(y) + 0.5) / height - viewport.y) / viewport.w) * 2,
        depth * 2 - 1
      );
      Vector3.transformCoordinate(position, inverse, position);
      this.hitPosition = position;
      return hit.batch!.resolve(id - hit.base, position);
    } finally {
      for (let i = this.bindingCount - 1; i >= 0; i--) {
        const binding = this.bindings[i]!,
          batch = binding.batch!;
        if (binding.prepared) batch.restore?.();
        batch.renderer.shaderData.disableMacro(PICK_MACRO);
        batch.renderer.shaderData.disableMacro("RENDERER_WORLD_PICK_DEPTH");
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
      camera.clearFlags = clear;
      camera.cullingMask = mask;
      camera.enableHDR = hdr;
      camera.enablePostProcess = post;
      camera.antiAliasing = aa;
      camera.depthTextureMode = depthMode;
      camera.opaqueTextureEnabled = opaque;
      camera.screenSpaceReflection.activationMode = ssr;
      camera.scene!.ambientOcclusion.enabled = ao;
      background.mode = backgroundMode;
      background.solidColor = this.savedColor;
      this.rendering = false;
    }
  }

  dispose(): void {
    this.frameCapture?.destroy();
    this.frameCapture = undefined;
    this.releaseTarget();
  }

  private releaseTarget(): void {
    this.target?.destroy(true);
    this.texture?.destroy(true);
    this.target = undefined;
    this.texture = undefined;
  }

  private resize(width: number, height: number): void {
    if (this.target?.width === width && this.target.height === height) return;
    this.releaseTarget();
    const texture = new Texture2D(this.camera.engine, width, height, TextureFormat.R8G8B8A8, false, false);
    try {
      this.target = new RenderTarget(this.camera.engine, width, height, texture, TextureFormat.Depth24Stencil8, 1);
      this.texture = texture;
    } catch (error) {
      texture.destroy(true);
      throw error;
    }
  }
}
