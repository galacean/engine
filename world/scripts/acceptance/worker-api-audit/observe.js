(() => {
  const s = (window.__checks = {
    record: false,
    deep: true,
    stage: "idle",
    stack: [],
    totals: {},
    spans: [],
    frames: [],
    long: [],
    last: 0
  });
  window.__checksPhase = "boot";
  window.__checksWorkers = [];
  window.__checksWorkerResults = [];
  const coarse = new Set([
    "PlanningFarmingRuntime.refreshWater",
    "FarmingService.refreshItemsGround",
    "validatePlanningProject",
    "RuntimeProjectSession.validateCandidate",
    "RuntimeProjectSession.commitPackage",
    "RuntimeProjectSession.compileScripts",
    "RuntimeEditor.prepare",
    "SeedEdit.prepare",
    "SeedEdit.commit",
    "SeedEdit.activate",
    "validateScriptApiReferences"
  ]);
  window.__checksStart = (name, async = false) => {
    if (!s.record || (!s.deep && !coarse.has(name) && !name.startsWith("Preparation."))) return;
    const oldStage = s.stage;
    if (name.startsWith("SeedEdit.")) s.stage = name.slice(9);
    const t = { name, async, start: performance.now(), phase: __checksPhase, stage: s.stage, oldStage, child: 0 };
    t.path = [...s.stack.map((x) => x.name), name].join(" > ");
    if (!async) s.stack.push(t);
    return t;
  };
  window.__checksEnd = (t) => {
    if (!t) return;
    const end = performance.now(),
      ms = end - t.start;
    if (!t.async) {
      const pop = s.stack.pop();
      if (pop !== t) throw Error("Instrumentation stack mismatch");
      if (s.stack.length) s.stack.at(-1).child += ms;
    }
    const key = [t.phase, t.stage, t.path].join("|");
    const a = (s.totals[key] ??= {
      phase: t.phase,
      stage: t.stage,
      path: t.path,
      name: t.name,
      count: 0,
      ms: 0,
      self: 0,
      max: 0
    });
    a.count++;
    a.ms += ms;
    a.self += ms - t.child;
    a.max = Math.max(a.max, ms);
    if (t.async || coarse.has(t.name))
      s.spans.push({ name: t.name, phase: t.phase, stage: t.stage, start: t.start, end, ms, async: t.async });
    if (t.name.startsWith("SeedEdit.")) s.stage = t.oldStage;
  };
  for (const [obj, key] of [
    [JSON, "parse"],
    [JSON, "stringify"],
    [window, "structuredClone"]
  ]) {
    const original = obj[key];
    obj[key] = function (...args) {
      if (!s.record || !s.deep || !s.stack.length) return original.apply(this, args);
      const t = __checksStart(key);
      try {
        return original.apply(this, args);
      } finally {
        __checksEnd(t);
      }
    };
  }
  const tick = (t) => {
    if (s.record && s.last) s.frames.push({ phase: __checksPhase, t, dt: t - s.last });
    s.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  new PerformanceObserver((list) => {
    if (s.record)
      for (const e of list.getEntries()) s.long.push({ phase: __checksPhase, start: e.startTime, ms: e.duration });
  }).observe({ type: "longtask" });
})();
(() => {
  window.__workerLifecycle = [];
  let serial = 0;
  const NativeWorker = window.Worker;
  window.Worker = new Proxy(NativeWorker, {
    construct(target, args, newTarget) {
      const id = ++serial,
        url = String(args[0]),
        phase = __checksPhase,
        start = performance.now();
      const w = Reflect.construct(target, args, newTarget);
      __workerLifecycle.push({ id, url, phase, kind: "construct", start, ms: performance.now() - start });
      let first = true;
      w.addEventListener("message", () => {
        if (first) {
          first = false;
          __workerLifecycle.push({
            id,
            url,
            phase: __checksPhase,
            kind: "first-response",
            start,
            ms: performance.now() - start
          });
        }
      });
      for (const key of ["postMessage", "terminate"]) {
        const original = w[key];
        w[key] = function (...payload) {
          const t = performance.now();
          try {
            return original.apply(this, payload);
          } finally {
            __workerLifecycle.push({ id, url, phase: __checksPhase, kind: key, start: t, ms: performance.now() - t });
          }
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(NativeWorker.prototype, "onmessage");
      if (descriptor?.set) {
        let handler = null;
        Object.defineProperty(w, "onmessage", {
          configurable: true,
          get: () => handler,
          set(fn) {
            handler = fn;
            descriptor.set.call(
              w,
              typeof fn !== "function"
                ? fn
                : function (event) {
                    const t = performance.now();
                    try {
                      return fn.call(this, event);
                    } finally {
                      __workerLifecycle.push({
                        id,
                        url,
                        phase: __checksPhase,
                        kind: "message-handler-sync",
                        start: t,
                        ms: performance.now() - t
                      });
                    }
                  }
            );
          }
        });
      }
      return w;
    }
  });
  const originalStart = __checksStart;
  window.__checksStart = (name, async) => {
    const t = originalStart(name, async);
    if (t && name === "RuntimeProjectSession.validateCandidate") t.stack = new Error().stack;
    return t;
  };
  const originalEnd = __checksEnd;
  window.__checksEnd = (t) => {
    originalEnd(t);
    if (t?.stack) __checks.spans.at(-1).stack = t.stack;
  };
  window.__glBlocking = [];
  for (const name of [
    "compileShader",
    "linkProgram",
    "getProgramParameter",
    "getShaderParameter",
    "readPixels",
    "finish"
  ]) {
    const original = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const t = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const ms = performance.now() - t;
        if (__checks.record && ms >= 1) __glBlocking.push({ name, start: t, ms, phase: __checksPhase });
      }
    };
  }
  window.__loaf = [];
  new PerformanceObserver((list) => {
    if (__checks.record)
      for (const e of list.getEntries())
        __loaf.push({
          phase: __checksPhase,
          start: e.startTime,
          ms: e.duration,
          blocking: e.blockingDuration,
          scripts: e.scripts.map((s) => ({
            ms: s.duration,
            layout: s.forcedStyleAndLayoutDuration,
            url: s.sourceURL,
            fn: s.sourceFunctionName,
            invoker: s.invoker
          }))
        });
  }).observe({ type: "long-animation-frame" });
})();
