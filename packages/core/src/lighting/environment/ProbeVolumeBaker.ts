import { BoundingBox, Color, Matrix, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Layer } from "../../Layer";
import { Renderer } from "../../Renderer";
import { Scene } from "../../Scene";
import { RenderBufferDepthFormat, RenderTarget, TextureCube, TextureCubeFace, TextureFormat } from "../../texture";
import { ProbeBrickCellCount, ProbeBrickData, ProbeBrickProbeCountPerDimension, ProbeVolume } from "./ProbeVolume";

/** Brick placement consumed by {@link ProbeVolumeBaker}. */
export interface ProbeBrickLayout {
  /** Brick minimum corner in world space. */
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
  /** Push capture positions out of renderer bounds before rasterization. Defaults to true. */
  virtualOffset?: boolean;
  /** Distance added after leaving renderer bounds. Defaults to 1% of minBrickSize. */
  virtualOffsetDistance?: number;
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
   * Bake adaptive probe bricks using six HDR raster captures per unique probe position.
   * @param scene - Scene to capture
   * @param minBrickSize - Smallest brick size in world units
   * @param layouts - Adaptive brick placement
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

    const engine = scene.engine;
    if (!engine._hardwareRenderer.isWebGL2) {
      throw new Error("ProbeVolumeBaker requires WebGL2 HDR cubemap rendering and readback.");
    }

    const cubeTexture = new TextureCube(engine, resolution, TextureFormat.R16G16B16A16, false, false);
    const renderTarget = new RenderTarget(
      engine,
      resolution,
      resolution,
      cubeTexture,
      RenderBufferDepthFormat.Depth,
      1
    );
    renderTarget.autoGenerateMipmaps = false;

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
    const rendererBounds = options.virtualOffset === false ? [] : collectRendererBounds(scene);
    const volumeCenter = calculateVolumeCenter(minBrickSize, layouts);
    const virtualOffsetDistance = options.virtualOffsetDistance ?? minBrickSize * 0.01;
    let bakedVolume: ProbeVolume | undefined;
    scene.environmentLighting.probeVolume = undefined;

    try {
      scene._updateShaderData();
      for (let bounce = 0; bounce < bounceCount; bounce++) {
        const bricks = captureBricks(
          camera,
          cubeTexture,
          minBrickSize,
          layouts,
          resolution,
          rendererBounds,
          volumeCenter,
          virtualOffsetDistance
        );
        if (bakedVolume) {
          bakedVolume.setBricks(bricks);
        } else {
          bakedVolume = new ProbeVolume(minBrickSize, bricks);
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
  minBrickSize: number,
  layouts: ProbeBrickLayout[],
  resolution: number,
  rendererBounds: BoundingBox[],
  volumeCenter: Vector3,
  virtualOffsetDistance: number
): ProbeBrickData[] {
  const probeCache = new Map<string, SphericalHarmonics3>();

  return layouts.map((layout) => {
    const size = minBrickSize * Math.pow(ProbeBrickCellCount, layout.subdivisionLevel);
    const probeStep = size / ProbeBrickCellCount;
    const sphericalHarmonics: SphericalHarmonics3[] = [];

    for (let z = 0; z < ProbeBrickProbeCountPerDimension; z++) {
      for (let y = 0; y < ProbeBrickProbeCountPerDimension; y++) {
        for (let x = 0; x < ProbeBrickProbeCountPerDimension; x++) {
          const position = new Vector3(
            layout.position.x + x * probeStep,
            layout.position.y + y * probeStep,
            layout.position.z + z * probeStep
          );
          const key = `${position.x},${position.y},${position.z}`;
          let sh = probeCache.get(key);
          if (!sh) {
            const capturePosition = resolveCapturePosition(
              position,
              rendererBounds,
              volumeCenter,
              virtualOffsetDistance
            );
            sh = captureProbe(camera, cubeTexture, capturePosition, resolution);
            probeCache.set(key, sh);
          }
          sphericalHarmonics.push(sh);
        }
      }
    }

    return {
      position: layout.position.clone(),
      subdivisionLevel: layout.subdivisionLevel,
      sphericalHarmonics
    };
  });
}

function captureProbe(
  camera: Camera,
  cubeTexture: TextureCube,
  position: Vector3,
  resolution: number
): SphericalHarmonics3 {
  camera.entity.transform.worldPosition = position;

  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const basis = cubeFaceBases[faceIndex];
    Vector3.add(position, basis.forward, captureTarget);
    Matrix.lookAt(position, captureTarget, basis.up, captureViewMatrix);
    camera.viewMatrix = captureViewMatrix;
    camera.render(TextureCubeFace.PositiveX + faceIndex);
  }

  const sh = new SphericalHarmonics3();
  const pixels = new Uint16Array(resolution * resolution * 4);
  const color = new Color();
  const direction = new Vector3();

  for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
    const basis = cubeFaceBases[faceIndex];
    cubeTexture.getPixelBuffer(TextureCubeFace.PositiveX + faceIndex, pixels);

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
        color.set(halfToFloat(pixels[offset]), halfToFloat(pixels[offset + 1]), halfToFloat(pixels[offset + 2]), 1);
        const texelSolidAngle = 4 / (resolution * resolution * Math.pow(1 + u * u + v * v, 1.5));
        sh.addLight(direction, color, texelSolidAngle);
      }
    }
  }

  return sh;
}

