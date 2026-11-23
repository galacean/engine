import type { IPlatformUniform, ShaderPropertyValueType, Texture } from "@galacean/engine-core";
import { Color, Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * Shader uniform。
 * @internal
 */
export class GLShaderUniform implements IPlatformUniform {
  isTexture = false;
  name: string;
  propertyId: number;
  location: WebGLUniformLocation;
  applyFunc: (shaderUniform: GLShaderUniform, value: ShaderPropertyValueType) => void;
  cacheValue: number | Vector2 | Vector3 | Vector4;
  textureIndex: GLenum | GLenum[];
  textureDefault: Texture | Texture[];
  textureUseCompareMode: boolean = false;

  private _rhi: WebGLGraphicDevice;
  private _gl: WebGL2RenderingContext;

  apply(value: ShaderPropertyValueType): void {
    this.applyFunc(this, value);
  }

  constructor(rhi: WebGLGraphicDevice) {
    this._rhi = rhi;
    this._gl = rhi.gl;
  }

  upload1f(shaderUniform: GLShaderUniform, value: number): void {
    if (this.cacheValue !== value) {
      this._gl.uniform1f(shaderUniform.location, value);
      this.cacheValue = value;
    }
  }

  upload1fv(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniform1fv(shaderUniform.location, value);
  }

  upload2f(shaderUniform: GLShaderUniform, value: Vector2 | Vector3 | Vector4 | Color): void {
    const cacheValue = <Vector2>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (cacheValue.x !== (<Color>value).r || cacheValue.y !== (<Color>value).g) {
        this._gl.uniform2f(shaderUniform.location, (<Color>value).r, (<Color>value).g);
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

  upload2fv(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniform2fv(shaderUniform.location, value);
  }

  upload3f(shaderUniform: GLShaderUniform, value: Vector3 | Vector4 | Color): void {
    const cacheValue = <Vector3>this.cacheValue;
    if ((<Color>value).r !== undefined) {
      if (cacheValue.x !== (<Color>value).r || cacheValue.y !== (<Color>value).g || cacheValue.z !== (<Color>value).b) {
        this._gl.uniform3f(shaderUniform.location, (<Color>value).r, (<Color>value).g, (<Color>value).b);
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

  upload3fv(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniform3fv(shaderUniform.location, value);
  }

  upload4f(shaderUniform: GLShaderUniform, value: Vector4 | Color): void {
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

  upload4fv(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniform4fv(shaderUniform.location, value);
  }

  upload1i(shaderUniform: GLShaderUniform, value: number): void {
    if (this.cacheValue !== value) {
      this._gl.uniform1i(shaderUniform.location, value);
      this.cacheValue = value;
    }
  }

  upload1iv(shaderUniform: GLShaderUniform, value: Int32Array): void {
    this._gl.uniform1iv(shaderUniform.location, value);
  }

  upload2i(shaderUniform: GLShaderUniform, value: Vector2 | Vector3 | Vector4 | Color): void {
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

  upload2iv(shaderUniform: GLShaderUniform, value: Int32Array): void {
    this._gl.uniform2iv(shaderUniform.location, value);
  }

  upload3i(shaderUniform: GLShaderUniform, value: Vector3 | Vector4 | Color): void {
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
  upload3iv(shaderUniform: GLShaderUniform, value: Int32Array): void {
    this._gl.uniform3iv(shaderUniform.location, value);
  }
  upload4i(shaderUniform: GLShaderUniform, value: Vector4 | Color): void {
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

  upload4iv(shaderUniform: GLShaderUniform, value: Int32Array): void {
    this._gl.uniform4iv(shaderUniform.location, value);
  }

  uploadMat2(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix2fv(shaderUniform.location, false, value);
  }

  uploadMat3(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix3fv(shaderUniform.location, false, value);
  }

  uploadMat4(shaderUniform: GLShaderUniform, value: Matrix): void {
    this._gl.uniformMatrix4fv(shaderUniform.location, false, value.elements);
  }

  uploadMat4v(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix4fv(shaderUniform.location, false, value);
  }

  uploadMat2x3(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix2x3fv(shaderUniform.location, false, value);
  }

  uploadMat2x4(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix2x4fv(shaderUniform.location, false, value);
  }

  uploadMat3x2(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix3x2fv(shaderUniform.location, false, value);
  }

  uploadMat3x4(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix3x4fv(shaderUniform.location, false, value);
  }

  uploadMat4x2(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix4x2fv(shaderUniform.location, false, value);
  }

  uploadMat4x3(shaderUniform: GLShaderUniform, value: Float32Array): void {
    this._gl.uniformMatrix4x3fv(shaderUniform.location, false, value);
  }

  uploadTexture(shaderUniform: GLShaderUniform, value: Texture): void {
    this._rhi.bindSampledTexture(value, shaderUniform.textureIndex as GLenum, shaderUniform.textureUseCompareMode);
  }

  uploadTextureArray(shaderUniform: GLShaderUniform, value: Texture[]): void {
    if (!Array.isArray(value)) {
      value = <Texture[]>shaderUniform.textureDefault;
    }
    const rhi = this._rhi;
    const textureIndices = shaderUniform.textureIndex as GLenum[];
    const defaults = shaderUniform.textureDefault as Texture[];
    for (let i = 0; i < textureIndices.length; i++) {
      rhi.bindSampledTexture(value[i] ?? defaults[i], textureIndices[i], shaderUniform.textureUseCompareMode);
    }
  }
}
