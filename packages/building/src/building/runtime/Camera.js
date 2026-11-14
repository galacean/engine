/** Orthographic ViewConstants. The standalone diagnostic's column-major bytes
 * remain explicit; Engine's reflected native row-major reader needs row-major.
 * @param {"column-major" | "row-major"} matrixOrder
 */
export function viewConstants(camera, matrixOrder = "column-major") {
  if (matrixOrder !== "column-major" && matrixOrder !== "row-major") throw Error("Invalid camera matrix order");
  const { eye, target, near = 0, far = 60, halfExtent } = camera;
  if (
    ![...eye, ...target, near, far, halfExtent].every(Number.isFinite) ||
    eye.length !== 3 ||
    target.length !== 3 ||
    near < 0 ||
    far <= near ||
    halfExtent <= 0
  )
    throw Error("Invalid camera");
  const norm = (v) => {
      const n = Math.hypot(...v);
      if (n < 1e-9) throw Error("Degenerate camera");
      return v.map((x) => x / n);
    },
    cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
    identity = () => Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => +(i === j))),
    mul = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));
  const back = norm(eye.map((x, i) => x - target[i])),
    right = norm(cross([0, 1, 0], back)),
    up = cross(back, right),
    wv = [...[right, up, back].map((axis) => [...axis, -dot(axis, eye)]), [0, 0, 0, 1]],
    vw = identity();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) vw[i][j] = wv[j][i];
    vw[i][3] = eye[i];
  }
  const p = identity(),
    ip = identity();
  p[0][0] = p[1][1] = 1 / halfExtent;
  p[2][2] = 1 / (far - near);
  p[2][3] = far / (far - near);
  ip[0][0] = ip[1][1] = halfExtent;
  ip[2][2] = far - near;
  ip[2][3] = -far;
  const matrices = [p, ip, p, ip, wv, vw, mul(p, wv), identity(), identity(), p, ip, wv, vw],
    data = new Float32Array(256);
  matrices.forEach((m, n) => {
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) data[n * 16 + (matrixOrder === "row-major" ? i * 4 + j : j * 4 + i)] = m[i][j];
  });
  return data;
}
