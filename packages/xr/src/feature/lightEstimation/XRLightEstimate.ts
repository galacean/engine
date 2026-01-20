import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { IXRLightEstimate } from "@galacean/engine-design";

export class XRLightEstimate implements IXRLightEstimate {
  sphericalHarmonics: SphericalHarmonics3 = new SphericalHarmonics3();
  primaryLightDirection: Vector3 = new Vector3();
  primaryLightIntensity: Color = new Color(1, 1, 1, 1);
}
