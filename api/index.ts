import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from './[...path].js';

export default async function (req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handler(req, res);
}
