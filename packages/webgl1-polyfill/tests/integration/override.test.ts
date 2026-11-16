import { installOverrides, Mixin, Overwrite } from "../../src/override";
import {
  ParticleRenderer,
  SystemInfo,
  TextureFormat,
  WebGLEngine,
  type WebGLGraphicDevice
} from "../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../helpers/createEngine";

it("routes format queries and instance setters according to the owning device", async () => {
  const { engine: legacy } = await createEngine();
  try {
    const native = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      for (const [engine, expected] of [
        [legacy, false],
        [native, true]
      ] as const) {
        expect(SystemInfo.supportsTextureFormat(engine, TextureFormat.R8G8)).toBe(expected);
        const { generator } = engine.sceneManager.activeScene!.createRootEntity().addComponent(ParticleRenderer);
        generator.noise.enabled = true;
        expect(generator.noise.enabled).toBe(expected);
        expect(Boolean(generator._feedbackSimulator)).toBe(expected);
      }
    } finally {
      native.destroy();
    }
  } finally {
    legacy.destroy();
  }
});

it("keeps original descriptors on validation and commit failure, then installs once on retry", () => {
  class First {
    method() {
      return "original";
    }
  }

  class Replacement {
    method() {
      return "replacement";
    }
  }

  class Device {}
  const descriptor = Object.getOwnPropertyDescriptor(First.prototype, "method")!;
  const latePrototype = Object.create(null);
  let rejectWrite = true;
  // A constructible target with a Proxy prototype lets the commit fail after a successful validation.
  const Late = function () {};
  Late.prototype = new Proxy(latePrototype, {
    defineProperty(object, key, next) {
      if (rejectWrite) throw new Error("blocked");
      return Reflect.defineProperty(object, key, next);
    }
  });
  Overwrite(Replacement.prototype, "method", Object.getOwnPropertyDescriptor(Replacement.prototype, "method")!);
  Mixin(First)(Replacement);
  Mixin(Late)(Replacement);

  expect(() => installOverrides()).toThrow("Incompatible engine member: method");
  expect(Object.getOwnPropertyDescriptor(First.prototype, "method")).toEqual(descriptor);

  Object.defineProperty(latePrototype, "method", descriptor);
  expect(() => installOverrides()).toThrow("blocked");
  expect(Object.getOwnPropertyDescriptor(First.prototype, "method")).toEqual(descriptor);
  expect(Object.getOwnPropertyDescriptor(latePrototype, "method")).toEqual(descriptor);

  rejectWrite = false;
  const registerDevice = installOverrides();
  expect(First.prototype.method).not.toBe(descriptor.value);
  expect(latePrototype.method).not.toBe(descriptor.value);

  const fallback = new Device() as WebGLGraphicDevice;
  registerDevice(fallback);
  const installedMethod = First.prototype.method;
  installOverrides();
  expect(First.prototype.method).toBe(installedMethod);
  const legacyOwner = vi.fn(() => fallback);
  const nativeOwner = vi.fn(() => ({ isWebGL2: true }));
  const legacy = Object.defineProperty(new First(), "_rhi", { get: legacyOwner });
  const native = Object.defineProperty(new First(), "_rhi", { get: nativeOwner });
  for (let index = 0; index < 3; index++) {
    expect(legacy.method()).toBe("replacement");
    expect(native.method()).toBe("original");
  }
  expect(legacyOwner).toHaveBeenCalledTimes(1);
  expect(nativeOwner).toHaveBeenCalledTimes(1);
  expect(new First().method()).toBe("original");
});
