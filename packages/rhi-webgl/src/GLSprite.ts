import { Logger } from "@oasis-engine/core";
import { Vector2, Vector3, Vector4 } from "@oasis-engine/math";

/**
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

    this._vbo = gl.createBuffer();
    this._maxBatchCount = 0;
    this._vertBuffer = null;
    this._vertCursor = 0;
    this._drawSpriteCount = 0;
  }

  setMaxBatchCount(count) {
    const requireSize = count * 6 * 9;
    if (this._vertBuffer && this._vertBuffer.length >= requireSize) {
      return;
    }

    this._maxBatchCount = count;
    this._vertBuffer = new Float32Array(requireSize);
  }

  beginDraw(count) {
    this._vertCursor = 0;
    this._drawSpriteCount = 0;

    // Dynamic resize
    if (count > this._maxBatchCount) {
      this.setMaxBatchCount(count);
    }
  }

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

    this._pushVertex(positionQuad.leftTop, new Vector2(u, v), color);
    this._pushVertex(positionQuad.leftBottom, new Vector2(u, q), color);
    this._pushVertex(positionQuad.rightBottom, new Vector2(p, q), color);

    this._pushVertex(positionQuad.rightBottom, new Vector2(p, q), color);
    this._pushVertex(positionQuad.rightTop, new Vector2(p, v), color);
    this._pushVertex(positionQuad.leftTop, new Vector2(u, v), color);
  }

  endDraw(shaderProgram) {
    const vertCount = this._vertCursor / 9;
    if (vertCount <= 0) return;

    var gl = this.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._vertBuffer, gl.DYNAMIC_DRAW);

    const attributeLocation = shaderProgram.attributeLocation;
    for (const k in attributeLocation) {
      const location = attributeLocation[k];
      const attrib = this._vertAttributes[k];
      gl.vertexAttribPointer(location, attrib.size, attrib.type, attrib.normalized, attrib.stride, attrib.offset);
      gl.enableVertexAttribArray(location);
    }

    gl.drawArrays(gl.TRIANGLES, 0, vertCount);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // disable attributes
    for (const k in attributeLocation) {
      gl.disableVertexAttribArray(attributeLocation[k]);
    }
  }

  _initVertexAttributes(gl) {
    const vertexStride = (3 + 2 + 4) * 4;
    const posAtt: any = {};
    posAtt.name = "a_pos";
    posAtt.size = 3;
    posAtt.offset = 0;

    const uvAtt: any = {};
    uvAtt.name = "a_uv";
    uvAtt.size = 2;
    uvAtt.offset = 3 * 4;

    const colorAtt: any = {};
    colorAtt.name = "a_color";
    colorAtt.size = 4;
    colorAtt.offset = 5 * 4;

    this._vertAttributes = { a_pos: posAtt, a_uv: uvAtt, a_color: colorAtt };
    for (const k in this._vertAttributes) {
      const att = this._vertAttributes[k];
      att.type = gl.FLOAT;
      att.normalized = false;
      att.stride = vertexStride;
    }
  }

  _pushVertex(pos: Vector3, uv: Vector2, color: Vector4) {
    const vb = this._vertBuffer;
    const id = this._vertCursor;

    //-- pos
    vb[id] = pos.x;
    vb[id + 1] = pos.y;
    vb[id + 2] = pos.z;

    //-- uv
    vb[id + 3] = uv.x;
    vb[id + 4] = uv.y;

    //-- color
    vb[id + 5] = color.x;
    vb[id + 6] = color.y;
    vb[id + 7] = color.z;
    vb[id + 8] = color.w;

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
