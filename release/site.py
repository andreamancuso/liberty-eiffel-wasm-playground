"""Package or verify the exact static bytes promoted from CI to Pages."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil


def inventory(root):
    entries = []
    for file in sorted(root.rglob('*'), key=lambda path: path.relative_to(root).as_posix()):
        if file.is_symlink():
            raise ValueError(f'Symlinks are not allowed: {file}')
        if file.is_file() and file.relative_to(root).as_posix() != 'release.json':
            data = file.read_bytes()
            entries.append(dict(path=file.relative_to(root).as_posix(), bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    if sum(entry['bytes'] for entry in entries) >= 1_000_000_000:
        raise ValueError('Site exceeds the GitHub Pages 1 GB limit')
    return entries


def verify(root, revision, run_id, run_url):
    manifest = json.loads((root / 'release.json').read_text())
    if (manifest['schemaVersion'], manifest['playgroundRevision'], manifest['ciRunId'], manifest['ciRunUrl']) != (1, revision, str(run_id), run_url):
        raise ValueError('Release identity differs from the selected successful CI run')
    if manifest['files'] != inventory(root):
        raise ValueError('Published file inventory or checksums differ from release.json')
    provenance = json.loads((root / 'stage2/provenance.json').read_text())
    if provenance['playgroundRevision'] != revision or provenance['sourceRevision'] != manifest['libertyRevision'] or provenance['sourceDirty'] or provenance['sourceMode'] != 'pinned-submodule':
        raise ValueError('Release provenance is not the expected clean, pinned build')
    for required in ['index.html', '.nojekyll', 'client.mjs', 'worker.mjs', 'wasi.mjs', 'stage2/compiler.wasm', 'stage2/compiler.data', 'toolchain/clang.wasm.gz', 'toolchain/sysroot.tar.gz']:
        if not (root / required).is_file():
            raise ValueError(f'Missing published asset: {required}')
    if not any(entry['path'].startswith('licenses/') for entry in manifest['files']):
        raise ValueError('Third-party licenses are missing')
    return manifest


def package(source, dest, revision, run_id, run_url):
    report = json.loads((source / 'stage3-result.json').read_text())
    if not report['passed'] or report['provenance']['playgroundRevision'] != revision:
        raise ValueError('Packaging requires a passing browser report for this revision')
    # A new destination avoids quietly retaining files from an older release.
    shutil.copytree(source, dest, symlinks=True, ignore=shutil.ignore_patterns('*-result.json', '*.png'))
    (dest / '.nojekyll').touch()
    manifest = dict(schemaVersion=1, playgroundRevision=revision,
                    libertyRevision=report['provenance']['sourceRevision'],
                    ciRunId=str(run_id), ciRunUrl=run_url, files=inventory(dest))
    (dest / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return verify(dest, revision, run_id, run_url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['package', 'verify'])
    parser.add_argument('--site', type=pathlib.Path, required=True)
    parser.add_argument('--source', type=pathlib.Path)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--run-url', required=True)
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.revision) or not args.run_id.isdecimal():
        parser.error('Expected a full commit SHA and numeric CI run ID')
    if args.command == 'package':
        if args.source is None:
            parser.error('--source is required for packaging')
        manifest = package(args.source, args.site, args.revision, args.run_id, args.run_url)
    else:
        manifest = verify(args.site, args.revision, args.run_id, args.run_url)
    print(f"Verified {len(manifest['files'])} files, {sum(f['bytes'] for f in manifest['files'])} bytes, revision {args.revision}")


if __name__ == '__main__':
    main()
