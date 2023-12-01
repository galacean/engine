import { IXRTrackedPlane } from "@galacean/engine-design";
import { TrackableType } from "./TrackableType";
import { XRCameraManager } from "../camera/XRCameraManager";
import { XRPlaneTracking } from "../trackable/plane/XRPlaneTracking";
import { Plane, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { XRFeature } from "../XRFeature";
import { XRFeatureType } from "../XRFeatureType";
import { XRSessionMode } from "../../session/XRSessionMode";
import { XRTrackedInputDevice } from "../../input/XRTrackedInputDevice";
import { Engine } from "../../../Engine";
import { XRHitResult } from "./XRHitResult";

/**
 * The manager of XR hit test.
 */
export class XRHitTest extends XRFeature {
  private _xrCameraManager: XRCameraManager;
  private _tempRay: Ray = new Ray();
  private _tempVec2: Vector2 = new Vector2();
  private _tempVec30: Vector3 = new Vector3();
  private _tempVec31: Vector3 = new Vector3();
  private _tempVec32: Vector3 = new Vector3();
  private _tempVec33: Vector3 = new Vector3();
  private _tempVec34: Vector3 = new Vector3();
  private _tempVec35: Vector3 = new Vector3();

  /**
   * Hit test.
   * @param ray - The ray to test
   * @param type - The type of hit test
   * @returns The hit result
   */
  hitTest(ray: Ray, type: TrackableType): XRHitResult[] {
    if (this._engine.xrManager.sessionManager.mode !== XRSessionMode.AR) {
      throw new Error("Only AR mode supports using screen ray detection.");
    }
    return this._hitTest(ray, type);
  }

  /**
   * Screen hit test.
   * @param x - The x coordinate of the screen point (normalized)
   * @param y - The y coordinate of the screen point (normalized)
   * @param type - The type of hit test
   * @returns The hit result
   */
  screenHitTest(x: number, y: number, type: TrackableType): XRHitResult[] {
    if (this._engine.xrManager.sessionManager.mode !== XRSessionMode.AR) {
      throw new Error("Only AR mode supports using screen ray detection.");
    }
    const camera = this._xrCameraManager.getCameraByType(XRTrackedInputDevice.Camera);
    if (!camera) {
      throw new Error("No camera available.");
    }
    const ray = camera.screenPointToRay(this._tempVec2.set(x, y), this._tempRay);
    return this._hitTest(ray, type);
  }

  private _hitTest(ray: Ray, type: TrackableType): XRHitResult[] {
    const result = [];
    if (type & TrackableType.Plane) {
      this._hitTestPlane(ray, result);
    }
    return result;
  }

  /**
   * @param engine - The engine
   */
  constructor(engine: Engine) {
    super(engine);
    const { xrManager } = engine;
    this._xrCameraManager = xrManager.cameraManager;
    this._config = { type: XRFeatureType.HitTest };
    this._platformFeature = xrManager._platformDevice.createFeature(XRFeatureType.HitTest);
  }

  private _hitTestPlane(ray: Ray, result: XRHitResult[]): void {
    const planeManager = this._engine.xrManager.getFeature(XRPlaneTracking);
    if (!planeManager || !planeManager.enabled) {
      throw new Error("The plane estimation function needs to be turned on for plane hit test.");
    }
    const { _tempVec30: normal, _tempVec31: hitPoint, _tempVec32: hitPointInPlane } = this;
    const planes = planeManager.trackedObjects;
    for (let i = 0, n = planes.length; i < n; i++) {
      const trackedPlane = planes[i];
      normal.set(0, 1, 0).transformNormal(trackedPlane.pose.matrix);
      const plane = new Plane(normal, -Vector3.dot(normal, trackedPlane.pose.position));
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
          hitResult.trackableId = trackedPlane.id;
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
