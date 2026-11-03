import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";
import * as ts from "typescript";
import * as z from "zod";

import {
  SEED_WORLD_ASSET_TYPE_CATALOG
} from "@galacean/engine-world-planning/agent-adapter/contracts/SeedWorldAssetContracts";
import { SEED_WORLD_API_CONTRACTS } from "./SeedWorldContractRegistry.ts";
import {
  authoringResultSchema,
  assetDomainSchema,
  assetKindSchema,
  assetSourceSchema,
  assetRelationsSchema,
  emptyToolInputSchema,
  environmentUpdateOutputSchema,
  inspectedWorldAssetSchema,
  jsonObjectSchema,
  liveWorldStateSchema,
  queriedWorldAssetSchema,
  seasonSchema,
  worldBoundsSchema,
  worldPositionTupleSchema,
  worldAssetSchema,
  worldAssetSchemaByKind,
  worldRefSchema
} from "../tools/tool-contract.ts";
import { kernelSpatialAnchorSchema, kernelSpatialRelationSchema, spatialTargetSchema } from "../tools/spatial-tool-input.ts";
import { worldSelectorSchema } from "../tools/spatial-tools.ts";

type JsonSchema = Record<string, unknown>;
type GeneratedModule = Readonly<{
  id: string;
  source: string;
  imports: readonly string[];
  toolNames: readonly string[];
}>;
type GeneratedEntry = Readonly<{
  name: string;
  description: string;
  moduleId: string;
}>;

const registry = z.registry<{ id: string; description?: string }>();
const nameBySchema = new Map<z.ZodType, string>();
const publicSchemaNames = new Set<string>();

registerPublic("JsonObject", jsonObjectSchema);
registerPublic("Vec3", worldPositionTupleSchema);
registerPublic("Bounds", worldBoundsSchema);
registerPublic("AssetDomain", assetDomainSchema);
registerPublic("AssetKind", assetKindSchema);
registerPublic("AssetSource", assetSourceSchema);
registerPublic("Ref", worldRefSchema);
registerPublic("AssetRelations", assetRelationsSchema);
registerPublic("Asset", worldAssetSchema);
registerPublic("QueriedAsset", queriedWorldAssetSchema);

const concreteAssetTypeNames = Object.values(SEED_WORLD_ASSET_TYPE_CATALOG).map(({ typeSymbol }) => typeSymbol);
const concreteAssetTypeNameSet = new Set<string>(concreteAssetTypeNames);
const concreteAssetKindByTypeName = new Map<string, string>();
for (const [kind, { typeSymbol }] of Object.entries(SEED_WORLD_ASSET_TYPE_CATALOG)) {
  concreteAssetKindByTypeName.set(typeSymbol, kind);
  registerPublic(typeSymbol, worldAssetSchemaByKind[kind as keyof typeof worldAssetSchemaByKind]);
}
registerPublic("MutationResult", authoringResultSchema);

registerPublic("Season", seasonSchema);
registerPublic("LiveWorldState", liveWorldStateSchema);
registerPublic("EnvironmentUpdateResult", environmentUpdateOutputSchema);
registerPublic("Anchor", kernelSpatialAnchorSchema);
registerPublic("Relation", kernelSpatialRelationSchema);
registerPublic("Target", spatialTargetSchema);
registerPublic("Selector", worldSelectorSchema);
register("EmptyInput", emptyToolInputSchema);

const contractTypes = new Map<string, { input: string; outputs: readonly string[] }>();
for (const contract of SEED_WORLD_API_CONTRACTS) {
  const base = pascalCase(contract.name);
  const input = nameBySchema.get(contract.input) ?? register(`${base}Input`, contract.input);
  const outputs = contract.output === inspectedWorldAssetSchema
    ? []
    : [nameBySchema.get(contract.output) ?? register(`${base}Result`, contract.output)];
  contractTypes.set(contract.name, { input, outputs });
}
const registeredSchemaNames = [...publicSchemaNames];

const converted = z.toJSONSchema(registry, { io: "input", unrepresentable: "any" }) as {
  schemas: Record<string, JsonSchema>;
};
const schemas = converted.schemas;
const inputSchemaNames = schemaDependencyClosure(
  [...contractTypes.values()].map(({ input }) => input),
  schemas
);
// run-engine.mjs refreshes the disposable materialization before every command.
// Write its generated contracts to the authoritative Gallery so a later test
// sync cannot restore stale declarations over a successful generation.
const generatedDirectory = process.env.WORLD_GALLERY_SOURCE_ROOT
  ? resolve(process.env.WORLD_GALLERY_SOURCE_ROOT, "demos/terrain/seed-world-planner/agent-adapter/contracts/generated")
  : resolve(dirname(__filename), "generated");
