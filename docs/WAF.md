# AWS WAF on the Authentik load balancer

The stack can attach an AWS WAF web ACL (`tak-<stack>-auth`) to the Authentik load balancer. It is configured by
the `waf` block in `cdk.json` (see [PARAMETERS.md](PARAMETERS.md#waf-configuration)) and implemented in
`lib/constructs/waf.ts`.

## Rules

| Rule | Priority | What it matches | Default action |
|---|---|---|---|
| `ClientSuppliedForwardingHeaders` | 10 | A request that already has an `X-Forwarded-For`, `X-Real-IP` or `Forwarded` header | `count` |
| `RateLimitFlowExecutor` | 20 | More than 300 requests in 5 minutes from one source IP to `/api/v3/flows/executor/` (not the LDAP flow) | `count` |
| `AWSManagedRulesAmazonIpReputationList` | 30 | Source IPs on the AWS managed reputation list | `count` |

Everything else is allowed.

### Why the forwarding header rule exists
Authentik takes the **leftmost** `X-Forwarded-For` value as the client IP. The load balancer appends the real
address on the right, after WAF has inspected the request. So a client that sends its own `X-Forwarded-For`
chooses the IP that Authentik uses for reputation scores and records in audit events. A request that reaches WAF
with the header already set was sent that way by the client or by a proxy in front of it. Blocking those requests
leaves Authentik with the one address the load balancer added.

Proxies that add the header to HTTPS traffic (for example TLS-inspecting gateways) would be blocked as well, so
run the rule as `count` first and look at who sends the header before switching it to `block`.

### Why the rate rule excludes the LDAP flow
The LDAP outpost runs its bind flow through this load balancer, so every bind comes from the VPC's NAT address.
`ldap-authentication-flow` only runs for an authenticated outpost, so excluding it does not open anything up.
Paths are URL-decoded and normalised before they are matched, so `..` or `%2e%2e` cannot be used to step around
the exclusion. WAF counts the real connection address here, which a client cannot forge.

## The IP lock depends on this
The Authentik IP lock (`authentik.ipLock`, see [BLUEPRINTS.md](BLUEPRINTS.md#ip-lock)) keys on the client IP
that Authentik sees. While a client can send its own `X-Forwarded-For`, it can pick a fresh IP for every
attempt and the lock does nothing. Turn the lock on only after `forwardingHeaders` is `block`, or after you
have decided that the clients that send those headers do not matter. The rate rule does not depend on it.

## Logs and metrics
- **Metrics** (CloudWatch namespace `AWS/WAFV2`, dimension `Rule`): `Tak<Stack>AuthForwardingHeaders`,
  `Tak<Stack>AuthRateLimitFlowExecutor`, `Tak<Stack>AuthIpReputation`, and `Tak<Stack>AuthWebAcl` for the whole ACL.
  `<Stack>` is the stack name without non-alphanumeric characters, for example `DevTest`.
- **Logs**: only requests that matched a rule with a `count` or `block` action go to the log group
  `aws-waf-logs-tak-<stack>-auth`. The query string and the `cookie`, `authorization` and
  `x-authentik-outpost-token` headers are redacted, because flow links carry their token in the query string.

Example Logs Insights query to see which source addresses send the forwarding headers (not yet run against real traffic):

```
fields @timestamp, httpRequest.clientIp as sourceIp, httpRequest.uri
| filter @message like /ClientSuppliedForwardingHeaders/
| stats count(*) as requests by sourceIp
| sort requests desc
```

## Switching a rule to block
1. Watch the metric and the log for at least a few weeks of normal use, including a busy login period.
2. For the forwarding header rule, check that the sources are not users you need (for example agencies behind a
   TLS-inspecting proxy). If they are, keep it on `count` and do not rely on Authentik's idea of the client IP.
3. For the rate rule, check the highest per-IP rate. Shared addresses (an agency NAT) legitimately send more.
4. Set the action to `block` in `cdk.json` and deploy. To roll back, set it to `count` again.

## Deploying
The log group name must start with `aws-waf-logs-`. WAF adds the CloudWatch Logs resource policy that lets it
deliver; the deploying role needs `logs:PutResourcePolicy` for that. If the first deploy fails on the logging
configuration, check the role's permissions.
