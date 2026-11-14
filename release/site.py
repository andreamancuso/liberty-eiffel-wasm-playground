"""Seal or verify the exact static bytes promoted from CI to Pages."""
import argparse
import hashlib
import json
import pathlib
import re


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
    provenance = json.loads((root / 'runtime/eiffel/provenance.json').read_text())
    if provenance['playgroundRevision'] != revision or provenance['sourceRevision'] != manifest['libertyRevision'] or provenance['sourceDirty'] or provenance['sourceMode'] != 'pinned-submodule':
        raise ValueError('Release provenance is not the expected clean, pinned build')
    for required in ['index.html', '.nojekyll', 'runtime/client.mjs', 'runtime/worker.mjs', 'runtime/wasi/program.mjs', 'runtime/eiffel/compiler.wasm', 'runtime/eiffel/compiler.data', 'runtime/wasi/toolchain/clang.wasm.gz', 'runtime/wasi/toolchain/sysroot.tar.gz']:
        if not (root / required).is_file():
            raise ValueError(f'Missing published asset: {required}')
    if not any(entry['path'].startswith('licenses/') for entry in manifest['files']):
        raise ValueError('Third-party licenses are missing')
    return manifest


def seal(root, report_path, revision, run_id, run_url):
    report = json.loads(report_path.read_text())
    if not report['passed'] or report['provenance']['playgroundRevision'] != revision:
        raise ValueError('Sealing requires a passing browser report for this revision')
    groups = report.get('groups', [])
    if sorted(group['name'] for group in groups) != ['api', 'ui'] or not all(group['passed'] and group['cases'] for group in groups):
        raise ValueError('Sealing requires both successful browser groups')
    cases = [case for group in groups for case in group['cases']]
    if len(cases) != len(set(cases)) or cases != [result['name'] for result in report['results']]:
        raise ValueError('Browser groups do not match the aggregate cases')
    if report['testedFiles'] != inventory(root):
        raise ValueError('Candidate differs from the files verified by the browser suite')
    manifest = dict(schemaVersion=1, playgroundRevision=revision,
                    libertyRevision=report['provenance']['sourceRevision'],
                    ciRunId=str(run_id), ciRunUrl=run_url, files=report['testedFiles'])
    (root / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return verify(root, revision, run_id, run_url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['seal', 'verify'])
    parser.add_argument('--site', type=pathlib.Path, required=True)
    parser.add_argument('--report', type=pathlib.Path)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--run-url', required=True)
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.revision) or not args.run_id.isdecimal():
        parser.error('Expected a full commit SHA and numeric CI run ID')
    if args.command == 'seal':
        if args.report is None:
            parser.error('--report is required for sealing')
        manifest = seal(args.site, args.report, args.revision, args.run_id, args.run_url)
    else:
        manifest = verify(args.site, args.revision, args.run_id, args.run_url)
    print(f"Verified {len(manifest['files'])} files, {sum(f['bytes'] for f in manifest['files'])} bytes, revision {args.revision}")


if __name__ == '__main__':
    main()
