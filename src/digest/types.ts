// Plan morning-digest § 1. The contract every digest part codes against; readNight itself is
// implemented in src/digest/read.ts (export `readNight`, issue #2).
export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl. `at` keeps the log's offset string, never converted to UTC.
export type LogLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

// One row per job. `null` is missing data; the view renders it as `—`.
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line
  runs: number; // log lines for this job, every status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` seen for this job, even if it later went ok
  firstAt: string;
  lastAt: string;
};

// Log lines by status, across the whole night (bad lines not included).
export type StatusCounts = Record<RunStatus, number>;

export type DigestNight = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; empty file -> [] ("nothing ran")
  counts: StatusCounts;
  badLines: number; // non-blank lines that aren't JSON or aren't a LogLine: counted, never thrown
};

// Sync, like the rest of rig's fs reads. null = no runs/<night>.jsonl, or `night` isn't
// YYYY-MM-DD: the route's 404.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
