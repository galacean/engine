import {
  Camera,
  Engine,
  Entity,
  IScene,
  Logger,
  ParserContext,
  Quaternion,
  Scene,
  Vector3,
  XRManager,
  registerSceneExtendParser
} from "@galacean/engine";
import { XRFeatureType } from "../feature/XRFeatureType";
import { XRCameraManager } from "../feature/camera/XRCameraManager";
import { XRHitTest } from "../feature/hitTest/XRHitTest";
import { XRAnchorTracking } from "../feature/trackable/anchor/XRAnchorTracking";
import { XRImageTracking } from "../feature/trackable/image/XRImageTracking";
import { XRReferenceImage } from "../feature/trackable/image/XRReferenceImage";
import { XRPlaneTracking } from "../feature/trackable/plane/XRPlaneTracking";
import { XRTrackedInputDevice } from "../input/XRTrackedInputDevice";
import { IAnchorTrackingSchema, IHitTestSchema, IImageTrackingSchema, IPlaneTrackingSchema } from "./XRSceneSchema";

@registerSceneExtendParser("XR")
export class XRSceneExtendParser {
  static async parse(engine: Engine, context: ParserContext<IScene, Scene>, data: IScene): Promise<void> {
    const { xrManager } = engine;
    if (!xrManager) {
      Logger.error("XRManager is not found in the engine.");
      return;
    }
    const { xr } = data.scene;
    const { origin, camera, leftCamera, rightCamera, features } = xr;
    const { entityMap } = context;
    origin && (xrManager.origin = entityMap.get(origin));
    const { cameraManager } = xrManager;
    setCamera(cameraManager, XRTrackedInputDevice.Camera, entityMap.get(camera));
    setCamera(cameraManager, XRTrackedInputDevice.LeftCamera, entityMap.get(leftCamera));
    setCamera(cameraManager, XRTrackedInputDevice.RightCamera, entityMap.get(rightCamera));

    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (!feature.enable) continue;
      switch (feature.type) {
        case XRFeatureType.ImageTracking:
          await addImageTracking(engine, xrManager, <IImageTrackingSchema>feature);
          break;
        case XRFeatureType.PlaneTracking:
          addPlaneTracking(xrManager, <IPlaneTrackingSchema>feature);
          break;
        case XRFeatureType.AnchorTracking:
          addAnchorTracking(xrManager, <IAnchorTrackingSchema>feature);
          break;
        case XRFeatureType.HitTest:
          addHitTest(xrManager, <IHitTestSchema>feature);
          break;
        default:
          break;
      }
    }
  }
}

function addImageTracking(engine: Engine, xrManager: XRManager, schema: IImageTrackingSchema): Promise<void> {
  if (!xrManager.isSupportedFeature(XRImageTracking)) {
    Logger.error("Image Tracking is not supported.");
    return;
  }
  const promises = [];
  const { images } = schema;
  const { resourceManager } = engine;
  for (let i = 0, n = images.length; i < n; i++) {
    // @ts-ignore
    promises.push(resourceManager.getResourceByRef(images[i]));
  }
  return Promise.all(promises).then((xrReferenceImages: XRReferenceImage[]) => {
    xrManager.addFeature(XRImageTracking, xrReferenceImages);
  });
}

function addPlaneTracking(xrManager: XRManager, schema: IPlaneTrackingSchema): void {
  if (!xrManager.isSupportedFeature(XRPlaneTracking)) {
    Logger.error("Plane Tracking is not supported.");
    return;
  }
  xrManager.addFeature(XRPlaneTracking, schema.detectionMode);
}

function addAnchorTracking(xrManager: XRManager, schema: IAnchorTrackingSchema): void {
  if (!xrManager.isSupportedFeature(XRAnchorTracking)) {
    Logger.error("Anchor Tracking is not supported.");
    return;
  }
  const anchorTracking = xrManager.addFeature(XRAnchorTracking);
  const { anchors } = schema;
  for (let i = 0, n = anchors.length; i < n; i++) {
    const anchor = anchors[i];
    const position = new Vector3().copyFrom(anchor.position);
    const rotation = new Quaternion().copyFrom(anchor.rotation);
    anchorTracking.addAnchor(position, rotation);
  }
}

function addHitTest(xrManager: XRManager, schema: IHitTestSchema): void {
  if (!xrManager.isSupportedFeature(XRHitTest)) {
    Logger.error("Hit Test is not supported.");
    return;
  }
  xrManager.addFeature(XRHitTest);
}

function setCamera(cameraManager: XRCameraManager, device: CameraDevice, entity: Entity): void {
  const camera = entity?.getComponent(Camera);
  camera && cameraManager.attachCamera(device, camera);
}

type CameraDevice = XRTrackedInputDevice.Camera | XRTrackedInputDevice.LeftCamera | XRTrackedInputDevice.RightCamera;
