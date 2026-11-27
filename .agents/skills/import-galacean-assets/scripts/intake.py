#!/usr/bin/env python3
"""Prepare a reviewable batch; publish only the exact user-approved digest."""
from __future__ import annotations
import argparse, concurrent.futures, contextlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'sync-galacean-assets/scripts'))
import sync_assets as sync

MAX_FILE = 64 * sync.CHUNK
MAX_ASSET = 256 * sync.CHUNK

def files(directory):
    directory = Path(directory)
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('Asset input must be a real directory')
    result = []
    total = 0
    for file in sorted(directory.rglob('*')):
        if file.is_symlink(): raise ValueError('Symlinks are not accepted')
        if file.is_dir(): continue
        if not file.is_file(): raise ValueError('Only regular files are accepted')
        rel = file.relative_to(directory).as_posix()
        sync.valid_key('assets/intake/' + rel)
        if rel != 'describe.json' and file.name == 'describe.json':
            raise ValueError('Split nested assets into separate batch entries')
        size = file.stat().st_size
        total += size
        if size > MAX_FILE or total > MAX_ASSET: raise ValueError('Current retrieval import byte budget exceeded')
        result.append(dict(path=rel, size=size, sha256=sync.hash_file(file)))
        if len(result) > sync.ASSET_FILES_LIMIT: raise ValueError('Asset file count exceeded')
    if not any(f['path']=='describe.json' for f in result): raise ValueError('Missing describe.json')
    return result

def code_fingerprint(project):
    root = Path(project)
    # Include transitive host/import contracts, not just a hand-maintained list of validators.
    entries = []
    for base in [*sorted(root.glob('packages/*/src')), root/'world/demos/seed-world']:
        for p in sorted(base.rglob('*')):
            if p.is_file() and p.suffix in ('.ts','.mjs','.json') and 'node_modules' not in p.parts:
                entries.append([str(p.relative_to(root)),sync.hash_file(p)])
    entries.append(['HEAD',subprocess.check_output(['git','-C',str(project),'rev-parse','HEAD'],text=True).strip()])
    return sync.digest(sync.packed(entries).encode())

def inventory(source, key):
    prefix = key[:-len('describe.json')]
    objects = list(source.objects(prefix))
    return [dict(key=o.key,mtime=o.mtime,etag=o.etag,size=o.size) for o in sorted(objects,key=lambda o:o.key)]

def validate_description(asset):
    p = Path(asset['directory'])/'describe.json'
    if p.stat().st_size > sync.DESCRIPTION_LIMIT: raise ValueError('Description too large')
    m = json.loads(p.read_text())
    for section, field in [('overview','name'),('overview','description'),('usage','description')]:
        if not isinstance(m.get(section),dict) or not isinstance(m[section].get(field),str) or not m[section][field].strip():
            raise ValueError('Description requires '+section+'.'+field)
    if not isinstance(m.get('assetType'),str) or not m['assetType']: raise ValueError('Description needs assetType')
    return m

def validate_project(batch, work):
    input_path, output = Path(work)/'input.json', Path(work)/'validation.json'
    sync.atomic_json(input_path,batch)
    r = subprocess.run(['node','--max-old-space-size=512',str(Path(__file__).with_name('validate-project.mjs')),
        batch['project'],str(input_path),str(output)],capture_output=True,text=True,timeout=180)
    if r.returncode: raise ValueError('Target project import rejected batch: '+r.stderr[-3000:])
    return json.loads(output.read_text())

def prepare(spec, source, work, project, destination=None, state=None):
    batch = dict(version=1,project=str(Path(project).resolve()),destination=destination,assets=[])
    directories=[]
    if not spec.get('assets'): raise ValueError('Empty batch')
    for raw in spec['assets']:
        key=sync.valid_key(raw['key'])
        if not key.endswith('/describe.json') or key.startswith(sync.EXCLUDED): raise ValueError('Invalid asset owner')
        prefix=key[:-len('describe.json')]
        if any(prefix.startswith(p) or p.startswith(prefix) for p in directories): raise ValueError('Overlapping asset directories')
        directories.append(prefix)
        asset=dict(key=key,directory=str(Path(raw['directory']).absolute()),mode=raw.get('mode','create'))
        if state:
            for (existing,) in state.db.execute('SELECT key FROM assets'):
                other=existing[:-len('describe.json')]
                if existing!=key and (prefix.startswith(other) or other.startswith(prefix)):
                    raise ValueError('Asset directory overlaps an existing library entry')
        asset['files']=files(asset['directory']);validate_description(asset)
        if inventory(source,key): raise ValueError('Local asset directory collides with OSS; choose another key')
        if asset['mode'] not in ('create','update'): raise ValueError('Mode must be create or update')
        row=state.db.execute('SELECT fingerprint,source FROM assets WHERE key=?',(key,)).fetchone() if state else None
        local=state.db.execute('SELECT 1 FROM local_assets WHERE key=?',(key,)).fetchone() if state else None
        if row and not local: raise ValueError('Cannot update an OSS-owned asset through local intake')
        revision=sync.fingerprint(list(LocalSource(asset).objects(prefix)))
        if asset['mode']=='create' and row:
            if row['fingerprint']!=revision: raise ValueError('Destination exists; review update or choose another name')
            asset['mode']='reuse'
        if asset['mode']=='update' and not row: raise ValueError('Update requires an existing local asset')
        asset['previousRevision']=row['fingerprint'] if row else None
        previous=json.loads(row['source']) if row else None
        asset['removed']=[r['path'] for r in previous['resources'] if r['path'][len(prefix):] not in {f['path'] for f in asset['files']}] if previous else []
        batch['assets'].append(asset)
    batch['validation']=validate_project(batch,work)
    batch['projectFingerprint']=code_fingerprint(project)
    # Detect edits while the validator was reading.
    for a in batch['assets']:
        if files(a['directory'])!=a['files']: raise ValueError('Files changed during preparation')
    batch['digest']=sync.digest(sync.packed(batch).encode())
    return batch