function validateLayouts(layouts: ProbeBrickLayout[]): void {
  for (let i = 0; i < layouts.length; i++) {
    if (!Number.isInteger(layouts[i].subdivisionLevel) || layouts[i].subdivisionLevel < 0) {
      throw new Error(`ProbeVolumeBaker brick ${i} has an invalid subdivisionLevel.`);
    }
  }
}

function collectRendererBounds(scene: Scene): BoundingBox[] {
  const renderers: Renderer[] = [];
  const bounds: BoundingBox[] = [];
  const roots = scene.rootEntities;
  for (let i = 0; i < roots.length; i++) {
    roots[i].getComponentsIncludeChildren(Renderer, renderers);
    for (let j = 0; j < renderers.length; j++) {
      if (renderers[j].enabled) {
        bounds.push(renderers[j].bounds.clone());
      }
    }
  }
  return bounds;
}

function calculateVolumeCenter(minBrickSize: number, layouts: ProbeBrickLayout[]): Vector3 {
  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i];
    const size = minBrickSize * Math.pow(ProbeBrickCellCount, layout.subdivisionLevel);
    Vector3.min(min, layout.position, min);
    volumeBrickMax.set(layout.position.x + size, layout.position.y + size, layout.position.z + size);
    Vector3.max(max, volumeBrickMax, max);
  }
  Vector3.add(min, max, volumeCenterTemp);
  return volumeCenterTemp.scale(0.5).clone();
}

function resolveCapturePosition(
  position: Vector3,
  rendererBounds: BoundingBox[],
  volumeCenter: Vector3,
  offset: number
): Vector3 {
  resolvedCapturePosition.copyFrom(position);

  for (let iteration = 0; iteration < rendererBounds.length; iteration++) {
    let moved = false;
    for (let i = 0; i < rendererBounds.length; i++) {
      const bounds = rendererBounds[i];
      const point = resolvedCapturePosition;
      if (
        point.x < bounds.min.x ||
        point.x > bounds.max.x ||
        point.y < bounds.min.y ||
        point.y > bounds.max.y ||
        point.z < bounds.min.z ||
        point.z > bounds.max.z
      ) {
        continue;
      }

      Vector3.subtract(volumeCenter, point, virtualOffsetDirection);
      if (virtualOffsetDirection.lengthSquared() < 1e-8) {
        virtualOffsetDirection.set(0, 1, 0);
      } else {
        virtualOffsetDirection.normalize();
      }

      let exitDistance = Number.POSITIVE_INFINITY;
      exitDistance = getAxisExitDistance(point.x, virtualOffsetDirection.x, bounds.min.x, bounds.max.x, exitDistance);
      exitDistance = getAxisExitDistance(point.y, virtualOffsetDirection.y, bounds.min.y, bounds.max.y, exitDistance);
      exitDistance = getAxisExitDistance(point.z, virtualOffsetDirection.z, bounds.min.z, bounds.max.z, exitDistance);

      if (Number.isFinite(exitDistance)) {
        virtualOffsetStep.copyFrom(virtualOffsetDirection).scale(exitDistance + offset);
        point.add(virtualOffsetStep);
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }

  return resolvedCapturePosition.clone();
}

function getAxisExitDistance(position: number, direction: number, min: number, max: number, current: number): number {
  if (direction > 1e-6) {
    return Math.min(current, (max - position) / direction);
  }
  if (direction < -1e-6) {
    return Math.min(current, (min - position) / direction);
  }
  return current;
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
const volumeBrickMax = new Vector3();
const volumeCenterTemp = new Vector3();
const resolvedCapturePosition = new Vector3();
const virtualOffsetDirection = new Vector3();
const virtualOffsetStep = new Vector3();
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
