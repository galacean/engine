import { NameAllocator } from "@galacean/engine-design";
import { describe, expect, it } from "vitest";

describe("Shader name allocation", () => {
  it("keeps declaration identities separate from preferred spellings", () => {
    const names = new NameAllocator();
    const first = {};
    const second = {};
    expect(names.allocate(first, "io_position")).toBe("io_position");
    expect(names.allocate(second, "io_position")).toBe("io_position_1");
    expect(names.allocate(first, "different_hint")).toBe("io_position");
  });

  it("reserves suffix families without searching every collision", () => {
    const names = new NameAllocator();
    for (const name of ["io_a", "io_a_1", "io_a_5000", "io_a_5000_1"]) names.reserve(name);
    expect(names.allocate({}, "io_a")).toBe("io_a_5001");
    expect(names.allocate({}, "io_a_5000")).toBe("io_a_5000_2");
    expect(names.allocate({}, "io_a")).toBe("io_a_5002");
  });

  it("appends collision suffixes to the complete original name", () => {
    const names = new NameAllocator();
    names.reserve("io_a_8");
    const first = {};
    expect(names.allocate(first, "io_a_8")).toBe("io_a_8_1");
    expect(names.allocate({}, "io_a_8")).toBe("io_a_8_2");
    expect(names.allocate(first, "io_a_8")).toBe("io_a_8_1");
    expect(names.allocate({}, "io_a_8_1")).toBe("io_a_8_1_1");
  });

  it("releases request identities and naming state on reset", () => {
    const names = new NameAllocator();
    const key = {};
    names.reserve("io_a");
    expect(names.allocate(key, "io_a")).toBe("io_a_1");
    names.reset();
    expect(names.allocate(key, "io_a")).toBe("io_a");
  });

  it("does not round large source suffixes into an existing name", () => {
    const names = new NameAllocator();
    for (const name of ["io_a", "io_a_9007199254740990", "io_a_9007199254740991"]) names.reserve(name);
    expect(names.allocate({}, "io_a")).toBe("io_a_9007199254740992");
    names.reserve("io_a_9999999999999999999999999");
    expect(names.allocate({}, "io_a")).toBe("io_a_10000000000000000000000000");
  });
});
