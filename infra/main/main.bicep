// Main layer (ADR 0007). Deployed by the pipeline (Contributor on rg-longrun only).
// Contains no role assignments; all identities come from infra/bootstrap.
targetScope = 'resourceGroup'

import {
  databaseName
  databaseRoles
  identityNames
  postgresServerName
  stagingSlotName
  webAppName
} from '../shared/naming.bicep'

param location string = resourceGroup().location

@description('Entra object ID of the PostgreSQL Entra administrator (the owner; bootstrap only).')
param postgresAdminObjectId string

@description('User principal name of the PostgreSQL Entra administrator.')
param postgresAdminPrincipalName string

@description('Client ID of the production built-in auth app registration (bootstrap output).')
param productionAuthClientId string

@description('Client ID of the staging built-in auth app registration (bootstrap output).')
param stagingAuthClientId string

@description('Identifier URI of the staging app registration (bootstrap output).')
param stagingAuthAudience string

var tenantId = tenant().tenantId
var appName = webAppName(subscription().subscriptionId)
var serverName = postgresServerName(subscription().subscriptionId)

// --- Identities from bootstrap ------------------------------------------------------------

resource pipelineIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: identityNames.pipeline
}

resource productionIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: identityNames.appProduction
}

resource stagingIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' existing = {
  name: identityNames.appStaging
}

// --- Monitoring ---------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: 'log-longrun'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-longrun'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    DisableLocalAuth: false
  }
}

// --- Database -----------------------------------------------------------------------------

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: serverName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '17'
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: tenantId
    }
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource postgresAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2025-08-01' = {
  parent: postgres
  name: postgresAdminObjectId
  properties: {
    principalType: 'User'
    principalName: postgresAdminPrincipalName
    tenantId: tenantId
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2025-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// --- App Service --------------------------------------------------------------------------

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: 'asp-longrun'
  location: location
  kind: 'linux'
  sku: {
    name: 'P0v3'
    tier: 'Premium0V3'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

var siteConfig = {
  linuxFxVersion: 'NODE|24-lts'
  appCommandLine: 'node server.js'
  alwaysOn: true
  healthCheckPath: '/health'
  http20Enabled: true
  minTlsVersion: '1.2'
  scmMinTlsVersion: '1.2'
  ftpsState: 'Disabled'
}

resource webApp 'Microsoft.Web/sites@2024-11-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${productionIdentity.id}': {} }
  }
  properties: {
    serverFarmId: plan.id
    // Outbound private traffic (the database's private endpoint) goes through the VNet.
    virtualNetworkSubnetId: '${vnet.id}/subnets/snet-app'
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: siteConfig
  }
}

resource stagingSlot 'Microsoft.Web/sites/slots@2024-11-01' = {
  parent: webApp
  name: stagingSlotName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${stagingIdentity.id}': {} }
  }
  properties: {
    serverFarmId: plan.id
    // Virtual network integration is not swapped; each slot has its own (same subnet).
    virtualNetworkSubnetId: '${vnet.id}/subnets/snet-app'
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: siteConfig
  }
}

// Settings shared by both slots.
var commonSettings = {
  NODE_ENV: 'production'
  SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
  DATABASE_HOST: postgres.properties.fullyQualifiedDomainName
  DATABASE_NAME: databaseName
  DATABASE_SSL: 'require'
  WEBSITE_AUTH_AAD_ALLOWED_TENANTS: tenantId
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
  // Node.js autoinstrumentation on Linux is public preview (ADR 0007 follow-up).
  ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
}

// Slot-sticky settings: each slot keeps its own identity and database role on swap.
var stickySettingNames = ['AZURE_CLIENT_ID', 'DATABASE_USER', 'OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID']

resource productionSettings 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: webApp
  name: 'appsettings'
  properties: union(commonSettings, {
    AZURE_CLIENT_ID: productionIdentity.properties.clientId
    DATABASE_USER: databaseRoles.appProduction
    OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID: productionIdentity.properties.clientId
  })
}

resource stagingSettings 'Microsoft.Web/sites/slots/config@2024-11-01' = {
  parent: stagingSlot
  name: 'appsettings'
  properties: union(commonSettings, {
    AZURE_CLIENT_ID: stagingIdentity.properties.clientId
    DATABASE_USER: databaseRoles.appStaging
    OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID: stagingIdentity.properties.clientId
  })
}

