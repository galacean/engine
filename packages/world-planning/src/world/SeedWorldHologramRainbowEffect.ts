import {
  BoundingBox,
  type Engine,
  Entity,
  Material,
  MeshRenderer,
  Script,
  Shader,
  SkinnedMeshRenderer,
  Vector4
} from "@galacean/engine";

const HOLOGRAM_RAINBOW_SHADER_NAME = "SeedWorld/HologramRainbow";
const HOLOGRAM_RAINBOW_ADDITIVE_SHADER_NAME = "SeedWorld/HologramRainbowAdditive";

function buildHologramRainbowShaderSource(name: string, additive: boolean): string {
  const dstFactor = additive ? "BlendFactor.One" : "BlendFactor.OneMinusSourceAlpha";
  return `Shader "${name}" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      BlendState blendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = ${dstFactor};
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = ${dstFactor};
      }
      DepthState depthState {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState rasterState {
        CullMode = CullMode.Off;
      }
      BlendState = blendState;
      DepthState = depthState;
      RasterState = rasterState;
      RenderQueueType = Transparent;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"

      // x: progress [0..1], y: minY, z: maxY, w: mode (0 = clip print/dissolve, 1 = additive sweep)
      vec4 material_HoloParams;
      // x: phase/time, y: opacity, z: bandWidth, w: scanDensity
      vec4 material_HoloStyle;

      struct Attributes {
        vec4 POSITION;
      };

      struct Varyings {
        vec3 positionWS;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attributes) {
        Varyings output;
        vec4 posWS = renderer_ModelMat * attributes.POSITION;
        output.positionWS = posWS.xyz;
        gl_Position = renderer_MVPMat * attributes.POSITION;
        return output;
      }

      vec3 holoRainbowSpectrum(float t) {
        vec3 raw = clamp(abs(mod(fract(t) * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return pow(raw, vec3(2.2));
      }

      void frag(Varyings input) {
        float progress = clamp(material_HoloParams.x, 0.0, 1.0);
        float minY = material_HoloParams.y;
        float maxY = max(minY + 0.15, material_HoloParams.z);
        float mode = material_HoloParams.w;

        float phase = material_HoloStyle.x;
        float opacity = material_HoloStyle.y;
        float band = max(0.08, material_HoloStyle.z);
        float scanDensity = max(4.0, material_HoloStyle.w);

        vec3 dx = dFdx(input.positionWS);
        vec3 dy = dFdy(input.positionWS);
        vec3 faceNormal = cross(dx, dy);
        float normalLen = length(faceNormal);
        vec3 normalWS = normalLen > 1e-5 ? faceNormal / normalLen : vec3(0.0, 1.0, 0.0);
        vec3 viewDir = normalize(camera_Position - input.positionWS);
        float fresnel = pow(1.0 - abs(dot(normalWS, viewDir)), 1.65);

        float scan = 0.78 + 0.22 * sin(input.positionWS.y * scanDensity - phase * 11.0);
        float normY = (input.positionWS.y - minY) / max(0.55, maxY - minY);
        float spectrumCoord = normY * 1.45 + (input.positionWS.x + input.positionWS.z) * 0.36 - phase * 0.85;
        vec3 rainbow = holoRainbowSpectrum(spectrumCoord);

        if (mode < 0.5) {
          // Mode 0: Satisfactory/Zelda bottom-up hologram print-in (0->1) or top-down dissolve (1->0).
          float cutY = mix(minY - band * 0.25, maxY + band * 0.25, progress);
          float delta = cutY - input.positionWS.y;
          if (delta < 0.0) discard;

          float edge = exp(-delta / band);
          float bodyAlpha = clamp(0.42 + fresnel * 0.44 + edge * 0.52, 0.0, 0.96) * scan * opacity;
          vec3 glow = rainbow * (1.75 + fresnel * 1.35 + edge * 2.35);
          gl_FragColor = vec4(glow, bodyAlpha);
        } else {
          // Mode 1: Non-clipping additive rainbow energy sweep over solid PBR surface.
          float sweepY = mix(minY - band, maxY + band, progress);
          float dist = abs(input.positionWS.y - sweepY);
          float wave = smoothstep(band, 0.0, dist);
          float fade = sin(progress * 3.14159265);
          float alpha = clamp((wave * 0.95 + fresnel * 0.42 * fade) * scan * opacity * fade, 0.0, 1.0);
          if (alpha <= 0.004) discard;
          vec3 glow = rainbow * (2.35 + wave * 1.95);
          gl_FragColor = vec4(glow, alpha);
        }
      }
    }
  }
}`;
}

