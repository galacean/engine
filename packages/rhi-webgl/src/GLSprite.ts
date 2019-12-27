import { Logger } from "@alipay/o3-base";
import { vec3 } from "@alipay/o3-math";

/**
 * 管理HUD控件Batch绘制时，需要处理的几何体数据
 * @private
 */
export class GLSprite {
  private gl: WebGLRenderingContext;
  private _vbo: WebGLBuffer;
  private _maxBatchCount: number;
  private _vertBuffer;
  private _vertCursor: number;
  private _drawSpriteCount: number;
  private _vertAttributes;
  constructor(gl) {
    this.gl = gl;

    //-- vertex attributes
    this._initVertexAttributes(gl);

    //-- 创建VBO
    this._vbo = gl.createBuffer();
    this._maxBatchCount = 0;
    this._vertBuffer = null; // 在setWidgetCount()中创建
    this._vertCursor = 0; // 当前使用的顶点的index
    this._drawSpriteCount = 0; // 当前这一帧画了多少个Widget
  }

  /**
   * 设置需要绘制的控件的个数
   * @param {NUMBER} count 控件的个数
   */
  setMaxBatchCount(count) {
    // 每个控件需要2个三角形，即6个顶点来绘制
    const requireSize = count * 6 * 9;
    if (this._vertBuffer && this._vertBuffer.length >= requireSize) {
      return;
    }

    this._maxBatchCount = count;
    this._vertBuffer = new Float32Array(requireSize);
  }

  /**
   * 开始绘制控件，清空内部状态
   */
  beginDraw(count) {
    this._vertCursor = 0;
    this._drawSpriteCount = 0;

    // 动态扩张
    if (count > this._maxBatchCount) {
      this.setMaxBatchCount(count);
    }
  }

  /**
   * 将一个2D Sprite绘制所需的矩形，Batch到内部的Vertex Buffer之中
   * @param {HUDWidget} screenRect 需要绘制的控件
   */
  drawSprite(positionQuad, uvRect, tintColor) {
    this._drawSpriteCount++;
    if (this._drawSpriteCount > this._maxBatchCount) {
      Logger.warn("Sprite: sprite count overflow");
      return;
    }

    const color = tintColor;

    const u = uvRect.u;
    const v = uvRect.v;
    const p = uvRect.u + uvRect.width;
    const q = uvRect.v + uvRect.height;

    this._pushVertex(positionQuad.leftTop, [u, v], color);
    this._pushVertex(positionQuad.leftBottom, [u, q], color);
    this._pushVertex(positionQuad.rightBottom, [p, q], color);

    this._pushVertex(positionQuad.rightBottom, [p, q], color);
    this._pushVertex(positionQuad.rightTop, [p, v], color);
    this._pushVertex(positionQuad.leftTop, [u, v], color);
  }

  /**
   * 执行真正的绘制
   */
  endDraw() {
    const vertCount = this._vertCursor / 9;
    if (vertCount <= 0) return;

    var gl = this.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._vertBuffer, gl.DYNAMIC_DRAW);

    for (let i = 0, len = this._vertAttributes.length; i < len; i++) {
      const attrib = this._vertAttributes[i];
      gl.vertexAttribPointer(
        attrib.lastShaderLoc,
        attrib.size,
        attrib.type,
        attrib.normalized,
        attrib.stride,
        attrib.offset
      );
      gl.enableVertexAttribArray(attrib.lastShaderLoc);
    } // end of for

    gl.drawArrays(gl.TRIANGLES, 0, vertCount);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // disable attributes
    for (let i = 0, len = this._vertAttributes.length; i < len; i++) {
      gl.disableVertexAttribArray(this._vertAttributes[i].lastShaderLoc);
    }
  }

  /**
   * 初始化内部的顶点属性，包括pos, uv, color
   * @param {WebGLRenderingContext} gl GL Context对象
   */
  _initVertexAttributes(gl) {
    const vertexStride = (3 + 2 + 4) * 4;
    const posAtt: any = {};
    posAtt.name = "a_pos";
    posAtt.size = 3;
    posAtt.offset = 0;
    posAtt.lastShaderLoc = 0;

    const uvAtt: any = {};
    uvAtt.name = "a_uv";
    uvAtt.size = 2;
    uvAtt.offset = 3 * 4;
    uvAtt.lastShaderLoc = 1;

    const colorAtt: any = {};
    colorAtt.name = "a_color";
    colorAtt.size = 4;
    colorAtt.offset = 5 * 4;
    colorAtt.lastShaderLoc = 2;

    this._vertAttributes = [posAtt, uvAtt, colorAtt];
    for (const att of this._vertAttributes) {
      att.type = gl.FLOAT;
      att.normalized = false;
      att.stride = vertexStride;
    } // end of for
  }

  /**
   * 向当前的顶点缓冲中添加一个顶点
   * @param {vec3} pos 位置坐标
   * @param {vec2} uv 贴图坐标
   * @param {vec4} color 颜色RGBA
   */
  _pushVertex(pos, uv, color) {
    const vb = this._vertBuffer;
    const id = this._vertCursor;

    //-- pos
    vb[id] = pos[0];
    vb[id + 1] = pos[1];
    vb[id + 2] = pos[2];

    //-- uv
    vb[id + 3] = uv[0];
    vb[id + 4] = uv[1];

    //-- color
    vb[id + 5] = color[0];
    vb[id + 6] = color[1];
    vb[id + 7] = color[2];
    vb[id + 8] = color[3];

    //--
    this._vertCursor += 9;
  }

  finalize() {
    if (this._vbo) {
      this.gl.deleteBuffer(this._vbo);
      this._vbo = null;
    }
  }
}
