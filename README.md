<h1 align=center>TAK Auth Infra</h1>

<p align=center>Infrastructure to support LDAP based auth in TAK via <a href="https://goauthentik.io/">Authentik</a></p>

## Background

The [Team Awareness Kit (TAK)](https://tak.gov/solutions/emergency) provides Fire, Emergency Management, and First Responders an operationally agnostic tool for improved situational awareness and a common operational picture. 
This repo deploys [Authentik](https://goauthentik.io/) as the LDAP based authentication layer for a [TAK server](https://tak.gov/solutions/emergency) on AWS.
While a TAK sever supports build-in file based authentication mechanism, this approach is very limited. Also almost any other LDAP based authentication provider could be used, but Authentic here is a good choice to provide all the necessary functionality of an LDAP provider as well as advanced capabilities such as single-sign on via OIDC. 

The following additional layers are required after deploying this `coe-base-<name>` layer:

| Name                  | Notes |
| --------------------- | ----- |
| `coe-tak-<name>`      | TAK Server layer - [repo](https://github.com/TAK-NZ/tak-infra)      |


## Pre-Reqs

> [!IMPORTANT]
> The Auth-Infra service assumes some pre-requisite dependencies are deployed before
> initial deployment.

The following dependencies must be fulfilled:
- An [AWS Account](https://signin.aws.amazon.com/signup?request_type=register).
- A Domain Name under which the TAK server is made available, e.g. `tak.nz` in the example here.
- An [AWS ACM certificate](https://docs.aws.amazon.com/acm/latest/userguide/gs.html) certificate.
  - This certificate should cover the main domain - e.g. `tak.nz`, as well as the wildcard subdomain, e.g. `*.tak.nz`.

The following stack layers need to be created before deploying this layer:

| Name                  | Notes |
| --------------------- | ----- |
| `coe-base-<name>`      | VPC, ECS cluster, and ECR repository - [repo](https://github.com/TAK-NZ/base-infra)      |


## AWS Deployment

### 1. Install Tooling Dependencies

From the root directory, install the deploy dependencies

```sh
npm install
```

### 2.(Optional) Authentik configuration

The `coe-base-<name>` layer creates an S3 bucket with the name `coe-auth-config-s3-<name>-<region>-env-config` which can be used for advanced [Authentik configuration](https://docs.goauthentik.io/docs/install-config/configuration/) via an .env configuration file.
An example configuration file with the name [authentik-config.env.example] is provided in this repo. Adjust this file based on your needs and store it in the created S3 bucket as `authentik-config.env`.

### 3. Authentik Server Deployment

Deployment to AWS is handled via AWS Cloudformation. The template can be found in the `./cloudformation`
directory. The deployment itself is performed by [Deploy](https://github.com/openaddresses/deploy) which
was installed in the previous step.

It is important that this layer is deployed into an existing `base-infra` stack.

Use the command `npx deploy create <stack>` to create the main Authentik Server portion. For example: 

```
npx deploy create staging 
```

### 4. Setup a DNS CNAME for the web interface

Create a DNS CNAME from your desired hostname for the Authentik server to the ALB hostname. The ALB hostname is one of the CloudFormation template outputs. An example would be:
- Name: `auth.tak.nz`
- Type: `CNAME`
- Value: `coe-auth-staging-123456789.us-gov-west-1.elb.amazonaws.com`

End-users and admins will communicate with this endpoint to manage user accounts. 

### 5. Configure the Authentik LDAP Provider

While the Authentik LDAP setup is mostly completed automatically based on the Authentik documentation to [create and LDAP provider](https://docs.goauthentik.io/docs/add-secure-apps/providers/ldap/generic_setup), it is necessary to store the Authentik LDAP Token in AWS Secrets Manager. 

Use the command `node ./bin/retrieveLDAPToken.js --env <name> --authurl <url>` to do so. As an example:

```
node ./bin/retrieveLDAPToken.js --env staging --authurl https://auth.tak.nz 
```

### 6. Create the Authentik LDAP Outpost

Use the command `npx deploy create <stack> --template ./cloudformation/ldap.template.js` to create the LDAP Outpost into the same stack. For example: 
```
npx deploy create staging --template ./cloudformation/ldap.template.js
```

### 7. Setup a DNS CNAME for the LDAPS interface

Create a DNS CNAME from your desired hostname for the LDAPS service to the internal NLB hostname. The NLB hostname is one of the CloudFormation template outputs. An example would be:
- Name: `ldap.tak.nz`
- Type: `CNAME`
- Value: `coe-auth-ldap-staging-123456789.us-gov-west-1.elb.amazonaws.com`

The TAK server will communicate with this endpoint to authenticate and authorize users over LDAPs. 

## About the deploy tool

The deploy tool can be run via the `npx deploy` command.

To install it globally - view the deploy [README](https://github.com/openaddresses/deploy)

Deploy uses your existing AWS credentials. Ensure that your `~/.aws/credentials` has an entry like:
 
```
[coe]
aws_access_key_id = <redacted>
aws_secret_access_key = <redacted>
```

Stacks can be created, deleted, cancelled, etc all via the deploy tool. For further information
information about `deploy` functionality run the following for help.
 
```sh
npx deploy
```
 
Further help about a specific command can be obtained via something like:

```sh
npx deploy info --help
```

## Estimated Cost

The estimated AWS cost for this layer of the stack without data transfer or data processing based usage is:

| Environment type      | Estimated monthly cost | Estimated yearly cost |
| --------------------- | ----- | ----- |
| Prod                  | 366.87 USD | 4,402.44 USD |
| Dev-Test              | 106.25 USD | 1,275.00 USD |
