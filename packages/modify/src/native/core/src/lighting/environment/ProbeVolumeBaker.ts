import { BoundingBox, Color, Matrix, SphericalHarmonics3, Vector3, Vector4 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Layer } from "../../Layer";
import { BackgroundMode } from "../../enums/BackgroundMode";
import { Scene } from "../../Scene";
import { Renderer } from "../../Renderer";
import { RenderTarget, Texture2D, TextureCube, TextureCubeFace, TextureFormat } from "../../texture";
import {
  ProbeBrickCellCount,
  ProbeBrickData,
  ProbeBrickProbeCountPerDimension,
  ProbeVisibilityResolution,
  ProbeVolume
} from "./ProbeVolume";
import { ProbeVolumeRegion } from "./ProbeVolumeRegion";
import { ProbeVolumeSamplingMode } from "./ProbeVolumeSamplingMode";

/** Brick placement consumed by {@link ProbeVolumeBaker}. */
export interface ProbeBrickLayout {
  /** Brick minimum corner in probe-local space. */
  position: Vector3;
  /** Brick size is `minBrickSize * 3 ^ subdivisionLevel`. */
  subdivisionLevel: number;
}

/** Probe brick placement generated for a region before radiance capture. */
export interface ProbeVolumeRegionLayout {
  /** Smallest brick size in layout space. */
  minBrickSize: number;
  /** Bricks that will be captured by the baker. */
  layouts: ProbeBrickLayout[];
  /** Transform from layout space to world space. */
  localToWorldMatrix: Matrix;
}

/** Progress reported while probe captures are being baked. */
export interface ProbeVolumeBakeProgress {
  /** Number of unique probe positions captured across all bounces. */
  completedProbes: number;
  /** Total number of unique probe captures required across all bounces. */
  totalProbes: number;
  /** Current bounce, starting at one. */
  bounce: number;
  /** Total number of requested bounces. */
  bounceCount: number;
}

/** Options for rasterizing probe radiance into spherical harmonics. */
export interface ProbeVolumeBakeOptions {
  /** Name assigned to the baked lighting scenario. Defaults to "Default". */
  lightingScenario?: string;
  /** Camera whose render pipeline is reused for captures. Defaults to the first enabled scene camera. */
  camera?: Camera;
  /** Cubemap face resolution. Defaults to 8. */
  resolution?: number;
  /** Capture near plane in world units. Defaults to 0.05. */
  nearClipPlane?: number;
  /** Capture far plane in world units. Defaults to 100. */
  farClipPlane?: number;
  /** Static layers visible to probe captures and adaptive placement. Exclude dynamic objects. Defaults to every layer. */
  cullingMask?: Layer;
  /**
   * Number of raster feedback passes. The first pass captures emissive and direct-light energy after it is
   * reflected by scene geometry, which is the first indirect bounce seen by a receiver. Defaults to 1.
   */
  bounceCount?: number;
  /** Multiplier applied once to the final baked indirect irradiance. Defaults to 1. */
  indirectIntensity?: number;
  /** Transform from brick layout space to world space. Defaults to identity. */
  localToWorldMatrix?: Matrix;
  /**
   * Exclude sky and ambient environment lighting from the baked probe radiance so a dynamic runtime
   * environment can be applied through sky occlusion without double ownership. Defaults to true.
   */
  separateEnvironment?: boolean;
  /** Bake sunlight reflected by scene geometry into the probe SH without baking direct sunlight. Defaults to true. */
  bakeSunIndirect?: boolean;
  /** Probe placement strategy. Adaptive placement is intended for terrain and large worlds. */
  placementMode?: "uniform" | "adaptive";
  /** Largest adaptive brick level. Defaults to 2. */
  maxSubdivisionLevel?: number;
  /** Distance from static renderer bounds covered by probes. Defaults to two minimum bricks. */
  surfaceDistance?: number;
  /** Number of unique probes captured before yielding to the host. Defaults to one. */
  probesPerBatch?: number;
  /** Called after each capture batch with current bake progress. */
  onProgress?: (progress: ProbeVolumeBakeProgress) => void;
}

interface CubeFaceBasis {
  forward: Vector3;
  up: Vector3;
  right: Vector3;
}

/**
 * Rasterizes the scene from each probe and projects the captured cubemap radiance into SH.
 * @remarks This is an asynchronous offline authoring utility. It does not use ray tracing.
 */
