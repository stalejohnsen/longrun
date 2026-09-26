# Local development

## Prerequisites

- Node 24 (>= 24.15; see `.node-version`)
- Docker (for Postgres and Testcontainers)

## Configuration

The app validates its configuration at startup and refuses to start if anything is missing (ADR 0005). Locally, put settings in `.env.local`. Next.js loads it automatically, and `.env*` files are ignored by git and must never be committed.

| Setting                | Local value     | Notes                                                                  |
| ---------------------- | --------------- | ---------------------------------------------------------------------- |
| `DATABASE_HOST`        | `localhost`     |                                                                        |
| `DATABASE_PORT`        | `5432`          | Default 5432                                                           |
| `DATABASE_NAME`        | `longrun`       |                                                                        |
| `DATABASE_USER`        | `longrun`       |                                                                        |
| `DATABASE_PASSWORD`    | any local value | Local only; refused in Azure (ADR 0004)                                |
| `DATABASE_SSL`         | `disable`       | Must be `require` in Azure                                             |
| `LONGRUN_DEV_IDENTITY` | `true`          | Stand-in signed-in user for `npm run dev`; refused in Azure (ADR 0002) |

Without `LONGRUN_DEV_IDENTITY=true`, every request gets 401, because nothing injects the App Service identity header locally.

## Run

1. Start a local Postgres, for example:
   `docker run --rm -d --name longrun-db -e POSTGRES_USER=longrun -e POSTGRES_PASSWORD=<local value> -e POSTGRES_DB=longrun -p 5432:5432 postgres:17-alpine`
2. Apply migrations: `npm run db:migrate`. This reads the same settings from the environment; export them in your shell, because `.env.local` is only loaded by Next.js.
3. Start the app: `npm run dev`, then open <http://localhost:3000>.

## Tests

See the Commands section in `CLAUDE.md`. Integration and end-to-end tests start their own Postgres containers and need no configuration.
