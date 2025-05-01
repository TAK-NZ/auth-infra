<h1 align=center>TAK Auth Infra</h1>

<p align=center>Infrastructure to support LDAP based auth in TAK via <a href="https://goauthentik.io/">Authentik</a></p>

## Background

The [Team Awareness Kit (TAK)](https://tak.gov/solutions/emergency) provides Fire, Emergency Management, and First Responders an operationally agnostic tool for improved situational awareness and a common operational picture. 
This repo deploys the base infrastructure required to deploy a [TAK server](https://tak.gov/solutions/emergency) along with [Authentik](https://goauthentik.io/) as the authentication layer on AWS.

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
  - This certificate should cover the main domain - e.g. `tak.nz`, as well as two levels of wildcard subdomains, e.g. `*.tak.nz` and `*.*.tak.nz`.

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

### 2. Authentik Server Deployment

Deployment to AWS is handled via AWS Cloudformation. The template can be found in the `./cloudformation`
directory. The deployment itself is performed by [Deploy](https://github.com/openaddresses/deploy) which
was installed in the previous step.

It is important that this layer is deployed into an existing `base-infra` stack.

#### Sub-Stack Deployment

The CloudFormation is split into multiple stacks to ensure consistent deploy results. These stacks consist of 
- (Optional) S3 bucket to hold a .env configuration file for advanced [Authentik configuration](https://docs.goauthentik.io/docs/install-config/configuration/). 
- The Authentik Server itself as ECS container.
- Authentik LDAP Outpost as ECS container.

Step 1 (Optional): Create the S3 configuration bucket

Use the command `npx deploy create <stack> --template ./cloudformation/config-s3.template.js` to create the S3 configuration bucket. For example: 
```
npx deploy create staging --template ./cloudformation/config-s3.template.js
```

Adapt the provided file [authentik-config.env.example] based on your needs and stor it in the created S3 bucket as `authentik-config.env`.


Step 2: Create the Authenik Server Portion

Use the command `npx deploy create <stack>` to create the main Authentik Server portion. For example: 

```
npx deploy create staging 
```

Step 3: Setup a DNS CNAME for the web interface

Create a DNS CNAME from your desired hostname for the Authentik server to the ALB hostname. The ALB hostname is one of the CloudFormation template outputs. An example would be `auth.tak.nz -> coe-auth-production-123456789.us-gov-west-1.elb.amazonaws.com`. End-users and admins will communicate with this endpoint to manage user accounts. 

Step 4: Configure the Authentik LDAP Provider

Follow the instructions of the Authentik documentation to [create and LDAP provider](https://docs.goauthentik.io/docs/add-secure-apps/providers/ldap/generic_setup). 

* **LDAP Service Account:** The username and password have been created by the above CloudFormation template as a Secrets Manager secret in `coe-auth-<stack>/svc`.
* **LDAP Outpost AUTHENTIK_TOKEN:** The Authentik server will create an AUTHENTIK_TOKEN for the LDAP Outpost, which needs to be saved in Secrets Manager as the secret for `coe-auth-<stack>/authentik-ldap-token`

Step 5: Create the Authentik LDAP Outpost

Use the command `npx deploy create <stack> --template ./cloudformation/ldap.template.js` to create the LDAP Outpost into the same stack. For example: 
```
npx deploy create staging --template ./cloudformation/ldap.template.js
```

Step 6: Setup a DNS CNAME for the LDAPS interface

Create a DNS CNAME from your desired hostname for the LDAPS service to the internal NLB hostname. The NLB hostname is one of the CloudFormation template outputs. An example would be `ldap.tak.nz -> coe-auth-ldap-production-123456789.us-gov-west-1.elb.amazonaws.com`. The TAK server will communicate with this endpoint to authenticate and authorize users. 

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
| Prod                  | xx.xx USD | xx.xx USD |
| Dev-Test              | xx.xx USD | xx.xx USD |