const declarationDirectory = resolve(generatedDirectory, "api");
const checkMode = process.argv.includes("--check");
mkdirSync(generatedDirectory, { recursive: true });
if (!checkMode) {
  rmSync(declarationDirectory, { recursive: true, force: true });
}
mkdirSync(declarationDirectory, { recursive: true });

const moduleIdByTypeName = new Map<string, string>();
for (const name of ["JsonValue", "AgentTools", ...registeredSchemaNames]) {
  moduleIdByTypeName.set(name, `${concreteAssetTypeNameSet.has(name) ? "assets" : "common"}/${name}.d.ts`);
}

const typeModules: GeneratedModule[] = [
  createDeclarationModule("common/JsonValue.d.ts", renderJsonValueModule(), []),
  createDeclarationModule("common/AgentTools.d.ts", renderAgentToolsRoot(), []),
  ...registeredSchemaNames.map((name) => {
    const schemaDependencies = [
      ...schemaRefs(schemas[name]!),
      ...(containsInternalJsonRef(schemas[name]!) ? ["JsonValue"] : [])
    ].sort();
    const dependencies = name === "QueriedAsset"
      ? ["Asset"]
      : concreteAssetTypeNameSet.has(name)
        ? concreteAssetDeclarationDependencies(name)
        : schemaDependencies;
    return createDeclarationModule(
      moduleIdByTypeName.get(name)!,
      renderNamedSchemaModule(name, inputSchemaNames.has(name), dependencies),
      []
    );
  })
];

const apiModules: GeneratedModule[] = SEED_WORLD_API_CONTRACTS.map((contract) => {
  const types = contractTypes.get(contract.name)!;
  const dependencies = contract.output === inspectedWorldAssetSchema
    ? ["AgentTools", "AssetKind", "Ref"]
    : [...new Set([
    "AgentTools",
    ...publicDeclarationDependencies([
    ...(contract.inputMode === "none" ? [] : [types.input]),
    ...types.outputs
    ])
  ])];
  return createDeclarationModule(
    `tools/${contract.name}.d.ts`,
    renderApiFunctionModule(contract, dependencies),
    [contract.name]
  );
});

const assetEntries: GeneratedEntry[] = Object.values(SEED_WORLD_ASSET_TYPE_CATALOG).map((entry) => ({
  name: entry.typeSymbol,
  description: `${entry.typeSymbol} 的完整公开字段；用于 inspect 对应 type 的资产。`,
  moduleId: moduleIdByTypeName.get(entry.typeSymbol)!
}));
const apiEntries: GeneratedEntry[] = SEED_WORLD_API_CONTRACTS.map((contract) => ({
  name: contract.name,
  description: contract.description,
  moduleId: `tools/${contract.name}.d.ts`
}));
const entries = [...assetEntries, ...apiEntries];
const modules = resolveModuleGraph([...typeModules, ...apiModules]);
assertSearchEntries(entries, modules);
assertDeclarationModulesTypeCheck(modules);

for (const module of modules) writeGenerated(`api/${module.id}`, module.source);

const catalog = renderSearchCatalog();
writeGenerated("SeedWorldApiSearchRegistry.ts", [
  generatedHeader(),
  `export const SEED_WORLD_API_SEARCH_CATALOG = ${JSON.stringify(catalog)};`,
  `export const SEED_WORLD_API_SEARCH_ENTRIES = Object.freeze(${JSON.stringify(entries, null, 2)});`,
  `export const SEED_WORLD_API_DECLARATION_MODULES = Object.freeze(${JSON.stringify(modules, null, 2)});`,
  ""
].join("\n\n"));
assertNoUnexpectedGeneratedDeclarations(modules);

function register(name: string, schema: z.ZodType): string {
  const existing = nameBySchema.get(schema);
  if (existing) return existing;
  schema.register(registry, { id: name });
  nameBySchema.set(schema, name);
  return name;
}

function registerPublic(name: string, schema: z.ZodType): string {
  const registeredName = register(name, schema);
  publicSchemaNames.add(registeredName);
  return registeredName;
}

