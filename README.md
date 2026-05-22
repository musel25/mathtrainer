# mathtrainer

A single-user mental-math trainer with an adaptive personal difficulty model.
Drill timed arithmetic, learn shortcuts, and track your progress. Run it
locally, or self-host it — see [Deployment](#deployment).

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

## Deployment

A live instance runs at **https://math.musel.dev** (password-protected).

The app ships with a containerized deploy — a multi-stage `Dockerfile` and
`compose.yaml`, fronted by nginx with HTTPS and a basic-auth gate. See
[`DEPLOY.md`](DEPLOY.md) for the full architecture and operations guide.
