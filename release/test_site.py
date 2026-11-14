"""Release integrity regressions: altered, extra, and wrongly identified assets."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('site_release', pathlib.Path(__file__).with_name('site.py'))
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)
run_spec = importlib.util.spec_from_file_location('select_run', pathlib.Path(__file__).with_name('select-run.py'))
select_run = importlib.util.module_from_spec(run_spec)
run_spec.loader.exec_module(select_run)


class ReleaseIntegrity(unittest.TestCase):
    def candidate(self, root):
        provenance = dict(playgroundRevision='a'*40, sourceRevision='b'*40,
                          sourceDirty=False, sourceMode='pinned-submodule')
        files = ['index.html', '.nojekyll', 'runtime/client.mjs', 'runtime/worker.mjs',
                 'runtime/wasi/program.mjs', 'runtime/eiffel/compiler.wasm',
                 'runtime/eiffel/compiler.data', 'runtime/wasi/toolchain/clang.wasm.gz',
                 'runtime/wasi/toolchain/sysroot.tar.gz', 'licenses/NOTICE']
        for name in files:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('fixture')
        (root / 'runtime/eiffel/provenance.json').write_text(json.dumps(provenance))
        return dict(passed=True, provenance=provenance, testedFiles=site.inventory(root))

    def test_seal_binds_the_manifest_to_the_tested_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / 'site'
            report = self.candidate(root)
            report_path = pathlib.Path(directory) / 'browser-result.json'
            report_path.write_text(json.dumps(report))
            result = site.seal(root, report_path, 'a'*40, '123', 'https://example.test/run/123')
            self.assertEqual(result['files'], report['testedFiles'])
            self.assertNotIn('browser-result.json', [entry['path'] for entry in result['files']])
            site.verify(root, 'a'*40, '123', result['ciRunUrl'])

    def test_seal_rejects_failed_stale_or_changed_candidates(self):
        for scenario in ['failed', 'stale', 'modified', 'missing', 'extra', 'dirty']:
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory) / 'site'
                report = self.candidate(root)
                if scenario == 'failed':
                    report['passed'] = False
                elif scenario == 'stale':
                    report['provenance']['playgroundRevision'] = 'c'*40
                elif scenario == 'modified':
                    (root / 'index.html').write_text('changed after testing')
                elif scenario == 'missing':
                    (root / 'index.html').unlink()
                elif scenario == 'extra':
                    (root / 'unexpected.mjs').touch()
                else:
                    report['provenance']['sourceDirty'] = True
                    (root / 'runtime/eiffel/provenance.json').write_text(json.dumps(report['provenance']))
                    report['testedFiles'] = site.inventory(root)
                report_path = pathlib.Path(directory) / 'browser-result.json'
                report_path.write_text(json.dumps(report))
                with self.assertRaises(ValueError):
                    site.seal(root, report_path, 'a'*40, '123', 'https://example.test/run/123')

    def test_only_completed_successful_main_ci_runs_can_publish(self):
        run = dict(workflow_id=1, head_repository=dict(full_name='owner/repo'), head_branch='main', event='push', status='completed', conclusion='success')
        select_run.validate(run, 1, 'owner/repo')
        for key, value in [('workflow_id', 2), ('head_repository', dict(full_name='someone/fork')), ('head_branch', 'experiment'), ('event', 'pull_request'), ('status', 'in_progress'), ('conclusion', 'failure')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                select_run.validate({**run, key:value}, 1, 'owner/repo')

    def test_manifest_rejects_modified_extra_and_wrong_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'runtime/eiffel').mkdir(parents=True)
            (root / 'licenses').mkdir(parents=True)
            (root / 'runtime/wasi/toolchain').mkdir(parents=True)
            provenance = dict(playgroundRevision='a'*40, sourceRevision='b'*40, sourceDirty=False, sourceMode='pinned-submodule')
            (root / 'runtime/eiffel/provenance.json').write_text(json.dumps(provenance))
            for name in ['index.html', '.nojekyll', 'runtime/client.mjs', 'runtime/worker.mjs', 'runtime/wasi/program.mjs', 'runtime/eiffel/compiler.wasm', 'runtime/eiffel/compiler.data', 'runtime/wasi/toolchain/clang.wasm.gz', 'runtime/wasi/toolchain/sysroot.tar.gz', 'licenses/NOTICE']:
                (root / name).write_text('fixture')
            manifest = dict(schemaVersion=1, playgroundRevision='a'*40, libertyRevision='b'*40, ciRunId='123', ciRunUrl='https://example.test/run/123', files=site.inventory(root))
            (root / 'release.json').write_text(json.dumps(manifest))
            site.verify(root, 'a'*40, '123', manifest['ciRunUrl'])
            with self.assertRaises(ValueError):
                site.verify(root, 'c'*40, '123', manifest['ciRunUrl'])
            with self.assertRaises(ValueError):
                site.verify(root, 'a'*40, '456', manifest['ciRunUrl'])
            (root / 'extra').touch()
            with self.assertRaises(ValueError):
                site.verify(root, 'a'*40, '123', manifest['ciRunUrl'])
            (root / 'extra').unlink()
            (root / 'index.html').write_text('tampered')
            with self.assertRaises(ValueError):
                site.verify(root, 'a'*40, '123', manifest['ciRunUrl'])


if __name__ == '__main__':
    unittest.main()
