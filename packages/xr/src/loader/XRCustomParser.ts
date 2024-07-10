import {
  Camera,
  CustomParser,
  Engine,
  Entity,
  IScene,
  Logger,
  ParserContext,
  Quaternion,
  Scene,
  Vector3,
  XRManager,
  registerCustomParser
} from "@galacean/engine";
import { XRFeatureType } from "../feature/XRFeatureType";
import { XRCameraManager } from "../feature/camera/XRCameraManager";
import { XRHitTest } from "../feature/hitTest/XRHitTest";
import { XRAnchorTracking } from "../feature/trackable/anchor/XRAnchorTracking";
import { XRImageTracking } from "../feature/trackable/image/XRImageTracking";
import { XRReferenceImage } from "../feature/trackable/image/XRReferenceImage";
import { XRPlaneTracking } from "../feature/trackable/plane/XRPlaneTracking";
import { XRTrackedInputDevice } from "../input/XRTrackedInputDevice";
import {
  IAnchorTrackingSchema,
  IHitTestSchema,
  IImageTrackingSchema,
  IPlaneTrackingSchema,
  IXRScene
} from "./IXRScene";

@registerCustomParser("XR")
export class XRCustomParser extends CustomParser {
  override async onSceneParse(engine: Engine, context: ParserContext<IScene, Scene>, data: IXRScene): Promise<void> {
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
    this.setCamera(cameraManager, XRTrackedInputDevice.Camera, entityMap.get(camera));
    this.setCamera(cameraManager, XRTrackedInputDevice.LeftCamera, entityMap.get(leftCamera));
    this.setCamera(cameraManager, XRTrackedInputDevice.RightCamera, entityMap.get(rightCamera));

    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      if (!feature.enable) continue;
      switch (feature.type) {
        case XRFeatureType.ImageTracking:
          await this.addImageTracking(engine, xrManager, <IImageTrackingSchema>feature);
          break;
        case XRFeatureType.PlaneTracking:
          this.addPlaneTracking(xrManager, <IPlaneTrackingSchema>feature);
          break;
        case XRFeatureType.AnchorTracking:
          this.addAnchorTracking(xrManager, <IAnchorTrackingSchema>feature);
          break;
        case XRFeatureType.HitTest:
          this.addHitTest(xrManager, <IHitTestSchema>feature);
          break;
        default:
          break;
      }
    }
  }

  async addImageTracking(engine: Engine, xrManager: XRManager, schema: IImageTrackingSchema): Promise<void> {
    if (!xrManager.isSupportedFeature(XRImageTracking)) {
      Logger.error("Image Tracking is not supported.");
      return;
    }
    const promises = [];
    const { images } = schema;
    for (let i = 0, n = images.length; i < n; i++) {
      // @ts-ignore
      promises.push(engine.resourceManager.getResourceByRef(images[i]));
    }
    return Promise.all(promises).then((xrReferenceImages: XRReferenceImage[]) => {
      xrManager.addFeature(XRImageTracking, xrReferenceImages);
    });
  }

  addPlaneTracking(xrManager: XRManager, schema: IPlaneTrackingSchema): void {
    if (!xrManager.isSupportedFeature(XRPlaneTracking)) {
      Logger.error("Plane Tracking is not supported.");
      return;
    }
    xrManager.addFeature(XRPlaneTracking, schema.detectionMode);
  }

  addAnchorTracking(xrManager: XRManager, schema: IAnchorTrackingSchema): void {
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

  addHitTest(xrManager: XRManager, schema: IHitTestSchema): void {
    if (!xrManager.isSupportedFeature(XRHitTest)) {
      Logger.error("Plane Tracking is not supported.");
      return;
    }
  }

  setCamera(cameraManager: XRCameraManager, device: CameraDevice, entity: Entity): void {
    const camera = entity?.getComponent(Camera);
    camera && cameraManager.attachCamera(device, camera);
  }
}

type CameraDevice = XRTrackedInputDevice.Camera | XRTrackedInputDevice.LeftCamera | XRTrackedInputDevice.RightCamera;
