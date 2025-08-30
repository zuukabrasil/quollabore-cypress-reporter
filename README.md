## Quollabore Cypress Reporter

Envie resultados de testes **Cypress** para o **Portal Quollabore** com 1 linha no `cypress.config.ts`.  
O pacote intercepta os eventos do runner (before:run, after:spec, after:run), envia os dados da execução e, opcionalmente, pode enviar artifacts em versões futuras (vídeos, screenshots).

> Compatível com Node **\>= 18** (usa `fetch` nativo) e Cypress **\>= 10**.

---

## 📦 Instalação

**Com escopo (recomendado):**

``` 
npm i -D quollabore-cypress-reporter 
```
---

## ⚙️ Configuração rápida

### `cypress.config.ts`

**Se publicou com escopo:**

```
import { defineConfig } from 'cypress';
import { withQuollabore } from 'quollabore-cypress-reporter';

export default defineConfig({
  e2e: {
    setupNodeEvents: withQuollabore, // 1 linha: injeta todos os hooks necessários
  },
});
```

### Variáveis de ambiente (obrigatório)

Defina estas variáveis no seu **CI** (e opcionalmente localmente):

*   `Q_INGEST_TOKEN` → Token do **projeto/ambiente** (Bearer) para enviar reports.
*   `Q_PROJECT_ID` → UUID do projeto no Portal Quollabore.
*   `Q_ENV` (opcional) → ambiente lógico (`dev`, `staging`, `prod`, …). _default:_ `prod`.

O reporter também tenta **auto-detectar** dados do CI (branch, commit, actor, job id) a partir de variáveis padrão do **GitHub Actions**, **GitLab CI**, **Azure DevOps** e **Bitbucket**. Você pode sobrepor esses valores via ENV customizadas se quiser.

---

## 🧪 O que o reporter envia

Para cada execução, o reporter envia uma série de **eventos** para o seu portal:

*   `run:start` → início de execução
*   `suite:start` → início de cada spec executada
*   `case:start` → início de cada teste dentro da spec
*   `case:finish` → término de cada teste (status, duração, erro – se houver)
*   `suite:finish` → término da spec (status agregado, duração)
*   `run:finish` → término da execução (status agregado, métricas)

Campos de **Git/CI** preenchidos automaticamente (ou via ENV):

*   `git_branch`, `git_commit_sha`, `git_commit_msg`, `git_actor`, `ci_job_id`, `parallel_total` (se aplicável).

---

## 🧰 Opções avançadas (opcional)

Você pode passar opções diretamente ao `withQuollabore` para sobrescrever as ENVs:

```
import { defineConfig } from 'cypress';
import { withQuollabore } from 'quollabore-cypress-reporter';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return withQuollabore(on, config, {
        token: process.env.Q_INGEST_TOKEN,
        projectId: process.env.Q_PROJECT_ID,
        environment: process.env.Q_ENV ?? 'prod',
        parallelTotal: Number(process.env.PARALLEL_TOTAL ?? 1),
        cypressNodeIndex: Number(process.env.CYPRESS_NODE_INDEX ?? 0),
      });
    },
  },
});

```

### Interface de opções
```
type QuollaboreOptions = {
  token?: string;            // default: process.env.Q_INGEST_TOKEN
  projectId?: string;        // default: process.env.Q_PROJECT_ID
  environment?: string;      // default: process.env.Q_ENV || 'prod'
  parallelTotal?: number;    // default: 1
  cypressNodeIndex?: number; // default: 0
};

```

> Se você **não** passar nada, o reporter usa apenas as variáveis de ambiente.

---

## 🧭 Exemplos de CI

### GitHub Actions
```
name: e2e
on: [push]

jobs:
  cypress:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx cypress install
      - env:
          Q_INGEST_TOKEN: ${{ secrets.Q_INGEST_TOKEN }}
          Q_PROJECT_ID: ${{ secrets.Q_PROJECT_ID }}
          Q_ENV: prod
        run: npx cypress run --browser chrome --headless

```

### GitLab CI
```
e2e:cypress:
  image: cypress/included:13.7.0
  script:
    - npm ci
    - cypress run --browser chrome --headless
  variables:
    Q_INGEST_TOKEN: $Q_INGEST_TOKEN
    Q_PROJECT_ID: $Q_PROJECT_ID
    Q_ENV: "prod"

 
```

### Azure Pipelines
```
pool:
  vmImage: ubuntu-latest

steps:
  - task: NodeTool@0
    inputs: { versionSpec: '20.x' }
  - script: npm ci
  - script: npx cypress install
  - script: npx cypress run --browser chrome --headless
    env:
      Q_INGEST_TOKEN: $(Q_INGEST_TOKEN)
      Q_PROJECT_ID: $(Q_PROJECT_ID)
      Q_ENV: prod

```

---

## ✅ Checklist de integração

*   Instalou quollabore-cypress-reporter?
*   Adicionou `withQuollabore` no `cypress.config.ts`?
*   Definiu `Q_INGEST_TOKEN`, `Q_PROJECT_ID` no CI?

---

## 🔄 Roadmap (ideias)

*   Upload opcional de **artifacts** (vídeos, screenshots) direto pelo reporter.
*   Flag `Q_DEBUG=1` para logs detalhados.
*   Comando `npx quollabore doctor` para validar conexão e ENVs.
*   Suporte a **retries** + marcação de **flaky** automaticamente.

---

## 🙋 Suporte

Encontrou um problema ou tem sugestão? Abra uma issue no repositório do projeto ou fale com o time do Quollabore.

---

