import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("checks material shader bindings and property value types", { timeout: 30_000 }, () => {
  const fileName = fileURLToPath(new URL("../../../tests/material-schema-types.ts", import.meta.url));
  const source = `
import { MaterialLoaderType, type IMaterialSchema } from "@galacean/engine-loader/types/schema/MaterialSchema";

type MaterialProperty = IMaterialSchema["shaderData"][string];
const properties: Record<MaterialLoaderType, MaterialProperty> = {
  Vector2: { type: MaterialLoaderType.Vector2, value: { x: 1, y: 2 } },
  Vector3: { type: MaterialLoaderType.Vector3, value: { x: 1, y: 2, z: 3 } },
  Vector4: { type: MaterialLoaderType.Vector4, value: { x: 1, y: 2, z: 3, w: 4 } },
  Color: { type: MaterialLoaderType.Color, value: { r: 1, g: 0, b: 0, a: 1 } },
  Float: { type: MaterialLoaderType.Float, value: 0.25 },
  Integer: { type: MaterialLoaderType.Integer, value: 2 },
  Boolean: { type: MaterialLoaderType.Boolean, value: true },
  Texture: { type: MaterialLoaderType.Texture, value: { url: "Textures/albedo", key: "texture" } }
};
const named: IMaterialSchema = { name: "named", shader: "Unlit", shaderData: properties, macros: [] };
const referenced: IMaterialSchema = { name: "referenced", shaderRef: { url: "Shaders/custom" }, shaderData: properties, macros: [] };
const both: IMaterialSchema = { ...referenced, shader: "custom" };

// @ts-expect-error A material requires a shader name or an explicit shader reference.
const missing: IMaterialSchema = { name: "missing", shaderData: {}, macros: [] };
// @ts-expect-error Color properties require RGBA data.
const invalidColor: MaterialProperty = { type: MaterialLoaderType.Color, value: 1 };
// @ts-expect-error Vector4 properties require all four components.
const invalidVector: MaterialProperty = { type: MaterialLoaderType.Vector4, value: { x: 1, y: 2, z: 3 } };
// @ts-expect-error Boolean properties use boolean values.
const invalidBoolean: MaterialProperty = { type: MaterialLoaderType.Boolean, value: 1 };
// @ts-expect-error Float properties use numeric values.
const invalidFloat: MaterialProperty = { type: MaterialLoaderType.Float, value: { url: "Textures/albedo" } };
// @ts-expect-error Texture properties require a resource reference.
const invalidTexture: MaterialProperty = { type: MaterialLoaderType.Texture, value: { r: 1, g: 0, b: 0, a: 1 } };

declare const property: MaterialProperty;
if (property.type === MaterialLoaderType.Vector4) {
  const component: number = property.value.w;
}
if (property.type === MaterialLoaderType.Boolean) {
  const enabled: boolean = property.value;
}
`;
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    target: ts.ScriptTarget.ES2020
  };
  const host = ts.createCompilerHost(options);
  const originalReadFile = host.readFile;
  const originalFileExists = host.fileExists;
  host.readFile = (path) => (resolve(path) === fileName ? source : originalReadFile(path));
  host.fileExists = (path) => resolve(path) === fileName || originalFileExists(path);
  const program = ts.createProgram([fileName], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(fileName)).map((diagnostic) => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  }));

  expect(diagnostics).toEqual([]);
});
