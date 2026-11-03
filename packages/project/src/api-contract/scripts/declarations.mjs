import ts from "typescript";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function contractProgram(entry) {
  const program = ts.createProgram([entry], { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, strict: true, allowJs: true });
  return { program, checker: program.getTypeChecker() };
}

/** Extract signatures from the same typed registrations consumed by the host.
 * This runs only at build time; neither the generator nor TypeScript enters the API runtime. */
export function apiMethods(program, checker, entry, exportName) {
  const source = program.getSourceFile(entry);
  const symbol = checker.getExportsOfModule(checker.getSymbolAtLocation(source)).find(s => s.name === exportName);
  if (!symbol) throw new Error(`Missing contract export ${exportName}`);
  const contract = checker.getTypeOfSymbolAtLocation(symbol, source);
  return checker.getPropertiesOfType(contract).map(property => {
    const method = checker.getTypeOfSymbolAtLocation(property, source);
    const execute = checker.getPropertyOfType(method, "execute");
    const signature = checker.getSignaturesOfType(checker.getTypeOfSymbolAtLocation(execute, source), ts.SignatureKind.Call)[0];
    if (!signature) throw new Error(`Missing typed execute: ${property.name}`);
    const input = checker.getTypeOfSymbolAtLocation(signature.parameters[1], source);
    const output = checker.getAwaitedType(checker.getReturnTypeOfSignature(signature));
    const describe = checker.getPropertyOfType(method, "description");
    const description = checker.getTypeOfSymbolAtLocation(describe, source);
    return { name: property.name, input, output,
      description: description.isStringLiteral() ? description.value : property.getDocumentationComment(checker).map(p => p.text).join(""),
      inputText: typeText(checker, input), outputText: typeText(checker, output) };
  });
}
export function typeText(checker, type) {
  const value = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias);
  if (/\bany\b|import\(/.test(value)) throw new Error(`Unresolved API declaration: ${value}`);
  return value;
}
export function writeGenerated(path, content, check = process.argv.includes("--check")) {
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) throw new Error(`Stale generated API: ${path}`);
  } else if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content);
}

export function schemaOutput(checker, schema, location) {
  const property = checker.getPropertyOfType(schema, "_output");
  if (!property) throw new Error("API inputs must expose their Zod output type");
  return checker.getTypeOfSymbolAtLocation(property, location);
}
export function exportedType(program, checker, entry, name) {
  const source = program.getSourceFile(entry);
  const symbol = checker.getExportsOfModule(checker.getSymbolAtLocation(source)).find(s => s.name === name);
  if (!symbol) throw new Error(`Missing API export ${name}`);
  return checker.getTypeOfSymbolAtLocation(symbol, source);
}
export function apiOperationTypes(program, checker, entry, exportName) {
  const source = program.getSourceFile(entry);
  return checker.getPropertiesOfType(exportedType(program, checker, entry, exportName)).map(property => {
    const method = checker.getTypeOfSymbolAtLocation(property, source);
    const field = name => checker.getTypeOfSymbolAtLocation(checker.getPropertyOfType(method, name), source);
    const input = schemaOutput(checker, field("input"), source);
    return { name: property.name, inputText: typeText(checker, input), effect: field("effect").value,
      description: field("description").value };
  });
}

/** Include named DTOs reached by inferred signatures. External declarations (for
 * example Editor source-schema) are supplied by the caller's declaration imports. */
export function referencedDeclarations(checker, roots, includeFile) {
  const printer = ts.createPrinter();
  const declarations = new Map();
  const seen = new Set();
  const collectSymbol = symbol => {
    if (!symbol) return;
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    for (const node of symbol.declarations ?? []) {
      if (!includeFile(node.getSourceFile().fileName) || !node.name ||
          !(ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node))) continue;
      const name = node.name.getText();
      if (declarations.has(name)) {
        if (declarations.get(name) !== node) throw new Error(`Ambiguous API type: ${name}`);
        continue;
      }
      declarations.set(name, node);
      const visit = child => {
        if (ts.isTypeReferenceNode(child)) collectSymbol(checker.getSymbolAtLocation(child.typeName));
        ts.forEachChild(child, visit);
      };
      visit(node);
    }
  };
  const visitType = type => {
    if (!type || seen.has(type)) return;
    seen.add(type);
    collectSymbol(type.aliasSymbol ?? type.symbol);
    for (const item of [...(type.types ?? []), ...(type.typeArguments ?? []), ...(type.aliasTypeArguments ?? [])]) visitType(item);
    if (!type.symbol || type.symbol.name === "__type") {
      for (const property of checker.getPropertiesOfType(type)) {
        const node = property.valueDeclaration ?? property.declarations?.[0];
        if (node) visitType(checker.getTypeOfSymbolAtLocation(property, node));
      }
    }
  };
  roots.forEach(visitType);
  return [...declarations.values()].map(node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())).join("\n");
}

export function assertDeclarationSyntax(source) {
  const file = ts.createSourceFile("api.d.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (file.parseDiagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(file.parseDiagnostics, {
    getCanonicalFileName:path=>path, getCurrentDirectory:()=>"/", getNewLine:()=>"\n"
  }));
}
