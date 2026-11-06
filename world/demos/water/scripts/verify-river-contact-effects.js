/** Run in the Codex in-app browser against the current River production build. */
async function verifyRiverContactEffects() {
  const api = window.riverDemo;
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const frames = async (count = 4) => {
    for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
  };
  const picture = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => {
        const canvas = document.querySelector("canvas");
        const gl = canvas.getContext("webgl2");
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        assert(gl.getError() === gl.NO_ERROR, "WebGL error");
        resolve(pixels);
      })
    );
  const difference = (a, b) => {
    let changed = 0,
      max = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d > 2) changed++;
      max = Math.max(max, d);
    }
    return { changed, max };
  };
  const identity = () => {
    const s = api.snapshot;
    return [s.sourceHash, s.terrainContentHash, s.terrainRevision, s.compileCount].join("|");
  };
  const result = {};
  await api.updateScene({ scenario: "valley", flowSpeed: 1 });
  api.setSurfaceTime(2);
  api.setCameraView("cascade");
  await frames();
  const original = api.exportLook();
  const baseline = structuredClone(api.snapshot.look.contactEffects);
  const initialIdentity = identity();
  assert(api.snapshot.contactEffects.activeEmitterCount === 12, "12 active emitters");
  const off = Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, { ...v, enabled: false }]));
  try {
    await api.setOpticalParameters({ contactEffects: off });
    await frames();
    const empty = await picture();
    assert(api.snapshot.contactEffects.activeEmitterCount === 0, "disabled emitters");
    result.components = {};
    for (const kind of ["splash", "mist", "whitewater"]) {
      await api.setOpticalParameters({ contactEffects: { ...off, [kind]: baseline[kind] } });
      await frames();
      const visible = await picture();
      const diff = difference(empty, visible);
      assert(diff.changed > 10, `${kind} has no visible GPU contribution`);
      result.components[kind] = diff;
    }
    await api.importLook(original);
    await frames();
    const frozen = await picture();
    await frames(12);
    result.frozen = difference(frozen, await picture());
    assert(result.frozen.max <= 2, "fixed time is not repeatable");
    api.setSurfaceTime(2.7);
    await frames();
    result.animation = difference(frozen, await picture());
    assert(result.animation.changed > 10, "time has no effect");
    api.setSurfaceTime(2);
    await frames();
    result.replay = difference(frozen, await picture());
    assert(result.replay.max <= 2, "time rewind failed");
    const invalid = JSON.parse(original);
    invalid.look.contactEffects.mist.opacity = -1;
    let rejected = false;
    try {
      await api.importLook(JSON.stringify(invalid));
    } catch {
      rejected = true;
    }
    assert(rejected && api.exportLook() === original, "invalid import changed Look");
    assert(identity() === initialIdentity, "Look editing rebuilt physical water/terrain");
    result.lookIdentity = initialIdentity;
    await api.updateScene({ flowSpeed: 0 });
    await frames();
    assert(api.snapshot.contactEffects.activeEmitterCount === 0, "zero flow still emits");
    await api.updateScene({ flowSpeed: 1 });
    await frames();
    assert(api.snapshot.contactEffects.activeEmitterCount === 12, "flow recovery");
    result.flow = true;
    api.setWaterVisible(false);
    await frames();
    assert(api.snapshot.contactEffects.activeEmitterCount === 0, "hidden water still emits");
    api.setWaterVisible(true);
    await frames();
    assert(api.snapshot.contactEffects.activeEmitterCount === 12, "visibility recovery failed");
    await api.removeWaterBody();
    await frames();
    assert(api.snapshot.contactEffects.activeEmitterCount === 0, "removed water still emits");
    await api.updateScene({ scenario: "valley" });
    await frames();
    assert(api.snapshot.contactEffects.activeEmitterCount === 12, "water recreation failed");
    result.visibilityAndRecreation = true;
    const cycles = [];
    for (let i = 0; i < 11; i++) {
      await api.updateScene({ scenario: "bend" });
      await frames();
      assert(!api.snapshot.contactEffects, "effects leaked into another scene");
      await api.updateScene({ scenario: "valley" });
      api.setSurfaceTime(2);
      await frames();
      cycles.push(api.snapshot.engineResources);
    }
    result.resources = cycles;
    assert(
      cycles.slice(1).every((x) => JSON.stringify(x) === JSON.stringify(cycles[1])),
      "warm resources grow"
    );
    const pending = [api.updateScene({ scenario: "bend" }), api.updateScene({ scenario: "valley" })];
    await Promise.allSettled(pending);
    await frames();
    assert(
      api.snapshot.parameters.scenario === "valley" && api.snapshot.contactEffects.activeEmitterCount === 12,
      "late scene replaced current effects"
    );
    result.quickSwitch = true;
    result.passed = true;
  } finally {
    await api.importLook(original);
    api.setSurfaceTime(2);
    api.setCameraView("cascade");
  }
  return result;
}
