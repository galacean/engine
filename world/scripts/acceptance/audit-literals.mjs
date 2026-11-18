import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.resolve(root, "../engine-next/world/gallery");
const map = JSON.parse(fs.readFileSync(path.join(root, "world/migration/files.json"), "utf8"));
const rows = [];
function literals(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const result = [];
  function visit(n) {
    if (ts.isStringLiteralLike(n)) {
      const p = n.parent;
      let module = false;
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) module = true;
      if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
        const text = p.expression.getText(sf);
        if (["import", "require", "URL", "import.meta.glob"].includes(text)) module = true;
      }
      result.push({
        text: n.text,
        module,
        line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        context: p.getText(sf).slice(0, 280)
      });
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return result;
}
for (const [old, current] of Object.entries(map)) {
  if (!/\.[cm]?[jt]sx?$/.test(current) || !fs.existsSync(path.join(source, old))) continue;
  const a = literals(path.join(source, old)),
    b = literals(path.join(root, current));
  if (a.length !== b.length) continue;
  for (let i = 0; i < a.length; i++)
    if (a[i].text !== b[i].text && !a[i].module && !b[i].module)
      rows.push({ file: current, line: b[i].line, before: a[i].text, after: b[i].text, context: b[i].context });
}
fs.writeFileSync(path.join(root, "world/.acceptance/literal-changes.json"), JSON.stringify(rows, null, 2));
console.log(
  JSON.stringify(
    rows.filter((r) =>
      /startsWith|endsWith|\.slice\(|\.split\(|\.replace\(|\.includes\(|===|!==|\.length/.test(r.context)
    ),
    null,
    2
  )
);
console.log("Non-module literal changes:", rows.length);
