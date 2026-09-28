# Refund Recovery

Read-only Shopify loss detector for refund/return inventory mismatches.

## V1 promise
Install → scan recent orders → show dollars tied to suspicious refund/return states → monitor continuously.

## Safety boundary
V1 never issues refunds, changes orders, or mutates inventory. Findings are audit flags for merchant review, not assertions that money is definitely recoverable.

## Current core
- Shopify GraphQL scan query
- Normalizer
- Deterministic loss rules
- Node test suite
- Minimal scopes: read_orders, read_returns
- Webhook declaration for ongoing monitoring

## Local core test
```
npm test
```

## Next integration
Scaffold Shopify's current React Router app shell, preserve this scanner as the domain core, connect authenticated `admin.graphql`, persist findings, add App Home dashboard and Shopify billing.
