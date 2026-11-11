import { NameAllocator, isUnsafeGLSLIdentifier } from "@galacean/engine-shader-compiler/src/codeGen/NameAllocator";
import { describe, expect, it } from "vitest";

describe("Shader name allocation", () => {
  it("keeps declaration identities separate from preferred spellings", () => {
    const names = new NameAllocator();
    const first = {};
    const second = {};
    expect(names.allocate(first, "read_Data")).toBe("read_Data");
    expect(names.allocate(second, "read_Data")).toBe("read_Data_1");
    expect(names.allocate(first, "different_hint")).toBe("read_Data");
  });

  it("skips reserved source names and occupied suffixes", () => {
    const names = new NameAllocator();
    for (const name of ["a", "a_1"]) names.reserve(name);
    expect(names.allocate({}, "a")).toBe("a_2");
    expect(names.allocate({}, "a")).toBe("a_3");
  });

  it("appends collision suffixes to the complete original name", () => {
    const names = new NameAllocator();
    names.reserve("a_8");
    const first = {};
    expect(names.allocate(first, "a_8")).toBe("a_8_1");
    expect(names.allocate({}, "a_8")).toBe("a_8_2");
    expect(names.allocate(first, "a_8")).toBe("a_8_1");
    expect(names.allocate({}, "a_8_1")).toBe("a_8_1_1");
  });

  it("never produces double underscores", () => {
    const names = new NameAllocator();
    expect(names.allocate({}, "read__Data")).toBe("read_Data");
    names.reserve("output_");
    expect(names.allocate({}, "output_")).toBe("output_1");
  });

  it("releases request identities and naming state on reset", () => {
    const names = new NameAllocator();
    const key = {};
    names.reserve("a");
    expect(names.allocate(key, "a")).toBe("a_1");
    names.reset();
    expect(names.allocate(key, "a")).toBe("a");
  });

  it("detects identifiers that GLSL ES rejects", () => {
    for (const name of ["input", "output", "sample", "filter", "a__b"]) expect(isUnsafeGLSLIdentifier(name)).toBe(true);
    for (const name of ["position", "texture", "_a", "a_"]) expect(isUnsafeGLSLIdentifier(name)).toBe(false);
  });
});
