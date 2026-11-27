#!/usr/bin/env python3
import json, os, tempfile, unittest, sys, struct
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import intake as i
import sync_assets as s
from test_sync import Source, Cdn, builder

class TestIntake(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.state=s.State(self.root/'state');self.addCleanup(self.state.close)
        self.source=Source();self.cdnroot=self.root/'cdn';self.cdnroot.mkdir()
        self.args=SimpleNamespace(project=str(self.root),config=str(self.root/'catalog.json'),bucket='galaceanoss',endpoint='fake',
            prefix='assets/',cdn_prefix='retrieval',browser_origin='http://localhost',public_base='https://cdn.test',bizkey='test',
            apply=True,settle_seconds=60,max_file_bytes=i.MAX_FILE)
        self.source.put('assets/old/describe.json',{'assetPaths':['assets/old/a.json']})
        self.source.put('assets/old/a.json',{})
        s.sync(self.state,self.source,self.cdn(),self.args,builder)
        self.old=Path(self.args.config).read_bytes()
        self.patch=patch.object(s,'build_catalog',builder);self.patch.start();self.addCleanup(self.patch.stop)
        self.fp=patch.object(i,'code_fingerprint',return_value='code');self.fp.start();self.addCleanup(self.fp.stop)
    def cdn(self):
        c=Cdn(self.cdnroot);c.close=lambda:None;return c
    def asset(self,name='new'):
        p=self.root/name;p.mkdir()
        key=f'assets/local/{name}/describe.json'
        (p/'a.json').write_text('{}')
        (p/'describe.json').write_text(json.dumps({'assetType':'json','assetPaths':[key.replace('describe.json','a.json')],
            'overview':{'name':name,'description':'Data'},'usage':{'description':'Configuration'}}))
        return {'directory':str(p),'key':key,'mode':'create'}
    def prepare(self,assets):
        with patch.object(i,'validate_project',return_value=[]):
            return i.prepare({'assets':assets},self.source,self.root,self.root,i.destination(self.args),self.state)
    def publish(self,batch,**kw):
        return i.publish(batch,batch['digest'],self.state,self.source,self.args,validator=lambda *a:[],cdn_factory=kw.get('cdn_factory',self.cdn))
    def test_batch_merges_and_survives_oss_sync_without_source_writes(self):
        source_before=dict(self.source.values)
        b=self.prepare([self.asset('one'),self.asset('two')])
        with patch.object(s,'atomic_json',wraps=s.atomic_json) as write:
            self.publish(b)
            self.assertEqual(sum(Path(c.args[0])==Path(self.args.config) for c in write.call_args_list),1)
        self.assertEqual(self.source.values,source_before)
        self.assertEqual(self.state.db.execute('select count(*) from assets').fetchone()[0],3)
        self.assertEqual(self.state.db.execute('select count(*) from local_assets').fetchone()[0],2)
        s.sync(self.state,self.source,self.cdn(),self.args,builder)
        self.assertEqual(self.state.db.execute('select count(*) from assets').fetchone()[0],3)
        self.assertFalse(list(self.state.tmp.iterdir()))
    def test_confirmation_rejects_changed_file_or_description(self):
        a=self.asset();b=self.prepare([a]);(Path(a['directory'])/'a.json').write_text('{"changed":true}')
        with self.assertRaisesRegex(ValueError,'changed'):self.publish(b)
        self.assertEqual(Path(self.args.config).read_bytes(),self.old)
        self.assertIsNone(self.state.get('pendingIntake'))
    def test_digest_tamper_rejected(self):
        b=self.prepare([self.asset()]);b['assets'][0]['mode']='update'
        with self.assertRaisesRegex(ValueError,'digest'):self.publish(b)
    def test_failure_keeps_entry_blocks_sync_and_resumes(self):
        b=self.prepare([self.asset()])
        def fail():
            c=self.cdn();c.fail=lambda alias: '/catalog/' in alias;return c
        with self.assertRaises(RuntimeError):self.publish(b,cdn_factory=fail)
        self.assertEqual(Path(self.args.config).read_bytes(),self.old)
        with self.assertRaisesRegex(RuntimeError,'unfinished'):s.sync(self.state,self.source,self.cdn(),self.args,builder)
        self.publish(b)
        self.assertIsNone(self.state.get('pendingIntake'))
    def test_same_content_reuse_and_update_removes_only_registry_files(self):
        a=self.asset();b=self.prepare([a]);self.publish(b)
        self.assertEqual(self.prepare([a])['assets'][0]['mode'],'reuse')
        p=Path(a['directory']);(p/'a.json').write_text('{"n":2}')
        with self.assertRaisesRegex(ValueError,'exists'):self.prepare([a])
        a['mode']='update';self.publish(self.prepare([a]))
        self.assertEqual(self.state.db.execute('select count(*) from assets').fetchone()[0],2)
    def test_oss_collision_is_readonly_rejection(self):
        a=self.asset();self.source.put(a['key'],{})
        with self.assertRaisesRegex(ValueError,'OSS'):self.prepare([a])
    def test_source_appearing_after_local_publication_blocks_sync(self):
        a=self.asset();self.publish(self.prepare([a]));before=Path(self.args.config).read_bytes()
        self.source.put(a['key'],{'assetPaths':[a['key'].replace('describe.json','a.json')]})
        with self.assertRaisesRegex(RuntimeError,'collide'):s.sync(self.state,self.source,self.cdn(),self.args,builder)
        self.assertEqual(Path(self.args.config).read_bytes(),before)
    def test_concurrent_publisher_lock(self):
        with self.assertRaisesRegex(RuntimeError,'Another sync'):s.State(self.state.root)
    def test_symlink_and_missing_description_rejected(self):
        p=self.root/'invalid';p.mkdir();(p/'a').symlink_to(self.root/'catalog.json')
        with self.assertRaisesRegex(ValueError,'Symlinks'):i.files(p)
        (p/'a').unlink()
        with self.assertRaisesRegex(ValueError,'describe'):i.files(p)
    def test_update_removes_old_catalog_resource_but_keeps_cdn_history(self):
        a=self.asset();p=Path(a['directory']);(p/'old.txt').write_text('old')
        self.publish(self.prepare([a]));cdn_before={str(f) for f in self.cdnroot.rglob('*') if f.is_file()}
        (p/'old.txt').unlink();a['mode']='update';b=self.prepare([a])
        self.assertEqual(b['assets'][0]['removed'],['assets/local/new/old.txt'])
        self.publish(b)
        raw=json.loads(self.state.db.execute('select source from assets where key=?',(a['key'],)).fetchone()[0])
        self.assertFalse(any(r['path'].endswith('old.txt') for r in raw['resources']))
        self.assertTrue(all(Path(p).exists() for p in cdn_before))
    def test_config_change_during_upload_is_not_overwritten(self):
        b=self.prepare([self.asset()]);foreign=b'{"manifestUrl":"https://other/manifest.json"}'
        def change():
            c=self.cdn();c.hook=lambda *_:Path(self.args.config).write_bytes(foreign);return c
        with self.assertRaisesRegex(RuntimeError,'config changed'):self.publish(b,cdn_factory=change)
        self.assertEqual(Path(self.args.config).read_bytes(),foreign)
    def test_source_change_after_review_is_not_uploaded(self):
        a=self.asset();b=self.prepare([a]);local=i.LocalSource(b['assets'][0]);(Path(a['directory'])/'a.json').write_text('{"x":1}')
        with self.assertRaisesRegex(ValueError,'changed'):list(local.objects('assets/'))
    def test_stale_review_rejected_after_another_publication(self):
        a=self.asset();b=self.prepare([a]);self.publish(b)
        with self.assertRaisesRegex(ValueError,'library changed'):self.publish(b)
    def test_no_oss_mutation_entrypoints(self):
        # Source fake deliberately has no bucket write API; publish above must still work.
        self.assertFalse(hasattr(self.source,'bucket'))

@unittest.skipUnless(os.environ.get('RETRIEVAL_TEST_PROJECT'),'Set project for real import validation')
class RealProject(unittest.TestCase):
    def test_real_import_json_mesh_prefab_glb_and_counterexamples(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);asset=root/'asset';asset.mkdir();key='assets/local/test/describe.json'
            def check(entry,content,meta=None):
                for p in asset.iterdir():p.unlink()
                (asset/entry).write_bytes(content)
                if meta:(asset/(entry+'.meta')).write_text(json.dumps(meta))
                (asset/'describe.json').write_text(json.dumps({'assetType':'model','assetPaths':['assets/local/test/'+entry],
                    'overview':{'name':'test','description':'test'},'usage':{'description':'test'}}))
                batch={'project':os.environ['RETRIEVAL_TEST_PROJECT'],'assets':[{'directory':str(asset),'key':key,'files':i.files(asset)}]}
                return i.validate_project(batch,root)
            self.assertEqual(check('a.json',b'{}',{'type':'JSON','summary':'data'})[0]['assets'][0]['type'],'JSON')
            self.assertTrue(check('box.mesh',b'{"type":"cuboid","width":1,"height":1,"depth":1}'))
            self.assertTrue(check('a.prefab',b'{"asset":{"version":"2.0"},"entities":[],"components":[]}'))
            doc=json.dumps({'asset':{'version':'2.0'},'scenes':[{'nodes':[]}],'scene':0}).encode();doc+=b' '*((-len(doc))%4)
            glb=struct.pack('<IIIII',0x46546c67,2,20+len(doc),len(doc),0x4e4f534a)+doc
            self.assertTrue(check('a.glb',glb))
            with self.assertRaisesRegex(ValueError,'document'):check('a.json',b'{}')
            with self.assertRaisesRegex(ValueError,'Missing import dependency'):check('a.json',b'{"x":{"$ref":"missing.png"}}',{'type':'JSON','summary':'data'})
            with self.assertRaises(ValueError):check('bad.glb',b'not glb')
            with self.assertRaises(ValueError):check('bad.mesh',b'\x00\xff\x03')

if __name__=='__main__':unittest.main()
