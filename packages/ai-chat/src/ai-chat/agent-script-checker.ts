import { analyzeAgentScript } from "./agent-script-syntax";
import * as ts from "typescript";
import type { AgentApiDeclarationModule, AgentScriptError, AgentValue } from "./agent-types";

const environment = `declare const console: {
  log(...values: unknown[]): void; info(...values: unknown[]): void;
  warn(...values: unknown[]): void; error(...values: unknown[]): void; debug(...values: unknown[]): void;
};`;

// Keep compiler diagnostics, but bound the additional type exploration on failures.
const MAX_REPAIR_CONTEXTS = 3;

/** In-memory JS checker. Owned by a dedicated Worker; never executes supplied code. */
export class AgentJavaScriptChecker {
  private files = new Map<string, { source: string; version: number }>();
  private projectVersion = 0;
  private readonly service: ts.LanguageService;

  constructor(libraries: Readonly<Record<string, string>>) {
    for (const [name, source] of Object.entries(libraries)) this.files.set(name, { source, version: 0 });
    this.files.set("/environment.d.ts", { source: environment, version: 0 });
    const options: ts.CompilerOptions = {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strictNullChecks: true,
      noImplicitAny: false,
      skipLibCheck: true,
      types: [],
      noLib: true
    };
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => options,
      getScriptFileNames: () => [...this.files.keys()],
      getScriptVersion: (name) => String(this.files.get(name)?.version ?? 0),
      getProjectVersion: () => String(this.projectVersion),
      getScriptSnapshot: (name) => {
        const file = this.files.get(name);
        return file ? ts.ScriptSnapshot.fromString(file.source) : undefined;
      },
      getCurrentDirectory: () => "/",
      getDefaultLibFileName: () => "/lib.es2023.d.ts",
      fileExists: (name) => this.files.has(name),
      readFile: (name) => this.files.get(name)?.source,
      directoryExists: () => true,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n"
    };
    this.service = ts.createLanguageService(host);
  }

  check(
    source: string,
    declarations: readonly Pick<AgentApiDeclarationModule, "id" | "source">[]
  ): AgentScriptError | undefined {
    if (new TextEncoder().encode(source).byteLength > 32 * 1024)
      return {
        code: "SCRIPT_UNSUPPORTED",
        phase: "check",
        message: "Agent Script exceeds 32768 bytes"
      };
    const syntax = analyzeAgentScript(source);
    if (syntax.error?.code === "SCRIPT_UNSUPPORTED") return { ...syntax.error, phase: "check" };
    // Match the runtime's async execution context. Only the checker needs a
    // synthetic declaration; all public locations still refer to the input.
    const lineOffset = 1;
    const checkedSource = `(async function () {\n${source}\n});`;
    const next = new Map(declarations.map((module) => [`/api/${module.id}`, module.source]));
    for (const name of this.files.keys()) {
      if (name.startsWith("/api/") && !next.has(name)) this.files.delete(name);
    }
    next.set("/execute.js", checkedSource);
    for (const [name, text] of next) {
      const old = this.files.get(name);
      if (old?.source !== text) this.files.set(name, { source: text, version: (old?.version ?? 0) + 1 });
    }
    this.projectVersion++;
    const diagnostics = [
      ...this.service.getSyntacticDiagnostics("/execute.js"),
      ...this.service.getSemanticDiagnostics("/execute.js")
    ].filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (!diagnostics.length) return syntax.error ? { ...syntax.error, phase: "check" } : undefined;
    const describe = (diagnostic: ts.DiagnosticRelatedInformation) => {
      const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const lineStarts = diagnostic.file?.getLineStarts();
      const lineStart = position && lineStarts ? lineStarts[position.line] : 0;
      return {
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ...(diagnostic.file ? { file: diagnostic.file.fileName } : {}),
        ...(position && diagnostic.file
          ? {
              sourceLine: diagnostic.file.text
                .slice(
                  lineStart,
                  Math.min(lineStart + 1000, lineStarts![position.line + 1] ?? diagnostic.file.text.length)
                )
                .replace(/[\r\n]+$/, "")
            }
          : {}),
        ...(position
          ? {
              line: position.line + 1 - (diagnostic.file?.fileName === "/execute.js" ? lineOffset : 0),
              column: position.character + 1
            }
          : {})
      };
    };
    const typeChecker = this.service.getProgram()!.getTypeChecker();
    const items = diagnostics.slice(0, 12).map((diagnostic, index) => ({
      ...describe(diagnostic),
      ...(index < MAX_REPAIR_CONTEXTS ? repairContext(diagnostic, typeChecker) : {}),
      ...(diagnostic.relatedInformation?.length
        ? {
            relatedInformation: diagnostic.relatedInformation.slice(0, 12).map(describe),
            relatedInformationTotal: diagnostic.relatedInformation.length,
            relatedInformationTruncated: diagnostic.relatedInformation.length > 12
          }
        : {})
    }));
    const first = items[0]!;
    return {
      code: "SCRIPT_CHECK_FAILED",
      phase: "check",
      message: items
        .map(
          (item) =>
            `${(item.file ?? "execute.js").replace(/^\//, "")}(${item.line ?? "?"},${item.column ?? "?"}): error TS${item.code}: ${item.message}`
        )
        .join("\n"),
      location: first.line
        ? { source: "execute.code", line: first.line, column: first.column! }
        : { source: "execute.code" },
      details: {
        diagnostics: items,
        totalDiagnostics: diagnostics.length,
        truncated: diagnostics.length > items.length
      }
    };
  }

  dispose(): void {
    this.service.dispose();
    this.files.clear();
  }
}

