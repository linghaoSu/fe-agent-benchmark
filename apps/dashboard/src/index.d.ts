/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Window {
  __POWERED_BY_QIANKUN__?: boolean;
  __INJECTED_PUBLIC_PATH_BY_QIANKUN__: string;
}

interface StoreMutation {
  type: string;
  payload: unknown;
}

type SubscribeHook = (
  mutation: StoreMutation,
  state: Record<string, unknown>
) => void;

interface SharedStore {
  subscribe(hook: SubscribeHook);
}

declare interface QiankunProps {
  container?: HTMLElement;
  routerBase?: string;
  basePath?: string;
  sharedStore?: SharedStore;
  onGlobalStateChange?: (arg0: (state: unknown, prev: unknown) => void) => void;
  setGlobalState?: (arg0: { [string]: unknown }) => void;
}
