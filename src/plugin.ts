import { loadOptions, QuollaboreOptions } from './env';
import { send } from './http';

export function withQuollabore(on: any, config: any, opts?: QuollaboreOptions) {
  const o = loadOptions(opts ?? {});
  let runId: string;

  on('before:run', async () => {
    const res: any = await send(o.portalUrl, o.token, {
      type: 'run:start',
      run: {
        provider: 'cypress',
        project_id: o.projectId,
        environment: o.environment,
        ci_job_id: o.ci_job_id,
        git_branch: o.git_branch,
        git_commit_sha: o.git_commit_sha,
        git_commit_msg: o.git_commit_msg,
        git_actor: o.git_actor,
        parallel_total: o.parallelTotal,
        status: 'running'
      }
    });
    runId = res.run_id;
  });

  on('after:spec', async (spec, results) => {
    const suiteResp: any = await send(o.portalUrl, o.token, {
      type: 'suite:start',
      suite: {
        run_id: runId,
        name: spec.relative,
        file_path: spec.relative,
        shard_index: o.cypressNodeIndex,
        status: 'running'
      }
    });
    const suite_id = suiteResp.suite_id;

    for (const t of (results?.tests ?? [])) {
      const start: any = await send(o.portalUrl, o.token, {
        type: 'case:start',
        test: {
          suite_id,
          title: t.title?.slice(-1)[0] ?? 'test',
          full_title: t.title?.join(' > '),
          status: 'running',
          meta: { browser: results.browserName }
        }
      });
      const case_id = start.case_id;

      await send(o.portalUrl, o.token, {
        type: 'case:finish',
        case_id,
        status: t.state === 'passed' ? 'passed'
              : t.state === 'pending' ? 'skipped' : 'failed',
        duration_ms: t.displayError ? undefined : t.attempts?.[0]?.wallClockDuration,
        error: t.displayError ? { message: t.displayError } : undefined
      });
    }

    await send(o.portalUrl, o.token, {
      type: 'suite:finish',
      suite_id,
      status: results.stats.failures > 0 ? 'failed'
            : results.stats.tests === 0 ? 'skipped' : 'passed',
      duration_ms: results.stats.wallClockDuration
    });
  });

  on('after:run', async (results) => {
    await send(o.portalUrl, o.token, {
      type: 'run:finish',
      run_id: runId,
      status: results.totalFailed > 0 ? 'failed' : 'passed',
      stats: results
    });
  });

  return config;
}
export default withQuollabore;
