import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };
const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

// The <tr> that mentions `job`.
const rowOf = (html: string, job: string) => html.split('<tr').find((r) => r.includes(job)) ?? '';

describe('digest page', () => {
  it('renders every job of 2026-10-28, sorted, with the lane banner', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('no marker set');
    const at = jobs.map((j) => html.indexOf(j));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('renders missing owner as an em dash', async () => {
    const html = await (await createApp(config).request('/digest/2026-10-28')).text();
    expect(rowOf(html, 'digest/render')).toContain('—');
  });

  it('marks 3+ retries and fails, and nothing else', async () => {
    const html = await (await createApp(config).request('/digest/2026-10-28')).text();
    expect(rowOf(html, 'fixtures/refresh')).toContain('warn');
    expect(rowOf(html, 'notes/backup')).toContain('warn');
    expect(rowOf(html, 'lane/sync')).not.toContain('warn');
    expect(rowOf(html, 'rig/rotate-logs')).not.toContain('warn');
  });

  it('says how many lines could not be read', async () => {
    const html = await (await createApp(config).request('/digest/2026-10-28')).text();
    expect(html).toContain('1 line could not be read');
  });

  it('keeps the offset in times', async () => {
    const html = await (await createApp(config).request('/digest/2026-10-28')).text();
    expect(html).toContain('2026-10-29T01:30:00+01:00');
  });

  it('404s a night with no file, still as a page', async () => {
    const res = await createApp(config).request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for 2026-01-01');
    expect(html).toContain('no marker set');
  });
});
