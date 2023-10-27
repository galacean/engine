import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

export interface IXRFeatureManager {
  descriptor: IXRFeatureDescriptor;
  enabled: boolean;

  isSupported(descriptor?: IXRFeatureDescriptor): Promise<void>;
  initialize(): Promise<void>;

  /**
   * Enable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onEnable(): void;

  /**
   * Disable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onDisable(): void;

  _onSessionInit(): void;

  _onSessionStart(): void;

  _onSessionStop(): void;

  _onSessionDestroy(): void;
  /**
   * Update an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onUpdate(): void;

  /**
   * Destroy an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  _onDestroy(): void;
}
