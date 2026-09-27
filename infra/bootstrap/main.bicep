// Bootstrap layer (ADR 0007). Deployed by the owner only, with their own Azure and Entra
// rights. Holds every identity, federated credential, app registration and role assignment.
// Re-running is idempotent. See docs/runbooks/bootstrap.md.
targetScope = 'subscription'

import { resourceGroupName } from '../shared/naming.bicep'

@description('Azure region for all resources.')
param location string = 'swedencentral'

@description('GitHub repository allowed to deploy, as owner/name.')
param githubRepository string = 'stalejohnsen/longrun'

@description('Immutable numeric ID of the repository owner (gh api repos/OWNER/REPO -q .owner.id).')
param githubOwnerId string = '98233333'

@description('Immutable numeric ID of the repository (gh api repos/OWNER/REPO -q .id).')
param githubRepositoryId string = '1389214305'

@description('GitHub environments the deploy jobs run in; the only OIDC subjects trusted. staging: infra, migrations and the staging slot; production: the swap after owner approval (spec 0002).')
param githubEnvironments string[] = ['production', 'staging']

@description('Monthly budget in the billing currency.')
@minValue(1)
param monthlyBudget int = 100

@description('First day of the budget period (yyyy-MM-01). Keep stable across deployments.')
param budgetStartDate string = '2026-09-01'

@description('Email addresses for budget alerts. Passed at deploy time; not stored in the repository.')
@minLength(1)
param budgetContactEmails string[]

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: location
}

module resources 'resources.bicep' = {
  name: 'longrun-bootstrap-resources'
  scope: resourceGroup
  params: {
    location: location
    githubRepository: githubRepository
    githubOwnerId: githubOwnerId
    githubRepositoryId: githubRepositoryId
    githubEnvironments: githubEnvironments
    monthlyBudget: monthlyBudget
    budgetStartDate: budgetStartDate
    budgetContactEmails: budgetContactEmails
  }
}

// Non-secret identifiers, set as GitHub environment variables (docs/runbooks/bootstrap.md).
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
output resourceGroupName string = resourceGroup.name
output pipelineClientId string = resources.outputs.pipelineClientId
output webAppName string = resources.outputs.webAppName
output productionAuthClientId string = resources.outputs.productionAuthClientId
output stagingAuthClientId string = resources.outputs.stagingAuthClientId
output stagingAuthAudience string = resources.outputs.stagingAuthAudience
