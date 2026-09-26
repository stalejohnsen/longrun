// Allows the web app's possible outbound addresses to reach PostgreSQL (ADR 0007).
// A module, because loops need values known when the deployment of this template starts.

param serverName string

@description('Comma-separated IPv4 addresses (the web app possibleOutboundIpAddresses).')
param ipAddresses string

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' existing = {
  name: serverName
}

// Flexible Server applies one configuration change at a time.
@batchSize(1)
resource rules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2025-08-01' = [
  for (ip, i) in filter(split(ipAddresses, ','), address => !contains(address, ':')): {
    parent: postgres
    name: 'app-outbound-${i}'
    properties: {
      startIpAddress: ip
      endIpAddress: ip
    }
  }
]
