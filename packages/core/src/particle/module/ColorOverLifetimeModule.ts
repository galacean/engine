import { ColorGradient } from "./ColorGradient";

/**
 * Color over lifetime.
 */
export class ColorOverLifetimeModule {
  /** The gradient that controls the particle colors. */
  color: ColorGradient;
  /** Specifies whether the ColorOverLifetimeModule is enabled or disabled. */
  enable: boolean;

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destColorOverLifetime: ColorOverLifetimeModule): void {
    destColorOverLifetime.color = this.color;
    destColorOverLifetime.enable = this.enable;
  }

  /**
   * @override
   * @inheritDoc
   */
  clone(): ColorOverLifetimeModule {
    let destColor: ColorGradient;
    switch (this.color.mode) {
      case 0:
        destColor = ColorGradient.createByColor(this.color.color.clone());
        break;
      case 1:
        destColor = ColorGradient.createByGradient(this.color.gradient.clone());
        break;
      case 2:
        destColor = ColorGradient.createByRandomTwoColor(this.color.colorMin.clone(), this.color.colorMax.clone());
        break;
      case 3:
        destColor = ColorGradient.createByRandomTwoGradient(
          this.color.gradientMin.clone(),
          this.color.gradientMax.clone()
        );
        break;
    }

    const destColorOverLifetime = new ColorOverLifetimeModule();
    destColorOverLifetime.color = destColor;
    destColorOverLifetime.enable = this.enable;
    return destColorOverLifetime;
  }
}
