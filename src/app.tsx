import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage, NoDigest } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  // Same readNight as the page: same rows, same order (ADR 0001).
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const result = readNight(config.runsDir, night);
    return result ? c.json(result) : c.json({ error: `no run log for ${night}` }, 404);
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (!digest) {
      return c.html(
        <Layout title="digest" lane={lane()}>
          <NoDigest night={night} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title="digest" lane={lane()}>
        <DigestPage digest={digest} />
      </Layout>,
    );
  });

  return app;
}
