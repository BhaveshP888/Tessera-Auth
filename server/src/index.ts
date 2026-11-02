import { buildServer } from './app.js';

const PORT = parseInt(process.env['PORT'] || '8787', 10);
const HOST = process.env['HOST'] || '0.0.0.0';

const start = async () => {
  try {
    const app = await buildServer();
    await app.listen({ port: PORT, host: HOST });
    console.info(`Tessera Sync Relay server listening at http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

if (import.meta.main || process.argv[1]?.endsWith('src/index.ts')) {
  void start();
}
