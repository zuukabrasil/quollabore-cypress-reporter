import { loadOptions, QuollaboreOptions } from './env';
import { send } from './http';

type CypressSpec = {
  name?: string;
  relative?: string;
  absolute?: string;
};

type CypressTestResult = {
  title?: string[]; // path do teste
  state?: 'passed' | 'failed' | 'pending' | string;
  displayError?: string;
  attempts?: Array<{ wallClockDuration?: number }>;
};

type CypressSpecResults = {
  tests?: CypressTestResult[];
  stats?: {
    tests?: number;
    failures?: number;
    wallClockDuration?: number;
  };
  browserName?: string;
  video?: string | null;
};

// ---------- Helpers locais ----------
const specKey = (spec: CypressSpec) =>
  spec?.relative ?? spec?.name ?? spec?.absolute ?? 'unknown.spec';

const testKey = (specRel: string, fullTitle: string) => `${specRel}|${fullTitle}`;

const asStatus = (state: string | undefined) =>
  state === 'passed' ? 'passed' :
  state === 'pending' ? 'skipped' : 'failed';

/**
 * Stub de upload — substitua pelo seu pipeline real (Supabase Storage/S3/etc).
 * Deve retornar um caminho endereçável (ex.: "public/xyz.png", "s3://bucket/key").
 */
async function uploadToStorage(localPath: string): Promise<string> {
  // TODO: implemente upload real e devolva 'storage_path'
  // Por ora, retornamos o próprio caminho como placeholder.
  return localPath;
}

/**
 * Registra tasks reutilizáveis (case:update, log, artifact) — precisam do caseMap.
 */
function registerQuollaboreTasks(
  on: any,
  o: ReturnType<typeof loadOptions>,
  caseMap: Map<string, string>
) {
  on('task', {
    /**
     * Atualiza parcialmente um caso em execução.
     * payload: { specRel: string, fullTitle: string, patch: Record<string, any> }
     */
    'quollabore:caseUpdate': async (payload: any) => {
      try {
        const { specRel, fullTitle, patch } = payload ?? {};
        const cid = caseMap.get(testKey(specRel, fullTitle));
        if (!cid) return null;
        await send(o.portalUrl, o.token, {
          type: 'case:update',
          case_id: cid,
          patch: patch ?? {},
        });
        return true;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[Quollabore] caseUpdate failed:', e);
        return null;
      }
    },

    /**
     * Envia um log vinculado ao caso.
     * payload: { specRel: string, fullTitle: string, level?: string, message: string, data?: any }
     */
    'quollabore:log': async (payload: any) => {
      try {
        const { specRel, fullTitle, level = 'info', message, data } = payload ?? {};
        const cid = caseMap.get(testKey(specRel, fullTitle));
        if (!cid) return null;
        await send(o.portalUrl, o.token, {
          type: 'log',
          case_id: cid,
          level,
          message,
          data,
        });
        return true;
      } catch (e) {
        console.error('[Quollabore] log failed:', e);
        return null;
      }
    },

    /**
     * Cria um artifact vinculado ao caso (após upload ao storage).
     * payload: { specRel: string, fullTitle: string, type: string, localPath: string }
     */
    'quollabore:artifact': async (payload: any) => {
      try {
        const { specRel, fullTitle, type, localPath } = payload ?? {};
        const cid = caseMap.get(testKey(specRel, fullTitle));
        if (!cid || !localPath) return null;
        const storage_path = await uploadToStorage(localPath);
        await send(o.portalUrl, o.token, {
          type: 'artifact',
          case_id: cid,
          artifact: { type, storage_path },
        });
        return true;
      } catch (e) {
        console.error('[Quollabore] artifact failed:', e);
        return null;
      }
    },
  });
}

/**
 * Plugin principal (para usar em setupNodeEvents do cypress.config.*)
 */
