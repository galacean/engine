import { IXRFeature } from "@galacean/engine-design";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";
import { Camera } from "../../Camera";

export interface IXRCameraManager extends IXRFeature {
  get near(): number;
  set near(value: number);

  get far(): number;
  set far(value: number);

  attachCamera(source: EnumXRInputSource, camera: Camera): void;
  detachCamera(source: EnumXRInputSource): void;
  getCamera(source: EnumXRInputSource): Camera;
}
