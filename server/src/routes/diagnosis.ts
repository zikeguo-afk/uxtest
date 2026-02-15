import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { mockDiagnosis } from '../data/diagnosis';
import { buildLiveDiagnosis, inspectLiveUrl } from '../domain/live-url-evaluator';
import { ApiError } from '../types/api-error';
import { parseOrThrow } from './_utils';

interface DiagnosisRouteOptions {
  evaluationMode: 'mock' | 'real' | 'auto';
  evaluatorTimeoutMs: number;
  evaluatorAllowInsecureTls: boolean;
}

const diagnosisSchema = z.object({
  targetUrl: z.string().min(1),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '未知错误';
}

export const diagnosisRoutes: FastifyPluginAsync<DiagnosisRouteOptions> = async (app, options) => {
  app.post('/diagnosis', async (request) => {
    const { targetUrl } = parseOrThrow(diagnosisSchema, request.body);

    if (options.evaluationMode === 'mock') {
      return {
        items: mockDiagnosis,
        source: 'mock',
      };
    }

    try {
      const analysis = await inspectLiveUrl(
        targetUrl,
        options.evaluatorTimeoutMs,
        options.evaluatorAllowInsecureTls,
      );
      return {
        items: buildLiveDiagnosis(analysis),
        source: 'real',
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      if (options.evaluationMode === 'real') {
        throw new ApiError(
          'INTERNAL_ERROR',
          `实时诊断失败：${errorMessage}`,
          502,
          { targetUrl },
        );
      }

      return {
        items: [
          ...mockDiagnosis,
          {
            dimension: '实时诊断状态',
            status: 'warning',
            description: `实时抓取失败（${errorMessage}），已自动回退为 mock 诊断结果。`,
          },
        ],
        source: 'mock-fallback',
      };
    }
  });
};