def verify(batch, approved):
    content={k:v for k,v in batch.items() if k!='digest'}
    if batch.get('digest')!=approved or sync.digest(sync.packed(content).encode())!=approved:
        raise ValueError('Approval digest does not match the reviewed batch')
    if code_fingerprint(batch['project'])!=batch['projectFingerprint']: raise ValueError('Project changed; prepare and confirm again')
    for a in batch['assets']:
        if files(a['directory'])!=a['files']: raise ValueError('Asset changed; prepare and confirm again')

class LocalSource:
    """Read-only adapter over the approved local file set, never an OSS writer."""
    def __init__(self, asset): self.asset=asset
    def objects(self, prefix):
        directory=self.asset['key'][:-len('describe.json')]
        current=files(self.asset['directory'])
        if current!=self.asset['files']: raise ValueError('Local asset changed after approval')
        for f in current:
            key=directory+f['path']
            if key.startswith(prefix): yield sync.Obj(key,0,f['sha256'],f['size'])
    def download(self,obj,path,limit):
        rel=obj.key[len(self.asset['key'][:-len('describe.json')]):]
        if obj.size>limit: raise ValueError('Local file exceeds resource budget')
        with open(Path(self.asset['directory'])/rel,'rb') as src, open(path,'wb') as dst:
            remaining=obj.size+1
            while remaining:
                chunk=src.read(min(sync.CHUNK,remaining))
                if not chunk: break
                dst.write(chunk);remaining-=len(chunk)
        if path.stat().st_size!=obj.size or sync.hash_file(path)!=obj.etag:
            raise ValueError('Local asset changed after approval')

def destination(args):
    return dict(endpoint=args.endpoint,bucket=args.bucket,cdnPrefix=args.cdn_prefix,
        browserOrigin=args.browser_origin,publicBase=args.public_base,bizkey=args.bizkey)

