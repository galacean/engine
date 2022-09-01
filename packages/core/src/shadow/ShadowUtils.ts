import { ShadowResolution } from "./enum/ShadowResolution";
import { TextureFormat } from "../texture";
import { Renderer } from "../Renderer";
import { BoundingBox, BoundingFrustum, MathUtil, Matrix, Plane, Vector3 } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { FrustumFace } from "@oasis-engine/math/src";
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

  static shadowDepthFormat(value: ShadowResolution): TextureFormat {
    return TextureFormat.Depth16;
  }

  static cullingRenderBounds(bounds: BoundingBox, cullPlaneCount: number, cullPlanes: Plane[]): boolean {
    const min = bounds.min;
    const max = bounds.max;
    const minX = min.x;
    const minY = min.y;
    const minZ = min.z;
    const maxX = max.x;
    const maxY = max.y;
    const maxZ = max.z;

    let pass = true;
    for (let j: number = 0; j < cullPlaneCount; j++) {
      const plane = cullPlanes[j];
      const normal = plane.normal;
      if (
        plane.distance +
          normal.x * (normal.x < 0.0 ? minX : maxX) +
          normal.y * (normal.y < 0.0 ? minY : maxY) +
          normal.z * (normal.z < 0.0 ? minZ : maxZ) <
        0.0
      ) {
        pass = false;
        break;
      }
    }
    return pass;
  }

  static shadowCullFrustum(camera: Camera, renderer: Renderer, shadowSliceData: ShadowSliceData) {
    const center = ShadowUtils._edgePlanePoint2;
    if (
      renderer.castShadows &&
      ShadowUtils.cullingRenderBounds(renderer.bounds, shadowSliceData.cullPlaneCount, shadowSliceData.cullPlanes)
    ) {
      renderer.bounds.getCenter(center);
      renderer._distanceForSort = Vector3.distance(center, shadowSliceData.position);
      renderer._render(camera);
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
    const k: number = Math.sqrt(1.0 + aspectRatio * aspectRatio) * Math.tan(MathUtil.degreeToRadian(fieldOfView) / 2.0);
    const k2: number = k * k;
    const farSNear: number = far - near;
    const farANear: number = far + near;
    if (k2 > farSNear / farANear) {
      centerZ = far;
      radius = far * k;
    } else {
      centerZ = 0.5 * farANear * (1 + k2);
      radius =
        0.5 * Math.sqrt(farSNear * farSNear + 2.0 * (far * far + near * near) * k2 + farANear * farANear * k2 * k2);
    }

    const center: Vector3 = shadowSliceData.splitBoundSphere.center;
    shadowSliceData.splitBoundSphere.radius = radius;
    Vector3.scale(forward, centerZ, center);
    Vector3.add(camera.entity.transform.worldPosition, center, center);
    shadowSliceData.sphereCenterZ = centerZ;
  }

  static getDirectionLightShadowCullPlanes(
    cameraFrustum: BoundingFrustum,
    cascadeIndex: number,
    splitDistance: number[],
    cameraNear: number,
    direction: Vector3,
    shadowSliceData: ShadowSliceData
  ): void {
    // http://lspiroengine.com/?p=187
    const frustumCorners: Vector3[] = ShadowUtils._frustumCorners;
    const backPlaneFaces: FrustumFace[] = ShadowUtils._backPlaneFaces;
    const planeNeighbors: FrustumFace[][] = ShadowUtils._frustumPlaneNeighbors;
    const twoPlaneCorners: FrustumCorner[][][] = ShadowUtils._frustumTwoPlaneCorners;
    const edgePlanePoint2: Vector3 = ShadowUtils._edgePlanePoint2;
    const out: Plane[] = shadowSliceData.cullPlanes;

    // cameraFrustumPlanes is share
    const near = cameraFrustum.getPlane(FrustumFace.Near);
    const far = cameraFrustum.getPlane(FrustumFace.Far);
    const left = cameraFrustum.getPlane(FrustumFace.Left);
    const right = cameraFrustum.getPlane(FrustumFace.Right);
    const bottom = cameraFrustum.getPlane(FrustumFace.Bottom);
    const top = cameraFrustum.getPlane(FrustumFace.Top);

    // adjustment the near/far plane
    const splitNearDistance: number = splitDistance[cascadeIndex] - cameraNear;
    const splitNear: Plane = ShadowUtils._adjustNearPlane;
    const splitFar: Plane = ShadowUtils._adjustFarPlane;
    splitNear.normal.copyFrom(near.normal);
    splitFar.normal.copyFrom(far.normal);
    splitNear.distance = near.distance - splitNearDistance;
    //do a clamp is the sphere is out of range the far plane
    splitFar.distance = Math.min(
      -near.distance + shadowSliceData.sphereCenterZ + shadowSliceData.splitBoundSphere.radius,
      far.distance
    );

    Plane.get3PlaneInterPoint(splitNear, bottom, right, frustumCorners[FrustumCorner.nearBottomRight]);
    Plane.get3PlaneInterPoint(splitNear, top, right, frustumCorners[FrustumCorner.nearTopRight]);
    Plane.get3PlaneInterPoint(splitNear, top, left, frustumCorners[FrustumCorner.nearTopLeft]);
    Plane.get3PlaneInterPoint(splitNear, bottom, left, frustumCorners[FrustumCorner.nearBottomLeft]);
    Plane.get3PlaneInterPoint(splitFar, bottom, right, frustumCorners[FrustumCorner.FarBottomRight]);
    Plane.get3PlaneInterPoint(splitFar, top, right, frustumCorners[FrustumCorner.FarTopRight]);
    Plane.get3PlaneInterPoint(splitFar, top, left, frustumCorners[FrustumCorner.FarTopLeft]);
    Plane.get3PlaneInterPoint(splitFar, bottom, left, frustumCorners[FrustumCorner.FarBottomLeft]);

    let backIndex: number = 0;
    for (let i: FrustumFace = 0; i < 6; i++) {
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

    let edgeIndex: number = backIndex;
    for (let i: FrustumFace = 0; i < backIndex; i++) {
      const backFace: FrustumFace = backPlaneFaces[i];
      const neighborFaces: Array<FrustumFace> = planeNeighbors[backFace];
      for (let j: number = 0; j < 4; j++) {
        const neighborFace: FrustumFace = neighborFaces[j];
        let notBackFace: boolean = true;
        for (let k: number = 0; k < backIndex; k++)
          if (neighborFace == backPlaneFaces[k]) {
            notBackFace = false;
            break;
          }
        if (notBackFace) {
          const corners: Array<FrustumCorner> = twoPlaneCorners[backFace][neighborFace];
          const point0: Vector3 = frustumCorners[corners[0]];
          const point1: Vector3 = frustumCorners[corners[1]];
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
    shadowSliceData: ShadowSliceData
  ): void {
    const boundSphere = shadowSliceData.splitBoundSphere;
    shadowSliceData.resolution = shadowResolution;

    // To solve shadow swimming problem.
    const center: Vector3 = boundSphere.center;
    const radius: number = boundSphere.radius;
    const halfShadowResolution: number = shadowResolution / 2;
    // Add border to project edge pixel PCF.
    // Improve:the clip planes not consider the border,but I think is OK,because the object can clip is not continuous.
    const borderRadius: number = (radius * halfShadowResolution) / (halfShadowResolution - ShadowUtils.atlasBorderSize);
    const borderDiam: number = borderRadius * 2.0;
    const sizeUnit: number = shadowResolution / borderDiam;
    const radiusUnit: number = borderDiam / shadowResolution;
    const upLen: number = Math.ceil(Vector3.dot(center, lightUp) * sizeUnit) * radiusUnit;
    const sideLen: number = Math.ceil(Vector3.dot(center, lightSide) * sizeUnit) * radiusUnit;
    const forwardLen: number = Vector3.dot(center, lightForward);
    center.x = lightUp.x * upLen + lightSide.x * sideLen + lightForward.x * forwardLen;
    center.y = lightUp.y * upLen + lightSide.y * sideLen + lightForward.y * forwardLen;
    center.z = lightUp.z * upLen + lightSide.z * sideLen + lightForward.z * forwardLen;

    // Direction light use shadow pancaking tech,do special dispose with nearPlane.
    const origin = shadowSliceData.position;
    const viewMatrix = shadowSliceData.viewMatrix;
    const projectMatrix = shadowSliceData.projectionMatrix;
    const viewProjectMatrix = shadowSliceData.viewProjectMatrix;

    Vector3.scale(lightForward, radius + nearPlane, origin);
    Vector3.subtract(center, origin, origin);
    Matrix.lookAt(origin, center, lightUp, viewMatrix);
    Matrix.ortho(
      -borderRadius,
      borderRadius,
      -borderRadius,
      borderRadius,
      0.0,
      radius * 2.0 + nearPlane,
      projectMatrix
    );
    Matrix.multiply(projectMatrix, viewMatrix, viewProjectMatrix);
  }
}
