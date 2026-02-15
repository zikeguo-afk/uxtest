# UXAgent Local Workspace

This repository is a local, editable version of the `Kimi_Agent_可用性测试流程` frontend.
It runs as a Vite + React + TypeScript app and supports both `mock` and `api` providers.

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
- `/diagnosis` supports real URL analysis (`EVALUATION_MODE=auto|real`) with automatic mock fallback in `auto`.

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

- LLM is optional and only used to polish `inference` answers.
- LLM must not create or alter evidence IDs (`caseId/taskId/step`).
- Check status: `GET /api/v1/llm/healthz`
- Deep probe external API: `GET /api/v1/llm/healthz?probe=1`

## Environment Variables

Copy `.env.example` to `.env` if needed:

- `VITE_UX_AGENT_PROVIDER=mock|api`
- `VITE_ENABLE_KIMI_INSPECT=true`
- `VITE_MAX_EXECUTION_CASES=40`
- `VITE_API_BASE_URL=http://localhost:8787`
- `API_PORT=8787`
- `RUN_TTL_MS=7200000`
- `RUN_CACHE_SIZE=200`
- `RUN_CLEANUP_INTERVAL_MS=600000`
- `EVALUATION_MODE=auto`
- `EVALUATOR_TIMEOUT_MS=30000`
- `EVALUATOR_ALLOW_INSECURE_TLS=true`
- `LLM_PROVIDER=mock|openai-compatible`
- `LLM_API_BASE_URL=https://api.openai.com/v1`
- `LLM_API_KEY=...`
- `LLM_MODEL=gpt-4o-mini`
- `LLM_TIMEOUT_MS=20000`
- `LLM_TEMPERATURE=0.2`

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
