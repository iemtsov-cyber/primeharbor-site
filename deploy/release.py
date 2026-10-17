"""GitHub-hosted release and rollback orchestration; credentials stay in memory."""
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import hashlib,io,json,os,re,sys,time,zipfile
import build

API='https://api.github.com/repos/iemtsov-cyber/primeharbor-site'
def api(path,method='GET',data=None,binary=False):
    token=os.environ.get('GH_TOKEN')
    headers={'Accept':'application/vnd.github+json','User-Agent':'PrimeHarbor-cloud-release','X-GitHub-Api-Version':'2026-03-10'}
    if token:headers['Authorization']='Bearer '+token
    if data is not None:headers['Content-Type']='application/octet-stream' if binary else 'application/json'
    request=Request(path if path.startswith('https://') else API+path,method=method,headers=headers,data=data if binary else json.dumps(data).encode() if data is not None else None)
    with urlopen(request,timeout=90) as response:return json.load(response)
def download(url,limit):
    if not url.startswith('https://github.com/iemtsov-cyber/primeharbor-site/releases/download/'):raise ValueError('Unexpected source')
    with urlopen(Request(url,headers={'User-Agent':'PrimeHarbor-cloud-release'}),timeout=90) as response:data=response.read(limit+1)
    assert len(data)<=limit
    return data
def rollback(tag):
    assert re.fullmatch(r'primeharbor-\d+-\d+',tag),'Use a previously published production release tag'
    release=api('/releases/tags/'+tag);assert not release['draft'] and not release['prerelease']
    assets={a['name']:a['browser_download_url'] for a in release['assets']}
    manifest=json.loads(download(assets['manifest.json'],2097152));raw=download(assets['site.zip'],104857600)
    assert hashlib.sha256(raw).hexdigest()==manifest['archive_sha256']
    # Fixed validation code runs; no old release scripts are executed.
    from controller import unpack_checked
    files=unpack_checked(raw,manifest)
    build.package(files,manifest['commit'],os.environ['RELEASE_VERSION'])
    m=json.loads((build.OUT/'manifest.json').read_text());m['rollback_of']=tag
    (build.OUT/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
def publish():
    sha=os.environ['GITHUB_SHA'];version=os.environ['RELEASE_VERSION'];assert re.fullmatch(r'gh-\d+-\d+',version)
    assert os.environ['GITHUB_REPOSITORY']=='iemtsov-cyber/primeharbor-site' and os.environ['GITHUB_REF']=='refs/heads/main'
    assert api('/git/ref/heads/main')['object']['sha']==sha,'Main moved; do not publish superseded code'
    manifest=json.loads((build.OUT/'manifest.json').read_text());manifest['publication_commit']=sha
    (build.OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    tag='primeharbor-'+version[3:]
    release=api('/releases','POST',{'tag_name':tag,'target_commitish':sha,'name':'Prime Harbor '+version,'body':'Validated static production release. Source commit: '+manifest['commit']+'. All versions retained. Golden promotion requires separate explicit owner approval.','draft':True,'prerelease':False})
    for name in ('site.zip','manifest.json'):
        api(release['upload_url'].split('{')[0]+'?name='+name,'POST',(build.OUT/name).read_bytes(),True)
    assert api('/git/ref/heads/main')['object']['sha']==sha,'Main moved during upload; draft retained, not published'
    release=api('/releases/'+str(release['id']),'PATCH',{'draft':False,'make_latest':'true'})
    print('Published artifact: '+release['html_url'])
def wait():
    expected=os.environ['RELEASE_VERSION'];deadline=time.monotonic()+600
    while time.monotonic()<deadline:
        try:
            with urlopen('https://primeharbor.ru/.well-known/primeharbor-release.json?run='+expected,timeout=20) as r:marker=json.load(r)
            if marker.get('version')==expected and marker.get('healthy') is True:
                print('Production confirmed: '+json.dumps(marker));return
        except (HTTPError,OSError,ValueError):pass
        time.sleep(20)
    raise SystemExit('Release exists, but production confirmation timed out. Inspect private controller result. Do not claim publication.')
if __name__=='__main__':
    if sys.argv[1]=='rollback':rollback(os.environ['ROLLBACK_RELEASE'])
    elif sys.argv[1]=='publish':publish()
    elif sys.argv[1]=='wait':wait()
    else:raise SystemExit('Unsupported operation')
