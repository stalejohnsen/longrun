# Rollback (owner)

After a swap, the `staging` slot holds the previous production version (spec 0002 D11). Rolling back is the same swap again. Migrations are expand/contract (ADR 0004), so the previous version still works with the current database schema.

## Swap back

```sh
WEB_APP=$(az webapp list -g rg-longrun --query "[0].name" -o tsv)
az webapp deployment slot swap -g rg-longrun -n "$WEB_APP" --slot staging --target-slot production
```

Then check that production requires sign-in (the same check the deploy workflow runs), and open it in a browser:

```sh
bash scripts/ci/check-signin-required.sh "$WEB_APP.azurewebsites.net" "$(az account show --query tenantId -o tsv)"
```

## Afterwards

- The broken version is now in `staging`. The next `Deploy` run replaces it.
- Fix forward with a new PR. Do not revert migrations that already ran. Write a new, compatible migration instead (`CLAUDE.md`: never edit an applied migration).
- If the swap itself failed, App Service reverts it if an instance fails to restart ([staging slots](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots)). Check the activity log: `az monitor activity-log list -g rg-longrun --offset 1h -o table`.
