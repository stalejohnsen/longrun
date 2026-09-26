# First deployment (owner)

The database roles can only be created after the server exists, and migrations need those roles. The first deployment therefore runs in two passes. Prerequisite: `docs/runbooks/bootstrap.md` is done.

## 1. Deploy infrastructure only

GitHub → Actions → **Deploy** → Run workflow → branch `main`, mode **`infra-only`**.

Review the what-if output in the job log. Expect it to create:

- Log Analytics and Application Insights;
- the App Service plan, web app and `staging` slot, with auth settings and app settings;
- the PostgreSQL server, its Entra administrator (you), the `longrun` database and `app-outbound-*` firewall rules.

## 2. Create the database roles

Follow `docs/runbooks/database-bootstrap.md`. It ends by removing your temporary firewall rule.

## 3. Full deployment

GitHub → Actions → **Deploy** → Run workflow → branch `main`, mode **`full`**.

The job runs migrations, deploys to staging, waits for the new build, verifies staging (sign-in redirect and `/health` through built-in auth), swaps, and checks that production requires sign-in.

## 4. Confirm the open items from the secure baseline (PR B)

Record each outcome in `docs/learnings.md`. Fix ADR 0002 if anything differs.

| Item                                            | How to confirm                                                                                                                                                                          | Expected                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `WEBSITE_AUTH_ENABLED` value accepted           | The app starts. With an invalid value it would exit with `invalid configuration` in the log stream: `az webapp log tail -g rg-longrun -n <web-app>`                                     | Startup without a fatal log           |
| Principal claim names                           | Open `https://<web-app>.azurewebsites.net/` in a browser and sign in                                                                                                                    | The Longrun page, not `Unauthorized`  |
| `allowedApplications` with browser sign-in      | Same as above                                                                                                                                                                           | No 403 from App Service after sign-in |
| Health-ping headers                             | `az monitor metrics list --resource $(az webapp show -g rg-longrun -n <web-app> --query id -o tsv) --metric HealthCheckStatus --interval PT5M -o table` about 15 minutes after the swap | Values of 100 (healthy)               |
| Temporary firewall rules removed (spec 0002 D6) | `az postgres flexible-server firewall-rule list -g rg-longrun -n <server> --query "[].name" -o tsv`                                                                                     | Only `app-outbound-*`                 |
| No secrets (spec 0002 D9)                       | `gh secret list` and `gh secret list --env production`                                                                                                                                  | Empty                                 |

If sign-in shows `Unauthorized` (401 from the app), App Service authenticated you but the app could not read your object ID. Check the claim names in `/.auth/me` in the browser and adjust `src/lib/auth/principal.ts` with a test.
