import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

export async function registerCors(app: FastifyInstance, origin: string): Promise<void> {
  await app.register(cors, {
    origin,
    methods: ['GET', 'POST', 'OPTIONS'],
  });
}
