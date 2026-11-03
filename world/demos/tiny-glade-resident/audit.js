// Imported only on an explicitly requested audit page. GPU-to-CPU synchronization
// here must not be included in normal render timings.
async function compare(renderer, file) {
  const gl = renderer.gl,
    reference = new Uint8Array(await (await fetch("/data/" + file)).arrayBuffer());
  renderer.render();
  const bytes = new Uint8Array(reference.length);
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.fb);
  gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  renderer.metrics.auditReadbacks++;
  let coverage = 0,
    max = 0,
    sum = 0,
    channels = 0,
    exact = 0,
    large = 0;
  const bins = [0, 0, 0, 0];
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const a = (y * 256 + x) * 4,
        b = ((255 - y) * 256 + x) * 4;
      let same = true;
      if (reference[a + 3] !== bytes[b + 3]) coverage++;
      if (reference[a + 3] && bytes[b + 3])
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(reference[a + k] - bytes[b + k]);
          max = Math.max(max, d);
          sum += d;
          channels++;
          same &&= d === 0;
          if (d > 4) large++;
          bins[d === 0 ? 0 : d <= 1 ? 1 : d <= 4 ? 2 : 3]++;
        }
      if (same && reference[a + 3] === bytes[b + 3]) exact++;
    }
  return {
    coverageMismatch: coverage,
    exactPixels: exact,
    maxChannelError: max,
    meanVisibleChannelError: sum / channels,
    largeChannelErrors: large,
    channelBins: bins,
    metrics: { ...renderer.metrics }
  };
}

export async function audit(renderer) {
  const total = await compare(renderer, "audit-reference.rgba"),
    rows = await (await fetch("/data/audit-draws.json")).json(),
    draws = [],
    base = renderer.draws.filter((d) => !d.variant || d.variant === "roof_tile"),
    visibility = renderer.draws.map((d) => d.visible);
  try {
    for (let i = 0; i < base.length; i++) {
      for (const d of renderer.draws) d.visible = d === base[i];
      const result = await compare(renderer, rows[i].file);
      delete result.metrics;
      draws.push({ id: base[i].id, ...result });
    }
  } finally {
    renderer.draws.forEach((d, i) => (d.visible = visibility[i]));
    renderer.render();
  }
  return { total, draws };
}
