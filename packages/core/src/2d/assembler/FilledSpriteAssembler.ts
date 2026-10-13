import { BoundingBox, Matrix, Vector2, Vector3 } from "@galacean/engine-math";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { SpriteFilledMode } from "../enums/SpriteFilledMode";
import { SpriteFilledOrigin } from "../enums/SpriteFilledOrigin";
import { ISpriteAssembler } from "./ISpriteAssembler";
import { ISpriteRenderer } from "./ISpriteRenderer";

/**
 * Assemble vertex data for the sprite renderer in filled mode.
 */
@StaticInterfaceImplement<ISpriteAssembler>()
export class FilledSpriteAssembler {
  private static _matrix = new Matrix();
  private static _worldPositions = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3()
  ];
  private static _uvs = [
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2(),
    new Vector2()
  ];
  private static _inPositions: Vector3[] = [];
  private static _inUVs: Vector2[] = [];
  private static _outPositions: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private static _outUVs: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
  private static _vertexOffset = 0;
  private static _indicesOffset = 0;
  // Fill amounts at or below this are treated as empty (render nothing), avoiding degenerate geometry.
  private static readonly _fillAmountEpsilon = 0.001;

  static resetData(renderer: ISpriteRenderer): void {
    const manager = renderer._getChunkManager();
    const lastSubChunk = renderer._subChunk;
    lastSubChunk && manager.freeSubChunk(lastSubChunk);
    // Allocate the maximum any fill mode can produce (Radial360 = 4 quadrants x 4 verts = 16).
    // A fixed size avoids reallocating the sub-chunk when filledMode changes at runtime.
    const subChunk = manager.allocateSubChunk(16);
    subChunk.indices = [];
    renderer._subChunk = subChunk;
  }

  static updatePositions(
    renderer: ISpriteRenderer,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean
  ): void {
    const { x: pivotX, y: pivotY } = pivot;
    const modelMatrix = FilledSpriteAssembler._matrix;
    const { elements: wE } = modelMatrix;
    const { elements: pWE } = worldMatrix;
    const sx = flipX ? -width : width;
    const sy = flipY ? -height : height;
    (wE[0] = pWE[0] * sx), (wE[1] = pWE[1] * sx), (wE[2] = pWE[2] * sx);
    (wE[4] = pWE[4] * sy), (wE[5] = pWE[5] * sy), (wE[6] = pWE[6] * sy);
    (wE[8] = pWE[8]), (wE[9] = pWE[9]), (wE[10] = pWE[10]);
    wE[12] = pWE[12] - pivotX * wE[0] - pivotY * wE[4];
    wE[13] = pWE[13] - pivotX * wE[1] - pivotY * wE[5];
    wE[14] = pWE[14] - pivotX * wE[2] - pivotY * wE[6];

    switch (renderer.filledMode) {
      case SpriteFilledMode.Horizontal:
        this._filledLinear(renderer, modelMatrix, true);
        break;
      case SpriteFilledMode.Vertical:
        this._filledLinear(renderer, modelMatrix, false);
        break;
      case SpriteFilledMode.Radial90:
        this._filledRadial90(
          renderer,
          modelMatrix,
          renderer.filledOrigin,
          renderer.filledAmount,
          renderer.filledClockWise
        );
        break;
      case SpriteFilledMode.Radial180:
        this._filledRadial180(
          renderer,
          modelMatrix,
          renderer.filledOrigin,
          renderer.filledAmount,
          renderer.filledClockWise
        );
        break;
      case SpriteFilledMode.Radial360:
        this._filledRadial360(
          renderer,
          modelMatrix,
          renderer.filledOrigin,
          renderer.filledAmount,
          renderer.filledClockWise
        );
        break;
      default:
        break;
    }

    // @ts-ignore
    BoundingBox.transform(renderer.sprite._getBounds(), modelMatrix, renderer._bounds);
  }

  static updateUVs(renderer: ISpriteRenderer): void {
    // UVs are computed in updatePositions.
  }

  static updateColor(renderer: ISpriteRenderer, alpha: number): void {
    const subChunk = renderer._subChunk;
    const { r, g, b, a } = renderer.color;
    const finalAlpha = a * alpha;
    const vertices = subChunk.chunk.vertices;
    const vertexArea = subChunk.vertexArea;
    for (let i = 0, o = vertexArea.start + 5, n = vertexArea.size / 9; i < n; ++i, o += 9) {
      vertices[o] = r;
      vertices[o + 1] = g;
      vertices[o + 2] = b;
      vertices[o + 3] = finalAlpha;
    }
  }

  private static _filledLinear(renderer: ISpriteRenderer, matrix: Matrix, isHorizontal: boolean): void {
    const amount = renderer.filledAmount;
    if (amount <= this._fillAmountEpsilon) {
      renderer._subChunk.indices.length = 0;
      return;
    }

    const sprite = renderer.sprite;
    const [lPosLB, lPosRB, lPosLT, lPosRT] = sprite._getPositions();
    const spriteUVs = sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];

    const subChunk = renderer._subChunk;
    const vertices = subChunk.chunk.vertices;

    let x0: number, y0: number, u0: number, v0: number;
    let x1: number, y1: number, u1: number, v1: number;
    let x2: number, y2: number, u2: number, v2: number;
    let x3: number, y3: number, u3: number, v3: number;

    if (isHorizontal) {
      const originIsStart = renderer.filledOrigin === SpriteFilledOrigin.Left;
      const startX = originIsStart ? lPosLB.x : lPosRB.x - (lPosRB.x - lPosLB.x) * amount;
      const endX = originIsStart ? lPosLB.x + (lPosRB.x - lPosLB.x) * amount : lPosRB.x;
      const startU = originIsStart ? left : right - (right - left) * amount;
      const endU = originIsStart ? left + (right - left) * amount : right;
      (x0 = startX), (y0 = lPosLB.y), (u0 = startU), (v0 = bottom);
      (x1 = endX), (y1 = lPosRB.y), (u1 = endU), (v1 = bottom);
      (x2 = startX), (y2 = lPosLT.y), (u2 = startU), (v2 = top);
      (x3 = endX), (y3 = lPosRT.y), (u3 = endU), (v3 = top);
    } else {
      const originIsStart = renderer.filledOrigin === SpriteFilledOrigin.Bottom;
      const startY = originIsStart ? lPosLB.y : lPosLT.y - (lPosLT.y - lPosLB.y) * amount;
      const endY = originIsStart ? lPosLB.y + (lPosLT.y - lPosLB.y) * amount : lPosLT.y;
      const startV = originIsStart ? bottom : top - (top - bottom) * amount;
      const endV = originIsStart ? bottom + (top - bottom) * amount : top;
      (x0 = lPosLB.x), (y0 = startY), (u0 = left), (v0 = startV);
      (x1 = lPosRB.x), (y1 = startY), (u1 = right), (v1 = startV);
      (x2 = lPosLT.x), (y2 = endY), (u2 = left), (v2 = endV);
      (x3 = lPosRT.x), (y3 = endY), (u3 = right), (v3 = endV);
    }

    const { elements: wE } = matrix;
    const start = subChunk.vertexArea.start;
    // LB
    vertices[start] = wE[0] * x0 + wE[4] * y0 + wE[12];
    vertices[start + 1] = wE[1] * x0 + wE[5] * y0 + wE[13];
    vertices[start + 2] = wE[2] * x0 + wE[6] * y0 + wE[14];
    vertices[start + 3] = u0;
    vertices[start + 4] = v0;
    // RB
    vertices[start + 9] = wE[0] * x1 + wE[4] * y1 + wE[12];
    vertices[start + 10] = wE[1] * x1 + wE[5] * y1 + wE[13];
    vertices[start + 11] = wE[2] * x1 + wE[6] * y1 + wE[14];
    vertices[start + 12] = u1;
    vertices[start + 13] = v1;
    // LT
    vertices[start + 18] = wE[0] * x2 + wE[4] * y2 + wE[12];
    vertices[start + 19] = wE[1] * x2 + wE[5] * y2 + wE[13];
    vertices[start + 20] = wE[2] * x2 + wE[6] * y2 + wE[14];
    vertices[start + 21] = u2;
    vertices[start + 22] = v2;
    // RT
    vertices[start + 27] = wE[0] * x3 + wE[4] * y3 + wE[12];
    vertices[start + 28] = wE[1] * x3 + wE[5] * y3 + wE[13];
    vertices[start + 29] = wE[2] * x3 + wE[6] * y3 + wE[14];
    vertices[start + 30] = u3;
    vertices[start + 31] = v3;

    const indices = subChunk.indices;
    indices[0] = 0;
    indices[1] = 1;
    indices[2] = 2;
    indices[3] = 2;
    indices[4] = 1;
    indices[5] = 3;
    indices.length = 6;
  }

  private static _filledRadial90(
    renderer: ISpriteRenderer,
    matrix: Matrix,
    origin: SpriteFilledOrigin,
    amount: number,
    cw: boolean
  ): void {
    if (amount <= this._fillAmountEpsilon) {
      renderer._subChunk.indices.length = 0;
      return;
    }

    const sprite = renderer.sprite;
    const [lPosLB, lPosRB, lPosLT, lPosRT] = sprite._getPositions();
    const spriteUVs = sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];

    // Transform 4 corners to world space
    const [wLB, wRB, wLT, wRT] = this._worldPositions;
    const [uvLB, uvRB, uvLT, uvRT] = this._uvs;
    wLB.set(lPosLB.x, lPosLB.y, 0).transformToVec3(matrix), uvLB.set(left, bottom);
    wRB.set(lPosRB.x, lPosRB.y, 0).transformToVec3(matrix), uvRB.set(right, bottom);
    wLT.set(lPosLT.x, lPosLT.y, 0).transformToVec3(matrix), uvLT.set(left, top);
    wRT.set(lPosRT.x, lPosRT.y, 0).transformToVec3(matrix), uvRT.set(right, top);

    // Map vertices based on origin corner:
    // [center, CW-adjacent, CCW-adjacent, opposite]
    const { _inPositions: inPositions, _inUVs: inUVs, _outPositions: outPositions, _outUVs: outUVs } = this;
    switch (origin) {
      case SpriteFilledOrigin.BottomRight:
        (inPositions[0] = wRB), (inUVs[0] = uvRB);
        (inPositions[1] = wRT), (inUVs[1] = uvRT);
        (inPositions[2] = wLB), (inUVs[2] = uvLB);
        (inPositions[3] = wLT), (inUVs[3] = uvLT);
        break;
      case SpriteFilledOrigin.TopRight:
        (inPositions[0] = wRT), (inUVs[0] = uvRT);
        (inPositions[1] = wLT), (inUVs[1] = uvLT);
        (inPositions[2] = wRB), (inUVs[2] = uvRB);
        (inPositions[3] = wLB), (inUVs[3] = uvLB);
        break;
      case SpriteFilledOrigin.TopLeft:
        (inPositions[0] = wLT), (inUVs[0] = uvLT);
        (inPositions[1] = wLB), (inUVs[1] = uvLB);
        (inPositions[2] = wRT), (inUVs[2] = uvRT);
        (inPositions[3] = wRB), (inUVs[3] = uvRB);
        break;
      // BottomLeft is the default; any unsupported origin falls back to it instead of rendering stale data.
      case SpriteFilledOrigin.BottomLeft:
      default:
        (inPositions[0] = wLB), (inUVs[0] = uvLB);
        (inPositions[1] = wRB), (inUVs[1] = uvRB);
        (inPositions[2] = wLT), (inUVs[2] = uvLT);
        (inPositions[3] = wRT), (inUVs[3] = uvRT);
        break;
    }

    const startAngle = cw ? 90 - amount * 90 : 0;
    const endAngle = cw ? 90 : amount * 90;

    this._vertexOffset = this._indicesOffset = 0;
    this._radialCut(renderer._subChunk, inPositions, inUVs, startAngle, endAngle, outPositions, outUVs);
    renderer._subChunk.indices.length = this._indicesOffset;
  }

  private static _filledRadial180(
    renderer: ISpriteRenderer,
    matrix: Matrix,
    origin: SpriteFilledOrigin,
    amount: number,
    cw: boolean
  ): void {
    if (amount <= this._fillAmountEpsilon) {
      renderer._subChunk.indices.length = 0;
      return;
    }

    const sprite = renderer.sprite;
    const [lPosLB, lPosRB, lPosLT, lPosRT] = sprite._getPositions();
    const spriteUVs = sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];

    // Transform corners and compute edge midpoints
    const [wLB, wMB, wRB, wLM, , wRM, wLT, wMT, wRT] = this._worldPositions;
    const [uvLB, uvMB, uvRB, uvLM, , uvRM, uvLT, uvMT, uvRT] = this._uvs;
    wLB.set(lPosLB.x, lPosLB.y, 0).transformToVec3(matrix), uvLB.set(left, bottom);
    wRB.set(lPosRB.x, lPosRB.y, 0).transformToVec3(matrix), uvRB.set(right, bottom);
    wLT.set(lPosLT.x, lPosLT.y, 0).transformToVec3(matrix), uvLT.set(left, top);
    wRT.set(lPosRT.x, lPosRT.y, 0).transformToVec3(matrix), uvRT.set(right, top);
    Vector3.lerp(wLB, wRB, 0.5, wMB), Vector2.lerp(uvLB, uvRB, 0.5, uvMB);
    Vector3.lerp(wLB, wLT, 0.5, wLM), Vector2.lerp(uvLB, uvLT, 0.5, uvLM);
    Vector3.lerp(wLT, wRT, 0.5, wMT), Vector2.lerp(uvLT, uvRT, 0.5, uvMT);
    Vector3.lerp(wRB, wRT, 0.5, wRM), Vector2.lerp(uvRB, uvRT, 0.5, uvRM);

    const startAngle = cw ? 180 - amount * 180 : 0;
    const endAngle = cw ? 180 : amount * 180;

    this._vertexOffset = this._indicesOffset = 0;
    const { _inPositions: inPositions, _inUVs: inUVs, _outPositions: outPositions, _outUVs: outUVs } = this;
    const { _subChunk: subChunk } = renderer;

    // Center is at the origin edge midpoint; two quadrants cover the full sprite.
    // Quadrant A (0°-90°), Quadrant B (90°-180°)
    switch (origin) {
      case SpriteFilledOrigin.Top:
        // Center=MT, A: [MT,LT,MB,LB], B: [MT,MB,RT,RB]
        (inPositions[0] = wMT), (inUVs[0] = uvMT);
        (inPositions[1] = wLT), (inUVs[1] = uvLT);
        (inPositions[2] = wMB), (inUVs[2] = uvMB);
        (inPositions[3] = wLB), (inUVs[3] = uvLB);
        this._radialCut(subChunk, inPositions, inUVs, startAngle, endAngle, outPositions, outUVs);
        (inPositions[1] = wMB), (inUVs[1] = uvMB);
        (inPositions[2] = wRT), (inUVs[2] = uvRT);
        (inPositions[3] = wRB), (inUVs[3] = uvRB);
        this._radialCut(subChunk, inPositions, inUVs, startAngle - 90, endAngle - 90, outPositions, outUVs);
        break;
      case SpriteFilledOrigin.Left:
        // Center=LM, A: [LM,LB,RM,RB], B: [LM,RM,LT,RT]
        (inPositions[0] = wLM), (inUVs[0] = uvLM);
        (inPositions[1] = wLB), (inUVs[1] = uvLB);
        (inPositions[2] = wRM), (inUVs[2] = uvRM);
        (inPositions[3] = wRB), (inUVs[3] = uvRB);
        this._radialCut(subChunk, inPositions, inUVs, startAngle, endAngle, outPositions, outUVs);
        (inPositions[1] = wRM), (inUVs[1] = uvRM);
        (inPositions[2] = wLT), (inUVs[2] = uvLT);
        (inPositions[3] = wRT), (inUVs[3] = uvRT);
        this._radialCut(subChunk, inPositions, inUVs, startAngle - 90, endAngle - 90, outPositions, outUVs);
        break;
      case SpriteFilledOrigin.Right:
        // Center=RM, A: [RM,RT,LM,LT], B: [RM,LM,RB,LB]
        (inPositions[0] = wRM), (inUVs[0] = uvRM);
        (inPositions[1] = wRT), (inUVs[1] = uvRT);
        (inPositions[2] = wLM), (inUVs[2] = uvLM);
        (inPositions[3] = wLT), (inUVs[3] = uvLT);
        this._radialCut(subChunk, inPositions, inUVs, startAngle, endAngle, outPositions, outUVs);
        (inPositions[1] = wLM), (inUVs[1] = uvLM);
        (inPositions[2] = wRB), (inUVs[2] = uvRB);
        (inPositions[3] = wLB), (inUVs[3] = uvLB);
        this._radialCut(subChunk, inPositions, inUVs, startAngle - 90, endAngle - 90, outPositions, outUVs);
        break;
      // Bottom is the default; any unsupported origin falls back to it instead of rendering stale data.
      case SpriteFilledOrigin.Bottom:
      default:
        // Center=MB, A: [MB,RB,MT,RT], B: [MB,MT,LB,LT]
        (inPositions[0] = wMB), (inUVs[0] = uvMB);
        (inPositions[1] = wRB), (inUVs[1] = uvRB);
        (inPositions[2] = wMT), (inUVs[2] = uvMT);
        (inPositions[3] = wRT), (inUVs[3] = uvRT);
        this._radialCut(subChunk, inPositions, inUVs, startAngle, endAngle, outPositions, outUVs);
        (inPositions[1] = wMT), (inUVs[1] = uvMT);
        (inPositions[2] = wLB), (inUVs[2] = uvLB);
        (inPositions[3] = wLT), (inUVs[3] = uvLT);
        this._radialCut(subChunk, inPositions, inUVs, startAngle - 90, endAngle - 90, outPositions, outUVs);
        break;
    }

    subChunk.indices.length = this._indicesOffset;
  }

  private static _filledRadial360(
    renderer: ISpriteRenderer,
    matrix: Matrix,
    origin: SpriteFilledOrigin,
    amount: number,
    cw: boolean
  ): void {
    if (amount <= this._fillAmountEpsilon) {
      renderer._subChunk.indices.length = 0;
      return;
    }

    let startAngle = 0;
    switch (origin) {
      case SpriteFilledOrigin.Top:
        startAngle = cw ? 450 - amount * 360 : 90;
        break;
      case SpriteFilledOrigin.Left:
        startAngle = cw ? 540 - amount * 360 : 180;
        break;
      case SpriteFilledOrigin.Bottom:
        startAngle = cw ? 630 - amount * 360 : 270;
        break;
      // Right is handled here, and this branch also catches any unsupported origin as a fallback.
      case SpriteFilledOrigin.Right:
      default:
        startAngle = cw ? 360 - amount * 360 : 0;
        break;
    }
    const endAngle = startAngle + amount * 360;

    this._processRadialGrid(renderer, matrix, startAngle, endAngle);
  }

  /**
   * Prepare the 3x3 grid and process 4 quadrants for radial fill.
   */
  private static _processRadialGrid(
    renderer: ISpriteRenderer,
    matrix: Matrix,
    startAngle: number,
    endAngle: number
  ): void {
    const sprite = renderer.sprite;
    const [lPosLB, lPosRB, lPosLT, lPosRT] = sprite._getPositions();
    const spriteUVs = sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];

    // ---------------
    //   LT  - MT -  RT
    //   |     |     |
    //   LM  - C  -  RM
    //   |     |     |
    //   LB -  MB -  RB
    // ---------------
    const [wPosLB, wPosMB, wPosRB, wPosLM, wPosC, wPosRM, wPosLT, wPosMT, wPosRT] = this._worldPositions;
    const [uvLB, uvMB, uvRB, uvLM, uvC, uvRM, uvLT, uvMT, uvRT] = this._uvs;

    wPosLB.set(lPosLB.x, lPosLB.y, 0).transformToVec3(matrix), uvLB.set(left, bottom);
    wPosRB.set(lPosRB.x, lPosRB.y, 0).transformToVec3(matrix), uvRB.set(right, bottom);
    wPosLT.set(lPosLT.x, lPosLT.y, 0).transformToVec3(matrix), uvLT.set(left, top);
    wPosRT.set(lPosRT.x, lPosRT.y, 0).transformToVec3(matrix), uvRT.set(right, top);
    Vector3.lerp(wPosLB, wPosRB, 0.5, wPosMB), Vector2.lerp(uvLB, uvRB, 0.5, uvMB);
    Vector3.lerp(wPosLB, wPosLT, 0.5, wPosLM), Vector2.lerp(uvLB, uvLT, 0.5, uvLM);
    Vector3.lerp(wPosLT, wPosRT, 0.5, wPosMT), Vector2.lerp(uvLT, uvRT, 0.5, uvMT);
    Vector3.lerp(wPosRB, wPosRT, 0.5, wPosRM), Vector2.lerp(uvRB, uvRT, 0.5, uvRM);
    Vector3.lerp(wPosLB, wPosRT, 0.5, wPosC), Vector2.lerp(uvLB, uvRT, 0.5, uvC);

    this._vertexOffset = this._indicesOffset = 0;
    const { _inPositions: inPositions, _inUVs: inUVs, _outPositions: outPositions, _outUVs: outUVs } = this;
    const { _subChunk: subChunk } = renderer;
    let quadrantStart = 0;
    let quadrantEnd = 0;
    (inPositions[0] = wPosC), (inUVs[0] = uvC);

    {
      // First quadrant (0°-90°)
      if (startAngle >= 90) {
        quadrantStart = startAngle - 360;
        quadrantEnd = endAngle - 360;
      } else {
        quadrantStart = startAngle;
        quadrantEnd = endAngle;
      }
      (inPositions[1] = wPosRM), (inUVs[1] = uvRM);
      (inPositions[2] = wPosMT), (inUVs[2] = uvMT);
      (inPositions[3] = wPosRT), (inUVs[3] = uvRT);
      this._radialCut(subChunk, inPositions, inUVs, quadrantStart, quadrantEnd, outPositions, outUVs);
    }

    {
      // Second quadrant (90°-180°)
      if (startAngle >= 180) {
        quadrantStart = startAngle - 360 - 90;
        quadrantEnd = endAngle - 360 - 90;
      } else {
        quadrantStart = startAngle - 90;
        quadrantEnd = endAngle - 90;
      }
      (inPositions[1] = wPosMT), (inUVs[1] = uvMT);
      (inPositions[2] = wPosLM), (inUVs[2] = uvLM);
      (inPositions[3] = wPosLT), (inUVs[3] = uvLT);
      this._radialCut(subChunk, inPositions, inUVs, quadrantStart, quadrantEnd, outPositions, outUVs);
    }

    {
      // Third quadrant (180°-270°)
      if (startAngle >= 270) {
        quadrantStart = startAngle - 360 - 180;
        quadrantEnd = endAngle - 360 - 180;
      } else {
        quadrantStart = startAngle - 180;
        quadrantEnd = endAngle - 180;
      }
      (inPositions[1] = wPosLM), (inUVs[1] = uvLM);
      (inPositions[2] = wPosMB), (inUVs[2] = uvMB);
      (inPositions[3] = wPosLB), (inUVs[3] = uvLB);
      this._radialCut(subChunk, inPositions, inUVs, quadrantStart, quadrantEnd, outPositions, outUVs);
    }

    {
      // Fourth quadrant (270°-360°)
      if (startAngle >= 360) {
        quadrantStart = startAngle - 360 - 270;
        quadrantEnd = endAngle - 360 - 270;
      } else {
        quadrantStart = startAngle - 270;
        quadrantEnd = endAngle - 270;
      }
      (inPositions[1] = wPosMB), (inUVs[1] = uvMB);
      (inPositions[2] = wPosRM), (inUVs[2] = uvRM);
      (inPositions[3] = wPosRB), (inUVs[3] = uvRB);
      this._radialCut(subChunk, inPositions, inUVs, quadrantStart, quadrantEnd, outPositions, outUVs);
    }

    subChunk.indices.length = this._indicesOffset;
  }

  private static _radialCut(
    subChunk: SubPrimitiveChunk,
    positions: Vector3[],
    uvs: Vector2[],
    start: number,
    end: number,
    outPositions: Vector3[],
    outUVs: Vector2[]
  ): void {
    if (start >= 90 || end <= 0) return;
    outPositions[0].copyFrom(positions[0]);
    outUVs[0].copyFrom(uvs[0]);

    if (start <= 0) {
      outPositions[1].copyFrom(positions[1]);
      outUVs[1].copyFrom(uvs[1]);
    } else {
      const startTan = Math.tan((start * Math.PI) / 180);
      if (startTan < 1) {
        Vector3.lerp(positions[1], positions[3], startTan, outPositions[1]);
        Vector2.lerp(uvs[1], uvs[3], startTan, outUVs[1]);
      } else {
        Vector3.lerp(positions[2], positions[3], 1 / startTan, outPositions[1]);
        Vector2.lerp(uvs[2], uvs[3], 1 / startTan, outUVs[1]);
      }
    }

    if (end >= 90) {
      outPositions[2].copyFrom(positions[2]);
      outUVs[2].copyFrom(uvs[2]);
    } else {
      const endTan = Math.tan((end * Math.PI) / 180);
      if (endTan < 1) {
        Vector3.lerp(positions[1], positions[3], endTan, outPositions[2]);
        Vector2.lerp(uvs[1], uvs[3], endTan, outUVs[2]);
      } else {
        Vector3.lerp(positions[2], positions[3], 1 / endTan, outPositions[2]);
        Vector2.lerp(uvs[2], uvs[3], 1 / endTan, outUVs[2]);
      }
    }

    // 45° is the quadrant diagonal: a sector spanning it reaches the far corner and needs a quad;
    // otherwise the cut produces a triangle.
    if (start < 45 && end > 45) {
      outPositions[3].copyFrom(positions[3]);
      outUVs[3].copyFrom(uvs[3]);
      this._addQuad(subChunk, outPositions, outUVs);
    } else {
      this._addTriangle(subChunk, outPositions, outUVs);
    }
  }

  private static _addTriangle(subChunk: SubPrimitiveChunk, positions: Vector3[], uvs: Vector2[]): void {
    const vertices = subChunk.chunk.vertices;
    const indices = subChunk.indices;
    const vertexOffset = this._vertexOffset;
    const vertexCount = vertexOffset / 9;
    const start = subChunk.vertexArea.start + vertexOffset;
    for (let i = 0, o = start; i < 3; ++i, o += 9) {
      const position = positions[i];
      const uv = uvs[i];
      vertices[o] = position.x;
      vertices[o + 1] = position.y;
      vertices[o + 2] = position.z;
      vertices[o + 3] = uv.x;
      vertices[o + 4] = uv.y;
    }
    const indicesOffset = this._indicesOffset;
    indices[indicesOffset] = vertexCount;
    indices[indicesOffset + 1] = vertexCount + 1;
    indices[indicesOffset + 2] = vertexCount + 2;
    this._vertexOffset += 3 * 9;
    this._indicesOffset += 3;
  }

  private static _addQuad(subChunk: SubPrimitiveChunk, positions: Vector3[], uvs: Vector2[]): void {
    const vertices = subChunk.chunk.vertices;
    const indices = subChunk.indices;
    const vertexOffset = this._vertexOffset;
    const vertexCount = vertexOffset / 9;
    const start = subChunk.vertexArea.start + vertexOffset;
    for (let i = 0, o = start; i < 4; ++i, o += 9) {
      const position = positions[i];
      const uv = uvs[i];
      vertices[o] = position.x;
      vertices[o + 1] = position.y;
      vertices[o + 2] = position.z;
      vertices[o + 3] = uv.x;
      vertices[o + 4] = uv.y;
    }
    const indicesOffset = this._indicesOffset;
    indices[indicesOffset] = vertexCount;
    indices[indicesOffset + 1] = vertexCount + 1;
    indices[indicesOffset + 2] = vertexCount + 2;
    indices[indicesOffset + 3] = vertexCount + 2;
    indices[indicesOffset + 4] = vertexCount + 1;
    indices[indicesOffset + 5] = vertexCount + 3;
    this._vertexOffset += 4 * 9;
    this._indicesOffset += 6;
  }
}
