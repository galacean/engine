"""Immutable native construction bundles, independent of layout/material edits.

The index is the only mutable publication. Absolute paths inside native reports
stay valid because generation directories are never renamed or deleted here.
"""
from pathlib import Path
import ast
import contextlib
import importlib.metadata
import fcntl
import hashlib
import functools
import inspect
import json
import os
import platform
import sys
import threading
import time
import uuid

_VERSION = 2
_audit_state = threading.local()
_digest_state = threading.local()


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def _signature(path):
    st = Path(path).stat()
    return [st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns]


def _hash(path):
    path = os.path.abspath(path)
    memo = getattr(_digest_state, 'memo', None)
    before = _signature(path)
    prior = memo.get(path) if memo is not None else None
    if (isinstance(prior, list) and len(prior) == 2 and prior[0] == before
            and isinstance(prior[1], str) and len(prior[1]) == 64
            and all(c in '0123456789abcdef' for c in prior[1])):
        return prior[1]
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    if _signature(path) != before:
        raise ValueError('Construction input changed while hashing: ' + path)
    digest = h.hexdigest()
    if memo is not None:
        memo[path] = [before, digest]
    return digest


def _audit(event, args):
    state = getattr(_audit_state, 'capture', None)
    if event != 'open' or state is None or state['busy']:
        return
    path, mode, flags = args
    if not isinstance(path, (str, bytes, os.PathLike)):
        return
    if flags & (os.O_WRONLY | os.O_CREAT | os.O_TRUNC):
        return
    state['busy'] = True
    try:
        p = Path(os.path.abspath(os.fsdecode(path)))
        if not p.is_relative_to(state['output']) and p.suffix != '.pyc' and p.is_file():
            before = p.stat()
            signature = (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)
            # Repeated imports/resource reads must not rehash multi-MB native
            # inputs. A changed stat identity forces a content check; the whole
            # observed set is still hashed again before publishing the bundle.
            if state['signatures'].get(str(p)) == signature:
                return
            digest = _hash(p)
            after = p.stat()
            if signature != (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):
                raise ValueError('Construction input changed while fingerprinting: ' + str(p))
            state['signatures'][str(p)] = signature
            previous = state['files'].setdefault(str(p), digest)
            if previous != digest:
                raise ValueError('Construction input changed during build: ' + str(p))
    finally:
        state['busy'] = False


# Installed once on import; inactive outside the owning thread's build boundary.
sys.addaudithook(_audit)


@contextlib.contextmanager
def _capture_reads(output):
    if getattr(_audit_state, 'capture', None) is not None:
        raise RuntimeError('Nested construction cache builds are unsupported')
    state = {'output': output, 'busy': False, 'files': {}, 'signatures': {}}
    _audit_state.capture = state
    try:
        yield state['files']
    finally:
        _audit_state.capture = None


def _sources(provider):
    # Do not recursively scan investigation output trees (hundreds of thousands
    # of generated files). These are current producer source directories; further
    # dynamically loaded scripts are also captured as observed reads below.
    scene = provider.parent / 'scene-reuse'
    roots = [provider, provider / 'native-owner-checks', scene,
             scene / 'native-scene/gpu', provider.parent / 'full-reuse/oracle']
    if scene.is_dir():
        roots.extend(p for p in scene.iterdir() if p.is_dir())
    paths = set(Path(__file__).resolve().parent.glob('*.py'))
    for root in roots:
        if root.is_dir():
            paths.update(p.resolve() for p in root.glob('*.py'))
    return {str(p): _hash(p) for p in sorted(paths)}


def _static_inputs(provider):
    # machine and scene_native_runtime may already be imported by the compiler.
    # Track their immutable import-time inputs even when no read occurs in build.
    files = {}
    machine = provider.parent / 'full-reuse/oracle/machine.py'
    if machine.is_file():
        for node in ast.parse(machine.read_text()).body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'BINARY' for t in node.targets):
                call = node.value
                if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
                        and call.func.id == 'Path' and len(call.args) == 1
                        and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str)):
                    raise ValueError('Unrecognized native binary dependency; update cache contract')
                binary = Path(call.args[0].value).resolve(strict=True)
                files[str(binary)] = _hash(binary)
    symbols = provider.parent / 'walls/nm-all.txt'
    if symbols.is_file():
        files[str(symbols.resolve())] = _hash(symbols)
    try:
        distribution = importlib.metadata.distribution('unicorn')
        for file in distribution.files or []:
            if str(file).endswith(('.dylib', '.so', '.dll', 'METADATA')):
                path = Path(distribution.locate_file(file)).resolve()
                if path.is_file():
                    files[str(path)] = _hash(path)
    except importlib.metadata.PackageNotFoundError:
        pass  # Generic cache tests need no native runtime installed.
    return files


def _unchanged(files):
    try:
        return all(Path(p).is_file() and _hash(p) == digest for p, digest in files.items())
    except (OSError, ValueError):
        return False


