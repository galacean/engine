import { Color, Matrix, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Layer } from "../../Layer";
import { Material } from "../../material";
import { Blitter } from "../../RenderPipeline/Blitter";
import { Scene } from "../../Scene";
import { Shader } from "../../shader";
import { RenderTarget, Texture2D, TextureCube, TextureCubeFace, TextureFormat } from "../../texture";
import {
  ProbeBrickCellCount,
  ProbeBrickData,
  ProbeBrickProbeCountPerDimension,
  ProbeVisibilityResolution,
  ProbeVolume
} from "./ProbeVolume";
import { ProbeVolumeRegion } from "./ProbeVolumeRegion";

/** Brick placement consumed by {@link ProbeVolumeBaker}. */
export interface ProbeBrickLayout {
  /** Brick minimum corner in probe-local space. */
  position: Vector3;
  /** Brick size is `minBrickSize * 3 ^ subdivisionLevel`. */
  subdivisionLevel: number;
}

/** Options for rasterizing probe radiance into spherical harmonics. */
export interface ProbeVolumeBakeOptions {
  /** Camera whose render pipeline is reused for captures. Defaults to the first enabled scene camera. */
  camera?: Camera;
  /** Cubemap face resolution. Defaults to 8. */
  resolution?: number;
  /** Capture near plane in world units. Defaults to 0.05. */
  nearClipPlane?: number;
  /** Capture far plane in world units. Defaults to 100. */
  farClipPlane?: number;
  /** Layers visible to probe captures. Defaults to every layer. */
  cullingMask?: Layer;
  /** Number of raster feedback passes. One pass captures emission, sky and direct lighting. Defaults to 1. */
  bounceCount?: number;
  /** Transform from brick layout space to world space. Defaults to identity. */
  localToWorldMatrix?: Matrix;
}

interface CubeFaceBasis {
  forward: Vector3;
  up: Vector3;
  right: Vector3;
}

/**
 * Rasterizes the scene from each probe and projects the captured cubemap radiance into SH.
 * @remarks This is a synchronous offline/runtime-authoring utility. It does not use ray tracing.
 */
export class ProbeVolumeBaker {
  /**
   * Bake a freely placed, rotated, and scaled probe region.
   * @param scene - Scene to capture
   * @param region - Region component whose entity transform controls placement
   * @param options - Capture options
   */
  static bakeRegion(scene: Scene, region: ProbeVolumeRegion, options: ProbeVolumeBakeOptions = {}): ProbeVolume {
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

    const countX = Math.max(1, Math.ceil(size.x / minBrickSize));
    const countY = Math.max(1, Math.ceil(size.y / minBrickSize));
    const countZ = Math.max(1, Math.ceil(size.z / minBrickSize));
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

    return ProbeVolumeBaker.bake(scene, minBrickSize, layouts, {
      ...options,
      localToWorldMatrix
    });
  }

  /**
   * Bake probe bricks using six HDR raster captures per unique probe position.
   * @param scene - Scene to capture
   * @param minBrickSize - Smallest brick size in layout units
   * @param layouts - Probe brick placement
   * @param options - Capture options
   * @returns A probe volume containing incoming-radiance SH
   */
  static bake(
    scene: Scene,
    minBrickSize: number,
    layouts: ProbeBrickLayout[],
    options: ProbeVolumeBakeOptions = {}
  ): ProbeVolume {
    if (!(minBrickSize > 0)) {
      throw new Error("ProbeVolumeBaker minBrickSize must be greater than zero.");
    }
    if (layouts.length === 0) {
      throw new Error("ProbeVolumeBaker requires at least one brick layout.");
    }

    const resolution = options.resolution ?? 8;
    const bounceCount = options.bounceCount ?? 1;
    if (!Number.isInteger(resolution) || resolution < 2) {
      throw new Error("ProbeVolumeBaker resolution must be an integer greater than or equal to 2.");
    }
    if (!Number.isInteger(bounceCount) || bounceCount < 1) {
      throw new Error("ProbeVolumeBaker bounceCount must be an integer greater than or equal to 1.");
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
    const depthReadTexture = new Texture2D(engine, resolution, resolution, TextureFormat.R16G16B16A16, false, false);
    const depthReadTarget = new RenderTarget(engine, resolution, resolution, depthReadTexture, null, 1);
    const depthReadMaterial = new Material(engine, Shader.find("Lighting/ProbeDepthCapture"));
    renderTarget.autoGenerateMipmaps = false;
    depthReadTarget.autoGenerateMipmaps = false;

    const camera = options.camera ?? findCaptureCamera(scene);
    const cameraState = storeCameraState(camera);
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
    const visibilityCache = new Map<string, Float32Array>();
    scene.environmentLighting.probeVolume = undefined;

    try {
      scene._updateShaderData();
      for (let bounce = 0; bounce < bounceCount; bounce++) {
        const bricks = captureBricks(
          camera,
          cubeTexture,
          depthTexture,
          depthReadTexture,
          depthReadTarget,
          depthReadMaterial,
          minBrickSize,
          layouts,
          localToWorldMatrix,
          resolution,
          visibilityCache,
          probeClearance
        );
        if (bakedVolume) {
          bakedVolume.setBricks(bricks);
        } else {
          bakedVolume = new ProbeVolume(minBrickSize, bricks, localToWorldMatrix);
          bakedVolume.normalBias = worldBrickSize * 0.05;
          bakedVolume.visibilityBias = worldBrickSize * 0.05;
        }

        if (bounce + 1 < bounceCount) {
          scene.environmentLighting.probeVolume = bakedVolume;
          scene._updateShaderData();
        }
      }
    } finally {
      scene.environmentLighting.probeVolume = originalVolume;
      restoreCameraState(camera, cameraState);
      renderTarget.destroy(true);
      cubeTexture.destroy(true);
      depthTexture.destroy(true);
      depthReadTarget.destroy(true);
      depthReadTexture.destroy(true);
      depthReadMaterial.destroy();
    }

    return bakedVolume!;
  }
}

interface StoredCameraState {
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

function captureBricks(
  camera: Camera,
  cubeTexture: TextureCube,
  depthTexture: Texture2D,
  depthReadTexture: Texture2D,
  depthReadTarget: RenderTarget,
  depthReadMaterial: Material,
  minBrickSize: number,
  layouts: ProbeBrickLayout[],
  localToWorldMatrix: Matrix,
  resolution: number,
  visibilityCache: Map<string, Float32Array>,
  probeClearance: number
): ProbeBrickData[] {
  const probeCache = new Map<string, CapturedProbe>();

  return layouts.map((layout) => {
    const size = minBrickSize * Math.pow(ProbeBrickCellCount, layout.subdivisionLevel);
    const probeStep = size / ProbeBrickCellCount;
    const sphericalHarmonics: SphericalHarmonics3[] = [];
    const visibility: Float32Array[] = [];
    const validity = new Float32Array(ProbeBrickProbeCountPerDimension ** 3);

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
            const cachedVisibility = visibilityCache.get(key);
            capturedProbe = captureProbe(
              camera,
              cubeTexture,
              depthTexture,
              depthReadTexture,
              depthReadTarget,
              depthReadMaterial,
              position,
              resolution,
              !cachedVisibility,
              probeClearance
            );
            if (cachedVisibility) {
              capturedProbe.visibility = cachedVisibility;
              capturedProbe.validity = computeProbeValidity(cachedVisibility, probeClearance);
            } else {
              visibilityCache.set(key, capturedProbe.visibility);
            }
            probeCache.set(key, capturedProbe);
          }
          sphericalHarmonics.push(capturedProbe.sphericalHarmonics);
          visibility.push(capturedProbe.visibility);
          validity[sphericalHarmonics.length - 1] = capturedProbe.validity;
        }
      }
    }

