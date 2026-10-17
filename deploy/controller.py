#!/usr/bin/env python3
"""Fixed hosting controller. Bootstrap installs this file; releases cannot update it.

No credentials, shell commands, downloaded-code execution, or release deletion.
"""
import contextlib, datetime, fcntl, hashlib, io, json, os, re, shutil, stat, sys, time, urllib.request, zipfile
from pathlib import Path, PurePosixPath

BASE = Path('/var/www/u3556423/data')
PRIVATE = BASE / '.primeharbor-deploy'
VERSIONS = BASE / 'primeharbor-releases'
LIVE = BASE / 'www/primeharbor.ru'
INITIAL = BASE / 'backups/primeharbor.ru/initial-directory-before-cloud-20261017'
API = 'https://api.github.com/repos/iemtsov-cyber/primeharbor-site'
SITE = 'https://primeharbor.ru/'
MAX_ZIP = 104857600
MAX_TOTAL = 262144000
ASSET_EXT = {'.css','.js','.jpg','.jpeg','.png','.webp','.svg','.gif','.ico','.mp4','.pdf','.woff','.woff2'}

def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(data): return hashlib.sha256(data).hexdigest()
def allowed(name):
    p=PurePosixPath(name)
    if not name or '\\' in name or p.is_absolute() or any(x in ('','..','.') or x.startswith('.') for x in name.split('/')): return False
    return name in ('robots.txt','sitemap.xml','favicon.ico') or (len(p.parts)==1 and p.suffix in {'.html','.css','.js'}) or (p.parts[0]=='assets' and p.suffix.lower() in ASSET_EXT)
def atomic_json(path, value):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(value,indent=2)+'\n');os.chmod(str(temp),0o600);os.replace(str(temp),str(path))
def request(url, limit):
    req=urllib.request.Request(url,headers={'User-Agent':'PrimeHarbor-fixed-deploy/1','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=45) as response:
        if response.status!=200: raise ValueError('HTTP check failed')
        data=response.read(limit+1)
    if len(data)>limit: raise ValueError('Download exceeds limit')
    return data
def getjson(url): return json.loads(request(url,2097152))

def unpack_checked(raw, manifest):
    if manifest.get('schema')!=1 or not re.fullmatch(r'gh-\d+-\d+',manifest.get('version','')): raise ValueError('Invalid release version')
    if not re.fullmatch(r'[a-f0-9]{40}',manifest.get('commit','')): raise ValueError('Invalid source commit')
    if digest(raw)!=manifest.get('archive_sha256'): raise ValueError('Archive hash mismatch')
    files=manifest.get('files',{})
    if not isinstance(files,dict) or not 1<=len(files)<=1000: raise ValueError('Invalid file count')
    result={};total=0
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        entries=z.infolist()
        if len(entries)!=len(files): raise ValueError('Unexpected ZIP entries')
        for item in entries:
            name=item.filename;mode=item.external_attr>>16
            if not allowed(name) or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0,stat.S_IFREG)) or name in result: raise ValueError('Unsafe archive path/type')
            meta=files.get(name)
            if not meta or type(meta.get('bytes')) is not int or item.file_size!=meta['bytes']: raise ValueError('File size mismatch')
            total+=item.file_size
            if total>MAX_TOTAL or item.file_size>MAX_ZIP: raise ValueError('Expanded artifact exceeds limit')
            data=z.read(item)
            if digest(data)!=meta.get('sha256'): raise ValueError('File hash mismatch')
            result[name]=data
    for name in ('index.html','talent.html','education.html','pt-gardens.html','assets/docs/Prime_Harbor_Recruitment_Sri_Lanka_2026.pdf'):
        if name not in result: raise ValueError('Essential page missing')
    return result

def verify_disk(folder, manifest):
    for name, meta in manifest['files'].items():
        if not allowed(name): raise ValueError('Unsafe manifest path')
        p=folder/name
        if not p.is_file() or p.is_symlink() or digest(p.read_bytes())!=meta['sha256']: raise ValueError('Production drift: '+name)
    # New/untracked static files must not silently disappear on the next switch.
    found=set()
    for current,dirs,files in os.walk(str(folder),followlinks=False):
        rel=Path(current).relative_to(folder)
        if rel==Path('.'):
            dirs[:]=[d for d in dirs if d not in ('www','.well-known')]
        for f in files:
            name=(rel/f).as_posix()
            if allowed(name): found.add(name)
    if found!=set(manifest['files']): raise ValueError('Production file list drift')

