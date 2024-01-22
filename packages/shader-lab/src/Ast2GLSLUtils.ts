import {
  AstNode,
  DeclarationWithoutAssignAstNode,
  IPassAstContent,
  PassPropertyAssignmentAstNode,
  StructAstNode,
  StructMacroConditionalFieldAstNode
} from "./ast-node";
import { AstNodeUtils } from "./AstNodeUtils";
import { DiagnosticSeverity } from "./Constants";
import RuntimeContext, { IReferenceStructInfo } from "./RuntimeContext";

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
      context.addDiagnostic({
        severity: DiagnosticSeverity.Error,
        message: `Not found vertex shader definition: ${vertexFnProperty.content.value}`,
        token: vertexFnProperty.position
      });
      return "";
    }
    context.setMainFnAst(vertFnAst);
    context.varyingTypeAstNode = vertFnAst.content.returnType;

    // parse varying variables
    const varyingStructAstNode = context.findGlobal(vertFnAst.content.returnType.content.text)?.ast as StructAstNode;
    if (varyingStructAstNode) {
      context.varyingStructInfo.structAstNode = varyingStructAstNode;
      context.varyingStructInfo.reference = [];
      for (const v of varyingStructAstNode.content.variables) {
        if (v instanceof DeclarationWithoutAssignAstNode) {
          context.varyingStructInfo.reference.push({
            referenced: false,
            property: v,
            text: `varying ${v.content.type.serialize(context)} ${v.content.variableNode.serialize(context)}`
          });
        } else if (v instanceof StructMacroConditionalFieldAstNode) {
          for (const field of v.fields) {
            context.varyingStructInfo.reference.push({
              referenced: false,
              property: field,
              text: `varying ${field.content.type.serialize(context)} ${field.content.variableNode.serialize(context)}`
            });
          }
        }
      }
    }

    // parsing attribute variables
    vertFnAst.content.args.forEach((arg) => {
      const type = arg.content.type;
      if (type.content.isCustom) {
        const structAstNode = context.findGlobal(type.content.text).ast as StructAstNode;
        if (!structAstNode) {
          context.addDiagnostic({
            severity: DiagnosticSeverity.Error,
            message: "no attribute struct definition",
            token: arg.position
          });
          return;
        } else {
          const reference: IReferenceStructInfo["reference"] = [];
          for (const v of structAstNode.content.variables) {
            if (v instanceof DeclarationWithoutAssignAstNode) {
              reference.push({
                referenced: false,
                property: v,
                text: `attribute ${v.content.type.serialize(context)} ${v.content.variableNode.serialize(context)}`
              });
            } else if (v instanceof StructMacroConditionalFieldAstNode) {
              for (const field of v.fields) {
                reference.push({
                  referenced: false,
                  property: field,
                  text: `attribute ${field.content.type.serialize(context)} ${field.content.variableNode.serialize(
                    context
                  )}`
                });
              }
            }
          }

          context.attributeStructListInfo.push({ objectName: arg.content.name, structAstNode, reference });
        }
      } else {
        context.attributesVariableListInfo.push({
          name: arg.content.name,
          astNode: arg,
          referenced: false,
          text: `attribute ${type.content.text} ${arg.content.name}`
        });
      }
    });

    // There may be global variable references in conditional macro statement, so it needs to be serialized first.
    const conditionalMacroText = context.getGlobalMacroText(passAst.content.conditionalMacros);
    const vertexFnStr = vertFnAst.serialize(context);

    const globalFragmentSource = [
      ...context.getGlobalMacroText(passAst.content.macros),
      ...context.getAttribText(),
      ...context.getVaryingText(),
      ...context.getGlobalText(),
      ...conditionalMacroText
    ]
      .sort((a, b) => AstNodeUtils.astSortAsc(a.position, b.position))
      .map((item) => item.text)
      .join("\n");

    return [globalFragmentSource, vertexFnStr].join("\n");
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
      context.addDiagnostic({
        severity: DiagnosticSeverity.Error,
        message: `Not found fragment shader definition: ${fragmentFnProperty.content.value}`,
        token: fragmentFnProperty.position
      });
      return "";
    }
    context.setMainFnAst(fragFnAst);

    context.varyingStructInfo.objectName = fragFnAst.content.args?.[0].content.name;

    // There may be global variable references in conditional macro statement, so it needs to be serialized first.
    const conditionalMacroText = context.getGlobalMacroText(passAst.content.conditionalMacros);
    const fragmentFnStr = fragFnAst.serialize(context);

    const globalFragmentSource = [
      ...context.getGlobalMacroText(passAst.content.macros),
      ...context.getVaryingText(),
      ...context.getGlobalText(),
      ...conditionalMacroText
    ]
      .sort((a, b) => AstNodeUtils.astSortAsc(a.position, b.position))
      .map((item) => item.text)
      .join("\n");

    return [globalFragmentSource, fragmentFnStr].join("\n");
  }
}
