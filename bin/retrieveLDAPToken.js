import fetch from 'node-fetch';
import process from 'process';
import { exec, spawnSync } from 'child_process';
import { URL } from 'url';
import { SecretsManagerClient, GetSecretValueCommand, CreateSecretCommand, PutSecretValueCommand } from "@aws-sdk/client-secrets-manager";



(async () => {
    try {
      await accountSetup();
  
      const AUTHENTIK_API_TOKEN = await getAWSSecret();
      
      const token = await retrieveToken(
        global.authentikURL,
        AUTHENTIK_API_TOKEN
      );
  
      await putAWSSecret(token);

    } catch (error) {
      console.error('An error occurred:', error.message);
      process.exit(1);
    }
  })();

//Helper function to setup the required parameters
function accountSetup() {
    if (process.argv.length <= 2) {
        // No additional arguments provided
        console.log("No arguments provided.");
        console.log("Required arguments are:");
        console.log("\t--env <environment>");
        console.log("\t--authurl <environment>");
        console.log("Optional arguments are:");
        console.log("\t--profile <environment>");
        console.log("Example: node retrieveLDAPToken.js --env dev --authurl https://auth.exampletak.com --profile myprofile");
        process.exit(1);
    } else {
        global.profile = getAWSProfile();
        global.region = getAWSRegion(profile);
        global.account = getAWSAccount(profile);
        global.environment = getStackEnv();
        global.authentikURL = getAuthentikURL();
        console.log('ok - Determining AWS account and deployment environment setup')
        console.log('\tAWS Profile:', global.profile);
        console.log('\tAWS Region:', global.region);
        console.log('\tAWS Account:', global.account);
        console.log('\tEnvironment:', global.environment);
        console.log('\tAuth URL:', global.authentikURL);
    }
}

// Helper function to get the AWS profile
function getAWSProfile() {
    // Checks for --profile and if it has a value
    const profileIndex = process.argv.indexOf('--profile');
    let profileValue;
  
    if (profileIndex > -1) {
        // Retrieve the value after --profile
        profileValue = process.argv[profileIndex + 1];
    }
    const profile = (profileValue || 'default');
    return profile;
}

// Helper function to get the name of the environment
function getStackEnv() {
    // Checks for --env and if it has a value
    const envIndex = process.argv.indexOf('--env');
    let envValue;
  
    if (envIndex > -1) {
        // Retrieve the value after --env
        envValue = process.argv[envIndex + 1];
    } else {
        console.error('Environment parameter unset. Add "--env" with desired environment parameter.');
        process.exit(1);
    }
    return envValue;
}

// Helper function to get the name of the authurl
function getAuthentikURL() {
    // Checks for --authurl and if it has a value
    const authurlIndex = process.argv.indexOf('--authurl');
    let authurlValue;
  
    if (authurlIndex > -1) {
        // Retrieve the value after --env
        authurlValue = process.argv[authurlIndex + 1];
    } else {
        console.error('Auth URL parameter unset. Add "--authurl" with desired URL.');
        process.exit(1);
    }
    return authurlValue;
}

// Helper function to get AWS region
function getAWSRegion(profile) {
    const aws = spawnSync('aws', [
        'configure', 'get', 'region', '--profile', profile
    ]);

    if (!aws.stdout) throw Error('Unable to determine default AWS region. Run "aws configure" for setup.');
    return String(aws.stdout).replace(/\n/g, '');
}

// Helper function to get AWS account ID
function getAWSAccount(profile) {
    const aws = spawnSync('aws', [
        'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--profile', profile
    ]);

    if (!aws.stdout) throw Error('Unable to determine your AWS account. Run "aws configure" for setup.');
    return String(aws.stdout).replace(/\n/g, '');
}

async function getAWSSecret(){
    const client = new SecretsManagerClient({ region: global.region, profile: global.profile });
    const secretName = 'coe-auth-' + global.environment + '/authentik-admin-token';

    console.log('\tAdmin Token Secret Name:', secretName);

    const command = new GetSecretValueCommand({
        SecretId: secretName,
    });
    
    try {
        const response = await client.send(command);
        return response.SecretString || JSON.parse(response.SecretBinary.transformToString('utf-8'));
    } catch (error) {
        console.error("Error retrieving secret:", error);
        throw error;
    }
    return secret;
}

async function putAWSSecret(secretValue){
    const client = new SecretsManagerClient({ region: global.region, profile: global.profile });
    const secretName = 'coe-auth-' + global.environment + '/authentik-ldap-token';
    const secretStringValue = '{' + JSON.stringify(secretValue) + '}';

    console.log('\tLDAP Token Secret Name:', secretName);
    
    const command = new PutSecretValueCommand({ SecretId: secretName, SecretString: secretValue });
    
    try {
        const response = await client.send(command);
        console.log("OK - Secret for LDAP token updated successfully...");
    } catch (error) {
        console.error("Error retrieving secret:", error);
        throw error;
    };
}

// Helper function to fetch JSON data
async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

async function retrieveToken(AUTHENTIK_HOST, AUTHENTIK_API_TOKEN, OUTPOST_NAME) {
  OUTPOST_NAME = OUTPOST_NAME || 'LDAP';

  try {
    // Fetch outpost instances from API
    const outpostInstancesUrl = new URL('/api/v3/outposts/instances/', AUTHENTIK_HOST);
    outpostInstancesUrl.searchParams.append('name__iexact', OUTPOST_NAME);

    const outpostInstances = await fetchJson(outpostInstancesUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${AUTHENTIK_API_TOKEN}`,
      }
    });

    // Check if we found the outpost
    const results = outpostInstances.results || [];
    if (results.length === 0) {
        throw new Error(`Outpost with name ${OUTPOST_NAME} not found, aborting...`);
    }

    // Extract the token identifier
    const outpost = results.find((item) => item.name === OUTPOST_NAME);
    if (!outpost || !outpost.token_identifier) {
        throw new Error(`Token identifier for outpost ${OUTPOST_NAME} not found, aborting...`);
      }

    const tokenIdentifier = outpost.token_identifier;

    // Fetch the token
    const viewKeyUrl = new URL(`/api/v3/core/tokens/${tokenIdentifier}/view_key/`, AUTHENTIK_HOST);

    const viewKeyResult = await fetchJson(viewKeyUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${AUTHENTIK_API_TOKEN}`,
      }
    });

    const outpostToken = viewKeyResult.key;
    if (!outpostToken) {
        throw new Error(`Token for outpost ${OUTPOST_NAME} not found, aborting...`);
    }

    return(outpostToken);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    throw error; // Re-throw the error for centralized handling
  }
}