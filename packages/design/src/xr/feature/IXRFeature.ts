export interface IXRFeature {
  onEnable(): void;
  onDisable(): void;
  onUpdate(): void;
  onDestroy(): void;
}
