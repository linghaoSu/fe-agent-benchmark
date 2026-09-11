# AI References

Use this file to record project-specific external references for AI assistants. Keep it short and practical.

## Access Strategy

Before using fallback instructions here, first check whether the current agent session already has a suitable access method, such as an authenticated connector, CLI, browser automation tool, or local docs mirror.

Prefer `llms.txt` when a docs site provides it. For DAO Style docs, try `<docs-root>/llms.txt` first, then fall back to the rendered docs site if the endpoint is not available yet.

## DAO Style Docs

- `@dao-style/core`: `http://172.30.120.100:30000/`
- `@dao-style/extend`: `http://172.30.120.100:30001/`
- `@dao-style/biz`: `http://172.30.120.100:30003/`

Use the docs for component APIs, examples, props, events, styling guidance, and package-specific behavior. Do not copy large docs into this repository; fetch only what the task needs.

## API, Prototype, And Design Access

- GitLab-hosted API docs, Swagger JSON, issues, or merge requests: prefer an authenticated GitLab connector or `glab api` over browser scraping.
- Modao prototypes: open the shared URL in a browser automation tool, dismiss login prompts if present, and read page annotations/comments.
- Sketch designs: use an authenticated browser context when the design requires login, and prefer specific artboard URLs over broad workspace links.

## What Belongs Here

- DAO Style package docs or other shared component-library references
- API docs or Swagger endpoints
- Prototype or design links
- Related repositories that are needed regularly
- Safe-to-commit environment notes or integration reminders

## Recommended Sections

### API

- Primary backend docs:
- Auth, mock data, or contract notes:

### Prototype / Design

- Figma, Sketch, Modao, or other design links:
- Notes about which pages or states are the source of truth:

### Related Repositories

- Backend repository:
- Shared component or SDK repository:

## Rules

- Do not store secrets, tokens, or private local environment values here.
- Prefer stable URLs and short notes over copying large external documents into the repo.
- Keep project-wide coding rules in `AGENTS.md` or `docs/ai/project-structure.md`; use this file for references only.
