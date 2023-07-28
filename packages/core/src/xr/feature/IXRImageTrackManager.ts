import { IXRFeature } from "@galacean/engine-design";
import { Entity } from "../../Entity";

export interface IXRImageTrackManager extends IXRFeature {
  addImage(): void;
  removeImage(): void;
  getTrackedObject(): Entity;
}
