import {
  AntiAliasing,
  BackgroundMode,
  Blitter,
  Camera,
  CameraClearFlags,
  Color,
  Layer,
  Material,
  PostProcessPass,
  PostProcessPassEvent,
  RenderTarget,
  Script,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  Vector2,
  Vector4,
  type Entity,
  type WebGLEngine
} from "@galacean/engine";
import { directorCategory, summarizeDirectorPixels, type DirectorSemanticReport } from "./DirectorSemantic";
import { semanticGeometryShader, semanticCompositeShader } from "./DirectorSemanticShaders";
import type { ColorAssignments } from "./DirectorMask";
import type { PlanningScenePart } from "../../semantic-study/WorldPlanningScene";

type Binding = { part: PlanningScenePart; material: Material; entity: Entity };
type Pending = {
  fence: WebGLSync;
  buffer: WebGLBuffer;
  width: number;
  height: number;
  epoch: number;
  frame: number;
  sampledAt: number;
  position: number[];
  rotation: number[];
};
class DirectorRenderHook extends Script {
  before: (camera: Camera) => void = () => {};
  after: (camera: Camera) => void = () => {};
  override onBeginRender(camera: Camera): void {
    this.before(camera);
  }
  override onEndRender(camera: Camera): void {
    this.after(camera);
  }
}
class DirectorCompositePass extends PostProcessPass {
  draw: (camera: Camera, source: Texture2D, target: RenderTarget) => void = () => {};
  override onRender(camera: Camera, source: Texture2D, target: RenderTarget): void {
    this.draw(camera, source, target);
  }
}
/** Engine-native ID/depth targets and diagnostic post pass. GPU display never waits for CPU statistics. */
export class DirectorSemanticView {
  private readonly auxiliary: Camera;
  private readonly hook: DirectorRenderHook;
  private readonly pass: DirectorCompositePass;
  private readonly composite: Material;
  private readonly gl: WebGL2RenderingContext;
  private visible?: RenderTarget;
  private target?: RenderTarget;
  private statistics?: RenderTarget;
  private pending?: Pending;
  private bindings: Binding[] = [];
  private roles: ColorAssignments = {};
  private active = false;
  private epoch = 0;
  private frame = 0;
  private lastRead = -Infinity;
  private priorPost = true;
  private hasTarget = false;
  private normalMask?: Layer;
  private originalLayers = new WeakMap<Entity, Layer>();
  report?: DirectorSemanticReport;
  error?: string;

