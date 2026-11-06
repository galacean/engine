"""Construction-owned decorator preparation with exact CPU trigger resources.

Original semantic serde, transform cache, subtype, asset-library and Gothic /
Cottage blueprint producers remain native. This module replaces only the
already-recovered support geometry and its repeated same-source preparation.
"""
from pathlib import Path
import hashlib
import json
import runpy
import sys
from recovered_trigger_binding import adapt_source


def _load(path, source):
    ns={'__file__':str(path),'__name__':'construction_decorators_'+path.stem}
    exec(compile(source,str(path),'exec'),ns)
    return ns


def build_decorators(scene, output_dir, provider):
    """Drop-in dynamic downstream build_decorators with explicit provider path.

    Sets scene.r.edited_decorator_context and returns its evidence report. All
    pointers remain owned by the supplied fresh scene/replay; never shared
    across scenes. Caller retains the normal roof/local-edit persistence owner.
    """
    provider=Path(provider).resolve();source_root=provider.parent/'scene-reuse'
    if str(provider) not in sys.path:sys.path.insert(0,str(provider))
    if str(source_root) not in sys.path:sys.path.insert(0,str(source_root))
    r=scene.r;live=scene.live
    if getattr(scene,'dormer_specs',[]):
        if output_dir is None:raise ValueError('Authored dormers need a private evidence directory')
        path=provider/'native_dormer_source.py';source=path.read_text()
        needle='source=path.read_text();needle='
        if source.count(needle)!=1:raise ValueError('Native dormer cache source binding changed')
        source=source.replace(needle,"source=__import__('recovered_trigger_binding').adapt_source(path.read_text());needle=")
        ctx=_load(path,source)['build_context'](scene,scene.dormer_specs,output_dir)
        report=ctx['report']
    else:
        # Reuse the original zero-source resource owner, no Cottage defaults.
        empty=runpy.run_path(str(provider/'dynamic-native-downstream.py'))['empty_decorators']
        path=source_root/'edited-decorators/live-cache.py';source=adapt_source(path.read_text())
        needle='for did in [8,10,12,9]:'
        if source.count(needle)!=1:raise ValueError('Native cache enumeration ABI changed')
        source=source.replace(needle,'for did in []:')
        ns=_load(path,source);ns['build_decorator_storage']=lambda mu,alloc,call:empty(r)
        cache=ns['build'](r,live);cache_result=cache['regenerate']()
        derived=runpy.run_path(str(source_root/'edited-decorators/live-subtypes.py'))['build'](r,live,cache)
        subtypes=derived['regenerate']()
        blueprints=runpy.run_path(str(source_root/'edited-decorators/live-blueprints.py'))['build'](r,live,cache,derived)
        records=blueprints['regenerate']()
        if records or subtypes:raise ValueError('Original empty decorator source unexpectedly produced geometry')
        report={'cache':cache_result,'subtypes':subtypes,'blueprints':records}
        ctx={'cache':cache,'derived':derived,'blueprints':blueprints,'records':records,'report':report}
        r.edited_decorator_context=ctx
    report['source_preparation']={'implementation':'construction-decorators-v1','trigger':'Exact recovered CPU triangles/normals/UV, same-Roof88 roster cache; original downstream cache/subtype/blueprint consumers',
        'source_sha256':{name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()for name in ('construction_decorators.py','recovered_trigger_binding.py','recovered_roof_surface.py','recovered_roof.py')},
        'native_dormer_source_sha256':hashlib.sha256((provider/'native_dormer_source.py').read_bytes()).hexdigest()}
    if output_dir is not None:
        output_dir=Path(output_dir);output_dir.mkdir(parents=True,exist_ok=True)
        (output_dir/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    return report
