"""Linux integration tests: real filesystem switches, simulated network only."""
import copy, importlib.util, io, json, os, tempfile, unittest, zipfile
from pathlib import Path
from hashlib import sha256
import controller as c

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='primeharbor-deploy-test-')
        c.BASE=Path(self.temp.name);c.PRIVATE=c.BASE/'.primeharbor-deploy';c.VERSIONS=c.BASE/'primeharbor-releases';c.LIVE=c.BASE/'www/primeharbor.ru';c.INITIAL=c.BASE/'backups/primeharbor.ru/initial-directory-before-cloud-20261017'
        c.LIVE.mkdir(parents=True);c.PRIVATE.mkdir();c.INITIAL.parent.mkdir(parents=True)
        self.names=['index.html','talent.html','education.html','pt-gardens.html','assets/docs/Prime_Harbor_Recruitment_Sri_Lanka_2026.pdf']
        self.old={n:b'initial public bytes' for n in self.names}
        for n,b in self.old.items():p=c.LIVE/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
        (c.LIVE/'www/legacy').mkdir(parents=True);(c.LIVE/'www/legacy/keep.html').write_text('preserve')
        (c.PRIVATE/'baseline-manifest.json').write_text(json.dumps({'files':self.metadata(self.old)}))
        self.actual_request=c.request;self.actual_getjson=c.getjson
        self.counter=10;self.prepare()
        c.request=self.request;c.getjson=self.getjson
    def tearDown(self):
        c.request=self.actual_request;c.getjson=self.actual_getjson;self.temp.cleanup()
    def metadata(self,files):return {n:{'bytes':len(b),'sha256':sha256(b).hexdigest()} for n,b in files.items()}
    def prepare(self):
        self.counter+=1;tag='primeharbor-%s-1'%self.counter
        self.files={n:('new release %s'%self.counter).encode() for n in self.names}
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as z:
            for n,b in self.files.items():z.writestr(n,b)
        self.raw=stream.getvalue();self.manifest={'schema':1,'version':'gh-%s-1'%self.counter,'commit':'a'*40,'publication_commit':'a'*40,'files':self.metadata(self.files),'archive_sha256':sha256(self.raw).hexdigest()}
        self.release={'id':self.counter,'tag_name':tag,'draft':False,'prerelease':False,'html_url':'https://github.com/iemtsov-cyber/primeharbor-site/releases/tag/'+tag,'assets':[{'name':n,'browser_download_url':'https://github.com/iemtsov-cyber/primeharbor-site/releases/download/'+tag+'/'+n} for n in ('site.zip','manifest.json')]}
        self.bad_health=False
    def request(self,url,limit):
        if url.endswith('/site.zip'):return self.raw
        if url.startswith(c.SITE):
            if self.bad_health:raise ValueError('Injected HTTP failure')
            return (c.LIVE/url[len(c.SITE):].split('?')[0]).read_bytes()
        raise AssertionError(url)
    def getjson(self,url):
        if url.endswith('/releases/latest'):return self.release
        if url.endswith('/git/ref/heads/main'):return {'object':{'sha':'a'*40}}
        if url.endswith('/manifest.json'):return self.manifest
        return json.loads(self.request(url,99999))
    def test_success_and_retention(self):
        c.run();first=c.LIVE.resolve();self.assertTrue(c.LIVE.is_symlink());self.assertEqual((c.LIVE/'www/legacy/keep.html').read_text(),'preserve')
        self.prepare();c.run();self.assertTrue(first.exists());self.assertTrue(c.INITIAL.exists())
        state=json.loads((c.PRIVATE/'state.json').read_text());self.assertIsNone(state['golden']);self.assertEqual(len(state['history']),2)
    def test_first_public_failure_restores_original_directory(self):
        self.bad_health=True
        with self.assertRaises(ValueError):c.run()
        self.assertFalse(c.LIVE.is_symlink());self.assertEqual((c.LIVE/'index.html').read_bytes(),self.old['index.html'])
        self.assertTrue((c.VERSIONS/self.manifest['version']).exists());self.assertIn(self.counter,json.loads((c.PRIVATE/'state.json').read_text())['failed'])
    def test_later_failure_rolls_back(self):
        c.run();old=c.LIVE.resolve();self.prepare();self.bad_health=True
        with self.assertRaises(ValueError):c.run()
        self.assertEqual(c.LIVE.resolve(),old);self.assertTrue((c.VERSIONS/self.manifest['version']).exists())
    def test_drift_aborts_before_switch(self):
        (c.LIVE/'index.html').write_text('outside edit')
        with self.assertRaisesRegex(ValueError,'drift'):c.run()
        self.assertFalse(c.LIVE.is_symlink());self.assertFalse(c.INITIAL.exists())
    def test_bad_hash_aborts_before_switch(self):
        self.manifest['archive_sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'hash'):c.run()
        self.assertFalse(c.LIVE.is_symlink())
    def test_unsafe_archive_rejected(self):
        for name,mode in [('../outside.html',0o100644),('assets/evil.php',0o100644),('assets/link.js',0o120777)]:
            out=io.BytesIO()
            with zipfile.ZipFile(out,'w') as z:
                entry=zipfile.ZipInfo(name);entry.external_attr=mode<<16;z.writestr(entry,b'bad')
            raw=out.getvalue();m=copy.deepcopy(self.manifest);m.update(files=self.metadata({name:b'bad'}),archive_sha256=sha256(raw).hexdigest())
            with self.assertRaisesRegex(ValueError,'Unsafe'):c.unpack_checked(raw,m)
    def test_interrupted_initial_switch_recovers(self):
        folder=c.VERSIONS/'gh-99-1/site';folder.mkdir(parents=True);os.rename(c.LIVE,c.INITIAL);os.symlink(folder,c.LIVE)
        c.atomic_json(c.PRIVATE/'transaction.json',{'previous':str(c.INITIAL),'candidate':str(folder),'first':True,'release_id':99})
        c.recover_transaction();self.assertFalse(c.LIVE.is_symlink());self.assertEqual((c.LIVE/'index.html').read_bytes(),self.old['index.html'])
        self.assertIn(99,json.loads((c.PRIVATE/'state.json').read_text())['failed'])

if __name__=='__main__': unittest.main()
