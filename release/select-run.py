"""Resolve a successful, same-repository main CI run before downloading assets."""
import json
import os
import urllib.request

def get(repo, endpoint):
    request = urllib.request.Request(f'https://api.github.com/repos/{repo}/{endpoint}', headers={
        'Authorization': f"Bearer {os.environ['GH_TOKEN']}",
        'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def validate(run, workflow_id, repo):
    if (run['workflow_id'] != workflow_id or run['head_repository']['full_name'] != repo
            or run['head_branch'] != 'main' or run['event'] not in ('push', 'workflow_dispatch')
            or run['status'] != 'completed' or run['conclusion'] != 'success'):
        raise ValueError('Select a completed, successful main build from this repository’s CI workflow')


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    run_id = os.environ['CI_RUN_ID']
    if not run_id.isdecimal():
        raise ValueError('ci_run_id must be numeric')
    run = get(repo, f'actions/runs/{run_id}')
    validate(run, get(repo, 'actions/workflows/ci.yml')['id'], repo)
    revision = run['head_sha']
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        output.write(f"revision={revision}\nartifact=playground-site-{revision}\nrun_url={run['html_url']}\n")
    print(f"Selected {run['html_url']} at {revision}")


if __name__ == '__main__':
    main()
