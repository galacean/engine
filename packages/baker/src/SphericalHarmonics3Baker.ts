import { TextureCubeFace, TextureCubeMap } from "@oasis-engine/core";
import { Color, SphericalHarmonics3, Vector3 } from "@oasis-engine/math";

/**
 * Bake irradiance into spherical harmonics3.
 * @remarks
 * http://www.ppsloan.org/publications/StupidSH36.pdf
 */
export class SphericalHarmonics3Baker {
  private static _tempColor: Color = new Color();
  private static _tempVector: Vector3 = new Vector3();

  /**
   * Bake from Cube texture.
   * @param texture - Cube texture
   * @param out - SH3 for output
   */
  static fromTextureCubeMap(texture: TextureCubeMap, out: SphericalHarmonics3): void {
    out.clear();

    const channelLength = 4;
    const textureSize = texture.width;
    const data = new Uint8Array(textureSize * textureSize * channelLength); // read pixel always return rgba
    const color = SphericalHarmonics3Baker._tempColor;
    const direction = SphericalHarmonics3Baker._tempVector;
    const texelSize = 2 / textureSize; // convolution is in the space of [-1, 1]

    let solidAngleSum = 0; // ideal value is 4 * pi

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      texture.getPixelBuffer(TextureCubeFace.PositiveX + faceIndex, 0, 0, textureSize, textureSize, data);
      let v = texelSize * 0.5 - 1;
      for (let y = 0; y < textureSize; y++) {
        let u = texelSize * 0.5 - 1;
        for (let x = 0; x < textureSize; x++) {
          const dataOffset = y * textureSize * channelLength + x * channelLength;
          // @todo: float, sRGB, HDR, gamma
          // @todo: alpha is invalid, maybe Color3 needed ?
          color.setValue(data[dataOffset], data[dataOffset + 1], data[dataOffset + 2], 0).scale(1 / 255);

          switch (faceIndex) {
            case TextureCubeFace.PositiveX:
              direction.setValue(1, -v, -u);
              break;
            case TextureCubeFace.NegativeX:
              direction.setValue(-1, -v, u);
              break;
            case TextureCubeFace.PositiveY:
              direction.setValue(u, 1, v);
              break;
            case TextureCubeFace.NegativeY:
              direction.setValue(u, -1, -v);
              break;
            case TextureCubeFace.PositiveZ:
              direction.setValue(u, -v, 1);
              break;
            case TextureCubeFace.NegativeZ:
              direction.setValue(-u, -v, -1);
              break;
          }
          /**
           * dA = cos = S / r = 4 / r
           * dw =  dA / r2 = 4 / r / r2
           */
          const solidAngle = 4 / (direction.length() * direction.lengthSquared());
          solidAngleSum += solidAngle;
          out.addRadiance(color, direction.normalize(), solidAngle);
          u += texelSize;
        }
        v += texelSize;
      }
    }

    out.scale((4 * Math.PI) / solidAngleSum);
  }
}
