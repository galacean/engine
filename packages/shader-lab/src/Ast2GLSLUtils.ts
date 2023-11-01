import { AstNode, IPassAstContent, PassPropertyAssignmentAstNode, StructAstNode } from "./ast-node";
import { DiagnosticSeverity } from "./Constants";
import RuntimeContext from "./RuntimeContext";

export class Ast2GLSLUtils {
  static stringifyVertexFunction(
    passAst: AstNode<IPassAstContent>,
    vertexFnProperty: PassPropertyAssignmentAstNode,
    context: RuntimeContext
  ): string {
    const vertFnAst = passAst.content.functions.find(
      (fn) => fn.content.name === vertexFnProperty.content.value.content.variable
    );
    if (!vertFnAst) {
      context.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `Not found vertex shader definition: ${vertexFnProperty.content.value}`,
        range: vertexFnProperty.position
      });
      return "";
    }
    context.setMainFnAst(vertFnAst);
    context.varyingTypeAstNode = vertFnAst.content.returnType;

    // parse varying variables
    const varyingStructAstNode = context.findGlobal(vertFnAst.content.returnType.content.text)?.ast as StructAstNode;
    if (!varyingStructAstNode) {
      context.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: "no varying struct definition",
        range: vertFnAst.content.returnType.position
      });
      return "";
    }
    context.varyingStructInfo.structAstNode = varyingStructAstNode;
    context.varyingStructInfo.reference = varyingStructAstNode.content.variables.map((v) => ({
      referenced: false,
      property: v,
      text: `varying ${v.content.type.serialize(context)} ${v.content.variableNode.serialize(context)}`
    }));

    // parsing attribute variables
    vertFnAst.content.args.forEach((arg) => {
      const type = arg.content.type;
      if (type.isCustom) {
        const structAstNode = context.findGlobal(type.text).ast as StructAstNode;
        if (!structAstNode) {
          context.diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: "no attribute struct definition",
            range: arg.position
          });
          return;
        } else {
          const reference = structAstNode.content.variables.map((v) => ({
            referenced: false,
            property: v,
            text: `attribute ${v.content.type.serialize(context)} ${v.content.variableNode.serialize(context)}`
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

    // There may be global variable references in conditional macro statement, so it needs to be serialized first.
    const conditionalMacroText = context.getMacroText(passAst.content.conditionalMacros);

    const vertexFnStr = vertFnAst.serialize(context);
    return [
      context.getMacroText(passAst.content.macros),
      context.getAttribText(),
      context.getVaryingText(),
      context.getGlobalText(),
      conditionalMacroText,
      vertexFnStr
    ].join("\n");
  }

  static stringifyFragmentFunction(
    passAst: AstNode<IPassAstContent>,
    fragmentFnProperty: PassPropertyAssignmentAstNode,
    context: RuntimeContext
  ): string {
    const fragFnAst = passAst.content.functions.find(
      (fn) => fn.content.name === fragmentFnProperty.content.value.content.variable
    );
    if (!fragFnAst) {
      context.diagnostics.push({
        severity: DiagnosticSeverity.Error,
        message: `Not found fragment shader definition: ${fragmentFnProperty.content.value}`,
        range: fragmentFnProperty.position
      });
      return "";
    }
    context.setMainFnAst(fragFnAst);

    context.varyingStructInfo.objectName = fragFnAst.content.args[0].content.name;
    const fragmentFnStr = fragFnAst.serialize(context);

    // There may be global variable references in conditional macro statement, so it needs to be serialized first.
    const conditionalMacroText = context.getMacroText(passAst.content.conditionalMacros);

    return [
      context.getMacroText(passAst.content.macros),
      context.getVaryingText(),
      context.getGlobalText(),
      conditionalMacroText,
      fragmentFnStr
    ].join("\n");
  }
}
