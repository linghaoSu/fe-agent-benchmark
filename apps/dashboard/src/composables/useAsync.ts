import type { Ref } from 'vue';

export interface AsyncState<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  run: () => Promise<void>;
}

/** Minimal async loader: tracks loading/error, ignores stale responses. */
export function useAsync<T>(loader: () => Promise<T>, immediate = true): AsyncState<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<string | null>(null);
  let ticket = 0;

  const run = async () => {
    ticket += 1;
    const current = ticket;

    loading.value = true;
    error.value = null;
    try {
      const result = await loader();

      if (current === ticket) data.value = result;
    } catch (e) {
      if (current === ticket) error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (current === ticket) loading.value = false;
    }
  };

  if (immediate) run();

  return {
    data,
    loading,
    error,
    run,
  };
}
