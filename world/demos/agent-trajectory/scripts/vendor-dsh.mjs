// Rebuild the unmodified DSH renderer from a verified upstream checkout.
import { build } from 'esbuild';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const commit = '687f282e8625c6b8d11ff58211a90524be2e4317';
const root = realpathSync(resolve(process.argv[2] ?? ''));
if (!process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== commit) {
  throw new Error(`Pass a DSH checkout at ${commit}`);
}
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim()) {
  throw new Error('Upstream checkout must be clean');
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../dsh');
mkdirSync(out, { recursive: true });
const trajectory = 'packages/client/ui-trajectory/src/client/';
const packages = new Map();
function scan(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name === 'node_modules' || item.name.startsWith('.')) continue;
    const path = join(dir, item.name);
    try { const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')); packages.set(pkg.name, path); } catch {}
    scan(path);
  }
}
scan(join(root, 'packages'));
const entry = [
  ...['TrajectoryTable', 'TrajectoryTimeline', 'TrajectoryToolbar'].map(name => `export { ${name} } from './${trajectory}${name}.tsx';`),
  `export * from './${trajectory}timeline.ts';`,
  `export * from './${trajectory}trajectory-search-index.ts';`,
  `export * from './${trajectory}trajectory-record.ts';`,
  `export * from './${trajectory}code-program.ts';`,
  `export { ImageGallery } from './packages/client/ui-attachment/src/MessageImage.tsx';`,
  ...['base', 'corner-shape', 'design-platform', 'focus', 'scrollbar', 'gradient-shadow-text', 'shiki'].map(name => `import './packages/client/ui-theme/src/styles/${name}.css';`),
].join('\n');
const primitiveExports = {
  'markdown/CodeBlock.tsx': ['CodeBlock'], 'FileTypeIcon.tsx': ['FileTypeIcon', 'fileExtension'],
  'file-size.ts': ['fileSizeText'], 'JsonTree.tsx': ['JsonTree'],
  'markdown/MarkdownText.tsx': ['MarkdownText'], 'markdown/plain-text.ts': ['extractMarkdownPlainText'],
  'StateDot.tsx': ['StateDot'], 'Tooltip.tsx': ['Tooltip'], 'clipboard.ts': ['writeClipboard'],
  'ImageLightbox.tsx': ['ImageLightbox'],
  'icons/index.tsx': ['IconCheckOutlineRegular', 'IconChevronRightOutlineRegular', 'IconCodeOutlineRegular',
    'IconWrapLinesOutlineRegular', 'IconCopyOutlineRegular', 'IconSettingsOutlineRegular',
    'IconSparkleRegular', 'IconUserOutlineRegular', 'IconSearchOutlineRegular',
    'IconLoadingOutlineRegular', 'IconRefreshOutlineRegular'],
};
const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'offline-trajectory.ts' },
  absWorkingDir: root, outfile: join(out, 'renderer.js'), bundle: true, format: 'esm',
  jsx: 'automatic', target: 'es2022', sourcemap: 'linked', sourcesContent: true, metafile: true,
  // Keep third-party dependencies managed by the gallery workspace, not hidden in the vendor bundle.
  plugins: [{ name: 'upstream-workspaces', setup(builder) {
    builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'facade' }));
    builder.onLoad({ filter: /.*/, namespace: 'facade' }, () => ({
      contents: Object.entries(primitiveExports).map(([path, names]) =>
        `export { ${names.join(', ')} } from './packages/client/ui-primitives/src/${path}';`).join('\n'),
      resolveDir: root,
    }));
    builder.onResolve({ filter: /^[^./]/ }, args => {
      const parts = args.path.split('/');
      const name = args.path.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      const pkg = packages.get(name);
      if (!pkg) return { path: args.path, external: true };
      const sub = args.path.slice(name.length).replace(/^\//, '');
      return { path: join(pkg, sub.startsWith('src/') ? sub : sub ? `src/${sub}.ts` : 'src/index.ts') };
    });
  } }],
  banner: { js: `// Generated from deepseek-ai/deepseek-harness ${commit}. MIT; see LICENSE. Do not hand-edit.` },
});
const hash = data => createHash('sha256').update(data).digest('hex');
const inputs = Object.keys(result.metafile.inputs).filter(path => path.startsWith('packages/')).sort();
const outputs = ['renderer.js', 'renderer.css', 'renderer.js.map', 'renderer.css.map'];
for (const name of ['renderer.js.map', 'renderer.css.map']) {
  const map = JSON.parse(readFileSync(join(out, name), 'utf8'));
  map.sources = map.sources.map(source => relative(root, resolve(out, source)));
  map.sourceRoot = `dsh://${commit}/`;
  writeFileSync(join(out, name), JSON.stringify(map) + '\n');
}
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE'));
const commonLocale = 'packages/client/locale/src/locales/zh.ts';
copyFileSync(join(root, commonLocale), join(out, 'common-locales.ts'));
writeFileSync(join(out, 'locales.ts'), readFileSync(join(root, trajectory, 'locales.ts'), 'utf8').replaceAll("'@deepseek-ai/dsh-client-ui-slots'", "'../platform-types.ts'"));
// Copy only the public data interfaces needed at the offline host boundary, without service dependencies.
const definitions = {
  [trajectory + 'trajectory-record.ts']: ['TrajectoryCellKind', 'AssistantMetricDetail', 'TrajectorySourceBlock', 'TrajectoryCellProps'],
  [trajectory + 'layout.ts']: ['TrajectoryGroupModel', 'TrajectoryTurnModel'],
  [trajectory + 'TrajectoryTable.tsx']: ['TrajectoryTableProps', 'TrajectoryRequestNumberBase', 'TrajectoryRequestNumber', 'TrajectoryUsage'],
  [trajectory + 'TrajectoryToolbar.tsx']: ['TrajectoryToolbarProps'],
  [trajectory + 'TrajectoryTimeline.tsx']: ['TrajectoryTimelineProps'],
  [trajectory + 'timeline.ts']: ['TrajectoryTimelineMode', 'TrajectoryTimeRange', 'TrajectoryTimelineSpan', 'TrajectoryTimelineTurnBoundary', 'TrajectoryTimelineModel'],
  [trajectory + 'code-program.ts']: ['CodeProgram'],
  'packages/client/ui-primitives/src/JsonTree.tsx': ['JsonTreeLabels', 'JsonTreeProps'],
  'packages/client/ui-primitives/src/ImageLightbox.tsx': ['ImageLightboxLabels'],
  'packages/client/ui-conversation/src/client/contract/records.ts': ['AssistantRequestConfig'],
  'packages/client/ui-conversation/src/client/contract/request-inspection.ts': ['ConversationPromptSnapshot'],
  'packages/client/ui-conversation/src/client/contract/slots.ts': ['MessageImageLabels'],
  'packages/attachment/attachment/src/types.ts': ['ImageMediaType', 'ImageAttachmentRef', 'FileAttachmentRef'],
};
let declarations = `// Generated public contracts from pinned DSH sources. Do not hand-edit.\nimport type { HTMLAttributes } from 'react';\nimport type { TrajectoryTranslate, NS } from './locales';\nimport type { TranslateNS, AttachmentId, PropsRenderSlots, MessageImageLoader, ToolSchema } from '../platform-types.ts';\n`;
for (const [path, names] of Object.entries(definitions)) {
  const source = readFileSync(join(root, path), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const name of names) {
    const node = ast.statements.find(node => node.name?.text === name);
    if (!node) throw new Error(`Missing upstream contract: ${path}#${name}`);
    declarations += '\n' + node.getText(ast) + '\n';
  }
}
writeFileSync(join(out, 'contracts.ts'), declarations);
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ repository: 'https://github.com/deepseek-ai/deepseek-harness', commit,
  inputs: Object.fromEntries([...new Set([...inputs, ...Object.keys(definitions), commonLocale, trajectory+'locales.ts', 'LICENSE'])].sort().map(path => [path, hash(readFileSync(join(root, path)))])),
  outputs: Object.fromEntries([...outputs, 'contracts.ts', 'locales.ts', 'common-locales.ts', 'LICENSE'].map(path => [path, hash(readFileSync(join(out, path)))])),
  external: [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(i => i.external).map(i => i.path)))].sort(),
}, null, 2) + '\n');
console.log(`Vendored DSH ${commit}; ${inputs.length} source inputs; output: ${out}`);
