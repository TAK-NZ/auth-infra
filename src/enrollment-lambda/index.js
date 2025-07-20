const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const https = require('https');
const crypto = require('crypto');
const QRCode = require('qrcode');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

console.log('Loading enrollment function');

exports.handler = async (event, context) => {
    try {
        console.log('Event: ' + JSON.stringify(event));
        
        if (event.path !== '/' && event.path !== undefined) {
            console.log('Request not for the root path: ' + event.path);
            return {
                statusCode: 404,
                body: 'Not Found',
                headers: { 'Content-Type': 'text/plain' }
            };
        } 

        // Get configuration from environment variables
        const takServer = process.env.TAK_SERVER_DOMAIN;
        const apiHost = process.env.AUTHENTIK_API_ENDPOINT;
        
        // Get the auth token from Secrets Manager
        const auth_token = await getAuthToken();
        
        // Extract user information from the OIDC token
        const decodedToken = JSON.parse(Buffer.from(
            event.headers['x-amzn-oidc-data'].split('.')[1], 
            'base64'
        ).toString());
        
        const device_platform = event.headers['sec-ch-ua-platform'];
        const user = decodedToken.preferred_username || decodedToken.email;
        
        const randomString = generateRandomString(16);
        const now = new Date();
        const tokenExpirationDate = new Date(now.getTime() + 30 * 60 * 1000); // Add 30 minutes
        const reEnrollDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // Add 365 days

        // Hide enrollment link on non-Android devices
        let hide_enrollment_link = '';
        if (device_platform !== '"Android"') {
            hide_enrollment_link = ' hidden ';
        }

        const options = {
            timeZone: 'Pacific/Auckland',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        const expireTimeInNZ = tokenExpirationDate.toLocaleTimeString('en-NZ', options);
        console.log('Token expires at: ' + expireTimeInNZ);
        const reenrollTimeInNZ = reEnrollDate.toLocaleTimeString('en-NZ', options);
        console.log('Re-enroll before: ' + reenrollTimeInNZ);

        const tokenIdentifier = 'TAK-Enrollment-' + user.replace(/[@.]/g, "-") + '-' + randomString;
        console.log('Token Expiration: '+ tokenExpirationDate.toISOString());
        console.log('User: ' + user);

        const requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + auth_token, 
        };
        
        // Get user ID from Authentik
        const userUrl = apiHost + '/api/v3/core/users/?username=' + user;
        const userIdResponse = await getApi(userUrl, requestHeaders);
        const userIdData = JSON.parse(userIdResponse.data);
        
        if (!userIdData.results || userIdData.results.length === 0) {
            throw new Error(`User ${user} not found in Authentik`);
        }
        
        const userId = userIdData.results[0].pk;
        console.log('User ID: ' + userId);
        
        // Get TAK attributes
        let takCallsign = 'None';
        try {
            takCallsign = userIdData.results[0].attributes.takCallsign;
        } catch (e) {
            console.log('TAK Callsign not found, using default');
        } 
        console.log('TAK Callsign: ' + takCallsign);
        
        let takColor = 'None';
        try {
            takColor = userIdData.results[0].attributes.takColor;
        } catch (e) {
            console.log('TAK Color not found, using default');
        } 
        console.log('TAK Color: ' + takColor);
        
        let takRole = 'None';
        try {
            takRole = userIdData.results[0].attributes.takRole;
        } catch (e) {
            console.log('TAK Role not found, using default');
        } 
        console.log('TAK Role: ' + takRole);

        // Create enrollment token
        const requestData = {
            identifier: tokenIdentifier,
            intent: 'app_password',
            user: userId,
            description: 'ATAK/iTAK enrollment token',
            expires: tokenExpirationDate.toISOString(),
            expiring: true
        };

        await putApi(apiHost + '/api/v3/core/tokens/', requestData, requestHeaders);

        // Get the token key
        const appPasswordUrl = apiHost + '/api/v3/core/tokens/' + tokenIdentifier + '/view_key/';
        const app_password = await getApi(appPasswordUrl, requestHeaders);
        const tokenKey = JSON.parse(app_password.data).key;

        // Generate QR code
        const qrCodeData = 'tak://com.atakmap.app/enroll?host=' + takServer + '&username=' + user + '&token=' + tokenKey;
        const base64QRCode = await generateBase64QRCode(qrCodeData);

        // Prepare template data
        const data = {
            title: 'Device Enrollment',
            heading: 'TAK.NZ Device Enrollment',
            server: takServer,
            user: user,
            token: tokenKey,
            link: qrCodeData,
            qrcode: base64QRCode,
            expire: expireTimeInNZ,
            expire_utc: tokenExpirationDate.toISOString(),
            reenroll: reenrollTimeInNZ,
            hide_enrollment_link: hide_enrollment_link,
            takRole: takRole,
            takColor: takColor,
            takCallsign: takCallsign
        };
        
        // Read the template file
        const templatePath = path.join(__dirname, 'template.html');
        const template = fs.readFileSync(templatePath, 'utf8');
        
        // Render the template
        const renderedHTML = ejs.render(template, data);

        // Return the response
        return {
            statusCode: 200,
            isBase64Encoded: false,
            headers: {
                "Content-Type": "text/html"
            },
            body: renderedHTML,
        };
    }
    catch (e) {
        console.error('Error in handler:', e);
        return {
            statusCode: 500,
            body: 'Internal Server Error: ' + e.message,
            headers: { 'Content-Type': 'text/plain' }
        };
    }
};

// Get authentication token from Secrets Manager
async function getAuthToken() {
    try {
        const secretsManager = new SecretsManagerClient();
        const secretArn = process.env.AUTHENTIK_API_TOKEN_SECRET_ARN;
        
        if (!secretArn) {
            throw new Error('AUTHENTIK_API_TOKEN_SECRET_ARN environment variable is not set');
        }
        
        console.log('Getting Authentik API token from Secrets Manager');
        const command = new GetSecretValueCommand({ SecretId: secretArn });
        const response = await secretsManager.send(command);
        
        if (!response.SecretString) {
            throw new Error('Secret value is empty');
        }
        
        try {
            // Try to parse as JSON
            const secret = JSON.parse(response.SecretString);
            return secret.token || response.SecretString;
        } catch (e) {
            // If not valid JSON, use the raw string
            return response.SecretString;
        }
    } catch (error) {
        console.error('Error retrieving Authentik API token:', error);
        throw error;
    }
}

// HTTP GET request
async function getApi(url, headers) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
  
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data,
                    });
                } else {
                    reject({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data,
                    });
                }
            });
        });
  
        req.on('error', (error) => {
            reject(error);
        });
  
        req.end();
    });
}

// HTTP POST request
async function putApi(url, data, headers) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: headers,
        };
  
        const req = https.request(url, options, (res) => {
            let responseData = '';
  
            res.on('data', (chunk) => {
                responseData += chunk;
            });
  
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        statusCode: res.statusCode,
                        body: responseData,
                        headers: res.headers,
                    });olve({
                        statusCode: res.statusCode,
                        body: responseData,
                        headers: res.headers,
                    });
                } else {
                    reject(new Error(`Request failed with status code ${res.statusCode}: ${responseData}`));
                }
            });
        });
  
        req.on('error', (error) => {
            reject(error);
        });
  
        req.write(JSON.stringify(data));
        req.end();
    });
}

// Generate QR code
async function generateBase64QRCode(text) {
    try {
        const qrCodeDataURL = await QRCode.toDataURL(text);
        return qrCodeDataURL;
    } catch (error) {
        console.error("Error generating QR code:", error);
        throw error;
    }
}

// Generate random string
function generateRandomString(length) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}