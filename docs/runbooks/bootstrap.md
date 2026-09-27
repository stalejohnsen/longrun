# Bootstrap (owner only)

Creates everything the pipeline cannot and must not create itself (ADR 0007):

- the resource group;
- the managed identities;
- the GitHub OIDC federated credential;
- the built-in-auth app registrations;
- the pipeline's single role assignment;
- the budget.

Run this once, and again only when `infra/bootstrap/` changes. It is idempotent.

**Who:** the subscription owner, signed in with an account that can create Entra app registrations.

## Prerequisites

- Azure CLI, a recent version. Run `az upgrade` or install the latest from Microsoft. Then run `az bicep install` or `az bicep upgrade`. Bicep must be **0.36.1 or newer** for the Microsoft Graph extension.
- Owner on subscription `<subscription-id>`.
- The GitHub CLI (`gh`), signed in as the repository owner.

Check the Bicep version:

```sh
az bicep version
```

## 1. Sign in and select the subscription

```sh
az login --tenant <tenant-id>
az account set --subscription <subscription-id>
```

## 2. Register resource providers (subscription level, once)

The pipeline only has `Contributor` on the resource group, so it cannot register providers.

```sh
for ns in Microsoft.Web Microsoft.DBforPostgreSQL Microsoft.Insights Microsoft.OperationalInsights Microsoft.ManagedIdentity Microsoft.Consumption Microsoft.Network Microsoft.AlertsManagement; do
  az provider register --namespace "$ns"
done
```

Registration takes a few minutes. Wait until every provider reports `Registered` before the first deploy:

```sh
for ns in Microsoft.Web Microsoft.DBforPostgreSQL Microsoft.Insights Microsoft.OperationalInsights Microsoft.ManagedIdentity Microsoft.Consumption Microsoft.Network Microsoft.AlertsManagement; do
  echo "$ns: $(az provider show --namespace "$ns" --query registrationState -o tsv)"
done
```

`Microsoft.Network` is needed for the virtual network, private endpoint and private DNS zone (ADR 0007). `Microsoft.AlertsManagement` is needed for Application Insights' smart detection alert rules.

## 3. Preview the changes

Use your own email for budget alerts. It is passed at deploy time and never stored in the repository.

```sh
az deployment sub what-if \
  --location swedencentral \
  --template-file infra/bootstrap/main.bicep \
  --parameters budgetContactEmails='["<your-email>"]'
```

Review the output. Expect:

- 1 resource group and 3 managed identities;
- 1 federated credential with subject `repo:stalejohnsen@98233333/longrun@1389214305:environment:production`;
- 2 app registrations, each with 1 federated credential, and 2 service principals;
- 1 role assignment (`Contributor` on `rg-longrun` for `id-longrun-pipeline`);
- 1 budget.

The what-if output may not list Microsoft Graph resources in detail.

## 4. Deploy

```sh
az deployment sub create \
  --name longrun-bootstrap \
  --location swedencentral \
  --template-file infra/bootstrap/main.bicep \
  --parameters budgetContactEmails='["<your-email>"]'
```

If the deployment fails with a replication error on a federated credential or service principal, wait a minute and run the same command again (Entra replication delay).

## 5. Configure the GitHub `production` environment

Read the outputs:

```sh
az deployment sub show --name longrun-bootstrap --query properties.outputs -o json
```

Create the environment with yourself as required reviewer (spec 0002 D4):

```sh
gh api -X PUT repos/stalejohnsen/longrun/environments/production --input - <<JSON
{
  "reviewers": [{ "type": "User", "id": $(gh api user -q .id) }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
gh api -X POST repos/stalejohnsen/longrun/environments/production/deployment-branch-policies -f name=main -f type=branch
```

Set the **non-secret** identifiers as environment variables. Use variables, not secrets (spec 0002 D9). The values are read straight from the deployment outputs, so there is nothing to copy by hand (a hand-copied value once lost a character and broke the staging token request). `POSTGRES_ADMIN_*` makes you the database's Entra administrator, for the database bootstrap only (ADR 0007):

```sh
output() {
  az deployment sub show --name longrun-bootstrap --query "properties.outputs.$1.value" -o tsv | tr -d '\r'
}
set_var() {
  [ -n "$2" ] || { echo "Empty value for $1; is the bootstrap deployment complete?"; return 1; }
  gh variable set "$1" --env production --body "$2"
}
set_var AZURE_TENANT_ID "$(output tenantId)"
set_var AZURE_SUBSCRIPTION_ID "$(output subscriptionId)"
set_var AZURE_CLIENT_ID "$(output pipelineClientId)"
set_var WEB_APP_NAME "$(output webAppName)"
set_var AUTH_CLIENT_ID_PRODUCTION "$(output productionAuthClientId)"
set_var AUTH_CLIENT_ID_STAGING "$(output stagingAuthClientId)"
set_var AUTH_AUDIENCE_STAGING "$(output stagingAuthAudience)"
set_var POSTGRES_ADMIN_OBJECT_ID "$(az ad signed-in-user show --query id -o tsv | tr -d '\r')"
set_var POSTGRES_ADMIN_NAME "$(az ad signed-in-user show --query userPrincipalName -o tsv | tr -d '\r')"
```

Check that every variable matches its output:

```sh
for pair in AZURE_TENANT_ID:tenantId AZURE_SUBSCRIPTION_ID:subscriptionId AZURE_CLIENT_ID:pipelineClientId \
  WEB_APP_NAME:webAppName AUTH_CLIENT_ID_PRODUCTION:productionAuthClientId \
  AUTH_CLIENT_ID_STAGING:stagingAuthClientId AUTH_AUDIENCE_STAGING:stagingAuthAudience; do
  name=${pair%%:*}; key=${pair#*:}
  [ "$(gh variable get "$name" --env production)" = "$(output "$key")" ] && echo "ok       $name" || echo "MISMATCH $name"
done
```

## 6. Verify

- Role assignments on the resource group: only `Contributor` for `id-longrun-pipeline`, plus your own inherited Owner (spec 0002 D10).

  ```sh
  az role assignment list --resource-group rg-longrun --query "[].{principal:principalName, role:roleDefinitionName}" -o table
  ```

- No GitHub secrets exist (spec 0002 D9):

  ```sh
  gh secret list --repo stalejohnsen/longrun
  gh secret list --repo stalejohnsen/longrun --env production
  ```

- The federated credential subject is exactly `repo:stalejohnsen@98233333/longrun@1389214305:environment:production`.

## Remove everything (if ever needed)

App registrations are Entra objects and are not deleted with the resource group:

```sh
az group delete --name rg-longrun
az rest --method delete --url "https://graph.microsoft.com/v1.0/applications(uniqueName='longrun-auth-production')"
az rest --method delete --url "https://graph.microsoft.com/v1.0/applications(uniqueName='longrun-auth-staging')"
```