function renderJsonValueModule(): string {
  return [
    "/** Agent Script 与 API 之间可传递的 JSON 值。 */",
    "export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };"
  ].join("\n");
}

function renderNamedSchemaModule(
  name: string,
  documentInputConstraints: boolean,
  dependencies: readonly string[]
): string {
  if (name === "Asset") return renderAssetModule(dependencies);
  if (name === "QueriedAsset") return renderQueriedAssetModule(dependencies);
  const concreteKind = concreteAssetKindByTypeName.get(name);
  if (concreteKind) return renderConcreteAssetModule(name, concreteKind, dependencies);
  const schema = schemas[name]!;
  const description = schemaDescription(schema, `${name} 类型声明。`);
  const moduleId = moduleIdByTypeName.get(name)!;
  return [
    renderTypeImports(moduleId, dependencies),
    doc(description),
    `export type ${name} = ${renderSchema(schema, 0, documentInputConstraints)};`
  ].filter(Boolean).join("\n\n");
}

function renderAssetModule(dependencies: readonly string[]): string {
  return [
    renderTypeImports("common/Asset.d.ts", dependencies),
    doc("所有持久世界资产共享的公共查询字段。type、ref.kind 和 ref.domain 遵循资产目录。"),
    [
      "type AssetDomainByKind = {",
      ...Object.entries(SEED_WORLD_ASSET_TYPE_CATALOG).map(([kind, entry]) =>
        `  ${JSON.stringify(kind)}: ${JSON.stringify(entry.domain)};`),
      "};",
      "",
      "export type Asset<T extends AssetKind = AssetKind> = T extends AssetKind ? {",
      "  /** 资产的公开类型判别字段。 */",
      "  type: T;",
      "  /** 可跨查询、inspect、更新和删除复用的稳定引用。 */",
      `  ref: Ref & { kind: T; domain: AssetDomainByKind[T] } & (${assetSourceSchema.options.map(source => `{ source: ${JSON.stringify(source)} }`).join(" | ")});`,
      "  /** 资产代表位置。 */",
      "  position?: Vec3;",
      "  /** 资产占据的世界范围。 */",
      "  bounds?: Bounds;",
      "  /** 玩家为资产添加的语义标签。 */",
      "  tags?: Array<string>;",
      "  relations?: AssetRelations;",
      "} : never;"
    ].join("\n")
  ].filter(Boolean).join("\n\n");
}

function renderQueriedAssetModule(dependencies: readonly string[]): string {
  return [
    renderTypeImports("common/QueriedAsset.d.ts", dependencies),
    doc("world.query 返回的公共 Asset 投影。distanceMetres 只描述本次查询上下文，不属于资产本身。"),
    [
      "export type QueriedAsset = Asset & {",
      "  /** 资产到本次查询锚点的距离，单位为米。 */",
      "  distanceMetres?: number;",
      "};"
    ].join("\n")
  ].filter(Boolean).join("\n\n");
}

function renderConcreteAssetModule(
  name: string,
  kind: string,
  dependencies: readonly string[]
): string {
  const schema = schemas[name]!;
  const properties = ((schema.properties ?? {}) as Record<string, JsonSchema>).properties;
  if (!properties && !schema.anyOf && !schema.oneOf) throw new Error(`Concrete asset '${name}' has no properties declaration`);
  return [
    renderTypeImports(moduleIdByTypeName.get(name)!, dependencies),
    doc(schemaDescription(schema, `${name} 详细资产声明。`)),
    ...(properties ? [
      `export type ${name} = Asset<${JSON.stringify(kind)}> & {`,
      "  /** 仅 world.inspect 返回的类型专属属性。 */",
      `  properties: ${renderSchema(properties, 1, false)};`,
      "};"
    ] : [`export type ${name} = ${renderSchema(schema, 0, false)};`]),
    "",
    "declare global {",
    "  namespace AgentTools {",
    "    interface AssetDetailsByType {",
    `      ${JSON.stringify(kind)}: ${name};`,
    "    }",
    "  }",
    "}"
  ].filter(Boolean).join("\n");
}

