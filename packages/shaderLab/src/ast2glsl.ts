import { PassPropertyAssignmentAstNode, StructAstNode } from "./astNode";
import { DiagnosticSeverity } from "./constants";
import RuntimeContext from "./context";

export function stringifyVertexFunction(
  vertexFnProperty: PassPropertyAssignmentAstNode,
  context: RuntimeContext
): string {
  const vertFnAst = context.passAst.content.functions.find((fn) => fn.content.name === vertexFnProperty.content.value);
  if (!vertFnAst) {
    context.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      message: "not found vertex shader definition",
      token: vertexFnProperty.position
    });
    return "";
  }
  context.setMainFnAst(vertFnAst);
  context.varyingTypeAstNode = vertFnAst.content.returnType;

  // parse varying variables
  const varyingStructAstNode = context.findGlobal(vertFnAst.content.returnType.content.text) as StructAstNode;
  if (!varyingStructAstNode) {
    context.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      message: "no varying struct definition",
      token: vertFnAst.content.returnType.position
    });
    return "";
  }
  context.varyingStructInfo.structAstNode = varyingStructAstNode;
  context.varyingStructInfo.reference = varyingStructAstNode.content.variables.map((v) => ({
    referenced: false,
    property: v,
    text: `varying ${v.content.type.serialize(context)} ${v.content.variable}`
  }));

  // parsing attribute variables
  vertFnAst.content.args.forEach((arg) => {
    const type = arg.content.type;
    if (type.isCustom) {
      const structAstNode = context.findGlobal(type.text) as StructAstNode;
      if (!structAstNode) {
        context.diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: "no attribute struct definition",
          token: arg.position
        });
        return;
      } else {
        const reference = structAstNode.content.variables.map((v) => ({
          referenced: false,
          property: v,
          text: `attribute ${v.content.type.serialize(context)} ${v.content.variable}`
        }));
        context.attributeStructListInfo.push({ objectName: arg.content.name, structAstNode, reference });
      }
    } else {
      context.attributesVariableListInfo.push({
        name: arg.content.name,
        astNode: arg,
        referenced: false,
        text: `attribute ${type.text} ${arg.content.name}`
      });
    }
  });

  const vertexFnStr = vertFnAst.serialize(context);

  return [context.getAttribText(), context.getGlobalText(), context.getVaryingText(), vertexFnStr].join("\n");
}

export function stringifyFragmentFunction(
  fragmentFnProperty: PassPropertyAssignmentAstNode,
  context: RuntimeContext
): string {
  const fragFnAst = context.passAst.content.functions.find(
    (fn) => fn.content.name === fragmentFnProperty.content.value
  );
  if (!fragFnAst) {
    context.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      message: "not found fragment shader definition",
      token: fragmentFnProperty.position
    });
    return "";
  }
  context.setMainFnAst(fragFnAst);

  const fragmentFnStr = fragFnAst.serialize(context);
  return [context.getGlobalText(), fragmentFnStr].join("\n");
}