export function getSeedWorldHologramRainbowShader(additive = false): Shader {
  const name = additive ? HOLOGRAM_RAINBOW_ADDITIVE_SHADER_NAME : HOLOGRAM_RAINBOW_SHADER_NAME;
  return Shader.find(name) ?? Shader.create(buildHologramRainbowShaderSource(name, additive))!;
}

export function createSeedWorldHologramRainbowMaterial(engine: Engine, additive: boolean): Material {
  return new Material(engine, getSeedWorldHologramRainbowShader(additive));
}

interface RendererMaterialBackup {
  readonly renderer: MeshRenderer;
  readonly materials: readonly (Material | null)[];
  readonly castShadows: boolean;
}

/** Tracks active Phase-1 material swaps so re-entrant effects restore canonical materials before snapshotting. */
const activeCreateRestorers = new WeakMap<MeshRenderer, () => void>();

function collectMeshRenderers(roots: readonly Entity[]): MeshRenderer[] {
  const result: MeshRenderer[] = [];
  const seen = new Set<MeshRenderer>();
  const visit = (entity: Entity) => {
    if (entity.destroyed || entity.pendingDestroy) return;
    const renderers = entity.getComponents(MeshRenderer, []);
    for (const renderer of renderers) {
      if (!renderer.destroyed && !(renderer instanceof SkinnedMeshRenderer) && renderer.mesh && !seen.has(renderer)) {
        seen.add(renderer);
        result.push(renderer);
      }
    }
    for (const child of entity.children) visit(child);
  };
  for (const root of roots) visit(root);
  return result;
}

function computeRenderersYRange(renderers: readonly MeshRenderer[]): { minY: number; maxY: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  const box = new BoundingBox();
  for (const renderer of renderers) {
    if (renderer.destroyed) continue;
    const bounds = renderer.bounds;
    if (bounds && Number.isFinite(bounds.min.y) && Number.isFinite(bounds.max.y) && bounds.max.y > bounds.min.y) {
      minY = Math.min(minY, bounds.min.y);
      maxY = Math.max(maxY, bounds.max.y);
    } else if (renderer.mesh?.bounds) {
      BoundingBox.transform(renderer.mesh.bounds, renderer.entity.transform.worldMatrix, box);
      minY = Math.min(minY, box.min.y);
      maxY = Math.max(maxY, box.max.y);
    }
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    const y = renderers[0]?.entity.transform.worldPosition.y ?? 0;
    return { minY: y, maxY: y + 1.5 };
  }
  if (maxY - minY < 0.15) maxY = minY + 0.15;
  return { minY, maxY };
}

function createGhostOverlay(
  hostParent: Entity,
  renderers: readonly MeshRenderer[],
  material: Material,
  name: string
): Entity {
  const container = hostParent.createChild(name);
  for (let i = 0; i < renderers.length; i++) {
    const source = renderers[i]!;
    if (source.destroyed || !source.mesh) continue;
    const child = container.createChild(`HoloGhost-${i}`);
    child.transform.worldMatrix = source.entity.transform.worldMatrix;
    const ghost = child.addComponent(MeshRenderer);
    ghost.mesh = source.mesh;
    ghost.castShadows = false;
    ghost.receiveShadows = false;
    const slotCount = Math.max(1, source.mesh.subMeshes.length, source.materialCount);
    for (let slot = 0; slot < slotCount; slot++) ghost.setMaterial(slot, material);
  }
  return container;
}

class HologramRainbowAnimationScript extends Script {
  private _step?: (deltaTime: number) => boolean;
  private _cleanup?: () => void;
  private _done = false;

  start(step: (deltaTime: number) => boolean, cleanup: () => void): void {
    this._step = step;
    this._cleanup = cleanup;
    this._done = false;
  }

  finish(): void {
    if (this._done) return;
    this._done = true;
    const cleanup = this._cleanup;
    this._step = undefined;
    this._cleanup = undefined;
    cleanup?.();
  }