export class ProbeVolumeBaker {
  /**
   * Bake a freely placed, rotated, and scaled probe region.
   * @param scene - Scene to capture
   * @param region - Region component whose entity transform controls placement
   * @param options - Capture options
   */
  static async bakeRegion(
    scene: Scene,
    region: ProbeVolumeRegion,
    options: ProbeVolumeBakeOptions = {}
  ): Promise<ProbeVolume> {
    const { minBrickSize, layouts, localToWorldMatrix } = ProbeVolumeBaker.createRegionLayout(scene, region, options);
    return ProbeVolumeBaker.bake(scene, minBrickSize, layouts, {
      ...options,
      localToWorldMatrix
    });
  }

  /**
   * Bake another named lighting scenario into an existing probe volume.
   * @remarks Reuses the existing brick layout so all scenarios remain GPU-blendable.
   */
  static async bakeLightingScenario(
    scene: Scene,
    volume: ProbeVolume,
    scenarioName: string,
    options: ProbeVolumeBakeOptions = {}
  ): Promise<ProbeVolume> {
    const layouts = volume.bricks.map((brick) => ({
      position: brick.position.clone(),
      subdivisionLevel: brick.subdivisionLevel
    }));
    const scenarioVolume = await ProbeVolumeBaker.bake(scene, volume.minBrickSize, layouts, {
      ...options,
      lightingScenario: scenarioName,
      localToWorldMatrix: volume.localToWorldMatrix
    });
    try {
      volume.addLightingScenario(scenarioName, scenarioVolume);
    } finally {
      scenarioVolume.dispose();
    }
    return volume;
  }

  /** Generate the exact brick layout used by {@link bakeRegion} without capturing lighting. */
  static createRegionLayout(
    scene: Scene,
    region: ProbeVolumeRegion,
    options: ProbeVolumeBakeOptions = {}
  ): ProbeVolumeRegionLayout {
    if (region.scene !== scene) {
      throw new Error("ProbeVolumeRegion must belong to the scene being baked.");
    }
    const { size, minBrickSize } = region;
    if (!(size.x > 0) || !(size.y > 0) || !(size.z > 0)) {
      throw new Error("ProbeVolumeRegion size components must be greater than zero.");
    }
    if (!(minBrickSize > 0)) {
      throw new Error("ProbeVolumeRegion minBrickSize must be greater than zero.");
    }

    let countX = Math.max(1, Math.ceil(size.x / minBrickSize));
    let countY = Math.max(1, Math.ceil(size.y / minBrickSize));
    let countZ = Math.max(1, Math.ceil(size.z / minBrickSize));
    const maxSubdivisionLevel = options.maxSubdivisionLevel ?? 2;
    if (!Number.isInteger(maxSubdivisionLevel) || maxSubdivisionLevel < 0) {
      throw new Error("ProbeVolumeBaker maxSubdivisionLevel must be a non-negative integer.");
    }
    if (options.placementMode === "adaptive") {
      const coarseCellCount = Math.pow(ProbeBrickCellCount, maxSubdivisionLevel);
      countX = Math.ceil(countX / coarseCellCount) * coarseCellCount;
      countY = Math.ceil(countY / coarseCellCount) * coarseCellCount;
      countZ = Math.ceil(countZ / coarseCellCount) * coarseCellCount;
    }

    const gridSizeX = countX * minBrickSize;
    const gridSizeY = countY * minBrickSize;
    const gridSizeZ = countZ * minBrickSize;
    const gridToRegion = new Matrix(
      size.x / gridSizeX,
      0,
      0,
      0,
      0,
      size.y / gridSizeY,
      0,
      0,
      0,
      0,
      size.z / gridSizeZ,
      0,
      -size.x * 0.5,
      -size.y * 0.5,
      -size.z * 0.5,
      1
    );
    const localToWorldMatrix = new Matrix();
    Matrix.multiply(region.entity.transform.worldMatrix, gridToRegion, localToWorldMatrix);

    const layouts =
      options.placementMode === "adaptive"
        ? generateAdaptiveLayouts(
            scene,
            minBrickSize,
            countX,
            countY,
            countZ,
            localToWorldMatrix,
            maxSubdivisionLevel,
            options.surfaceDistance ?? minBrickSize * 2,
            options.cullingMask ?? Layer.Everything
          )
        : generateUniformLayouts(minBrickSize, countX, countY, countZ);
    if (layouts.length === 0) {
      throw new Error("ProbeVolumeBaker adaptive placement found no static renderer bounds in the region.");
    }
    return { minBrickSize, layouts, localToWorldMatrix };
  }

