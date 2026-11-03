import { resolveAssetPath } from "@galacean/engine-project/runtime-editor/project/runtime-asset-path";
import * as ts from "typescript";
import { RuntimeScriptPreparationError } from "./runtime-script-errors";

export interface CompiledRuntimeScripts {
  resolutions?: Record<string, Record<string, string>>;
  dependencies: Record<string, string[]>;
  entries: Record<string, string>;
  files: Record<string, { code: string; imports: { start: number; end: number; path: string }[] }>;
}
export interface CheckedRuntimeScripts {
  sources: Record<string, string>;
  dependencies: Record<string, string[]>;
  resolutions: Record<string, Record<string, string>>;
}

/** Typecheck project modules first, then prepare ESM build inputs. This function does not execute them. */
export function checkRuntimeScripts(
  sources: Readonly<Record<string, string>>,
  declarations: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
  entries: readonly string[] = Object.keys(sources),
  analyzeOnly = false
): CheckedRuntimeScripts {
  const files = new Map(Object.entries(libraries));
  for (const [path, content] of Object.entries(declarations)) {
    files.set("/project/" + path.slice("declare/runtime/".length), content);
  }
  for (const [path, content] of Object.entries(sources)) {
    if (
      !/\.[jt]s$/.test(path) ||
      /\.d\.ts$/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      path.includes("\\")
    ) {
      throw new Error(`Invalid project script path '${path}'`);
    }
    files.set("/project/assets/" + path, content);
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    checkJs: true,
    strict: true,
    skipLibCheck: true,
    noLib: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    experimentalDecorators: true,
    useDefineForClassFields: true,
    isolatedModules: true,
    verbatimModuleSyntax: true
  };
  options.baseUrl = "/project";
  const host: ts.CompilerHost = {
    getSourceFile: (path, target) => {
      const text = files.get(path);
      return text === undefined ? undefined : ts.createSourceFile(path, text, target, true);
    },
    getDefaultLibFileName: () => "/lib.es2023.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/project",
    getCanonicalFileName: (path) => path,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (path) => files.has(path),
    readFile: (path) => files.get(path),
    directoryExists: () => true
  };
  const program = ts.createProgram(
    [...Object.keys(libraries), ...entries.map((path) => "/project/assets/" + path)],
    options,
    host
  );
  const dependencies: Record<string, string[]> = {};
  const transformedSources: Record<string, string> = {};
  const checker = program.getTypeChecker();
  const resolutions: CheckedRuntimeScripts["resolutions"] = {};
  for (const [path, source] of Object.entries(sources)) {
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    const resolvedImports: Record<string, string> = {};
    for (const imported of imports) {
      const resolved = ts.resolveModuleName(imported.fileName, "/project/assets/" + path, options, host).resolvedModule
        ?.resolvedFileName;
      if (resolved?.startsWith("/project/assets/"))
        resolvedImports[imported.fileName] = resolved.slice("/project/assets/".length);
    }
    resolutions[path] = resolvedImports;
    const references = Object.values(resolvedImports).filter((path) => Object.hasOwn(sources, path));
    const ast = program.getSourceFile("/project/assets/" + path);
    const assetFunctions = new Set<ts.Symbol>(),
      namespaces = new Set<ts.Symbol>();
    for (const statement of ast?.statements ?? []) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== "@galacean/editor-assets"
      )
        continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const binding of bindings.elements) {
          if ((binding.propertyName ?? binding.name).text === "assetUrl") {
            const symbol = checker.getSymbolAtLocation(binding.name);
            if (symbol) assetFunctions.add(symbol);
          }
        }
      if (bindings && ts.isNamespaceImport(bindings)) {
        const symbol = checker.getSymbolAtLocation(bindings.name);
        if (symbol) namespaces.add(symbol);
      }
    }
    // Shorthand properties and local exports have their own symbols. Resolve
    // the referenced local binding so neither can hide an imported SDK value.
    const bindingSymbol = (node: ts.Node) =>
      ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : ts.isExportSpecifier(node.parent)
          ? checker.getExportSpecifierLocalTargetSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
    const isAssetFunction = (node: ts.Node) =>
      (ts.isIdentifier(node) && assetFunctions.has(bindingSymbol(node)!)) ||
      (ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.name.text === "assetUrl" &&
        namespaces.has(bindingSymbol(node.expression)!));
    const replacements: { start: number; end: number; text: string }[] = [];
    const assetImportError = () =>
      new Error(
        `assetUrl in '${path}' requires a static import from '@galacean/editor-assets' and a direct call with a literal virtual path; reexports and dynamic imports of this module are unsupported`
      );
    const visit = (node: ts.Node) => {
      // Asset literals must be visible at their call site. Reexporting the SDK or
      // obtaining its namespace asynchronously would bypass both rewriting and
      // dependency inspection. Apply this gate in analyzeOnly mode as well.
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "@galacean/editor-assets"
      ) {
        throw assetImportError();
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0];
        if (!specifier || !ts.isStringLiteralLike(specifier)) {
          throw new Error(`Dynamic import in '${path}' requires a literal module specifier`);
        }
        if (specifier.text === "@galacean/editor-assets") throw assetImportError();
      }
      if (
        ts.isIdentifier(node) &&
        namespaces.has(bindingSymbol(node)!) &&
        !ts.isNamespaceImport(node.parent) &&
        !(
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.expression === node &&
          node.parent.name.text === "assetUrl"
        )
      ) {
        throw new Error(`assetUrl in '${path}' must be called directly with a literal virtual path`);
      }
      if (ts.isCallExpression(node) && isAssetFunction(node.expression)) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]))
          throw new Error(`assetUrl in '${path}' requires one literal virtual path`);
        const argument = node.arguments[0],
          target = resolveAssetPath(argument.text, path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
        references.push(target);
        replacements.push({ start: argument.getStart(ast), end: argument.end, text: JSON.stringify(target) });
      } else if (
        isAssetFunction(node) &&
        !ts.isImportSpecifier(node.parent) &&
        !(ts.isCallExpression(node.parent) && node.parent.expression === node)
      ) {
        throw new Error(`assetUrl in '${path}' must be called directly with a literal virtual path`);
      }
      ts.forEachChild(node, visit);
    };
    if (ast) visit(ast);
    let transformed = source;
    for (const change of replacements.sort((a, b) => b.start - a.start))
      transformed = transformed.slice(0, change.start) + change.text + transformed.slice(change.end);
    transformedSources[path] = transformed;
    dependencies[path] = [...new Set(references)];
  }
  if (analyzeOnly) return { sources: {}, dependencies, resolutions };
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length) {
    throw new RuntimeScriptPreparationError(
      "check",
      diagnostics
        .map((d) => {
          const location = d.file?.getLineAndCharacterOfPosition(d.start ?? 0);
          const prefix =
            d.file && location
              ? `${d.file.fileName.replace("/project/assets/", "").replace("/project/", "")}(${location.line + 1},${location.character + 1}): `
              : "";
          return `${prefix}error TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
        })
        .join("\n")
    );
  }
  return {
    sources: Object.fromEntries(
      Object.entries(transformedSources).filter(([path]) => program.getSourceFile("/project/assets/" + path))
    ),
    dependencies,
    resolutions
  };
}