  override onUpdate(deltaTime: number): void {
    if (this._done || !this._step) return;
    const keepGoing = this._step(deltaTime);
    if (!keepGoing) {
      this.finish();
      if (!this.destroyed) this.destroy();
    }
  }

  override onDestroy(): void {
    this.finish();
  }
}

export interface HologramRainbowEffectOptions {
  readonly durationMs?: number;
  readonly signal?: AbortSignal;
  readonly onComplete?: () => void;
}

/**
 * Satisfactory / Zelda-style shared hologram rainbow print-in for arbitrary GLB/PBR entities:
 * Phase 1 (0..62%): replaces renderer materials with one shared precompiled rainbow hologram shader,
 * printing bottom-to-top without touching or recompiling PBR shaders.
 * Phase 2 (62%..100%): restores original PBR materials and sweeps an additive rainbow shell upward.
 */
export function playHologramRainbowCreateEffect(
  roots: readonly Entity[],
  options: HologramRainbowEffectOptions = {}
): Promise<void> {
  const renderers = collectMeshRenderers(roots);
  if (!renderers.length || options.signal?.aborted) {
    options.onComplete?.();
    return Promise.resolve();
  }
  const primary = roots.find((r) => !r.destroyed && !r.pendingDestroy);
  const scene = primary?.scene;
  if (!primary || !scene) {
    options.onComplete?.();
    return Promise.resolve();
  }

  const engine = primary.engine;
  const totalSec = Math.max(0.25, (options.durationMs ?? 1450) / 1000);
  const phase1Split = 0.62;
  const { minY, maxY } = computeRenderersYRange(renderers);
  const height = maxY - minY;
  const band = Math.max(0.26, Math.min(1.6, height * 0.32));
  const scanDensity = Math.max(8, Math.min(28, 16 / Math.max(0.6, Math.sqrt(height))));

  const holoMat = createSeedWorldHologramRainbowMaterial(engine, false);
  const sweepMat = createSeedWorldHologramRainbowMaterial(engine, true);
  const params = new Vector4(0, minY, maxY, 0);
  const style = new Vector4(0, 1, band, scanDensity);
  holoMat.shaderData.setVector4("material_HoloParams", params);
  holoMat.shaderData.setVector4("material_HoloStyle", style);

  // If any renderer already has an in-flight Phase-1 hologram swap, settle it synchronously first
  // so our backup always captures the authentic original PBR materials rather than a temporary holoMat.
  for (const renderer of renderers) {
    activeCreateRestorers.get(renderer)?.();
  }

  const backups: RendererMaterialBackup[] = renderers.map((renderer) => ({
    renderer,
    materials: [...renderer.getMaterials()],
    castShadows: renderer.castShadows
  }));

  let restored = false;
  let overlayEntity: Entity | undefined;
  let settleOwner: (() => void) | undefined;
  const restoreOriginals = () => {
    if (restored) return;
    restored = true;
    for (const backup of backups) {
      const ownsSlot = activeCreateRestorers.get(backup.renderer) === settleOwner;
      if (ownsSlot) activeCreateRestorers.delete(backup.renderer);
      if (!ownsSlot || backup.renderer.destroyed) continue;
      backup.renderer.setMaterials([...backup.materials]);
      backup.renderer.castShadows = backup.castShadows;
    }
  };

  return new Promise<void>((resolve) => {
    const runnerHost = scene.createRootEntity("SeedWorldHoloCreateRunner");
    const script = runnerHost.addComponent(HologramRainbowAnimationScript);
    let elapsed = 0;
    let settled = false;

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      restoreOriginals();
      if (overlayEntity && !overlayEntity.destroyed) overlayEntity.destroy();
      overlayEntity = undefined;
      if (!holoMat.destroyed) holoMat.destroy();
      if (!sweepMat.destroyed) sweepMat.destroy();
      if (!runnerHost.destroyed) runnerHost.destroy();
      if (!settled) {
        settled = true;
        options.onComplete?.();
        resolve();
      }
    };

    const onAbort = () => script.finish();
    settleOwner = onAbort;
    for (const backup of backups) {
      if (backup.renderer.destroyed) continue;
      activeCreateRestorers.set(backup.renderer, settleOwner);
      backup.renderer.castShadows = false;
      const count = Math.max(1, backup.materials.length, backup.renderer.mesh?.subMeshes.length ?? 1);
      for (let slot = 0; slot < count; slot++) backup.renderer.setMaterial(slot, holoMat);
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    script.start((dt) => {
      if (options.signal?.aborted) return false;
      elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
      const t = Math.min(1, elapsed / totalSec);
      if (t < phase1Split) {
        const p1 = t / phase1Split;
        const eased = 1 - Math.pow(1 - p1, 2.2);
        params.set(eased, minY, maxY, 0);
        style.set(elapsed, 0.96, band, scanDensity);
        holoMat.shaderData.setVector4("material_HoloParams", params);
        holoMat.shaderData.setVector4("material_HoloStyle", style);
        return true;
      }

      if (!restored) {
        restoreOriginals();
        const activeRenderers = renderers.filter((r) => !r.destroyed && r.mesh);
        if (activeRenderers.length) {
          overlayEntity = createGhostOverlay(runnerHost, activeRenderers, sweepMat, "HoloCreateSweep");
        }
      }

      const p2 = (t - phase1Split) / (1 - phase1Split);
      const eased = p2 * p2 * (3 - 2 * p2);
      params.set(eased, minY, maxY, 1);
      style.set(elapsed, 1.1, Math.max(0.24, height * 0.34), scanDensity);
      sweepMat.shaderData.setVector4("material_HoloParams", params);
      sweepMat.shaderData.setVector4("material_HoloStyle", style);
      return t < 1;
    }, cleanup);
  });
}

