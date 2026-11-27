(() => {
  window.__engineTimes = [];
  window.__lastEngineFrame = undefined;
  window.__gpuTimes = [];
  const e = __diag.engine,
    gl = (document.getElementById("world-canvas") || document.querySelector("canvas")).getContext("webgl2"),
    ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    pending = [];
  let n = 0;
  const update = e.update;
  e.update = function (...args) {
    const start = performance.now();
    try {
      return update.apply(this, args);
    } finally {
      const frame = { phase: __checksPhase, start, ms: performance.now() - start };
      if (__checks.record) __engineTimes.push(frame);
      window.__lastEngineFrame = frame;
    }
  };
  const render = e._render;
  e._render = function (...args) {
    const start = performance.now(),
      phase = __checksPhase;
    let q;
    if (
      ext &&
      __checks.record &&
      ++n % 8 === 0 &&
      pending.length < 8 &&
      !gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)
    ) {
      q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    }
    try {
      return render.apply(this, args);
    } finally {
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push({ q, start, phase });
      }
      if (ext && gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const item of pending) gl.deleteQuery(item.q);
        pending.length = 0;
      }
      while (pending.length && gl.getQueryParameter(pending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
        const item = pending.shift();
        __gpuTimes.push({
          phase: item.phase,
          start: item.start,
          ms: gl.getQueryParameter(item.q, gl.QUERY_RESULT) / 1e6
        });
        gl.deleteQuery(item.q);
      }
    }
  };
  return { gpuTimer: !!ext };
})();
