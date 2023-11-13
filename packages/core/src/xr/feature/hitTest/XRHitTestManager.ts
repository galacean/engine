import { IXRFeatureDescriptor, IXRHitResult, IXRTrackedPlane } from "@galacean/engine-design";
import { registerXRFeatureManager } from "../../XRManager";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRFeatureType } from "../XRFeatureType";
import { XRHitTestType } from "./XRHItTestType";
import { XRSessionType } from "../../session/XRSessionType";
import { XRCameraManager } from "../camera/XRCameraManager";
import { XRInputType } from "../../input/XRInputType";
import { Plane, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { XRPlaneTrackingManager } from "../trackable/plane/XRPlaneTrackingManager";
import { Logger } from "../../../base";

@registerXRFeatureManager(XRFeatureType.HitTest)
/**
 * The manager of XR hit test.
 */
export class XRHitTestManager extends XRFeatureManager {
  private _tempRay: Ray = new Ray();
  private _tempVec2: Vector2 = new Vector2();
  private _tempVec30: Vector3 = new Vector3();
  private _tempVec31: Vector3 = new Vector3();
  private _tempVec32: Vector3 = new Vector3();
  private _tempVec33: Vector3 = new Vector3();
  private _tempVec34: Vector3 = new Vector3();
  private _tempVec35: Vector3 = new Vector3();

  /**
   * Returns whether the feature is supported.
   * @param descriptor - The descriptor of the feature
   * @returns The promise of the feature
   */
  override isSupported(descriptor?: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Hit test.
   * @param ray - The ray to test
   * @param type - The type of hit test
   * @returns The hit result
   */
  hitTest(ray: Ray, type: XRHitTestType): IXRHitResult[] {
    if (this._engine.xrManager.mode !== XRSessionType.AR) {
      Logger.warn("Only AR mode supports using screen ray detection.");
      return null;
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
  screenHitTest(x: number, y: number, type: XRHitTestType): IXRHitResult[] {
    const { xrManager } = this._engine;
    if (xrManager.mode !== XRSessionType.AR) {
      Logger.warn("Only AR mode supports using screen ray detection.");
      return null;
    }

    const camera = xrManager
      .getFeature<XRCameraManager>(XRFeatureType.CameraDevice)
      .getCameraByType(XRInputType.Camera);
    if (!camera) {
      Logger.warn("No camera available.");
      return null;
    }
    const ray = camera.screenPointToRay(this._tempVec2.set(x, y), this._tempRay);
    return this._hitTest(ray, type);
  }

  private _hitTest(ray: Ray, type: XRHitTestType): IXRHitResult[] {
    const result = [];
    if (type & XRHitTestType.Plane) {
      this._hitTestPlane(ray, result);
    }
    return result;
  }

  private _hitTestPlane(ray: Ray, result: IXRHitResult[]): void {
    const planeManager = this._engine.xrManager.getFeature<XRPlaneTrackingManager>(XRFeatureType.PlaneTracking);
    if (!planeManager || !planeManager.enabled) {
      Logger.warn("The plane estimation function needs to be turned on for plane hit test.");
      return;
    }
    const { _tempVec30: normal, _tempVec31: hitPoint, _tempVec32: hitPointInPlane } = this;
    const planes = planeManager.trackedObjects;
    for (let i = 0, n = planes.length; i < n; i++) {
      const trackedPlane = planes[i].platformData;
      normal.set(0, 1, 0).transformNormal(trackedPlane.pose.matrix);
      const plane = new Plane(normal, Vector3.dot(normal, trackedPlane.pose.position));
      const distance = ray.intersectPlane(plane);
      if (distance >= 0) {
        ray.getPoint(distance, hitPoint);
        Vector3.transformToVec3(hitPoint, trackedPlane.pose.inverseMatrix, hitPointInPlane);
        // Check if the hit position is within the plane boundary.
        if (this._checkPointerWithinPlane(hitPointInPlane, trackedPlane)) {
          result.push({
            point: hitPoint.clone(),
            normal: normal.clone(),
            hitId: trackedPlane.id,
            hitType: 0,
            distance
          });
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
