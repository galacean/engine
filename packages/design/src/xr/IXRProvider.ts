import { IXRDescriptor } from "./descriptor/IXRDescriptor";
import { IXRFeature } from "./feature/IXRFeature";

export interface IXRProvider {
  name: string;

  isSupportedMode(mode: number): Promise<void>;

  isSupportedFeature(feature: number): Promise<void>;

  createFeature<T extends IXRFeature>(feature: number): Promise<T>;

  initialize(descriptor: IXRDescriptor): Promise<void>;

  start(): Promise<void>;

  onUpdate(): void;

  onLateUpdate(): void;

  onDestroy(): void;
}
