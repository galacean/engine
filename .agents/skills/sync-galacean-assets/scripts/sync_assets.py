#!/usr/bin/env python3
"""Bounded, resumable OSS -> AFTS publisher. Only --apply publishes or changes project config."""
from __future__ import annotations
import argparse
import contextlib
import dataclasses
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote

CHUNK = 1024 * 1024
DESCRIPTION_LIMIT = 256 * 1024
CATALOG_BYTES_LIMIT = 64 * CHUNK
ASSET_FILES_LIMIT = 10000
EXCLUDED = 'assets/gamedesign/'


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(value).hexdigest()


def hash_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(CHUNK), b''):
            h.update(chunk)
    return h.hexdigest()


def valid_key(key):
    if (not key.startswith('assets/') or any(c in key for c in '\\?#')
            or any(ord(c) < 32 or ord(c) == 127 for c in key)
            or any(p in ('', '.', '..') for p in key.split('/'))):
        raise ValueError(f'Unsupported OSS key: {key!r}')
    return key


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(packed(value) + '\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        Path(tmp).unlink(missing_ok=True)


@dataclasses.dataclass(frozen=True)
class Obj:
    key: str
    mtime: int
    etag: str
    size: int


class OssSource:
    def __init__(self, endpoint, bucket):
        import oss2
        self.oss2 = oss2
        self.bucket = oss2.Bucket(oss2.Auth(os.environ['GAME_FACTORY_OSS_ACCESS_KEY_ID'],
            os.environ['GAME_FACTORY_OSS_ACCESS_KEY_SECRET']), endpoint, bucket, connect_timeout=60)

    def _retry_transport(self, operation):
        # OSS wraps errors while opening a request, but streamed response reads
        # propagate requests exceptions directly (including list response XML).
        from requests.exceptions import ConnectionError as RequestsConnectionError, Timeout, ChunkedEncodingError
        for attempt in range(3):
            try:
                return operation()
            except Exception as error:
                transient = isinstance(error, (self.oss2.exceptions.RequestError, RequestsConnectionError,
                    Timeout, ChunkedEncodingError)) or getattr(error, 'status', None) in (408, 429, 500, 502, 503, 504)
                if not transient or attempt == 2:
                    raise
                time.sleep(2 ** attempt)

    def objects(self, prefix):
        token = ''
        while True:
            page = self._retry_transport(lambda: self.bucket.list_objects_v2(prefix=prefix, continuation_token=token, max_keys=1000))
            for o in page.object_list:
                if not o.key.endswith('/') and not o.key.startswith(EXCLUDED):
                    yield Obj(valid_key(o.key), int(o.last_modified), o.etag.strip('"'), o.size)
            if not page.is_truncated:
                return
            if not page.next_continuation_token or page.next_continuation_token == token:
                raise RuntimeError('OSS pagination did not advance')
            token = page.next_continuation_token

    def download(self, obj, destination, limit):
        # Retry the whole stream into the same bounded temp file. Never accept a
        # partial read or retry an object whose version changed during transfer.
        return self._retry_transport(lambda: self._download_once(obj, destination, limit))

    def _download_once(self, obj, destination, limit):
        if obj.size > limit:
            raise RuntimeError(f'File exceeds {limit} byte limit: {obj.key}')
        response = self.bucket.get_object(obj.key, headers={'If-Match': obj.etag})
        try:
            size = 0
            with open(destination, 'wb') as f:
                while True:
                    chunk = response.read(CHUNK)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit or size > obj.size:
                        raise RuntimeError(f'OSS object changed or exceeds budget: {obj.key}')
                    f.write(chunk)
            headers = response.headers
            if size != obj.size or headers.get('ETag', '').strip('"') != obj.etag:
                raise RuntimeError(f'OSS object changed during download: {obj.key}')
            head = self.bucket.head_object(obj.key)
            if (head.etag.strip('"'), int(head.last_modified), head.content_length) != (obj.etag, obj.mtime, obj.size):
                raise RuntimeError(f'OSS object changed during download: {obj.key}')
        finally:
            response.close()


class Afts:
    def __init__(self, origin):
        import httpx
        self.client = httpx.Client(timeout=httpx.Timeout(120, connect=20), follow_redirects=True)
        self.appid = os.environ.get('AFTS_APPID', 'apwallet')
        self.bizkey = os.environ.get('AFTS_BIZKEY', 'asap_serivce')
        self.secret = os.environ['AFTS_BIZSECRET']
        self.origin = origin
        self.base = os.environ.get('AFTS_PUBLIC_URL_BASE', 'https://mdn.alipayobjects.com').rstrip('/')
        self.token = None
        self.expires = 0

    def close(self):
        self.client.close()

    def url(self, alias):
        return f'{self.base}/{self.bizkey}/uri/file/as/{quote(alias, safe="/")}'

    def get_token(self):
        if self.token and time.monotonic() < self.expires:
            return self.token
        ts = str(int(time.time() * 1000))
        sign = hashlib.md5(f'{self.appid}{self.bizkey}{ts}{self.secret}'.encode()).hexdigest()
        def token(endpoint, params):
            try:
                r = self.client.get(endpoint, params=params)
                r.raise_for_status()
                body = r.json()
            except Exception:
                raise RuntimeError('AFTS token request failed (credentials and URL redacted)') from None
            if str(body.get('code')) != '0':
                raise RuntimeError('AFTS token service rejected the request')
            value = body.get('data')
            value = value.get('token') if isinstance(value, dict) else value
            if not isinstance(value, str) or not value:
                raise RuntimeError('AFTS token response is missing a token')
            return value
        op = token(os.environ.get('AFTS_OP_TOKEN_URL', 'https://mmtcapi.alipay.com/token/1.0/op'),
                   dict(appId=self.appid, bizKey=self.bizkey, timestamp=ts, sign=sign))
        self.token = token(os.environ.get('AFTS_MASS_TOKEN_URL', 'https://mmtcapi.alipay.com/token/1.0/mass'),
                          dict(appId=self.appid, bizKey=self.bizkey, opToken=op, massType=1, expireTime=3600))
        self.expires = time.monotonic() + 3300
        return self.token

    def verify(self, url, sha, size):
        self.verify_error = None
        try:
            with self.client.stream('GET', url, headers={'Origin': self.origin}) as response:
                if response.status_code != 200:
                    self.verify_error = f'CDN HTTP {response.status_code}'
                    return False
                if response.headers.get('access-control-allow-origin') not in ('*', self.origin):
                    raise RuntimeError('CDN does not allow the configured browser origin')
                # index .bin already contains gzip; transport must not decompress it a second time.
                if url.endswith('.bin') and response.headers.get('content-encoding', 'identity') != 'identity':
                    raise RuntimeError('CDN changed encoding of the compressed index')
                h, received = hashlib.sha256(), 0
                for chunk in response.iter_bytes(CHUNK):
                    received += len(chunk)
                    if received > size:
                        self.verify_error = 'CDN byte length exceeds source'
                        return False
                    h.update(chunk)
                valid = received == size and h.hexdigest() == sha
                if not valid:
                    self.verify_error = 'CDN byte length or SHA-256 differs from source'
                return valid
        except RuntimeError:
            raise
        except Exception as error:
            self.verify_error = f'CDN transport {type(error).__name__}'
            return False

    def upload(self, path, alias, sha):
        url, size = self.url(alias), path.stat().st_size
        # AFTS stores the URI path spelling. Raw Unicode aliases return business
        # error 607; encode the wire alias once, matching the public URL path.
        upload_alias = quote(alias, safe="/")
        # Immutable alias; retries never overwrite a previously published object.
        failure = 'unknown'
        for attempt in range(3):
            upload_status = 'no response'
            mt = self.get_token()
            try:
                with open(path, 'rb') as f:
                    r = self.client.post(os.environ.get('AFTS_UPLOAD_URL', 'http://mass.alipay.com/file/auth/upload'),
                        params=dict(mt=mt, bizType=self.bizkey, setpublic='true', alias=upload_alias),
                        headers={'x-mass-token': mt, 'x-mass-biztype': self.bizkey,
                                 'x-mass-public': 'true', 'x-mass-ext-name': path.suffix.lstrip('.') or 'bin'},
                        files={upload_alias: (path.name, f, 'application/octet-stream')})
                    upload_status = f'HTTP {r.status_code}'
                    # A conflict or lost upload response is recoverable only by proving exact CDN bytes.
                    if r.status_code in (401, 403):
                        self.expires = 0
            except Exception as error:
                upload_status = type(error).__name__
            if self.verify(url, sha, size):
                return url
            failure = f'upload {upload_status}; {self.verify_error}'
            if attempt < 2:
                time.sleep(2 ** attempt)
        raise RuntimeError(f'AFTS upload/CDN verification failed after 3 attempts: {alias} ({failure})')


class State:
    def __init__(self, directory):
        self.root = Path(directory).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = open(self.root / 'sync.lock', 'a')
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise RuntimeError('Another sync is using this state directory') from None
        self.db = sqlite3.connect(self.root / 'state.sqlite3')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          PRAGMA journal_mode=DELETE;
          PRAGMA cache_size=-8192;
          PRAGMA temp_store=FILE;
          CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS uploads (alias TEXT PRIMARY KEY, sha TEXT, size INTEGER, url TEXT);
          CREATE TABLE IF NOT EXISTS assets (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, source TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS local_assets (key TEXT PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS scan (key TEXT PRIMARY KEY, mtime INTEGER, etag TEXT, size INTEGER, owner TEXT);
          CREATE INDEX IF NOT EXISTS scan_owner ON scan(owner);
        ''')
        self.source_bytes = self.db.execute('SELECT COALESCE(SUM(length(CAST(source AS BLOB))),0) FROM assets').fetchone()[0]
        self.tmp = self.root / 'tmp'
        if self.tmp.is_symlink():
            raise RuntimeError('Sync tmp must not be a symlink')
        self.tmp.mkdir(exist_ok=True)
        for p in list(self.tmp.glob('run-*')) + list(self.tmp.glob('catalog-*')):
            if p.is_symlink() or p.is_file():
                p.unlink()
            else:
                shutil.rmtree(p)

    def close(self):
        self.db.close()
        self.lock.close()

    def get(self, key):
        row = self.db.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def set(self, key, value):
        self.db.execute('INSERT OR REPLACE INTO meta VALUES (?,?)', (key, packed(value)))
        self.db.commit()

    def scan(self, source, prefix):
        self.db.execute('DELETE FROM scan')
        count = 0
        for obj in source.objects(prefix):
            if obj.key.startswith(EXCLUDED) or not obj.key.startswith(prefix):
                continue
            valid_key(obj.key)
            self.db.execute('INSERT INTO scan VALUES (?,?,?,?,NULL)', dataclasses.astuple(obj))
            count += 1
            if count % 1000 == 0:
                self.db.commit()
        self.db.commit()
        # Nearest enclosing describe.json owns the file. Nested assets are separate units.
        for row in self.db.execute('SELECT key FROM scan ORDER BY key'):
            key = row['key']
            directory = key.rsplit('/', 1)[0]
            while directory.startswith('assets/'):
                owner = directory + '/describe.json'
                if self.db.execute('SELECT 1 FROM scan WHERE key=?', (owner,)).fetchone():
                    self.db.execute('UPDATE scan SET owner=? WHERE key=?', (owner, key))
                    break
                directory = directory.rsplit('/', 1)[0]
        self.db.commit()
        return count

    def objects(self, key):
        return bounded_objects(Obj(r['key'], r['mtime'], r['etag'], r['size']) for r in self.db.execute(
            'SELECT * FROM scan WHERE owner=? ORDER BY key', (key,)))


def bounded_objects(objects):
    result = []
    for obj in objects:
        if len(result) >= ASSET_FILES_LIMIT:
            raise RuntimeError('Asset exceeds the 10000-file metadata budget')
        result.append(obj)
    return result


def fingerprint(objects):
    return digest(packed([dataclasses.astuple(o) for o in sorted(objects, key=lambda o: o.key)]).encode())


def upload_file(state, cdn, path, alias):
    sha, size = hash_file(path), path.stat().st_size
    old = state.db.execute('SELECT * FROM uploads WHERE alias=?', (alias,)).fetchone()
    if old:
        if (old['sha'], old['size'], old['url']) != (sha, size, cdn.url(alias)):
            raise RuntimeError('Immutable alias collision')
        return old['url']
    url = cdn.upload(path, alias, sha)
    if url != cdn.url(alias):
        raise RuntimeError('Unexpected CDN URL')
    state.db.execute('INSERT INTO uploads VALUES (?,?,?,?)', (alias, sha, size, url))
    state.db.commit()
    return url


def publish_asset(state, source, cdn, key, objects, revision, work, args):
    directory = key.rsplit('/', 1)[0] + '/'
    namespace = f'{args.cdn_prefix}/assets/{digest(directory.encode())}/{revision}'
    resources, metadata, description_url = [], None, None
    for obj in objects:
        alias = namespace + '/' + obj.key[len(directory):]
        cached = state.db.execute('SELECT url FROM uploads WHERE alias=?', (alias,)).fetchone()
        # Reuse a verified upload after interruption; describe is needed to reconstruct metadata.
        if cached and obj.key != key:
            resources.append(dict(path=obj.key, url=cached['url']))
            continue
        if obj.size > args.max_file_bytes or shutil.disk_usage(work).free < obj.size + 64 * CHUNK:
            raise RuntimeError(f'File exceeds disk budget or free space: {obj.key}')
        suffix = PurePosixPath(obj.key).suffix
        path = work / ('payload' + suffix)
        try:
            source.download(obj, path, min(args.max_file_bytes, DESCRIPTION_LIMIT) if obj.key == key else args.max_file_bytes)
            if obj.key == key:
                metadata = json.loads(path.read_text('utf-8'))
                if not isinstance(metadata, dict):
                    raise ValueError(f'Description is not an object: {key}')
                declared = metadata.get('assetPaths')
                if not isinstance(declared, list) or not declared:
                    raise ValueError(f'Description needs assetPaths: {key}')
                declared = declared + ([metadata['manifestPath']] if metadata.get('manifestPath') else [])
                known = {o.key for o in objects if o.key != key}
                if any(not isinstance(p, str) or p not in known for p in declared):
                    raise ValueError(f'Declared resource missing or outside asset: {key}')
            url = upload_file(state, cdn, path, alias)
            if obj.key == key:
                description_url = url
            else:
                resources.append(dict(path=obj.key, url=url))
        finally:
            path.unlink(missing_ok=True)
    # Detect changes during download/upload, including a newly added file.
    current = bounded_objects(source.objects(directory))
    nested = [o.key.rsplit('/', 1)[0] + '/' for o in current if o.key.endswith('/describe.json') and o.key != key]
    current = [o for o in current if not any(o.key.startswith(p) for p in nested)]
    if fingerprint(current) != revision:
        raise RuntimeError(f'Asset changed during sync; retry next run: {key}')
    result = dict(key=key, metadata=metadata, descriptionUrl=description_url, resources=resources)
    encoded = packed(result)
    previous = state.db.execute('SELECT length(CAST(source AS BLOB)) FROM assets WHERE key=?', (key,)).fetchone()
    new_size = state.source_bytes - (previous[0] if previous else 0) + len(encoded.encode())
    if new_size > CATALOG_BYTES_LIMIT:
        raise RuntimeError('Catalog metadata exceeds the 64 MiB storage/build budget')
    state.db.execute('INSERT OR REPLACE INTO assets VALUES (?,?,?)', (key, revision, encoded))
    state.source_bytes = new_size
    state.db.commit()


def build_catalog(state, work, project):
    input_file, output = work / 'sources.jsonl', work / 'catalog'
    output.mkdir()
    size = 0
    with open(input_file, 'w') as f:
        for row in state.db.execute('SELECT source FROM assets ORDER BY key'):
            line = row[0] + '\n'
            size += len(line.encode())
            if size > CATALOG_BYTES_LIMIT:
                raise RuntimeError('Catalog metadata exceeds the 64 MiB build budget')
            f.write(line)
    result = subprocess.run(['node', '--max-old-space-size=512', str(Path(__file__).with_name('catalog.mjs')),
        str(project), str(input_file), str(output)], capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError('Project catalog builder failed: ' + result.stderr[-2000:])
    return output


def sync(state, source, cdn, args, builder=build_catalog):
    pending = state.get('pendingIntake')
    if pending:
        raise RuntimeError('An asset intake is unfinished; resume its approved batch before syncing')
    started = int(time.time())
    cutoff = started - args.settle_seconds
    config = Path(args.config)
    before = config.read_bytes() if config.exists() else None
    config_data = json.loads(before) if before else {}
    if not isinstance(config_data, dict):
        raise ValueError('Project catalog config must be a JSON object')
    identity = dict(bucket=args.bucket, endpoint=args.endpoint, prefix=args.prefix,
                    cdnPrefix=args.cdn_prefix, publicBase=cdn.base if cdn else args.public_base, bizkey=args.bizkey,
                    browserOrigin=args.browser_origin)
    previous = state.get('identity')
    if previous and previous != identity:
        raise RuntimeError('Source/CDN identity differs from this sync directory; use another state directory')
    total = state.scan(source, args.prefix)
    changed, deferred, unchanged = [], [], 0
    for row in state.db.execute("SELECT key FROM scan WHERE key LIKE '%/describe.json' ORDER BY key"):
        key = row['key']
        objects = state.objects(key)
        fp = fingerprint(objects)
        old = state.db.execute('SELECT fingerprint FROM assets WHERE key=?', (key,)).fetchone()
        if old and old[0] == fp:
            unchanged += 1
        elif any(o.mtime > cutoff for o in objects):
            deferred.append(key)
        else:
            changed.append(key)
    for row in state.db.execute('SELECT key FROM local_assets'):
        prefix = row[0][:-len('describe.json')]
        if state.db.execute('SELECT 1 FROM scan WHERE key>=? AND key<? LIMIT 1',(prefix,prefix[:-1]+'0')).fetchone():
            raise RuntimeError('OSS files collide with a locally published asset: ' + row[0])
    removed = [r[0] for r in state.db.execute('SELECT key FROM assets WHERE key NOT IN (SELECT key FROM scan) AND key NOT IN (SELECT key FROM local_assets)')]
    report = dict(scannedObjects=total, changedAssets=len(changed), unchangedAssets=unchanged,
        deferredAssets=len(deferred), removedAssets=len(removed), cutoff=cutoff,
        previousSuccessfulCutoff=state.get('successfulCutoff'), mode='apply' if args.apply else 'plan',
        changedSourceBytes=sum(o.size for key in changed for o in state.objects(key)))
    if not args.apply:
        return report
    state.set('identity', identity)
    with tempfile.TemporaryDirectory(prefix='run-', dir=state.tmp) as directory:
        work = Path(directory)
        for key in changed:
            objects = state.objects(key)
            publish_asset(state, source, cdn, key, objects, fingerprint(objects), work, args)
            print(packed(dict(asset=key, status='uploaded-and-cleaned')), flush=True)
        # Removal only affects the next catalog. No OSS/CDN object is deleted.
        state.db.executemany('DELETE FROM assets WHERE key=?', [(key,) for key in removed])
        state.db.commit()
        state.source_bytes = state.db.execute('SELECT COALESCE(SUM(length(CAST(source AS BLOB))),0) FROM assets').fetchone()[0]
        if not state.db.execute('SELECT 1 FROM assets LIMIT 1').fetchone():
            raise RuntimeError('No publishable assets; existing runtime requires a nonempty catalog')
        publication = publish_catalog(state, cdn, args, builder, before)
        state.set('successfulCutoff', cutoff)
        report.update(publication)
    state.set('lastReport', report)
    return report


_UNSET = object()

def publish_catalog(state, cdn, args, builder=build_catalog, before=_UNSET):
    """Publish the merged registry once; source discovery belongs to the caller."""
    config=Path(args.config)
    if before is _UNSET: before=config.read_bytes() if config.exists() else None
    config_data=json.loads(before) if before else {}
    if not isinstance(config_data,dict): raise ValueError('Project catalog config must be a JSON object')
    with tempfile.TemporaryDirectory(prefix='catalog-',dir=state.tmp) as directory:
        work=Path(directory)
        catalog=builder(state,work,Path(args.project))
        manifest=catalog/'manifest.json'
        for file in sorted(catalog.rglob('*')):
            if file.is_file() and file!=manifest:
                upload_file(state,cdn,file,args.cdn_prefix+'/catalog/'+file.relative_to(catalog).as_posix())
                file.unlink()
        sha=hash_file(manifest)
        url=upload_file(state,cdn,manifest,f'{args.cdn_prefix}/catalog/{sha}.json')
        if (config.read_bytes() if config.exists() else None)!=before:
            raise RuntimeError('Project config changed during publication; cancelled')
        config_data['manifestUrl']=url
        atomic_json(config,config_data)
        state.set('manifestUrl',url)
        return dict(manifestUrl=url,corpusHash=sha,publishedAssets=state.db.execute('SELECT COUNT(*) FROM assets').fetchone()[0])


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project', required=True, help='Target engine checkout; must contain current retrieval builder and installed workspace dependencies')
    p.add_argument('--state-dir', required=True, help='Dedicated directory outside the project; persists between runs')
    p.add_argument('--config', help='Runtime JSON config; default packages/retrieval/src/retrieval/catalog.json')
    p.add_argument('--endpoint', default='https://oss-cn-hangzhou.aliyuncs.com')
    p.add_argument('--bucket', default='galaceanoss')
    p.add_argument('--prefix', default='assets/')
    p.add_argument('--cdn-prefix', default='galacean-retrieval/v1')
    p.add_argument('--browser-origin', default='http://127.0.0.1:4173')
    p.add_argument('--max-file-bytes', type=int, default=512 * CHUNK)
    p.add_argument('--settle-seconds', type=int, default=60)
    p.add_argument('--apply', action='store_true', help='Upload increment and publish config; otherwise only scan/plan')
    return p


def main():
    args = parser().parse_args()
    project = Path(args.project).expanduser().resolve()
    state_dir = Path(args.state_dir).expanduser().resolve()
    if state_dir == project or project in state_dir.parents:
        raise ValueError('Sync directory must be outside the project')
    if (not args.prefix.startswith('assets/') or not args.prefix.endswith('/')
            or args.prefix.startswith(EXCLUDED) or any(p in ('.', '..') for p in args.prefix.split('/'))):
        raise ValueError('Prefix must be an assets/ directory excluding gamedesign/')
    if not args.cdn_prefix or any(p in ('', '.', '..') for p in args.cdn_prefix.split('/')):
        raise ValueError('Invalid CDN prefix')
    if args.max_file_bytes <= 0 or args.settle_seconds < 0:
        raise ValueError('Invalid resource/time budget')
    if args.prefix != 'assets/' and not args.config:
        raise ValueError('Scoped sync requires an explicit --config; do not replace the full project catalog with a subset')
    args.project = str(project)
    args.config = str(Path(args.config).expanduser().resolve()) if args.config else str(project / 'packages/retrieval/src/retrieval/catalog.json')
    config_path = Path(args.config)
    if config_path == state_dir or state_dir in config_path.parents:
        raise ValueError('Runtime config must be outside the synchronization state directory')
    args.bizkey = os.environ.get('AFTS_BIZKEY', 'asap_serivce')
    args.public_base = os.environ.get('AFTS_PUBLIC_URL_BASE', 'https://mdn.alipayobjects.com').rstrip('/')
    if args.apply:
        preflight = subprocess.run(['node', '--max-old-space-size=512',
            str(Path(__file__).with_name('catalog.mjs')), str(project), '--check'],
            capture_output=True, text=True, timeout=30)
        if preflight.returncode:
            raise RuntimeError('Target project catalog builder/dependencies unavailable: ' + preflight.stderr[-1500:])
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    with contextlib.ExitStack() as stack:
        state = State(state_dir)
        stack.callback(state.close)
        source = OssSource(args.endpoint, args.bucket)
        cdn = Afts(args.browser_origin) if args.apply else None
        if cdn:
            stack.callback(cdn.close)
        report = sync(state, source, cdn, args)
        print(packed(report))


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        # Transport exceptions can contain signed URLs. Do not log arbitrary SDK exception text.
        message = str(error) if isinstance(error, (RuntimeError, ValueError, sqlite3.Error)) else type(error).__name__
        print(packed(dict(status='failed', error=message)), file=sys.stderr)
        sys.exit(1)
