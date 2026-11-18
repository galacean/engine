// Exercise the target checkout's actual retrieval adapter, importer and formats.
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
const [project, batchFile, output] = process.argv.slice(2);
const require = createRequire(path.join(project, 'packages/retrieval/package.json'));
const {require: load} = require('tsx/cjs/api');
const moduleAt = p => load(path.join(project, p), import.meta.url);
const {nativeAssetFormats} = moduleAt('packages/runtime-editor/src/project/runtime-native-formats.ts');
const {RuntimeProjectEdit} = moduleAt('packages/project/src/runtime-editor/project/runtime-project-edit.ts');
const {RUNTIME_PROJECT_SAVE_VERSION} = moduleAt('packages/project/src/runtime-editor/project/runtime-project.ts');
const {importRuntimeAsset} = moduleAt('packages/runtime-editor/src/project/runtime-asset-import.ts');
const {createRetrievalAssetSource} = moduleAt('packages/runtime-editor/src/retrieval-agent/asset-source.ts');
const {buildRetrievalCatalog} = moduleAt('packages/retrieval/src/retrieval/src/build.ts');
const formats = nativeAssetFormats(() => ({}));
if (batchFile === '--check') {
  console.log(JSON.stringify({types:[...formats.keys()]}));
  process.exit(0);
}
const batch = JSON.parse(readFileSync(batchFile, 'utf8'));
const results = [];
for (const asset of batch.assets) {
  const directory = asset.key.slice(0, -'describe.json'.length);
  const metadata = JSON.parse(readFileSync(path.join(asset.directory, 'describe.json'), 'utf8'));
  const resources = asset.files.filter(f => f.path !== 'describe.json').map(f => ({
    path: directory + f.path, url: 'https://intake.invalid/' + encodeURIComponent(f.path)
  }));
  const built = buildRetrievalCatalog([{key:asset.key, metadata, descriptionUrl:'https://intake.invalid/describe.json', resources}]);
  if (built.manifest.count !== 1) throw Error('Catalog validation failed');
  const filesByUrl = new Map(resources.map(r => [r.url, path.join(asset.directory, r.path.slice(directory.length))]));
  const source = createRetrievalAssetSource({resourceSet:async () => ({root:'/oss/' + directory.slice(0,-1),
    candidate:{name:metadata.overview.name,descriptionExcerpt:metadata.overview.description,usageExcerpt:metadata.usage.description},
    resources:resources.map(r => ({...r,path:'/oss/'+r.path}))})}, {
    read:async (url, options) => {
      const bytes = new Uint8Array(readFileSync(filesByUrl.get(url)));
      if (bytes.byteLength > options.maxBytes) throw Error('Import file/asset byte budget exceeded');
      return bytes;
    }
  });
  const scene = {asset:{version:'2.0'},scene:{rootEntities:[]},entities:[],components:[]};
  const draft = new RuntimeProjectEdit({version:RUNTIME_PROJECT_SAVE_VERSION,project:{scene:'main.scene',files:[
    {virtualPath:'main.scene',path:'main.scene',type:'Scene',dependencies:[]}
  ]},contents:{'main.scene':JSON.stringify(scene)}}, formats);
  try {
    await importRuntimeAsset(draft,[source],{source:'/oss/'+directory.slice(0,-1),path:'Imported'},new AbortController().signal);
    const pack = draft.finish();
    for (const entry of metadata.assetPaths) {
      const dest = 'Imported/' + entry.slice(directory.length);
      if (!pack.project.files.some(f => f.virtualPath === dest)) throw Error('Declared entry imported only as a document: '+entry+'; provide a supported type/sidecar');
    }
    results.push({key:asset.key,assets:pack.project.files.filter(f=>f.virtualPath!=='main.scene').map(f=>({path:f.virtualPath,type:f.type,dependencies:f.dependencies})),
      validation:'target-project-retrieval-import',runtimeTested:false});
  } finally { draft.discard(); }
}
writeFileSync(output,JSON.stringify(results,null,2)+'\n');