  /**
   * Bake probe bricks using six HDR raster captures per unique probe position.
   * @param scene - Scene to capture
   * @param minBrickSize - Smallest brick size in layout units
   * @param layouts - Probe brick placement
   * @param options - Capture options
   * @returns A probe volume containing incoming-radiance SH
   */
  static async bake(
    scene: Scene,
    minBrickSize: number,
    layouts: ProbeBrickLayout[],
    options: ProbeVolumeBakeOptions = {}
  ): Promise<ProbeVolume> {
    if (!(minBrickSize > 0)) {
      throw new Error("ProbeVolumeBaker minBrickSize must be greater than zero.");
    }
    if (layouts.length === 0) {
      throw new Error("ProbeVolumeBaker requires at least one brick layout.");
    }

    const resolution = options.resolution ?? 8;
    const bounceCount = options.bounceCount ?? 1;
    const indirectIntensity = options.indirectIntensity ?? 1;
    const probesPerBatch = options.probesPerBatch ?? 1;
    if (!Number.isInteger(resolution) || resolution < 2) {
      throw new Error("ProbeVolumeBaker resolution must be an integer greater than or equal to 2.");
    }
    if (!Number.isInteger(bounceCount) || bounceCount < 1) {
      throw new Error("ProbeVolumeBaker bounceCount must be an integer greater than or equal to 1.");
    }
    if (!Number.isFinite(indirectIntensity) || indirectIntensity < 0) {
      throw new Error("ProbeVolumeBaker indirectIntensity must be a finite non-negative number.");
    }
    if (!Number.isInteger(probesPerBatch) || probesPerBatch < 1) {
      throw new Error("ProbeVolumeBaker probesPerBatch must be an integer greater than or equal to 1.");
    }

    validateLayouts(layouts);

    const localToWorldMatrix = options.localToWorldMatrix?.clone() ?? new Matrix();
    if (Math.abs(localToWorldMatrix.determinant()) < 1e-8) {
      throw new Error("ProbeVolumeBaker localToWorldMatrix must be invertible.");
    }

    const engine = scene.engine;
    if (!engine._hardwareRenderer.isWebGL2) {
      throw new Error("ProbeVolumeBaker requires WebGL2 HDR cubemap rendering and readback.");
    }

    const cubeTexture = new TextureCube(engine, resolution, TextureFormat.R16G16B16A16, false, false);
    const depthTexture = new Texture2D(engine, resolution, resolution, TextureFormat.Depth32, false, false);
    const renderTarget = new RenderTarget(engine, resolution, resolution, cubeTexture, depthTexture, 1);
    renderTarget.autoGenerateMipmaps = false;

    const camera = options.camera ?? findCaptureCamera(scene);
    const cameraState = storeCameraState(camera);
    camera.enabled = false;
    camera.renderTarget = renderTarget;
    camera.enableHDR = true;
    camera.isAlphaOutputRequired = true;
    camera.enablePostProcess = false;
    camera.enableFrustumCulling = true;
    camera.nearClipPlane = options.nearClipPlane ?? 0.05;
    camera.farClipPlane = options.farClipPlane ?? 100;
    camera.fieldOfView = 90;
    camera.cullingMask = options.cullingMask ?? Layer.Everything;

    const originalVolume = scene.environmentLighting.probeVolume;
    const worldBrickSize = minBrickSize * getMinimumAxisScale(localToWorldMatrix);
    const probeClearance = Math.max(camera.nearClipPlane * 2, (worldBrickSize / ProbeBrickCellCount) * 0.15);
    let bakedVolume: ProbeVolume | undefined;
    const visibilityCache = new Map<string, CapturedGeometry>();
    const ambientLight = scene.ambientLight;
    const background = scene.background;
    const sun = scene.sun ?? scene._lightManager._getMaxBrightestSunlight();
    const environmentState = {
      diffuseIntensity: ambientLight.diffuseIntensity,
      specularIntensity: ambientLight.specularIntensity,
      backgroundMode: background.mode,
      backgroundColor: background.solidColor.clone(),
      sunEnabled: sun?.enabled
    };
    const probesPerBounce = countUniqueProbePositions(minBrickSize, layouts);
    const totalProbes = probesPerBounce * bounceCount;
    let completedProbes = 0;
    scene.environmentLighting.probeVolume = undefined;
    scene.shaderData.enableMacro("SCENE_PROBE_BAKE_CAPTURE");

    try {
      if (options.separateEnvironment ?? true) {
        ambientLight.diffuseIntensity = 0;
      }
      // Probe SH stores diffuse irradiance. Keep environment specular out of the
      // feedback passes and use a transparent background as the sky mask.
      ambientLight.specularIntensity = 0;
      background.mode = BackgroundMode.SolidColor;
      background.solidColor.set(0, 0, 0, 0);
      if (sun && !(options.bakeSunIndirect ?? true)) {
        sun.enabled = false;
      }
      scene._updateShaderData();
      options.onProgress?.({ completedProbes, totalProbes, bounce: 1, bounceCount });
      await yieldToHost();
      for (let bounce = 0; bounce < bounceCount; bounce++) {
        const bricks = await captureBricks(
          camera,
          cubeTexture,
          minBrickSize,
          layouts,
          localToWorldMatrix,
          resolution,
          visibilityCache,
          probeClearance,
          async () => {
            completedProbes++;
            if (completedProbes % probesPerBatch === 0 || completedProbes === totalProbes) {
              options.onProgress?.({
                completedProbes,
                totalProbes,
                bounce: bounce + 1,
                bounceCount
              });
              await yieldToHost();
            }
          }
        );
        if (bakedVolume) {
          bakedVolume.setBricks(bricks);
        } else {
          bakedVolume = new ProbeVolume(
            minBrickSize,
            bricks,
            localToWorldMatrix,
            options.lightingScenario ?? "Default"
          );
          bakedVolume.samplingMode = ProbeVolumeSamplingMode.PerFragment;
          bakedVolume.normalBias = worldBrickSize * 0.05;
          bakedVolume.visibilityBias = worldBrickSize * 0.05;
        }

        if (bounce + 1 < bounceCount) {
          scene.environmentLighting.probeVolume = bakedVolume;
          scene._updateShaderData();
        }
      }
    } finally {
      ambientLight.diffuseIntensity = environmentState.diffuseIntensity;
      ambientLight.specularIntensity = environmentState.specularIntensity;
      background.mode = environmentState.backgroundMode;
      background.solidColor.copyFrom(environmentState.backgroundColor);
      if (sun && environmentState.sunEnabled !== undefined) {
        sun.enabled = environmentState.sunEnabled;
      }
      scene.environmentLighting.probeVolume = originalVolume;
      scene.shaderData.disableMacro("SCENE_PROBE_BAKE_CAPTURE");
      restoreCameraState(camera, cameraState);
      renderTarget.destroy(true);
      cubeTexture.destroy(true);
      depthTexture.destroy(true);
    }

    if (indirectIntensity !== 1) {
      for (const brick of bakedVolume!.bricks) {
        for (const sh of brick.sphericalHarmonics) {
          sh.scale(indirectIntensity);
        }
      }
    }
    return bakedVolume!;
  }
}

