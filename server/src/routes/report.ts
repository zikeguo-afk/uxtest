import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { buildFinalReportBundle } from '../domain/final-report-bundle-builder';
import { buildReport } from '../domain/report-builder';
import { RunStore } from '../store/run-store';
import { ApiError } from '../types/api-error';
import { parseOrThrow } from './_utils';

interface ReportRouteOptions {
  runStore: RunStore;
}

const runIdSchema = z.object({
  runId: z.string().min(1),
});

export const reportRoutes: FastifyPluginAsync<ReportRouteOptions> = async (app, options) => {
  app.post('/runs/:runId/report', async (request) => {
    const params = parseOrThrow(runIdSchema, request.params);
    const snapshot = options.runStore.get(params.runId);

    if (!snapshot) {
      throw new ApiError('RUN_NOT_FOUND', `未找到 run: ${params.runId}`, 404);
    }

    if (snapshot.executions.length === 0) {
      throw new ApiError('EMPTY_EXECUTIONS', '当前 run 没有可生成报告的执行样本', 400);
    }

    const report = buildReport(snapshot);
    const finalReportBundle = buildFinalReportBundle({
      runSnapshot: snapshot,
      quantitativeMetrics: report.quantitativeMetrics,
      categorySummary: report.categorySummary,
      representativeSamples: report.representativeSamples,
    });

    return {
      ...report,
      finalReportBundle,
    };
  });
};
