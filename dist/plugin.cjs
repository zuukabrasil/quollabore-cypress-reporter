"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/plugin.ts
var plugin_exports = {};
__export(plugin_exports, {
  default: () => plugin_default,
  withQuollabore: () => withQuollabore
});
module.exports = __toCommonJS(plugin_exports);

// src/env.ts
var DEFAULT_PORTAL_URL = "https://report-api.quollabore.com/";
function fromEnv(name, fallback = "") {
  return (process.env[name] ?? fallback).toString();
}
function fromEnvNum(name, fallback = 0) {
  const v = process.env[name];
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function autodetectCI() {
  if (process.env.GITHUB_ACTIONS) {
    return {
      git_branch: fromEnv("GITHUB_REF_NAME"),
      git_commit_sha: fromEnv("GITHUB_SHA"),
      git_commit_msg: fromEnv("GITHUB_HEAD_REF") || "",
      git_actor: fromEnv("GITHUB_ACTOR"),
      ci_job_id: fromEnv("GITHUB_RUN_ID")
    };
  }
  if (process.env.GITLAB_CI) {
    return {
      git_branch: fromEnv("CI_COMMIT_BRANCH"),
      git_commit_sha: fromEnv("CI_COMMIT_SHA"),
      git_commit_msg: fromEnv("CI_COMMIT_MESSAGE"),
      git_actor: fromEnv("GITLAB_USER_LOGIN") || fromEnv("GITLAB_USER_NAME"),
      ci_job_id: fromEnv("CI_JOB_ID")
    };
  }
  if (process.env.TF_BUILD) {
    return {
      git_branch: fromEnv("BUILD_SOURCEBRANCHNAME"),
      git_commit_sha: fromEnv("BUILD_SOURCEVERSION"),
      git_commit_msg: "",
      git_actor: fromEnv("BUILD_REQUESTEDFORID") || fromEnv("BUILD_REQUESTEDFOR"),
      ci_job_id: fromEnv("BUILD_BUILDID")
    };
  }
  if (process.env.BITBUCKET_BUILD_NUMBER) {
    return {
      git_branch: fromEnv("BITBUCKET_BRANCH"),
      git_commit_sha: fromEnv("BITBUCKET_COMMIT"),
      git_commit_msg: "",
      git_actor: fromEnv("BITBUCKET_STEP_TRIGGERER_UUID") || "",
      ci_job_id: fromEnv("BITBUCKET_BUILD_NUMBER")
    };
  }
  return {
    git_branch: fromEnv("GIT_BRANCH"),
    git_commit_sha: fromEnv("GIT_COMMIT_SHA"),
    git_commit_msg: fromEnv("GIT_COMMIT_MSG"),
    git_actor: fromEnv("GIT_ACTOR") || fromEnv("USER") || fromEnv("USERNAME"),
    ci_job_id: fromEnv("CI_JOB_ID") || ""
  };
}
function loadOptions(opts = {}) {
  const ci = autodetectCI();
  const token = opts.token ?? fromEnv("Q_INGEST_TOKEN");
  const projectId = opts.projectId ?? fromEnv("Q_PROJECT_ID");
  const environment = opts.environment ?? fromEnv("Q_ENV", "prod");
  const portalUrl = opts.portalUrl ?? fromEnv("Q_PORTAL_URL", process.env.Q_PORTAL_URL ?? DEFAULT_PORTAL_URL);
  const parallelTotal = opts.parallelTotal ?? fromEnvNum("PARALLEL_TOTAL", 1);
  const cypressNodeIndex = opts.cypressNodeIndex ?? fromEnvNum("CYPRESS_NODE_INDEX", 0);
  const git_branch = opts.git_branch ?? ci.git_branch;
  const git_commit_sha = opts.git_commit_sha ?? ci.git_commit_sha;
  const git_commit_msg = opts.git_commit_msg ?? ci.git_commit_msg;
  const git_actor = opts.git_actor ?? ci.git_actor;
  const ci_job_id = opts.ci_job_id ?? ci.ci_job_id;
  if (!token) throw new Error("Q_INGEST_TOKEN n\xE3o definido");
  if (!projectId) throw new Error("Q_PROJECT_ID n\xE3o definido");
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
    ci_job_id
  };
}

