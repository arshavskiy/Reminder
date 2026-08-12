# Repository Guidelines

## Project Structure & Module Organization

This repository is split into a Vue client and a TypeScript Node server. Client code lives in `client/src`: reusable UI in `components/`, pages in `views/`, Pinia stores in `stores/`, API wrappers in `services/`, shared types in `shared/`, and assets/styles in `assets/` and `styles/`. Server code lives in `server/src`: routes in `routes/`, auth in `auth/`, database code in `db/`, document processing in `pipeline/`, and tests in `__tests__`. Deployment notes and scripts are in `DEPLOYMENT.md`, `deploy/`, and `scripts/`. Avoid editing generated output such as `client/dist/` or dependency folders.

## Build, Test, and Development Commands

Run commands from the relevant package directory:

```powershell
cd client; npm install; npm run dev
cd client; npm run build
cd server; npm install; npm run dev
cd server; npm run build
cd server; npm test
```

`client npm run dev` starts Vite on port `4173` and proxies API, auth, and WebSocket traffic to `127.0.0.1:3737`. `server npm run dev` runs `tsx watch src/index.ts`. `server npm run build` performs TypeScript checking with `tsc --noEmit`. The root `npm test` is a placeholder; use the server test command.

## Coding Style & Naming Conventions

Use TypeScript with ES modules and strict typing on the server. Existing code uses two-space indentation, double quotes, semicolons, and aliases such as `@shared/*`, `@server/*`, and client-side `@/*`. Name Vue components and pages in PascalCase, for example `ProfilePage.vue`. Name stores, services, routes, and utilities in lower camel case, for example `apiService.ts` and `renderEmail.ts`.

## Testing Guidelines

Backend tests use Vitest and live in `server/src/__tests__` with `*.test.ts` names, for example `profile.test.ts`. Add focused tests when changing auth, roles, email rendering, profile behavior, or data processing. Run `cd server; npm test` before submitting server changes. There is no configured client test runner, so validate client changes with `npm run build` and targeted browser checks.

## Commit & Pull Request Guidelines

Recent commits use short imperative summaries, sometimes with conventional prefixes such as `fix:`. Prefer `fix: explain regression` or `Implement concise feature name`; keep the subject specific and under about 72 characters. Pull requests should include a clear description, commands run, linked issue or task, screenshots for UI changes, and notes for environment or deployment changes.

## Security & Configuration Tips

Keep secrets in local `.env` files and update `server/.env.example` when adding required variables. Do not commit database files from `server/data/`, production credentials, uploaded documents, or generated build artifacts.