resource slotConfigNames 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: webApp
  name: 'slotConfigNames'
  properties: {
    appSettingNames: stickySettingNames
  }
}

// Deployments use Entra ID, never basic (publishing profile) credentials.
resource productionFtp 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: webApp
  name: 'ftp'
  properties: { allow: false }
}

resource productionScm 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: webApp
  name: 'scm'
  properties: { allow: false }
}

resource stagingFtp 'Microsoft.Web/sites/slots/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: stagingSlot
  name: 'ftp'
  properties: { allow: false }
}

resource stagingScm 'Microsoft.Web/sites/slots/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: stagingSlot
  name: 'scm'
  properties: { allow: false }
}

// --- Built-in authentication (ADR 0002) ----------------------------------------------------

var openIdIssuer = '${environment().authentication.loginEndpoint}${tenantId}/v2.0'

func authSettings(clientId string, issuer string, audiences string[], allowedApplications string[]) object => {
  platform: { enabled: true }
  globalValidation: {
    requireAuthentication: true
    unauthenticatedClientAction: 'RedirectToLoginPage'
    redirectToProvider: 'azureactivedirectory'
  }
  httpSettings: {
    requireHttps: true
    forwardProxy: { convention: 'NoProxy' }
  }
  login: {
    tokenStore: { enabled: true }
  }
  identityProviders: {
    azureActiveDirectory: {
      enabled: true
      registration: {
        openIdIssuer: issuer
        clientId: clientId
        // Secretless: the slot's managed identity is the client credential (ADR 0002).
        clientSecretSettingName: 'OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID'
      }
      validation: {
        allowedAudiences: audiences
        defaultAuthorizationPolicy: {
          allowedApplications: allowedApplications
        }
      }
    }
  }
}

resource productionAuth 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: webApp
  name: 'authsettingsV2'
  properties: authSettings(productionAuthClientId, openIdIssuer, [productionAuthClientId], [productionAuthClientId])
}

// Staging also accepts the pipeline identity so it can verify /health before the swap (ADR 0007).
resource stagingAuth 'Microsoft.Web/sites/slots/config@2024-11-01' = {
  parent: stagingSlot
  name: 'authsettingsV2'
  properties: authSettings(
    stagingAuthClientId,
    openIdIssuer,
    [stagingAuthClientId, stagingAuthAudience],
    [stagingAuthClientId, pipelineIdentity.properties.clientId]
  )
}

// --- Private network path from the app to PostgreSQL (ADR 0007) ---------------------------
// The app reaches the database through a private endpoint over App Service virtual network
// integration. The server keeps public access enabled but has no permanent firewall rules:
// only the temporary, always-removed CI migration and owner bootstrap rules use it.

resource vnet 'Microsoft.Network/virtualNetworks@2025-09-01' = {
  name: 'vnet-longrun'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.60.0.0/24'] }
    subnets: [
      {
        // App Service virtual network integration; /26 covers the plan's maximum scale.
        name: 'snet-app'
        properties: {
          addressPrefix: '10.60.0.0/26'
          delegations: [
            {
              name: 'app-service'
              properties: { serviceName: 'Microsoft.Web/serverFarms' }
            }
          ]
        }
      }
      {
        name: 'snet-private-endpoints'
        properties: {
          addressPrefix: '10.60.0.64/28'
        }
      }
    ]
  }
}

resource postgresPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.postgres.database.azure.com'
  location: 'global'
}

resource postgresPrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresPrivateDnsZone
  name: 'vnet-longrun'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource postgresPrivateEndpoint 'Microsoft.Network/privateEndpoints@2025-09-01' = {
  name: 'pe-${serverName}'
  location: location
  properties: {
    subnet: { id: '${vnet.id}/subnets/snet-private-endpoints' }
    privateLinkServiceConnections: [
      {
        name: 'postgres'
        properties: {
          privateLinkServiceId: postgres.id
          groupIds: ['postgresqlServer']
        }
      }
    ]
  }
}

resource postgresPrivateDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2025-09-01' = {
  parent: postgresPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'postgres'
        properties: { privateDnsZoneId: postgresPrivateDnsZone.id }
      }
    ]
  }
}

output webAppName string = webApp.name
output stagingHostName string = stagingSlot.properties.defaultHostName
output productionHostName string = webApp.properties.defaultHostName
output postgresServerName string = postgres.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output databaseName string = database.name
output postgresAdminName string = postgresAdmin.properties.principalName