export function withQuollabore(on: any, config: any, opts?: QuollaboreOptions) {
  const o = loadOptions(opts ?? {});

  // Caches de ids
  let runId: string | null = null;
  const suiteMap = new Map<string, string>(); // specRel -> suite_id
  const caseMap  = new Map<string, string>(); // (specRel|fullTitle) -> case_id

  // Tasks (case:update, log, artifact)
  registerQuollaboreTasks(on, o, caseMap);

  // ---- RUN START -----------------------------------------------------------
  on('before:run', async () => {
    try {
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
          status: 'running',
        },
      });
      runId = String(res.run_id ?? '');
    } catch (err) {
      console.error('[Quollabore] run:start failed:', err);
      runId = null;
    }
  });

  // ---- ARTIFACT (screenshot) ----------------------------------------------
  on('after:screenshot', async (details: any) => {
    try {
      // details: { path, specName, name, ..., testFailure: { title, titlePath } }
      // Nem sempre teremos o título do teste aqui; quando houver, associamos ao case.
      const localPath: string = details?.path;
      const specRel: string = details?.specName ?? 'unknown.spec';
      const titlePath: string[] | undefined = details?.testFailure?.titlePath;
      const fullTitle: string | undefined = titlePath?.join(' > ');
      if (!localPath || !fullTitle) return;

      const storage_path = await uploadToStorage(localPath);
      const cid = caseMap.get(testKey(specRel, fullTitle));
      if (!cid || !storage_path) return;

      await send(o.portalUrl, o.token, {
        type: 'artifact',
        case_id: cid,
        artifact: { type: 'screenshot', storage_path },
      });
    } catch (err) {
      console.error('[Quollabore] after:screenshot failed:', err);
    }
  });

  // ---- POR SPEC (SUITE + CASES) -------------------------------------------
  on('after:spec', async (spec: CypressSpec, results: CypressSpecResults) => {
    if (!runId) return;

    const specRel = specKey(spec);
    let suiteId = suiteMap.get(specRel);

    try {
      // suite:start se não criada ainda
      if (!suiteId) {
        const suiteResp: any = await send(o.portalUrl, o.token, {
          type: 'suite:start',
          suite: {
            run_id: runId,
            name: specRel,
            file_path: specRel,
            shard_index: o.cypressNodeIndex,
            status: 'running',
          },
        });
        suiteId = String(suiteResp.suite_id ?? '');
        suiteMap.set(specRel, suiteId);
      }

      // cases do spec
      const tests = results?.tests ?? [];
      for (const t of tests) {
        const titlePath: string[] = Array.isArray(t.title) ? t.title : [String(t.title ?? 'test')];
        const title = titlePath.slice(-1)[0] ?? 'test';
        const fullTitle = titlePath.join(' > ');

        let caseId = '';
        try {
          const start: any = await send(o.portalUrl, o.token, {
            type: 'case:start',
            test: {
              suite_id: suiteId,
              title,
              full_title: fullTitle,
              status: 'running',
              meta: { browser: results?.browserName },
            },
          });
          caseId = String(start.case_id ?? '');
          caseMap.set(testKey(specRel, fullTitle), caseId);
        } catch (err) {
          console.error('[Quollabore] case:start failed:', err);
          continue;
        }

        const status = asStatus(t.state);
        const durationMs = t.displayError ? undefined : t.attempts?.[0]?.wallClockDuration;
        const error = t.displayError ? { message: t.displayError } : undefined;

        try {
          await send(o.portalUrl, o.token, {
            type: 'case:finish',
            case_id: caseId,
            status,
            duration_ms: durationMs,
            error,
          });
        } catch (err) {
          console.error('[Quollabore] case:finish failed:', err);
        }
      }

      // suite:finish
      const stats = results?.stats ?? {};
      const suiteStatus =
        (stats.failures ?? 0) > 0 ? 'failed' :
        (stats.tests ?? 0) === 0 ? 'skipped' : 'passed';

      try {
        await send(o.portalUrl, o.token, {
          type: 'suite:finish',
          suite_id: suiteId,
          status: suiteStatus,
          duration_ms: stats.wallClockDuration,
        });
      } catch (err) {
        console.error('[Quollabore] suite:finish failed:', err);
      }

      // vídeo do spec como artifact (opcional)
      if (results?.video) {
        try {
          const storage_path = await uploadToStorage(results.video);
          // Associa ao último case do spec (ou ajuste conforme sua estratégia)
          const last = tests.slice(-1)[0];
          if (last) {
            const fullTitle = (last.title ?? []).join(' > ');
            const lastCaseId = caseMap.get(testKey(specRel, fullTitle));
            if (lastCaseId && storage_path) {
              await send(o.portalUrl, o.token, {
                type: 'artifact',
                case_id: lastCaseId,
                artifact: { type: 'video', storage_path },
              });
            }
          }
        } catch (err) {
          console.error('[Quollabore] video artifact failed:', err);
        }
      }

    } catch (err) {
      console.error('[Quollabore] after:spec failed:', err);
    }
  });

  // ---- RUN FINISH ----------------------------------------------------------
  on('after:run', async (results: any) => {
    if (!runId) return;
    try {
      await send(o.portalUrl, o.token, {
        type: 'run:finish',
        run_id: runId,
        status: (results?.totalFailed ?? 0) > 0 ? 'failed' : 'passed',
        stats: results,
      });
    } catch (err) {
      console.error('[Quollabore] run:finish failed:', err);
    }
  });

  return config;
}

export default withQuollabore;
