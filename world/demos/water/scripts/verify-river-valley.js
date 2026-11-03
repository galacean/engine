/** Run in the Codex in-app browser against a production build after window.riverDemo is ready.
 * The local evidence server accepts POST /_evidence/<name>.{json,png}; no external uploads.
 */
async function verifyRiverValley() {
  const api = window.riverDemo;
  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const frames = async (count = 3) => {
    for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
  };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const save = async (name, body) => {
    const response = await fetch(`/_evidence/${name}`, { method: "POST", body });
    assert(response.ok, `Could not save ${name}`);
  };
  const capture = async (name) => {
    await frames();
    const blob = await new Promise((resolve) =>
      requestAnimationFrame(() => {
        document.querySelector("canvas").toBlob(resolve, "image/png");
      })
    );
    assert(blob, `Empty capture: ${name}`);
    await save(`${name}.png`, blob);
  };
  const test = async (name, run) => {
    try {
      results.push({ name, passed: true, evidence: await run() });
    } catch (error) {
      results.push({ name, passed: false, error: String(error) });
    }
  };
  await api.updateScene({ scenario: "valley" });
  api.setSurfaceTime(0);
  const original = api.exportLook();
  await test("GPU realtime SH lights scattering with the sun and CPU ambient set to zero", async () => {
    const sun = api.snapshot.sunColor;
    const readPixels = async () => {
      await frames();
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          const source = document.querySelector("canvas");
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const context = copy.getContext("2d");
          context.drawImage(source, 0, 0);
          resolve(context.getImageData(0, 0, copy.width, copy.height).data);
        })
      );
    };
    try {
      api.setCameraView("overview");
      api.setDebugView(15);
      api.setLighting([0, 0, 0], [0, 0, 0]);
      const lit = await readPixels();
      await capture("gpu-realtime-sh-scattering");
      await api.setOpticalParameters({ scattering: [0, 0, 0] });
      const zero = await readPixels();
      await capture("gpu-zero-scattering-control");
      let changedPixels = 0,
        maximumDelta = 0;
      for (let i = 0; i < lit.length; i += 4) {
        const delta = Math.max(lit[i] - zero[i], lit[i + 1] - zero[i + 1], lit[i + 2] - zero[i + 2]);
        if (delta > 2) changedPixels++;
        maximumDelta = Math.max(maximumDelta, delta);
      }
      assert(changedPixels > 100, "Water still reads the empty CPU SH fallback");
      return { changedPixels, maximumDelta };
    } finally {
      await api.importLook(original);
      api.setLighting(sun, [0.036967589, 0.042149454, 0.054553831]);
      api.setDebugView(0);
    }
  });
  await test("look edits, JSON round trip and invalid import", async () => {
    const before = api.snapshot;
    await Promise.all([
      api.setOpticalParameters({ roughness: 0.41 }),
      api.setOpticalParameters({ foamIntensity: 0.83 })
    ]);
    assert(api.snapshot.look.roughness === 0.41 && api.snapshot.look.foamIntensity === 0.83, "Incremental edits lost");
    const edited = api.exportLook();
    let rejected = false;
    try {
      await api.importLook('{"version":1,"preset":"river-high","look":{"phaseG":999}}');
    } catch {
      rejected = true;
    }
    assert(rejected && api.exportLook() === edited, "Invalid import replaced valid state");
    await api.importLook(original);
    assert(api.exportLook() === original, "Look JSON round trip differs");
    const after = api.snapshot;
    assert(
      before.sourceHash === after.sourceHash &&
        before.terrainContentHash === after.terrainContentHash &&
        before.compileCount === after.compileCount,
      "Look edit rebuilt physics or terrain"
    );
    return { sourceHash: after.sourceHash, terrainHash: after.terrainContentHash, compileCount: after.compileCount };
  });
  await test("independent Valley and River High looks", async () => {
    await api.setOpticalParameters({ reflection: "analytic", roughness: 0.43 });
    await api.updateScene({ scenario: "bend" });
    assert(
      api.snapshot.look.reflection === "ssr" && api.snapshot.look.roughness !== 0.43,
      "Valley edit leaked to High"
    );
    await api.updateScene({ scenario: "valley" });
    assert(
      api.snapshot.look.reflection === "analytic" && api.snapshot.look.roughness === 0.43,
      "Valley edit lost after switch"
    );
    await api.importLook(original);
    return api.snapshot.lookId;
  });
  await test("late requests and cancellation preserve the latest scene", async () => {
    const requests = [
      api.updateScene({ scenario: "pools" }),
      api.updateScene({ scenario: "bridge" }),
      api.updateScene({ scenario: "valley" })
    ];
    await Promise.allSettled(requests);
    assert(
      api.snapshot.parameters.scenario === "valley" && api.snapshot.phase === "就绪",
      "Old request overwrote the latest"
    );
    const before = api.snapshot.sourceHash;
    const pending = api.updateScene({ scenario: "bend" });
    api.cancelSceneUpdate();
    await pending.catch(() => {});
    assert(
      api.snapshot.parameters.scenario === "valley" && api.snapshot.sourceHash === before,
      "Cancellation changed published state"
    );
    await api.updateScene({ scenario: "valley" });
  });
  await test("four reference cameras and component captures", async () => {
    const conditions = [];
    api.setSurfaceTime(0);
    api.setDebugView(0);
    for (const view of ["overview", "upstream", "cascade", "downstream"]) {
      api.setCameraView(view);
      await capture(`galacean-${view}`);
      conditions.push({ view, camera: api.snapshot.camera, time: api.snapshot.surfaceTime });
    }
    api.setCameraView("overview");
    for (const [name, patch] of [
      ["no-foam", { foamEnabled: false }],
      ["no-ssr", { reflection: "environment" }],
      ["no-refraction", { refractionStrength: 0 }]
    ]) {
      await api.setOpticalParameters(patch);
      await capture(`galacean-${name}`);
      await api.importLook(original);
    }
    for (const [name, mode] of [
      ["transmittance", 14],
      ["scattering", 15],
      ["ssr-validity", 17],
      ["foam-sources", 18]
    ]) {
      api.setDebugView(mode);
      await capture(`galacean-${name}`);
    }
    api.setDebugView(0);
    for (const view of ["top", "low2", "low5", "low15"]) {
      api.setCameraView(view);
      await capture(`galacean-${view}`);
    }
    return conditions;
  });
  await test("environment fallbacks and five retained scenarios", async () => {
    api.setEnvironmentEnabled(false);
    await frames();
    assert(api.snapshot.resources.reflection.environmentAvailable === false, "Environment provider did not detach");
    api.setEnvironmentEnabled(true);
    await frames();
    assert(api.snapshot.resources.reflection.environmentAvailable === true, "Environment provider did not restore");
    const scenarios = [];
    for (const scenario of ["calibration", "bend", "pools", "bridge", "editing"]) {
      await api.updateScene({ scenario });
      await frames();
      assert(api.snapshot.phase === "就绪" && api.snapshot.bodyCount === 1, `${scenario} failed`);
      await capture(`regression-${scenario}`);
      scenarios.push({ scenario, sourceHash: api.snapshot.sourceHash, bodyCount: api.snapshot.bodyCount });
    }
    return scenarios;
  });
  await test("ten Valley exits and re-entries have bounded live resources", async () => {
    const counts = [];
    for (let i = 0; i < 10; i++) {
      await api.updateScene({ scenario: "bend" });
      await api.updateScene({ scenario: "valley" });
      await frames();
      assert(api.snapshot.landscape.assets.activeInstances === 1, "Leaked Valley scene instance");
      counts.push(api.snapshot.engineResources);
    }
    assert(
      counts.slice(2).every((value) => equal(value, counts[2])),
      "Live resource counts grow after warm-up"
    );
    return counts;
  });
  await test("water removal and recreation", async () => {
    await api.removeWaterBody();
    assert(api.snapshot.bodyCount === 0 && !api.sampleWaterAt(-28, -71).hit, "Removed river remains queryable");
    await api.updateScene({ scenario: "valley" });
    const sample = api.sampleWaterAt(-28, -71);
    assert(
      sample.hit && Math.abs(sample.waterDepth - sample.surfaceHeight + sample.bedHeight) < 1e-5,
      "Recreated bed/query mismatch"
    );
    return sample;
  });
  await api.importLook(original);
  api.setDebugView(0);
  api.setSurfaceTime(0);
  api.setCameraView("overview");
  await frames();
  const gl = document.querySelector("canvas").getContext("webgl2");
  const report = { results, glError: gl.getError(), final: api.snapshot };
  await save("browser-validation.json", JSON.stringify(report, null, 2));
  return report;
}
