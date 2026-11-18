export interface SeedWorldShaderVariantMacro {
  readonly n: string;
  readonly v?: string;
}

/** Exact FrameWork-compatible Shader/SubShader/Pass/macro identity. */
export interface SeedWorldShaderVariantEntry {
  readonly shader: string;
  readonly si: number;
  readonly pi: number;
  readonly macros: readonly SeedWorldShaderVariantMacro[];
}

export interface SeedWorldIndexedShaderVariantManifest {
  readonly shaders: readonly string[];
  readonly macros: readonly string[];
  readonly variants: readonly (readonly [
    shaderIndex: number,
    subShaderIndex: number,
    passIndex: number,
    macroIndexes: readonly number[]
  ])[];
}

/** Expands the compact project recording without loading the rendering runtime. */
export function expandSeedWorldShaderVariantManifest(
  manifest: SeedWorldIndexedShaderVariantManifest
): readonly SeedWorldShaderVariantEntry[] {
  return normalizeSeedWorldShaderVariants(
    manifest.variants.map(([shaderIndex, si, pi, macroIndexes], variantIndex) => {
      const shader = manifest.shaders[shaderIndex];
      if (shader === undefined) {
        throw new RangeError(
          `Seed World Shader manifest variant ${variantIndex} has invalid Shader index ${shaderIndex}`
        );
      }
      const macros = macroIndexes.map((macroIndex) => {
        const specification = manifest.macros[macroIndex];
        if (specification === undefined) {
          throw new RangeError(
            `Seed World Shader manifest variant ${variantIndex} has invalid macro index ${macroIndex}`
          );
        }
        const separatorIndex = specification.indexOf("=");
        return separatorIndex < 0
          ? { n: specification }
          : { n: specification.slice(0, separatorIndex), v: specification.slice(separatorIndex + 1) };
      });
      return { shader, si, pi, macros };
    })
  );
}

export function normalizeSeedWorldShaderVariants(
  entries: readonly SeedWorldShaderVariantEntry[]
): readonly SeedWorldShaderVariantEntry[] {
  const unique = new Map<string, SeedWorldShaderVariantEntry>();
  for (const entry of entries) {
    const macros = [...entry.macros]
      .map((macro) => (macro.v === undefined ? { n: macro.n } : { n: macro.n, v: macro.v }))
      .sort((left, right) => left.n.localeCompare(right.n) || (left.v ?? "").localeCompare(right.v ?? ""));
    const normalized = Object.freeze({
      shader: entry.shader,
      si: entry.si,
      pi: entry.pi,
      macros: Object.freeze(macros)
    });
    unique.set(seedWorldNormalizedShaderVariantKey(normalized), normalized);
  }
  return Object.freeze(
    [...unique.entries()].sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)).map(([, entry]) => entry)
  );
}

/** Compacts a recorder snapshot into the deterministic project manifest format. */
export function compactSeedWorldShaderVariantManifest(
  entries: readonly SeedWorldShaderVariantEntry[]
): SeedWorldIndexedShaderVariantManifest {
  const shaders: string[] = [];
  const macros: string[] = [];
  const shaderIndexes = new Map<string, number>();
  const macroIndexes = new Map<string, number>();
  const variants: SeedWorldIndexedShaderVariantManifest["variants"][number][] = [];

  for (const entry of normalizeSeedWorldShaderVariants(entries)) {
    let shaderIndex = shaderIndexes.get(entry.shader);
    if (shaderIndex === undefined) {
      shaderIndex = shaders.length;
      shaderIndexes.set(entry.shader, shaderIndex);
      shaders.push(entry.shader);
    }

    const variantMacroIndexes = entry.macros.map((macro) => {
      const specification = macro.v === undefined ? macro.n : `${macro.n}=${macro.v}`;
      let macroIndex = macroIndexes.get(specification);
      if (macroIndex === undefined) {
        macroIndex = macros.length;
        macroIndexes.set(specification, macroIndex);
        macros.push(specification);
      }
      return macroIndex;
    });
    variants.push(Object.freeze([shaderIndex, entry.si, entry.pi, Object.freeze(variantMacroIndexes)]));
  }

  return Object.freeze({
    shaders: Object.freeze(shaders),
    macros: Object.freeze(macros),
    variants: Object.freeze(variants)
  });
}

/** Returns recorded/collected variants that the startup manifest would not compile. */
export function findMissingSeedWorldShaderVariants(
  manifestEntries: readonly SeedWorldShaderVariantEntry[],
  recordedEntries: readonly SeedWorldShaderVariantEntry[]
): readonly SeedWorldShaderVariantEntry[] {
  const manifestKeys = new Set(
    normalizeSeedWorldShaderVariants(manifestEntries).map(seedWorldNormalizedShaderVariantKey)
  );
  return Object.freeze(
    normalizeSeedWorldShaderVariants(recordedEntries).filter(
      (entry) => !manifestKeys.has(seedWorldNormalizedShaderVariantKey(entry))
    )
  );
}

export function seedWorldShaderVariantKey(entry: SeedWorldShaderVariantEntry): string {
  const specifications = entry.macros.map((macro) => `${macro.n}=${macro.v ?? ""}`);
  for (let index = 1; index < specifications.length; index++) {
    if (specifications[index - 1]! > specifications[index]!) {
      specifications.sort();
      break;
    }
  }
  const macroKey = specifications.join(";");
  return `${entry.shader}/${entry.si}/${entry.pi}?${macroKey}`;
}

function seedWorldNormalizedShaderVariantKey(entry: SeedWorldShaderVariantEntry): string {
  const macroKey = entry.macros.map((macro) => `${macro.n}=${macro.v ?? ""}`).join(";");
  return `${entry.shader}/${entry.si}/${entry.pi}?${macroKey}`;
}
/** Compact vegetation supports per-instance entrance in addition to whole-renderer entrance. */
export function withSeedWorldInstanceEntranceVariants(
  entries: readonly SeedWorldShaderVariantEntry[]
): readonly SeedWorldShaderVariantEntry[] {
  return normalizeSeedWorldShaderVariants(
    entries.flatMap((entry) => {
      const has = (name: string) => entry.macros.some((macro) => macro.n === name);
      const supported =
        entry.shader === "Terrain/Vegetation" &&
        (has("RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE") || has("RENDERER_SEED_WORLD_DETAIL_COMPACT"));
      return supported && has("RENDERER_GENERATION_REVEAL") && !has("RENDERER_INSTANCE_GENERATION_REVEAL")
        ? [entry, { ...entry, macros: [...entry.macros, { n: "RENDERER_INSTANCE_GENERATION_REVEAL" }] }]
        : [entry];
    })
  );
}

/** Secondary IBL is reachable wherever the scene already supplies a specular environment. */
export function withSeedWorldIblBlendVariants(
  entries: readonly SeedWorldShaderVariantEntry[]
): readonly SeedWorldShaderVariantEntry[] {
  return normalizeSeedWorldShaderVariants(
    entries.flatMap((entry) =>
      entry.macros.some((macro) => macro.n === "SCENE_USE_SPECULAR_ENV") &&
      !entry.macros.some((macro) => macro.n === "SCENE_USE_SPECULAR_ENV_BLEND")
        ? [entry, { ...entry, macros: [...entry.macros, { n: "SCENE_USE_SPECULAR_ENV_BLEND" }] }]
        : [entry]
    )
  );
}
