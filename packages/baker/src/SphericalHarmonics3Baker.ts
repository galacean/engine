import { Color, SphericalHarmonics3, TextureCubeFace, TextureCubeMap, Vector3 } from "oasis-engine";
import { EncodingMode } from "./enum/EncodingMode";

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
   * @param encodingMode - Encoding mode, dependent on texture format.
   */
  static fromTextureCubeMap(texture: TextureCubeMap, out: SphericalHarmonics3, encodingMode: EncodingMode): void {
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

          switch (encodingMode) {
            case EncodingMode.Linear:
              color.setValue(data[dataOffset] / 255, data[dataOffset + 1] / 255, data[dataOffset + 2] / 255, 0);
              break;
            case EncodingMode.Gamma:
              color.setValue(
                Color.gammaToLinearSpace(data[dataOffset] / 255),
                Color.gammaToLinearSpace(data[dataOffset + 1] / 255),
                Color.gammaToLinearSpace(data[dataOffset + 2] / 255),
                0
              );
              break;
            case EncodingMode.RGBE:
              this._RGBEToLinear(
                data[dataOffset],
                data[dataOffset + 1],
                data[dataOffset + 2],
                data[dataOffset + 3],
                color
              );
              break;
          }

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

  private static _RGBEToLinear(r: number, g: number, b: number, a: number, out: Color) {
    if (a === 0) {
      out.setValue(0, 0, 0, 1);
    } else {
      const scale = Math.pow(2, a - 128) / 255;
      out.setValue(r * scale, g * scale, b * scale, 1);
    }
  }
}
