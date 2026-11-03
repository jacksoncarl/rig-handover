import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board links (plan § 2c)', () => {
  it('links every night on disk to its digest', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
  });

  it('shows ok / retry / fail counts beside each night', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('ok 10 · retry 4 · fail 1');
    expect(html).toContain('ok 7 · retry 0 · fail 0');
  });

  it('marks a night with failures as a warning', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toMatch(/class="warn"[^>]*>ok 10 · retry 4 · fail 1/);
  });
});
