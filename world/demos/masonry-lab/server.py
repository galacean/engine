"""Local geometry/rule/unit authoring and resident-render publication.
Compilation produces a candidate. Publication is separate, after the browser has
successfully prepared that candidate. Failed/stale work never replaces the scene.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit, unquote
import argparse, sys, json, copy, hashlib, math, subprocess, uuid, threading, time, shutil


def placement_key(doc):
    d = copy.deepcopy(doc)
    d['overrides'] = []
    derived = {g['id'] for g in d['geometries'] if g.get('source', {}).get('type') == 'connection'}
    d['geometries'] = [g for g in d['geometries'] if g['id'] not in derived]
    d['bindings'] = [b for b in d['bindings'] if b['geometry_id'] not in derived]
    for b in d['bindings']:
        b['unit_id'] = None
    return json.dumps(d, sort_keys=True, separators=(',', ':'))


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False))
    temporary.replace(path)


class Packages:
    def __init__(self, initial):
        self.lock = threading.RLock()
        self.entries = {}
        self.initial = self.register(initial)

    def register(self, directory):
        directory = directory.resolve()
        raw = (directory / 'scene.json').read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        entry = {'directory': directory, 'manifest': json.loads(raw), 'digest': digest,
                 'scene': json.loads((directory / 'lab-scene.json').read_text())}
        with self.lock:
            self.entries[digest] = entry
        return entry

    def published(self, store):
        path = store.directory / 'resident-publication.json'
        publication = json.loads(path.read_text()) if path.exists() else None
        entry = self.initial
        if publication and publication.get('cache_directory'):
            directory = Path(publication['cache_directory']).resolve()
            if not directory.is_relative_to((store.directory / 'resident-cache').resolve()):
                raise ValueError('Cache escaped its workspace owner')
            with self.lock:
                entry = self.entries.get(publication['cache_sha256'])
            if entry is None:
                entry = self.register(directory)
            if entry['digest'] != publication['cache_sha256']:
                raise ValueError('Published cache changed on disk')
        document = publication['document'] if publication else entry['manifest']['document']
        if placement_key(document) != placement_key(entry['manifest']['document']):
            raise ValueError('Published intent differs from its placement cache')
        return entry, publication, document

    def describe(self, entry, document, revision=None):
        return {'cache_sha256': entry['digest'], 'manifest_url': '/resident/cache/' + entry['digest'] + '/scene.json',
                'document': document, 'document_revision': revision}


def main():
    p = argparse.ArgumentParser()
    for name in ('provider', 'assets', 'session-dir', 'example-session'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--port', type=int, default=8777)
    p.add_argument('--gpu-feedback', action='store_true')
    p.add_argument('--engine-assets', type=Path)
    a = p.parse_args()
    if a.gpu_feedback and (not a.engine_assets or not (a.engine_assets/'engine-feedback.js').is_file()):
        p.error('--gpu-feedback requires --engine-assets containing the built PR3071 engine bridge')
    sys.path.insert(0, str(a.provider.resolve()))
    import server as authoring
    source = Path(__file__).resolve().parents[3] / "packages/building/src/tiny-glade"
    demo = Path(__file__).resolve().parent
    packages = Packages(a.assets)
    compile_lock = threading.Lock()

    class Handler(authoring.Handler):
        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            try:
                if path.startswith('/resident/'):
                    if path.startswith('/resident/offline/'):
                        root, relative = source / 'offline', path.removeprefix('/resident/offline/')
                    elif path.startswith('/resident/runtime/'):
                        root, relative = source / 'runtime', path.removeprefix('/resident/runtime/')
                        if relative == 'ResidentRenderer.js':
                            root, relative = source / 'offline', 'CapturedResidentRenderer.js'
                        if relative == 'engine-feedback.js' and a.engine_assets:
                            root = a.engine_assets.resolve()
                    elif path.startswith('/resident/data/'):
                        root, relative = a.assets.resolve(), path.removeprefix('/resident/data/')
                    elif path.startswith('/resident/cache/'):
                        digest, relative = path.removeprefix('/resident/cache/').split('/', 1)
                        # Register the persisted package after a process restart.
                        if digest not in packages.entries:
                            packages.published(self.server.workspace_apps['round-gothic'].store)
                        root = packages.entries[digest]['directory']
                    else:
                        return self.reply(404, {'error': 'Unknown resident asset'})
                    target = (root / relative).resolve()
                    if not target.is_relative_to(root) or not target.is_file() or target.name.startswith('audit-'):
                        return self.reply(404, {'error': 'Unknown resident asset'})
                    return self.file(target)
                if self.app.workspace_id == 'round-gothic' and path in ('/api/resident/state', '/api/scene', '/api/status'):
                    entry, published, document = packages.published(self.app.store)
                    if path == '/api/resident/state':
                        state = packages.describe(entry, document, published['document_revision'] if published else None)
                        camera = self.app.store.directory / 'resident-camera.json'
                        state['camera'] = json.loads(camera.read_text()) if camera.exists() else None
                        state['scene_revision'] = published.get('scene_revision', entry['scene']['revision']) if published else entry['scene']['revision']
                        return self.reply(200, state)
                    if path == '/api/scene':
                        scene = copy.deepcopy(entry['scene']); scene['document'] = document; scene['request'] = document; scene['revision'] = published.get('scene_revision',scene['revision']) if published else scene['revision']
                        return self.reply(200, scene)
                    status = self.app.store.snapshot(); status['current_revision'] = published.get('scene_revision',entry['scene']['revision']) if published else entry['scene']['revision']
                    return self.reply(200, status)
                if path in ('/', '/index.html', '/app.js', '/style.css'):
                    return self.file(demo / (path.lstrip('/') or 'index.html'))
                return super().do_GET()
            except (ValueError, KeyError, TypeError) as e:
                return self.reply(400, {'error': str(e)})
            except OSError as e:
                return self.reply(500, {'error': str(e)})

        def do_POST(self):
            path = urlsplit(self.path).path
            if self.app.workspace_id == 'round-gothic' and path in ('/api/render','/api/camera'):
                return self.reply(400, {'error':'Use the resident compile/publish or camera contract'})
            if self.app.workspace_id != 'round-gothic' or path not in (
                    '/api/resident/publish', '/api/resident/compile', '/api/resident/camera', '/api/connections/prepare'):
                return super().do_POST()
            try:
                port = self.server.server_port; origin = self.headers.get('Origin')
                if origin and origin not in (f'http://127.0.0.1:{port}', f'http://localhost:{port}'):
                    return self.reply(403, {'error': 'Same origin required'})
                if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    return self.reply(415, {'error': 'JSON required'})
                n = int(self.headers.get('Content-Length', '-1'))
                if not 0 <= n <= 65536:
                    return self.reply(413, {'error': 'Body exceeds document limit'})
                request = json.loads(self.rfile.read(n))
                if not isinstance(request, dict):
                    raise ValueError('Object body required')
                store = self.app.store
                if path == '/api/resident/camera':
                    c = request['camera']
                    numbers = c['eye'] + c['target'] + [c['near'], c['far'], c['halfExtent']]
                    if set(request) != {'camera'} or set(c) != {'eye','target','near','far','halfExtent','projection'} or len(c['eye']) != 3 or len(c['target']) != 3 or len(numbers) != 9 or any(type(x) not in (int,float) or not math.isfinite(x) for x in numbers) or c['projection'] != 'orthographic' or not (0 <= c['near'] < c['far'] and c['halfExtent'] > 0):
                        raise ValueError('Invalid camera')
                    if c['eye'][0] == c['target'][0] and c['eye'][2] == c['target'][2]:
                        raise ValueError('Degenerate camera')
                    with store.lock:
                        atomic_json(store.directory / 'resident-camera.json', c)
                    return self.reply(200, c)
                if path == '/api/connections/prepare':
                    if set(request) != {'connection_id','scene_revision','document_revision'}:
                        raise ValueError('Invalid connection request')
                    with store.lock:
                        store._check_document_revision(request['document_revision'])
                        entry, published, doc = packages.published(store)
                        if request['scene_revision'] != (published.get('scene_revision',entry['scene']['revision']) if published else entry['scene']['revision']) or store.document != doc:
                            raise authoring.Conflict('Publish the current document before selecting a connection')
                        current = json.loads((entry['directory'].parent / 'prepared.json').read_text()) if entry != packages.initial else store.current
                        assembly = current['render']; bundle = assembly.get('effective_source_bundle', current.get('bundle_file'))
                    directory = store.directory / ('resident-proposal-' + uuid.uuid4().hex); directory.mkdir()
                    ip, op = directory / 'input.json', directory / 'proposal.json'
                    atomic_json(ip, {'document':doc,'render':assembly,'bundle_file':bundle,'connection_id':request['connection_id']})
                    run = subprocess.run([str(authoring.PYTHON),str(a.provider / 'connection_inventory.py'),str(ip),str(op)],capture_output=True,text=True,timeout=120)
                    (directory / 'stderr.log').write_text(run.stderr)
                    if run.returncode:
                        raise ValueError('Connection selection failed: ' + run.stderr[-1200:])
                    return self.reply(200, json.loads(op.read_text()))
                if set(request) != {'document_revision','cache_sha256'}:
                    raise ValueError('Expected document revision and cache digest')
                with store.lock:
                    store._check_document_revision(request['document_revision']); doc = copy.deepcopy(store.document)
                if path == '/api/resident/compile':
                    with packages.lock:
                        hit = next((e for e in packages.entries.values() if placement_key(e['manifest']['document']) == placement_key(doc) and (not a.gpu_feedback or e['manifest'].get('pipeline') == 'galacean-feedback-v1')),None)
                    if hit:
                        return self.reply(200,{**packages.describe(hit,doc,request['document_revision']),'scene':hit['scene'],'compileTimings':{'cacheHit':True}})
                    if not compile_lock.acquire(blocking=False):
                        raise authoring.Conflict('A geometry compilation is already running')
                    try:
                        directory = store.directory / 'resident-cache' / uuid.uuid4().hex; directory.mkdir(parents=True)
                        atomic_json(directory / 'document.json', doc)
                        # Baseline owns the immutable extraction resources, not the new document shape.
                        atomic_json(directory / 'baseline.json', store.current)
                        started = time.perf_counter()
                        command = [str(authoring.PYTHON),str(source / 'tools/compile_resident.py'),'--provider',str(a.provider),'--resources',packages.initial['manifest']['authoring_resources'],'--baseline',str(directory / 'baseline.json'),'--document',str(directory / 'document.json'),'--output',str(directory / 'compiled')]
                        if a.gpu_feedback:command.extend(['--gpu-feedback','--construction-cache',str(store.directory / 'construction-cache')])
                        result = subprocess.run(command,capture_output=True,text=True,timeout=900)
                        (directory / 'compiler.log').write_text(result.stdout + result.stderr)
                        if result.returncode:
                            raise ValueError('Compilation failed: ' + result.stderr[-1600:])
                        target = directory / 'compiled/data'; export_start = time.perf_counter()
                        command = [sys.executable,str(source / 'tools/export_resident.py'),str(a.provider.parent),str(directory / 'compiled/prepared.json'),str(target),'--static-package',str(packages.initial['directory']),'--shared-asset-url','/resident/data/']
                        result = subprocess.run(command,capture_output=True,text=True,timeout=180)
                        (directory / 'export.log').write_text(result.stdout + result.stderr)
                        if result.returncode:
                            raise ValueError('GPU package failed: ' + result.stderr[-1600:])
                        shutil.copyfile(directory / 'compiled/lab-scene.json', target / 'lab-scene.json')
                        # A monotonic workspace revision is separate from native producer ordinals.
                        lab = json.loads((target / 'lab-scene.json').read_text())
                        entry = packages.register(target)
                        state = packages.describe(entry, doc, request['document_revision'])
                        state['scene'] = entry['scene']
                        state['compileTimings'] = json.loads((directory / 'compiled/timings.json').read_text())
                        state['compileTimings'].update(exportMs=(time.perf_counter()-export_start)*1000,serverTotalMs=(time.perf_counter()-started)*1000)
                        atomic_json(directory / 'timings.json', state['compileTimings'])
                        with store.lock:
                            store._check_document_revision(request['document_revision'])
                        return self.reply(200, state)
                    finally:
                        compile_lock.release()
                with packages.lock:
                    entry = packages.entries.get(request['cache_sha256'])
                if entry is None or placement_key(doc) != placement_key(entry['manifest']['document']):
                    raise ValueError('Geometry/rule cache differs; compile required')
                base_bindings = {b['id']:b for b in entry['manifest']['document']['bindings']}
                geometries = {g['id']:g for g in doc['geometries']}
                for b in doc['bindings']:
                    src = geometries[b['geometry_id']].get('source', {})
                    if src.get('type') != 'connection': continue
                    if src['kind'] == 'roof_boundaries' and b['rule'] == {'type':'roof_boundary_assembly'} and src.get('bindings',[None])[0] in base_bindings: continue
                    if src['kind'] == 'roof_contacts' and b['rule'] == {'type':'roof_roof_intersection'}:
                        refs = src.get('geometries') or [base_bindings.get(x,{}).get('geometry_id') for x in src['bindings']]
                        if all(g in {x['geometry_id'] for x in base_bindings.values()} for g in refs): continue
                    raise ValueError('Unsupported resident connection producer')
                publication = {'document':doc,'document_revision':request['document_revision'],'cache_sha256':entry['digest']}
                if entry != packages.initial:
                    publication['cache_directory'] = str(entry['directory'])
                with store.lock:
                    store._check_document_revision(request['document_revision'])
                    previous, prior, _ = packages.published(store)
                    revision = prior.get('scene_revision',previous['scene']['revision']) if prior else previous['scene']['revision']
                    # Publication identity includes material/local edits, not only geometry cache changes.
                    publication['scene_revision'] = revision + 1
                    atomic_json(store.directory / 'resident-publication.json', publication)
                return self.reply(200, {**packages.describe(entry, doc, request['document_revision']), 'scene_revision':publication['scene_revision']})
            except authoring.Conflict as e:
                return self.reply(409, {'error': str(e)})
            except (ValueError, KeyError, TypeError) as e:
                return self.reply(400, {'error': str(e)})
            except (OSError, subprocess.SubprocessError) as e:
                return self.reply(500, {'error': str(e)})

    http = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    http.app = authoring.App(a.session_dir, resume=True)
    authoring.configure_workspaces(http, a.example_session)
    print(f'Resident lab http://127.0.0.1:{http.server_port}/?workspace=round-gothic', flush=True)
    try:
        http.serve_forever()
    finally:
        http.server_close()
        for app in http.workspace_apps.values(): app.store.close()

if __name__ == '__main__':
    main()
