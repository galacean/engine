import prettier from "prettier";
import ts from "typescript";
import { apiOperationTypes, referencedDeclarations, exportedType, schemaOutput, typeText, assertDeclarationSyntax } from "@galacean/engine-project/api-contract/scripts/declarations.mjs";
import { registeredComponentQuery } from "@galacean/engine-project/api-contract/scripts/component-query.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Extract the transitive type declarations from the actual command contract, not a second handwritten schema.
const entry = fileURLToPath(new URL("../native/FarmingAPIContract.ts", import.meta.url));
const output = fileURLToPath(new URL("../native/FarmingAPIDeclarations.ts", import.meta.url));
const program = ts.createProgram([entry], {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true
});
const checker = program.getTypeChecker();
const printer = ts.createPrinter();
const declarations = new Map();
const operations = apiOperationTypes(program, checker, entry, "farmingOperations");
const contractSource = program.getSourceFile(entry);
const commandSymbol = checker.getExportsOfModule(checker.getSymbolAtLocation(contractSource)).find(symbol => symbol.name === "FarmingCommands");
const commandType = checker.getDeclaredTypeOfSymbol(commandSymbol);
for (const method of operations) {
  method.inputText = typeText(checker, checker.getTypeOfSymbolAtLocation(checker.getPropertyOfType(commandType, method.name), contractSource));
}
const derived = new Map([
  ["FarmingCommands", `export interface FarmingCommands {\n${operations.map(method => `/** ${method.description.replaceAll("*/", "* /")} */\n${method.name}: ${method.inputText};`).join("\n")}\n}`],
  ["FarmingMutation", `export type FarmingMutation = ${operations.filter(method => method.effect === "command").map(method => JSON.stringify(method.name)).join(" | ")};`],
  ["FarmingWriteOptions", `export type FarmingWriteOptions = ${typeText(checker, schemaOutput(checker, exportedType(program, checker, entry, "farmingWriteOptionsSchema"), program.getSourceFile(entry)))};`]
]);
// Match the repository's commit formatting so --check stays true after lint-staged.
const format = async (path, content) => prettier.format(content, { ...(await prettier.resolveConfig(path)), filepath: path });
function writeIfChanged(path, content) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content);
}
function collect(symbol) {
  if (!symbol) return;
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  for (let node of symbol.declarations ?? []) {
    if (ts.isEnumMember(node)) node = node.parent;
    const source = node.getSourceFile();
    if (!source.fileName.includes("/packages/farming/src/farming/") && !source.fileName.includes("/packages/project/src/interaction/")) continue;
    if (
      !(
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isVariableDeclaration(node)
      )
    )
      continue;
    const name = node.name.getText(source);
    if (declarations.has(name)) {
      if (declarations.get(name) !== node) throw new Error(`Ambiguous Farming API type: ${name}`);
      continue;
    }
    declarations.set(name, node);
    if (derived.has(name)) continue;
    function visit(child) {
      if (ts.isTypeReferenceNode(child)) collect(checker.getSymbolAtLocation(child.typeName));
      if (ts.isTypeQueryNode(child)) collect(checker.getSymbolAtLocation(child.exprName));
      if (ts.isExpressionWithTypeArguments(child)) collect(checker.getSymbolAtLocation(child.expression));
      ts.forEachChild(child, visit);
    }
    visit(node);
  }
}
const source = program.getSourceFile(entry);
for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
  if (symbol.declarations?.some(node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node))) collect(symbol);
}
const text =
  [...declarations.entries()]
    .map(([name, node]) =>
      derived.has(name) ? derived.get(name) : ts.isVariableDeclaration(node)
        ? `export declare const ${name}: ${checker.typeToString(checker.getTypeAtLocation(node), undefined, ts.TypeFormatFlags.NoTruncation)};`
        : printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
    )
    .join("\n\n");