interface StoredCameraState {
  enabled: boolean;
  position: Vector3;
  viewMatrix: Matrix;
  customViewMatrix: boolean;
  renderTarget: RenderTarget | null;
  enableHDR: boolean;
  isAlphaOutputRequired: boolean;
  enablePostProcess: boolean;
  enableFrustumCulling: boolean;
  nearClipPlane: number;
  farClipPlane: number;
  fieldOfView: number;
  cullingMask: Layer;
}

function findCaptureCamera(scene: Scene): Camera {
  const cameras: Camera[] = [];
  const roots = scene.rootEntities;
  for (let i = 0; i < roots.length; i++) {
    roots[i].getComponentsIncludeChildren(Camera, cameras);
    for (let j = 0; j < cameras.length; j++) {
      if (cameras[j].enabled) {
        return cameras[j];
      }
    }
  }
  throw new Error("ProbeVolumeBaker requires an enabled scene camera or options.camera.");
}

function storeCameraState(camera: Camera): StoredCameraState {
  return {
    enabled: camera.enabled,
    position: camera.entity.transform.worldPosition.clone(),
    viewMatrix: camera.viewMatrix.clone(),
    customViewMatrix: (camera as unknown as { _isCustomViewMatrix: boolean })._isCustomViewMatrix,
    renderTarget: camera.renderTarget,
    enableHDR: camera.enableHDR,
    isAlphaOutputRequired: camera.isAlphaOutputRequired,
    enablePostProcess: camera.enablePostProcess,
    enableFrustumCulling: camera.enableFrustumCulling,
    nearClipPlane: camera.nearClipPlane,
    farClipPlane: camera.farClipPlane,
    fieldOfView: camera.fieldOfView,
    cullingMask: camera.cullingMask
  };
}

