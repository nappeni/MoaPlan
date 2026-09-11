import { setImageProcessor } from './images.js';
import { optimize } from './images-node.js';
setImageProcessor(optimize);
import express from 'express';
import path from 'node:path';
import { createApp } from './app.js';
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 5173);
const appUrl = (process.env.APP_URL || 'http://localhost:' + port).replace(/\/$/, '');
const { app, store, work } = await createApp({ production, appUrl });
const interval = setInterval(work, 10000);
interval.unref();
if (production) {
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(port, production ? '0.0.0.0' : '127.0.0.1', () =>
  console.log('MoaPlan: ' + appUrl),
);
process.on('SIGTERM', () => {
  clearInterval(interval);
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
});
