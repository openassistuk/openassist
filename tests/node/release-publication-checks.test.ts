import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  checkPublicationChecks,
  checkedOutReleaseCommit,
  githubRequest
} from "../../scripts/release/check-publication-checks.mjs";

const repository = "openassist/example";
const commit = "a".repeat(40);
const ciNames = ["workflow-lint", ...["ubuntu-latest", "macos-latest", "windows-latest"].map(os => `quality-and-coverage (${os})`)];
const codeqlNames = ["CodeQL preflight", "analyze (javascript-typescript) (javascript-typescript)"];

function run(file: string, id: number) {
  return { id, run_attempt: 2, path: `.github/workflows/${file}`, head_sha: commit, head_branch: "main", event: "push", status: "completed", conclusion: "success", created_at: "2026-10-01T00:00:00Z" };
}

function fixture() {
  const ci = run("ci.yml", 20);
  const codeql = run("codeql.yml", 21);
  const job = (name: string, source: typeof ci) => ({ name, head_sha: commit, run_id: source.id, run_attempt: source.run_attempt, status: "completed", conclusion: "success" });
  const ciJobs = ciNames.map(name => job(name, ci));
  const codeqlJobs = codeqlNames.map(name => job(name, codeql));
  const ciRuns = [ci];
  const codeqlRuns = [codeql];
  const requests: string[] = [];
  const request = async (route: string) => {
    requests.push(route);
    const url = new URL(route, "https://api.github.com");
    const start = (Number(url.searchParams.get("page")) - 1) * 100;
    if (url.pathname.includes("/workflows/")) {
      assert.equal(url.searchParams.get("head_sha"), commit);
      assert.equal(url.searchParams.get("branch"), "main");
      assert.equal(url.searchParams.get("exclude_pull_requests"), "true");
      const rows = url.pathname.includes("ci.yml") ? ciRuns : codeqlRuns;
      return { total_count: rows.length, workflow_runs: rows.slice(start, start + 100) };
    }
    assert.match(url.pathname, /\/attempts\/2\/jobs$/);
    const rows = url.pathname.includes("/20/") ? ciJobs : codeqlJobs;
    return { total_count: rows.length, jobs: rows.slice(start, start + 100) };
  };
  return { ci, codeql, ciRuns, codeqlRuns, ciJobs, codeqlJobs, requests, request };
}

