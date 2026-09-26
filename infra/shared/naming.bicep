// Shared, deterministic names used by both Bicep layers (ADR 0007).

@export()
@description('Resource group for all Longrun resources.')
var resourceGroupName = 'rg-longrun'

@export()
@description('Globally unique, deterministic web app name for a subscription. Classic default hostnames keep redirect URIs predictable (ADR 0007).')
func webAppName(subscriptionId string) string => 'app-longrun-${uniqueString(subscriptionId, 'rg-longrun')}'

@export()
@description('Name of the deployment slot used for staging.')
var stagingSlotName = 'staging'

@export()
var identityNames = {
  pipeline: 'id-longrun-pipeline'
  appProduction: 'id-longrun-app-prod'
  appStaging: 'id-longrun-app-staging'
}

@export()
@description('Audience for Entra workload identity federation.')
var tokenExchangeAudience = 'api://AzureADTokenExchange'

@export()
@description('Globally unique, deterministic PostgreSQL Flexible Server name for a subscription.')
func postgresServerName(subscriptionId string) string => 'psql-longrun-${uniqueString(subscriptionId, 'rg-longrun')}'

@export()
@description('Application database name.')
var databaseName = 'longrun'

@export()
@description('Database login roles mapped to Entra identities (docs/runbooks/database-bootstrap.md).')
var databaseRoles = {
  migrator: 'longrun_migrator'
  appProduction: 'longrun_app_production'
  appStaging: 'longrun_app_staging'
}
