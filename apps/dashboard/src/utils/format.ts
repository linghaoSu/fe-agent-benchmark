import dayjs from 'dayjs';
import type { ResultExtensions, RunDetail } from '@/api/types';

export const DASH = '—';

export function formatScore(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : DASH;
}

export function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : DASH;
}

export function formatInt(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : DASH;
}

export function formatSeconds(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}s` : DASH;
}

export function formatCost(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(4)}` : DASH;
}

export function formatTokens(input: number | null | undefined, output: number | null | undefined): string {
  if (input == null && output == null) return DASH;

  return `${formatInt(input)} / ${formatInt(output)}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = dayjs(value);

  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

export function formatBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function truncate(text: string | null | undefined, max = 120): string {
  if (!text) return '';

  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function shortId(id: string | null | undefined, length = 8): string {
  return id ? id.slice(0, length) : DASH;
}

export function safeParseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function prettyJson(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') {
    const parsed = safeParseJson<unknown>(value, undefined);

    return parsed === undefined ? value : JSON.stringify(parsed, null, 2);
  }

  return JSON.stringify(value, null, 2);
}

export function compactJson(value: unknown): string {
  if (value === undefined) return '';

  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function resultJsonOf(detail: Pick<RunDetail, 'result'> | null | undefined): string | undefined {
  return detail?.result?.resultJson ?? detail?.result?.result_json;
}

export function extensionsOf(resultJson: string | undefined): ResultExtensions {
  const parsed = safeParseJson<{ extensions?: ResultExtensions }>(resultJson, {});

  return parsed.extensions ?? {};
}

/** The first gate whose value is not `passed`, if any. */
export function failedGate(extensions: ResultExtensions): string | undefined {
  return Object.entries(extensions.gates ?? {}).find(([, state]) => state !== 'passed')?.[0];
}

export type TagTone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export function statusTone(status: string | null | undefined): TagTone {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'succeeded':
    case 'passed':
      return 'success';
    case 'failed':
    case 'error':
      return 'error';
    case 'skipped':
    case 'pending':
    case 'running':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function outcomeTone(code: string | null | undefined): TagTone {
  if (!code) return 'neutral';
  if (/SUCCE|OK|PASS/i.test(code)) return 'success';
  if (/FAIL|ERR|DENIED|REJECT/i.test(code)) return 'error';
  if (/TRUNC|WARN|TIMEOUT/i.test(code)) return 'warning';

  return 'info';
}
