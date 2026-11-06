/** Acceptance-only observation. No clocks, simulation steps, or render state change. */
export function engineProbe() {
  return {
    name: "acceptance-engine-probe",
    enforce: "post",
    transform(code, id) {
      if (!/\/packages\/rhi-webgl\/(?:src\/WebGLEngine\.ts|dist\/module\.js)$/.test(id.split("?")[0])) return;
      return (
        code +
        `\nif (typeof window !== 'undefined') {
  const create = WebGLEngine.create;
  WebGLEngine.create = async function(...args) {
    const engine = await create.apply(this, args);
    (window.__acceptanceEngines ||= []).push(engine);
    const update = engine.update;
    engine.update = function(...args) {
      const start = performance.now();
      try { return update.apply(this, args); }
      finally { if(window.__acceptance?.active) (window.__acceptance.engineCpu ||= []).push(performance.now()-start); }
    };
    return engine;
  };
}\n`
      );
    }
  };
}
