(async () => {
  const { Component, Loader } = await import("/packages/galacean/src/index.ts");
  const host = __sceneBenchHost;
  const native = host.tools.options.nativeEditor;
  const project = native.editor.project;
  const projection = native.projection;
  const scene = project.projectPackage.project.scene;
  const type = "IncrementalBenchmarkProbe";
  const counters = { awake: 0, enable: 0, disable: 0 };
  class Probe extends Component {
    value = 1;
    target = null;
    payload = null;
    get explode() {
      return false;
    }
    set explode(value) {
      if (value) throw Error("Expected incremental benchmark activation failure");
    }
    _onAwake() {
      counters.awake++;
    }
    _onEnable() {
      counters.enable++;
    }
    _onDisable() {
      counters.disable++;
    }
  }
  Loader.registerClass(type, Probe);
  let serial = 0;
  const fixture = {};
  const source = () => JSON.parse(project.projectPackage.contents[scene]);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const dataPath = "Benchmark/data.json",
    prefabPath = "Benchmark/Fixture.prefab";
  async function transaction(label, action, expectedFailure = false, captureFailure = false) {
    const id = `incremental-benchmark:${label}:${++serial}`;
    const signal = new AbortController().signal;
    const tx = await __sceneBenchConfiguration.definition.beginEdit(id, signal);
    const stages = {};
    const stage = async (name, fn) => {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        stages[name] = performance.now() - start;
      }
    };
    const call = async (name, input) => {
      const tool = tx.tools.find((tool) => tool.name === name);
      if (!tool) throw Error("Missing tool " + name);
      return tool.parseOutput(await tool.execute(tool.parseInput(input), { signal }));
    };
    let value, error;
    try {
      value = await stage("edit", () => action(call));
      await stage("prepare", () => tx.prepare(signal));
      await stage("commit", () => tx.commit());
      await stage("activate", () => tx.activate(signal));
    } catch (caught) {
      error = String(caught);
      if (!expectedFailure && !captureFailure) throw caught;
    } finally {
      await tx.discard();
      await tx.complete?.();
    }
    if (expectedFailure && !error?.includes("Expected incremental benchmark activation failure"))
      throw Error("Expected failure did not occur: " + error);
    return { id, value, stages, error };
  }
  const add = (label, entityId, props = {}) =>
    transaction(label, (call) => call("component.add", { scene, entityId, type, props }));
  const undo = (id, captureFailure = false) =>
    transaction("undo", (call) => call("history.undo", { transactionIds: [id] }), false, captureFailure);
  const redo = (id) => transaction("redo", (call) => call("history.redo", { transactionIds: [id] }));
  const fail = () =>
    transaction(
      "failure",
      (call) => call("component.add", { scene, entityId: fixture.leaf, type, props: { explode: true } }),
      true
    );
  const measure = async (action) => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const state = __sceneBenchState;
    state.spans = [];
    state.modes = [];
    state.plans = [];
    state.guards = [];
    state.assets = [];
    state.frames = [];
    state.long = [];
    const before = { ...counters };
    state.record = true;
    const start = performance.now();
    let result;
    try {
      result = await action();
      const end = performance.now();
      await delay(1000);
      return {
        ...result,
        start,
        end,
        wallMs: end - start,
        spans: state.spans,
        modes: state.modes,
        plans: state.plans,
        guards: state.guards,
        assets: state.assets,
        frames: state.frames,
        long: state.long.filter((task) => task.start >= start),
        lifecycle: Object.fromEntries(Object.keys(counters).map((key) => [key, counters[key] - before[key]]))
      };
    } finally {
      state.record = false;
    }
  };
  globalThis.__sceneBench = {
    inventory() {
      const authored = source();
      const roots = host.engine.sceneManager.activeScene.rootEntities;
      let runtimeEntities = 0,
        runtimeComponents = 0;
      const visit = (entity) => {
        runtimeEntities++;
        runtimeComponents += entity.getComponents(Component, []).length;
        entity.children.forEach(visit);
      };
      roots.forEach(visit);
      const gl = host.engine._hardwareRenderer?.gl;
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        authoredEntities: authored.entities.length,
        authoredComponents: authored.components.length,
        prefabRoots: authored.entities.filter((entity) => entity.instance).length,
        sourceCharacters: project.projectPackage.contents[scene].length,
        assets: project.projectPackage.project.files.length,
        runtimeEntities,
        runtimeComponents,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        canvas: { width: host.engine.canvas.width, height: host.engine.canvas.height },
        visibility: document.visibilityState
      };
    },
    inputSnapshot() {
      return {
        scene: source(),
        files: project.projectPackage.project.files.map(({ virtualPath, type }) => ({ virtualPath, type }))
      };
    },
    async setup() {
      await transaction("fixture", async (call) => {
        fixture.leaf = (await call("entity.create", { scene, name: "Benchmark leaf" })).id;
        fixture.parent = (await call("entity.create", { scene, name: "Benchmark parent" })).id;
        fixture.target = (await call("component.add", { scene, entityId: fixture.leaf, type, props: { value: 8 } })).id;
        fixture.consumer = (
          await call("component.add", {
            scene,
            entityId: fixture.parent,
            type,
            props: { target: { $component: fixture.target } }
          })
        ).id;
        for (let i = 0; i < 32; i++) {
          const child = await call("entity.create", {
            scene,
            name: `Benchmark child ${i}`,
            parentEntityId: fixture.parent
          });
          await call("component.add", { scene, entityId: child.id, type });
        }
        await call("asset.create", { path: dataPath, type: "JSON", content: '{"value":0}' });
        fixture.assetConsumer = (
          await call("component.add", { scene, entityId: fixture.parent, type, props: { payload: { $ref: dataPath } } })
        ).id;
        await call("asset.create", {
          path: prefabPath,
          type: "Prefab",
          content: JSON.stringify({
            asset: { version: "2.0" },
            root: "prefab-root",
            entities: [{ id: "prefab-root", name: "Benchmark prefab", components: [] }],
            components: []
          })
        });
      });
      await project.flush();
      await delay(2000);
    },
    async idle(ms) {
      return measure(async () => {
        await delay(ms);
        return { stages: {} };
      });
    },
    async select(name) {
      if (name === "prefab-add" && !fixture.prefab) {
        const result = await transaction("prefab-fixture", (call) =>
          call("entity.create", { scene, name: "Benchmark prefab instance", prefab: prefabPath })
        );
        fixture.prefab = result.value.id;
      }
      await project.flush();
      await delay(1000);
    },
    async sample(name, iteration) {
      let result,
        cleanup = async () => {};
      if (["add-leaf", "add-parent", "prefab-add", "binding-drift"].includes(name)) {
        const entityId = name === "add-parent" ? fixture.parent : fixture.leaf;
        if (name === "binding-drift") projection.entity(fixture.parent).addChild(projection.entity(fixture.leaf));
        const countProbes = (entity) =>
          entity.getComponents(Probe, []).length + entity.children.reduce((n, child) => n + countProbes(child), 0);
        const priorProbes = countProbes(projection.entity(entityId));
        result = await measure(() => add(name, entityId, { value: 3 }));
        result.expectedLifecycle = { awake: 1, enable: priorProbes + 1, disable: priorProbes };
        result.verified =
          projection.component(result.value.id)?.value === 3 &&
          (name !== "binding-drift" || projection.entity(fixture.leaf).parent === null);
        result.lifecycleVerified = Object.keys(result.expectedLifecycle).every(
          (key) => result.lifecycle[key] === result.expectedLifecycle[key]
        );
        if (name !== "binding-drift") result.verified &&= result.lifecycleVerified;
        cleanup = () => undo(result.id);
      } else if (name === "replace-reference") {
        const previous = projection.component(fixture.target);
        result = await measure(() =>
          transaction(name, (call) => {
            const document = source();
            delete document.components.find((component) => component.id === fixture.target).props.value;
            return call("asset.update", { path: scene, content: JSON.stringify(document) });
          })
        );
        result.verified =
          previous.destroyed &&
          projection.component(fixture.target) !== previous &&
          projection.component(fixture.consumer).target === projection.component(fixture.target);
        cleanup = () => undo(result.id);
      } else if (name === "asset-change") {
        result = await measure(() =>
          transaction(name, async (call) => {
            await call("asset.update", { path: dataPath, content: '{"value":1}' });
            return call("component.add", { scene, entityId: fixture.leaf, type, props: { value: 3 } });
          })
        );
        result.checks = {
          componentValue: projection.component(result.value.id)?.value,
          sourceValue: JSON.parse(project.projectPackage.contents[dataPath]).value,
          liveAssetValue: projection.component(fixture.assetConsumer).payload?.data?.value
        };
        result.verified = Object.values(result.checks).every((value, index) => value === (index === 0 ? 3 : 1));
        cleanup = () => undo(result.id);
      } else if (name === "undo" || name === "redo") {
        const added = await add("history-fixture", fixture.leaf, { value: 4 });
        if (name === "redo") await undo(added.id);
        result = await measure(() => (name === "undo" ? undo(added.id) : redo(added.id)));
        result.verified =
          name === "undo" ? !projection.component(added.value.id) : projection.component(added.value.id)?.value === 4;
        if (name === "redo") cleanup = () => undo(added.id);
      } else if (name === "activation-failure") {
        fixture.sky = {
          mesh: projection.scene.background.sky.mesh,
          material: projection.scene.background.sky.material
        };
        fixture.stableComponents = projection
          .queryComponents()
          .filter((c) => c.type !== type)
          .map((c) => [c.id, projection.component(c.id), c.type]);
        result = await measure(fail);
        result.verified = !!result.error && source().components.some((component) => component.id === result.value.id);
        fixture.failed = result;
        fixture.attemptedComponents = new Set(projection.pendingComponents ?? []);
        result.attemptedComponents = fixture.stableComponents
          .filter(([id]) => fixture.attemptedComponents.has(id))
          .map(([id, , type]) => ({ id, type }));
      } else if (name === "recovery") {
        const failed = fixture.failed ?? (await fail());
        result = await measure(() => undo(failed.id, true));
        result.verified =
          !result.error &&
          !projection.component(failed.value.id) &&
          projection.queryComponents({ id: fixture.target }).length === 1;
        result.recoveryChecks = {
          skyMesh: projection.scene.background.sky.mesh === fixture.sky?.mesh,
          skyMaterial: projection.scene.background.sky.material === fixture.sky?.material,
          untouchedComponents: fixture.stableComponents
            ?.filter(([id]) => !fixture.attemptedComponents?.has(id))
            .every(([id, component]) => projection.component(id) === component && !component.destroyed),
          restoredComponents: fixture.stableComponents?.every(([id]) => {
            const component = projection.component(id);
            return component && !component.destroyed;
          })
        };
        result.changedStableComponents = fixture.stableComponents
          ?.filter(([id, component]) => projection.component(id) !== component || component.destroyed)
          .map(([id, component, type]) => ({
            id,
            type,
            destroyed: component.destroyed,
            missing: !projection.component(id)
          }));
        result.verified &&= Object.values(result.recoveryChecks).every(Boolean);
        result.authoringRecovered = !source().components.some((component) => component.id === failed.value.id);
      } else throw Error("Unknown benchmark case: " + name);
      await cleanup();
      await project.flush();
      await delay(250);
      return {
        ...result,
        case: name,
        iteration,
        source: {
          entities: source().entities.length,
          components: source().components.length,
          prefabRoots: source().entities.filter((e) => e.instance).length
        }
      };
    }
  };
})();
