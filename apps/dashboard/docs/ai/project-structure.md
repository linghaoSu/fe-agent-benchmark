# Project Structure

This project was generated from DAO Style Template. The `base` template provides a DCE5 qiankun sub-application runtime, and other template layers may add lint or CI files on top of it.

## Runtime Layout

- `src/main.ts`: creates the app, installs plugins, and exposes qiankun lifecycle hooks.
- `src/plugins/`: app-wide install and teardown logic for router, pinia, i18n, dayjs, qiankun, and DAO Style.
- `src/router/index.ts`: route definitions, history creation, and router teardown.
- `src/views/`: route-level pages and screen components.
- `src/locales/{zh-CN,en-US}/`: translation resources. Keep keys aligned across locales.
- `src/assets/styles/`: shared style entry files such as Tailwind setup.
- `src/types/` and `src/index.d.ts`: project-level type declarations.
- `public/`: static assets copied directly into the build output.
- `tests/unit/`: Vitest unit tests.
- `rsbuild.config.ts`: alias, dev server, proxy, auto-import, i18n loader, and build output configuration.

## Change Guidance

- App-wide initialization belongs in `src/plugins/*` or `src/main.ts`, not inside page components.
- Route changes should go through `src/router/index.ts`; preserve qiankun base-path handling.
- Build and environment behavior should be changed in `rsbuild.config.ts` instead of ad-hoc runtime code.
- Shared utilities should stay close to their first consumer and only be extracted when reuse is clear.
- Avoid editing generated files such as `src/auto-imports.d.ts` or `.eslintrc-auto-import.json`.

## Sub-Application Contract

- `src/main.ts` owns standalone rendering and qiankun `bootstrap`, `mount`, and `unmount`; keep host container mounting and teardown behavior intact.
- Host integration can provide global store registration, async language loading, and an optional `registerErrorHandlers` prop. Do not remove those props when changing startup code.
- `src/router/index.ts` derives history base from qiankun props or `VUE_APP_ROUTER_BASE_PATH`; preserve this when adding routes.
- `rsbuild.config.ts` exposes the app as a UMD sub-application bundle and uses `VUE_APP_PUBLIC_BASE_PATH` for public assets.
- When a generated product project adds a protobuf SDK such as `@daocloud-proto/<service>`, check generated client types before changing API request or response shapes.

## Verification Checklist

- Logic changes: `pnpm test:unit`.
- Build or configuration changes: `pnpm build`.
- CI-style non-interactive test runs: `pnpm test:unit:ci`.
- If the lint template is present: `pnpm lint`, plus narrower lint commands when needed.
