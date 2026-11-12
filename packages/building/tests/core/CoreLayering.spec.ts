import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const coreDirectory = fileURLToPath(new URL("../../src/building/core/", import.meta.url));
const sources = readdirSync(coreDirectory)
  .filter((name) => name.endsWith(".ts"))
  .map((name) => ({ name, text: readFileSync(path.join(coreDirectory, name), "utf8") }));
// Part-type and style vocabulary belongs to the layers above the core.
const domainWords =
  /\b(walls?|roofs?|windows?|doors?|dormers?|foundations?|bricks?|tiles?|planks?|gothic|cottage|european|balcon(y|ies)|lanterns?|gables?|eaves?|ridges?|arch(es)?|storeys?|(?<!Math\.)floors?)\b/i;

describe("Building core layering", () => {
  it("contains no part-type or style vocabulary", () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const { name, text } of sources) expect(text.match(domainWords)?.[0], name).toBeUndefined();
  });

  it("contains no compatibility code for the online path", () => {
    for (const { name, text } of sources) expect(text.includes("COMPAT("), name).toBe(false);
  });

  it("imports nothing outside the core", () => {
    for (const { name, text } of sources)
      for (const [, specifier] of text.matchAll(/from\s+"([^"]+)"/g)) expect(specifier, name).toMatch(/^\.\/[\w-]+$/);
  });
});