function restoreCameraState(camera: Camera, state: StoredCameraState): void {
  camera.enabled = state.enabled;
  camera.renderTarget = state.renderTarget;
  camera.enableHDR = state.enableHDR;
  camera.isAlphaOutputRequired = state.isAlphaOutputRequired;
  camera.enablePostProcess = state.enablePostProcess;
  camera.enableFrustumCulling = state.enableFrustumCulling;
  camera.nearClipPlane = state.nearClipPlane;
  camera.farClipPlane = state.farClipPlane;
  camera.fieldOfView = state.fieldOfView;
  camera.cullingMask = state.cullingMask;
  camera.entity.transform.worldPosition = state.position;
  if (state.customViewMatrix) {
    camera.viewMatrix = state.viewMatrix;
  } else {
    camera.resetViewMatrix();
  }
}

function countUniqueProbePositions(minBrickSize: number, layouts: ProbeBrickLayout[]): number {
  const positions = new Set<string>();
  for (const layout of layouts) {
    const size = minBrickSize * Math.pow(ProbeBrickCellCount, layout.subdivisionLevel);
    const probeStep = size / ProbeBrickCellCount;
    for (let z = 0; z < ProbeBrickProbeCountPerDimension; z++) {
      for (let y = 0; y < ProbeBrickProbeCountPerDimension; y++) {
        for (let x = 0; x < ProbeBrickProbeCountPerDimension; x++) {
          positions.add(
            `${layout.position.x + x * probeStep},${layout.position.y + y * probeStep},${layout.position.z + z * probeStep}`
          );
        }
      }
    }
  }
  return positions.size;
}

