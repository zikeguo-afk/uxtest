# UXAgent Local Workspace

This repository is a local, editable version of the `Kimi_Agent_可用性测试流程` frontend.
It runs as a Vite + React + TypeScript app and supports both `mock` and `api` providers (default `api`).

## Prerequisites

- macOS/Linux shell
- `nvm`
- Node.js `22` (see `.nvmrc`)

## Setup

```bash
cd /Users/hongwifi/Documents/写论文cod
source "$HOME/.nvm/nvm.sh"
nvm use 22
npm ci
```

## Run

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## Run Backend (Local API)

Terminal 1:

```bash
npm run server:install-browser
npm run server:dev
```

Terminal 2:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## Build And Preview

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
npm run server:build
```

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run test:smoke
npm run check
```

## Current Workflow

Main flow remains unchanged:

`init -> analysis -> task-selection -> execution -> report`

In `task-selection`:

- Select `3-10` tasks.
- Configure tested users by **category counts** (not individual persona IDs).

In backend:

- Heterogeneous personas are generated from category counts.
- Variability is count-driven and not exposed in UI controls.
- Execution sampling uses fixed budget, default cap `40` cases.
- Run snapshots are generated for downstream drill-down and QA.
- `/diagnosis` supports real URL analysis (`EVALUATION_MODE=auto|real`) with strict task gate.
- If generated tasks fail quality/evidence checks, API returns diagnosis only (`tasks=[]`) and blocks next step.

In `execution`:

- Default view is summary-first drill-down:
  - task summary -> case list -> step timeline
- Case-level follow-up Q&A is supported.

In `report`:

- Keep overall + task-level metrics.
- Keep category-level summary + representative samples.
- Add global Q&A (current run only) and one-click contextual ask from metric/sample rows.

## Evidence-first QA

- QA is scoped to current run snapshot only.
- Answers are marked as `evidence` or `inference`.
- Responses include evidence references when available.

## LLM Readiness

- LLM is optional and can be used for:
  - `/diagnosis` code/usability analysis and task priority generation.
  - QA `inference` answer enhancement.
- LLM must not create or alter evidence IDs (`caseId/taskId/step`).
- Check status: `GET /api/v1/llm/healthz`
- Execution-channel status: `GET /api/v1/llm/execution-healthz`
- Deep probe external API: `GET /api/v1/llm/healthz?probe=1`

## Environment Variables

Copy `.env.example` to `.env` if needed:

- `VITE_UX_AGENT_PROVIDER=mock|api`
- `VITE_ENABLE_KIMI_INSPECT=true`
- `VITE_MAX_EXECUTION_CASES=40`
- `VITE_API_BASE_URL=http://localhost:8787`
- `VITE_DEFAULT_TARGET_URL=https://frbe2kpuvbfve.ok.kimi.link`
- `API_PORT=8787`
- `RUN_TTL_MS=7200000`
- `RUN_CACHE_SIZE=200`
- `RUN_CLEANUP_INTERVAL_MS=600000`
- `EXECUTION_JOB_TTL_MS=7200000`
- `EXECUTION_JOB_CACHE_SIZE=200`
- `EXECUTION_JOB_CLEANUP_INTERVAL_MS=600000`
- `EVALUATION_MODE=auto`
- `EVALUATOR_TIMEOUT_MS=30000`
- `EVALUATOR_ALLOW_INSECURE_TLS=true`
- `LIVE_RUNNER_ENABLED=true`
- `PLAYWRIGHT_HEADLESS=true`
- `PLAYWRIGHT_CONCURRENCY=2`
- `CASE_MAX_STEPS=12`
- `CASE_TIMEOUT_MS=90000`
- `STEP_TIMEOUT_MS=10000`
- `LIVE_RUNNER_SCREENSHOT_ENABLED=true`
- `LIVE_RUNNER_ARTIFACT_DIR=server/.artifacts/live-runs`
- `LLM_PROVIDER=mock|openai-compatible`
- `LLM_API_BASE_URL=https://api.openai.com/v1`
- `LLM_API_KEY=...`
- `LLM_MODEL=gpt-4o-mini`
- `LLM_TIMEOUT_MS=20000`
- `LLM_TEMPERATURE=0.2`
- `LLM_EXEC_PROVIDER=inherit|mock|openai-compatible` (execution-only channel, `inherit` reuses primary LLM)
- `LLM_EXEC_API_BASE_URL=...`
- `LLM_EXEC_API_KEY=...`
- `LLM_EXEC_MODEL=...`
- `LLM_EXEC_TIMEOUT_MS=20000`
- `LLM_EXEC_TEMPERATURE=0.2`
- `LLM_EXEC_STAGE_RETRY_COUNT=2`
- `LLM_EXEC_JSON_REPAIR_COUNT=1`
- `LLM_STAGE_RETRY_COUNT=2`
- `LLM_JSON_REPAIR_COUNT=1`
- `LLM_CHUNK_TOKEN_BUDGET=1600`
- `DIAGNOSIS_PIPELINE_MODE=llm-4stage`
- `SOURCE_COLLECT_SAME_ORIGIN_ONLY=true`
- `SOURCE_COLLECT_MAX_TOTAL_BYTES=2500000`
- `DIAGNOSIS_STRICT_TASKS=true`
- `DIAGNOSIS_TASK_BLACKLIST=购物车,结账,优惠券,下单,收货地址,SKU,订单,支付`

## Provider Architecture

Provider contract:

- `src/services/uxAgentProvider.ts`

Default implementation:

- `src/services/mockProvider.ts`
- `src/services/apiProvider.ts`

Core generation/sampling services:

- `src/services/cohortGenerator.ts`
- `src/services/executionSampler.ts`

Mock data sources:

- `src/data/mock/tasks.ts`
- `src/data/mock/agentCategories.ts`
- `src/data/mock/executionTemplates.ts`
- `src/data/mock/results.ts`

Backend (single-process, no persistence):

- `server/src/app.ts`
- `server/src/index.ts`
- `server/src/routes/*`
- `server/src/domain/*`
- `server/src/store/run-store.ts`