// src/http.ts
async function send(portalUrl, token, payload) {
  const res = await fetch(portalUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[quollabore] HTTP ${res.status}: ${text}`);
  }
  return res.json().catch(() => ({}));
}

// src/plugin.ts
var specKey = (spec) => spec?.relative ?? spec?.name ?? spec?.absolute ?? "unknown.spec";
var testKey = (specRel, fullTitle) => `${specRel}|${fullTitle}`;
var asStatus = (state) => state === "passed" ? "passed" : state === "pending" ? "skipped" : "failed";
async function uploadToStorage(localPath) {
  return localPath;
}
function registerQuollaboreTasks(on, o, caseMap) {
  on("task", {
    /**
     * Atualiza parcialmente um caso em execução.
     * payload: { specRel: string, fullTitle: string, patch: Record<string, any> }
     */
    "quollabore:caseUpdate": async (payload) => {
      try {
        const { specRel, fullTitle, patch } = payload ?? {};
        const cid = caseMap.get(testKey(specRel, fullTitle));
        if (!cid) return null;
        await send(o.portalUrl, o.token, {
          type: "case:update",
          case_id: cid,
          patch: patch ?? {}
        });
        return true;
      } catch (e) {
        console.error("[Quollabore] caseUpdate failed:", e);
        return null;
      }
    },
    /**
     * Envia um log vinculado ao caso.
     * payload: { specRel: string, fullTitle: string, level?: string, message: string, data?: any }
     */
    "quollabore:log": async (payload) => {
      try {
        const { specRel, fullTitle, level = "info", message, data } = payload ?? {};
        const cid = caseMap.get(testKey(specRel, fullTitle));
        if (!cid) return null;
        await send(o.portalUrl, o.token, {
          type: "log",
          case_id: cid,
          level,
          message,
          data
        });
        return true;
      } catch (e) {
        console.error("[Quollabore] log failed:", e);
        return null;
      }
    },
    /**
     * Cria um artifact vinculado ao caso (após upload ao storage).
     * payload: { specRel: string, fullTitle: string, type: string, localPath: string }
     */
    "quollabore:artifact": async (payload) => {
      try {
        const { specRel, fullTitle, type, localPath } = payload ?? {};
        const cid = caseMap.get(testKey(specRel, fullTitle));
        if (!cid || !localPath) return null;
        const storage_path = await uploadToStorage(localPath);
        await send(o.portalUrl, o.token, {
          type: "artifact",
          case_id: cid,
          artifact: { type, storage_path }
        });
        return true;
      } catch (e) {
        console.error("[Quollabore] artifact failed:", e);
        return null;
      }
    }
  });
}
function withQuollabore(on, config, opts) {
  const o = loadOptions(opts ?? {});
  let runId = null;
  const suiteMap = /* @__PURE__ */ new Map();
  const caseMap = /* @__PURE__ */ new Map();
  registerQuollaboreTasks(on, o, caseMap);
  on("before:run", async () => {
    try {
      const res = await send(o.portalUrl, o.token, {
        type: "run:start",
        run: {
          provider: "cypress",
          project_id: o.projectId,
          environment: o.environment,
          ci_job_id: o.ci_job_id,
          git_branch: o.git_branch,
          git_commit_sha: o.git_commit_sha,
          git_commit_msg: o.git_commit_msg,
          git_actor: o.git_actor,
          parallel_total: o.parallelTotal,
          status: "running"
        }
      });
      runId = String(res.run_id ?? "");
    } catch (err) {
      console.error("[Quollabore] run:start failed:", err);
      runId = null;
    }
  });
  on("after:screenshot", async (details) => {
    try {
      const localPath = details?.path;
      const specRel = details?.specName ?? "unknown.spec";
      const titlePath = details?.testFailure?.titlePath;
      const fullTitle = titlePath?.join(" > ");
      if (!localPath || !fullTitle) return;
      const storage_path = await uploadToStorage(localPath);
      const cid = caseMap.get(testKey(specRel, fullTitle));
      if (!cid || !storage_path) return;
      await send(o.portalUrl, o.token, {
        type: "artifact",
        case_id: cid,
        artifact: { type: "screenshot", storage_path }
      });
    } catch (err) {
      console.error("[Quollabore] after:screenshot failed:", err);
    }
  });
  on("after:spec", async (spec, results) => {
    if (!runId) return;
    const specRel = specKey(spec);
    let suiteId = suiteMap.get(specRel);
    try {
      if (!suiteId) {
        const suiteResp = await send(o.portalUrl, o.token, {
          type: "suite:start",
          suite: {
            run_id: runId,
            name: specRel,
            file_path: specRel,
            shard_index: o.cypressNodeIndex,
            status: "running"
          }
        });
        suiteId = String(suiteResp.suite_id ?? "");
        suiteMap.set(specRel, suiteId);
      }
      const tests = results?.tests ?? [];
      for (const t of tests) {
        const titlePath = Array.isArray(t.title) ? t.title : [String(t.title ?? "test")];
        const title = titlePath.slice(-1)[0] ?? "test";
        const fullTitle = titlePath.join(" > ");
        let caseId = "";
        try {
          const start = await send(o.portalUrl, o.token, {
            type: "case:start",
            test: {
              suite_id: suiteId,
              title,
              full_title: fullTitle,
              status: "running",
              meta: { browser: results?.browserName }
            }
          });
          caseId = String(start.case_id ?? "");
          caseMap.set(testKey(specRel, fullTitle), caseId);
        } catch (err) {
          console.error("[Quollabore] case:start failed:", err);
          continue;
        }
        const status = asStatus(t.state);
        const durationMs = t.displayError ? void 0 : t.attempts?.[0]?.wallClockDuration;
        const error = t.displayError ? { message: t.displayError } : void 0;
        try {
          await send(o.portalUrl, o.token, {
            type: "case:finish",
            case_id: caseId,
            status,
            duration_ms: durationMs,
            error
          });
        } catch (err) {
          console.error("[Quollabore] case:finish failed:", err);
        }
      }
      const stats = results?.stats ?? {};
      const suiteStatus = (stats.failures ?? 0) > 0 ? "failed" : (stats.tests ?? 0) === 0 ? "skipped" : "passed";
      try {
        await send(o.portalUrl, o.token, {
          type: "suite:finish",
          suite_id: suiteId,
          status: suiteStatus,
          duration_ms: stats.wallClockDuration
        });
      } catch (err) {
        console.error("[Quollabore] suite:finish failed:", err);
      }
      if (results?.video) {
        try {
          const storage_path = await uploadToStorage(results.video);
          const last = tests.slice(-1)[0];
          if (last) {
            const fullTitle = (last.title ?? []).join(" > ");
            const lastCaseId = caseMap.get(testKey(specRel, fullTitle));
            if (lastCaseId && storage_path) {
              await send(o.portalUrl, o.token, {
                type: "artifact",
                case_id: lastCaseId,
                artifact: { type: "video", storage_path }
              });
            }
          }
        } catch (err) {
          console.error("[Quollabore] video artifact failed:", err);
        }
      }
    } catch (err) {
      console.error("[Quollabore] after:spec failed:", err);
    }
  });
  on("after:run", async (results) => {
    if (!runId) return;
    try {
      await send(o.portalUrl, o.token, {
        type: "run:finish",
        run_id: runId,
        status: (results?.totalFailed ?? 0) > 0 ? "failed" : "passed",
        stats: results
      });
    } catch (err) {
      console.error("[Quollabore] run:finish failed:", err);
    }
  });
  return config;
}
var plugin_default = withQuollabore;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  withQuollabore
});