/**
 * Non-destructive additive rainbow hologram shimmer over solid GLB/PBR entities for Update edits.
 */
export function playHologramRainbowUpdateEffect(
  roots: readonly Entity[],
  options: HologramRainbowEffectOptions = {}
): Promise<void> {
  const renderers = collectMeshRenderers(roots);
  if (!renderers.length || options.signal?.aborted) {
    options.onComplete?.();
    return Promise.resolve();
  }
  const primary = roots.find((r) => !r.destroyed && !r.pendingDestroy);
  const scene = primary?.scene;
  if (!primary || !scene) {
    options.onComplete?.();
    return Promise.resolve();
  }

  const engine = primary.engine;
  const totalSec = Math.max(0.2, (options.durationMs ?? 950) / 1000);
  const { minY, maxY } = computeRenderersYRange(renderers);
  const height = maxY - minY;
  const band = Math.max(0.32, Math.min(2.0, height * 0.46));
  const scanDensity = Math.max(8, Math.min(28, 16 / Math.max(0.6, Math.sqrt(height))));

  const sweepMat = createSeedWorldHologramRainbowMaterial(engine, true);
  const params = new Vector4(0, minY, maxY, 1);
  const style = new Vector4(0, 1.05, band, scanDensity);
  sweepMat.shaderData.setVector4("material_HoloParams", params);
  sweepMat.shaderData.setVector4("material_HoloStyle", style);

  return new Promise<void>((resolve) => {
    const runnerHost = scene.createRootEntity("SeedWorldHoloUpdateRunner");
    const overlayEntity = createGhostOverlay(runnerHost, renderers, sweepMat, "HoloUpdateSweep");
    const script = runnerHost.addComponent(HologramRainbowAnimationScript);
    let elapsed = 0;
    let settled = false;

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      if (!overlayEntity.destroyed) overlayEntity.destroy();
      if (!sweepMat.destroyed) sweepMat.destroy();
      if (!runnerHost.destroyed) runnerHost.destroy();
      if (!settled) {
        settled = true;
        options.onComplete?.();
        resolve();
      }
    };

    const onAbort = () => script.finish();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    script.start((dt) => {
      if (options.signal?.aborted) return false;
      elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
      const t = Math.min(1, elapsed / totalSec);
      const eased = t * t * (3 - 2 * t);
      params.set(eased, minY, maxY, 1);
      style.set(elapsed, 1.05, band, scanDensity);
      sweepMat.shaderData.setVector4("material_HoloParams", params);
      sweepMat.shaderData.setVector4("material_HoloStyle", style);
      return t < 1;
    }, cleanup);
  });
}

export interface HologramGhostSnapshot {
  readonly mesh: MeshRenderer["mesh"];
  readonly worldMatrixElements: Float32Array;
  readonly minY: number;
  readonly maxY: number;
}

