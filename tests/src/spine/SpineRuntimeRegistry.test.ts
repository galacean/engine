import { describe, expect, it } from "vitest";
import { registerSpineRuntime, getSpineRuntime } from "../../../packages/spine/src/runtime/SpineRuntimeRegistry";
import { Spine38Runtime } from "../../../packages/spine-core-3.8/src/Spine38Runtime";
import { Spine42Runtime } from "../../../packages/spine-core-4.2/src/Spine42Runtime";

const runtime38 = new Spine38Runtime();
const runtime42 = new Spine42Runtime();
registerSpineRuntime(runtime38);
registerSpineRuntime(runtime42);

describe("SpineRuntimeRegistry", () => {
  it("reports missing versions without depending on test order", () => {
    expect(() => getSpineRuntime("9.9.1")).to.throw(/No Spine runtime registered/);
  });

  it("resolves by export major.minor, independently of registration order", () => {
    expect(getSpineRuntime("3.8.99")).to.equal(runtime38);
    expect(getSpineRuntime("4.2.119")).to.equal(runtime42);
  });

  it("allows idempotent registration and rejects replacement", () => {
    registerSpineRuntime(runtime38);
    expect(() => registerSpineRuntime(new Spine38Runtime())).to.throw(/already registered/);
    expect(getSpineRuntime("3.8")).to.equal(runtime38);
  });
});
