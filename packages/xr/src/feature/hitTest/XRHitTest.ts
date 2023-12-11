import { IXRTrackedPlane } from "@galacean/engine-design";
import { Plane, Ray, Vector2, Vector3 } from "@galacean/engine";
import { XRManagerExtended, registerXRFeature } from "../../XRManagerExtended";
import { XRCamera } from "../../input/XRCamera";
import { XRTrackedInputDevice } from "../../input/XRTrackedInputDevice";
import { XRSessionMode } from "../../session/XRSessionMode";
import { XRFeature } from "../XRFeature";
import { XRFeatureType } from "../XRFeatureType";
import { XRPlaneTracking } from "../trackable/plane/XRPlaneTracking";
import { TrackableType } from "./TrackableType";
import { XRHitResult } from "./XRHitResult";

/**
 * The manager of XR hit test.
 */
@registerXRFeature(XRFeatureType.HitTest)
export class XRHitTest extends XRFeature {
  private _tempRay: Ray = new Ray();
  private _tempPlane: Plane = new Plane();
  private _tempVec2: Vector2 = new Vector2();
  private _tempVec30: Vector3 = new Vector3();
  private _tempVec31: Vector3 = new Vector3();
  private _tempVec32: Vector3 = new Vector3();
  private _tempVec33: Vector3 = new Vector3();
  private _tempVec34: Vector3 = new Vector3();
  private _tempVec35: Vector3 = new Vector3();

  /**
   * @param xrManager - The xr manager
   */
  constructor(xrManager: XRManagerExtended) {
    super(xrManager, XRFeatureType.HitTest);
  }

  /**
   * Hit test.
   * @param ray - The ray to test
   * @param type - The type of hit test
   * @returns The hit result
   */
  hitTest(ray: Ray, type: TrackableType): XRHitResult[] {
    const result = [];
    if (type & TrackableType.Plane) {
      this._hitTestPlane(ray, result);
    }
    return result;
  }

  /**
   * Screen hit test.
   * @param x - The x coordinate of the screen point (normalized)
   * @param y - The y coordinate of the screen point (normalized)
   * @param type - The type of hit test
   * @returns The hit result
   */
  screenHitTest(x: number, y: number, type: TrackableType): XRHitResult[] {
    const { _xrManager: xrManager } = this;
    if (xrManager.sessionManager.mode !== XRSessionMode.AR) {
      throw new Error("Only AR mode supports using screen ray hit test.");
    }
    const { _camera: camera } = xrManager.inputManager.getTrackedDevice<XRCamera>(XRTrackedInputDevice.Camera);
    if (!camera) {
      throw new Error("No camera available.");
    }
    const ray = camera.screenPointToRay(this._tempVec2.set(x, y), this._tempRay);
    return this.hitTest(ray, type);
  }

  private _hitTestPlane(ray: Ray, result: XRHitResult[]): void {
    const planeManager = this._xrManager.getFeature(XRPlaneTracking);
    if (!planeManager || !planeManager.enabled) {
      throw new Error("The plane estimation function needs to be turned on for plane hit test.");
    }
    const { _tempPlane: plane, _tempVec30: normal, _tempVec31: hitPoint, _tempVec32: hitPointInPlane } = this;
    const { trackedPlanes } = planeManager;
    for (let i = 0, n = trackedPlanes.length; i < n; i++) {
      const trackedPlane = trackedPlanes[i];
      normal.set(0, 1, 0).transformNormal(trackedPlane.pose.matrix);
      plane.normal.copyFrom(normal);
      plane.distance = -Vector3.dot(normal, trackedPlane.pose.position);
      const distance = ray.intersectPlane(plane);
      if (distance >= 0) {
        ray.getPoint(distance, hitPoint);
        Vector3.transformToVec3(hitPoint, trackedPlane.pose.inverseMatrix, hitPointInPlane);
        // Check if the hit position is within the plane boundary.
        if (this._checkPointerWithinPlane(hitPointInPlane, trackedPlane)) {
          const hitResult = new XRHitResult();
          hitResult.point.copyFrom(hitPoint);
          hitResult.normal.copyFrom(normal);
          hitResult.distance = distance;
          hitResult.trackedObject = trackedPlane;
          hitResult.trackableType = TrackableType.Plane;
          result.push(hitResult);
        }
      }
    }
  }

  private _checkPointerWithinPlane(pointer: Vector3, plane: IXRTrackedPlane): boolean {
    const { _tempVec33: preToCur, _tempVec34: preToPointer, _tempVec35: cross } = this;
    const { polygon } = plane;
    const length = polygon.length;
    let prePoint = polygon[length - 1];
    let side = 0;
    for (let i = 0; i < length; i++) {
      const curPoint = polygon[i];
      Vector3.subtract(curPoint, prePoint, preToCur);
      Vector3.subtract(pointer, prePoint, preToPointer);
      Vector3.cross(preToCur, preToPointer, cross);
      const y = cross.y;
      if (side === 0) {
        if (y > 0) {
          side = 1;
        } else if (y < 0) {
          side = -1;
        }
      } else {
        if ((y > 0 && side < 0) || (y < 0 && side > 0)) {
          return false;
        }
      }
      prePoint = curPoint;
    }
    return true;
  }
}
