# playwright-runtime

Host-only library mount for the hidden functional evaluator. The pinned
`mcr.microsoft.com/playwright` image ships browsers under `/ms-playwright` but
does not install the `playwright-core` library at a global path, so the exact
matching library version is vendored here and bind-mounted read-only into the
browser container at `/opt/playwright-runtime`.

- `node_modules/playwright-core` — `playwright-core@1.59.1` from the npm
  registry tarball, integrity
  `sha512-HBV/RJg81z5BiiZ9yPzIiClYV/QMsDCKUyogwH9p3MCP6IYjUFu/MActgYAvK0oWyV9NlwM3GLBjADyWgydVyg==`.

Never mount this into the Agent container.
