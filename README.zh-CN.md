# UXAgent 本地开发说明

本项目是 `Kimi_Agent_可用性测试流程` 的本地可迭代版本，技术栈为 Vite + React + TypeScript。
当前支持 `mock` 与 `api` 两种 Provider（默认 `api`）。

## 环境要求

- `nvm`
- Node.js `22`（见 `.nvmrc`）
- npm

## 安装依赖

```bash
cd /Users/hongwifi/Documents/写论文cod
source "$HOME/.nvm/nvm.sh"
nvm use 22
npm ci
```

## 本地启动

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## 启动后端（本地 API）

终端 1：

```bash
npm run server:dev
```

终端 2：

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## 构建与预览

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
npm run server:build
```

## 质量校验

```bash
npm run typecheck
npm run lint
npm run test:smoke
npm run check
```

## 当前流程说明

主流程保持不变：

`init -> analysis -> task-selection -> execution -> report`

`task-selection` 阶段：

- 必须选择 `3-10` 个任务。
- 右侧为“类别 + 人数”配置，不再选择具体个人 ID。

后台行为：

- 根据类别人数生成“同类异质”个体。
- 差异度由后台按人数驱动，不在前台暴露控件。
- 执行组合使用固定预算抽样，默认上限 `40` 条样本。
- 生成当前 run 快照，供执行页与报告页追问使用。
- `/diagnosis` 支持真实 URL 分析（`EVALUATION_MODE=auto|real`）并启用严格任务门禁。
- 若任务未通过证据/质量校验，将仅返回诊断（`tasks=[]`）并阻断下一步。

`execution` 阶段：

- 默认“先汇总后展开”：任务汇总 -> 样本列表 -> 步骤时间线。
- 支持案例侧栏追问（绑定当前案例上下文）。

`report` 阶段：

- 保留总览、任务级指标、类别汇总、代表样例。
- 新增全局聊天追问（仅当前 run）。
- 任务行/类别行/样例卡支持一键带上下文追问。

## Evidence-first 问答策略

- 问答范围仅限当前 run 快照。
- 回答会标注 `evidence` 或 `inference`。
- 有证据时返回证据引用；无证据时返回兜底提示与相关案例建议。

## 大模型就绪检查

- 大模型是可选能力，可用于：
  - `/diagnosis` 阶段的可用性代码检查与任务优先级生成。
  - `inference`（推断）回答润色。
- 大模型不得生成或改写证据编号（`caseId/taskId/step`）。
- 基础检查：`GET /api/v1/llm/healthz`
- 外部连通性探测：`GET /api/v1/llm/healthz?probe=1`

## 环境变量

可复制 `.env.example` 为 `.env` 并按需调整：

- `VITE_UX_AGENT_PROVIDER=mock|api`
- `VITE_ENABLE_KIMI_INSPECT=true`
- `VITE_MAX_EXECUTION_CASES=40`
- `VITE_API_BASE_URL=http://localhost:8787`
- `VITE_DEFAULT_TARGET_URL=https://frbe2kpuvbfve.ok.kimi.link`
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
- `LLM_STAGE_RETRY_COUNT=2`
- `LLM_JSON_REPAIR_COUNT=1`
- `LLM_CHUNK_TOKEN_BUDGET=1600`
- `DIAGNOSIS_PIPELINE_MODE=llm-4stage`
- `SOURCE_COLLECT_SAME_ORIGIN_ONLY=true`
- `SOURCE_COLLECT_MAX_TOTAL_BYTES=2500000`
- `DIAGNOSIS_STRICT_TASKS=true`
- `DIAGNOSIS_TASK_BLACKLIST=购物车,结账,优惠券,下单,收货地址,SKU,订单,支付`

可选（覆盖提示词，填写文件绝对路径或相对项目根目录的路径）：

- `LLM_PROMPT_ENHANCE_PATH`
- `LLM_PROMPT_ANALYSIS_PATH`
- `LLM_PROMPT_TASK_REWRITE_PATH`
- `LLM_PROMPT_SUMMARY_PATH`
- `LLM_PROMPT_STAGE_CRAWL_PATH`
- `LLM_PROMPT_STAGE_STRUCTURE_PATH`
- `LLM_PROMPT_STAGE_RISK_PATH`
- `LLM_PROMPT_STAGE_TASKS_PATH`
- `LLM_PROMPT_REPAIR_PATH`

以上任一变量指向的文件若存在，其内容将覆盖对应默认提示词。

## 代码结构（可扩展点）

Provider 接口定义：

- `src/services/uxAgentProvider.ts`

默认 Mock Provider：

- `src/services/mockProvider.ts`
- `src/services/apiProvider.ts`

核心服务：

- `src/services/cohortGenerator.ts`
- `src/services/executionSampler.ts`

Mock 数据源：

- `src/data/mock/tasks.ts`
- `src/data/mock/agentCategories.ts`
- `src/data/mock/executionTemplates.ts`
- `src/data/mock/results.ts`

后端（单进程、无持久化）：

- `server/src/app.ts`
- `server/src/index.ts`
- `server/src/routes/*`
- `server/src/domain/*`
- `server/src/store/run-store.ts`
