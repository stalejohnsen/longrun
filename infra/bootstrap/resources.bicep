// Resource-group part of the bootstrap layer (ADR 0007, ADR 0002).
extension microsoftGraphV1

import {
  identityNames
  stagingSlotName
  tokenExchangeAudience
  webAppName
} from '../shared/naming.bicep'

param location string
param githubRepository string
param githubOwnerId string
param githubRepositoryId string
param githubEnvironments string[]
param monthlyBudget int
param budgetStartDate string
param budgetContactEmails string[]

var tenantId = tenant().tenantId
var entraIssuer = '${environment().authentication.loginEndpoint}${tenantId}/v2.0'
var appName = webAppName(subscription().subscriptionId)
// Microsoft Graph Bicep supports the public cloud only, so the App Service suffix is fixed.
var appHostSuffix = 'azurewebsites.net'

// Built-in role: Contributor
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

// --- Identities -------------------------------------------------------------------------

resource pipelineIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: identityNames.pipeline
  location: location
}


// GitHub Actions OIDC: only jobs in the given environments of this repository may sign in.
// Repositories created after 2026-07-15 use immutable subject claims with owner and repository
// IDs, so a recreated repository with the same name cannot sign in.
var githubOwner = split(githubRepository, '/')[0]
var githubRepoName = split(githubRepository, '/')[1]
var githubSubjectPrefix = 'repo:${githubOwner}@${githubOwnerId}/${githubRepoName}@${githubRepositoryId}:environment:'

// Federated credentials on one identity cannot be written concurrently, so one at a time.
@batchSize(1)
resource githubFederatedCredentials 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30' = [
  for environment in githubEnvironments: {
    parent: pipelineIdentity
    name: 'github-${environment}'
    properties: {
      issuer: 'https://token.actions.githubusercontent.com'
      subject: '${githubSubjectPrefix}${environment}'
      audiences: [tokenExchangeAudience]
    }
  }
]

// --- App registrations for App Service built-in auth (ADR 0002) ------------------------
// One per slot. Each trusts its slot's managed identity as credential: no client secret.

// Static slot metadata; loops must be computable at deployment start.
var slots = [
  {
    key: 'production'
    identityName: identityNames.appProduction
    uniqueName: 'longrun-auth-production'
    displayName: 'Longrun (production)'
    host: '${appName}.${appHostSuffix}'
    audience: 'api://${tenantId}/longrun-production'
  }
  {
    key: 'staging'
    identityName: identityNames.appStaging
    uniqueName: 'longrun-auth-staging'
    displayName: 'Longrun (staging)'
    host: '${appName}-${stagingSlotName}.${appHostSuffix}'
    audience: 'api://${tenantId}/longrun-staging'
  }
]

// One identity per slot; managed identities are not swapped (ADR 0002).
resource appIdentities 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = [
  for slot in slots: {
    name: slot.identityName
    location: location
  }
]

resource authApps 'Microsoft.Graph/applications@v1.0' = [
  for slot in slots: {
    uniqueName: slot.uniqueName
    displayName: slot.displayName
    signInAudience: 'AzureADMyOrg'
    identifierUris: [slot.audience]
    api: {
      requestedAccessTokenVersion: 2
    }
    web: {
      redirectUris: ['https://${slot.host}/.auth/login/aad/callback']
      // Built-in auth uses the hybrid flow (code id_token) when it has a client credential.
      implicitGrantSettings: {
        enableIdTokenIssuance: true
        enableAccessTokenIssuance: false
      }
    }
  }
]

resource authAppCredentials 'Microsoft.Graph/applications/federatedIdentityCredentials@v1.0' = [
  for (slot, i) in slots: {
    name: '${authApps[i].uniqueName}/app-service-${slot.key}'
    description: 'Trust the ${slot.key} slot managed identity as the app credential'
    audiences: [tokenExchangeAudience]
    issuer: entraIssuer
    subject: appIdentities[i].properties.principalId
  }
]

resource authServicePrincipals 'Microsoft.Graph/servicePrincipals@v1.0' = [
  for (slot, i) in slots: {
    appId: authApps[i].appId
  }
]

// --- Role assignment (the only one; ADR 0007) ------------------------------------------

resource pipelineContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, pipelineIdentity.id, contributorRoleId)
  properties: {
    principalId: pipelineIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    description: 'Longrun pipeline deploys infra/main and the app (ADR 0007)'
  }
}

// --- Cost guardrail ---------------------------------------------------------------------

resource budget 'Microsoft.Consumption/budgets@2026-06-01' = {
  name: 'budget-longrun-monthly'
  properties: {
    category: 'Cost'
    amount: monthlyBudget
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: budgetContactEmails
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: budgetContactEmails
      }
    }
  }
}

output pipelineClientId string = pipelineIdentity.properties.clientId
output webAppName string = appName
output productionAuthClientId string = authApps[0].appId
output stagingAuthClientId string = authApps[1].appId
output stagingAuthAudience string = slots[1].audience
