import { type BoundingBox, Color, type Matrix, type Vector4 } from "@galacean/engine-math";
import type { Engine } from "../../Engine";
import type { EngineObject } from "../../base/EngineObject";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import type { RenderElement } from "../../RenderPipeline/RenderElement";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import type { ShaderMacro } from "../../shader/ShaderMacro";
import type { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import type { RenderTarget, Texture2D, TextureFormat } from "../../texture";

/**
 * Shared zero-GC rendering math, GPU resource/macro utilities, dirty-rect algorithms,
 * and screen-space bounding-box projection helpers for SSR.
 * @internal
 */
export class SSRUtils {
  private static readonly _AABB_EDGES = new Uint8Array([
    0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7
  ]);
  private static readonly _clipCorners = new Float32Array(32);
  static readonly clearZero = new Color(0, 0, 0, 0);

  private static _scissorMinX: number = 0;
  private static _scissorMaxX: number = 0;
  private static _scissorMinY: number = 0;
  private static _scissorMaxY: number = 0;
  private static _scissorHasProjected: boolean = false;

  /**
   * Synchronously destroy an EngineObject if alive and return `null` for direct slot reassignment.
   */
  static destroyResource<T extends EngineObject>(resource: T | null): null {
    if (resource && !resource.destroyed) {
      resource._destroyImmediate();
    }
    return null;
  }

  /**
   * Toggle a shader macro on `collection` in place.
   */
  static setMacro(collection: ShaderMacroCollection, macro: ShaderMacro, enabled: boolean): void {
    if (enabled) {
      collection.enable(macro);
    } else {
      collection.disable(macro);
    }
  }

  /**
   * Check whether a persistent Texture2D is alive and matches the target dimensions and format.
   */
  static matchesTextureSpec(
    tex: Texture2D | null,
    width: number,
    height: number,
    format: TextureFormat
  ): tex is Texture2D {
    return !!tex && !tex.destroyed && tex.width === width && tex.height === height && tex.format === format;
  }

  /**
   * Check whether a RenderTarget wrapper is alive and bound to the expected color-0 and depth textures.
   */
  static matchesRenderTarget(
    rt: RenderTarget | null,
    colorTex0: Texture2D | null,
    depthTex: Texture2D | null = null
  ): rt is RenderTarget {
    return !!rt && !rt.destroyed && rt.getColorTexture(0) === colorTex0 && rt.depthTexture === depthTex;
  }

  /**
   * Compute clamped maximum mip level for a `width x height` pyramid.
   */
  static computeMaxMipLevel(width: number, height: number, maxCap: number): number {
    return Math.min(maxCap, Math.floor(Math.log2(Math.max(1, Math.min(width, height)))));
  }

  /**
   * Write `(1 / width, 1 / height, width, height)` shader texel-size vector into `out` in place.
   */
  static setTexelSize(out: Vector4, width: number, height: number): Vector4 {
    return out.set(1 / width, 1 / height, width, height);
  }

  /**
   * Extract the column-major view-space Z row `(m2, m6, m10, m14)` from `viewMatrix` into `out` in place.
   */
  static extractViewZRow(viewMatrix: Matrix, out: Vector4): Vector4 {
    const e = viewMatrix.elements;
    return out.set(e[2], e[6], e[10], e[14]);
  }

  /**
   * Write `[x0, y0, x1, y1]` pixel bounds into a pre-allocated dirty-rect `Int32Array`.
   */
  static setDirtyRect(rect: Int32Array, x0: number, y0: number, x1: number, y1: number): void {
    rect[0] = x0;
    rect[1] = y0;
    rect[2] = x1;
    rect[3] = y1;
  }

  /**
   * Clear the union of previous dirty rect(s) and the current padded scissor rect on `targetRT` (Color only),
   * updating `prevDirty` / `extraPrevDirty` in place so shared depth/stencil attachments remain untouched.
   */
  static clearDirtyUnion(
    engine: Engine,
    context: RenderContext,
    targetRT: RenderTarget,
    prevDirty: Int32Array,
    extraPrevDirty: Int32Array | null,
    sx0: number,
    sy0: number,
    sx1: number,
    sy1: number,
    pad: number,
    traceW: number,
    traceH: number
  ): boolean {
    const hasNew = sx1 > sx0 && sy1 > sy0;
    const nx0 = hasNew ? Math.max(0, sx0 - pad) : 0;
    const ny0 = hasNew ? Math.max(0, sy0 - pad) : 0;
    const nx1 = hasNew ? Math.min(traceW, sx1 + pad) : 0;
    const ny1 = hasNew ? Math.min(traceH, sy1 + pad) : 0;

    let ux0 = hasNew ? nx0 : traceW;
    let uy0 = hasNew ? ny0 : traceH;
    let ux1 = hasNew ? nx1 : 0;
    let uy1 = hasNew ? ny1 : 0;

    if (prevDirty[2] > prevDirty[0] && prevDirty[3] > prevDirty[1]) {
      if (prevDirty[0] < ux0) ux0 = prevDirty[0];
      if (prevDirty[1] < uy0) uy0 = prevDirty[1];
      if (prevDirty[2] > ux1) ux1 = prevDirty[2];
      if (prevDirty[3] > uy1) uy1 = prevDirty[3];
    }

    if (extraPrevDirty && extraPrevDirty[2] > extraPrevDirty[0] && extraPrevDirty[3] > extraPrevDirty[1]) {
      if (extraPrevDirty[0] < ux0) ux0 = extraPrevDirty[0];
      if (extraPrevDirty[1] < uy0) uy0 = extraPrevDirty[1];
      if (extraPrevDirty[2] > ux1) ux1 = extraPrevDirty[2];
      if (extraPrevDirty[3] > uy1) uy1 = extraPrevDirty[3];
    }

    if (ux0 < 0) ux0 = 0;
    if (uy0 < 0) uy0 = 0;
    if (ux1 > traceW) ux1 = traceW;
    if (uy1 > traceH) uy1 = traceH;

    const didClear = ux1 > ux0 && uy1 > uy0;
    if (didClear) {
      const rhi = engine._hardwareRenderer;
      context.setRenderTarget(targetRT, PipelineUtils.defaultViewport, 0);
      const isFull = ux0 === 0 && uy0 === 0 && ux1 === traceW && uy1 === traceH;
      if (!isFull) {
        rhi.scissor(ux0, uy0, ux1 - ux0, uy1 - uy0);
      }
      rhi.clearRenderTarget(engine, CameraClearFlags.Color, SSRUtils.clearZero);
      if (!isFull) {
        rhi.scissor(0, 0, traceW, traceH);
      }
    }

    if (hasNew) {
      SSRUtils.setDirtyRect(
        prevDirty,
        Math.max(0, sx0),
        Math.max(0, sy0),
        Math.min(traceW, sx1),
        Math.min(traceH, sy1)
      );
    } else {
      prevDirty.fill(0);
    }

    if (extraPrevDirty) {
      extraPrevDirty.fill(0);
    }

    return didClear;
  }

  /**
   * Project receiver AABBs into trace-resolution screen pixels and write `(x, y, width, height)` into `outScissor`.
   * Returns `true` if any receiver overlaps the viewport, or `false` if all receivers are offscreen.
   */
  static computeReceiverScissorRect(
    context: RenderContext,
    elements: RenderElement[],
    traceW: number,
    traceH: number,
    outScissor: Vector4
  ): boolean {
    SSRUtils._scissorMinX = Infinity;
    SSRUtils._scissorMaxX = -Infinity;
    SSRUtils._scissorMinY = Infinity;
    SSRUtils._scissorMaxY = -Infinity;
    SSRUtils._scissorHasProjected = false;

    const length = elements.length;
    if (length === 0) {
      outScissor.set(0, 0, 0, 0);
      return false;
    }

    const camPos = context.camera.entity.transform.worldPosition;
    const camX = camPos.x;
    const camY = camPos.y;
    const camZ = camPos.z;
    const nearPad = Math.max(0.25, context.camera.nearClipPlane * 2);
    const vp = context.viewProjectionMatrix.elements;

    for (let i = 0; i < length; i++) {
      const element = elements[i];
      const instancedRenderers = element.instancedRenderers;
      const instanceCount = instancedRenderers.length;
      if (instanceCount > 0) {
        for (let k = 0; k < instanceCount; k++) {
          if (SSRUtils._accumulateBoundsToNdc(instancedRenderers[k].bounds, vp, camX, camY, camZ, nearPad)) {
            outScissor.set(0, 0, traceW, traceH);
            return true;
          }
        }
      } else if (SSRUtils._accumulateBoundsToNdc(element.component.bounds, vp, camX, camY, camZ, nearPad)) {
        outScissor.set(0, 0, traceW, traceH);
        return true;
      }
    }

    const minNdcX = SSRUtils._scissorMinX;
    const maxNdcX = SSRUtils._scissorMaxX;
    const minNdcY = SSRUtils._scissorMinY;
    const maxNdcY = SSRUtils._scissorMaxY;
    if (!SSRUtils._scissorHasProjected || maxNdcX < -1 || minNdcX > 1 || maxNdcY < -1 || minNdcY > 1) {
      outScissor.set(0, 0, 0, 0);
      return false;
    }

    const x0 = Math.max(0, Math.floor((minNdcX * 0.5 + 0.5) * traceW) - 2);
    const y0 = Math.max(0, Math.floor((minNdcY * 0.5 + 0.5) * traceH) - 2);
    const x1 = Math.min(traceW, Math.ceil((maxNdcX * 0.5 + 0.5) * traceW) + 2);
    const y1 = Math.min(traceH, Math.ceil((maxNdcY * 0.5 + 0.5) * traceH) + 2);
    if (x1 <= x0 || y1 <= y0) {
      outScissor.set(0, 0, 0, 0);
      return false;
    }

    outScissor.set(x0, y0, x1 - x0, y1 - y0);
    return true;
  }

  private static _accumulateBoundsToNdc(
    bounds: BoundingBox,
    vp: Float32Array,
    camX: number,
    camY: number,
    camZ: number,
    nearPad: number
  ): boolean {
    const min = bounds.min;
    const max = bounds.max;
    const minX = min.x;
    const minY = min.y;
    const minZ = min.z;
    const maxX = max.x;
    const maxY = max.y;
    const maxZ = max.z;
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(minZ) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY) ||
      !Number.isFinite(maxZ) ||
      minX > maxX ||
      minY > maxY ||
      minZ > maxZ ||
      (minX === maxX && minY === maxY && minZ === maxZ)
    ) {
      return true;
    }

    if (
      camX >= minX - nearPad &&
      camX <= maxX + nearPad &&
      camY >= minY - nearPad &&
      camY <= maxY + nearPad &&
      camZ >= minZ - nearPad &&
      camZ <= maxZ + nearPad
    ) {
      return true;
    }

    const m0 = vp[0],
      m1 = vp[1],
      m2 = vp[2],
      m3 = vp[3];
    const m4 = vp[4],
      m5 = vp[5],
      m6 = vp[6],
      m7 = vp[7];
    const m8 = vp[8],
      m9 = vp[9],
      m10 = vp[10],
      m11 = vp[11];
    const m12 = vp[12],
      m13 = vp[13],
      m14 = vp[14],
      m15 = vp[15];

    const clip = SSRUtils._clipCorners;
    let insideCount = 0;

    for (let c = 0; c < 8; c++) {
      const x = (c & 1) !== 0 ? maxX : minX;
      const y = (c & 2) !== 0 ? maxY : minY;
      const z = (c & 4) !== 0 ? maxZ : minZ;

      const cx = m0 * x + m4 * y + m8 * z + m12;
      const cy = m1 * x + m5 * y + m9 * z + m13;
      const cz = m2 * x + m6 * y + m10 * z + m14;
      const cw = m3 * x + m7 * y + m11 * z + m15;

      const base = c << 2;
      clip[base] = cx;
      clip[base + 1] = cy;
      clip[base + 2] = cz;
      clip[base + 3] = cw;

      if (cz + cw >= 0) {
        insideCount++;
        if (cw <= 1e-6) {
          return true;
        }
        const invW = 1 / cw;
        const ndcX = cx * invW;
        const ndcY = cy * invW;
        if (ndcX < SSRUtils._scissorMinX) SSRUtils._scissorMinX = ndcX;
        if (ndcX > SSRUtils._scissorMaxX) SSRUtils._scissorMaxX = ndcX;
        if (ndcY < SSRUtils._scissorMinY) SSRUtils._scissorMinY = ndcY;
        if (ndcY > SSRUtils._scissorMaxY) SSRUtils._scissorMaxY = ndcY;
        SSRUtils._scissorHasProjected = true;
      }
    }

    if (insideCount === 0) {
      return false;
    }

    if (insideCount < 8) {
      const edges = SSRUtils._AABB_EDGES;
      for (let e = 0; e < 24; e += 2) {
        const aBase = edges[e] << 2;
        const bBase = edges[e + 1] << 2;
        const da = clip[aBase + 2] + clip[aBase + 3];
        const db = clip[bBase + 2] + clip[bBase + 3];
        if (da >= 0 === db >= 0) {
          continue;
        }
        const denom = da - db;
        if (Math.abs(denom) <= 1e-8) {
          continue;
        }
        const t = da / denom;
        const ix = clip[aBase] + (clip[bBase] - clip[aBase]) * t;
        const iy = clip[aBase + 1] + (clip[bBase + 1] - clip[aBase + 1]) * t;
        const iw = clip[aBase + 3] + (clip[bBase + 3] - clip[aBase + 3]) * t;
        if (iw <= 1e-6) {
          return true;
        }
        const invW = 1 / iw;
        const ndcX = ix * invW;
        const ndcY = iy * invW;
        if (ndcX < SSRUtils._scissorMinX) SSRUtils._scissorMinX = ndcX;
        if (ndcX > SSRUtils._scissorMaxX) SSRUtils._scissorMaxX = ndcX;
        if (ndcY < SSRUtils._scissorMinY) SSRUtils._scissorMinY = ndcY;
        if (ndcY > SSRUtils._scissorMaxY) SSRUtils._scissorMaxY = ndcY;
        SSRUtils._scissorHasProjected = true;
      }
    }

    return false;
  }
}