  constructor(
    private engine: WebGLEngine,
    private camera: Camera,
    parent: Entity,
    private canvas: HTMLCanvasElement
  ) {
    this.gl = canvas.getContext("webgl2")!;
    this.auxiliary = parent.createChild("Director semantic camera").addComponent(Camera);
    this.auxiliary.enabled = false;
    this.auxiliary.enableHDR = this.auxiliary.enablePostProcess = false;
    this.auxiliary.antiAliasing = AntiAliasing.None;
    this.auxiliary.clearFlags = CameraClearFlags.All;
    this.auxiliary.setReplacementShader(
      Shader.find("Planning/DirectorSemanticGeometry") ?? Shader.create(semanticGeometryShader)
    );
    this.composite = new Material(
      engine,
      Shader.find("Planning/DirectorSemanticComposite") ?? Shader.create(semanticCompositeShader)
    );
    this.pass = new DirectorCompositePass(engine);
    this.pass.isActive = false;
    this.pass.event = PostProcessPassEvent.AfterUber + 100;
    this.pass.draw = (c, s, t) => this.draw(c, s, t);
    engine.addPostProcessPass(this.pass);
    this.hook = camera.entity.addComponent(DirectorRenderHook);
    this.hook.before = (c) => {
      if (c === camera && this.active) this.before();
    };
    this.hook.after = (c) => {
      if (c === camera) this.restoreMask();
    };
  }
  /** Bind actual render materials once per published layout; helpers get no diagnostic identity. */
  bind(bindings: Binding[]): void {
    this.bindings = bindings;
    this.invalidate();
    this.updateIdentities();
  }
  /** Route roles change outlines, never semantic categories. */
  setRoles(roles: ColorAssignments): void {
    if (JSON.stringify(roles) === JSON.stringify(this.roles)) return;
    this.roles = { ...roles };
    this.invalidate();
    this.updateIdentities();
  }
  private updateIdentities(): void {
    const owners = new Map<string, number>();
    this.hasTarget = false;
    for (const { part, material, entity } of this.bindings) {
      const category = directorCategory(part);
      let id = owners.get(part.id);
      if (id === undefined) {
        id = owners.size + 2;
        owners.set(part.id, id);
      }
      if (id > 65535) throw Error("诊断对象超过16位ID容量");
      const role = category === null ? 0 : this.roles[part.id] === "green" ? 2 : this.roles[part.id] === "blue" ? 1 : 0;
      this.hasTarget ||= role === 2;
      if (!this.originalLayers.has(entity)) this.originalLayers.set(entity, entity.layer);
      entity.layer = this.active && role === 2 ? Layer.Layer28 : this.originalLayers.get(entity)!;
      material.shaderData.setVector4(
        "material_DirectorIdentity",
        new Vector4((id % 256) / 255, Math.floor(id / 256) / 255, (category ?? 0) / 255, role / 255)
      );
    }
  }
  /** Enable only in the director; restore the existing presentation when closing diagnostics. */
  setEnabled(value: boolean): void {
    if (value === this.active) return;
    this.active = value;
    this.invalidate();
    if (value) {
      this.priorPost = this.camera.enablePostProcess;
      this.camera.enablePostProcess = true;
    } else this.camera.enablePostProcess = this.priorPost;
    this.pass.isActive = value;
    this.updateIdentities();
    if (!value) this.restoreMask();
    this.canvas.dataset.semanticMode = value ? "engine-id-depth-postpass" : "off";
  }
  /** Preserve editor lighting/post-process updates while the diagnostic pass is active. */
  updatePresentation(update: () => void): void {
    if (!this.active) {
      update();
      return;
    }
    this.camera.enablePostProcess = this.priorPost;
    try {
      update();
      this.priorPost = this.camera.enablePostProcess;
    } finally {
      this.camera.enablePostProcess = true;
    }
  }
  /** Request statistics from a subsequently rendered frame, without blocking the GPU. */
  async sample(signal?: AbortSignal): Promise<DirectorSemanticReport> {
    let epoch = this.visible ? this.epoch : undefined;
    const frame = this.frame,
      start = performance.now();
    this.lastRead = -Infinity;
    while (this.active && (epoch === undefined || epoch === this.epoch)) {
      if (epoch === undefined && this.visible) epoch = this.epoch;
      if (signal?.aborted) throw Error("沿途测量已取消");
      if (this.error) throw Error(this.error);
      if (this.report && this.report.frame > frame) return this.report;
      if (performance.now() - start > 5000) throw Error("语义帧采样超时");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    throw Error("诊断状态已改变");
  }
  private invalidate(): void {
    this.epoch++;
    this.report = undefined;
    delete this.canvas.dataset.semanticReport;
  }
  private makeTarget(width: number, height: number, depth: boolean): RenderTarget {
    const color = new Texture2D(this.engine, width, height, TextureFormat.R8G8B8A8, false, false);
    color.filterMode = TextureFilterMode.Point;
    if (!depth) return new RenderTarget(this.engine, width, height, color, null, 1);
    const z = new Texture2D(this.engine, width, height, TextureFormat.Depth24, false, false);
    z.filterMode = TextureFilterMode.Point;
    return new RenderTarget(this.engine, width, height, color, z, 1);
  }
  private before(): void {
    try {
      this.poll();
      const width = this.canvas.width,
        height = this.canvas.height;
      if (!this.visible || this.visible.width !== width || this.visible.height !== height) {
        this.visible?.destroy(true);
        this.target?.destroy(true);
        this.statistics?.destroy(true);
        this.visible = this.makeTarget(width, height, true);
        this.target = this.makeTarget(width, height, true);
        this.statistics = this.makeTarget(256, Math.max(1, Math.round((256 * height) / width)), false);
        this.invalidate();
      }
      const aux = this.auxiliary,
        scene = this.camera.scene!;
      aux.entity.transform.worldPosition = this.camera.entity.transform.worldPosition;
      aux.entity.transform.worldRotationQuaternion = this.camera.entity.transform.worldRotationQuaternion;
      aux.nearClipPlane = this.camera.nearClipPlane;
      aux.farClipPlane = this.camera.farClipPlane;
      aux.projectionMatrix = this.camera.projectionMatrix.clone();
      aux.cullingMask = this.camera.cullingMask;
      const mode = scene.background.mode,
        color = scene.background.solidColor.clone(),
        shadows = scene.castShadows;
      try {
        scene.background.mode = BackgroundMode.SolidColor;
        scene.background.solidColor = new Color(0, 0, 0, 0);
        scene.castShadows = false;
        aux.renderTarget = this.visible;
        aux.shaderData.setFloat("camera_DirectorTargetOnly", 0);
        aux.render();
        // Rendering even the empty target clears the previous route's projection.
        aux.cullingMask = Layer.Layer28 & this.camera.cullingMask;
        aux.renderTarget = this.target!;
        aux.shaderData.setFloat("camera_DirectorTargetOnly", 1);
        aux.render();
      } finally {
        scene.background.mode = mode;
        scene.background.solidColor = color;
        scene.castShadows = shadows;
      }
      const data = this.composite.shaderData;
      data.setTexture("material_DirectorTarget", this.target!.getColorTexture(0)!);
      data.setTexture("material_DirectorDepth", this.visible.depthTexture!);
      data.setVector2("material_DirectorTexel", new Vector2(1 / width, 1 / height));
      data.setVector2("material_DirectorClip", new Vector2(aux.nearClipPlane, aux.farClipPlane));
      // The post pass replaces the full viewport: avoid drawing the lit scene a second time.
      this.normalMask = this.camera.cullingMask;
      this.camera.cullingMask = 0;
      this.frame++;
      this.canvas.dataset.semanticFrame = String(this.frame);
    } catch (e) {
      this.error = String(e);
      this.canvas.dataset.semanticError = this.error;
      this.setEnabled(false);
    }
  }
  private restoreMask(): void {
    if (this.normalMask !== undefined) {
      this.camera.cullingMask = this.normalMask;
      this.normalMask = undefined;
    }
  }
  private draw(camera: Camera, source: Texture2D, destination: RenderTarget): void {
    if (camera !== this.camera || !this.active || !this.visible) {
      Blitter.blitTexture(this.engine, source, destination);
      return;
    }
    const data = this.composite.shaderData,
      ids = this.visible.getColorTexture(0) as Texture2D;
    if (!this.pending && performance.now() - this.lastRead >= 250) {
      data.setFloat("material_DirectorStatistics", 1);
      Blitter.blitTexture(this.engine, ids, this.statistics!, 0, undefined, this.composite);
      this.enqueueRead();
      this.lastRead = performance.now();
    }
    data.setFloat("material_DirectorStatistics", 0);
    Blitter.blitTexture(this.engine, ids, destination, 0, undefined, this.composite);
  }
  private enqueueRead(): void {
    const gl = this.gl,
      target = this.statistics!,
      previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      previousPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    const buffer = gl.createBuffer()!;
    try {
      // The engine just bound the statistics draw target. Restore raw GL bindings to avoid invalidating its state cache.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING));
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, target.width * target.height * 4, gl.STREAM_READ);
      gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
      gl.flush();
      const p = this.camera.entity.transform.worldPosition,
        q = this.camera.entity.transform.worldRotationQuaternion;
      this.pending = {
        fence,
        buffer,
        width: target.width,
        height: target.height,
        epoch: this.epoch,
        frame: this.frame,
        sampledAt: performance.now(),
        position: [p.x, p.y, p.z],
        rotation: [q.x, q.y, q.z, q.w]
      };
    } finally {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previousPack);
    }
  }
  private poll(): void {
    const pending = this.pending;
    if (!pending) return;
    const gl = this.gl,
      status = gl.clientWaitSync(pending.fence, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return;
    try {
      if (status === gl.WAIT_FAILED) throw Error("诊断异步像素读取失败");
      if (pending.epoch !== this.epoch) return;
      const pixels = new Uint8Array(pending.width * pending.height * 4),
        previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pending.buffer);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
      } finally {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous);
      }
      this.report = {
        ...summarizeDirectorPixels(pixels, pending.width, pending.height),
        frame: pending.frame,
        sampledAt: pending.sampledAt,
        receivedAt: performance.now(),
        position: pending.position,
        rotation: pending.rotation
      };
      if (!this.hasTarget) this.report.targetOcclusion = null;
      this.canvas.dataset.semanticReport = JSON.stringify(this.report);
    } finally {
      gl.deleteSync(pending.fence);
      gl.deleteBuffer(pending.buffer);
      this.pending = undefined;
    }
  }
  /** Release GPU resources and remove the post pass. */
  dispose(): void {
    this.setEnabled(false);
    this.hook.destroy();
    this.pass.destroy();
    this.auxiliary.entity.destroy();
    this.visible?.destroy(true);
    this.target?.destroy(true);
    this.statistics?.destroy(true);
    this.composite.destroy();
    if (this.pending) {
      this.gl.deleteSync(this.pending.fence);
      this.gl.deleteBuffer(this.pending.buffer);
    }
  }
}
