/* Procedural 2D boundaries. No model, traced points, learned weights or stored silhouettes. */
function createRockEnvelope(p, samples = 1024) {
  const TAU = Math.PI * 2,
    N = samples,
    H = p.aspect,
    W = 1;
  function rand(i) {
    let a = (p.seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    a ^= a >>> 16;
    a = Math.imul(a, 0x21f0aaad);
    a ^= a >>> 15;
    a = Math.imul(a, 0x735a2d97);
    return ((a ^ (a >>> 15)) >>> 0) / 4294967296;
  }
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const top = W * (1 + p.taper),
    bottom = W * (1 - p.taper),
    half = (top + bottom) / 4,
    slope = (top - bottom) / (2 * H);
  const planes = [
    [1, -p.lean - slope + (rand(1) - 0.5) * 0.06, half],
    [-1, p.lean - slope + (rand(2) - 0.5) * 0.06, half],
    [(rand(3) - 0.5) * 0.12, 1, H / 2],
    [(rand(4) - 0.5) * 0.08, -1, H / 2]
  ];
  for (let j = 0; j < 4; j++) {
    const sx = j % 2 ? 1 : -1,
      sy = j < 2 ? 1 : -1,
      angle = 0.52 + rand(10 + j) * 0.55;
    const nx = sx * Math.cos(angle),
      ny = sy * Math.sin(angle),
      y = (sy * H) / 2,
      x = (sx * (sy > 0 ? top : bottom)) / 2 + p.lean * y;
    planes.push([nx, ny, Math.max(0.16, nx * x + ny * y - p.cut * (0.55 + 0.7 * rand(20 + j)))]);
  }
  function softMin(a, b, k) {
    if (k <= 1e-8) return Math.min(a, b);
    const h = clamp(0.5 + (0.5 * (b - a)) / k);
    return b + (a - b) * h - k * h * (1 - h);
  }
  const radii = [],
    base = [],
    arc = [0];
  for (let i = 0; i < N; i++) {
    const t = (TAU * i) / N,
      dx = Math.cos(t),
      dy = Math.sin(t);
    let r = 100;
    for (const [nx, ny, b] of planes) {
      const den = nx * dx + ny * dy;
      if (den > 1e-8) r = softMin(r, b / den, p.round);
    }
    r = Math.max(0.08, r);
    radii.push(r);
    base.push([r * dx, r * dy]);
    if (i) arc.push(arc[i - 1] + Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]));
  }
  const perimeter = arc[N - 1] + Math.hypot(base[0][0] - base[N - 1][0], base[0][1] - base[N - 1][1]);
  return { base, radii, arc, perimeter, seed: p.seed };
}

