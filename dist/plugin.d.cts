type QuollaboreOptions = {
    token?: string;
    projectId?: string;
    environment?: string;
    portalUrl?: string;
    parallelTotal?: number;
    cypressNodeIndex?: number;
    ci_job_id?: string;
    git_branch?: string;
    git_commit_sha?: string;
    git_commit_msg?: string;
    git_actor?: string;
};

/**
 * Plugin principal (para usar em setupNodeEvents do cypress.config.*)
 */
declare function withQuollabore(on: any, config: any, opts?: QuollaboreOptions): any;

export { withQuollabore as default, withQuollabore };