describe("release publication prerequisites", () => {
  it("accepts all required jobs on the exact main commit and current attempt", async () => {
    const data = fixture();
    const evidence = await checkPublicationChecks({ repository, commit, request: data.request });
    assert.equal(evidence.length, 2);
    assert(evidence.every((line: string) => line.includes(commit) && line.includes("attempt 2")));
    assert.equal(data.requests.length, 4);
  });

  for (const field of ["head_sha", "head_branch", "event", "path"] as const) {
    it(`rejects unrelated CI evidence (${field})`, async () => {
      const data = fixture();
      data.ci[field] = { head_sha: "b".repeat(40), head_branch: "feature", event: "pull_request", path: ".github/workflows/other.yml" }[field];
      await assert.rejects(checkPublicationChecks({ repository, commit, request: data.request }), /ci.yml has no main-branch run/);
    });
  }

  for (const conclusion of ["failure", "cancelled", "skipped", "timed_out"]) {
    it(`does not fall back to an older green CI run after ${conclusion}`, async () => {
      const data = fixture();
      data.ciRuns.push({ ...data.ci, id: 19, created_at: "2026-09-30T23:00:00Z" });
      data.ci.conclusion = conclusion;
      await assert.rejects(checkPublicationChecks({ repository, commit, request: data.request }), new RegExp(`latest run is ${conclusion}`));
    });
  }

  it("blocks pending checks and missing CodeQL runs", async () => {
    const data = fixture();
    data.ci.status = "in_progress";
    await assert.rejects(checkPublicationChecks({ repository, commit, request: data.request }), /latest run/);
    data.ci.status = "completed";
    data.codeqlRuns.length = 0;
    await assert.rejects(checkPublicationChecks({ repository, commit, request: data.request }), /codeql.yml has no main-branch run/);
  });

  for (const name of [...ciNames, ...codeqlNames]) {
    it(`requires a successful ${name} even when the workflow is green`, async () => {
      const data = fixture();
      const target = [...data.ciJobs, ...data.codeqlJobs].find(job => job.name === name)!;
      target.conclusion = "skipped";
      await assert.rejects(checkPublicationChecks({ repository, commit, request: data.request }), /requires a successful/);
    });
  }

  it("rejects missing, duplicate, wrong-commit and previous-attempt job evidence", async () => {
    for (const fault of ["missing", "duplicate", "commit", "attempt", "run", "pending"]) {
      const data = fixture();
      if (fault === "missing") data.ciJobs.pop();
      if (fault === "duplicate") data.ciJobs.push({ ...data.ciJobs[0] });
      if (fault === "commit") data.ciJobs[0].head_sha = "b".repeat(40);
      if (fault === "attempt") data.ciJobs[0].run_attempt = 1;
      if (fault === "run") data.ciJobs[0].run_id = 19;
      if (fault === "pending") data.ciJobs[0].status = "in_progress";
      await assert.rejects(checkPublicationChecks({ repository, commit, request: data.request }), /requires a successful/);
    }
  });

  it("reads paginated jobs and fails closed on excessive or incomplete history", async () => {
    const data = fixture();
    data.ciJobs.unshift(...Array.from({ length: 100 }, (_, index) => ({ ...data.ciJobs[0], name: `supplemental-${index}` })));
    await checkPublicationChecks({ repository, commit, request: data.request });
    assert(data.requests.some(route => route.includes("/jobs?per_page=100&page=2")));
    await assert.rejects(checkPublicationChecks({ repository, commit, request: async () => ({ total_count: 301, workflow_runs: Array(100).fill(data.ci) }) }), /query limit/);
    await assert.rejects(checkPublicationChecks({ repository, commit, request: async () => ({ total_count: 1, workflow_runs: [] }) }), /incomplete/);
    await assert.rejects(checkPublicationChecks({ repository, commit, request: async () => ({ workflow_runs: [] }) }), /invalid list/);
    await assert.rejects(checkPublicationChecks({ repository, commit, request: async () => ({ total_count: 0, workflow_runs: [data.ci] }) }), /invalid list count/);
  });

  it("rejects malformed selectors and run metadata before accepting evidence", async () => {
    const data = fixture();
    for (const selector of [{ repository: "owner/repo/extra", commit }, { repository, commit: "main" }]) {
      await assert.rejects(checkPublicationChecks({ ...selector, request: data.request }), /exact commit SHA/);
    }
    assert.equal(data.requests.length, 0);
    data.ci.created_at = "invalid";
    await assert.rejects(checkPublicationChecks({ repository, commit, request: data.request }), /invalid run evidence/);
  });

  it("ties publication to the checked-out tag and dispatch commit, including annotated tags", () => {
    const resolveCommit = (ref: string) => {
      assert(["HEAD^{commit}", "refs/tags/v0.2.2^{commit}"].includes(ref));
      return commit;
    };
    assert.equal(checkedOutReleaseCommit({ tag: "v0.2.2", dispatchCommit: commit, resolveCommit }), commit);
    assert.throws(() => checkedOutReleaseCommit({ tag: "v0.2.2", dispatchCommit: "b".repeat(40), resolveCommit }), /must agree/);
    assert.throws(() => checkedOutReleaseCommit({ tag: "v0.2.2", dispatchCommit: commit, resolveCommit: ref => ref.startsWith("HEAD") ? commit : "b".repeat(40) }), /must agree/);
    assert.throws(() => checkedOutReleaseCommit({ tag: "main", dispatchCommit: commit, resolveCommit }), /version tag/);
  });

  it("uses read-only API calls and never exposes credentials or remote error bodies", async () => {
    const token = "test-token";
    const request = githubRequest(token, async (url: string, options: RequestInit) => {
      assert.equal(url, "https://api.github.com/repos/openassist/example/actions/runs");
      assert.equal(options.redirect, "error");
      assert.equal(options.method, undefined);
      assert.equal((options.headers as Record<string, string>).Authorization, `Bearer ${token}`);
      return Response.json({ ok: true });
    });
    assert.deepEqual(await request("/repos/openassist/example/actions/runs"), { ok: true });
    assert.throws(() => githubRequest(""), /GH_TOKEN/);
    for (const fetchFn of [async () => new Response(token, { status: 403 }), async () => new Response(token), async () => { throw new Error(token); }]) {
      await assert.rejects(githubRequest(token, fetchFn)("/repos/openassist/example/actions/runs"), (error: Error) => !error.message.includes(token));
    }
  });

  it("keeps required CI/CodeQL job names aligned with workflow definitions", () => {
    const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
    for (const os of ["ubuntu-latest", "macos-latest", "windows-latest"]) assert(ci.includes(`- ${os}`));
    assert.match(ci, /  workflow-lint:/);
    assert.match(ci, /  quality-and-coverage:/);
    const codeql = fs.readFileSync(".github/workflows/codeql.yml", "utf8");
    assert.match(codeql, /name: CodeQL preflight/);
    assert.match(codeql, /name: analyze \(javascript-typescript\)/);
    assert.match(codeql, /language:\s+- javascript-typescript/);
  });
});