function yieldToHost(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function captureBricks(
  camera: Camera,
  cubeTexture: TextureCube,
  minBrickSize: number,
  layouts: ProbeBrickLayout[],
  localToWorldMatrix: Matrix,
  resolution: number,
  visibilityCache: Map<string, CapturedGeometry>,
  probeClearance: number,
  onProbeCaptured: () => Promise<void>
): Promise<ProbeBrickData[]> {
  const probeCache = new Map<string, CapturedProbe>();
  const bricks: ProbeBrickData[] = [];

  for (const layout of layouts) {
    const size = minBrickSize * Math.pow(ProbeBrickCellCount, layout.subdivisionLevel);
    const probeStep = size / ProbeBrickCellCount;
    const sphericalHarmonics: SphericalHarmonics3[] = [];
    const visibility: Float32Array[] = [];
    const validity = new Float32Array(ProbeBrickProbeCountPerDimension ** 3);
    const skyOcclusionSH = new Float32Array(ProbeBrickProbeCountPerDimension ** 3 * 4);

    for (let z = 0; z < ProbeBrickProbeCountPerDimension; z++) {
      for (let y = 0; y < ProbeBrickProbeCountPerDimension; y++) {
        for (let x = 0; x < ProbeBrickProbeCountPerDimension; x++) {
          const localPosition = new Vector3(
            layout.position.x + x * probeStep,
            layout.position.y + y * probeStep,
            layout.position.z + z * probeStep
          );
          const key = `${localPosition.x},${localPosition.y},${localPosition.z}`;
          let capturedProbe = probeCache.get(key);
          if (!capturedProbe) {
            const position = new Vector3();
            Vector3.transformCoordinate(localPosition, localToWorldMatrix, position);
            const cachedGeometry = visibilityCache.get(key);
            capturedProbe = captureProbe(camera, cubeTexture, position, resolution, !cachedGeometry, probeClearance);
            if (cachedGeometry) {
              capturedProbe.visibility = cachedGeometry.visibility;
              capturedProbe.validity = cachedGeometry.validity;
              capturedProbe.skyOcclusionSH.copyFrom(cachedGeometry.skyOcclusionSH);
            } else {
              visibilityCache.set(key, {
                visibility: capturedProbe.visibility,
                validity: capturedProbe.validity,
                skyOcclusionSH: capturedProbe.skyOcclusionSH.clone()
              });
            }
            probeCache.set(key, capturedProbe);
            await onProbeCaptured();
          }
          sphericalHarmonics.push(capturedProbe.sphericalHarmonics);
          visibility.push(capturedProbe.visibility);
          const probeIndex = sphericalHarmonics.length - 1;
          validity[probeIndex] = capturedProbe.validity;
          capturedProbe.skyOcclusionSH.copyToArray(skyOcclusionSH, probeIndex * 4);
        }
      }
    }

    bricks.push({
      position: layout.position.clone(),
      subdivisionLevel: layout.subdivisionLevel,
      sphericalHarmonics,
      visibility,
      validity,
      skyOcclusionSH
    });
  }
  return bricks;
}

interface CapturedProbe {
  sphericalHarmonics: SphericalHarmonics3;
  visibility: Float32Array;
  validity: number;
  skyOcclusionSH: Vector4;
}

interface CapturedGeometry {
  visibility: Float32Array;
  validity: number;
  skyOcclusionSH: Vector4;
}

function captureProbe(
  camera: Camera,
  cubeTexture: TextureCube,
  position: Vector3,
  resolution: number,
  captureVisibility: boolean,
  probeClearance: number
): CapturedProbe {
  camera.entity.transform.worldPosition = position;
  const sh = new SphericalHarmonics3();
  const colorPixels = new Uint16Array(resolution * resolution * 4);
  const visibility = new Float32Array(ProbeVisibilityResolution * ProbeVisibilityResolution);
  const visibilityCoverage = new Uint8Array(visibility.length);
  visibility.fill(camera.farClipPlane);
  const color = new Color();
  const direction = new Vector3();
  const skyOcclusionSH = new Vector4();

  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const basis = cubeFaceBases[faceIndex];
    Vector3.add(position, basis.forward, captureTarget);
    Matrix.lookAt(position, captureTarget, basis.up, captureViewMatrix);
    camera.viewMatrix = captureViewMatrix;
    camera.render(TextureCubeFace.PositiveX + faceIndex);
    cubeTexture.getPixelBuffer(TextureCubeFace.PositiveX + faceIndex, colorPixels);

    for (let y = 0; y < resolution; y++) {
      const v = (2 * (y + 0.5)) / resolution - 1;
      for (let x = 0; x < resolution; x++) {
        const u = (2 * (x + 0.5)) / resolution - 1;
        direction.set(
          basis.forward.x + basis.right.x * u + basis.up.x * v,
          basis.forward.y + basis.right.y * u + basis.up.y * v,
          basis.forward.z + basis.right.z * u + basis.up.z * v
        );
        direction.normalize();

        const offset = (x + y * resolution) * 4;
        color.set(
          halfToFloat(colorPixels[offset]),
          halfToFloat(colorPixels[offset + 1]),
          halfToFloat(colorPixels[offset + 2]),
          1
        );
        const encodedDistance = halfToFloat(colorPixels[offset + 3]);
        const seesSky = encodedDistance < 0.5;
        const texelSolidAngle = 4 / (resolution * resolution * Math.pow(1 + u * u + v * v, 1.5));
        sh.addLight(direction, color, texelSolidAngle);

        if (captureVisibility) {
          const radialDistance =
            encodedDistance > 1 ? Math.min(camera.farClipPlane, encodedDistance - 1) : camera.farClipPlane;
          writeOctahedralDistance(visibility, visibilityCoverage, direction, radialDistance);
          if (seesSky) {
            skyOcclusionSH.x += 0.282095 * texelSolidAngle;
            skyOcclusionSH.y += -0.488603 * direction.y * texelSolidAngle;
            skyOcclusionSH.z += 0.488603 * direction.z * texelSolidAngle;
            skyOcclusionSH.w += -0.488603 * direction.x * texelSolidAngle;
          }
        }
      }
    }
  }

  if (captureVisibility) {
    fillMissingVisibilityTexels(visibility, visibilityCoverage, camera.farClipPlane);
  }
  const inversePI = 1 / Math.PI;
  skyOcclusionSH.x *= 0.886227 * inversePI;
  skyOcclusionSH.y *= -1.023327 * inversePI;
  skyOcclusionSH.z *= 1.023327 * inversePI;
  skyOcclusionSH.w *= -1.023327 * inversePI;
  return {
    sphericalHarmonics: sh,
    visibility,
    validity: computeProbeValidity(visibility, probeClearance),
    skyOcclusionSH
  };
}

