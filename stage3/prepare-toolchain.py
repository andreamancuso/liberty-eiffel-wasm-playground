import concurrent.futures, hashlib, json, pathlib, tarfile, urllib.request

root = pathlib.Path('/downloads')
root.mkdir(exist_ok=True)
lock = json.loads(pathlib.Path('/experiment/toolchain.lock.json').read_text())
def download(asset):
    target = root / asset['name']
    with urllib.request.urlopen(asset['url']) as source, target.open('wb') as output:
        while chunk := source.read(1024 * 1024):
            output.write(chunk)
    with target.open('rb') as downloaded:
        if hashlib.file_digest(downloaded, 'sha256').hexdigest() != asset['sha256']:
            raise RuntimeError('Checksum mismatch: ' + asset['name'])
    print('Verified', asset['name'], flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(download, lock['assets']))
for archive, destination in [('runtime.tar.gz', '/runtime'), ('wasi-sdk.tar.gz', '/sdk')]:
    pathlib.Path(destination).mkdir()
    with tarfile.open(root / archive) as source:
        # These are checksum-verified upstream archives; preserve SDK symlinks.
        members = source.getmembers()
        prefix = members[0].name.split('/')[0] + '/'
        for member in members:
            if member.name.startswith(prefix) and member.name != prefix:
                member.name = member.name[len(prefix):]
                source.extract(member, destination, filter='tar')
