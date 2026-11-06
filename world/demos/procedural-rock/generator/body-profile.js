/**
 * Creates a shape-preserving, continuously differentiable radius profile through
 * the bottom, shoulder and top sections. Values never overshoot their endpoints.
 * @param {object} parameters Validated section scales and normalized shoulder height.
 * @returns {(height:number)=>number} Section scale at normalized height in [0,1].
 */
export function createBodyProfile(parameters) {
  const h = parameters.shoulderHeight;
  const values = [parameters.bottomScale, parameters.shoulderScale, parameters.topScale];
  const widths = [h, 1 - h],
    slopes = [(values[1] - values[0]) / h, (values[2] - values[1]) / (1 - h)];
  const endpoint = (a, b, da, db) => {
    const slope = ((2 * a + b) * da - a * db) / (a + b);
    return slope * da <= 0 ? 0 : Math.sign(da) !== Math.sign(db) && Math.abs(slope) > Math.abs(3 * da) ? 3 * da : slope;
  };
  const middle = slopes[0] * slopes[1] <= 0 ? 0 : 3 / ((2 - h) / slopes[0] + (1 + h) / slopes[1]);
  // A vertical basal tangent gives a narrow foot a recognizable support before
  // it opens into the shoulder, instead of starting as a straight inverted cone.
  const derivatives = [
    parameters.bottomScale === 0 ? endpoint(h, 1 - h, slopes[0], slopes[1]) : 0,
    middle,
    endpoint(1 - h, h, slopes[1], slopes[0])
  ];
  return (height) => {
    const value = Math.max(0, Math.min(1, height)),
      section = value <= h ? 0 : 1;
    const t = (value - (section ? h : 0)) / widths[section],
      t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * values[section] +
      (t3 - 2 * t2 + t) * widths[section] * derivatives[section] +
      (-2 * t3 + 3 * t2) * values[section + 1] +
      (t3 - t2) * widths[section] * derivatives[section + 1]
    );
  };
}
