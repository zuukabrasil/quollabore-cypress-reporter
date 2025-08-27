npm i -D @quollabore/cypress-reporter

// cypress.config.ts
import { defineConfig } from 'cypress';
import { withQuollabore } from '@quollabore/cypress-reporter';

export default defineConfig({
  e2e: { setupNodeEvents: withQuollabore }
});

// ENVs: Q_PORTAL_URL, Q_INGEST_TOKEN, Q_PROJECT_ID, (opcional) Q_ENV
