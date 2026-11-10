import fs from 'node:fs';
import vm from 'node:vm';

// Build-time bundling only. The pinned upstream files remain byte-for-byte intact.
export function buildAtomicKernel() {
  const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const modules = [
    ['outline','outline.js',[],['makeConstrainedRockOutline','normalizeRockNotches','measureRockBoundaryAngles']],
    ['profile','body-profile.js',[],['createBodyProfile']],
    ['walls','wall-composition.js',['makeConstrainedRockOutline:outline.makeConstrainedRockOutline'],['createWallComposition']],
    ['recesses','open-recesses.js',[],['openRecesses']],
    ['loft','loft-rock.js',['openRecesses:recesses.openRecesses'],['buildBoundedRockSurface','enforceMetricAngles']],
    ['body','rock-body.js',['makeConstrainedRockOutline:outline.makeConstrainedRockOutline','createWallComposition:walls.createWallComposition','buildBoundedRockSurface:loft.buildBoundedRockSurface','createBodyProfile:profile.createBodyProfile'],['buildRock','DEFAULT_ROCK']],
    ['optimizer','vendor/meshopt_simplifier.js',[],['MeshoptSimplifier']],
    ['reduction','simplify-rock.js',['enforceMetricAngles:loft.enforceMetricAngles','MeshoptSimplifier:optimizer.MeshoptSimplifier'],['simplifyRock','simplifierReady']]
  ];
  const clean = source => source.replace(/^import .*;\r?\n/gm,'').replace(/^export \{[^}]*\};?\s*$/gm,'').replace(/^export /gm,'');
  const kernel = '/* Upstream generator and meshoptimizer licenses:\n'+read('generator/LICENSE')+'\n'+read('generator/vendor/meshoptimizer-LICENSE.md')+'\n*/\nfunction atomicRockKernel(){\n'+modules.map(([name,file,bindings,exports])=>{
    const parameters=bindings.map(s=>s.slice(0,s.indexOf(':'))), arguments_=bindings.map(s=>s.slice(s.indexOf(':')+1));
    return `const ${name}=((${parameters.join(',')})=>{\n${clean(read('generator/'+file))}\nreturn {${exports.join(',')}};\n})(${arguments_.join(',')});`;
  }).join('\n')+'\nreturn {buildRock:body.buildRock,simplifyRock:reduction.simplifyRock,ready:reduction.simplifierReady,optimizer:optimizer.MeshoptSimplifier};\n}';
  new vm.Script(kernel);
  return kernel;
}
