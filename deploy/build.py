"""Build a static, credential-free production artifact from tracked files."""
from pathlib import Path, PurePosixPath
from hashlib import sha256
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
from datetime import datetime
import io, json, os, re, subprocess, sys, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
ASSET_EXT = {'.css','.js','.jpg','.jpeg','.png','.webp','.svg','.gif','.ico','.mp4','.pdf','.woff','.woff2'}
PDF = 'assets/docs/Prime_Harbor_Recruitment_Sri_Lanka_2026.pdf'
PDF_HASH = '4576af19d0752733c703fbc082701a2bb35fe7aea22f8b548d74538dff87e9f1'

def allowed(name):
    p = PurePosixPath(name)
    if not name or '\\' in name or p.is_absolute() or any(x in ('','..','.') or x.startswith('.') for x in name.split('/')): return False
    if name in ('robots.txt','sitemap.xml','favicon.ico'): return True
    return (len(p.parts)==1 and p.suffix in {'.html','.css','.js'}) or (p.parts[0]=='assets' and p.suffix.lower() in ASSET_EXT)

def render(name, data):
    if name.endswith(('.html','.css','.js')): data=data.replace(b'\r\n',b'\n')
    if name.endswith('.html'):
        data=re.sub(r'<meta name="robots" content="noindex,\s*nofollow"\s*/?>','',data.decode().replace('https://iemtsov-cyber.github.io/primeharbor-site/','https://primeharbor.ru/')).encode()
    return data

def validate(files):
    for name in ('index.html','talent.html','education.html','pt-gardens.html',PDF):
        assert name in files, 'Required page missing: '+name
    class Links(HTMLParser):
        def handle_starttag(self, tag, attrs):
            for key,value in attrs:
                if key in ('src','href','poster','data-desktop','data-mobile') and value: self.refs.append(value)
    for name,data in files.items():
        if name.endswith('.html'):
            text=data.decode(); assert 'noindex' not in text and 'iemtsov-cyber.github.io' not in text
            parser=Links();parser.refs=[];parser.feed(text)
            for value in parser.refs:
                u=urlsplit(value)
                if u.scheme or u.netloc or not u.path:continue
                target=(PurePosixPath(name).parent / unquote(u.path)).as_posix() if not u.path.startswith('/') else u.path[1:]
                if target in ('','.'): target='index.html'
                assert target in files, 'Missing reference: '+name+' -> '+target
    talent=files['talent.html'].decode()
    assert 'tel:+74951081801' in talent and 'tel:+79165362414' not in talent
    assert sha256(files[PDF]).hexdigest()==PDF_HASH, 'Proposal changed: update the explicitly reviewed PDF expectation'
    from pypdf import PdfReader
    pdf=PdfReader(io.BytesIO(files[PDF]));assert len(pdf.pages)==3
    digits=re.sub(r'\D','', ''.join(page.extract_text() for page in pdf.pages))
    assert '135000' in digits and '74951081801' in digits
    assert sum(map(len,files.values()))<=262144000 and len(files)<=1000

def package(files, commit, version):
    validate(files);OUT.mkdir(exist_ok=True)
    site=OUT/'site';site.mkdir(exist_ok=True)
    for name,data in files.items():
        p=site/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    manifest={'schema':1,'version':version,'commit':commit,'files':{name:{'sha256':sha256(data).hexdigest(),'bytes':len(data)} for name,data in sorted(files.items())}}
    with zipfile.ZipFile(OUT/'site.zip','w',zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(files.items()):
            item=zipfile.ZipInfo(name,datetime.now().timetuple()[:6]);item.create_system=3;item.external_attr=0o100644<<16
            z.writestr(item,data,compress_type=zipfile.ZIP_DEFLATED)
    manifest['archive_sha256']=sha256((OUT/'site.zip').read_bytes()).hexdigest()
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'version':version,'commit':commit,'files':len(files),'archive_bytes':(OUT/'site.zip').stat().st_size}))

if __name__=='__main__':
    git=['git','-c','safe.directory='+str(ROOT)]
    commit=subprocess.check_output(git+['rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    names=subprocess.check_output(git+['ls-files','-z'],cwd=ROOT).decode().split('\0')
    files={name:render(name,(ROOT/name).read_bytes()) for name in names if allowed(name)}
    package(files,commit,os.environ.get('RELEASE_VERSION','local-check'))