/** Snapshot mesh geometry & world transforms before an entity is destroyed so Delete can dissolve a hologram ghost. */
export function snapshotEntitiesForHologramDissolve(roots: readonly Entity[]): HologramGhostSnapshot[] {
  const renderers = collectMeshRenderers(roots);
  const snapshots: HologramGhostSnapshot[] = [];
  const box = new BoundingBox();
  for (const renderer of renderers) {
    if (renderer.destroyed || !renderer.mesh) continue;
    let minY: number;
    let maxY: number;
    const bounds = renderer.bounds;
    if (bounds && Number.isFinite(bounds.min.y) && Number.isFinite(bounds.max.y) && bounds.max.y > bounds.min.y) {
      minY = bounds.min.y;
      maxY = bounds.max.y;
    } else if (renderer.mesh.bounds) {
      BoundingBox.transform(renderer.mesh.bounds, renderer.entity.transform.worldMatrix, box);
      minY = box.min.y;
      maxY = box.max.y;
    } else {
      const y = renderer.entity.transform.worldPosition.y;
      minY = y;
      maxY = y + 1.5;
    }
    snapshots.push({
      mesh: renderer.mesh,
      worldMatrixElements: new Float32Array(renderer.entity.transform.worldMatrix.elements),
      minY,
      maxY
    });
  }
  return snapshots;
}

/**
 * Plays a top-down rainbow hologram dissolve on ghost copies of deleted entities.
 */
export function playHologramRainbowDeleteEffect(
  engine: Engine,
  scene: Entity["scene"],
  snapshots: readonly HologramGhostSnapshot[],
  options: HologramRainbowEffectOptions = {}
): Promise<void> {
  if (!snapshots.length || !scene || options.signal?.aborted) {
    options.onComplete?.();
    return Promise.resolve();
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (const snap of snapshots) {
    minY = Math.min(minY, snap.minY);
    maxY = Math.max(maxY, snap.maxY);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    options.onComplete?.();
    return Promise.resolve();
  }
  if (maxY - minY < 0.15) maxY = minY + 0.15;
  const height = maxY - minY;
  const band = Math.max(0.18, Math.min(1.4, height * 0.26));
  const scanDensity = Math.max(8, Math.min(28, 16 / Math.max(0.6, Math.sqrt(height))));
  const totalSec = Math.max(0.2, (options.durationMs ?? 700) / 1000);

  const holoMat = createSeedWorldHologramRainbowMaterial(engine, false);
  const params = new Vector4(1, minY, maxY, 0);
  const style = new Vector4(0, 0.96, band, scanDensity);
  holoMat.shaderData.setVector4("material_HoloParams", params);
  holoMat.shaderData.setVector4("material_HoloStyle", style);

  return new Promise<void>((resolve) => {
    const runnerHost = scene.createRootEntity("SeedWorldHoloDeleteRunner");
    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i]!;
      if (!snap.mesh || snap.mesh.destroyed) continue;
      const child = runnerHost.createChild(`HoloDeleteGhost-${i}`);
      const wm = child.transform.worldMatrix;
      wm.elements.set(snap.worldMatrixElements);
      child.transform.worldMatrix = wm;
      const ghost = child.addComponent(MeshRenderer);
      ghost.mesh = snap.mesh;
      ghost.castShadows = false;
      ghost.receiveShadows = false;
      const slotCount = Math.max(1, snap.mesh.subMeshes.length);
      for (let slot = 0; slot < slotCount; slot++) ghost.setMaterial(slot, holoMat);
    }

    const script = runnerHost.addComponent(HologramRainbowAnimationScript);
    let elapsed = 0;
    let settled = false;

    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      if (!holoMat.destroyed) holoMat.destroy();
      if (!runnerHost.destroyed) runnerHost.destroy();
      if (!settled) {
        settled = true;
        options.onComplete?.();
        resolve();
      }
    };

    const onAbort = () => script.finish();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    script.start((dt) => {
      if (options.signal?.aborted) return false;
      elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
      const t = Math.min(1, elapsed / totalSec);
      const eased = 1 - t * t;
      params.set(eased, minY, maxY, 0);
      style.set(elapsed, Math.max(0.05, 0.96 * (1 - t * 0.35)), band, scanDensity);
      holoMat.shaderData.setVector4("material_HoloParams", params);
      holoMat.shaderData.setVector4("material_HoloStyle", style);
      return t < 1;
    }, cleanup);
  });
}
