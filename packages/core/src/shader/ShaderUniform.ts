import { IHardwareRenderer } from "@galacean/engine-design";
import { Color, Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Texture } from "../texture/Texture";
import { ShaderPropertyValueType } from "./ShaderData";

/**
 * Shader uniform。
 * @internal
 */
export class ShaderUniform {
  name: string;
  propertyId: number;
  location: WebGLUniformLocation;
  applyFunc: (shaderUniform: ShaderUniform, value: ShaderPropertyValueType) => void;
  cacheValue: number | Vector2 | Vector3 | Vector4;
  textureIndex: GLenum | GLenum[];
  textureDefault: Texture | Texture[];
  textureUseCompareMode: boolean = false;

  private _rhi: IHardwareRenderer;
  private _gl: WebGLRenderingContext;

  constructor(engine: Engine) {
    const rhi = engine._hardwareRenderer;
    this._rhi = rhi;
    this._gl = rhi.gl;
  }

  upload1f(shaderUniform: ShaderUniform, value: number): void {
    if (this.cacheValue !== value) {
      this._gl.uniform1f(shaderUniform.location, value);
      this.cacheValue = value;
    }
  }

  upload1fv(shaderUniform: ShaderUniform, value: Float32Array): void {
    this._gl.uniform1fv(shaderUniform.location, value);
  }

