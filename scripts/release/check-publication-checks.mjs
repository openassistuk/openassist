import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workflows = [
  { file: 'ci.yml', jobs: ['workflow-lint', ...['ubuntu-latest', 'macos-latest', 'windows-latest'].map(os => `quality-and-coverage (${os})`)] },
  { file: 'codeql.yml', jobs: ['CodeQL preflight', 'analyze (javascript-typescript) (javascript-typescript)'] }
];
const pageSize = 100;
const maxPages = 3;

async function listItems(request, route, key) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = route.includes('?') ? '&' : '?';
    const data = await request(`${route}${separator}per_page=${pageSize}&page=${page}`);
    if (!Number.isSafeInteger(data?.total_count) || data.total_count < 0 || !Array.isArray(data[key]) || data[key].length > pageSize) {
      throw new Error('GitHub Actions returned an invalid list response.');
    }
    items.push(...data[key]);
    if (items.length > data.total_count) throw new Error('GitHub Actions returned an invalid list count.');
    if (items.length === data.total_count) return items;
    if (data[key].length === 0) throw new Error('GitHub Actions returned an incomplete list response.');
  }
  throw new Error('GitHub Actions check history exceeds the publication query limit.');
}

// request is injectable for offline tests; production uses authenticated,
// read-only GitHub API calls. Never accept PR-only analysis as release evidence.
export async function checkPublicationChecks({ repository, commit, request }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') || !/^[a-f0-9]{40}$/.test(commit ?? '')) {
    throw new Error('Publication checks require a repository and an exact commit SHA.');
  }
  const evidence = [];
  for (const workflow of workflows) {
    const runs = await listItems(request,
      `/repos/${repository}/actions/workflows/${workflow.file}/runs?branch=main&head_sha=${commit}&exclude_pull_requests=true`, 'workflow_runs');
    const candidates = runs.filter(run => run.head_sha === commit && run.head_branch === 'main'
      && ['push', 'schedule', 'workflow_dispatch'].includes(run.event)
      && run.path === `.github/workflows/${workflow.file}`);
    if (candidates.some(run => !Number.isSafeInteger(run.id) || run.id <= 0 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || !Number.isFinite(Date.parse(run.created_at)))) {
      throw new Error(`${workflow.file} returned invalid run evidence.`);
    }
    candidates.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
    const run = candidates[0];
    if (!run) throw new Error(`${workflow.file} has no main-branch run for ${commit}.`);
    const runUrl = `https://github.com/${repository}/actions/runs/${run.id}`;
    if (run.status !== 'completed' || run.conclusion !== 'success') {
      throw new Error(`${workflow.file} latest run is ${run.conclusion ?? run.status}: ${runUrl}`);
    }
    const jobs = await listItems(request, `/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
    for (const name of workflow.jobs) {
      const matches = jobs.filter(job => job.name === name);
      if (matches.length !== 1 || matches[0].head_sha !== commit || matches[0].run_id !== run.id || matches[0].run_attempt !== run.run_attempt
        || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') {
        throw new Error(`${workflow.file} requires a successful ${name} on attempt ${run.run_attempt}: ${runUrl}`);
      }
    }
    evidence.push(`${workflow.file}: ${runUrl} (attempt ${run.run_attempt}, ${commit})`);
  }
  return evidence;
}

export function githubRequest(token, fetchFn = fetch) {
  if (!token) throw new Error('GH_TOKEN is required to read publication checks.');
  return async route => {
    let response;
    try {
      response = await fetchFn(`https://api.github.com${route}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
        redirect: 'error', signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new Error('Unable to read GitHub Actions publication checks.');
    }
    if (!response.ok) throw new Error(`GitHub Actions publication check request failed (HTTP ${response.status}).`);
    try { return await response.json(); } catch { throw new Error('GitHub Actions returned invalid JSON for publication checks.'); }
  };
}

export function checkedOutReleaseCommit({ tag, dispatchCommit, resolveCommit }) {
  if (!/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(tag ?? '')) throw new Error('An existing version tag is required for publication checks.');
  const commit = resolveCommit('HEAD^{commit}');
  if (commit !== resolveCommit(`refs/tags/${tag}^{commit}`) || commit !== dispatchCommit) {
    throw new Error('Dispatch publication from the release tag; checkout, tag and workflow commit must agree.');
  }
  return commit;
}

async function main() {
  const commit = checkedOutReleaseCommit({
    tag: process.env.RELEASE_TAG,
    dispatchCommit: process.env.GITHUB_SHA,
    resolveCommit: ref => execFileSync('git', ['rev-parse', '--verify', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  });
  const evidence = await checkPublicationChecks({ repository: process.env.GITHUB_REPOSITORY, commit, request: githubRequest(process.env.GH_TOKEN) });
  for (const line of evidence) console.log(line);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`Publication blocked: ${error instanceof Error ? error.message : 'check verification failed'}`);
    process.exitCode = 1;
  });
}
