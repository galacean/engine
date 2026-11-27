import { describe, expect, it } from "vitest";
import { ShaderMacro } from "@galacean/engine";
import { ShaderMacroCollection } from "../../../packages/core/src/shader/ShaderMacroCollection";

function getMacroAtWord(minWordIndex: number, label: string): ShaderMacro {
  let i = 0;
  while (true) {
    const candidate = ShaderMacro.getByName(`MODIFY_TEST_MACRO_${label}_${i++}`);
    if (candidate._maskIndex >= minWordIndex) {
      return candidate;
    }
  }
}

describe("World ShaderMacroCollection", () => {
  const lowMacro = ShaderMacro.getByName("MODIFY_TEST_MACRO_LOW");
  const midMacro = getMacroAtWord(lowMacro._maskIndex + 1, "MID");
  const highMacro = getMacroAtWord(lowMacro._maskIndex + 3, "HIGH");

  it("trims all trailing zero words on disable so isEqual matches canonical collections", () => {
    const toggled = new ShaderMacroCollection();
    const canonical = new ShaderMacroCollection();

    toggled.enable(lowMacro);
    canonical.enable(lowMacro);
    expect(toggled.isEqual(canonical)).toBe(true);

    // Cross multiple zero words to highMacro, then disable it.
    toggled.enable(highMacro);
    expect(toggled._length).toBe(highMacro._maskIndex + 1);
    expect(toggled.isEqual(canonical)).toBe(false);

    toggled.disable(highMacro);
    expect(toggled._length).toBe(canonical._length);
    expect(toggled.isEqual(canonical)).toBe(true);
    expect(canonical.isEqual(toggled)).toBe(true);

    // Disabling an interior word first and then the highest word trims down through interior zeros.
    toggled.enable(midMacro);
    toggled.enable(highMacro);
    toggled.disable(midMacro);
    toggled.disable(highMacro);
    expect(toggled._length).toBe(canonical._length);
    expect(toggled.isEqual(canonical)).toBe(true);

    // Disabling the last remaining macro trims _length to 0.
    toggled.disable(lowMacro);
    expect(toggled._length).toBe(0);
    expect(toggled.isEqual(new ShaderMacroCollection())).toBe(true);
  });

  it("trims trailing zero words on complementaryCollection and ignores stale words in intersectionCollection", () => {
    const a = new ShaderMacroCollection();
    const b = new ShaderMacroCollection();
    const canonical = new ShaderMacroCollection();

    a.enable(lowMacro);
    a.enable(highMacro);
    b.enable(highMacro);
    canonical.enable(lowMacro);

    a.complementaryCollection(b);
    expect(a._length).toBe(canonical._length);
    expect(a.isEqual(canonical)).toBe(true);

    // Leave stale non-zero bits in b's _mask beyond b._length via clear().
    const stale = new ShaderMacroCollection();
    stale.enable(highMacro);
    stale.clear();

    a.enable(highMacro);
    a.intersectionCollection(stale);
    expect(a._length).toBe(0);
    expect(a.isEqual(new ShaderMacroCollection())).toBe(true);

    // Partial intersection across different lengths must ignore trailing dirty bits and trim zeros.
    stale.enable(lowMacro);
    a.enable(lowMacro);
    a.enable(highMacro);
    a.intersectionCollection(stale);
    expect(a._length).toBe(canonical._length);
    expect(a.isEqual(canonical)).toBe(true);
  });
});
