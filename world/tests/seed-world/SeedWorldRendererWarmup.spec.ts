import { describe, expect, it } from "vitest";
import { MeshRenderer, SkinnedMeshRenderer, ShaderMacro, ShaderMacroCollection } from "@galacean/engine";
import { collectSeedWorldRendererVariants } from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";

function renderer(active: boolean, skinned = false, materials?: object[]) {
  const instance = Object.create((skinned ? SkinnedMeshRenderer : MeshRenderer).prototype);
  const macros = new ShaderMacroCollection();
  macros.enable(ShaderMacro.getByName(active ? "ACTIVE_GEOMETRY" : "INACTIVE_TEMPLATE"));
  Object.defineProperties(instance, {
    entity: { value: { isActiveInHierarchy: active } },
    shaderData: { value: { _macroCollection: macros } },
    mesh: { value: { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } } },
    enabled: { value: false },
    castShadows: { value: true },
    _update: { value: () => {} },
    getMaterials: {
      value: () =>
        materials ?? [
          {
            destroyed: false,
            shader: {
              name: "WarmupContract",
              destroyed: false,
              subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
            },
            shaderData: { _macroCollection: new ShaderMacroCollection() }
          }
        ]
    }
  });
  return instance;
}
function collect(renderers: object[], includeInactiveEntities?: boolean) {
  return collectSeedWorldRendererVariants(
    { _macroCollection: new ShaderMacroCollection() } as any,
    { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
    { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
    [
      {
        getComponentsIncludeChildren(_type, output) {
          output.length = 0;
          output.push(...renderers);
        }
      }
    ] as any,
    { includeInactiveEntities }
  );
}
describe("renderer warmup scope", () => {
  it("keeps contributor passes when another material has the same shader and macros", () => {
    const shader = {
      name: "ContributionContract",
      destroyed: false,
      subShaders: [
        {
          passes: ["Forward", "ScreenSpaceReflectionContributionColor", "ScreenSpaceReflectionContributionDepth"].map(
            (stage) => ({
              getTagValue: () => stage,
              _renderState: { _getRenderQueueByShaderData: () => 2 },
              _renderStateDataMap: {}
            })
          )
        }
      ]
    };
    const materials = [false, true].map((contributeScreenSpaceReflection) => ({
      shader,
      contributeScreenSpaceReflection,
      destroyed: false,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    }));
    const variants = collect([renderer(true, false, materials)]);
    expect(new Set(variants.map((v) => v.pi))).toEqual(new Set([0, 1, 2]));
  });
  it("excludes inactive templates while retaining disabled LOD renderers on active entities", () => {
    const variants = collect([renderer(false), renderer(true)], false);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.macros.some((m) => m.n === "ACTIVE_GEOMETRY"))).toBe(true);
    expect(variants.some((v) => v.macros.some((m) => m.n === "INACTIVE_TEMPLATE"))).toBe(false);
  });
  it("keeps inactive owners available to candidate-world and photo preparation by default", () => {
    expect(collect([renderer(false)]).some((v) => v.macros.some((m) => m.n === "INACTIVE_TEMPLATE"))).toBe(true);
  });
  it("does not request GPU batching for a skinned renderer which cannot batch", () => {
    expect(collect([renderer(true, true)]).some((v) => v.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE"))).toBe(
      false
    );
    expect(collect([renderer(true)]).some((v) => v.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE"))).toBe(true);
  });
});