function computeProbeValidity(visibility: Float32Array, clearance: number): number {
  let nearGeometryCount = 0;
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] < clearance) {
      nearGeometryCount++;
    }
  }
  const nearGeometryRatio = nearGeometryCount / visibility.length;
  return 1 - nearGeometryRatio;
}

function writeOctahedralDistance(out: Float32Array, coverage: Uint8Array, direction: Vector3, distance: number): void {
  const inverseL1 = 1 / (Math.abs(direction.x) + Math.abs(direction.y) + Math.abs(direction.z));
  let x = direction.x * inverseL1;
  let y = direction.y * inverseL1;
  if (direction.z < 0) {
    const oldX = x;
    x = (1 - Math.abs(y)) * (oldX < 0 ? -1 : 1);
    y = (1 - Math.abs(oldX)) * (y < 0 ? -1 : 1);
  }
  const px = Math.min(
    ProbeVisibilityResolution - 1,
    Math.max(0, Math.round((x * 0.5 + 0.5) * (ProbeVisibilityResolution - 1)))
  );
  const py = Math.min(
    ProbeVisibilityResolution - 1,
    Math.max(0, Math.round((y * 0.5 + 0.5) * (ProbeVisibilityResolution - 1)))
  );
  const index = px + py * ProbeVisibilityResolution;
  out[index] = Math.min(out[index], distance);
  coverage[index] = 1;
}

function fillMissingVisibilityTexels(out: Float32Array, coverage: Uint8Array, farClipPlane: number): void {
  const source = out.slice();
  for (let y = 0; y < ProbeVisibilityResolution; y++) {
    for (let x = 0; x < ProbeVisibilityResolution; x++) {
      const index = x + y * ProbeVisibilityResolution;
      if (coverage[index]) {
        continue;
      }
      let nearest = farClipPlane;
      let found = false;
      for (let radius = 1; radius < ProbeVisibilityResolution && !found; radius++) {
        for (let oy = -radius; oy <= radius; oy++) {
          for (let ox = -radius; ox <= radius; ox++) {
            const sx = x + ox;
            const sy = y + oy;
            if (
              sx >= 0 &&
              sy >= 0 &&
              sx < ProbeVisibilityResolution &&
              sy < ProbeVisibilityResolution &&
              coverage[sx + sy * ProbeVisibilityResolution]
            ) {
              nearest = Math.min(nearest, source[sx + sy * ProbeVisibilityResolution]);
              found = true;
            }
          }
        }
      }
      out[index] = nearest;
    }
  }
}

function generateUniformLayouts(
  minBrickSize: number,
  countX: number,
  countY: number,
  countZ: number
): ProbeBrickLayout[] {
  const layouts: ProbeBrickLayout[] = [];
  for (let z = 0; z < countZ; z++) {
    for (let y = 0; y < countY; y++) {
      for (let x = 0; x < countX; x++) {
        layouts.push({
          position: new Vector3(x * minBrickSize, y * minBrickSize, z * minBrickSize),
          subdivisionLevel: 0
        });
      }
    }
  }
  return layouts;
}

function generateAdaptiveLayouts(
  scene: Scene,
  minBrickSize: number,
  countX: number,
  countY: number,
  countZ: number,
  localToWorldMatrix: Matrix,
  maxSubdivisionLevel: number,
  surfaceDistance: number,
  cullingMask: Layer
): ProbeBrickLayout[] {
  if (!(surfaceDistance > 0)) {
    throw new Error("ProbeVolumeBaker surfaceDistance must be greater than zero.");
  }
  const renderers: Renderer[] = [];
  for (const root of scene.rootEntities) {
    const rootRenderers: Renderer[] = [];
    root.getComponentsIncludeChildren(Renderer, rootRenderers);
    renderers.push(...rootRenderers);
  }
  const worldToLocal = new Matrix();
  Matrix.invert(localToWorldMatrix, worldToLocal);
  const geometryBounds = renderers
    .filter((renderer) => renderer.enabled && (renderer.entity.layer & cullingMask) !== 0)
    .map((renderer) => {
      const bounds = new BoundingBox();
      BoundingBox.transform(renderer.bounds, worldToLocal, bounds);
      return bounds;
    })
    .filter((bounds) =>
      [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)
    );
  const layouts: ProbeBrickLayout[] = [];
  const coarseCellCount = Math.pow(ProbeBrickCellCount, maxSubdivisionLevel);

  for (let z = 0; z < countZ; z += coarseCellCount) {
    for (let y = 0; y < countY; y += coarseCellCount) {
      for (let x = 0; x < countX; x += coarseCellCount) {
        appendAdaptiveBrick(new Vector3(x * minBrickSize, y * minBrickSize, z * minBrickSize), maxSubdivisionLevel);
      }
    }
  }
  return layouts;

  function appendAdaptiveBrick(position: Vector3, subdivisionLevel: number): void {
    const brickSize = minBrickSize * Math.pow(ProbeBrickCellCount, subdivisionLevel);
    const distance = getNearestBoundsDistance(position, brickSize, geometryBounds);
    if (distance > surfaceDistance) {
      return;
    }
    if (subdivisionLevel > 0 && distance < minBrickSize * 1.5) {
      const childLevel = subdivisionLevel - 1;
      const childSize = brickSize / ProbeBrickCellCount;
      for (let z = 0; z < ProbeBrickCellCount; z++) {
        for (let y = 0; y < ProbeBrickCellCount; y++) {
          for (let x = 0; x < ProbeBrickCellCount; x++) {
            appendAdaptiveBrick(
              new Vector3(position.x + x * childSize, position.y + y * childSize, position.z + z * childSize),
              childLevel
            );
          }
        }
      }
    } else {
      layouts.push({ position, subdivisionLevel });
    }
  }
}

