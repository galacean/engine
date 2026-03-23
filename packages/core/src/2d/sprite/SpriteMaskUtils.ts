import { Matrix, Vector2, Vector3 } from "@galacean/engine-math";
import { Texture2D, TextureFormat } from "../../texture";
import { Sprite } from "./Sprite";

/**
 * Internal helpers for sprite mask hit testing.
 * @internal
 */
export class SpriteMaskUtils {
  private static _tempMat: Matrix = new Matrix();
  private static _tempVec3: Vector3 = new Vector3();
  private static _u8Buffer1 = new Uint8Array(1);
  private static _u8Buffer2 = new Uint8Array(2);
  private static _u8Buffer4 = new Uint8Array(4);
  private static _u16Buffer1 = new Uint16Array(1);
  private static _u16Buffer4 = new Uint16Array(4);
  private static _f32Buffer4 = new Float32Array(4);
  private static _u32Buffer4 = new Uint32Array(4);

  static containsWorldPoint(
    worldPoint: Vector3,
    sprite: Sprite | null,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean,
    alphaCutoff: number = 0
  ): boolean {
    if (!sprite || !width || !height) {
      return false;
    }

    const worldMatrixInv = SpriteMaskUtils._tempMat;
    Matrix.invert(worldMatrix, worldMatrixInv);
    const localPosition = SpriteMaskUtils._tempVec3;
    Vector3.transformCoordinate(worldPoint, worldMatrixInv, localPosition);

    const sx = flipX ? -width : width;
    const sy = flipY ? -height : height;
    if (!sx || !sy) {
      return false;
    }

    const spriteX = localPosition.x / sx + pivot.x;
    const spriteY = localPosition.y / sy + pivot.y;
    const spritePositions = sprite._getPositions();
    const { x: left, y: bottom } = spritePositions[0];
    const { x: right, y: top } = spritePositions[3];
    if (!(spriteX >= left && spriteX <= right && spriteY >= bottom && spriteY <= top)) {
      return false;
    }

    if (alphaCutoff <= 0) {
      return true;
    }

    const texture = sprite.texture;
    if (!texture) {
      return false;
    }

    const spriteUVs = sprite._getUVs();
    const leftU = spriteUVs[0].x;
    const bottomV = spriteUVs[0].y;
    const rightU = spriteUVs[3].x;
    const topV = spriteUVs[3].y;
    const positionWidth = right - left;
    const positionHeight = top - bottom;
    if (!positionWidth || !positionHeight) {
      return false;
    }

    const tx = (spriteX - left) / positionWidth;
    const ty = (spriteY - bottom) / positionHeight;
    const u = leftU + (rightU - leftU) * tx;
    const v = bottomV + (topV - bottomV) * ty;
    const x = Math.min(Math.max(Math.floor(u * texture.width), 0), texture.width - 1);
    const y = Math.min(Math.max(Math.floor(v * texture.height), 0), texture.height - 1);
    return SpriteMaskUtils._sampleTextureAlpha(texture, x, y) >= alphaCutoff;
  }

  private static _sampleTextureAlpha(texture: Texture2D, x: number, y: number): number {
    try {
      switch (texture.format) {
        case TextureFormat.R8G8B8A8: {
          const buffer = SpriteMaskUtils._u8Buffer4;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return buffer[3] / 255;
        }
        case TextureFormat.R4G4B4A4: {
          const buffer = SpriteMaskUtils._u16Buffer1;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return (buffer[0] & 0xf) / 15;
        }
        case TextureFormat.R5G5B5A1: {
          const buffer = SpriteMaskUtils._u16Buffer1;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return buffer[0] & 0x1;
        }
        case TextureFormat.Alpha8:
        case TextureFormat.R8: {
          const buffer = SpriteMaskUtils._u8Buffer1;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return buffer[0] / 255;
        }
        case TextureFormat.LuminanceAlpha:
        case TextureFormat.R8G8: {
          const buffer = SpriteMaskUtils._u8Buffer2;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return buffer[1] / 255;
        }
        case TextureFormat.R16G16B16A16: {
          const buffer = SpriteMaskUtils._u16Buffer4;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return buffer[3] / 65535;
        }
        case TextureFormat.R32G32B32A32: {
          const buffer = SpriteMaskUtils._f32Buffer4;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return buffer[3];
        }
        case TextureFormat.R32G32B32A32_UInt: {
          const buffer = SpriteMaskUtils._u32Buffer4;
          texture.getPixelBuffer(x, y, 1, 1, buffer);
          return buffer[3] / 4294967295;
        }
        default:
          return 1;
      }
    } catch {
      return 1;
    }
  }
}
