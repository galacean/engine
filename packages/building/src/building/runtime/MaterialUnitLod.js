/** Persistent compact draw lists. Material-owned overlap band;
 * complementary pixel coverage makes the transition continuous in screen size.
 * Each material supplies its native screen metric and our host transition band. */
export class MaterialUnitLod {
  constructor(bounds, force, lower, upper, depthPadding = null, cullRadius = null) {
    this.lower = lower;
    this.upper = upper;
    this.depthPadding = depthPadding;
    this.cullRadius = cullRadius;
    this.bounds = bounds;
    this.force = force;
    const count = force.length;
    this.selection = Uint32Array.from({ length: count }, (_, i) => i);
    this.high = new Uint32Array(count);
    this.low = new Uint32Array(count);
    this.highFade = new Float32Array(count);
    this.lowFade = new Float32Array(count);
    this.highCount = 0;
    this.lowCount = 0;
    this.hasHighFade = false;
    this.hasLowFade = false;
    this.highChanged = false;
    this.lowChanged = false;
    this.changed = true;
    this.viewCache = new Float64Array(4).fill(NaN);
    this.projectionCache = NaN;
    this.modelScaleCache = NaN;
    this.orthographicCache = false;
    this.forcedCache = -2;
    this.frustumCache = new Float64Array(24).fill(NaN);
    this.hadFrustumCache = false;
  }
  select(ids) {
    this.selection = Uint32Array.from(ids);
    this.changed = true;
  }
  selectRange(count) {
    if (this.selection.length === count) {
      let sequential = true;
      for (let i = 0; i < count; i++) {
        if (this.selection[i] !== i) {
          sequential = false;
          break;
        }
      }
      if (sequential) return;
    }
    const next = new Uint32Array(count);
    for (let i = 0; i < count; i++) next[i] = i;
    this.selection = next;
    this.changed = true;
  }
  /**
   * @param {ArrayLike<number>} view
   * @param {number} projectionScale
   * @param {boolean} orthographic
   * @param {number} [modelScale]
   * @param {number} [forced]
   * @param {Float32Array | null} [frustumPlanes]
   */
  update(view, projectionScale, orthographic, modelScale = 1, forced = -1, frustumPlanes = null) {
    if (forced >= 0 && forced === this.forcedCache && !this.changed) {
      this.highChanged = false;
      this.lowChanged = false;
      return false;
    }
    const useFrustum = forced < 0 && frustumPlanes !== null;
    let cameraChanged =
      projectionScale !== this.projectionCache ||
      modelScale !== this.modelScaleCache ||
      orthographic !== this.orthographicCache ||
      forced !== this.forcedCache ||
      useFrustum !== this.hadFrustumCache;
    for (let i = 0; i < 4; i++) {
      const v = view[i * 4 + 2];
      if (this.viewCache[i] !== v) {
        cameraChanged = true;
        this.viewCache[i] = v;
      }
    }
    if (useFrustum) {
      for (let i = 0; i < 24; i++) {
        const pv = frustumPlanes[i];
        if (this.frustumCache[i] !== pv) {
          cameraChanged = true;
          this.frustumCache[i] = pv;
        }
      }
    }
    this.projectionCache = projectionScale;
    this.modelScaleCache = modelScale;
    this.orthographicCache = orthographic;
    this.forcedCache = forced;
    this.hadFrustumCache = useFrustum;
    if (!cameraChanged && !this.changed) {
      this.highChanged = false;
      this.lowChanged = false;
      return false;
    }
    const bounds = this.bounds;
    const depthPadding = this.depthPadding;
    const cullRadius = this.cullRadius;
    const force = this.force;
    const selection = this.selection;
    const lower = this.lower;
    const invRange = 1 / (this.upper - lower);
    const scaleFactor = modelScale * projectionScale;
    const minDepth = depthPadding ? 0.00001 : 0.0001;
    const v2 = view[2],
      v6 = view[6],
      v10 = view[10],
      v14 = view[14];
    let p0x = 0, p0y = 0, p0z = 0, p0w = 0;
    let p1x = 0, p1y = 0, p1z = 0, p1w = 0;
    let p2x = 0, p2y = 0, p2z = 0, p2w = 0;
    let p3x = 0, p3y = 0, p3z = 0, p3w = 0;
    let p4x = 0, p4y = 0, p4z = 0, p4w = 0;
    let p5x = 0, p5y = 0, p5z = 0, p5w = 0;
    if (useFrustum) {
      p0x = frustumPlanes[0]; p0y = frustumPlanes[1]; p0z = frustumPlanes[2]; p0w = frustumPlanes[3];
      p1x = frustumPlanes[4]; p1y = frustumPlanes[5]; p1z = frustumPlanes[6]; p1w = frustumPlanes[7];
      p2x = frustumPlanes[8]; p2y = frustumPlanes[9]; p2z = frustumPlanes[10]; p2w = frustumPlanes[11];
      p3x = frustumPlanes[12]; p3y = frustumPlanes[13]; p3z = frustumPlanes[14]; p3w = frustumPlanes[15];
      p4x = frustumPlanes[16]; p4y = frustumPlanes[17]; p4z = frustumPlanes[18]; p4w = frustumPlanes[19];
      p5x = frustumPlanes[20]; p5y = frustumPlanes[21]; p5z = frustumPlanes[22]; p5w = frustumPlanes[23];
    }
    let hi = 0,
      lo = 0,
      highFading = false,
      lowFading = false,
      highChanged = this.changed,
      lowChanged = this.changed;
    for (let k = 0; k < selection.length; k++) {
      const id = selection[k],
        p = id * 4;
      const bx = bounds[p],
        by = bounds[p + 1],
        bz = bounds[p + 2];
      if (useFrustum) {
        const negR = -(cullRadius ? cullRadius[id] : bounds[p + 3] * 1.5 + 0.35);
        if (
          p0x * bx + p0y * by + p0z * bz + p0w < negR ||
          p1x * bx + p1y * by + p1z * bz + p1w < negR ||
          p2x * bx + p2y * by + p2z * bz + p2w < negR ||
          p3x * bx + p3y * by + p3z * bz + p3w < negR ||
          p4x * bx + p4y * by + p4z * bz + p4w < negR ||
          p5x * bx + p5y * by + p5z * bz + p5w < negR
        ) {
          continue;
        }
      }
      let weight;
      if (force[id]) {
        weight = 1;
      } else if (forced >= 0) {
        weight = Math.round(Math.max(0, Math.min(1, 1 - forced)) * 16) / 16;
      } else {
        const depth = -(v2 * bx + v6 * by + v10 * bz + v14);
        const size =
          (bounds[p + 3] * scaleFactor) /
          (orthographic ? 1 : Math.max(depth - (depthPadding ? depthPadding[id] * modelScale : 0), minDepth));
        const raw = (size - lower) * invRange;
        weight = raw <= 0 ? 0 : raw >= 1 ? 1 : Math.round(raw * 16) / 16;
      }
      if (weight > 0) {
        if (weight < 1) highFading = true;
        if (!highChanged && (this.high[hi] !== id || this.highFade[hi] !== weight)) highChanged = true;
        this.high[hi] = id;
        this.highFade[hi++] = weight;
      }
      if (weight < 1) {
        if (weight > 0) lowFading = true;
        if (!lowChanged && (this.low[lo] !== id || this.lowFade[lo] !== weight)) lowChanged = true;
        this.low[lo] = id;
        this.lowFade[lo++] = weight;
      }
    }
    if (hi !== this.highCount || highFading !== this.hasHighFade) highChanged = true;
    if (lo !== this.lowCount || lowFading !== this.hasLowFade) lowChanged = true;
    this.highCount = hi;
    this.lowCount = lo;
    this.hasHighFade = highFading;
    this.hasLowFade = lowFading;
    this.highChanged = highChanged;
    this.lowChanged = lowChanged;
    this.changed = false;
    return highChanged || lowChanged;
  }
}
