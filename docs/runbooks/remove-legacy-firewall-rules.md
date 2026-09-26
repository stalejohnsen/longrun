# Remove legacy firewall rules (one-time, owner)

Before the ADR 0007 amendment (2026-09-26), `infra/main` allowed the web app's 31 possible outbound IP addresses through PostgreSQL firewall rules named `app-outbound-*`. The app now reaches the database through a private endpoint. Bicep deployments are incremental, so they don't delete these rules; remove them once.

**When:** after a `full` Deploy with the private endpoint has succeeded. That proves the app reaches the database privately: staging verification calls `/health`, which queries the database.

**Time:** each deletion is a server configuration change of about one minute, so about 30 minutes in total. The app keeps working throughout.

```sh
SERVER=$(az postgres flexible-server list -g rg-longrun --query "[0].name" -o tsv)
[ -n "$SERVER" ] || { echo "No server found"; exit 1; }
for rule in $(az postgres flexible-server firewall-rule list -g rg-longrun --server-name "$SERVER" \
    --query "[?starts_with(name, 'app-outbound-')].name" -o tsv | tr -d '\r'); do
  echo "Deleting $rule"
  az postgres flexible-server firewall-rule delete -g rg-longrun --server-name "$SERVER" --name "$rule" --yes
done
```

Verify that no permanent rules remain:

```sh
az postgres flexible-server firewall-rule list -g rg-longrun --server-name "$SERVER" --query "[].name" -o tsv
```

Expect empty output. Then check once more that the production app is healthy, for example by signing in in a browser.