function concreteAssetDeclarationDependencies(name: string): string[] {
  const schema = schemas[name]!;
  const properties = ((schema.properties ?? {}) as Record<string, JsonSchema>).properties;
  if (!properties && !schema.anyOf && !schema.oneOf) throw new Error(`Concrete asset '${name}' has no properties declaration`);
  return [...new Set([
    "Asset",
    ...publicDeclarationDependencies([...schemaRefs(properties ?? schema)]),
    ...(containsInternalJsonRef(properties ?? schema) ? ["JsonValue"] : [])
  ])].sort();
}

function renderSchema(schema: JsonSchema, depth: number, documentInputConstraints: boolean): string {
  if (typeof schema.$ref === "string") {
    if (schema.$ref.includes("#/$defs/")) return "JsonValue";
    const name = localRefName(schema.$ref);
    if (publicSchemaNames.has(name)) return name;
    const referenced = schemas[name];
    if (!referenced) throw new Error(`No schema registered for private declaration '${name}'`);
    return renderSchema(referenced, depth, documentInputConstraints);
  }
  if (Object.hasOwn(schema, "const")) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(" | ") || "never";
  const union = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
  if (union) return union.map((entry) => wrap(renderSchema(entry, depth, documentInputConstraints))).join(" | ");
  if (Array.isArray(schema.allOf)) {
    return (schema.allOf as JsonSchema[])
      .map((entry) => wrap(renderSchema(entry, depth, documentInputConstraints)))
      .join(" & ");
  }
  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => renderSchema({ ...schema, type }, depth, documentInputConstraints)).join(" | ");
  }
  switch (schema.type) {
    case "null": return "null";
    case "boolean": return "boolean";
    case "number":
    case "integer": return "number";
    case "string": return "string";
    case "array": {
      if (Array.isArray(schema.prefixItems)) {
        return `[${(schema.prefixItems as JsonSchema[])
          .map((entry) => renderSchema(entry, depth + 1, documentInputConstraints)).join(", ")}]`;
      }
      const item = schema.items && typeof schema.items === "object"
        ? renderSchema(schema.items as JsonSchema, depth + 1, documentInputConstraints)
        : "unknown";
      return `Array<${item}>`;
    }
    case "object": return renderObject(schema, depth, documentInputConstraints);
    default: return "unknown";
  }
}

function renderObject(schema: JsonSchema, depth: number, documentInputConstraints: boolean): string {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set(Array.isArray(schema.required) ? schema.required as string[] : []);
  const indent = "  ".repeat(depth + 1);
  const lines = Object.entries(properties).flatMap(([name, property]) => {
    const documentation = propertyDocumentation(property, documentInputConstraints);
    const description = documentation ? [`${indent}${doc(documentation, depth + 1)}`] : [];
    return [
      ...description,
      `${indent}${propertyName(name)}${required.has(name) ? "" : "?"}: ${renderSchema(property, depth + 1, documentInputConstraints)};`
    ];
  });
  if (schema.additionalProperties && schema.additionalProperties !== false) {
    const value = typeof schema.additionalProperties === "object"
      ? renderSchema(schema.additionalProperties as JsonSchema, depth + 1, documentInputConstraints)
      : "unknown";
    lines.push(`${indent}[key: string]: ${value};`);
  }
  if (!lines.length) return "Record<string, never>";
  return `{\n${lines.join("\n")}\n${"  ".repeat(depth)}}`;
}

function propertyDocumentation(schema: JsonSchema, documentInputConstraints: boolean): string | undefined {
  const parts = typeof schema.description === "string" ? [asDocumentationSentence(schema.description)] : [];
  if (!documentInputConstraints) return parts[0] || undefined;
  if (schema.default !== undefined) parts.push(`默认值：${JSON.stringify(schema.default)}。`);
  const minimum = schema.minimum === -Number.MAX_SAFE_INTEGER ? undefined : schema.minimum;
  const maximum = schema.maximum === Number.MAX_SAFE_INTEGER ? undefined : schema.maximum;
  if (typeof minimum === "number" && typeof maximum === "number") {
    parts.push(`取值范围：${minimum} 到 ${maximum}。`);
  } else if (typeof minimum === "number") {
    parts.push(`最小值：${minimum}。`);
  } else if (typeof maximum === "number") {
    parts.push(`最大值：${maximum}。`);
  }
  if (typeof schema.minItems === "number" && typeof schema.maxItems === "number") {
    parts.push(`元素数量：${schema.minItems} 到 ${schema.maxItems}。`);
  } else if (typeof schema.minItems === "number") {
    parts.push(`最少 ${schema.minItems} 个元素。`);
  } else if (typeof schema.maxItems === "number") {
    parts.push(`最多 ${schema.maxItems} 个元素。`);
  }
  if (typeof schema.minLength === "number" && typeof schema.maxLength === "number") {
    parts.push(`字符长度：${schema.minLength} 到 ${schema.maxLength}。`);
  } else if (typeof schema.minLength === "number") {
    parts.push(`最少 ${schema.minLength} 个字符。`);
  } else if (typeof schema.maxLength === "number") {
    parts.push(`最多 ${schema.maxLength} 个字符。`);
  }
  const documentation = parts.filter(Boolean).join(" ");
  return documentation || undefined;
}

