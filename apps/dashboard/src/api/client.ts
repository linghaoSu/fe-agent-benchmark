import type {
  CompareResponse, RunDetail, RunSummary, TaskSummary,
} from './types';

export * from './types';

const BASE = '/api';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);

  if (!response.ok) {
    throw new ApiError(response.status, `${response.status} ${response.statusText}: ${path}`);
  }

  return response.json() as Promise<T>;
}

function query(params: object): string {
  const search = new URLSearchParams();

  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();

  return text ? `?${text}` : '';
}

export interface RunFilters {
  task?: string;
  model?: string;
  status?: string;
}

export const api = {
  listRuns: (filters: RunFilters = {}) => request<RunSummary[]>(`/runs${query(filters)}`),
  getRun: (runId: string) => request<RunDetail>(`/runs/${encodeURIComponent(runId)}`),
  listTasks: () => request<TaskSummary[]>('/tasks'),
  compare: (taskId: string, k: number, models: string[]) => {
    const search = new URLSearchParams({
      task: taskId,
      k: String(k),
    });

    models.forEach((model) => search.append('config', `${model}=${model}`));

    return request<CompareResponse>(`/compare?${search.toString()}`);
  },
  artifactUrl: (runId: string, relativePath: string, format?: 'png') => {
    const path = relativePath.split('/').map(encodeURIComponent).join('/');

    return `${BASE}/runs/${encodeURIComponent(runId)}/artifacts/${path}${format ? `?format=${format}` : ''}`;
  },
  screenshotUrl: (runId: string, viewport: 'desktop' | 'tablet' | 'mobile') => api.artifactUrl(runId, `screenshots/${viewport}.png.json`, 'png'),
  /** Returns null when the artifact does not exist (404). */
  getArtifactText: async (runId: string, relativePath: string): Promise<string | null> => {
    const response = await fetch(api.artifactUrl(runId, relativePath));

    if (response.status === 404) return null;
    if (!response.ok) throw new ApiError(response.status, `${response.status} ${response.statusText}: ${relativePath}`);

    return response.text();
  },
};
