"""Execution adapters for original native wall/connection producers.

This removes redundant audit work and dispatches observation callbacks only at
observed producer events. It does not replace variable-topology algorithms with
GPU approximations. The original append-prefix/coverage and corner encoder
checks remain mandatory. Provider source files are read, never modified.
"""
from pathlib import Path
import hashlib
import runpy
import time


def _load(path,replacements=()):
    path=Path(path);source=path.read_text()
    for old,new in replacements:
        if source.count(old)!=1:raise ValueError('Structure adapter source drift: '+old)
        source=source.replace(old,new)
    namespace={'__file__':str(path),'__name__':'structure_adapted_'+path.stem}
    exec(compile(source,str(path),'exec'),namespace)
    return namespace


def load(provider):
    """Return run_live and walls with the provider's existing argument contracts."""
    provider=Path(provider).resolve();scene=provider.parent/'scene-reuse'
    import sys
    sys.path.insert(0,str(provider));sys.path.insert(0,str(scene))
    from unicorn import UC_HOOK_CODE,UC_HOOK_BLOCK
    original_observer=runpy.run_path(str(provider/'native-owner-checks/capture.py'))
    BaseObserver=original_observer['OwnerObserver']
    class Observer(BaseObserver):
        def __init__(self,r):
            # Keep the original observation state and all checks. Only dispatch
            # changes: native entries and discovered return addresses are events.
            self.mu=r.mu;self.groups=[];self.pending=[];self.current=[];self.active=False;self.encode_pending=[]
            self.handles={};self.callback_count=0
            for pc in [0x1010cb8d0,0x1017cbf64,0x1017cbeec,*original_observer['ENTRIES']]:self.watch(pc)
        def watch(self,pc):
            if pc not in self.handles:self.handles[pc]=self.mu.hook_add(UC_HOOK_CODE,self.dispatch,begin=pc,end=pc)
        def dispatch(self,m,pc,n,data):
            self.callback_count+=1
            self.observe(m,pc,n,data)
            for call in self.pending+self.encode_pending:self.watch(call['return_pc'])
        def close(self):
            self.unique_event_addresses=len(self.handles)
            for handle in self.handles.values():self.mu.hook_del(handle)
            self.handles.clear()

    # Admission and platform handling run once per basic block; interior
    # observation/stop PCs additionally use exact instruction hooks.
    consumer=_load(scene/'connections/intersection-full.py',[
        ('DATA=BINARY.read_bytes();EXPECTED=', 'from scene_native_runtime import DATA\nEXPECTED='),
        ("syms={}\nfor l in (INV/'walls/nm-all.txt').read_text().splitlines():\n m=re.match(r'([0-9a-fA-F]+) .* (\\S+)$',l)\n if m:syms.setdefault(int(m[1],16),[]).append(m[2])\nstarts=sorted(syms)", "from scene_native_runtime import syms,starts"),
        ('from unicorn import Uc,UC_ARCH_ARM64,UC_MODE_ARM,UC_HOOK_CODE,__version__','from unicorn import Uc,UC_ARCH_ARM64,UC_MODE_ARM,UC_HOOK_CODE,UC_HOOK_BLOCK,__version__'),
        ('instruction_count=0\n def trace','instruction_count=0;trace_callbacks=0\n def trace'),
        ('nonlocal heap,instruction_count,captured_crossings','nonlocal heap,instruction_count,captured_crossings,trace_callbacks'),
        ('instruction_count+=1','instruction_count+=size//4;trace_callbacks+=1'),
        ('mu.hook_add(UC_HOOK_CODE,trace)',"mu.hook_add(UC_HOOK_BLOCK,trace)\n for event_pc in (0x1009013f4,0x100929e7c):mu.hook_add(UC_HOOK_CODE,trace,begin=event_pc,end=event_pc)"),
        ("'instruction_count':instruction_count", "'instruction_count':instruction_count,'instruction_count_kind':'basic-block-upper-bound-with-observation-events','trace_callback_count':trace_callbacks"),
    ])
    live=_load(scene/'connections/live-request.py',[
        ("'repeat_beam_producer':True", "'repeat_beam_producer':False"),
        ("CONSUMER=runpy.run_path(str(D/'intersection-full.py'))['run']","CONSUMER=None"),
        ("'instruction_count':result['instruction_count']","'instruction_count':result['instruction_count'],'trace_callback_count':result['trace_callback_count']"),
    ])
    live['run_live'].__globals__['CONSUMER']=consumer['run']
    whole=_load(scene/'whole-walls/capture.py',[
        ('reader([6,10,8])','reader(list(walls))'),
        ('h=m.hook_add(UC_HOOK_BLOCK,obs);m.ctl_remove_cache(0x100000000,0x1023c7000)',
         'h=[m.hook_add(UC_HOOK_CODE,obs,begin=pc,end=pc) for pc in (0x101038b30,0x1010ce100,0x1017cbeec,0x10107efec,0x101084310,0x10107e4cc,0x1010c5290,0x10148c340)];m.ctl_remove_cache(0x100000000,0x1023c7000)'),
        ('m.hook_del(h)','for handle in h:m.hook_del(handle)'),
        ('def obs(uc,pc,n,_):','observation_callbacks=0\n def obs(uc,pc,n,_):\n  nonlocal observation_callbacks\n  observation_callbacks+=1'),
        ("'entry'  :'0x1010cb8d0'","'observation_callback_count':observation_callbacks,'entry'  :'0x1010cb8d0'"),
    ])
    downstream=_load(provider/'dynamic-native-downstream.py',[
        ("mod=adapted(source,{'reader([6,10,8])':'reader(list(walls))'})","mod=STRUCTURE_WHOLE"),
        ("observer=runpy.run_path(str(observer_script))['attach'](r)","observer=STRUCTURE_OBSERVER(r)"),
        ('finally:observer.close()',"finally:observer.close()\n report['owner_observation_dispatch']={'callbacks':observer.callback_count,'unique_addresses':observer.unique_event_addresses}"),
    ])
    downstream['walls'].__globals__.update(STRUCTURE_WHOLE=whole,STRUCTURE_OBSERVER=Observer)
    provenance={'adapter':str(Path(__file__).resolve()),'adapter_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'changes':['Reuse binary bytes and exact same parsed symbol table from already loaded scene runtime','Basic-block connection admission and platform callbacks; exact observation-PC hooks','One original beam production; repeat determinism probe moved to verification','Addressed owner/whole-wall observation with all original append/coverage/encoder assertions']}
    source_paths=[scene/'scene_native_runtime.py',scene/'connections/intersection-full.py',scene/'connections/live-request.py',scene/'whole-walls/capture.py',provider/'dynamic-native-downstream.py',provider/'native-owner-checks/capture.py',scene.parent/'walls/nm-all.txt']
    provenance['sources']=[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in source_paths]
    def run_live(r,state,render_slots=None):
        start=time.perf_counter();result=live['run_live'](r,state,render_slots)
        result['provenance']['execution_adapter']=provenance
        result['provenance']['instruction_count_kind']='basic-block-upper-bound-with-observation-events'
        result['execution_seconds']=time.perf_counter()-start
        return result
    def walls(scene,conn,plat,out,roof_connections=None):
        start=time.perf_counter();result=downstream['walls'](scene,conn,plat,out,roof_connections)
        result['execution_adapter']=provenance;result['execution_seconds']=time.perf_counter()-start
        # The unchanged provider and observer are original sources; the adapter
        # identity explicitly describes how their execution was instrumented.
        import json
        capture_path=Path(result['producer_partition']['file'])
        capture=json.loads(capture_path.read_text());capture['execution_adapter']=provenance
        capture_path.write_text(json.dumps(capture,indent=2)+'\n')
        result['producer_partition']['sha256']=hashlib.sha256(capture_path.read_bytes()).hexdigest()
        path=Path(out)/'results.json'
        import json
        path.write_text(json.dumps(result,indent=2)+'\n')
        return result
    return {'run_live':run_live,'walls':walls,'connection_consumer':consumer['run'],'provenance':provenance}
