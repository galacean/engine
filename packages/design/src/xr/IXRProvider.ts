import { IXRDescriptor } from "./descriptor/IXRDescriptor";
import { IXRFeature } from "./feature/IXRFeature";

export interface IXRProvider {
  name: string;

  isSupportedMode(mode: number): Promise<void>;

  isSupportedTrackingMode(mode: number): Promise<void>;

  isSupportedSubsystem(feature: number): Promise<void>;

  createSubsystem<T extends IXRFeature>(feature: number): Promise<T>;

  initialize(descriptor: IXRDescriptor): Promise<void>;

  start(): Promise<void>;

  onUpdate(): void;

  onLateUpdate(): void;

  onDestroy(): void;
}
