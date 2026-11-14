"""Summarize elapsed builds and cache transfers from BuildKit's plain logs."""
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
timings = sorted(root.glob('*.timing.json'))
if timings:
    measurements = [json.loads(file.read_text(encoding='utf-8-sig')) for file in timings]
    mode = 'cold layers' if all(item['cold'] for item in measurements) else 'layer reuse enabled'
    print(f'Build mode: {mode}.\n')
    print('| Build | Seconds | Cached steps | Cache import/export seconds |')
    print('| --- | ---: | ---: | ---: |')
    for entry in measurements:
        log = (root / f"{entry['name']}.log").read_text(encoding='utf-8-sig')
        transfer_steps = set()
        transfer_seconds = 0.0
        for text in log.splitlines():
            match = re.match(r'#(\d+) ', text)
            if not match:
                continue
            step = match[1]
            if 'importing cache manifest' in text or 'exporting to GitHub Actions Cache' in text:
                transfer_steps.add(step)
            duration = re.search(r' DONE ([\d.]+)s', text)
            if step in transfer_steps and duration:
                transfer_seconds += float(duration[1])
        cached = len(re.findall(r'^#\d+ CACHED$', log, re.MULTILINE))
        print(f"| {entry['name']} | {entry['elapsedSeconds']} | {cached} | {transfer_seconds:.1f} |")
    print('\nCache timings cover BuildKit import/export vertices; transfers may overlap. Full browser checks always run.')