def _references(source):
    """Snapshot all absolute file references, recursively following JSON reports."""
    files = {}
    seen_json = set()

    def visit(value):
        if isinstance(value, dict):
            # Declared digests are contracts, not merely a cache fingerprint.
            file = value.get('file', value.get('path'))
            digest = value.get('sha256')
            if isinstance(file, str) and Path(file).is_absolute() and isinstance(digest, str):
                if not Path(file).is_file() or _hash(file) != digest:
                    raise ValueError('Construction artifact digest mismatch: ' + file)
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, str) and value.startswith('/') and '\x00' not in value and len(value) < 4096:
            p = Path(value)
            if not p.is_file():
                return
            resolved = str(p.resolve())
            files[os.path.abspath(p)] = _hash(p)
            if p.suffix == '.json' and resolved not in seen_json:
                seen_json.add(resolved)
                visit(json.loads(p.read_text()))

    visit(source)
    return files


def _atomic_json(path, value):
    temp = path.with_name('.' + path.name + '.' + uuid.uuid4().hex + '.tmp')
    with temp.open('x') as stream:
        stream.write(_json(value) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def _get_or_build(construction, provider, cache_dir, build):
    """Return building_source.build-compatible source plus construction_cache.

    build(normalized_construction, empty_unique_directory) must return a JSON
    source containing an absolute bundle_path. Failed/stale generations remain
    untouched. A hit validates provider code, observed inputs and every saved
    bundle/report reference before returning; concurrent callers share one build.
    """
    started = time.perf_counter()
    provider = Path(provider).resolve(strict=True)
    cache = Path(cache_dir).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    # Object keys are canonical; array order (especially identity_order) remains
    # intentional and is never sorted or inferred from display ordering.
    normalized = json.loads(_json(construction))
    sources = _sources(provider)
    producer = build.func if isinstance(build, functools.partial) else build
    producer_path = inspect.getsourcefile(producer)
    producer_identity = {'module': producer.__module__, 'name': producer.__qualname__}
    if isinstance(build, functools.partial):
        def bound(value):
            if isinstance(value, Path):return str(value.resolve())
            if isinstance(value, dict):return {k:bound(v) for k,v in value.items()}
            if isinstance(value, (tuple,list)):return [bound(v) for v in value]
            return value
        producer_identity['arguments']=bound(build.args)
        producer_identity['keywords']=bound(build.keywords)
    if producer_path:
        producer_identity['file'] = str(Path(producer_path).resolve())
        producer_identity['sha256'] = _hash(producer_path)
    identity = {'producer': producer_identity, 'version': _VERSION, 'construction': normalized, 'provider': str(provider),
                'sources': sources, 'static_inputs': _static_inputs(provider), 'runtime': {'python': sys.version, 'executable': sys.executable,
                                               'platform': platform.platform(), 'machine': platform.machine()}}
    key = hashlib.sha256(_json(identity).encode()).hexdigest()
    indexes = cache / 'indexes'
    locks = cache / 'locks'
    objects = cache / 'objects'
    for folder in (indexes, locks, objects):
        folder.mkdir(exist_ok=True)
    index = indexes / (key + '.json')
    with (locks / (key + '.lock')).open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        record = None
        try:
            candidate = json.loads(index.read_text())
            if (candidate['key'] == key and candidate['identity'] == identity
                    and _unchanged(candidate['inputs']) and _unchanged(candidate['artifacts'])
                    and str(Path(candidate['source']['bundle_path']).resolve()) in candidate['artifacts']):
                record = candidate
        except (OSError, ValueError, KeyError, TypeError):
            pass
        hit = record is not None
        if not hit:
            generation = objects / (key + '-' + uuid.uuid4().hex)
            generation.mkdir()
            with _capture_reads(generation) as inputs:
                source = build(normalized, generation)
            source = json.loads(_json(source))
            bundle = Path(source['bundle_path'])
            if not bundle.is_absolute() or not bundle.is_relative_to(generation) or not bundle.is_file():
                raise ValueError('Builder must return its own existing absolute bundle_path')
            if (not _unchanged(inputs) or _sources(provider) != sources or not _unchanged(identity['static_inputs'])
                    or (producer_path and _hash(producer_path) != producer_identity['sha256'])):
                raise ValueError('Construction dependencies changed during build; result was not published')
            artifacts = _references(source)
            record = {'key': key, 'identity': identity, 'inputs': dict(inputs),
                      'artifacts': artifacts, 'source': source}
            _atomic_json(index, record)
        result = dict(record['source'])
        result['construction_cache'] = {'hit': hit, 'key': key, 'index': str(index),
                                        'elapsedMs': (time.perf_counter() - started) * 1000}
        return result


def get_or_build(construction, provider, cache_dir, build):
    """Reuse verified digests while the local filesystem identity is unchanged.

    ctime is included so restoring size/mtime after a write does not hide changes.
    Replacing a file changes inode; changing a symlink target changes the followed
    identity. This is an edit-time cache, not a forensic content re-audit. A failed
    build cannot publish updated digest metadata or a partial construction index.
    Concurrent writers may lose memo entries, which only costs a future hash.
    """
    if getattr(_digest_state, 'memo', None) is not None:
        raise RuntimeError('Nested digest sessions are unsupported')
    cache = Path(cache_dir).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / 'verified-fingerprints-v1.json'
    try:
        memo = json.loads(path.read_text())
        if not isinstance(memo, dict):memo = {}
    except (OSError, ValueError):
        memo = {}
    _digest_state.memo = memo
    try:
        result = _get_or_build(construction, provider, cache_dir, build)
        _atomic_json(path, memo)
        return result
    finally:
        _digest_state.memo = None