function getNearestBoundsDistance(position: Vector3, size: number, bounds: BoundingBox[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  const maxX = position.x + size;
  const maxY = position.y + size;
  const maxZ = position.z + size;
  for (const bound of bounds) {
    const dx = Math.max(bound.min.x - maxX, position.x - bound.max.x, 0);
    const dy = Math.max(bound.min.y - maxY, position.y - bound.max.y, 0);
    const dz = Math.max(bound.min.z - maxZ, position.z - bound.max.z, 0);
    nearest = Math.min(nearest, Math.hypot(dx, dy, dz));
  }
  return nearest;
}

function validateLayouts(layouts: ProbeBrickLayout[]): void {
  for (let i = 0; i < layouts.length; i++) {
    if (!Number.isInteger(layouts[i].subdivisionLevel) || layouts[i].subdivisionLevel < 0) {
      throw new Error(`ProbeVolumeBaker brick ${i} has an invalid subdivisionLevel.`);
    }
  }
}

function getMinimumAxisScale(matrix: Matrix): number {
  const e = matrix.elements;
  const x = Math.hypot(e[0], e[1], e[2]);
  const y = Math.hypot(e[4], e[5], e[6]);
  const z = Math.hypot(e[8], e[9], e[10]);
  return Math.min(x, y, z);
}

function createCubeFaceBasis(forward: Vector3, up: Vector3): CubeFaceBasis {
  const right = new Vector3();
  Vector3.cross(forward, up, right);
  return { forward, up, right };
}

function halfToFloat(value: number): number {
  const sign = (value & 0x8000) << 16;
  let exponent = (value >> 10) & 0x1f;
  let mantissa = value & 0x03ff;

  if (exponent === 0) {
    if (mantissa === 0) {
      halfFloatBits[0] = sign;
      return halfFloatValue[0];
    }
    while ((mantissa & 0x0400) === 0) {
      mantissa <<= 1;
      exponent--;
    }
    exponent++;
    mantissa &= ~0x0400;
  } else if (exponent === 31) {
    halfFloatBits[0] = sign | 0x7f800000 | (mantissa << 13);
    return halfFloatValue[0];
  }

  exponent += 112;
  halfFloatBits[0] = sign | (exponent << 23) | (mantissa << 13);
  return halfFloatValue[0];
}

const captureTarget = new Vector3();
const captureViewMatrix = new Matrix();
const halfFloatValue = new Float32Array(1);
const halfFloatBits = new Uint32Array(halfFloatValue.buffer);
const cubeFaceBases: CubeFaceBasis[] = [
  createCubeFaceBasis(new Vector3(1, 0, 0), new Vector3(0, -1, 0)),
  createCubeFaceBasis(new Vector3(-1, 0, 0), new Vector3(0, -1, 0)),
  createCubeFaceBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1)),
  createCubeFaceBasis(new Vector3(0, -1, 0), new Vector3(0, 0, -1)),
  createCubeFaceBasis(new Vector3(0, 0, 1), new Vector3(0, -1, 0)),
  createCubeFaceBasis(new Vector3(0, 0, -1), new Vector3(0, -1, 0))
];