/* Same procedural envelope, with coupled shape constraints. No reference geometry. */
function measureRockBoundaryAngles(points, windowLength = 0.06) {
  const n = points.length,
    turn = [],
    position = [0];
  let minAngle = 360,
    maxAngle = 0,
    maxHardTurn = 0;
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n],
      b = points[i],
      c = points[(i + 1) % n],
      ux = b[0] - a[0],
      uy = b[1] - a[1],
      vx = c[0] - b[0],
      vy = c[1] - b[1];
    const theta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy),
      angle = 180 - (theta * 180) / Math.PI;
    minAngle = Math.min(minAngle, angle);
    maxAngle = Math.max(maxAngle, angle);
    maxHardTurn = Math.max(maxHardTurn, Math.abs(theta));
    turn.push(Math.abs(theta));
    position.push(position[i] + Math.hypot(vx, vy));
  }
  const L = position[n];
  let end = 0,
    sum = 0,
    maxWindowTurn = 0;
  for (let start = 0; start < n; start++) {
    while (end < start + n && position[end % n] + Math.floor(end / n) * L - position[start] <= windowLength) {
      sum += turn[end % n];
      end++;
    }
    maxWindowTurn = Math.max(maxWindowTurn, sum);
    sum -= turn[start];
  }
  const hard = (maxHardTurn * 180) / Math.PI,
    feature = (maxWindowTurn * 180) / Math.PI;
  return {
    minInterior: minAngle,
    maxInterior: maxAngle,
    maxHardTurn: hard,
    maxFeatureTurn: feature,
    windowLength,
    passed: hard <= 90 + 1e-7 && feature <= 90 + 1e-7
  };
}
function normalizeRockNotches(parameters) {
  const bound = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
  return {
    ...parameters,
    notches: Math.floor(bound(parameters.notches, 1, 8)),
    notchWidth: bound(parameters.notchWidth, 0.016, 0.16),
    notchDepth: bound(parameters.notchDepth, 0.005, 0.24)
  };
}
function makeConstrainedRockOutline(parameters = {}, samples = 1024) {
  const p = normalizeRockNotches({
    seed: 1,
    aspect: 1,
    taper: 0,
    cut: 0.2,
    coverage: 1,
    wave: 0.05,
    scale: 0.21,
    chip: 0.006,
    fineScale: 0.035,
    notches: 2,
    notchWidth: 0.05,
    notchDepth: 0.04,
    ...parameters,
    lean: 0,
    round: 0.06
  });
  const raw = createRockEnvelope;
  const angleWindow = parameters.angleWindow ?? 0.06;
  const measure = (points) => measureRockBoundaryAngles(points, angleWindow);
  const requestedCut = p.cut;
  let e = raw({ ...p }, samples),
    baseAngles = measure(e.base);
  // Taper may require more corner cutting; excessive cutting can remove a side.
  // Search both directions without changing the requested aspect or taper.
  if (!baseAngles.passed) {
    const candidates = Array.from({ length: 46 }, (_, i) => i * 0.01).sort(
      (a, b) => Math.abs(a - requestedCut) - Math.abs(b - requestedCut)
    );
    for (const cut of candidates) {
      p.cut = cut;
      e = raw({ ...p }, samples);
      baseAngles = measure(e.base);
      if (baseAngles.passed) break;
    }
  }
  if (!baseAngles.passed) throw new Error("Procedural envelope failed the boundary angle constraints");
  const N = e.base.length,
    L = e.perimeter;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
    wrap = (x) => x - Math.floor(x),
    delta = (a, b) => wrap(a - b + 0.5) - 0.5;
  const fade = (t) => {
    t = clamp(t);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  function rand(i) {
    let a = (p.seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    a ^= a >>> 16;
    a = Math.imul(a, 0x21f0aaad);
    a ^= a >>> 15;
    a = Math.imul(a, 0x735a2d97);
    return ((a ^ (a >>> 15)) >>> 0) / 4294967296;
  }
  const order = Array.from({ length: 6 }, (_, i) => i).sort((a, b) => rand(100 + a) - rand(100 + b)),
    rank = [];
  order.forEach((k, i) => (rank[k] = i));
  function activity(u) {
    if (p.coverage >= 1) return 1;
    if (p.coverage <= 0) return 0;
    const x = wrap(u) * 6,
      k = Math.floor(x),
      t = x - k,
      a = clamp(p.coverage * 6 - rank[k]),
      b = clamp(p.coverage * 6 - rank[(k + 1) % 6]);
    // Periodic C2 mask; average weight equals coverage, with no seams at interval joins.
    return a + (b - a) * fade(t);
  }
  function noise(u, period, key) {
    const frequency = Math.max(2, 1 / period),
      lo = Math.floor(frequency),
      blend = frequency - lo;
    function band(count) {
      const x = wrap(u) * count,
        k = Math.floor(x),
        f = x - k,
        a = rand(key + k) * 2 - 1,
        b = rand(key + ((k + 1) % count)) * 2 - 1;
      return a + (b - a) * fade(f);
    }
    return band(lo) * (1 - blend) + band(lo + 1) * blend;
  }
  // Shape-space derivative budgets, measured against actual envelope arc length.
  // These are style constraints on displacement, not a proof of a global curvature bound.
  function constrainField(values, slopeBudget, curvatureBudget) {
    let maxSlope = 0,
      maxSecond = 0;
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N,
        b = (i + 1) % N,
        ds0 = i ? e.arc[i] - e.arc[a] : L - e.arc[a],
        ds1 = b ? e.arc[b] - e.arc[i] : L - e.arc[i];
      const left = (values[i] - values[a]) / ds0,
        right = (values[b] - values[i]) / ds1;
      maxSlope = Math.max(maxSlope, Math.abs(left), Math.abs(right));
      maxSecond = Math.max(maxSecond, Math.abs((2 * (right - left)) / (ds0 + ds1)));
    }
    const factor = Math.min(1, slopeBudget / Math.max(maxSlope, 1e-12), curvatureBudget / Math.max(maxSecond, 1e-12));
    return {
      values: values.map((v) => v * factor),
      factor,
      maxSlope: maxSlope * factor,
      maxSecond: maxSecond * factor
    };
  }
  const broad = [],
    fine = [];
  for (let i = 0; i < N; i++) {
    const u = e.arc[i] / L,
      a = activity(u);
    broad.push(p.wave * a * noise(u, p.scale, 600));
    fine.push(p.chip * a * noise(u, p.fineScale, 800));
  }
  const broadField = constrainField(broad, 0.5, 18),
    fineField = constrainField(fine, 0.28, 25);
  const cuts = [];
  for (let j = 0; j < p.notches; j++) {
    let u = rand(300 + j * 13);
    for (let attempt = 0; attempt < 8; attempt++) {
      let i = 0;
      while (i < N - 1 && e.arc[i] / L < u) i++;
      if (Math.abs(e.base[i][1]) < p.aspect * 0.43) break;
      u = rand(300 + j * 13 + attempt + 1);
    }
    cuts.push({
      u,
      width: p.notchWidth * (0.65 + 0.7 * rand(410 + j)),
      requested: p.notchDepth * (0.55 + 0.7 * rand(430 + j)),
      flat: 0.12 + 0.1 * rand(450 + j),
      skew: 0.4 + 0.2 * rand(470 + j)
    });
  }
  for (const f of cuts) {
    const gap = Math.min(0.5, ...cuts.filter((o) => o !== f).map((o) => Math.abs(delta(o.u, f.u))));
    f.width = Math.min(f.width, gap * 0.78); // Leave intact material between neighboring cuts.
    const ramp = L * f.width * Math.min(f.skew, 1 - f.skew) * (1 - f.flat);
    // Quintic fade: max derivative 1.875; max second derivative 10/sqrt(3).
    f.depth = Math.min(f.requested, 0.08, ramp / 1.875, (80 * ramp * ramp) / (10 / Math.sqrt(3)));
  }
  const cutField = [],
    total = [];
  for (let i = 0; i < N; i++) {
    const u = e.arc[i] / L;
    let cut = 0;
    for (const f of cuts) {
      const d = delta(u, f.u),
        side = d < 0 ? f.skew : 1 - f.skew,
        x = Math.abs(d) / Math.max(1e-12, f.width * side);
      if (x < 1) cut += f.depth * (1 - fade((x - f.flat) / (1 - f.flat)));
    }
    cutField.push(cut);
    total.push(broadField.values[i] + fineField.values[i] - cut);
  }
  // Apply one global safety factor to preserve smooth transitions if extreme settings approach the center.
  let safety = 1;
  for (let i = 0; i < N; i++) if (total[i] < 0) safety = Math.min(safety, (e.radii[i] * 0.7) / -total[i]);
  const construct = (factor) =>
    e.base.map((v, i) => {
      const ratio = 1 + (factor * total[i]) / e.radii[i];
      return [v[0] * ratio, v[1] * ratio];
    });
  let contour = construct(safety),
    angles = measure(contour);
  if (!angles.passed) {
    // Keep a verified candidate; this bounded search need not find the largest safe amplitude.
    let low = 0,
      high = safety,
      best = e.base,
      bestAngles = baseAngles;
    for (let i = 0; i < 14; i++) {
      const mid = (low + high) / 2,
        trial = construct(mid),
        a = measure(trial);
      if (a.passed) {
        low = mid;
        best = trial;
        bestAngles = a;
      } else high = mid;
    }
    safety = low;
    contour = best;
    angles = bestAngles;
  }
  return {
    ...e,
    contour,
    cuts,
    stats: {
      broadFactor: broadField.factor,
      fineFactor: fineField.factor,
      broadPeak: Math.max(...broadField.values.map(Math.abs)) * safety,
      finePeak: Math.max(...fineField.values.map(Math.abs)) * safety,
      notchPeak: Math.max(0, ...cutField) * safety,
      actualNotchWidths: cuts.map((c) => c.width),
      safety,
      angles,
      requestedCut,
      effectiveCut: p.cut
    },
    parameters: p
  };
}

export { makeConstrainedRockOutline, normalizeRockNotches, measureRockBoundaryAngles };
