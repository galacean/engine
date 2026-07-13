import { describe, expect, it } from "vitest";
import { registerSpineRuntime, getSpineRuntime } from "../../../packages/spine/src/runtime/SpineRuntimeRegistry";
import type { ISpineRuntime } from "../../../packages/spine/src/runtime/ISpineRuntime";

describe("SpineRuntimeRegistry", () => {
  // Must run first: the module singleton starts null and there is no reset.
  it("throws when no runtime is registered", () => {
    expect(() => getSpineRuntime()).to.throw(/no spine runtime registered/);
  });

  it("returns the registered runtime", () => {
    const runtime = {} as ISpineRuntime;
    registerSpineRuntime(runtime);
    expect(getSpineRuntime()).to.equal(runtime);
  });

  it("last registration wins", () => {
    const a = {} as ISpineRuntime;
    const b = {} as ISpineRuntime;
    registerSpineRuntime(a);
    registerSpineRuntime(b);
    expect(getSpineRuntime()).to.equal(b);
  });
});
