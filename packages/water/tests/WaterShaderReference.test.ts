import { expect, it } from "vitest";
import { AssetType, Material, Shader, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import unlitSource from "../../shader/src/Shaders/Unlit.shader?raw";
const data = (value: unknown) =>
  "data:text/plain;charset=utf-8," + encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value));
it("honors explicit Shader assets while preserving built-in and unresolved-ref fallback", async () => {
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler()
  });
  try {
    const name = "MaterialRef/" + crypto.randomUUID();
    const builtin = Shader.create(name, [...Shader.find("Unlit")!.subShaders])!;
    const source =
      '// Shader "IgnoredComment"' +
      "\n" +
      unlitSource.replace('Shader "Unlit"', `Shader "${name}"`).replace(/SubShader\s+"[^"]+"/, 'SubShader "Authored"');
    engine.resourceManager.registerVirtualResources([
      { virtualPath: "explicit.shader", path: data(source), type: AssetType.Shader }
    ]);
    const load = (ref?: string) =>
      engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: data({
          name: "ordinary",
          shader: name,
          shaderData: {},
          macros: [],
          ...(ref ? { shaderRef: { url: ref } } : {})
        })
      });
    const original = await load();
    expect(original.shader).toBe(builtin);
    const missing = await load("not-mapped.shader");
    expect(missing.shader).toBe(builtin);
    const explicit = await load("explicit.shader");
    expect(explicit.shader).not.toBe(builtin);
    expect(explicit.shader.subShaders[0].name).toBe("Authored");
    expect(Shader.find(name)).toBe(builtin);
    expect(await engine.resourceManager.getResourceByRef({ url: "explicit.shader" })).toBe(explicit.shader);
    expect(explicit.shader.compileVariant(engine, [])).toBe(true);
    engine.resourceManager.registerVirtualResources([
      { virtualPath: "wrong.shader", path: data({ value: true }), type: AssetType.JSON }
    ]);
    await expect(load("wrong.shader")).rejects.toThrow("did not resolve to a Shader");
    expect(builtin.destroyed).toBe(false);
  } finally {
    engine.destroy();
  }
});
