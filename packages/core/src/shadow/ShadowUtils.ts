import {
  BoundingBox,
  BoundingFrustum,
  CollisionUtil,
  FrustumFace,
  MathUtil,
  Matrix,
  Plane,
  Vector2,
  Vector3
} from "@oasis-engine/math";
import { Camera } from "../Camera";
import { DirectLight } from "../lighting";
import { Renderer } from "../Renderer";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { TextureFormat } from "../texture";
import { Utils } from "../Utils";
import { ShadowResolution } from "./enum/ShadowResolution";
import { ShadowType } from "./enum/ShadowType";
import { ShadowSliceData } from "./ShadowSliceData";

/**
 * @internal
 */
enum FrustumCorner {
  FarBottomLeft = 0,
  FarTopLeft = 1,
  FarTopRight = 2,
  FarBottomRight = 3,
  nearBottomLeft = 4,
  nearTopLeft = 5,
  nearTopRight = 6,
  nearBottomRight = 7,
  unknown = 8
}

/**
 * @internal
 */
export class ShadowUtils {
  private static _tempMatrix0: Matrix = new Matrix();

  // prettier-ignore
  /** @internal */
  private static _shadowMapScaleOffsetMatrix: Matrix = new Matrix(
    0.5, 0.0, 0.0, 0.0,
    0.0, 0.5, 0.0, 0.0,
    0.0, 0.0, 0.5, 0.0,
    0.5, 0.5, 0.5, 1.0
  );

