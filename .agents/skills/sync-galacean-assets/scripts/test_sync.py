#!/usr/bin/env python3
import contextlib
import dataclasses
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import sync_assets as s


class Source:
    def __init__(self):
        self.values = {}
        self.downloads = []
        self.after_download = None

    def put(self, key, body, mtime=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.values[key] = (body, int(time.time()) - 100 if mtime is None else mtime)

    def objects(self, prefix):
        for key, (data, mtime) in sorted(self.values.items()):
            if key.startswith(prefix) and not key.startswith(s.EXCLUDED):
                yield s.Obj(key, mtime, hashlib.md5(data).hexdigest(), len(data))

    def download(self, obj, path, limit):
        self.downloads.append(obj.key)
        data = self.values[obj.key][0]
        if len(data) > limit:
            raise RuntimeError('File too big')
        path.write_bytes(data)
        if self.after_download:
            self.after_download(obj)


class Cdn:
    base = 'https://cdn.test'
    def __init__(self, root):
        self.root = root
        self.calls = []
        self.fail = None
        self.hook = None

    def url(self, alias):
        return self.base + '/' + alias

    def upload(self, path, alias, sha):
        if self.fail and self.fail(alias):
            raise RuntimeError('Injected upload failure')
        if self.hook:
            self.hook(path, alias)
        self.calls.append(alias)
        self.assert_hash = s.hash_file(path) == sha
        target = self.root / alias
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != path.read_bytes():
            raise RuntimeError('Attempted immutable overwrite')
        target.write_bytes(path.read_bytes())
        return self.url(alias)


def builder(state, work, project):
    out = work / 'catalog'
    out.mkdir()
    # Deterministic stand-in for orchestration tests; real project builder is tested separately.
    sources = [json.loads(row[0]) for row in state.db.execute('SELECT source FROM assets ORDER BY key')]
    body = s.packed(sources).encode()
    part = 'summaries/' + s.digest(body) + '.json'
    (out / 'summaries').mkdir()
    (out / part).write_bytes(body)
    (out / 'manifest.json').write_text(s.packed({'count':len(sources), 'path':part}))
    return out


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = s.State(self.root / 'state')
        self.source = Source()
        self.cdn = Cdn(self.root / 'cdn')
        self.args = SimpleNamespace(project=str(self.root / 'project'), config=str(self.root / 'project/catalog.json'),
            endpoint='https://oss.test', bucket='test', prefix='assets/', cdn_prefix='retrieval/v1',
            public_base=self.cdn.base, bizkey='test', browser_origin='https://app.test',
            max_file_bytes=1024*1024, settle_seconds=0, apply=True)
        self.key = 'assets/model/tree/describe.json'
        self.source.put(self.key, {'assetType':'model','assetPaths':['assets/model/tree/tree.gltf'],
            'overview':{'name':'测试树木','description':'一棵树','tags':['树木']}})
        self.source.put('assets/model/tree/tree.gltf', {'buffers':[{'uri':'data/tree.bin'}]})
        self.source.put('assets/model/tree/data/tree.bin', b'binary-tree')
        self.source.put('assets/model/tree/README.md', b'# Tree')
        self.source.put('assets/gamedesign/blueprint/describe.json', {'invalid':True})

    def tearDown(self):
        self.state.close()
        self.temp.cleanup()

    def run_sync(self, build=builder):
        with open(os.devnull, 'w') as sink, contextlib.redirect_stdout(sink):
            return s.sync(self.state,self.source,self.cdn,self.args,build)

    def assert_clean(self):
        self.assertEqual(list(self.state.tmp.iterdir()), [])

    def test_first_incremental_idempotency_and_relative_paths(self):
        report = self.run_sync()
        self.assertEqual(report['publishedAssets'],1)
        self.assertEqual(len(self.source.downloads),4)
        source = json.loads(self.state.db.execute('SELECT source FROM assets').fetchone()[0])
        urls = {r['path']:r['url'] for r in source['resources']}
        from urllib.parse import urljoin
        self.assertEqual(urljoin(urls['assets/model/tree/tree.gltf'],'data/tree.bin'),urls['assets/model/tree/data/tree.bin'])
        config = Path(self.args.config).read_bytes()
        self.cdn.calls.clear(); self.source.downloads.clear()
        report = self.run_sync()
        self.assertEqual(report['changedAssets'],0)
        self.assertEqual(self.source.downloads,[])
        self.assertEqual(self.cdn.calls,[])
        self.assertEqual(Path(self.args.config).read_bytes(),config)
        self.assert_clean()

    def test_binary_only_update_and_same_timestamp_changes(self):
        self.run_sync()
        before = Path(self.args.config).read_bytes()
        self.source.put('assets/model/tree/data/tree.bin',b'new-binary-same-timestamp')
        self.source.downloads.clear()
        result = self.run_sync()
        self.assertEqual(result['changedAssets'],1)
        self.assertIn(self.key,self.source.downloads)
        self.assertNotEqual(Path(self.args.config).read_bytes(),before)
        self.assert_clean()

    def test_failure_keeps_project_and_watermark_then_resume(self):
        self.run_sync()
        before = Path(self.args.config).read_bytes()
        cutoff = self.state.get('successfulCutoff')
        self.source.put('assets/model/tree/README.md', b'changed')
        self.cdn.fail = lambda alias: '/catalog/' in alias
        with self.assertRaisesRegex(RuntimeError,'Injected'):
            self.run_sync()
        self.assertEqual(Path(self.args.config).read_bytes(),before)
        self.assertEqual(self.state.get('successfulCutoff'),cutoff)
        self.assert_clean()
        self.cdn.fail = None; self.source.downloads.clear()
        self.run_sync()
        self.assertEqual(self.source.downloads,[])
        self.assertNotEqual(Path(self.args.config).read_bytes(),before)

    def test_files_deleted_after_each_upload_and_on_interrupt(self):
        def inspect(path, alias):
            if '/assets/' in alias:
                self.assertEqual(len(list(path.parent.glob('payload*'))),1)
                if alias.endswith('tree.gltf'):
                    raise KeyboardInterrupt()
        self.cdn.hook = inspect
        with self.assertRaises(KeyboardInterrupt):
            self.run_sync()
        self.assertFalse(Path(self.args.config).exists())
        self.assert_clean()
        self.cdn.hook = None
        self.run_sync()
        self.assert_clean()

    def test_source_changes_during_sync_do_not_publish(self):
        def change(obj):
            self.source.put('assets/model/tree/new.txt',b'new')
        self.source.after_download = change
        with self.assertRaisesRegex(RuntimeError,'changed during sync'):
            self.run_sync()
        self.assertFalse(Path(self.args.config).exists())
        self.assert_clean()

    def test_recent_change_deferred_and_next_run_detects_it(self):
        self.run_sync()
        before = Path(self.args.config).read_bytes()
        self.source.put('assets/model/tree/tree.gltf',b'updated',int(time.time())+100)
        report = self.run_sync()
        self.assertEqual(report['deferredAssets'],1)
        self.assertEqual(Path(self.args.config).read_bytes(),before)
        with patch.object(s.time,'time',return_value=time.time()+200):
            report = self.run_sync()
        self.assertEqual(report['changedAssets'],1)

    def test_dry_run_missing_resource_and_config_race(self):
        self.args.apply = False
        self.run_sync()
        self.assertFalse(self.cdn.calls)
        self.assertFalse(self.source.downloads)
        self.assertFalse(Path(self.args.config).exists())
        self.args.apply = True
        del self.source.values['assets/model/tree/tree.gltf']
        with self.assertRaisesRegex(ValueError,'missing or outside'):
            self.run_sync()
        self.assert_clean()
        self.source.put('assets/model/tree/tree.gltf',b'restored')
        def race(path,alias):
            if '/catalog/' in alias:
                s.atomic_json(self.args.config,{'manifestUrl':'https://other.test/manifest.json'})
        self.cdn.hook = race
        with self.assertRaisesRegex(RuntimeError,'config changed'):
            self.run_sync()
        self.assertEqual(json.loads(Path(self.args.config).read_text())['manifestUrl'],'https://other.test/manifest.json')
        self.assertIsNone(self.state.get('successfulCutoff'))
        self.assert_clean()

    def test_removal_changes_catalog_without_deleting_cdn(self):
        self.source.put('assets/model/other/describe.json',{'assetPaths':['assets/model/other/a.bin']})
        self.source.put('assets/model/other/a.bin',b'other')
        self.run_sync()
        old_files = set(p for p in self.cdn.root.rglob('*') if p.is_file())
        del self.source.values[self.key]
        result = self.run_sync()
        self.assertEqual(result['removedAssets'],1)
        self.assertEqual(result['publishedAssets'],1)
        self.assertTrue(all(p.exists() for p in old_files))

    def test_lock_namespace_and_size_limits(self):
        with self.assertRaisesRegex(RuntimeError,'Another sync'):
            s.State(self.state.root)
        self.run_sync()
        self.args.bucket='other'
        with self.assertRaisesRegex(RuntimeError,'identity differs'):
            self.run_sync()
        self.args.bucket='test';self.args.max_file_bytes=3
        self.source.put('assets/model/tree/README.md',b'changed')
        with self.assertRaisesRegex(RuntimeError,'budget'):
            self.run_sync()
        self.assert_clean()

    def test_total_metadata_and_per_asset_file_budgets_fail_without_publication(self):
        with patch.object(s, 'CATALOG_BYTES_LIMIT', 100):
            with self.assertRaisesRegex(RuntimeError, 'storage/build budget'):
                self.run_sync()
        self.assertFalse(Path(self.args.config).exists())
        self.assert_clean()
        with patch.object(s, 'ASSET_FILES_LIMIT', 2):
            with self.assertRaisesRegex(RuntimeError, 'file metadata budget'):
                self.run_sync()
        self.assert_clean()

    @unittest.skipUnless(os.environ.get('RETRIEVAL_TEST_PROJECT'),'Set RETRIEVAL_TEST_PROJECT to verify the real catalog builder/consumer')
    def test_real_builder_and_runtime_read_the_published_catalog(self):
        self.args.project = os.environ['RETRIEVAL_TEST_PROJECT']
        result = self.run_sync(s.build_catalog)
        # Read actual artifact format with the project's runtime consumer, not a duplicated validator.
        js = '''import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {readFile} from 'node:fs/promises';
const [project,cdn,url]=process.argv.slice(1);const req=createRequire(project+'/packages/retrieval/package.json');
const {require:tsxRequire}=req('tsx/cjs/api');
const {RetrievalLibrary}=tsxRequire(project+'/packages/retrieval/src/retrieval/src/library.ts',import.meta.url);
const storage={read:async url=>new Uint8Array(await readFile(cdn+decodeURI(new URL(url).pathname)))};
const library=await RetrievalLibrary.open(url,{storage});const hits=await library.searchAssets({query:'树木'});
if(hits.matches.length!==1)throw Error('Expected one tree');
const details=await library.readAssetDescriptions({descriptionPaths:[hits.matches[0].descriptionPath]});
if(details.matches[0].metadata.overview.name!=='测试树木')throw Error('Wrong description');console.log('runtime roundtrip passed');'''
        completed = subprocess.run(['node','--input-type=module','-e',js,self.args.project,str(self.cdn.root),result['manifestUrl']],capture_output=True,text=True)
        self.assertEqual(completed.returncode,0,completed.stderr)
        self.assert_clean()


class AftsTests(unittest.TestCase):
    def test_streaming_upload_tokens_and_cdn_verification(self):
        import httpx
        payload=b'hello resource';store={};counts={'op':0,'mass':0}
        def handle(request):
            url=str(request.url)
            if '/token/1.0/op' in url:
                counts['op']+=1
                return httpx.Response(200,json={'code':'0','data':{'token':'op'}})
            if '/token/1.0/mass' in url:
                counts['mass']+=1
                return httpx.Response(200,json={'code':0,'data':'mass'})
            if request.method=='POST':
                alias=request.url.params['alias']
                body=request.read()
                self.assertIn(payload,body)
                self.assertEqual(request.headers['x-mass-public'],'true')
                store['/asap_serivce/uri/file/as/'+alias]=payload
                return httpx.Response(200,json={'code':0})
            data=store.get(request.url.raw_path.decode().split('?')[0])
            return httpx.Response(200 if data else 404,content=data or b'',headers={'access-control-allow-origin':'*'})
        with patch.dict(os.environ,{'AFTS_BIZSECRET':'test-only-not-a-real-secret'}),tempfile.TemporaryDirectory() as d:
            afts=s.Afts('https://app.test');afts.client.close();afts.client=httpx.Client(transport=httpx.MockTransport(handle))
            try:
                p=Path(d)/'test.txt';p.write_bytes(payload)
                for name in ['one.txt','two.txt','背景 音乐.txt','100%.txt']:
                    afts.upload(p,'test/'+name,s.hash_file(p))
                self.assertEqual(counts,{'op':1,'mass':1})
                self.assertFalse(afts.verify(afts.url('test/one.txt'),'0'*64,len(payload)))
            finally:afts.close()


class TransportRetryTests(unittest.TestCase):
    def test_sdk_stream_disconnect_restarts_file_without_appending_partial_bytes(self):
        import oss2
        from oss2.http import Response
        from requests.exceptions import ConnectionError
        source = object.__new__(s.OssSource)
        source.oss2 = oss2
        payload = b'complete-data'
        opened, closed = [], []
        def get_object(key, headers):
            attempt = len(opened)
            opened.append(key)
            def chunks():
                if attempt == 0:
                    yield payload[:4]
                    raise ConnectionError('stream disconnected')
                yield payload
            stream = chunks()
            raw = SimpleNamespace(status_code=200, headers={'ETag':'etag'},
                iter_content=lambda _size: stream, close=lambda: closed.append(attempt))
            return oss2.models.GetObjectResult(Response(raw))
        source.bucket = SimpleNamespace(get_object=get_object,
            head_object=lambda _key: SimpleNamespace(etag='etag', last_modified=123, content_length=len(payload)))
        with tempfile.TemporaryDirectory() as directory, patch.object(s.time, 'sleep') as sleep:
            destination = Path(directory) / 'payload.bin'
            source.download(s.Obj('assets/test.bin',123,'etag',len(payload)), destination,1024)
            self.assertEqual(destination.read_bytes(), payload)
            self.assertEqual(len(opened),2)
            self.assertEqual(closed,[0,1])
            sleep.assert_called_once_with(1)

    def test_transient_retry_is_bounded_and_does_not_retry_data_failures(self):
        source = object.__new__(s.OssSource)
        source.oss2 = SimpleNamespace(exceptions=SimpleNamespace(RequestError=TimeoutError))
        calls = []
        def transient():
            calls.append(1)
            if len(calls) < 3: raise TimeoutError()
            return 'ok'
        with patch.object(s.time, 'sleep') as sleep:
            self.assertEqual(source._retry_transport(transient), 'ok')
            self.assertEqual(sleep.call_count, 2)
            calls.clear()
            def failed():
                calls.append(1)
                raise TimeoutError()
            with self.assertRaises(TimeoutError): source._retry_transport(failed)
            self.assertEqual(len(calls), 3)
            calls.clear()
            def changed():
                calls.append(1)
                raise RuntimeError('object changed')
            with self.assertRaises(RuntimeError): source._retry_transport(changed)
            self.assertEqual(len(calls), 1)


if __name__=='__main__':unittest.main()
