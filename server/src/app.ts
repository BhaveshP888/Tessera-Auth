import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import {
  RegisteredDeviceSchema,
  SyncPullRequestSchema,
  SyncPushRequestSchema,
} from '@tessera/schemas';
import {
  getAuthenticationOptions,
  getRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from './auth/passkeys.js';
import { urlMetadataResolver } from './proxy/reader.js';
import { extensionRegistry } from './registry/extensions.js';
import { relayStore } from './relay/store.js';

export const buildServer = async () => {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', '*'],
    credentials: true,
  });
  await app.register(sensible);

  // Serve static web bundle if present (for single-container deployment)
  const candidatePaths = [
    process.env['WEB_DIST_PATH'],
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../apps/web/dist'),
    path.resolve(process.cwd(), 'web-dist'),
  ].filter(Boolean) as string[];

  const staticRoot = candidatePaths.find((p) => fs.existsSync(p));

  if (staticRoot) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
      wildcard: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html') || filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (filePath.includes('/assets/') || filePath.includes('\\assets\\')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });

    app.setNotFoundHandler((request, reply) => {
      const rawUrl = request.raw.url || '';
      if (rawUrl.startsWith('/api')) {
        return reply.status(404).send({ error: 'Endpoint not found' });
      }
      // Never return index.html for missing scripts/stylesheets/assets
      if (rawUrl.startsWith('/assets') || /\.(js|css|map|png|jpg|jpeg|svg|ico|woff2?|json)$/i.test(rawUrl)) {
        return reply.status(404).send({ error: 'Asset not found' });
      }

      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return reply.sendFile('index.html');
    });
  }

  // Health check
  app.get('/api/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  // Sync Relay: Push encrypted deltas
  app.post('/api/sync/push', async (request, reply) => {
    const parsed = SyncPushRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    const { deltas } = parsed.data;
    const result = relayStore.appendDeltas(deltas);
    return result;
  });

  // Sync Relay: Pull encrypted deltas by cursor
  app.post('/api/sync/pull', async (request, reply) => {
    const parsed = SyncPullRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    const { sinceCursor, limit } = parsed.data;
    const result = relayStore.getDeltasSince(sinceCursor, limit);
    return result;
  });

  // Device Registry
  app.post('/api/devices/register', async (request, reply) => {
    const parsed = RegisteredDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    relayStore.registerDevice(parsed.data);
    return { success: true };
  });

  app.get('/api/devices', async () => {
    return { devices: relayStore.listDevices() };
  });

  // Privacy Reader Proxy: Metadata & OG scraper (supports GET & POST)
  const handleMetadataProxy = async (rawTargetUrl: string | undefined, reply: any) => {
    if (!rawTargetUrl || !rawTargetUrl.trim()) {
      return reply.badRequest('Parameter "url" is required');
    }

    const { data, error } = await urlMetadataResolver.resolve(rawTargetUrl);
    if (error || !data) {
      return reply.badRequest(error || 'Failed to fetch metadata');
    }

    return { data, metadata: data };
  };

  app.get('/api/proxy/metadata', async (request, reply) => {
    const query = request.query as { url?: string };
    return handleMetadataProxy(query.url, reply);
  });

  app.post('/api/proxy/metadata', async (request, reply) => {
    const body = (request.body || {}) as { url?: string };
    return handleMetadataProxy(body.url, reply);
  });

  // Extension Registry
  app.get('/api/registry/extensions', async () => {
    return { extensions: extensionRegistry.listExtensions() };
  });

  // Passkey / WebAuthn Endpoints
  app.post('/api/auth/register-options', async (request, reply) => {
    const body = request.body as { userId: string; username: string };
    if (!body.userId || !body.username) {
      return reply.badRequest('userId and username are required');
    }
    const options = await getRegistrationOptions(body.userId, body.username);
    return options;
  });

  app.post('/api/auth/verify-registration', async (request, reply) => {
    const body = request.body as { userId: string; response: unknown };
    const result = await verifyRegistration(body.userId, body.response);
    return result;
  });

  app.post('/api/auth/auth-options', async (request, reply) => {
    const body = request.body as { userId: string };
    try {
      const options = await getAuthenticationOptions(body.userId);
      return options;
    } catch (err) {
      return reply.badRequest((err as Error).message);
    }
  });

  app.post('/api/auth/verify-authentication', async (request, reply) => {
    const body = request.body as { userId: string; response: unknown };
    const result = await verifyAuthentication(body.userId, body.response);
    return result;
  });

  return app;
};
