import gzip, hashlib, io, json, pathlib, tarfile
out = pathlib.Path('/out/toolchain')
files = {}
with tarfile.open('/downloads/sysroot.tar') as archive:
    for member in archive:
        name = member.name.lstrip('./')
        if not member.isfile() or any(part.startswith('._') or 'c++' in part for part in name.split('/')):
            continue
        if name.endswith('.a') and not name.endswith(('/libc.a', '/libclang_rt.builtins.a')):
            continue
        if name.startswith(('include/', 'lib/clang/22/include/')) or name.endswith(('/libc.a', '/libclang_rt.builtins.a', '/crt1.o')):
            files[name] = archive.extractfile(member).read()
files['lib/wasm32-wasip1/libwasi-emulated-signal.a'] = pathlib.Path('/sdk/share/wasi-sysroot/lib/wasm32-wasip1/libwasi-emulated-signal.a').read_bytes()
with tarfile.open(out / 'sysroot.tar', 'w', format=tarfile.USTAR_FORMAT) as archive:
    directories = sorted({str(parent) for name in files for parent in pathlib.PurePosixPath(name).parents if str(parent) != '.'})
    for name in directories:
        info = tarfile.TarInfo(name + '/'); info.type = tarfile.DIRTYPE; info.mode = 0o755
        archive.addfile(info)
    for name, data in sorted(files.items()):
        info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
manifest = {}
for name in ['clang.wasm', 'lld.wasm', 'memfs.wasm', 'sysroot.tar']:
    data = (out / name).read_bytes()
    compressed = gzip.compress(data, mtime=0)
    (out / (name + '.gz')).write_bytes(compressed)
    manifest[name] = {'bytes': len(data), 'compressedBytes': len(compressed), 'sha256': hashlib.sha256(data).hexdigest()}
(out / 'assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
