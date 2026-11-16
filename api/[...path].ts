import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server/src/app.js';
import { TesseraDatabase } from '../server/src/db/sqlite.js';

let appPromise: Promise<FastifyInstance> | null = null;

async function getFastifyApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const db = new TesseraDatabase();
      const app = await buildServer({ db });
      await app.ready();
      return app;
    })().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const originalUrl = req.url || '';
    const matchedPath =
      (req.headers['x-matched-path'] as string | undefined) ||
      (req.headers['x-forwarded-uri'] as string | undefined);

    if (matchedPath && matchedPath.startsWith('/api')) {
      const queryIndex = originalUrl.indexOf('?');
      const query = queryIndex !== -1 ? originalUrl.slice(queryIndex) : '';
      req.url = matchedPath + query;
    }

    const app = await getFastifyApp();
    app.server.emit('request', req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[Vercel Serverless Error]:', message, stack);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message, stack }));
  }
}
