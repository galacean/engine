import { EngineConfiguration, WebGLEngine } from "@galacean/engine";
import { afterEach, describe, expect, it } from "vitest";
import { registerSpineRuntime, getSpineRuntime } from "../../../packages/spine/src/runtime/SpineRuntimeRegistry";
import { Spine38Runtime } from "../../../packages/spine-core-3.8/src/Spine38Runtime";
import { Spine42Runtime } from "../../../packages/spine-core-4.2/src/Spine42Runtime";
import { SpineResource } from "../../../packages/spine/src/loader/SpineResource";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";
import "../../../packages/spine/src/loader/SpineLoader";

describe("SpineRuntimeRegistry", () => {
  const engines: WebGLEngine[] = [];
  async function create(configuration: EngineConfiguration = {}) {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), ...configuration });
    engines.push(engine);
    return engine;
  }
  function load(engine: WebGLEngine, version: string) {
    return engine.resourceManager.load<SpineResource>({
      url: new URL(`./fixtures/${version}.json`, import.meta.url).href,
      type: "Spine"
    });
  }
  afterEach(() => {
    engines.forEach((engine) => engine.destroy());
    engines.length = 0;
  });

  it("configures the loader through engine creation and isolates registrations between engines", async () => {
    const runtime38 = new Spine38Runtime();
    const runtime42 = new Spine42Runtime();
    const first = await create({ spine: runtime38 });
    const second = await create({ spine: runtime42 });
    expect((await load(first, "3.8"))._runtime).to.equal(runtime38);
    expect((await load(second, "4.2"))._runtime).to.equal(runtime42);
    await expect(load(first, "4.2")).rejects.toThrow(/No Spine runtime registered/);
    await expect(load(second, "3.8")).rejects.toThrow(/No Spine runtime registered/);
    const unconfigured = await create();
    await expect(load(unconfigured, "3.8")).rejects.toThrow(/No Spine runtime registered/);
  });

  it("keeps existing resources and playback when another version is registered", async () => {
    const runtime38 = new Spine38Runtime();
    const engine = await create({ spine: runtime38 });
    const resource38 = await load(engine, "3.8");
    const entity38 = resource38.instantiate();
    engine.sceneManager.activeScene.addRootEntity(entity38);
    const renderer38 = entity38.getComponent(SpineAnimationRenderer);
    const skeleton38 = renderer38.skeleton;
    const state38 = renderer38.state;
    const entry38 = state38.setAnimation(0, "idle", true);
    renderer38.update(0.1);
    const timeBefore = entry38.trackTime;

    const runtime42 = new Spine42Runtime();
    registerSpineRuntime(engine, runtime42);
    const resource42 = await load(engine, "4.2");
    const entity42 = resource42.instantiate();
    engine.sceneManager.activeScene.addRootEntity(entity42);
    const renderer42 = entity42.getComponent(SpineAnimationRenderer);
    renderer42.state.setAnimation(0, "idle", true);
    renderer42.update(0.1);
    renderer38.update(0.1);

    expect(resource42._runtime).to.equal(runtime42);
    expect(resource38._runtime).to.equal(runtime38);
    expect(await load(engine, "3.8")).to.equal(resource38);
    expect(renderer38.skeleton).to.equal(skeleton38);
    expect(renderer38.state).to.equal(state38);
    expect(state38.getCurrent(0)).to.equal(entry38);
    expect(entry38.trackTime).to.be.closeTo(timeBefore + 0.1, 1e-6);
  });

  it("resolves export major.minor regardless of registration order", async () => {
    for (const versions of [
      [new Spine38Runtime(), new Spine42Runtime()],
      [new Spine42Runtime(), new Spine38Runtime()]
    ]) {
      const engine = await create({ spine: versions[0] });
      registerSpineRuntime(engine, versions[1]);
      for (const runtime of versions) {
        expect(getSpineRuntime(engine, `${runtime.version}.99`)).to.equal(runtime);
      }
    }
  });

  it("allows idempotent registration and rejects replacement only within the same engine", async () => {
    const runtime38 = new Spine38Runtime();
    const engine = await create({ spine: runtime38 });
    registerSpineRuntime(engine, runtime38);
    expect(() => registerSpineRuntime(engine, new Spine38Runtime())).to.throw(/already registered/);
    expect(getSpineRuntime(engine, "3.8")).to.equal(runtime38);
    const otherRuntime = new Spine38Runtime();
    const other = await create({ spine: otherRuntime });
    expect(getSpineRuntime(other, "3.8")).to.equal(otherRuntime);
  });

  it("rejects malformed backend versions without changing existing registrations", async () => {
    const runtime42 = new Spine42Runtime();
    const engine = await create({ spine: runtime42 });
    for (const version of ["", "4", "4.2.119", "4.2-beta"]) {
      const runtime = Object.assign(new Spine42Runtime(), { version });
      expect(() => registerSpineRuntime(engine, runtime)).to.throw(/Invalid Spine runtime version/);
    }
    expect(getSpineRuntime(engine, "4.2.119")).to.equal(runtime42);
  });
});
