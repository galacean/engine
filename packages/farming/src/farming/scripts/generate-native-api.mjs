import ts from "typescript";
import { apiOperationTypes, exportedType, schemaOutput, typeText, assertDeclarationSyntax } from "@galacean/engine-project/api-contract/scripts/declarations.mjs";
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
function writeIfChanged(path, content) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content);
}
function collect(symbol) {
  if (!symbol) return;
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  for (let node of symbol.declarations ?? []) {
    if (ts.isEnumMember(node)) node = node.parent;
    const source = node.getSourceFile();
    if (!source.fileName.includes("/packages/farming/src/farming/") && !source.fileName.includes("/packages/farming/src/interaction/")) continue;
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
declare global { namespace editor { namespace component {
  function query(input: {type:"FarmingSystem"; scene?:string; entityId?:string; id?:string}): Promise<FarmingSystemEditor[]>;
} } }
`;
assertDeclarationSyntax(text + editorTypes);
assertDeclarationSyntax(text + systemEditorTypes);
const content = `// Generated by scripts/generate-native-api.mjs. Do not edit.\nconst FARMING_TYPES = ${JSON.stringify(text)};\nexport const FARMING_API_DECLARATION = FARMING_TYPES + ${JSON.stringify(editorTypes)};\nexport const FARMING_SYSTEM_EDITOR_DECLARATION = FARMING_TYPES + ${JSON.stringify(systemEditorTypes)};\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== content)
    throw new Error("Farming API declarations are stale. Run farming:native-api:generate.");
} else {
  writeIfChanged(output, content);
}
const knowledgeDir = new URL("../native/knowledge", import.meta.url);
const paths = ["README.md", "operations.md", "state-and-units.md", "verification.md", "system-editor.md"];
const docs = paths.map((path) => ({
  path: `farming/${path}`,
  content: readFileSync(new URL(path, knowledgeDir), "utf8")
}));
const knowledge = `// Generated from native/knowledge. Do not edit.\nexport const FARMING_KNOWLEDGE = ${JSON.stringify(docs, null, 2)} as const;\n`;
const knowledgeOutput = fileURLToPath(new URL("../native/FarmingKnowledge.ts", import.meta.url));
if (process.argv.includes("--check")) {
  if (readFileSync(knowledgeOutput, "utf8") !== knowledge) throw new Error("Farming knowledge is stale.");
} else {
  writeIfChanged(knowledgeOutput, knowledge);
}
console.log(
  `Farming API: ${declarations.size} declarations ${process.argv.includes("--check") ? "verified" : "generated"}.`
);
