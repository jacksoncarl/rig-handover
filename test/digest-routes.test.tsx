import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const baseConfig = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

// Synthetic nights go in a temp dir; runs/ is read-only.
const NORMAL = '2026-11-01';
const EMPTY = '2026-11-02';
const BAD = '2026-11-03';
const MISSING = '2026-11-04'; // no file on purpose

const line = (o: object) => JSON.stringify(o);
const at = (m: number) => `2026-11-01T01:${String(m).padStart(2, '0')}:00+01:00`;

// Written out of order on purpose: the routes must sort by job.
const normalLines = [
  line({ at: at(0), job: 'd/orphan', status: 'ok', owner: null }),
  line({ at: at(1), job: 'a/steady', status: 'ok', owner: 'rook' }),
  line({ at: at(2), job: 'c/broken', status: 'fail', owner: 'lane-07', error: 'quota exceeded' }),
  line({ at: at(3), job: 'b/flaky', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: at(4), job: 'b/flaky', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: at(5), job: 'b/flaky', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: at(6), job: 'b/flaky', status: 'ok', owner: 'rook' }),
];
const JOBS = ['a/steady', 'b/flaky', 'c/broken', 'd/orphan'];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), [normalLines[1], 'this is not json', normalLines[6]].join('\n') + '\n');
  app = createApp({ ...baseConfig, runsDir });
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

// The markup of the one table row that mentions `job`.
const rowOf = (html: string, job: string) => html.split('<tr').find((r) => r.includes(job)) ?? '';

describe('GET /digest/:night', () => {
  it('renders a night with the lane banner, every job, — for a null owner and warn on trouble', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    for (const job of JOBS) expect(html).toContain(job);
    expect(rowOf(html, 'd/orphan')).toContain('—');
    expect(rowOf(html, 'b/flaky')).toContain('class="warn"'); // 3 retries
    expect(rowOf(html, 'c/broken')).toContain('class="warn"'); // last status fail
    expect(rowOf(html, 'a/steady')).not.toContain('class="warn"');
    expect(html).not.toContain('could not be read');
  });

  it('answers 404 with a message for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain(`no run log for ${MISSING}`);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line, and says it could not be read', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/steady');
    expect(html).toContain('b/flaky');
    expect(html).toContain('could not be read');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the DigestNight exactly as readNight does, owner null kept', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    const body = (await res.json()) as ReturnType<typeof readNight>;
    expect(res.status).toBe(200);
    expect(body).toEqual(readNight(runsDir, NORMAL));
    expect(body?.rows.map((r) => r.job)).toEqual(JOBS);
    expect(body?.rows.find((r) => r.job === 'd/orphan')?.owner).toBeNull();
  });

  it('answers 404 with an error for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `no run log for ${MISSING}` });
  });

  it('returns no rows for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    const body = (await res.json()) as { rows: unknown[] };
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('counts the bad line and keeps the good ones', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/steady', 'b/flaky']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const json = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as { rows: { job: string }[] };
    const jobs = json.rows.map((r) => r.job);
    const inPageOrder = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(jobs).toEqual(JOBS);
    expect(inPageOrder).toEqual(jobs);
    for (const job of jobs) expect(html).toContain(job);
  });
});