def switch(link, target):
    temp=link.parent/(link.name+'.primeharbor-next')
    if temp.exists() or temp.is_symlink(): raise ValueError('Pending switch requires review')
    os.symlink(str(target),str(temp));os.replace(str(temp),str(link))

def public_check(manifest):
    # Verify every public byte, then permit the marker to be labelled healthy.
    for name,meta in manifest['files'].items():
        data=request(SITE+name+'?ph_verify='+manifest.get('version','baseline'),MAX_ZIP)
        if digest(data)!=meta['sha256']: raise ValueError('Public file hash mismatch: '+name)

def selftest():
    import tempfile
    checks=[]
    for bad in ('../outside.html','/etc/passwd','assets/../../x.js','assets/x.php','.htaccess','assets/.git/config','assets\\x.js'):
        assert not allowed(bad)
    checks.append('path traversal, hidden files and executable payloads rejected')
    with tempfile.TemporaryDirectory(prefix='primeharbor-rollback-test-') as tmp:
        root=Path(tmp);old=root/'old';new=root/'new';old.mkdir();new.mkdir();(old/'index.html').write_text('old');(new/'index.html').write_text('new');link=root/'current';os.symlink(str(old),str(link))
        switch(link,new)
        try: raise ValueError('Injected public health failure')
        except ValueError: switch(link,old)
        assert (link/'index.html').read_text()=='old' and new.exists() and old.exists()
        checks.append('atomic switch and injected-failure rollback; both versions retained')
    report={'passed':checks,'python':sys.version,'time':now()}
    print(json.dumps(report));return report

