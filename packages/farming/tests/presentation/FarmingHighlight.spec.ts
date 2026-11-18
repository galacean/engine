import { expect, it } from "vitest";
import { Material, Shader, ShaderData, ShaderDataGroup, Vector4, type Engine, type MeshRenderer } from "@galacean/engine";
import { FarmItemHighlight } from "../../src/farming/presentation/FarmItemHighlight";

const engine = {
  resourceManager: { _addReferResource() {}, _deleteReferResource() {}, _deleteAsset() {}, _deleteContentRestorer() {} }
} as unknown as Engine;
// Binding/ownership tests use real Material and ShaderData; FarmingSSRSurface tests the actual shader passes.
Shader.find("Farming/ItemRimLight") ?? Shader.create("Farming/ItemRimLight", [...Shader.find("PBR").subShaders]);
function renderer(source: Material, name = "Native prop") {
  let materials: (Material | null)[] = [source];
  const component = {
    entity: { name },
    shaderData: new ShaderData(ShaderDataGroup.Renderer),
    getMaterials: () => materials,
    setMaterials: (value: (Material | null)[]) => {
      materials = value;
    }
  } as unknown as MeshRenderer;
  return { component, read: () => materials[0]! };
}

it("highlights a native PBR Material, shares across consumers, and ignores SeedSackLabel", () => {
  const source = new Material(engine, Shader.find("PBR"));
  const tiling = new Vector4(1, 1, 0.25, 0.5);
  source.shaderData.setVector4("material_TilingOffset", tiling);
  const first = renderer(source),
    second = renderer(source),
    label = renderer(source, "SeedSackLabel");
  const a = new FarmItemHighlight([first.component]),
    b = new FarmItemHighlight([second.component]),
    c = new FarmItemHighlight([label.component]);
  a.update(true);
  b.update(true);
  c.update(true);
  const shared = first.read();
  expect(shared.isGCIgnored).toBe(true);
  expect(shared).not.toBe(source);
  expect(shared.shader.name).toBe("Farming/ItemRimLight");
  expect(shared.shaderData.getVector4("material_TilingOffset")).toEqual(tiling);
  expect(source.shader.name).toBe("PBR");
  expect(second.read()).toBe(shared);
  expect(label.read()).toBe(source);
  a.dispose();
  expect(shared.destroyed).toBe(false);
  expect(first.read()).toBe(source);
  b.dispose();
  expect(shared.destroyed).toBe(true);
  expect(second.read()).toBe(source);
  c.dispose();
  expect(source.destroyed).toBe(false);
  source.destroy();
});