    return {
      position: layout.position.clone(),
      subdivisionLevel: layout.subdivisionLevel,
      sphericalHarmonics,
      visibility,
      validity
    };
  });
}

interface CapturedProbe {
  sphericalHarmonics: SphericalHarmonics3;
  visibility: Float32Array;
  validity: number;
}

function captureProbe(
  camera: Camera,
  cubeTexture: TextureCube,
  depthTexture: Texture2D,
  depthReadTexture: Texture2D,
  depthReadTarget: RenderTarget,
  depthReadMaterial: Material,
  position: Vector3,
  resolution: number,
  captureVisibility: boolean,
  probeClearance: number
): CapturedProbe {
  camera.entity.transform.worldPosition = position;
  const sh = new SphericalHarmonics3();
  const colorPixels = new Uint16Array(resolution * resolution * 4);
  const depthPixels = new Uint16Array(resolution * resolution * 4);
  const visibility = new Float32Array(ProbeVisibilityResolution * ProbeVisibilityResolution);
  const visibilityCoverage = new Uint8Array(visibility.length);
  visibility.fill(camera.farClipPlane);
  const color = new Color();
  const direction = new Vector3();

  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const basis = cubeFaceBases[faceIndex];
    Vector3.add(position, basis.forward, captureTarget);
    Matrix.lookAt(position, captureTarget, basis.up, captureViewMatrix);
    camera.viewMatrix = captureViewMatrix;
    camera.render(TextureCubeFace.PositiveX + faceIndex);
    cubeTexture.getPixelBuffer(TextureCubeFace.PositiveX + faceIndex, colorPixels);
    if (captureVisibility) {
      const renderContext = camera.engine._renderContext;
      renderContext.camera = camera;
      try {
        Blitter.blitTexture(camera.engine, depthTexture, depthReadTarget, 0, undefined, depthReadMaterial);
      } finally {
        renderContext.camera = null;
      }
      depthReadTexture.getPixelBuffer(depthPixels);
    }

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
        const texelSolidAngle = 4 / (resolution * resolution * Math.pow(1 + u * u + v * v, 1.5));
        sh.addLight(direction, color, texelSolidAngle);

        if (captureVisibility) {
          const linearDepth = halfToFloat(depthPixels[(x + y * resolution) * 4]);
          const radialDistance = Math.min(camera.farClipPlane, linearDepth * Math.sqrt(1 + u * u + v * v));
          writeOctahedralDistance(visibility, visibilityCoverage, direction, radialDistance);
        }
      }
    }
  }

  if (captureVisibility) {
    fillMissingVisibilityTexels(visibility, visibilityCoverage, camera.farClipPlane);
  }
  return { sphericalHarmonics: sh, visibility, validity: computeProbeValidity(visibility, probeClearance) };
}

function computeProbeValidity(visibility: Float32Array, clearance: number): number {
  let nearGeometryCount = 0;
  for (let i = 0; i < visibility.length; i++) {
    if (visibility[i] < clearance) {
      nearGeometryCount++;
    }
  }
  const nearGeometryRatio = nearGeometryCount / visibility.length;
  const t = Math.min(1, Math.max(0, (nearGeometryRatio - 0.05) / 0.2));
  const smoothT = t * t * (3 - 2 * t);
  return 1 - smoothT;
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
