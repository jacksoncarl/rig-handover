import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON, jobs sorted, owner null kept as null', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      night: string;
      rows: { job: string; owner: string | null }[];
      badLines: number;
    };
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(body.badLines).toBe(1);
    expect(body.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });

  it('404s with an error body for a night with no run log', async () => {
    const res = await createApp(config).request('/api/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for 2020-01-01' });
  });
});
