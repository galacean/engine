"""Request-owned bridge while native topology still uses the recovery provider.
The production geometry algorithms live in runtime/*.js and are browser usable.
One Node process per compile, in-memory messages, no per-cell process or files.
"""
from pathlib import Path
import json,subprocess,time,base64

class RuntimeKernel:
    def __init__(self):
        self.process=subprocess.Popen(['node',str(Path(__file__).with_name('runtime-kernel.mjs'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
        self.surfaces={};self.calls=0;self.milliseconds=0
    def call(self,operation,**args):
        start=time.perf_counter()
        self.process.stdin.write(json.dumps(dict(operation=operation,**args),separators=(',',':'),allow_nan=False)+'\n');self.process.stdin.flush()
        line=self.process.stdout.readline()
        if not line:raise RuntimeError('JavaScript geometry worker exited')
        result=json.loads(line);self.calls+=1;self.milliseconds+=(time.perf_counter()-start)*1000
        if 'error'in result:raise ValueError(result['error'])
        return result['result']
    def prepare(self,surface):
        if 'id' in surface and (not isinstance(surface['id'],str) or not surface['id']):raise ValueError('Invalid surface ID')
        # Identity belongs to the document; this owner only caches chart math.
        key=json.dumps({k:v for k,v in surface.items()if k!='id'},sort_keys=True,separators=(',',':'),allow_nan=False)
        if key not in self.surfaces:self.surfaces[key]=self.call('prepare',surface=surface)
        return self.surfaces[key]
    def validate(self,surface):self.prepare(surface);return dict(surface)
    def anchors(self,surface,points):return self.call('anchors',surface=self.prepare(surface),points=points)
    def pack(self,spec):return {unit:base64.b64decode(raw)for unit,raw in self.call('pack',spec=spec).items()}
    def roof_layout(self,descriptor,footprint,seed,metrics,slot):
        if type(seed)is not int or not 0<=seed<2**64:raise ValueError('uint64 seed required')
        return self.call('roof-layout',descriptor=descriptor,footprint=footprint,seed=str(seed),metrics=metrics,slot=slot)
    def roof_closure(self,placement):
        row=placement['row_index']
        if type(row)is not int or not 0<=row<2**64:raise ValueError('uint64 row required')
        return self.call('roof-closure',placement={**placement,'row_index':str(row)})
    def close(self):
        if self.process is None:return
        p=self.process;self.process=None
        try:
            p.stdin.close();p.wait(timeout=5)
        except (BrokenPipeError,subprocess.TimeoutExpired):
            p.kill();p.wait()
        finally:p.stdout.close()
    def __enter__(self):return self
    def __exit__(self,*args):self.close()