/** Explain actual compiler evidence without weakening checks or inventing API names. */
function repairContext(diagnostic: ts.Diagnostic, checker: ts.TypeChecker): Record<string, AgentValue> {
  if (!diagnostic.file || diagnostic.start === undefined) return {};
  if (
    ![2322, 2345, 2339, 2551, 2353, 2561, 2769, 18046, 18047, 18048, 18049, 2531, 2532, 2533].includes(diagnostic.code)
  )
    return {};
  let node: ts.Node = diagnostic.file;
  const position = diagnostic.start;
  const descend = (parent: ts.Node) => {
    ts.forEachChild(parent, (child) => {
      if (child.getStart(diagnostic.file) <= position && child.end > position) {
        node = child;
        descend(child);
      }
    });
  };
  descend(node);
  const typeText = (type: ts.Type) => checker.typeToString(type, node, ts.TypeFormatFlags.InTypeAlias).slice(0, 400);
  if (diagnostic.code === 2339 || diagnostic.code === 2551) {
    let receiverNode: ts.Node | undefined;
    if (ts.isPropertyAccessExpression(node.parent)) {
      receiverNode = node.parent.expression;
    } else if (ts.isBindingElement(node.parent) && ts.isObjectBindingPattern(node.parent.parent)) {
      receiverNode = node.parent.parent;
    }
    if (receiverNode) {
      const receiverType = checker.getTypeAtLocation(receiverNode);
      const properties = checker.getPropertiesOfType(receiverType);
      const accessedName = ts.isPropertyAccessExpression(node.parent)
        ? node.parent.name.text
        : ts.isBindingElement(node.parent)
          ? node.parent.propertyName
            ? ts.isIdentifier(node.parent.propertyName) || ts.isStringLiteral(node.parent.propertyName)
              ? node.parent.propertyName.text
              : undefined
            : ts.isIdentifier(node.parent.name)
              ? node.parent.name.text
              : undefined
          : undefined;
      const isUnionWithNonMatchingMembers =
        receiverType.isUnion() &&
        (properties.length === 0 ||
          receiverType.types.some((m) =>
            Boolean(
              m.flags &
                (ts.TypeFlags.StringLike |
                  ts.TypeFlags.NumberLike |
                  ts.TypeFlags.BooleanLike |
                  ts.TypeFlags.Null |
                  ts.TypeFlags.Undefined)
            )
          ) ||
          (accessedName !== undefined &&
            receiverType.types.some((m) => Boolean(checker.getPropertyOfType(m, accessedName)))));
      if (isUnionWithNonMatchingMembers) {
        const memberProps: ts.Symbol[] = [];
        const seen = new Set<string>();
        const discriminantHints: string[] = [];
        let hasRefMember = false;
        let hasArrayMember = false;
        for (const member of receiverType.types) {
          if (member.flags & (ts.TypeFlags.Primitive | ts.TypeFlags.Null | ts.TypeFlags.Undefined)) continue;
          if (checker.isArrayType(member)) {
            hasArrayMember = true;
            continue;
          }
          if (checker.getPropertyOfType(member, "$ref")) hasRefMember = true;
          if (accessedName && checker.getPropertyOfType(member, accessedName)) {
            for (const discKey of ["kind", "type", "status"] as const) {
              const discSym = checker.getPropertyOfType(member, discKey);
              if (!discSym) continue;
              const discType = checker.getTypeOfSymbolAtLocation(discSym, receiverNode);
              if (discType.isStringLiteral()) {
                discriminantHints.push(`${discKey} === ${JSON.stringify(discType.value)}`);
                break;
              }
            }
          }
          for (const prop of checker.getPropertiesOfType(member)) {
            if (!seen.has(prop.name)) {
              seen.add(prop.name);
              memberProps.push(prop);
            }
          }
        }
        const uniqueDiscs = [...new Set(discriminantHints)];
        const hint = uniqueDiscs.length
          ? `Receiver is a discriminated union. Narrow it first with ${uniqueDiscs.map((d) => `v.${d}`).join(" or ")} before accessing '${accessedName}'.`
          : hasRefMember
            ? `Receiver is a union including primitives${hasArrayMember ? ", arrays" : ""} and {$ref} asset refs. Narrow it first with typeof v === "object" && v !== null && !Array.isArray(v) && !("$ref" in v)${accessedName ? ` (or "${accessedName}" in v)` : ""} before reading properties.`
            : 'Receiver is a union type (e.g. primitive | record | array). Narrow it first with typeof v === "object" && v !== null && !Array.isArray(v) (and key/discriminant checks like "prop" in v) before reading properties.';
        return {
          receiver: receiverNode.getText().slice(0, 300),
          receiverType: typeText(receiverType),
          ...(memberProps.length
            ? {
                availableProperties: memberProps.slice(0, 16).map((property) => ({
                  name: property.name,
                  type: typeText(checker.getTypeOfSymbolAtLocation(property, receiverNode!))
                })),
                totalProperties: memberProps.length
              }
            : { availableProperties: [], totalProperties: 0 }),
          hint
        };
      }
      return {
        receiver: receiverNode.getText().slice(0, 300),
        receiverType: typeText(receiverType),
        availableProperties: properties.slice(0, 20).map((property) => ({
          name: property.name,
          type: typeText(checker.getTypeOfSymbolAtLocation(property, receiverNode!))
        })),
        totalProperties: properties.length
      };
    }
  }
  if (diagnostic.code === 2353 || diagnostic.code === 2561) {
    let literal: ts.Node | undefined = node;
    while (literal && !ts.isObjectLiteralExpression(literal)) literal = literal.parent;
    if (!literal || !ts.isObjectLiteralExpression(literal)) return {};
    const expected = checker.getContextualType(literal);
    if (!expected) return {};
    const seen = new Set<string>();
    const propertySymbols: ts.Symbol[] = [];
    const members = expected.isUnion() ? expected.types : [expected];
    for (const member of members) {
      if (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
      for (const property of checker.getPropertiesOfType(member)) {
        if (!seen.has(property.name)) {
          seen.add(property.name);
          propertySymbols.push(property);
        }
      }
    }
    return {
      invalidProperty: node.getText().slice(0, 100),
      allowedProperties: propertySymbols.slice(0, 16).map((property) => ({
        name: property.name,
        optional: Boolean(property.flags & ts.SymbolFlags.Optional),
        type: typeText(checker.getTypeOfSymbolAtLocation(property, literal))
      })),
      totalProperties: propertySymbols.length
    };
  }
  if (diagnostic.code === 2769) {
    let call: ts.Node | undefined = node;
    while (call && !ts.isCallExpression(call)) call = call.parent;
    if (!call || !ts.isCallExpression(call)) return {};
    const signatures = checker.getSignaturesOfType(checker.getTypeAtLocation(call.expression), ts.SignatureKind.Call);
    return {
      callee: call.expression.getText().slice(0, 200),
      overloads: signatures
        .slice(0, 4)
        .map((signature) => checker.signatureToString(signature, call, ts.TypeFormatFlags.InTypeAlias).slice(0, 300)),
      totalOverloads: signatures.length
    };
  }
  if (diagnostic.code === 18046)
    return {
      hint: 'Value is typed as unknown. Narrow it first using typeof / Array.isArray / discriminant checks (e.g. kind === "structured" and typeof data === "object" && data !== null) before accessing properties.'
    };
  if ([18047, 18048, 18049, 2531, 2532, 2533].includes(diagnostic.code))
    return {
      hint: "Check this value for null/undefined in the callback where it is used. Filtering another array does not necessarily narrow an object's nullable properties."
    };
  // An object-property diagnostic points at its name; its initializer has the contextual API type.
  const value = ts.isPropertyAssignment(node.parent) && node.parent.name === node ? node.parent.initializer : node;
  if (!ts.isExpression(value)) return {};
  const expected = checker.getContextualType(value);
  if (!expected) return {};
  const actual = checker.getTypeAtLocation(value);
  const literalType = checker.isArrayType(expected) ? (expected.getNumberIndexType() ?? expected) : expected;
  const isStringLiteralUnion = (type: ts.Type) =>
    type.isUnion() && type.types.every((member) => Boolean(member.flags & ts.TypeFlags.StringLiteral));
  const literalUnion = isStringLiteralUnion(literalType);
  let widenedObjectLiteralProperty = false;
  if (!literalUnion) {
    for (const expectedProp of checker.getPropertiesOfType(expected)) {
      const expectedPropType = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(expectedProp, value));
      if (!isStringLiteralUnion(expectedPropType)) continue;
      const actualProp = checker.getPropertyOfType(actual, expectedProp.name);
      if (actualProp && checker.getTypeOfSymbolAtLocation(actualProp, value).flags & ts.TypeFlags.String) {
        widenedObjectLiteralProperty = true;
        break;
      }
    }
  }
  const nonNullableExpected = checker.getNonNullableType(expected);
  const isTupleMismatch =
    checker.isTupleType(nonNullableExpected) && checker.isArrayType(actual) && !checker.isTupleType(actual);
  const expectedObjProps =
    !literalUnion &&
    !isTupleMismatch &&
    !checker.isArrayType(nonNullableExpected) &&
    !(nonNullableExpected.flags & ts.TypeFlags.Primitive)
      ? checker.getPropertiesOfType(nonNullableExpected)
      : [];
  return {
    actualType: typeText(actual),
    expectedType: typeText(expected),
    ...(expectedObjProps.length
      ? {
          expectedProperties: expectedObjProps.slice(0, 16).map((property) => ({
            name: property.name,
            optional: Boolean(property.flags & ts.SymbolFlags.Optional),
            type: typeText(checker.getTypeOfSymbolAtLocation(property, value))
          })),
          totalExpectedProperties: expectedObjProps.length
        }
      : {}),
    ...(isTupleMismatch
      ? {
          hint: `Plain JS array variables widen to ${typeText(actual)}. Pass a fixed-length tuple literal matching ${typeText(nonNullableExpected)} directly inline, or annotate the variable with JSDoc /** @type {${typeText(nonNullableExpected)}} */.`
        }
      : literalUnion
        ? {
            hint: "Use one of the declared string literals. If a loop variable was widened to string, annotate its source array with JSDoc using the declared literal union; do not cast to any."
          }
        : widenedObjectLiteralProperty
          ? {
              hint: "String properties in plain JS variables widen to string and fail literal union checks. Reuse returned item.ref objects directly, inline the literal object in the API call, or annotate with JSDoc."
            }
          : {})
  };
}
