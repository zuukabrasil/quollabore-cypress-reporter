// env.ts
export type QuollaboreOptions = {
  // obrigatórios via ENV ou override
  token?: string;                // Q_INGEST_TOKEN
  projectId?: string;            // Q_PROJECT_ID
  environment?: string;          // Q_ENV
  portalUrl?: string;            // Q_PORTAL_URL (ou hardcode no http.ts)

  // paralelismo/sharding
  parallelTotal?: number;        // PARALLEL_TOTAL
  cypressNodeIndex?: number;     // CYPRESS_NODE_INDEX

  // metadados (você pode sobrepor; se não, autodetectamos)
  ci_job_id?: string;
  git_branch?: string;
  git_commit_sha?: string;
  git_commit_msg?: string;
  git_actor?: string;
};

/** Tipo exato do objeto retornado por loadOptions (inclui todos os campos usados no plugin). */
export type LoadedOptions = Required<Pick<
  QuollaboreOptions,
  'token' | 'projectId' | 'environment' | 'portalUrl' | 'parallelTotal' | 'cypressNodeIndex'
>> & {
  ci_job_id: string;
  git_branch: string;
  git_commit_sha: string;
  git_commit_msg: string;
  git_actor: string;
};

const DEFAULT_PORTAL_URL = 'https://report-api.quollabore.com/';


function fromEnv(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).toString();
}
function fromEnvNum(name: string, fallback = 0): number {
  const v = process.env[name];
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function autodetectCI() {
  // GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    return {
      git_branch: fromEnv('GITHUB_REF_NAME'),
      git_commit_sha: fromEnv('GITHUB_SHA'),
      git_commit_msg: fromEnv('GITHUB_HEAD_REF') || '',
      git_actor: fromEnv('GITHUB_ACTOR'),
      ci_job_id: fromEnv('GITHUB_RUN_ID'),
    };
  }
  // GitLab CI
  if (process.env.GITLAB_CI) {
    return {
      git_branch: fromEnv('CI_COMMIT_BRANCH'),
      git_commit_sha: fromEnv('CI_COMMIT_SHA'),
      git_commit_msg: fromEnv('CI_COMMIT_MESSAGE'),
      git_actor: fromEnv('GITLAB_USER_LOGIN') || fromEnv('GITLAB_USER_NAME'),
      ci_job_id: fromEnv('CI_JOB_ID'),
    };
  }
  // Azure Pipelines
  if (process.env.TF_BUILD) {
    return {
      git_branch: fromEnv('BUILD_SOURCEBRANCHNAME'),
      git_commit_sha: fromEnv('BUILD_SOURCEVERSION'),
      git_commit_msg: '',
      git_actor: fromEnv('BUILD_REQUESTEDFORID') || fromEnv('BUILD_REQUESTEDFOR'),
      ci_job_id: fromEnv('BUILD_BUILDID'),
    };
  }
  // Bitbucket
  if (process.env.BITBUCKET_BUILD_NUMBER) {
    return {
      git_branch: fromEnv('BITBUCKET_BRANCH'),
      git_commit_sha: fromEnv('BITBUCKET_COMMIT'),
      git_commit_msg: '',
      git_actor: fromEnv('BITBUCKET_STEP_TRIGGERER_UUID') || '',
      ci_job_id: fromEnv('BITBUCKET_BUILD_NUMBER'),
    };
  }
  // local / desconhecido
  return {
    git_branch: fromEnv('GIT_BRANCH'),
    git_commit_sha: fromEnv('GIT_COMMIT_SHA'),
    git_commit_msg: fromEnv('GIT_COMMIT_MSG'),
    git_actor: fromEnv('GIT_ACTOR') || fromEnv('USER') || fromEnv('USERNAME'),
    ci_job_id: fromEnv('CI_JOB_ID') || '',
  };
}

export function loadOptions(opts: QuollaboreOptions = {}): LoadedOptions {
  const ci = autodetectCI();

  const token = opts.token ?? fromEnv('Q_INGEST_TOKEN');
  const projectId = opts.projectId ?? fromEnv('Q_PROJECT_ID');
  const environment = opts.environment ?? fromEnv('Q_ENV', 'prod');
  const portalUrl   = opts.portalUrl ?? fromEnv('Q_PORTAL_URL', process.env.Q_PORTAL_URL ?? DEFAULT_PORTAL_URL);


  const parallelTotal = opts.parallelTotal ?? fromEnvNum('PARALLEL_TOTAL', 1);
  const cypressNodeIndex = opts.cypressNodeIndex ?? fromEnvNum('CYPRESS_NODE_INDEX', 0);

  const git_branch = opts.git_branch ?? ci.git_branch;
  const git_commit_sha = opts.git_commit_sha ?? ci.git_commit_sha;
  const git_commit_msg = opts.git_commit_msg ?? ci.git_commit_msg;
  const git_actor = opts.git_actor ?? ci.git_actor;
  const ci_job_id = opts.ci_job_id ?? ci.ci_job_id;

  if (!token) throw new Error('Q_INGEST_TOKEN não definido');
  if (!projectId) throw new Error('Q_PROJECT_ID não definido');

  return {
    token,
    projectId,
    environment,
    portalUrl,
    parallelTotal,
    cypressNodeIndex,
    git_branch,
    git_commit_sha,
    git_commit_msg,
    git_actor,
    ci_job_id,
  };
}
