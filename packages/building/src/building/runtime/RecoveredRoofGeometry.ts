/** Framework metric-chart geometry; deliberately double precision (not original
 * renderer arithmetic). These operations also own editing contact clipping. */
export const EPS = 1e-10;
export const add = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);
export const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
export const scale = (a: number[], s: number) => a.map((v) => v * s);
export const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const length = (a: number[]) => Math.sqrt(dot(a, a));
export const unit = (a: number[]) => {
  const n = length(a);
  if (n <= EPS) throw Error("Zero direction");
  return scale(a, 1 / n);
};
export const area = (p: number[][]) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
export const turn = (a: number[], b: number[], p: number[]) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
export function clean(p: number[][]) {
  const out: number[][] = [];
  for (const v of p) if (!out.length || length(sub(v, out.at(-1)!)) > EPS) out.push(v);
  if (out.length > 1 && length(sub(out[0], out.at(-1)!)) <= EPS) out.pop();
  if (out.length < 3 || Math.abs(area(out)) <= EPS) return [];
  if (area(out) < 0) out.reverse();
  return out;
}
export function halfplane(poly: number[][], a: number[], b: number[], inside = true) {
  const out: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      dp = turn(a, b, p),
      dq = turn(a, b, q),
      pin = inside ? dp >= -EPS : dp <= EPS,
      qin = inside ? dq >= -EPS : dq <= EPS;
    if (pin) out.push(p);
    if (pin !== qin) out.push(add(p, scale(sub(q, p), dp / (dp - dq))));
  }
  return clean(out);
}
export function intersect(p: number[][], clip: number[][]) {
  // Inputs are polygons (including clean()'s empty result), not constraint lists.
  if (!p.length || !clip.length) return [];
  for (let i = 0; i < clip.length; i++) p = halfplane(p, clip[i], clip[(i + 1) % clip.length]);
  return p;
}