function asDocumentationSentence(value: string): string {
  const trimmed = value.trim();
  return /[。！？；.!?;]$/u.test(trimmed) ? trimmed : `${trimmed}。`;
}

function schemaDependencyClosure(initialNames: readonly string[], schemaMap: Readonly<Record<string, JsonSchema>>): Set<string> {
  const names = new Set<string>();
  const pending = [...initialNames];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (names.has(name)) continue;
    names.add(name);
    const schema = schemaMap[name];
    if (!schema) continue;
    for (const dependency of schemaRefs(schema)) pending.push(dependency);
  }
  return names;
}

/** Public imports required after Tool-private schemas have been rendered inline. */
function publicDeclarationDependencies(initialNames: readonly string[]): string[] {
  const dependencies = new Set<string>();
  const visitedPrivate = new Set<string>();
  const pending = [...initialNames];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (publicSchemaNames.has(name)) {
      dependencies.add(name);
      continue;
    }
    if (visitedPrivate.has(name)) continue;
    visitedPrivate.add(name);
    const schema = schemas[name];
    if (!schema) continue;
    if (containsInternalJsonRef(schema)) dependencies.add("JsonValue");
    for (const dependency of schemaRefs(schema)) pending.push(dependency);
  }
  return [...dependencies].sort();
}

