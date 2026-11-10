import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const directory=new URL('./',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,directory),'utf8');
const modules=[
 ['outline','outline.js',[],['makeConstrainedRockOutline','normalizeRockNotches','measureRockBoundaryAngles']],
 ['profile','body-profile.js',[],['createBodyProfile']],
 ['walls','wall-composition.js',['makeConstrainedRockOutline:outline.makeConstrainedRockOutline'],['createWallComposition']],
 ['recesses','open-recesses.js',[],['openRecesses']],
 ['loft','loft-rock.js',['openRecesses:recesses.openRecesses'],['buildBoundedRockSurface','enforceMetricAngles']],
 ['body','rock-body.js',['makeConstrainedRockOutline:outline.makeConstrainedRockOutline','createWallComposition:walls.createWallComposition','buildBoundedRockSurface:loft.buildBoundedRockSurface','createBodyProfile:profile.createBodyProfile'],['buildRock','DEFAULT_ROCK']],
 ['optimizer','vendor/meshopt_simplifier.js',[],['MeshoptSimplifier']],
 ['reduction','simplify-rock.js',['enforceMetricAngles:loft.enforceMetricAngles','MeshoptSimplifier:optimizer.MeshoptSimplifier'],['simplifyRock','simplifierReady']]
];
const clean=source=>source.replace(/^import .*;\r?\n/gm,'').replace(/^export \{[^}]*\};?\s*$/gm,'').replace(/^export /gm,'');
const kernel='/* Upstream generator and meshoptimizer licenses:\n'+read('generator/LICENSE')+'\n'+read('generator/vendor/meshoptimizer-LICENSE.md')+'\n*/\nfunction atomicRockKernel(){\n'+modules.map(([name,file,bindings,exports])=>{
 const parameters=bindings.map(s=>s.slice(0,s.indexOf(':'))),arguments_=bindings.map(s=>s.slice(s.indexOf(':')+1));
 return `const ${name}=((${parameters.join(',')})=>{\n${clean(read('generator/'+file))}\nreturn {${exports.join(',')}};\n})(${arguments_.join(',')});`;
}).join('\n')+'\nreturn {buildRock:body.buildRock,simplifyRock:reduction.simplifyRock,ready:reduction.simplifierReady};\n}';
new vm.Script(kernel);
const controls=read('controls.mjs').replace(/^export /gm,'');
const fragment=read('viewer.fragment.html').replace('__ATOMIC_KERNEL__',()=>kernel).replace('__ATOMIC_CONTROLS__',()=>controls);
for(const [,attrs,source] of fragment.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(attrs))new vm.Script(source);
if(Buffer.byteLength(fragment)>=1_000_000)throw Error('Atomic controls exceed the inline size limit');
fs.writeFileSync(new URL('./atomic-rock-controls.html',directory),fragment);
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
const shell=read('../src/standalone-template.html').replaceAll('Rock Arrangement Study','Atomic Rock Controls').replace('__ROCK_RIDGE_ESCAPED_FRAGMENT__',()=>escape(fragment));
fs.writeFileSync(new URL('./index.html',directory),shell);
fs.writeFileSync(new URL('./kernel.generated.mjs',directory),kernel+'\nexport {atomicRockKernel};\n');
console.log(JSON.stringify({inlineBytes:Buffer.byteLength(fragment),page:fileURLToPath(new URL('index.html',directory))}));
