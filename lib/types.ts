export type LineKind = "add" | "del" | "context";

export type FileStatus = "added" | "removed" | "modified" | "renamed";

export interface DiffLine {
  type: LineKind;
  text: string;
  oldNo?: number;
  newNo?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffFile {
  filename: string;
  previousFilename?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  language: string;
  hunks: DiffHunk[];
}

export interface ReelTotals {
  files: number;
  additions: number;
  deletions: number;
}

export type ReelSource = "demo" | "github" | "paste";

export interface DiffReel {
  id: string;
  title: string;
  /** Small label on the title card, e.g. CURATED HIGHLIGHT. */
  kicker: string;
  repo: string;
  base: string;
  head: string;
  message: string;
  author: string;
  date: string;
  source: ReelSource;
  sourceUrl?: string;
  /** True when GitHub returned more than the reel keeps. */
  truncated?: boolean;
  /** Full compare totals when `files` is a window of a larger diff. */
  totals?: ReelTotals;
  files: DiffFile[];
}
