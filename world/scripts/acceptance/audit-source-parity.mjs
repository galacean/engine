import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import prettier from 'prettier';
const root = path.resolve(import.meta.dirname, '../../..');
const source = path.resolve(root, '../engine-next/world/gallery');
const materialized = path.resolve(root, '../engine-next/world/.materialized/engine/world-gallery');
const mapping = JSON.parse(fs.readFileSync(path.join(root, 'world/migration/files.json')));
const reverse = new Map(Object.entries(mapping).map(([a,b]) => [b,a]));
const sourceFiles = new Set(Object.keys(mapping));
function canonical(file, value, original) {
  if (!value.startsWith('.') && !value.startsWith('@galacean/engine-')) return value;
  const query = value.indexOf('?'), suffix = query < 0 ? '' : value.slice(query);
  let request = query < 0 ? value : value.slice(0, query);
  if (!original && request.startsWith('@galacean/engine-')) {
    const match = /^@galacean\/engine-([^/]+)\/(.*)$/.exec(request);
    if (!match) return value;
    request = `packages/${match[1]}/src/${match[2]}`;
  } else if (request.startsWith('.')) request = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
  else return value;
  for (const candidate of [request, ...['.ts','.tsx','.js','.mjs','.cjs','.json','/index.ts','/index.js'].map(ext => request+ext)]) {
    const old = original ? (sourceFiles.has(candidate) ? candidate : undefined) : reverse.get(candidate);
    if (old) return `migration:${old}${suffix}`;
  }
  return value;
}
async function syntax(text, file, original) {
  text = await prettier.format(text, {parser:"typescript",printWidth:120});
  if (!file.endsWith('.d.ts')) text = ts.transpileModule(text, {
    fileName: file,
    compilerOptions: {target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, experimentalDecorators: true, useDefineForClassFields: false}
  }).outputText;
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isParenthesizedExpression(node)) return visit(node.expression);
    if (ts.isEmptyStatement(node)) return null;
    if (node.parent?.name === node && (ts.isIdentifier(node) || ts.isStringLiteral(node))) return ['name',node.text];
    if (ts.isStringLiteralLike(node)) return ['string', canonical(file,node.text,original)];
    if (ts.isNumericLiteral(node)) return [node.kind, Number(node.text)];
    const children = [];
    ts.forEachChild(node, child => { const v = visit(child); if (v !== null) children.push(v); });
    return [node.kind, ...((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) ? [node.operator] : []), ...(ts.isVariableDeclarationList(node) ? [node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)] : []), ...(node.isTypeOnly ? ['type-only'] : []), ...([ts.SyntaxKind.Identifier, ts.SyntaxKind.PrivateIdentifier, ts.SyntaxKind.RegularExpressionLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText].includes(node.kind) ? [node.getText(tree)] : children)];
  }
  return JSON.stringify(visit(tree));
}
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const result = { compared: 0, exact: 0, syntaxWithRelocatedPaths: 0, differences: [], materializedDrift: [] };
for (const [old,current] of Object.entries(mapping)) {
  const a = fs.readFileSync(path.join(source,old)), b = fs.readFileSync(path.join(root,current));
  result.compared++;
  const baseline = path.join(materialized,old);
  if (!fs.existsSync(baseline) || !a.equals(fs.readFileSync(baseline))) result.materializedDrift.push(old);
  if (a.equals(b)) { result.exact++; continue; }
  const code = /\.[cm]?[jt]sx?$/.test(old);
  const sa = code ? await syntax(a.toString(),old,true) : undefined, sb = code ? await syntax(b.toString(),current,false) : undefined;
  if (code && sa === sb) {
    result.syntaxWithRelocatedPaths++; continue;
  }
  let detail;
  if (/\.[cm]?[jt]sx?$/.test(old)) {
    const aa=JSON.parse(sa),bb=JSON.parse(sb);
    function first(a,b,at='') {
      if(JSON.stringify(a)===JSON.stringify(b))return;
      if(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length) {
        for(let i=0;i<a.length;i++){const v=first(a[i],b[i],at+'/'+i);if(v)return v;}
      }
      return {at,source:JSON.stringify(a).slice(0,1200),target:JSON.stringify(b).slice(0,1200)};
    }
    detail=first(aa,bb);
  }
  result.differences.push({ source: old, target: current, sourceHash: hash(a), targetHash: hash(b),detail });
}
const native = [];
for (const { original,replacement } of JSON.parse(fs.readFileSync(path.join(root,'packages/modify/native-overrides.json')))) {
  const a = fs.readFileSync(path.resolve(materialized,'..',original)), b = fs.readFileSync(path.join(root,replacement));
  if (!a.equals(b)) native.push({original,replacement,syntaxEqual: /\.[cm]?[jt]sx?$/.test(original) && (await syntax(a.toString(),original,true)) === (await syntax(b.toString(),original,true)),sourceHash:hash(a),targetHash:hash(b)});
}
result.nativeDifferences = native;
const out = path.join(root,process.env.PARITY_OUTPUT || 'world/.acceptance/source-parity.json');
fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,differences:result.differences.map(x=>x.target),nativeDifferences:native.map(x=>x.replacement)},null,2));