const editorTypes = `
/** Editor references contain identity only. Read state explicitly; every method crosses the Worker boundary. */
export type FarmingEditorMethod<K extends Exclude<keyof FarmingCommands, "list">> =
  K extends FarmingMutation
    ? (input: Omit<FarmingCommands[K], "farmId">, options?: FarmingWriteOptions) => Promise<Extract<FarmingResult<FarmingOutputs[K]>, { readonly ok: true }>>
    : {} extends Omit<FarmingCommands[K], "farmId">
      ? (input?: Omit<FarmingCommands[K], "farmId">) => Promise<Extract<FarmingResult<FarmingOutputs[K]>, { readonly ok: true }>>
      : (input: Omit<FarmingCommands[K], "farmId">) => Promise<Extract<FarmingResult<FarmingOutputs[K]>, { readonly ok: true }>>;
export type FarmingAreaEditor = { readonly farmId: string } & {
  readonly [K in Exclude<keyof FarmingCommands, "list"> as K extends "get" ? "read" : K]: FarmingEditorMethod<K>
};
export interface FarmingSystemEditor {
  readonly systemId: string;
  /** System diagnostics are available even before an area initializes. Querying never retries initialization. */
  getDiagnostics(input?: FarmingCommands["getDiagnostics"]): Promise<Extract<FarmingResult<FarmingOutputs["getDiagnostics"]>, { readonly ok: true }>>;
}
declare global { namespace editor { namespace component {
  function query(input: { type: "FarmingSystem" }): Promise<FarmingSystemEditor[]>;
  /** Query region references; do not infer a target from array order. */
  function query(input: { type: "FarmingAreaComponent"; farmId?: string }): Promise<FarmingAreaEditor[]>;
} } }
`;
const systemEditorTypes = `
/** Source identity, not an Engine instance. Farm/plot IDs identify objects owned by this system. */
export type FarmingSystemEditor = {
  readonly scene: string; readonly entityId: string; readonly id: string; readonly type: "FarmingSystem";
} & { readonly [K in keyof FarmingCommands]:
  K extends FarmingMutation
    ? (input: FarmingCommands[K], options?: FarmingWriteOptions) => Promise<Extract<FarmingResult<FarmingOutputs[K]>, {readonly ok:true}>>
    : {} extends FarmingCommands[K]
      ? (input?: FarmingCommands[K]) => Promise<Extract<FarmingResult<FarmingOutputs[K]>, {readonly ok:true}>>
      : (input: FarmingCommands[K]) => Promise<Extract<FarmingResult<FarmingOutputs[K]>, {readonly ok:true}>>
};
${registeredComponentQuery("FarmingSystem", "FarmingSystemEditor")}
`;
assertDeclarationSyntax(text + editorTypes);
assertDeclarationSyntax(text + systemEditorTypes);
const content = await format(output, `// Generated by scripts/generate-native-api.mjs. Do not edit.\nconst FARMING_TYPES = ${JSON.stringify(text)};\nexport const FARMING_API_DECLARATION = FARMING_TYPES + ${JSON.stringify(editorTypes)};\nexport const FARMING_SYSTEM_EDITOR_DECLARATION = ${JSON.stringify("/** Method input/output entry: read editor/farming/methods/README.md, then editor/farming/methods/<method>.md. This full declaration may require multiple read pages. */\n" + systemEditorTypes)} + FARMING_TYPES;\n`);
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== content)
    throw new Error("Farming API declarations are stale. Run farming:native-api:generate.");
} else {
  writeIfChanged(output, content);
}
const outputType = checker.getDeclaredTypeOfSymbol(checker.getExportsOfModule(checker.getSymbolAtLocation(source)).find(symbol => symbol.name === "FarmingOutputs"));
const methodDocs = operations.map(method => {
  const result = checker.getTypeOfSymbolAtLocation(checker.getPropertyOfType(outputType, method.name), source);
  const input = checker.getTypeOfSymbolAtLocation(checker.getPropertyOfType(commandType, method.name), source);
  // Capability names need only the operation union, not the schema implementation or every command input.
  const types = referencedDeclarations(checker, [input, result], path => path.includes("/packages/farming/src/farming/") || path.includes("/packages/project/src/interaction/"))
    .replace(printer.printNode(ts.EmitHint.Unspecified, declarations.get("FarmingCommands"), source), "")
    .replaceAll("keyof FarmingCommands", `(${operations.map(operation => JSON.stringify(operation.name)).join(" | ")})`);
  return { path: `declare/editor/farming/methods/${method.name}.md`, content: [
    `# system.${method.name}`, "",
    '入口：`const systems = await editor.component.query({type:"FarmingSystem"});` 按身份选取 system。',
    `调用：await system.${method.name}(input${method.effect === "command" ? ", options?" : ""})`,
    method.description, "",
    "成功返回 {ok:true, value, context?}；下方 Value 是 result.value 的类型。失败抛出结构化错误。", "",
    "```ts", `type Input = ${method.inputText};`, `type Value = ${typeText(checker, result)};`, "```", "",
    "## 返回与输入依赖类型", "```ts", types, "```", "",
    "写入选项及完整类型：[完整声明](declare/editor/farming/FarmingSystem.d.ts)。读取若返回 next，按 next.offset 续读。"
  ].join("\n") };
});
const docs = [{ path: "declare/editor/farming/methods/README.md", content: ["# 农场方法索引", "",
  "先查询 FarmingSystem 代理，再选择下一步方法。每页由真实 API 契约生成，包含输入、成功 value 与依赖类型。", "",
  ...operations.map(method => `- [system.${method.name}](declare/editor/farming/methods/${method.name}.md) — ${method.effect}`)
].join("\n") }, ...methodDocs];
const methodDocsOutput = fileURLToPath(new URL("../native/FarmingMethodDocs.ts", import.meta.url));
const methodDocsContent = await format(methodDocsOutput, `// Generated by scripts/generate-native-api.mjs. Do not edit.\nexport const FARMING_METHOD_DOCS = ${JSON.stringify(docs, null, 2)} as const;\n`);
if (process.argv.includes("--check")) {
  if (readFileSync(methodDocsOutput, "utf8") !== methodDocsContent) throw new Error("Farming method docs are stale.");
} else {
  writeIfChanged(methodDocsOutput, methodDocsContent);
}
console.log(
  `Farming API: ${declarations.size} declarations ${process.argv.includes("--check") ? "verified" : "generated"}.`
);
