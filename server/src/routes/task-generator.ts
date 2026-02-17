import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { load } from 'cheerio';
import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import { inspectLiveUrl } from '../domain/live-url-evaluator';
import { generateTasksWithLLM } from '../llm/task-generator';
import { ApiError } from '../types/api-error';

interface NodeFetchInit extends RequestInit {
  dispatcher?: Dispatcher;
}

const generateTasksSchema = z.object({
  targetUrl: z.string().min(1),
});

export const taskGeneratorRoutes: FastifyPluginAsync<{
  evaluatorTimeoutMs: number;
  evaluatorAllowInsecureTls: boolean;
}> = async (app, options) => {
  
  app.post('/generate-tasks', async (request, reply) => {
    const body = generateTasksSchema.parse(request.body);
    const { targetUrl } = body;

    try {
      // 1. 抓取页面
      console.log(`[Task Generator] Fetching: ${targetUrl}`);
      const analysis = await inspectLiveUrl(
        targetUrl,
        options.evaluatorTimeoutMs,
        options.evaluatorAllowInsecureTls,
      );

      // 2. 获取完整 HTML（允许不安全 TLS）
      const insecureAgent = new Agent({
        connect: { rejectUnauthorized: false },
      });
      
      const fetchResponse = await fetch(analysis.normalizedUrl, {
        dispatcher: insecureAgent,
        headers: {
          'User-Agent': 'UXAgent/1.0 (task-generator)',
        },
      } as NodeFetchInit);
      
      const html = await fetchResponse.text();
      
      await insecureAgent.close();

      console.log(`[Task Generator] Page fetched: ${analysis.title}, HTML length: ${html.length}`);

      // 3. 使用 LLM 生成任务
      const tasks = await generateTasksWithLLM({
        url: analysis.finalUrl,
        title: analysis.title,
        html,
        analysis: {
          links: analysis.counts.links,
          buttons: analysis.counts.buttons,
          inputs: analysis.counts.inputs,
          forms: analysis.counts.forms,
          headings: analysis.counts.headings,
          images: analysis.counts.images,
          interactive: analysis.counts.interactive,
          hasViewportMeta: analysis.hasViewportMeta,
          hasMainLandmark: analysis.hasMainLandmark,
        },
      });

      console.log(`[Task Generator] Generated ${tasks.length} tasks`);

      return {
        success: true,
        source: 'llm',
        pageInfo: {
          url: analysis.finalUrl,
          title: analysis.title,
          analysis: {
            interactive: analysis.counts.interactive,
            forms: analysis.counts.forms,
            images: analysis.counts.images,
          },
        },
        tasks,
      };

    } catch (error) {
      console.error('[Task Generator] Error:', error);
      
      if (error instanceof z.ZodError) {
        throw new ApiError('VALIDATION_ERROR', '参数验证失败', 400);
      }
      
      throw new ApiError(
        'GENERATION_ERROR',
        `任务生成失败: ${error instanceof Error ? error.message : '未知错误'}`,
        500,
      );
    }
  });
};
