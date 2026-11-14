"""Show browser wall time and the case inventory for each independent group."""
import json
import pathlib
import sys

report = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
if report['passed']:
    print(f"\nBrowser acceptance: {report['elapsedMs']/1000:.1f}s; {report['workers']} worker(s).\n")
    for group in report['groups']:
        print(f"- {group['name']}: {group['elapsedMs']/1000:.1f}s, {len(group['cases'])} cases; passed.")
        print(f"  Cases: {', '.join(group['cases'])}")
else:
    print('\nBrowser acceptance failed; inspect the separate group reports.')
