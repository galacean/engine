import { Camera, Engine, Logger, Material, RenderQueue } from "@oasis-engine/core";
import { GLSprite } from "./GLSprite";
import "./GLSpriteMaterial";

/**
 * @private
 */
export class GLSpriteBatcher {
  private _gl: WebGLRenderingContext;
  private _batchedQueue;
  private _targetTexture;
  private _glSprite: GLSprite;
  private _camera;

  constructor(rhi) {
    this._gl = rhi.gl;

    this._batchedQueue = [];
    this._targetTexture = null;

    this._glSprite = new GLSprite(rhi.gl);

    this._camera = null;
  }

  flush(engine: Engine, material: Material) {
    if (this._batchedQueue.length === 0) {
      return;
    }

    if (!this._targetTexture) {
      Logger.error("No texture!");
      return;
    }

    const materialData = material.shaderData;
    materialData.setTexture("s_diffuse", this._targetTexture);
    materialData.setMatrix("matView", this._camera.viewMatrix);
    materialData.setMatrix("matProjection", this._camera.projectionMatrix);

    //@ts-ignore
    const compileMacros = RenderQueue.compileMacros;
    compileMacros.clear();

    //@ts-ignore
    const program = material.shader._getShaderProgram(engine, compileMacros);
    if (!program.isValid) {
      return;
    }

    program.bind();
    program.groupingOtherUniformBlock();
    program.uploadAll(program.materialUniformBlock, materialData);

    //@ts-ignore
    material.renderState._apply(engine);

    this._glSprite.beginDraw(this._batchedQueue.length);
    for (let i = 0, len = this._batchedQueue.length; i < len; i++) {
      const positionQuad = this._batchedQueue[i].positionQuad;
      const uvRect = this._batchedQueue[i].uvRect;
      const tintColor = this._batchedQueue[i].tintColor;
      this._glSprite.drawSprite(positionQuad, uvRect, tintColor);
    }
    this._glSprite.endDraw(program);

    this._batchedQueue = [];
    this._targetTexture = null;
    this._camera = null;
  }

  canBatch(texture, renderMode, camera: Camera) {
    if (this._targetTexture === null) {
      return true;
    }
    return texture === this._targetTexture && camera === this._camera;
  }

  drawSprite(material: Material, positionQuad, uvRect, tintColor, texture, renderMode, camera: Camera) {
    if (!this.canBatch(texture, renderMode, camera)) {
      this.flush(camera.engine, material);
    }

    this._targetTexture = texture;
    this._camera = camera;
    this._batchedQueue.push({ positionQuad, uvRect, tintColor });
  }

  finalize() {
    this._glSprite.finalize();
  }
}
