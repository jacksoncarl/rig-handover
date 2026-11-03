import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// Synthetic nights go in a temp dir; runs/ is read-only.
function tempNight(night: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${night}.jsonl`), body);
  return dir;
}

const line = (o: object) => JSON.stringify(o);

describe('readNight on runs/', () => {
  it('reads 2026-10-28 into 5 jobs sorted by job, with 1 bad line', () => {
    const d = readNight('runs', '2026-10-28');
    expect(d?.night).toBe('2026-10-28');
    expect(d?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(d?.badLines).toBe(1);
    expect(d?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps retries, the last error and the log offsets for fixtures/refresh', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
    expect(row?.lastError).toBeNull();
  });

  it('reports a failed job with its error', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
  });

  it('reads 2026-10-27 with no bad lines', () => {
    expect(readNight('runs', '2026-10-27')?.badLines).toBe(0);
  });
});

describe('readNight edges', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../etc')).toBeNull();
    expect(readNight('runs', '2026-10-28/../2026-10-27')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    const dir = tempNight('2026-11-01', '');
    expect(readNight(dir, '2026-11-01')).toEqual({
      night: '2026-11-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('skips blank lines without counting them as bad', () => {
    const ok = line({ at: '2026-11-01T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' });
    const dir = tempNight('2026-11-01', `\n${ok}\n   \n\n`);
    const d = readNight(dir, '2026-11-01');
    expect(d?.badLines).toBe(0);
    expect(d?.rows).toHaveLength(1);
  });

  it('counts JSON that is not a valid log line as bad', () => {
    const body = [
      line({ at: '2026-11-01T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' }),
      line({ at: '2026-11-01T01:01:00+01:00', job: 'a', status: 'done', owner: 'rook' }),
      line({ at: '2026-11-01T01:02:00+01:00', status: 'ok', owner: 'rook' }),
      line({ job: 'a', status: 'ok', owner: 'rook' }),
      line({ at: '2026-11-01T01:03:00+01:00', job: 'a', status: 'ok', owner: 7 }),
      '[1,2]',
      'null',
    ].join('\n');
    const d = readNight(tempNight('2026-11-01', body), '2026-11-01');
    expect(d?.badLines).toBe(6);
    expect(d?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(d?.rows[0]?.runs).toBe(1);
  });

  it('takes the owner from the job\'s last line', () => {
    const body = [
      line({ at: '2026-11-01T01:00:00+01:00', job: 'a', status: 'retry', owner: 'rook', error: 'x' }),
      line({ at: '2026-11-01T01:05:00+01:00', job: 'a', status: 'ok', owner: null }),
    ].join('\n');
    const row = readNight(tempNight('2026-11-01', body), '2026-11-01')?.rows[0];
    expect(row?.owner).toBeNull();
    expect(row?.lastError).toBe('x');
  });
});