function renderApiFunctionModule(
  contract: (typeof SEED_WORLD_API_CONTRACTS)[number],
  dependencies: readonly string[]
): string {
  if (contract.output === inspectedWorldAssetSchema) {
    return renderInspectApiFunctionModule(contract, dependencies);
  }
  const types = contractTypes.get(contract.name)!;
  const inputType = renderContractType(types.input, true);
  const input = contract.inputMode === "none" ? "" : `input${contract.inputMode === "optional" ? "?" : ""}: ${inputType}`;
  const output = types.outputs.map((name) => renderContractType(name, false)).join(" | ");
  const path = contract.name.split(".");
  const functionName = path.pop()!;
  const method = [
    "/**",
    ` * ${contract.description}`,
    ...(contract.inputMode === "none" ? [] : [` * @param input - ${contract.inputDescription}`]),
    ` * @returns ${contract.outputDescription}`,
    " */",
    `${functionName}(${input}): Promise<${output}>;`
  ].join("\n");
  const leafInterface = apiInterfaceName(path);
  const leaf = `interface ${leafInterface} {\n${method.split("\n").map((line) => `  ${line}`).join("\n")}\n}`;
  const declarations = path.length === 1
    ? [leaf]
    : [
        `interface ${apiInterfaceName(path.slice(0, -1))} { readonly ${path.at(-1)!}: ${leafInterface}; }`,
        leaf
      ];
  const indented = declarations.join("\n").split("\n").map((line) => `    ${line}`).join("\n");
  return [
    renderTypeImports(`tools/${contract.name}.d.ts`, dependencies),
    "declare global {",
    "  namespace AgentTools {",
    indented,
    "  }",
    "}",
    "",
    "export {};"
  ].filter((part, index, values) => Boolean(part) || index === values.length - 2).join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function renderInspectApiFunctionModule(
  contract: (typeof SEED_WORLD_API_CONTRACTS)[number],
  dependencies: readonly string[]
): string {
  return [
    renderTypeImports(`tools/${contract.name}.d.ts`, dependencies),
    "declare global {",
    "  namespace AgentTools {",
    "    interface WorldApi {",
    "      /**",
    `       * ${contract.description}`,
    `       * @param input - ${contract.inputDescription}`,
    `       * @returns ${contract.outputDescription}`,
    "       */",
    "      inspect<T extends AssetKind & keyof AssetDetailsByType>(",
    "        input: { ref: Ref & { kind: T } }",
    "      ): Promise<AssetDetailsByType[T]>;",
    "    }",
    "  }",
    "}",
    "",
    "export {};"
  ].filter(Boolean).join("\n");
}

function renderContractType(name: string, documentInputConstraints: boolean): string {
  if (publicSchemaNames.has(name)) return name;
  const schema = schemas[name];
  if (!schema) throw new Error(`No registered schema for Tool-local declaration '${name}'`);
  return renderSchema(schema, 0, documentInputConstraints);
}

function renderAgentToolsRoot(): string {
  const roots = [...new Set(SEED_WORLD_API_CONTRACTS.map(({ name }) => name.split(".")[0]!))];
  return [
    "/** Type-only marker used by Tool modules to depend on the Agent tools root. */",
    "export type AgentToolsDeclaration = true;",
    "",
    "declare global {",
    "  namespace AgentTools {",
    "    /** Concrete asset declarations augment this map by public Asset.type. */",
    "    interface AssetDetailsByType {}",
    ...roots.map((root) => `    interface ${apiInterfaceName([root])} {}`),
    "    interface SeedWorldAgentScriptTools {",
    ...roots.map((root) => `      readonly ${root}: ${apiInterfaceName([root])};`),
    "    }",
    "  }",
    "  const tools: AgentTools.SeedWorldAgentScriptTools;",
    "}"
  ].join("\n");
}

function renderTypeImports(fromModuleId: string, dependencies: readonly string[]): string {
  return dependencies.map((dependency) => {
    const targetModuleId = moduleIdByTypeName.get(dependency);
    if (!targetModuleId) throw new Error(`No declaration module registered for '${dependency}'`);
    const importedName = dependency === "AgentTools" ? "AgentToolsDeclaration" : dependency;
    return `import type { ${importedName} } from ${JSON.stringify(relativeModuleSpecifier(fromModuleId, targetModuleId))};`;
  }).join("\n");
}

function relativeModuleSpecifier(fromModuleId: string, targetModuleId: string): string {
  const withoutExtension = targetModuleId.replace(/\.d\.ts$/, "");
  const value = posix.relative(posix.dirname(fromModuleId), withoutExtension);
  return value.startsWith(".") ? value : `./${value}`;
}

function createDeclarationModule(id: string, body: string, toolNames: readonly string[]): GeneratedModule {
  return Object.freeze({
    id,
    source: `${generatedHeader()}\n\n${body.trim()}\n`,
    imports: Object.freeze([]),
    toolNames: Object.freeze([...toolNames])
  });
}

function apiInterfaceName(path: readonly string[]): string {
  return `${path.map((part) => pascalCase(part)).join("")}Api`;
}

function renderSearchCatalog(): string {
  const assetRows = Object.entries(SEED_WORLD_ASSET_TYPE_CATALOG);
  return [
    "世界持久资产类型路由（需要详情字段时用 APISearch Symbol 检索具体资产声明）：",
    "| Asset Type | Asset Domain | APISearch Symbol |",
    "| --- | --- | --- |",
    ...assetRows.map(([kind, { domain, typeSymbol }]) => `| ${kind} | ${domain} | ${typeSymbol} |`),
    "world.query 只返回公共 Asset 字段；根据 item.type 检索对应资产符号，再把 item.ref 传给 world.inspect 读取类型专属 properties。",
    "",
    "Agent Script API 路由（需要签名时用右列精确符号调用 APISearch）：",
    "| 能力 | APISearch Symbol |",
    "| --- | --- |",
    ...SEED_WORLD_API_CONTRACTS.map((contract) => `| ${contract.description} | ${contract.name} |`)
  ].join("\n");
}

function resolveModuleGraph(modules: readonly GeneratedModule[]): readonly GeneratedModule[] {
  const moduleIds = new Set(modules.map(({ id }) => id));
  if (moduleIds.size !== modules.length) throw new Error("Generated APISearch modules contain duplicate ids");
  return modules.map((module) => {
    if (!module.id.endsWith(".d.ts") || module.id.startsWith("/") || module.id.includes("..")) {
      throw new Error(`Invalid APISearch declaration module id '${module.id}'`);
    }
    const imports = declarationModuleSpecifiers(module.id, module.source)
      .map((specifier) => resolveImportedModuleId(module.id, specifier, moduleIds));
    return Object.freeze({ ...module, imports: Object.freeze([...new Set(imports)]) });
  });
}

function assertSearchEntries(entries: readonly GeneratedEntry[], modules: readonly GeneratedModule[]): void {
  const names = new Set(entries.map(({ name }) => name));
  const moduleIds = new Set(modules.map(({ id }) => id));
  if (names.size !== entries.length) throw new Error("Generated APISearch entries contain duplicate names");
  for (const entry of entries) {
    if (!moduleIds.has(entry.moduleId)) {
      throw new Error(`APISearch entry '${entry.name}' references missing module '${entry.moduleId}'`);
    }
  }
}

function declarationModuleSpecifiers(moduleId: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(moduleId, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    noLib: true,
    target: ts.ScriptTarget.Latest
  };
  const compilerHost: ts.CompilerHost = {
    fileExists: (fileName) => fileName === moduleId,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "",
    getDirectories: () => [],
    getNewLine: () => "\n",
    getSourceFile: (fileName) => fileName === moduleId ? sourceFile : undefined,
    readFile: (fileName) => fileName === moduleId ? source : undefined,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined
  };
  const program = ts.createProgram([moduleId], compilerOptions, compilerHost);
  const diagnostic = program
    .getSyntacticDiagnostics(sourceFile)
    .find(({ category }) => category === ts.DiagnosticCategory.Error);
  if (diagnostic) {
    throw new Error(
      `Generated declaration module '${moduleId}' is not valid TypeScript: ` +
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );
  }

  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

function resolveImportedModuleId(
  fromModuleId: string,
  specifier: string,
  moduleIds: ReadonlySet<string>
): string {
  if (!specifier.startsWith(".")) {
    throw new Error(`Declaration module '${fromModuleId}' uses unsupported non-relative import '${specifier}'`);
  }
  const base = posix.normalize(posix.join(posix.dirname(fromModuleId), specifier));
  const candidates = [base, `${base}.d.ts`, `${base}/index.d.ts`];
  const resolved = candidates.find((candidate) => moduleIds.has(candidate));
  if (!resolved) throw new Error(`Declaration module '${fromModuleId}' cannot resolve import '${specifier}'`);
  return resolved;
}

/**
 * Compile the complete generated declaration graph, rather than validating
 * modules one at a time. This catches cross-module contract errors such as an
 * existing import path that does not actually export the requested type.
 */
function assertDeclarationModulesTypeCheck(modules: readonly GeneratedModule[]): void {
  const virtualRoot = "/__seed_world_agent_api__";
  const sourceByFileName = new Map(
    modules.map((module) => [posix.join(virtualRoot, module.id), module.source] as const)
  );
  sourceByFileName.set(posix.join(virtualRoot, "asset-inspect-contract.ts"), [
    'import type { QueriedAsset } from "./common/QueriedAsset";',
    'import type { LakeAsset } from "./assets/LakeAsset";',
    "declare const queriedAsset: QueriedAsset;",
    "async function verifyQueryToInspectEvidenceChain(): Promise<void> {",
    '  if (queriedAsset.type !== "lake") return;',
    "  const detail: LakeAsset = await tools.world.inspect({ ref: queriedAsset.ref });",
    "  void detail.properties.radiusMetres;",
    "}",
    "void verifyQueryToInspectEvidenceChain;",
    "async function verifyQueryToUpdateEvidenceChain(): Promise<void> {",
    '  const result = await tools.world.query({ domains: ["vegetation"], kinds: ["tree"], sources: ["authored"] });',
    "  const item = result.items[0];",
    '  if (!item || item.type !== "tree") return;',
    "  const ref = item.ref;",
    '  if (ref.source !== "authored") return;',
    '  const domain: "vegetation" = ref.domain;',
    '  await tools.vegetation.update({ ref, patch: { seed: 42 } });',
    "  void domain;",
    "}",
    "void verifyQueryToUpdateEvidenceChain;",
    "async function rejectNaturalTreeMove(): Promise<void> {",
    '  if (queriedAsset.type !== "tree") return;',
    "  const ref = queriedAsset.ref;",
    '  if (ref.source !== "natural") return;',
    "  // @ts-expect-error Natural trees do not accept authored position/seed edits.",
    '  await tools.vegetation.update({ ref, patch: { seed: 42 } });',
    "}",
    "void rejectNaturalTreeMove;",
    ""
  ].join("\n"));
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipDefaultLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: []
  };
  const defaultHost = ts.createCompilerHost(compilerOptions, true);
  const compilerHost: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (fileName) => sourceByFileName.has(posix.normalize(fileName)) || defaultHost.fileExists(fileName),
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      const source = sourceByFileName.get(posix.normalize(fileName));
      return source === undefined
        ? defaultHost.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
        : ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS);
    },
    readFile: (fileName) => sourceByFileName.get(posix.normalize(fileName)) ?? defaultHost.readFile(fileName),
    resolveModuleNames: (moduleNames, containingFile) => moduleNames.map((specifier) => {
      if (specifier.startsWith(".")) {
        const base = posix.normalize(posix.join(posix.dirname(containingFile), specifier));
        const resolvedFileName = [base, `${base}.d.ts`, `${base}/index.d.ts`]
          .find((candidate) => sourceByFileName.has(candidate));
        if (resolvedFileName) {
          return {
            extension: ts.Extension.Dts,
            isExternalLibraryImport: false,
            resolvedFileName
          };
        }
      }
      return ts.resolveModuleName(specifier, containingFile, compilerOptions, defaultHost).resolvedModule;
    })
  };
  const program = ts.createProgram([...sourceByFileName.keys()], compilerOptions, compilerHost);
  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics()
  ].filter(({ category }) => category === ts.DiagnosticCategory.Error);
  if (diagnostics.length === 0) return;

  const formatted = diagnostics.slice(0, 20).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    const file = posix.relative(virtualRoot, posix.normalize(diagnostic.file.fileName));
    return `${file}:${location.line + 1}:${location.character + 1} ${message}`;
  });
  throw new Error(
    `Generated Agent declaration modules failed TypeScript semantic validation:\n${formatted.join("\n")}`
  );
}

