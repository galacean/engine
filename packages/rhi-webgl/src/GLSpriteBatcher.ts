import { Logger } from '@alipay/o3-base';
import { GLSprite } from './GLSprite';
import { createSpriteMaterial, SpriteTechnique } from './GLSpriteMaterial';
import { GLTechnique } from './GLTechnique';
import { RenderTechnique } from "@alipay/o3-material";

/**
 * GL 层的 Technique 资源管理和渲染调用处理
 * @private
 */
export class GLSpriteBatcher {

  private _gl: WebGLRenderingContext;
  private _batchedQueue;
  private _targetTexture;
  private _glSprite: GLSprite;
  private _glTech;
  private _material;
  private _camera;

  constructor(rhi) {

    this._gl = rhi.gl;

    this._batchedQueue = [];
    this._targetTexture = null;

    this._glSprite = new GLSprite(rhi.gl);

    //-- 初始化GLTechnique
    this._glTech = new GLTechnique(rhi, SpriteTechnique as RenderTechnique);
    this._material = createSpriteMaterial();
    this._camera = null;

  }

  /**
   * 将缓存的Sprite也绘制出来
   */
  flush() {

    if (this._batchedQueue.length === 0) {

      return;

    }

    if (!this._targetTexture) {

      Logger.error('No texture!');
      return;

    }

    this._material.setValue('s_diffuse', this._targetTexture);

    this._material.setValue('matView', this._camera.viewMatrix);
    this._material.setValue('matProjection', this._camera.projectionMatrix);

    this._glTech.begin(this._material);
    // 绘制
    this._glSprite.beginDraw(this._batchedQueue.length);
    for (let i = 0, len = this._batchedQueue.length; i < len; i++) {

      const positionQuad = this._batchedQueue[i].positionQuad;
      const uvRect = this._batchedQueue[i].uvRect;
      const tintColor = this._batchedQueue[i].tintColor;
      this._glSprite.drawSprite(positionQuad, uvRect, tintColor);

    }
    this._glSprite.endDraw();

    this._glTech.end();

    this._batchedQueue = [];
    this._targetTexture = null;
    this._camera = null;

  }

  /**
   * 检查一个Sprite绘制的时候，能否和上一个Sprite合并绘制
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {ACamera}   camera        相机信息
   */
  canBatch(texture, renderMode, camera) {

    if (this._targetTexture === null) {

      return true;

    }
    return texture === this._targetTexture && camera === this._camera;

  }

  /**
   * 把一个 Sprite 绘制需要的信息传进来，完成Batch逻辑
   * @param {Object} positionQuad  Sprite四个顶点的位置
   * @param {Object} uvRect        Sprite在texture上的纹理坐标
   * @param {vec4}   tintColor     颜色
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {ACamera}   camera        相机信息
   */
  drawSprite(positionQuad, uvRect, tintColor, texture, renderMode, camera) {

    if (!this.canBatch(texture, renderMode, camera)) {

      this.flush();

    }

    this._targetTexture = texture;
    this._camera = camera;
    this._batchedQueue.push({ positionQuad, uvRect, tintColor });

  }

  /**
   * 释放资源
   */
  finalize() {

    this._glSprite.finalize();
    this._glTech.finalize();

  }

}
