import { exec, spawnSync } from 'child_process';


await accountSetup();

await ecrLogin(global.region, global.account, global.profile)

await buildPushDockerContainer(global.region, global.account, global.environment, global.gitsha, 'auth-infra-server')

await buildPushDockerContainer(global.region, global.account, global.environment, global.gitsha, 'auth-infra-ldap')

function accountSetup() {
    console.log('ok - Determining AWS account and deployment environment setup')
    global.profile = getAWSProfile();
    global.region = getAWSRegion(profile);
    global.account = getAWSAccount(profile);
    global.gitsha = getGitSha();
    global.environment = getStackEnv()

    console.log('AWS Profile:', global.profile);
    console.log('AWS Region:', global.region);
    console.log('AWS Account:', global.account);
    console.log('GitSHA:', global.gitsha);
    console.log('Environment:', global.environment);
}

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

function getAWSRegion(profile) {
    const aws = spawnSync('aws', [
        'configure', 'get', 'region', '--profile', profile
    ]);

    if (!aws.stdout) throw Error('Unable to determine default AWS region. Run "aws configure" for setup.');
    return String(aws.stdout).replace(/\n/g, '');
}

function getAWSAccount(profile) {
    const aws = spawnSync('aws', [
        'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--profile', profile
    ]);

    if (!aws.stdout) throw Error('Unable to determine your AWS account. Run "aws configure" for setup.');
    return String(aws.stdout).replace(/\n/g, '');
}


function getGitSha() {
    const git = spawnSync('git', [
        '--git-dir', new URL('../.git', import.meta.url).pathname,
        'rev-parse', 'HEAD'
    ]);

    if (!git.stdout) throw Error('Is this a git repo? Could not determine GitSha');
    return String(git.stdout).replace(/\n/g, '');

}

function ecrLogin(region, account, profile) {
    console.log('ok - logging in')

    const ecrPassword = 'aws ecr get-login-password --region ' + region + ' --profile ' + profile;
    const dockerLogin = 'docker login --username AWS --password-stdin "' + account + '.dkr.ecr.' + region + '.amazonaws.com"';
    const Command = ecrPassword + ' | ' + dockerLogin;
    return new Promise((resolve, reject) => {
        const $ = exec(Command, (err) => {
            if (err) return reject(err);
            return resolve();
        });

        $.stdout.pipe(process.stdout);
        $.stderr.pipe(process.stderr);
    });

}

function buildPushDockerContainer(region, account, environment, gitsha, image) {
    console.log('ok - building Docker image')

    const dockerCompose = 'docker compose build ' + image;
    const dockerTag = 'docker tag ' + image + ':latest "' + account + '.dkr.ecr.' + region + '.amazonaws.com/coe-base-' + environment + ':' + gitsha + '"';
    const dockerPush = 'docker push "' + account + '.dkr.ecr.' + region + '.amazonaws.com/coe-base-' + environment + ':' + gitsha + '"';
    const Command = dockerCompose + ' && ' + dockerTag + ' && ' + dockerPush;

    return new Promise((resolve, reject) => {
        const $ = exec(Command, (err) => {
            if (err) return reject(err);
            return resolve();
        });

        $.stdout.pipe(process.stdout);
        $.stderr.pipe(process.stderr);
    });
}