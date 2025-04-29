<h1 align=center>TAK Auth Infra</h1>

<p align=center>Infrastructure to support LDAP based auth in TAK via <a href="https://goauthentik.io/">Authentik</a></p>

## AWS Deployment

### 1. Pre-Reqs

> [!IMPORTANT]
> The Auth-Infra service assumes some pre-requisite dependencies are deployed before
> initial deployment.

The following are dependencies which need to be created:

| Name                  | Notes |
| --------------------- | ----- |
| `coe-vpc-<name>`      | VPC & networking to place tasks in - [repo](https://github.com/dfpc-coe/vpc)      |
| `coe-ecs-<name>`      | ECS Cluster for API Service - [repo](https://github.com/dfpc-coe/ecs)             |
| `coe-ecr-auth`        | ECR Repository for storing Auth-Infra Images - [repo](https://github.com/dfpc-coe/ecr)   |

An AWS ACM certificate must also be generated that covers the subdomain that the Auth-Infra is deployed to.

### 2. Installing Dependencies

From the root directory, install the deploy dependencies

```sh
npm install
```

### 3. Authentik Server Deployment

Deployment to AWS is handled via AWS Cloudformation. The template can be found in the `./cloudformation`
directory. The deployment itself is performed by [Deploy](https://github.com/openaddresses/deploy) which
was installed in the previous step.

> [!NOTE] 
> The deploy tool can be run via the following
>
> ```sh
> npx deploy
> ```
>
> To install it globally - view the deploy [README](https://github.com/openaddresses/deploy)
> 
> Deploy uses your existing AWS credentials. Ensure that your `~/.aws/credentials` has an entry like:
> 
> ```
> [coe]
> aws_access_key_id = <redacted>
> aws_secret_access_key = <redacted>
> ```

Deployment can then be performed via the following:

```
npx deploy create <stack>
npx deploy update <stack>
npx deploy info <stack> --outputs
npx deploy info <stack> --parameters
```

Stacks can be created, deleted, cancelled, etc all via the deploy tool. For further information
information about `deploy` functionality run the following for help.

```sh
npx deploy
```

#### Sub-Stack Deployment

The CloudFormation is split into two stacks to ensure consistent deploy results.

The first portion deploys the Authentik Server itself. The second portion deploys the Authentik LDAP Outpost.

Step 1: Create the Authenik Server Portion

```
npx deploy create <stack> 
```

Step 2: Setup a DNS CNAME for the web interface

Create a DNS CNAME from your desired hostname for the Authentik server to the ALB hostname. The ALB hostname is one of the CloudFormation template outputs. An example would be `auth.cotak.gov -> coe-auth-production-123456789.us-gov-west-1.elb.amazonaws.com`. End-users and admins will communicate with this endpoint to manage user accounts. 

Step 3: Configure the Authentik LDAP Provider

Follow the instructions of the Authentik documentation to [create and LDAP provider](https://docs.goauthentik.io/docs/add-secure-apps/providers/ldap/generic_setup). 

* **LDAP Service Account:** The username and password have been created by the above CloudFormation template as a Secrets Manager secret in `coe-auth-<stack>>/svc`.
* **LDAP Outpost AUTHENTIK_TOKEN:** The Authentik server will create an AUTHENTIK_TOKEN for the LDAP Outpost, which needs to be saved in Secrets Manager as the secret for `coe-auth-<stack>>/authentik-ldap-token`

Step 4: Create the Authentik LDAP Outpost

```
npx deploy create <stack> --template ./cloudformation/ldap.template.js
```

Step 5: Setup a DNS CNAME for the LDAPS interface

Create a DNS CNAME from your desired hostname for the LDAPS service to the internal NLB hostname. The NLB hostname is one of the CloudFormation template outputs. An example would be `ldap.cotak.gov -> coe-auth-ldap-production-123456789.us-gov-west-1.elb.amazonaws.com`. The TAK server will communicate with this endpoint to authenticate and authorize users. 

