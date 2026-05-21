# mathtrainer

A local, single-user mental-math trainer with an adaptive personal difficulty
model. Drill timed arithmetic, learn shortcuts, and track your progress — all
on your own machine, no accounts, no cloud.

See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for
implementation plans.

## Run

Build the frontend once — the app serves the SPA from `frontend/dist/`, which
is not checked in:

```
cd frontend && npm install && npm run build
```

Then start the app from the repo root:

```
uv run mathtrainer
```

Then open http://localhost:8000.

## Develop

- Backend tests: `uv run pytest`
- Frontend tests: `cd frontend && npm test`
- Frontend dev server (with API proxy): `cd frontend && npm run dev`
