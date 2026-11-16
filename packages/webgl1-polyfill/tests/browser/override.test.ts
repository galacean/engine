import { bindOverrides, Mixin, Overwrite, type Bindings } from "../../src/override";
import {
  ParticleRenderer,
  SystemInfo,
  TextureFormat,
  WebGLEngine,
  type WebGLGraphicDevice
} from "../../../galacean/dist/module.js";
import { expect, it } from "vitest";
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
  for (const target of ["Camera", "Texture"] as const) {
    Overwrite(Replacement.prototype, "method", Object.getOwnPropertyDescriptor(Replacement.prototype, "method")!);
    Mixin(target)(Replacement);
  }
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
  const bindings = { WebGLGraphicDevice: Device, Camera: First, Texture: Late } as unknown as Bindings;

  expect(() => bindOverrides(bindings)).toThrow("Incompatible engine member: method");
  expect(Object.getOwnPropertyDescriptor(First.prototype, "method")).toEqual(descriptor);

  Object.defineProperty(latePrototype, "method", descriptor);
  expect(() => bindOverrides(bindings)).toThrow("blocked");
  expect(Object.getOwnPropertyDescriptor(First.prototype, "method")).toEqual(descriptor);
  expect(Object.getOwnPropertyDescriptor(latePrototype, "method")).toEqual(descriptor);

  rejectWrite = false;
  const registerDevice = bindOverrides(bindings);
  expect(First.prototype.method).not.toBe(descriptor.value);
  expect(latePrototype.method).not.toBe(descriptor.value);

  const fallback = new Device() as WebGLGraphicDevice;
  registerDevice(fallback);
  const installedMethod = First.prototype.method;
  bindOverrides(bindings);
  expect(First.prototype.method).toBe(installedMethod);
  expect(Object.assign(new First(), { _rhi: fallback }).method()).toBe("replacement");
  expect(new First().method()).toBe("original");
});
