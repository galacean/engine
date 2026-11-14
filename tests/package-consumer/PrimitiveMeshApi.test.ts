import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it.each(["PrimitiveMeshApi", "PrimitiveMeshAsset"])("type-checks %s and rejects invalid inputs", (name) => {
  const fixture = fileURLToPath(new URL(`./fixtures/${name}.ts`, import.meta.url));
  const program = ts.createProgram([fixture], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const line =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
        : 0;
    return `${line}: ${message}`;
  });
  expect(diagnostics).toEqual([]);

  if (name === "PrimitiveMeshApi") {
    const source = program.getSourceFile(fixture)!;
    const checker = program.getTypeChecker();
    const meshes = source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => Array.from(statement.declarationList.declarations))
      .find((declaration) => declaration.name.getText(source) === "meshes");
    if (!meshes?.initializer || !ts.isArrayLiteralExpression(meshes.initializer)) {
      throw new Error("PrimitiveMeshApi must list its valid calls in the meshes array.");
    }
    const calls = meshes.initializer.elements.filter(ts.isCallExpression);
    const constructor = (calls[0].expression as ts.PropertyAccessExpression).expression;
    const factories = checker
      .getTypeAtLocation(constructor)
      .getProperties()
      .filter((property) => property.name.startsWith("create"));

    for (const factory of factories) {
      const signatures = checker.getTypeOfSymbolAtLocation(factory, source).getCallSignatures();
      expect(signatures, `Unexpected overload count: ${factory.name}`).toHaveLength(
        factory.name === "createExtrudedPolygon" ? 2 : 1
      );
      const examples = calls.filter(
        (call) => ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === factory.name
      );
      for (const signature of signatures) {
        const overloadExamples = examples.filter(
          (call) => checker.getResolvedSignature(call)?.getDeclaration() === signature.getDeclaration()
        );
        expect(
          overloadExamples.length,
          `Missing overload example: ${factory.name}${checker.signatureToString(signature)}`
        ).toBeGreaterThan(0);

        const optionsIndex = signature.getParameters().findIndex((parameter) => parameter.name === "options");
        const optionsType = checker.getNonNullableType(
          checker.getTypeOfSymbolAtLocation(signature.getParameters()[optionsIndex], source)
        );
        const optionTypes = optionsType.isUnion() ? optionsType.types : [optionsType];
        const inputNames = signature
          .getParameters()
          .slice(0, optionsIndex)
          .map((parameter) => parameter.name);
        for (const parameter of signature.getDeclaration()!.parameters.slice(0, optionsIndex)) {
          expect(
            parameter.questionToken,
            `Optional core input: ${factory.name}.${parameter.name.getText()}`
          ).toBeUndefined();
          expect(
            parameter.initializer,
            `Default core input: ${factory.name}.${parameter.name.getText()}`
          ).toBeUndefined();
        }
        const documentedFields = new Set(
          overloadExamples.flatMap((call) => {
            const options = call.arguments[optionsIndex];
            return options
              ? checker
                  .getTypeAtLocation(options)
                  .getProperties()
                  .map((field) => field.name)
              : [];
          })
        );
        for (const type of optionTypes) {
          for (const field of type.getProperties()) {
            expect(field.flags & ts.SymbolFlags.Optional, `Required option: ${factory.name}.${field.name}`).not.toBe(0);
            expect(inputNames.includes(field.name), `Duplicated core input: ${factory.name}.${field.name}`).toBe(false);
            expect(documentedFields.has(field.name), `Missing option example: ${factory.name}.${field.name}`).toBe(
              true
            );
          }
        }
        const parameters = signature.getDeclaration()!.parameters;
        const minimum = parameters.filter((parameter) => !parameter.questionToken && !parameter.initializer).length;
        for (let count = minimum; count <= parameters.length; count++) {
          expect(
            overloadExamples.some((call) => call.arguments.length === count),
            `Missing optional-argument example: ${factory.name}${checker.signatureToString(signature)} with ${count} arguments`
          ).toBe(true);
        }
      }
    }
  }
});
