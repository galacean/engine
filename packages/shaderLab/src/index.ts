import RuntimeContext from "./context";
import { ShaderParser } from "./parser";
import ShaderVisitor, { parser } from "./visitor";

export { ShaderParser, parser, ShaderVisitor };

export function parseShader(input: string) {
  console.log("parsing ...");
  parser.parse(input);
  const cst = (parser as any).RuleShader();
  if (parser.errors.length > 0) {
    console.log(parser.errors);
    throw parser.errors;
  }

  const visitor = new ShaderVisitor();
  const ast = visitor.visit(cst);
  console.log("parsing done");

  const context = new RuntimeContext();
  const shaderInfo = context.parse(ast);
  return shaderInfo;
}
