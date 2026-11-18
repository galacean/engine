import { expect, it } from "vitest";
import {
  Material,
  Shader,
  ShaderData,
  ShaderDataGroup,
  Vector4,
  type Engine,
  type MeshRenderer
} from "@galacean/engine";
import { FarmItemHighlight } from "@galacean/engine-farming/farming/presentation/FarmItemHighlight";

const engine = {
  resourceManager: {
    _addReferResource() {},
    _deleteReferResource() {},
    _deleteAsset() {},
    _deleteContentRestorer() {}
  }
} as unknown as Engine;
// Binding/ownership tests use real Material and ShaderData; GPU compilation is covered in the browser.
// The binding fixture borrows stock passes; FarmingSSRSurface tests the actual farm shader contract.
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

it("highlights a native PBR Material and restores its exact borrowed source", () => {
  const source = new Material(engine, Shader.find("PBR"));
  const tiling = new Vector4(1, 1, 0.25, 0.5);
  source.shaderData.setVector4("material_TilingOffset", tiling);
  const view = renderer(source),
    highlight = new FarmItemHighlight([view.component]);
  highlight.update(true);
  const variant = view.read();
  expect(variant.isGCIgnored).toBe(true);
  expect(variant).not.toBe(source);
  expect(variant.shader.name).toBe("Farming/ItemRimLight");
  expect(variant.shaderData.getVector4("material_TilingOffset")).toEqual(tiling);
  expect(source.shader.name).toBe("PBR");
  highlight.dispose();
  expect(view.read()).toBe(source);
  expect(variant.destroyed).toBe(true);
  expect(source.destroyed).toBe(false);
  source.destroy();
});

it("shares one variant and releases it only after its final consumer", () => {
  const source = new Material(engine, Shader.find("PBR"));
  const first = renderer(source),
    second = renderer(source);
  const a = new FarmItemHighlight([first.component]),
    b = new FarmItemHighlight([second.component]);
  a.update(true);
  b.update(true);
  const shared = first.read();
  expect(second.read()).toBe(shared);
  a.dispose();
  expect(shared.destroyed).toBe(false);
  expect(first.read()).toBe(source);
  b.dispose();
  expect(shared.destroyed).toBe(true);
  expect(second.read()).toBe(source);
  source.destroy();
});

it("keeps the label atlas material out of the shared highlight variants", () => {
  const source = new Material(engine, Shader.find("PBR"));
  const label = renderer(source, "SeedSackLabel"),
    highlight = new FarmItemHighlight([label.component]);
  highlight.update(true);
  expect(label.read()).toBe(source);
  highlight.dispose();
  expect(source.destroyed).toBe(false);
  source.destroy();
});