def publish(batch, approved, state, source, args, workers=2, validator=validate_project, cdn_factory=None):
    verify(batch,approved)
    if workers not in (1,2): raise ValueError('Upload concurrency must be 1 or 2')
    if batch.get('destination')!=destination(args): raise ValueError('Publication destination changed; prepare and confirm again')
    if args.prefix!='assets/': raise ValueError('Intake must publish against the full library')
    pending=state.get('pendingIntake')
    if pending and pending!=approved: raise ValueError('Another intake is unfinished; resume its approved batch')
    expected_identity={**destination(args),'prefix':'assets/'}
    if state.get('identity')!=expected_identity: raise ValueError('Wrong canonical sync directory or destination')
    config=Path(args.config)
    config_before=config.read_bytes() if config.exists() else None
    entry=json.loads(config_before).get('manifestUrl') if config_before else None
    if not entry or entry!=state.get('manifestUrl'): raise ValueError('Initialize/restore the full library canonical sync state first')
    for a in batch['assets']:
        if inventory(source,a['key']): raise ValueError('Local asset key collides with an OSS asset directory')
        row=state.db.execute('SELECT fingerprint FROM assets WHERE key=?',(a['key'],)).fetchone()
        if not pending and (row[0] if row else None)!=a['previousRevision']:
            raise ValueError('Asset library changed after review; prepare and confirm again')
    cdn_factory=cdn_factory or (lambda:sync.Afts(args.browser_origin))
    with tempfile.TemporaryDirectory(prefix='run-',dir=state.tmp) as tmp:
        if not pending:
            baseline=sync.build_catalog(state,Path(tmp),Path(batch['project']))
            if not entry.endswith('/'+sync.hash_file(baseline/'manifest.json')+'.json'):
                raise ValueError('Sync ledger contains unpublished changes; finish the previous sync first')
            shutil.rmtree(baseline)
        validator(batch,tmp)
        state.set('pendingIntake',approved)
        def upload(asset):
            # Each worker owns its transport, disk checkpoints and SQLite connection.
            checkpoint=state.root/'local-workers'/sync.digest(asset['key'].encode())
            with contextlib.ExitStack() as stack:
                worker=sync.State(checkpoint);stack.callback(worker.close)
                cdn=cdn_factory();stack.callback(cdn.close)
                local=LocalSource(asset)
                objects=list(local.objects(asset['key'][:-len('describe.json')]))
                with tempfile.TemporaryDirectory(prefix='run-',dir=worker.tmp) as work:
                    sync.publish_asset(worker,local,cdn,asset['key'],objects,sync.fingerprint(objects),Path(work),args)
                row=worker.db.execute('SELECT * FROM assets WHERE key=?',(asset['key'],)).fetchone()
                return tuple(row)
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for key,fp,raw in pool.map(upload,batch['assets']):
                old=state.db.execute('SELECT length(CAST(source AS BLOB)) FROM assets WHERE key=?',(key,)).fetchone()
                size=state.source_bytes-(old[0] if old else 0)+len(raw.encode())
                if size>sync.CATALOG_BYTES_LIMIT: raise ValueError('Catalog metadata exceeds budget')
                state.db.execute('INSERT OR REPLACE INTO assets VALUES (?,?,?)',(key,fp,raw))
                state.db.execute('INSERT OR IGNORE INTO local_assets VALUES (?)',(key,))
                state.db.commit();state.source_bytes=size
        verify(batch,approved)
        # Publication performs a read-only OSS inventory to detect source collisions.
        for a in batch['assets']:
            if inventory(source,a['key']): raise ValueError('OSS/local source collision before publication')
        cdn=cdn_factory()
        try: report=sync.publish_catalog(state,cdn,args,builder=sync.build_catalog,before=config_before)
        finally: cdn.close()
        state.set('pendingIntake',None)
        report.update(batchAssets=len(batch['assets']),runtimeTested=False,created=sum(a['mode']=='create' for a in batch['assets']),updated=sum(a['mode']=='update' for a in batch['assets']),reused=sum(a['mode']=='reuse' for a in batch['assets']))
        state.set('lastIntakeReport',report)
        return report

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','publish'])
    parser.add_argument('--batch',required=True)
    parser.add_argument('--project',required=True)
    parser.add_argument('--state-dir',required=True)
    parser.add_argument('--output')
    parser.add_argument('--approved-digest')
    parser.add_argument('--workers',type=int,choices=[1,2],default=2)
    parser.add_argument('--endpoint',default='https://oss-cn-hangzhou.aliyuncs.com')
    parser.add_argument('--browser-origin',default='http://127.0.0.1:4173')
    opt=parser.parse_args()
    root=Path(opt.state_dir).expanduser().resolve();project=Path(opt.project).resolve()
    if root==project or project in root.parents: raise ValueError('State must be outside project')
    if Path(opt.batch).stat().st_size>sync.CATALOG_BYTES_LIMIT: raise ValueError('Batch metadata exceeds 64 MiB')
    batch=json.loads(Path(opt.batch).read_text())
    if opt.action=='publish' and batch['project']!=str(project): raise ValueError('Wrong project')
    args=sync.parser().parse_args(['--project',str(project),'--state-dir',str(root),'--apply','--endpoint',opt.endpoint,'--browser-origin',opt.browser_origin])
    args.config=str(project/'packages/retrieval/src/retrieval/catalog.json')
    args.bizkey=os.environ.get('AFTS_BIZKEY','asap_serivce')
    args.public_base=os.environ.get('AFTS_PUBLIC_URL_BASE','https://mdn.alipayobjects.com').rstrip('/')
    with contextlib.ExitStack() as stack:
        state=sync.State(root);stack.callback(state.close)
        source=sync.OssSource(args.endpoint,args.bucket)
        if opt.action=='prepare':
            if not opt.output: raise ValueError('prepare requires --output outside asset directories')
            target=Path(opt.output).resolve()
            for a in batch['assets']:
                d=Path(a['directory']).resolve()
                if target==d or d in target.parents: raise ValueError('Review output must be outside material')
            with tempfile.TemporaryDirectory(prefix='run-',dir=state.tmp) as work:
                prepared=prepare(batch,source,work,project,destination(args),state)
            sync.atomic_json(target,prepared)
            print(sync.packed({'review':str(target),'digest':prepared['digest'],'assets':len(prepared['assets'])}))
        else:
            print(sync.packed(publish(batch,opt.approved_digest,state,source,args,opt.workers)))

if __name__=='__main__':
    try:main()
    except Exception as e:
        # SDK errors can contain signed transport data. Local validation errors are safe to explain.
        print(str(e) if isinstance(e,(ValueError,RuntimeError)) else type(e).__name__,file=sys.stderr)
        sys.exit(1)
