import { GLCapabilityType } from "@galacean/engine-core";
import { GLCapability, GLExtensions, WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
import { describe, expect, it, vi } from "vitest";

describe.each([
  [GLCapabilityType.astc, GLCapabilityType.astc_webkit],
  [GLCapabilityType.etc, GLCapabilityType.etc_webkit],
  [GLCapabilityType.etc1, GLCapabilityType.etc1_webkit],
  [GLCapabilityType.pvrtc, GLCapabilityType.pvrtc_webkit],
  [GLCapabilityType.s3tc, GLCapabilityType.s3tc_webkit]
])("extension alias %s", (name, alias) => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true]
  ])("preserves capability semantics and caching with standard=%s alias=%s", (standardSupported, aliasSupported) => {
    const standard = standardSupported ? {} : null;
    const vendor = aliasSupported ? {} : null;
    const getExtension = vi.fn((key: string) => (key === name ? standard : key === alias ? vendor : null));
    const device = { gl: { getExtension } } as unknown as WebGLGraphicDevice;
    const extensions = new GLExtensions(device);
    device.requireExtension = extensions.requireExtension.bind(extensions);
    expect(device.requireExtension(name)).toBe(standard);
    expect(getExtension).toHaveBeenCalledExactlyOnceWith(name);
    const capability = new GLCapability(device);
    expect(capability.canIUse(name)).toBe(standardSupported || aliasSupported);
    expect(capability.canIUse(alias)).toBe(aliasSupported);
    for (let i = 0; i < 2; i++) {
      expect(device.requireExtension(name)).toBe(standard);
      expect(device.requireExtension(alias)).toBe(vendor);
    }
    expect(getExtension.mock.calls.filter(([key]) => key === name)).toHaveLength(1);
    expect(getExtension.mock.calls.filter(([key]) => key === alias)).toHaveLength(1);
  });
});