function assertNoUnexpectedGeneratedDeclarations(modules: readonly GeneratedModule[]): void {
  if (!checkMode) return;
  const expected = new Set(modules.map(({ id }) => id));
  const actual = new Set(listFilesRecursively(declarationDirectory).map((path) => relative(declarationDirectory, path).split("\\").join("/")));
  for (const id of expected) {
    if (!actual.has(id)) throw new Error(`Generated Agent declaration is missing: api/${id}`);
  }
  for (const id of actual) {
    if (!expected.has(id)) throw new Error(`Unexpected stale Agent declaration: api/${id}`);
  }
}

function listFilesRecursively(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(path) : [path];
  });
}

function schemaRefs(value: unknown, refs = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) schemaRefs(entry, refs);
    return refs;
  }
  if (!value || typeof value !== "object") return refs;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$ref" && typeof entry === "string" && !entry.includes("#/$defs/")) refs.add(localRefName(entry));
    else schemaRefs(entry, refs);
  }
  return refs;
}

function containsInternalJsonRef(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsInternalJsonRef);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    (key === "$ref" && typeof entry === "string" && entry.includes("#/$defs/")) || containsInternalJsonRef(entry)
  );
}

function localRefName(value: string): string { return value.split("/").at(-1)!; }
function schemaDescription(schema: JsonSchema, fallback: string): string {
  return typeof schema.description === "string" && schema.description.trim() ? schema.description.trim() : fallback;
}
function generatedHeader(): string {
  return ["// AUTO-GENERATED by generate-agent-contracts.ts from executable Zod contracts.", "// Do not edit this file directly."].join("\n");
}
function writeGenerated(file: string, content: string): void {
  const path = resolve(generatedDirectory, file);
  const expected = `${content.trim()}\n`;
  if (checkMode) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) {
      throw new Error(`Generated Agent contract is stale: ${file}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, expected, "utf8");
}
function pascalCase(value: string): string {
  return value.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
}
function wrap(value: string): string { return value.includes(" | ") || value.includes(" & ") ? `(${value})` : value; }
function propertyName(value: string): string { return /^[A-Za-z_$][\w$]*$/.test(value) ? value : JSON.stringify(value); }
function doc(value: string, depth = 0): string {
  const prefix = "  ".repeat(depth);
  const lines = value.replace(/\*\//g, "* /").split("\n");
  return lines.length === 1
    ? `/** ${lines[0]} */`
    : ["/**", ...lines.map((line) => ` * ${line}`), " */"].map((line) => prefix + line).join("\n").trimStart();
}
