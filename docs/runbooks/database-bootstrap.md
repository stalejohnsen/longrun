# Database bootstrap (owner only)

Creates the database login roles for the three managed identities and applies the least-privilege grants (ADR 0004, ADR 0007). Run this **once**, after the first successful infrastructure deployment (`infra/main`) and **before** the first migration.

**Who:** the owner, who is the PostgreSQL Entra administrator (`postgresAdminObjectId` in `infra/main`).

## Prerequisites

- `psql` (PostgreSQL 17 client), or Azure Cloud Shell, which has it.
- Azure CLI, signed in as the owner (`az login`).

## 1. Allow your IP address temporarily

The server only accepts the web app's outbound addresses (ADR 0007). Add a temporary rule for your own address. This is the owner-side counterpart of the CI migration rule, and the same exception applies: it is **always removed** in step 5.

```sh
SERVER=$(az postgres flexible-server list -g rg-longrun --query "[0].name" -o tsv)
MYIP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g rg-longrun --server-name "$SERVER" \
  --name owner-bootstrap --start-ip-address "$MYIP" --end-ip-address "$MYIP"
```

## 2. Connect as Entra administrator

```sh
export PGHOST="$SERVER.postgres.database.azure.com"
export PGUSER="$(az ad signed-in-user show --query userPrincipalName -o tsv)"
export PGPASSWORD="$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)"
export PGSSLMODE=require
```

The token is valid for 5–60 minutes. Get a new one if the connection is refused.

## 3. Create the login roles (database `postgres`)

Look up the principal (object) IDs of the identities:

```sh
PIPELINE=$(az identity show -g rg-longrun -n id-longrun-pipeline --query principalId -o tsv)
PROD=$(az identity show -g rg-longrun -n id-longrun-app-prod --query principalId -o tsv)
STAGING=$(az identity show -g rg-longrun -n id-longrun-app-staging --query principalId -o tsv)
```

Create the roles. None is an admin, and MFA is not applicable to managed identities:

```sh
psql -d postgres -v ON_ERROR_STOP=1 <<SQL
select * from pgaadauth_create_principal_with_oid('longrun_migrator', '$PIPELINE', 'service', false, false);
select * from pgaadauth_create_principal_with_oid('longrun_app_production', '$PROD', 'service', false, false);
select * from pgaadauth_create_principal_with_oid('longrun_app_staging', '$STAGING', 'service', false, false);
SQL
```

Reference: [Manage Microsoft Entra roles](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users).

## 4. Apply the grants (database `longrun`)

```sh
psql -d longrun -v ON_ERROR_STOP=1 -f infra/database/grants.sql
```

Check the result:

```sh
psql -d postgres -c "select rolname, principaltype, isadmin from pgaadauth_list_principals(false);"
```

Expect `longrun_migrator`, `longrun_app_production` and `longrun_app_staging` as `service`, not admin, plus you as admin.

## 5. Remove your firewall rule (always)

```sh
az postgres flexible-server firewall-rule delete -g rg-longrun --server-name "$SERVER" --name owner-bootstrap --yes
```

Confirm that only `app-outbound-*` rules remain:

```sh
az postgres flexible-server firewall-rule list -g rg-longrun --server-name "$SERVER" --query "[].name" -o tsv
```