  private static _frustumCorners: Vector3[] = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3()
  ];
  private static _adjustNearPlane: Plane = new Plane(new Vector3());
  private static _adjustFarPlane: Plane = new Plane(new Vector3());
  private static _backPlaneFaces: FrustumFace[] = new Array(5);
  private static _edgePlanePoint2: Vector3 = new Vector3();

  private static _frustumPlaneNeighbors: FrustumFace[][] = [
    // near
    [FrustumFace.Left, FrustumFace.Right, FrustumFace.Top, FrustumFace.Bottom],
    // far
    [FrustumFace.Left, FrustumFace.Right, FrustumFace.Top, FrustumFace.Bottom],
    // left
    [FrustumFace.Near, FrustumFace.Far, FrustumFace.Top, FrustumFace.Bottom],
    // right
    [FrustumFace.Near, FrustumFace.Far, FrustumFace.Top, FrustumFace.Bottom],
    // bottom
    [FrustumFace.Near, FrustumFace.Far, FrustumFace.Left, FrustumFace.Right],
    // top
    [FrustumFace.Near, FrustumFace.Far, FrustumFace.Left, FrustumFace.Right]
  ];

  private static _frustumTwoPlaneCorners: FrustumCorner[][][] = [
    [
      // near
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // far
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // left
      [FrustumCorner.nearBottomLeft, FrustumCorner.nearTopLeft],
      // right
      [FrustumCorner.nearTopRight, FrustumCorner.nearBottomRight],
      // bottom
      [FrustumCorner.nearBottomRight, FrustumCorner.nearBottomLeft],
      // top
      [FrustumCorner.nearTopLeft, FrustumCorner.nearTopRight]
    ], // near
    [
      // near
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // far
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // left
      [FrustumCorner.FarTopLeft, FrustumCorner.FarBottomLeft],
      // right
      [FrustumCorner.FarBottomRight, FrustumCorner.FarTopRight],
      // bottom
      [FrustumCorner.FarBottomLeft, FrustumCorner.FarBottomRight],
      // top
      [FrustumCorner.FarTopRight, FrustumCorner.FarTopLeft]
    ], // far
    [
      // near
      [FrustumCorner.nearTopLeft, FrustumCorner.nearBottomLeft],
      // far
      [FrustumCorner.FarBottomLeft, FrustumCorner.FarTopLeft],
      // left
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // right
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // bottom
      [FrustumCorner.nearBottomLeft, FrustumCorner.FarBottomLeft],
      // top
      [FrustumCorner.FarTopLeft, FrustumCorner.nearTopLeft]
    ], // left
    [
      // near
      [FrustumCorner.nearBottomRight, FrustumCorner.nearTopRight],
      // far
      [FrustumCorner.FarTopRight, FrustumCorner.FarBottomRight],
      // left
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // right
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // bottom
      [FrustumCorner.FarBottomRight, FrustumCorner.nearBottomRight],
      // top
      [FrustumCorner.nearTopRight, FrustumCorner.FarTopRight]
    ], // right
    [
      // near
      [FrustumCorner.nearBottomLeft, FrustumCorner.nearBottomRight],
      // far
      [FrustumCorner.FarBottomRight, FrustumCorner.FarBottomLeft],
      // left
      [FrustumCorner.FarBottomLeft, FrustumCorner.nearBottomLeft],
      // right
      [FrustumCorner.nearBottomRight, FrustumCorner.FarBottomRight],
      // bottom
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // top
      [FrustumCorner.unknown, FrustumCorner.unknown]
    ], // bottom
    [
      // near
      [FrustumCorner.nearTopRight, FrustumCorner.nearTopLeft],
      // far
      [FrustumCorner.FarTopLeft, FrustumCorner.FarTopRight],
      // left
      [FrustumCorner.nearTopLeft, FrustumCorner.FarTopLeft],
      // right
      [FrustumCorner.FarTopRight, FrustumCorner.nearTopRight],
      // bottom
      [FrustumCorner.unknown, FrustumCorner.unknown],
      // top
      [FrustumCorner.unknown, FrustumCorner.unknown]
    ] // top
  ];
  //now max shadow sample tent is 5x5,atlas borderSize at least 3=ceil(2.5),and +1 pixel is for global border for no cascade mode.
  static readonly atlasBorderSize: number = 4.0;

  static shadowResolution(value: ShadowResolution): number {
    switch (value) {
      case ShadowResolution.Low:
        return 512;
      case ShadowResolution.Medium:
        return 1024;
      case ShadowResolution.High:
        return 2048;
      case ShadowResolution.VeryHigh:
        return 4096;
    }
  }

  static shadowDepthFormat(value: ShadowResolution, supportDepthTexture: boolean): TextureFormat {
    if (supportDepthTexture) {
      return TextureFormat.Depth16;
    } else {
      return TextureFormat.R8G8B8A8;
    }
  }

  static cullingRenderBounds(bounds: BoundingBox, cullPlaneCount: number, cullPlanes: Plane[]): boolean {
    const { min, max } = bounds;

    for (let i = 0; i < cullPlaneCount; i++) {
      const plane = cullPlanes[i];
      const normal = plane.normal;
      if (
        normal.x * (normal.x >= 0.0 ? max.x : min.x) +
          normal.y * (normal.y >= 0.0 ? max.y : min.y) +
          normal.z * (normal.z >= 0.0 ? max.z : min.z) <
        -plane.distance
      ) {
        return false;
      }
    }
    return true;
  }

  static shadowCullFrustum(context: RenderContext, renderer: Renderer, shadowSliceData: ShadowSliceData): void {
    if (
      renderer.castShadows &&
      ShadowUtils.cullingRenderBounds(renderer.bounds, shadowSliceData.cullPlaneCount, shadowSliceData.cullPlanes)
    ) {
      renderer._prepareRender(context);
    }
  }

  static getBoundSphereByFrustum(
    near: number,
    far: number,
    camera: Camera,
    forward: Vector3,
    shadowSliceData: ShadowSliceData
  ): void {
    const { aspectRatio, fieldOfView } = camera;

    // https://lxjk.github.io/2017/04/15/Calculate-Minimal-Bounding-Sphere-of-Frustum.html
    let centerZ: number;
    let radius: number;
    const k = Math.sqrt(1.0 + aspectRatio * aspectRatio) * Math.tan(MathUtil.degreeToRadian(fieldOfView) / 2.0);
    const k2 = k * k;
    const farSNear = far - near;
    const farANear = far + near;
    if (k2 > farSNear / farANear) {
      centerZ = far;
      radius = far * k;
    } else {
      centerZ = 0.5 * farANear * (1 + k2);
      radius =
        0.5 * Math.sqrt(farSNear * farSNear + 2.0 * (far * far + near * near) * k2 + farANear * farANear * k2 * k2);
    }

    const center = shadowSliceData.splitBoundSphere.center;
    shadowSliceData.splitBoundSphere.radius = radius;
    Vector3.scale(forward, centerZ, center);
    Vector3.add(camera.entity.transform.worldPosition, center, center);
    shadowSliceData.sphereCenterZ = centerZ;
  }

  static getDirectionLightShadowCullPlanes(
    cameraFrustum: BoundingFrustum,
    splitDistance: number,
    cameraNear: number,
    direction: Vector3,
    shadowSliceData: ShadowSliceData
  ): void {
    // http://lspiroengine.com/?p=187
    const frustumCorners = ShadowUtils._frustumCorners;
    const backPlaneFaces = ShadowUtils._backPlaneFaces;
    const planeNeighbors = ShadowUtils._frustumPlaneNeighbors;
    const twoPlaneCorners = ShadowUtils._frustumTwoPlaneCorners;
    const edgePlanePoint2 = ShadowUtils._edgePlanePoint2;
    const out = shadowSliceData.cullPlanes;

    // cameraFrustumPlanes is share
    const near = cameraFrustum.getPlane(FrustumFace.Near);
    const far = cameraFrustum.getPlane(FrustumFace.Far);
    const left = cameraFrustum.getPlane(FrustumFace.Left);
    const right = cameraFrustum.getPlane(FrustumFace.Right);
    const bottom = cameraFrustum.getPlane(FrustumFace.Bottom);
    const top = cameraFrustum.getPlane(FrustumFace.Top);

    // adjustment the near/far plane
    const splitNearDistance = splitDistance - cameraNear;
    const splitNear = ShadowUtils._adjustNearPlane;
    const splitFar = ShadowUtils._adjustFarPlane;
    splitNear.normal.copyFrom(near.normal);
    splitFar.normal.copyFrom(far.normal);
    splitNear.distance = near.distance - splitNearDistance;
    // do a clamp if the sphere is out of range the far plane
    splitFar.distance = Math.min(
      -near.distance + shadowSliceData.sphereCenterZ + shadowSliceData.splitBoundSphere.radius,
      far.distance
    );

    CollisionUtil.intersectionPointThreePlanes(splitNear, bottom, right, frustumCorners[FrustumCorner.nearBottomRight]);
    CollisionUtil.intersectionPointThreePlanes(splitNear, top, right, frustumCorners[FrustumCorner.nearTopRight]);
    CollisionUtil.intersectionPointThreePlanes(splitNear, top, left, frustumCorners[FrustumCorner.nearTopLeft]);
    CollisionUtil.intersectionPointThreePlanes(splitNear, bottom, left, frustumCorners[FrustumCorner.nearBottomLeft]);
    CollisionUtil.intersectionPointThreePlanes(splitFar, bottom, right, frustumCorners[FrustumCorner.FarBottomRight]);
    CollisionUtil.intersectionPointThreePlanes(splitFar, top, right, frustumCorners[FrustumCorner.FarTopRight]);
    CollisionUtil.intersectionPointThreePlanes(splitFar, top, left, frustumCorners[FrustumCorner.FarTopLeft]);
    CollisionUtil.intersectionPointThreePlanes(splitFar, bottom, left, frustumCorners[FrustumCorner.FarBottomLeft]);

    let backIndex = 0;
    for (let i = 0; i < 6; i++) {
      // maybe 3、4、5(light eye is at far, forward is near, or orthographic camera is any axis)
      let plane: Plane;
      switch (i) {
        case FrustumFace.Near:
          plane = splitNear;
          break;
        case FrustumFace.Far:
          plane = splitFar;
          break;
        default:
          plane = cameraFrustum.getPlane(i);
          break;
      }
      if (Vector3.dot(plane.normal, direction) < 0.0) {
        out[backIndex].copyFrom(plane);
        backPlaneFaces[backIndex] = i;
        backIndex++;
      }
    }

    let edgeIndex = backIndex;
    for (let i = 0; i < backIndex; i++) {
      const backFace = backPlaneFaces[i];
      const neighborFaces = planeNeighbors[backFace];
      for (let j = 0; j < 4; j++) {
        const neighborFace = neighborFaces[j];
        let notBackFace = true;
        for (let k = 0; k < backIndex; k++)
          if (neighborFace == backPlaneFaces[k]) {
            notBackFace = false;
            break;
          }
        if (notBackFace) {
          const corners = twoPlaneCorners[backFace][neighborFace];
          const point0 = frustumCorners[corners[0]];
          const point1 = frustumCorners[corners[1]];
          Vector3.add(point0, direction, edgePlanePoint2);
          Plane.fromPoints(point0, point1, edgePlanePoint2, out[edgeIndex++]);
        }
      }
    }
    shadowSliceData.cullPlaneCount = edgeIndex;
  }

  static getDirectionalLightMatrices(
    lightUp: Vector3,
    lightSide: Vector3,
    lightForward: Vector3,
    cascadeIndex: number,
    nearPlane: number,
    shadowResolution: number,
    shadowSliceData: ShadowSliceData,
    outShadowMatrices: Float32Array
  ): void {
    const boundSphere = shadowSliceData.splitBoundSphere;
    shadowSliceData.resolution = shadowResolution;

    // To solve shadow swimming problem.
    const center = boundSphere.center;
    const radius = boundSphere.radius;
    const halfShadowResolution = shadowResolution / 2;
    // Add border to project edge pixel PCF.
    // Improve:the clip planes not consider the border,but I think is OK,because the object can clip is not continuous.
    const borderRadius = (radius * halfShadowResolution) / (halfShadowResolution - ShadowUtils.atlasBorderSize);
    const borderDiam = borderRadius * 2.0;
    const sizeUnit = shadowResolution / borderDiam;
    const radiusUnit = borderDiam / shadowResolution;
    const upLen = Math.ceil(Vector3.dot(center, lightUp) * sizeUnit) * radiusUnit;
    const sideLen = Math.ceil(Vector3.dot(center, lightSide) * sizeUnit) * radiusUnit;
    const forwardLen = Vector3.dot(center, lightForward);
    center.x = lightUp.x * upLen + lightSide.x * sideLen + lightForward.x * forwardLen;
    center.y = lightUp.y * upLen + lightSide.y * sideLen + lightForward.y * forwardLen;
    center.z = lightUp.z * upLen + lightSide.z * sideLen + lightForward.z * forwardLen;

    // Direction light use shadow pancaking tech,do special dispose with nearPlane.

    const virtualCamera = shadowSliceData.virtualCamera;
    const position = virtualCamera.position;
    const viewMatrix = virtualCamera.viewMatrix;
    const projectMatrix = virtualCamera.projectionMatrix;

    Vector3.scale(lightForward, radius + nearPlane, position);
    Vector3.subtract(center, position, position);
    Matrix.lookAt(position, center, lightUp, viewMatrix);
    Matrix.ortho(
      -borderRadius,
      borderRadius,
      -borderRadius,
      borderRadius,
      0.0,
      radius * 2.0 + nearPlane,
      projectMatrix
    );

    const viewProjectionMatrix = virtualCamera.viewProjectionMatrix;
    Matrix.multiply(projectMatrix, viewMatrix, viewProjectionMatrix);
    Utils._floatMatrixMultiply(
      ShadowUtils._shadowMapScaleOffsetMatrix.elements,
      viewProjectionMatrix.elements,
      0,
      outShadowMatrices,
      cascadeIndex * 16
    );
  }

  static getMaxTileResolutionInAtlas(atlasWidth: number, atlasHeight: number, tileCount: number): number {
    let resolution = Math.min(atlasWidth, atlasHeight);

    let currentTileCount = Math.floor(atlasWidth / resolution) * Math.floor(atlasHeight / resolution);

    while (currentTileCount < tileCount) {
      resolution = Math.floor(resolution >> 1);
      currentTileCount = Math.floor(atlasWidth / resolution) * Math.floor(atlasHeight / resolution);
    }
    return resolution;
  }

  static getShadowBias(light: DirectLight, projectionMatrix: Matrix, shadowResolution: number, out: Vector2): void {
    // Frustum size is guaranteed to be a cube as we wrap shadow frustum around a sphere
    // elements[0] = 2.0 / (right - left)
    const frustumSize = 2.0 / projectionMatrix.elements[0];

    // depth and normal bias scale is in shadowmap texel size in world space
    const texelSize = frustumSize / shadowResolution;
    let depthBias = -light.shadowBias * texelSize;
    let normalBias = -light.shadowNormalBias * texelSize;

    if (light.shadowType == ShadowType.SoftHigh) {
      // TODO: depth and normal bias assume sample is no more than 1 texel away from shadowmap
      // This is not true with PCF. Ideally we need to do either
      // cone base bias (based on distance to center sample)
      // or receiver place bias based on derivatives.
      // For now we scale it by the PCF kernel size (5x5)
      const kernelRadius = 2.5;
      depthBias *= kernelRadius;
      normalBias *= kernelRadius;
    }
    out.set(depthBias, normalBias);
  }

  /**
   * Apply shadow slice scale and offset
   */
  static applySliceTransform(
    tileSize: number,
    atlasWidth: number,
    atlasHeight: number,
    cascadeIndex: number,
    atlasOffset: Vector2,
    outShadowMatrices: Float32Array
  ): void {
    const slice = ShadowUtils._tempMatrix0.elements;
    const oneOverAtlasWidth = 1.0 / atlasWidth;
    const oneOverAtlasHeight = 1.0 / atlasHeight;

    // Apply scale
    slice[0] = tileSize * oneOverAtlasWidth;
    slice[5] = tileSize * oneOverAtlasHeight;
    // Apply offset
    slice[12] = atlasOffset.x * oneOverAtlasWidth;
    slice[13] = atlasOffset.y * oneOverAtlasHeight;
    slice[1] = 0;
    slice[2] = 0;
    slice[2] = 0;
    slice[4] = 0;
    slice[6] = 0;
    slice[7] = 0;
    slice[8] = 0;
    slice[9] = 0;
    slice[11] = 0;
    slice[14] = 0;
    slice[10] = slice[15] = 1;
    const offset = cascadeIndex * 16;
    Utils._floatMatrixMultiply(slice, outShadowMatrices, offset, outShadowMatrices, offset);
  }
}