  upload2f(shaderUniform: ShaderUniform, value: Vector2 | Vector3 | Vector4 | Color): void {
    const cacheValue = <Vector2>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (cacheValue.x !== (<Color>value).r || cacheValue.y !== (<Color>value).g) {
        this._gl.uniform2f(
          shaderUniform.location,
          Color.gammaToLinearSpace((<Color>value).r),
          Color.gammaToLinearSpace((<Color>value).g)
        );
        cacheValue.x = (<Color>value).r;
        cacheValue.y = (<Color>value).g;
      }
    } else {
      if (cacheValue.x !== (<Vector2>value).x || cacheValue.y !== (<Vector2>value).y) {
        this._gl.uniform2f(shaderUniform.location, (<Vector2>value).x, (<Vector2>value).y);
        cacheValue.x = (<Vector2>value).x;
        cacheValue.y = (<Vector2>value).y;
      }
    }
  }

  upload2fv(shaderUniform: ShaderUniform, value: Float32Array): void {
    this._gl.uniform2fv(shaderUniform.location, value);
  }

  upload3f(shaderUniform: ShaderUniform, value: Vector3 | Vector4 | Color): void {
    const cacheValue = <Vector3>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (cacheValue.x !== (<Color>value).r || cacheValue.y !== (<Color>value).g || cacheValue.z !== (<Color>value).b) {
        this._gl.uniform3f(
          shaderUniform.location,
          Color.gammaToLinearSpace((<Color>value).r),
          Color.gammaToLinearSpace((<Color>value).g),
          Color.gammaToLinearSpace((<Color>value).b)
        );
        cacheValue.x = (<Color>value).r;
        cacheValue.y = (<Color>value).g;
        cacheValue.z = (<Color>value).b;
      }
    } else {
      if (
        cacheValue.x !== (<Vector3>value).x ||
        cacheValue.y !== (<Vector3>value).y ||
        cacheValue.z !== (<Vector3>value).z
      ) {
        this._gl.uniform3f(shaderUniform.location, (<Vector3>value).x, (<Vector3>value).y, (<Vector3>value).z);
        cacheValue.x = (<Vector3>value).x;
        cacheValue.y = (<Vector3>value).y;
        cacheValue.z = (<Vector3>value).z;
      }
    }
  }

  upload3fv(shaderUniform: ShaderUniform, value: Float32Array): void {
    this._gl.uniform3fv(shaderUniform.location, value);
  }

  upload4f(shaderUniform: ShaderUniform, value: Vector4 | Color): void {
    const cacheValue = <Vector4>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (
        cacheValue.x !== (<Color>value).r ||
        cacheValue.y !== (<Color>value).g ||
        cacheValue.z !== (<Color>value).b ||
        cacheValue.w !== (<Color>value).a
      ) {
        this._gl.uniform4f(
          shaderUniform.location,
          Color.gammaToLinearSpace((<Color>value).r),
          Color.gammaToLinearSpace((<Color>value).g),
          Color.gammaToLinearSpace((<Color>value).b),
          (<Color>value).a
        );
        cacheValue.x = (<Color>value).r;
        cacheValue.y = (<Color>value).g;
        cacheValue.z = (<Color>value).b;
        cacheValue.w = (<Color>value).a;
      }
    } else {
      if (
        cacheValue.x !== (<Vector4>value).x ||
        cacheValue.y !== (<Vector4>value).y ||
        cacheValue.z !== (<Vector4>value).z ||
        cacheValue.w !== (<Vector4>value).w
      ) {
        this._gl.uniform4f(
          shaderUniform.location,
          (<Vector4>value).x,
          (<Vector4>value).y,
          (<Vector4>value).z,
          (<Vector4>value).w
        );
        cacheValue.x = (<Vector4>value).x;
        cacheValue.y = (<Vector4>value).y;
        cacheValue.z = (<Vector4>value).z;
        cacheValue.w = (<Vector4>value).w;
      }
    }
  }

  upload4fv(shaderUniform: ShaderUniform, value: Float32Array): void {
    this._gl.uniform4fv(shaderUniform.location, value);
  }

  upload1i(shaderUniform: ShaderUniform, value: number): void {
    if (this.cacheValue !== value) {
      this._gl.uniform1i(shaderUniform.location, value);
      this.cacheValue = value;
    }
  }

  upload1iv(shaderUniform: ShaderUniform, value: Int32Array): void {
    this._gl.uniform1iv(shaderUniform.location, value);
  }

  upload2i(shaderUniform: ShaderUniform, value: Vector2 | Vector3 | Vector4 | Color): void {
    const cacheValue = <Vector2>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (cacheValue.x !== (<Color>value).r || cacheValue.y !== (<Color>value).g) {
        this._gl.uniform2i(shaderUniform.location, (<Color>value).r, (<Color>value).g);
        cacheValue.x = (<Color>value).r;
        cacheValue.y = (<Color>value).g;
      }
    } else {
      if (cacheValue.x !== (<Vector2>value).x || cacheValue.y !== (<Vector2>value).y) {
        this._gl.uniform2i(shaderUniform.location, (<Vector2>value).x, (<Vector2>value).y);
        cacheValue.x = (<Vector2>value).x;
        cacheValue.y = (<Vector2>value).y;
      }
    }
  }

  upload2iv(shaderUniform: ShaderUniform, value: Int32Array): void {
    this._gl.uniform2iv(shaderUniform.location, value);
  }

  upload3i(shaderUniform: ShaderUniform, value: Vector3 | Vector4 | Color): void {
    const cacheValue = <Vector3>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (cacheValue.x !== (<Color>value).r || cacheValue.y !== (<Color>value).g || cacheValue.z !== (<Color>value).b) {
        this._gl.uniform3i(shaderUniform.location, (<Color>value).r, (<Color>value).g, (<Color>value).b);
        cacheValue.x = (<Color>value).r;
        cacheValue.y = (<Color>value).g;
        cacheValue.z = (<Color>value).b;
      }
    } else {
      if (
        cacheValue.x !== (<Vector3>value).x ||
        cacheValue.y !== (<Vector3>value).y ||
        cacheValue.z !== (<Vector3>value).z
      ) {
        this._gl.uniform3i(shaderUniform.location, (<Vector3>value).x, (<Vector3>value).y, (<Vector3>value).z);
        cacheValue.x = (<Vector3>value).x;
        cacheValue.y = (<Vector3>value).y;
        cacheValue.z = (<Vector3>value).z;
      }
    }
  }
  upload3iv(shaderUniform: ShaderUniform, value: Int32Array): void {
    this._gl.uniform3iv(shaderUniform.location, value);
  }
  upload4i(shaderUniform: ShaderUniform, value: Vector4 | Color): void {
    const cacheValue = <Vector4>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (
        cacheValue.x !== (<Color>value).r ||
        cacheValue.y !== (<Color>value).g ||
        cacheValue.z !== (<Color>value).b ||
        cacheValue.w !== (<Color>value).a
      ) {
        this._gl.uniform4i(
          shaderUniform.location,
          (<Color>value).r,
          (<Color>value).g,
          (<Color>value).b,
          (<Color>value).a
        );
        cacheValue.x = (<Color>value).r;
        cacheValue.y = (<Color>value).g;
        cacheValue.z = (<Color>value).b;
        cacheValue.w = (<Color>value).a;
      }
    } else {
      if (
        cacheValue.x !== (<Vector4>value).x ||
        cacheValue.y !== (<Vector4>value).y ||
        cacheValue.z !== (<Vector4>value).z ||
        cacheValue.w !== (<Vector4>value).w
      ) {
        this._gl.uniform4i(
          shaderUniform.location,
          (<Vector4>value).x,
          (<Vector4>value).y,
          (<Vector4>value).z,
          (<Vector4>value).w
        );
        cacheValue.x = (<Vector4>value).x;
        cacheValue.y = (<Vector4>value).y;
        cacheValue.z = (<Vector4>value).z;
        cacheValue.w = (<Vector4>value).w;
      }
    }
  }

  upload4iv(shaderUniform: ShaderUniform, value: Int32Array): void {
    this._gl.uniform4iv(shaderUniform.location, value);
  }

  uploadMat4(shaderUniform: ShaderUniform, value: Matrix): void {
    this._gl.uniformMatrix4fv(shaderUniform.location, false, value.elements);
  }

  uploadMat4v(shaderUniform: ShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix4fv(shaderUniform.location, false, value);
  }

  uploadTexture(shaderUniform: ShaderUniform, value: Texture): void {
    const rhi = this._rhi;
    rhi.activeTexture(shaderUniform.textureIndex as GLenum);
    rhi.bindTexture(value._platformTexture);

    value._setUseDepthCompareMode(shaderUniform.textureUseCompareMode);
  }

  uploadTextureArray(shaderUniform: ShaderUniform, value: Texture[]): void {
    const rhi = this._rhi;
    const textureIndices = shaderUniform.textureIndex as GLenum[];
    for (let i = 0; i < value.length; i++) {
      const texture = value[i];
      rhi.activeTexture(textureIndices[i]);
      rhi.bindTexture(texture._platformTexture);
      texture._setUseDepthCompareMode(shaderUniform.textureUseCompareMode);
    }
  }
}
