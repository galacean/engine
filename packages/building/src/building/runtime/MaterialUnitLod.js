/** Persistent compact draw lists. Material-owned overlap band;
 * complementary pixel coverage makes the transition continuous in screen size.
 * Each material supplies its native screen metric and our host transition band. */
export class MaterialUnitLod {
  constructor(bounds, force, lower, upper, depthPadding = null) {
    this.lower = lower;
    this.upper = upper;
    this.depthPadding = depthPadding;
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
    this.changed = true;
    this.viewCache = new Float64Array(4).fill(NaN);
    this.projectionCache = NaN;
    this.modelScaleCache = NaN;
    this.orthographicCache = false;
    this.forcedCache = -2;
  }
  select(ids) {
    this.selection = Uint32Array.from(ids);
    this.changed = true;
  }
  update(view, projectionScale, orthographic, modelScale = 1, forced = -1) {
    let cameraChanged =
      projectionScale !== this.projectionCache ||
      modelScale !== this.modelScaleCache ||
      orthographic !== this.orthographicCache ||
      forced !== this.forcedCache;
    for (let i = 0; i < 4; i++) {
      const v = view[i * 4 + 2];
      cameraChanged ||= this.viewCache[i] !== v;
      this.viewCache[i] = v;
    }
    this.projectionCache = projectionScale;
    this.modelScaleCache = modelScale;
    this.orthographicCache = orthographic;
    this.forcedCache = forced;
    if (!cameraChanged && !this.changed) return false;
    let hi = 0,
      lo = 0,
      changed = this.changed;
    for (let k = 0; k < this.selection.length; k++) {
      const id = this.selection[k],
        p = id * 4;
      const depth = -(
        view[2] * this.bounds[p] +
        view[6] * this.bounds[p + 1] +
        view[10] * this.bounds[p + 2] +
        view[14]
      );
      const size =
        (this.bounds[p + 3] * modelScale * projectionScale) /
        (orthographic
          ? 1
          : Math.max(depth - (this.depthPadding?.[id] ?? 0) * modelScale, this.depthPadding ? 0.00001 : 0.0001));
      let weight = forced < 0 ? Math.max(0, Math.min(1, (size - this.lower) / (this.upper - this.lower))) : 1 - forced;
      if (this.force[id]) weight = 1;
      // Quantized ordered coverage: unchanged camera does not reupload instance lists.
      weight = Math.round(weight * 16) / 16;
      if (weight > 0) {
        changed ||= this.high[hi] !== id || this.highFade[hi] !== weight;
        this.high[hi] = id;
        this.highFade[hi++] = weight;
      }
      if (weight < 1) {
        changed ||= this.low[lo] !== id || this.lowFade[lo] !== weight;
        this.low[lo] = id;
        this.lowFade[lo++] = weight;
      }
    }
    changed ||= hi !== this.highCount || lo !== this.lowCount;
    this.highCount = hi;
    this.lowCount = lo;
    this.changed = false;
    return changed;
  }
}