def run():
    PRIVATE.mkdir(mode=0o700,exist_ok=True);os.chmod(str(PRIVATE),0o700)
    VERSIONS.mkdir(mode=0o755,exist_ok=True)
    with (PRIVATE/'lock').open('a') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return
        recover_transaction()
        if not (PRIVATE/'selftest-result.json').exists():
            atomic_json(PRIVATE/'selftest-result.json',selftest())
        statepath=PRIVATE/'state.json'
        state=json.loads(statepath.read_text()) if statepath.exists() else {'current':None,'previous':None,'golden':None,'failed':[],'history':[]}
        try:
            # Latest stable release only; the immutable working backup is a prerelease.
            try:release=getjson(API+'/releases/latest')
            except urllib.error.HTTPError as error:
                if error.code!=404:raise
                atomic_json(PRIVATE/'last-result.json',{'ok':True,'time':now(),'status':'waiting_for_first_production_release'});return
            tag=release.get('tag_name','')
            if not re.fullmatch(r'primeharbor-\d+-\d+',tag) or release['draft'] or release['prerelease']: return
            rid=release['id']
            if rid==state.get('release_id') or rid in state['failed']: return
            assets={a['name']:a for a in release['assets']}
            if set(assets)!={'site.zip','manifest.json'}: raise ValueError('Unexpected release assets')
            for a in assets.values():
                expected='https://github.com/iemtsov-cyber/primeharbor-site/releases/download/'+tag+'/'
                if not a['browser_download_url'].startswith(expected): raise ValueError('Unexpected asset origin')
            manifest=getjson(assets['manifest.json']['browser_download_url'])
            if manifest['version']!='gh-'+tag[len('primeharbor-'):]: raise ValueError('Tag/version mismatch')
            if not re.fullmatch(r'[a-f0-9]{40}',manifest.get('publication_commit','')): raise ValueError('Missing publication commit')
            if getjson(API+'/git/ref/heads/main')['object']['sha']!=manifest['publication_commit']: raise ValueError('Superseded release: main moved')
            if shutil.disk_usage(str(BASE)).free<MAX_TOTAL*3: raise ValueError('Low disk space: no versions deleted')
            raw=request(assets['site.zip']['browser_download_url'],MAX_ZIP)
            files=unpack_checked(raw,manifest)
            baseline=json.loads((PRIVATE/'baseline-manifest.json').read_text())
            previous=LIVE.resolve()
            if state['current']:
                if previous != (VERSIONS/state['current']/'site').resolve(): raise ValueError('Document root changed outside controller')
                oldmanifest=json.loads((VERSIONS/state['current']/'manifest.json').read_text())
            else:
                if LIVE.is_symlink() or INITIAL.exists(): raise ValueError('Initial migration needs review')
                oldmanifest=baseline
            verify_disk(previous,oldmanifest)
            version=manifest['version'];folder=VERSIONS/version
            if folder.exists(): raise ValueError('Version already exists: never overwrite')
            folder.mkdir();site=folder/'site';site.mkdir()
            for name,data in files.items():
                p=site/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);os.chmod(str(p),0o644)
            (folder/'manifest.json').write_text(json.dumps(manifest,indent=2))
            # Preserve the existing legacy /www/ URL tree without changing its contents.
            legacy=INITIAL/'www' if state['current'] else LIVE/'www'
            if legacy.is_dir(): os.symlink(str(INITIAL/'www'),str(site/'www'))
            marker_dir=site/'.well-known';marker_dir.mkdir()
            marker={'version':version,'commit':manifest['commit'],'publication_commit':manifest['publication_commit'],'release':release['html_url'],'healthy':False,'checked_at':None,'golden':False}
            markerfile=marker_dir/'primeharbor-release.json';markerfile.write_text(json.dumps(marker)+'\n')
            first=not state['current']
            # Persist transaction before any switch; next invocation recovers interruption.
            txn={'previous':str(INITIAL if first else previous),'candidate':str(site),'first':first,'release_id':rid}
            atomic_json(PRIVATE/'transaction.json',txn)
            if first:
                os.rename(str(LIVE),str(INITIAL))
                try: os.symlink(str(site),str(LIVE))
                except Exception:
                    os.rename(str(INITIAL),str(LIVE));raise
            else: switch(LIVE,site)
            try:
                public_check(manifest)
                marker.update(healthy=True,checked_at=now());markerfile.write_text(json.dumps(marker)+'\n')
                remote_marker=getjson(SITE+'.well-known/primeharbor-release.json?ph_verify='+version)
                if remote_marker.get('version')!=version or remote_marker.get('healthy') is not True: raise ValueError('Public marker mismatch')
            except Exception:
                if first:
                    LIVE.unlink();os.rename(str(INITIAL),str(LIVE))
                else: switch(LIVE,previous)
                state['failed'].append(rid);atomic_json(statepath,state)
                (PRIVATE/'transaction.json').unlink()
                raise
            state['previous']=state['current'];state['current']=version;state['release_id']=rid
            state['history'].append({'version':version,'release_id':rid,'source_commit':manifest['commit'],'published':now()})
            atomic_json(statepath,state);(PRIVATE/'transaction.json').unlink()
            atomic_json(PRIVATE/'last-result.json',{'ok':True,'time':now(),'version':version,'files_checked':len(files),'golden':state['golden']})
        except Exception as error:
            atomic_json(PRIVATE/'last-result.json',{'ok':False,'time':now(),'error':str(error)[:500]})
            raise

def recover_transaction():
    transaction=PRIVATE/'transaction.json'
    if not transaction.exists(): return
    # Recovery only uses controller-written, constrained paths; never downloaded paths.
    txn=json.loads(transaction.read_text());old=Path(txn['previous']);candidate=Path(txn['candidate'])
    if candidate.parent.parent!=VERSIONS or (old!=INITIAL and old.parent.parent!=VERSIONS): raise ValueError('Invalid recovery path')
    statepath=PRIVATE/'state.json'
    state=json.loads(statepath.read_text()) if statepath.exists() else {'current':None,'previous':None,'golden':None,'failed':[],'history':[]}
    if state.get('current')==candidate.parent.name:
        transaction.unlink();return
    if old.exists():
        if txn['first']:
            if LIVE.is_symlink(): LIVE.unlink()
            if not LIVE.exists():os.rename(str(old),str(LIVE))
        elif LIVE.is_symlink():switch(LIVE,old)
    state['failed'].append(txn['release_id']);atomic_json(statepath,state)
    transaction.unlink()

if __name__=='__main__':
    if sys.argv[1:]==['--selftest']: selftest()
    elif not sys.argv[1:]:
        run()
    else: raise SystemExit('Unsupported command')
