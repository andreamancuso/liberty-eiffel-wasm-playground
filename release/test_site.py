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
    def test_only_completed_successful_main_ci_runs_can_publish(self):
        run = dict(workflow_id=1, head_repository=dict(full_name='owner/repo'), head_branch='main', event='push', status='completed', conclusion='success')
        select_run.validate(run, 1, 'owner/repo')
        for key, value in [('workflow_id', 2), ('head_repository', dict(full_name='someone/fork')), ('head_branch', 'experiment'), ('event', 'pull_request'), ('status', 'in_progress'), ('conclusion', 'failure')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                select_run.validate({**run, key:value}, 1, 'owner/repo')

    def test_manifest_rejects_modified_extra_and_wrong_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'stage2').mkdir()
            (root / 'licenses').mkdir()
            (root / 'toolchain').mkdir()
            provenance = dict(playgroundRevision='a'*40, sourceRevision='b'*40, sourceDirty=False, sourceMode='pinned-submodule')
            (root / 'stage2/provenance.json').write_text(json.dumps(provenance))
            for name in ['index.html', '.nojekyll', 'client.mjs', 'worker.mjs', 'wasi.mjs', 'stage2/compiler.wasm', 'stage2/compiler.data', 'toolchain/clang.wasm.gz', 'toolchain/sysroot.tar.gz', 'licenses/NOTICE']:
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
