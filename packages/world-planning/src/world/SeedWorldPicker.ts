import surfacePackSource from "./SnapshotSurfacePack.shader?raw";
import interactionDepthSource from "./InteractionDepthPack.shader?raw";
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
  ParticleRenderer,
  RenderTarget,
  Texture2D,
  TextureFormat,
  Blitter,
  Material,
  Shader,
  Script,
  TextureFilterMode,
  TextureWrapMode,
  Matrix,
  Vector3,
  type Ray,
  type Entity,
  Vector4
} from "@galacean/engine";
import type { SeedWorldPickBatch, SeedWorldPickSource } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";

import { FrozenViewIdentityTexture } from "./FrozenViewIdentityTexture";
import type { ViewFrame, ViewCaptureMetadata } from "./SeedWorldViewSnapshot";
import type { ViewRef } from "./SeedWorldViewSnapshot";

import { RuntimePickOcclusion } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-pick-occlusion";
const PICK_MACRO = "RENDERER_WORLD_PICK";
const PICK_BASE = "renderer_WorldPickBase";

/** Resume outside the render stack, after the main camera has published its batch buffers. */
class InteractionFrameBoundary extends Script {
  camera!: Camera;
  private finish?: () => void;
  private cancel?: () => void;
  wait(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.finish) throw new Error("Interaction frame wait is already pending");
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener("abort", cancel);
        this.finish = this.cancel = undefined;
      };
      const cancel = () => {
        cleanup();
        reject(signal.reason ?? new Error("Interaction frame wait disposed"));
      };
      this.finish = () => {
        cleanup();
        resolve();
      };
      this.cancel = cancel;
      signal.addEventListener("abort", cancel, { once: true });
    });
  }
  override onEndRender(camera: Camera): void {
    if (camera !== this.camera || !this.finish) return;
    const finish = this.finish;
    queueMicrotask(finish);
  }
  override onDestroy(): void {
    this.cancel?.();
  }
}

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
  private interactionDepth?: Material;
  private interactionBoundary?: InteractionFrameBoundary;
  private interactionTexture?: Texture2D;
  private interactionTarget?: RenderTarget;
  private interactionPending = false;
  private readonly interactionUVs = new Float32Array(16 * 4);
  private readonly interactionBytes = new Uint8Array(16 * 4);
  private interactionIgnoredRoot?: Entity;
  private readonly interactionExcluded = new Set<Renderer>();
  private readonly collectInteractionExclusion = (batch: SeedWorldPickBatch) => {
    if (batch.interactionOccluder === false) this.interactionExcluded.add(batch.renderer);
  };
  private interactionCamera?: Camera;
  private readonly materialEpochs = new WeakMap<Material, number>();
  private readonly collectBound = this.collect.bind(this);

  constructor(private readonly camera: Camera) {}

  /** A query sees the same freshly submitted batches as the user's current frame. No photo or texture copy. */
  waitForFrame(signal: AbortSignal): Promise<void> {
    this.interactionBoundary ??= this.camera.entity.addComponent(InteractionFrameBoundary);
    this.interactionBoundary.camera = this.camera;
    return this.interactionBoundary.wait(signal);
  }

  /** Query one pixel, preserving original shader deformation and coverage. */
  async depthAlongRay(
    visit: SeedWorldPickSource,
    ray: Ray,
    signal?: AbortSignal,
    ignoredRoot?: Entity
  ): Promise<number> {
    return (await this.depthGroup(visit, [ray], signal, ignoredRoot))![0];
  }

  /** Compatible points share one cropped scene render and one tiny readback.
   * Different origins/exclusions remain separate. Large rectangles fall back to
   * individual pixels; this never creates a full-screen picking target. */
  async depthAlongRays(
    visit: SeedWorldPickSource,
    requests: readonly { ray: Ray; ignoredRoot?: Entity }[],
    signal?: AbortSignal,
    stopAfter?: (distance: number, index: number) => boolean
  ): Promise<(number | undefined)[]> {
    const result: (number | undefined)[] = new Array(requests.length);
    // Preserve caller priority. Only adjacent compatible requests share a render;
    // a successful early candidate must not trigger later incompatible renders.
    const read = async (start: number, end: number): Promise<boolean> => {
      const rays = requests.slice(start, end).map((r) => r.ray);
      const depths = await this.depthGroup(visit, rays, signal, requests[start].ignoredRoot);
      if (!depths) {
        const middle = start + Math.floor((end - start) / 2);
        return (await read(start, middle)) || (await read(middle, end));
      }
      for (let i = 0; i < depths.length; i++) result[start + i] = depths[i];
      return depths.some((distance, i) => stopAfter?.(distance, start + i));
    };
    for (let start = 0; start < requests.length; ) {
      const first = requests[start];
      let end = start + 1;
      while (end < requests.length && end - start < 16) {
        const next = requests[end];
        if (
          next.ignoredRoot !== first.ignoredRoot ||
          next.ray.origin.x !== first.ray.origin.x ||
          next.ray.origin.y !== first.ray.origin.y ||
          next.ray.origin.z !== first.ray.origin.z
        )
          break;
        end++;
      }
      if (await read(start, end)) break;
      start = end;
    }
    return result;
  }

  private async depthGroup(
    visit: SeedWorldPickSource,
    rays: readonly Ray[],
    signal?: AbortSignal,
    ignoredRoot?: Entity
  ): Promise<number[] | undefined> {
    const ray = rays[0];
    if (this.interactionPending) throw new Error("Interaction depth query is already pending");
    signal?.throwIfAborted();
    this.interactionPending = true;
    this.interactionIgnoredRoot = ignoredRoot;
    try {
      const camera = this.camera;
      if (!this.interactionDepth) {
        this.interactionDepth = new Material(
          camera.engine,
          Shader.find("SeedWorld/InteractionDepthPack") ?? Shader.create(interactionDepthSource)
        );
        this.interactionTexture = new Texture2D(camera.engine, 16, 1, TextureFormat.R8G8B8A8, false, false);
        this.interactionTarget = new RenderTarget(camera.engine, 16, 1, this.interactionTexture);
        this.interactionCamera = camera.scene!.createRootEntity("Visual interaction depth").addComponent(Camera);
        this.interactionCamera.enabled = false;
        this.interactionCamera.updateRendererVisibility = false;
        this.interactionCamera.registerRenderViewCullingSource({
          cull: (context) => {
            camera.visitRenderViewRenderers((renderer) => {
              if (context.isVisible(renderer.bounds)) context.submit(renderer);
            });
          }
        });
        this.interactionCamera.renderFilter = (renderable) => {
          // UI, transient effects and the camera-attached held item do not block world interaction.
          if (
            !(renderable instanceof Renderer) ||
            renderable instanceof ParticleRenderer ||
            this.interactionExcluded.has(renderable)
          )
            return false;
          for (let entity = renderable.entity; entity; entity = entity.parent!)
            if (entity === camera.entity || entity === this.interactionIgnoredRoot) return false;
          return true;
        };
        this.interactionDepth.isGCIgnored =
          this.interactionTexture.isGCIgnored =
          this.interactionTarget.isGCIgnored =
            true;
      }
      const queryCamera = this.interactionCamera!;
      queryCamera.entity.transform.worldPosition = ray.origin;
      queryCamera.entity.transform.worldRotationQuaternion = camera.entity.transform.worldRotationQuaternion;
      queryCamera.nearClipPlane = camera.nearClipPlane;
      queryCamera.farClipPlane = camera.farClipPlane;
      queryCamera.isOrthographic = camera.isOrthographic;
      queryCamera.cullingMask = camera.cullingMask;
      queryCamera.projectionMatrix = camera.projectionMatrix;
      const points = rays.map((r) => r.getPoint(Math.max(1, camera.nearClipPlane * 2), new Vector3()));
      const uvs = points.map((p) => queryCamera.worldToViewportPoint(p, new Vector3()));
      const onScreen = (uv: Vector3) => uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1 && uv.z > 0;
      if (rays.length === 1 && !onScreen(uvs[0])) {
        queryCamera.entity.transform.lookAt(points[0]);
        queryCamera.worldToViewportPoint(points[0], uvs[0]);
      }
      if (!uvs.every(onScreen)) return rays.length === 1 ? [Infinity] : undefined;
      const projection = camera.projectionMatrix.clone();
      const inverseVP = new Matrix();
      Matrix.multiply(projection, queryCamera.viewMatrix, inverseVP);
      inverseVP.invert();
      const width = camera.engine.canvas.width * camera.viewport.z;
      const height = camera.engine.canvas.height * camera.viewport.w;
      // Both single and batched queries sample native pixel centres. This keeps
      // alpha/edge coverage identical when a caller adds another point to a batch.
      const xs = uvs.map((uv) => Math.min(Math.ceil(width) - 1, Math.floor(uv.x * width)));
      const ys = uvs.map((uv) => Math.min(Math.ceil(height) - 1, Math.floor(uv.y * height)));
      const left = Math.min(...xs),
        top = Math.min(...ys);
      const regionWidth = Math.max(...xs) - left + 1,
        regionHeight = Math.max(...ys) - top + 1;
      // Bound memory/fill cost independently of native DPR. Distant points keep
      // their single-pixel path rather than turning a batch into a screen capture.
      if (rays.length > 1 && regionWidth * regionHeight > Math.min(256 * 256, (width * height) / 4)) return undefined;
      uvs.forEach((uv, i) => uv.set((xs[i] + 0.5) / width, (ys[i] + 0.5) / height, uv.z));
      const crop = projection.clone(),
        m = crop.elements,
        source = projection.elements;
      const cx = (left + regionWidth / 2) / width,
        cy = (top + regionHeight / 2) / height;
      for (let column = 0; column < 4; column++) {
        const i = column * 4;
        m[i] = (width / regionWidth) * (source[i] + (1 - 2 * cx) * source[i + 3]);
        m[i + 1] = (height / regionHeight) * (source[i + 1] + (2 * cy - 1) * source[i + 3]);
      }
      for (let i = 0; i < uvs.length; i++) {
        this.interactionUVs[i * 4] = (uvs[i].x * width - left) / regionWidth;
        // The offscreen camera already flips projection Y, so its texture
        // coordinates follow viewport Y. A second flip mirrors batched samples.
        this.interactionUVs[i * 4 + 1] = (uvs[i].y * height - top) / regionHeight;
      }
      this.interactionDepth!.shaderData.setFloatArray("material_InteractionUVs", this.interactionUVs);
      visit(this.collectInteractionExclusion);
      this.render(visit, {
        width: regionWidth,
        height: regionHeight,
        camera: queryCamera,
        projection: crop,
        visualDepth: true,
        consume: () => {
          // Camera.render clears context.camera on return. Blitter requires an active
          // camera, even outside the normal frame. Restore the borrowed context too.
          const context = (camera.engine as unknown as { _renderContext: { camera: Camera | null } })._renderContext;
          const previous = context.camera;
          context.camera = queryCamera;
          try {
            Blitter.blitTexture(
              camera.engine,
              this.depth!,
              this.interactionTarget!,
              0,
              undefined,
              this.interactionDepth!
            );
          } finally {
            context.camera = previous;
          }
        }
      });
      const bytes = this.interactionBytes;
      await this.interactionTexture!.getPixelBufferAsync(bytes, signal);
      return rays.map((ray, i) => {
        const offset = i * 4;
        const code = bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
        if (code === 16777215) return Infinity;
        const point = points[i],
          uv = uvs[i];
        point.set(uv.x * 2 - 1, 1 - uv.y * 2, (code / 16777215) * 2 - 1);
        Vector3.transformCoordinate(point, inverseVP, point);
        point.subtract(ray.origin);
        return Vector3.dot(point, ray.direction);
      });
    } finally {
      this.interactionPending = false;
      this.interactionIgnoredRoot = undefined;
      this.interactionExcluded.clear();
    }
  }

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

  private render(
    visit: SeedWorldPickSource,
    capture: {
      width: number;
      height: number;
      consume: () => void;
      projection?: Matrix;
      visualDepth?: boolean;
      camera?: Camera;
    }
  ): void {
    const camera = capture.camera ?? this.camera;
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
    const shadows = camera.scene!.castShadows;
    this.savedColor.copyFrom(background.solidColor);
    this.savedMask = mask;
    this.bindingCount = 0;
    this.identityCount = 0;
    try {
      // Final Pass color contains the camera viewport, not the whole screen. Draw IDs
      // into that same image extent without applying the screen viewport a second time.
      if (capturedProjection) {
        camera.projectionMatrix = capture.projection ?? capturedProjection;
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
      if (capture.visualDepth) camera.scene!.castShadows = false;
      else {
        visit(this.collectBound);
        // Photo identities retain their separate material override path.
        this.occlusion.prepare(camera, this.pickedRenderers);
      }
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
      camera.scene!.castShadows = shadows;
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
    this.interactionBoundary?.destroy();
    this.interactionCamera?.entity.destroy();
    this.interactionDepth?.destroy(true);
    this.interactionTarget?.destroy(true);
    this.interactionTexture?.destroy(true);
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
      this.target.isGCIgnored = texture.isGCIgnored = depth.isGCIgnored = true;
      this.depth = depth;
      this.texture = texture;
    } catch (error) {
      depth?.destroy(true);
      texture.destroy(true);
      throw error;
    }
  }
}
