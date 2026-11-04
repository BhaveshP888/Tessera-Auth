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
import { TesseraDatabase } from './db/sqlite.js';
import { registerAuthRoutes } from './auth/routes.js';
import { verifyAccessToken } from './auth/jwt.js';

export interface BuildServerOptions {
  db?: TesseraDatabase;
}

export const buildServer = async (options: BuildServerOptions = {}) => {
  const db = options.db || new TesseraDatabase();
  const app = Fastify({
    logger: false,
  });


  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const configuredOrigin = process.env['CORS_ORIGIN'];
      if (configuredOrigin) {
        const allowed = configuredOrigin.split(',').map((o) => o.trim().toLowerCase());
        if (allowed.includes(origin.toLowerCase())) return cb(null, true);
      }
      const lower = origin.toLowerCase();
      if (
        lower.startsWith('http://localhost:') ||
        lower.startsWith('https://localhost:') ||
        lower.startsWith('http://127.0.0.1:') ||
        lower.startsWith('https://127.0.0.1:') ||
        lower.startsWith('chrome-extension://') ||
        lower.startsWith('moz-extension://')
      ) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS policy'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
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

  // Register Auth Routes
  registerAuthRoutes(app, db);

  // Principal authentication helper for sync endpoints
  const getAuthenticatedPrincipal = (authHeader: string | undefined): { userId: string } | 'RELAY_API_KEY' | null => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.slice(7).trim();
    const relayApiKey = process.env['RELAY_API_KEY'];
    if (relayApiKey && token === relayApiKey) {
      return 'RELAY_API_KEY';
    }
    const payload = verifyAccessToken(token);
    if (payload) {
      return { userId: payload.sub };
    }
    return null;
  };

  // Sync Relay: Push encrypted deltas (authentication required)
  app.post('/api/sync/push', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const principal = getAuthenticatedPrincipal(authHeader);
    if (!principal) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const parsed = SyncPushRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    const { deltas } = parsed.data;

    if (principal === 'RELAY_API_KEY') {
      const result = relayStore.appendDeltas(deltas);
      return result;
    }

    const result = db.appendUserDeltas(principal.userId, deltas);
    return result;
  });

  // Sync Relay: Pull encrypted deltas by cursor (authentication required)
  app.post('/api/sync/pull', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const principal = getAuthenticatedPrincipal(authHeader);
    if (!principal) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const parsed = SyncPullRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    const { sinceCursor, limit } = parsed.data;

    if (principal === 'RELAY_API_KEY') {
      const result = relayStore.getDeltasSince(sinceCursor, limit);
      return result;
    }

    const result = db.getUserDeltasSince(principal.userId, sinceCursor, limit);
    return result;
  });

  // Device Registry (authentication required)
  app.post('/api/devices/register', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const principal = getAuthenticatedPrincipal(authHeader);
    if (!principal) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const parsed = RegisteredDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    if (principal === 'RELAY_API_KEY') {
      relayStore.registerDevice(parsed.data);
      return { success: true };
    }

    db.upsertDevice({
      id: parsed.data.id,
      userId: principal.userId,
      name: parsed.data.name,
      publicKeyHex: parsed.data.publicKey,
    });
    return { success: true };
  });

  app.get('/api/devices', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const principal = getAuthenticatedPrincipal(authHeader);
    if (!principal) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (principal === 'RELAY_API_KEY') {
      return { devices: relayStore.listDevices() };
    }

    return { devices: db.listDevicesForUser(principal.userId) };
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
