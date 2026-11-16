import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server/src/app.js';
import { TesseraDatabase } from '../server/src/db/sqlite.js';

let appPromise: Promise<FastifyInstance> | null = null;

async function getFastifyApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    const db = new TesseraDatabase();
    appPromise = buildServer({ db }).then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getFastifyApp();
  app.server.emit('request', req, res);
}
