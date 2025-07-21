const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const https = require('https');
const crypto = require('crypto');
const QRCode = require('qrcode');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

console.log('Loading enrollment function');

exports.handler = async (event, context) => {
    // Check if this is the initial request or the actual data request
    const isDataRequest = event.queryStringParameters && event.queryStringParameters.load === 'true' && event.httpMethod === 'POST';
    try {
        console.log('Event: ' + JSON.stringify(event));
        console.log('Headers: ' + JSON.stringify(event.headers || {}));
        
        // Check if this is an ALB request with OIDC authentication
        let oidcData = event.headers ? event.headers['x-amzn-oidc-data'] : null;
        
        // For POST requests, also check the body for OIDC data
        if (!oidcData && event.httpMethod === 'POST' && event.body) {
            try {
                // Try to parse the body as form data
                const formData = new URLSearchParams(event.body);
                oidcData = formData.get('x-amzn-oidc-data');
                
                // If we found OIDC data in the body, add it to the headers for later use
                if (oidcData) {
                    event.headers = event.headers || {};
                    event.headers['x-amzn-oidc-data'] = oidcData;
                }
            } catch (e) {
                console.error('Error parsing form data:', e);
            }
        }
        
        if (!oidcData) {
            console.error('Missing OIDC data in request');
            return {
                statusCode: 400,
                body: 'Bad Request: Missing OIDC authentication data',
                headers: { 'Content-Type': 'text/plain' }
            };
        }
        
        // Accept requests to root path or the OAuth2 callback path
        if (event.path !== '/' && event.path !== undefined && event.path !== '/oauth2/idpresponse') {
            console.log('Request not for a supported path: ' + event.path);
            return {
                statusCode: 404,
                body: 'Not Found',
                headers: { 'Content-Type': 'text/plain' }
            };
        }
        
        // If this is the initial request, return the loading page immediately
        if (!isDataRequest) {
            console.log('Initial request - returning loading page');
            
            // Get branding from environment variables
            const branding = process.env.BRANDING || 'generic';
            
            // Store the OIDC data for the second request
            const oidcData = event.headers['x-amzn-oidc-data'];
            
            const loaderPath = path.join(__dirname, 'views/loader.ejs');
            
            const loadingData = {
                title: 'Loading Enrollment',
                heading: branding === 'tak-nz' ? 'TAK.NZ Device Enrollment' : 'Device Enrollment',
                branding: branding,
                oidcData: oidcData,
                customScripts: `
                    // Immediately execute when DOM is ready
                    document.addEventListener('DOMContentLoaded', function() {
                        console.log('DOM loaded, submitting form...');
                        
                        // Get the OIDC data directly from the variable passed to the template
                        const oidcData = '${oidcData}';
                        
                        if (oidcData) {
                            // Create a form to submit the OIDC data
                            const form = document.createElement('form');
                            form.method = 'POST';
                            form.action = window.location.href + '?load=true';
                            
                            // Add the OIDC data as a hidden field
                            const input = document.createElement('input');
                            input.type = 'hidden';
                            input.name = 'x-amzn-oidc-data';
                            input.value = oidcData;
                            form.appendChild(input);
                            
                            // Add the form to the document and submit it
                            document.body.appendChild(form);
                            setTimeout(function() {
                                form.submit();
                            }, 500); // Small delay to ensure DOM is fully ready
                        } else {
                            console.error('No OIDC data found');
                            document.querySelector('.loading-container p').textContent = 'Error: Authentication data not found';
                        }
                    });
                `
            };
            
            const renderedHTML = ejs.renderFile(loaderPath, loadingData, { async: false });
            
            return {
                statusCode: 200,
                isBase64Encoded: false,
                headers: {
                    "Content-Type": "text/html"
                },
                body: await renderedHTML,
            };
        }
        
        // For data requests, continue with the full processing
        console.log('Data request - processing enrollment');
        console.log('HTTP Method:', event.httpMethod);
        console.log('Query Parameters:', JSON.stringify(event.queryStringParameters));
        console.log('Headers:', JSON.stringify(event.headers));

        // Get configuration from environment variables
        const takServer = process.env.TAK_SERVER_DOMAIN;
        const apiHost = process.env.AUTHENTIK_API_ENDPOINT;
        const branding = process.env.BRANDING || 'generic';
        
        console.log('TAK Server Domain:', takServer);
        console.log('Authentik API Endpoint:', apiHost);
        console.log('Branding:', branding);
        
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
        // Ensure apiHost doesn't end with a slash
        const apiHostNormalized = apiHost.endsWith('/') ? apiHost.slice(0, -1) : apiHost;
        const userUrl = `${apiHostNormalized}/api/v3/core/users/?username=${encodeURIComponent(user)}`;
        console.log('User API URL:', userUrl);
        
        const userIdResponse = await getApi(userUrl, requestHeaders);
        console.log('User API Response Status:', userIdResponse.statusCode);
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
            if (takCallsign === 'undefined') takCallsign = 'None';
        } catch (e) {
            console.log('TAK Callsign not found, using default');
            takCallsign = 'None';
        } 
        console.log('TAK Callsign: ' + takCallsign);
        
        let takColor = 'None';
        try {
            takColor = userIdData.results[0].attributes.takColor;
            if (takColor === 'undefined') takColor = 'None';
        } catch (e) {
            console.log('TAK Color not found, using default');
            takColor = 'None';
        } 
        console.log('TAK Color: ' + takColor);
        
        let takRole = 'None';
        try {
            takRole = userIdData.results[0].attributes.takRole;
            if (takRole === 'undefined') takRole = 'None';
        } catch (e) {
            console.log('TAK Role not found, using default');
            takRole = 'None';
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

        const tokenUrl = `${apiHostNormalized}/api/v3/core/tokens/`;
        console.log('Token API URL:', tokenUrl);
        await putApi(tokenUrl, requestData, requestHeaders);

        // Get the token key
        const appPasswordUrl = `${apiHostNormalized}/api/v3/core/tokens/${tokenIdentifier}/view_key/`;
        console.log('App Password API URL:', appPasswordUrl);
        const app_password = await getApi(appPasswordUrl, requestHeaders);
        const tokenKey = JSON.parse(app_password.data).key;

        // Generate QR code
        const qrCodeData = 'tak://com.atakmap.app/enroll?host=' + takServer + '&username=' + user + '&token=' + tokenKey;
        const base64QRCode = await generateBase64QRCode(qrCodeData);

        // Prepare template data
        const data = {
            title: 'Device Enrollment',
            heading: branding === 'tak-nz' ? 'TAK.NZ Device Enrollment' : 'Device Enrollment',
            branding: branding,
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
        
        // Add countdown timer script to data
        data.customScripts = `
            // Set the date we're counting down to
            var countDownDate = new Date("${data.expire_utc}").getTime();

            // Update the count down every 1 second
            var x = setInterval(function() {
                // Get today's date and time
                var now = new Date().getTime();
                
                // Find the distance between now and the count down date
                var distance = countDownDate - now;
                
                // Time calculations for days, hours, minutes and seconds
                var days = String(Math.floor(distance / (1000 * 60 * 60 * 24))).padStart(2, '0');
                var hours = String(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
                var minutes = String(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
                var seconds = String(Math.floor((distance % (1000 * 60)) / 1000)).padStart(2, '0');
                
                // Output the result in an element with id="timer"
                document.getElementById("timer").innerHTML =  minutes + " : " + seconds;
                
                // If the count down is over, write some text 
                if (distance < 0) {
                    clearInterval(x);
                    document.getElementById("timer").innerHTML = "EXPIRED";
                    document.getElementById("enroll_link").innerHTML = "Enrollment link EXPIRED";
                }
            }, 1000);
        `;
        
        // Use the content.ejs template
        const contentPath = path.join(__dirname, 'views/content.ejs');
        
        // Render the final HTML - use sync rendering to avoid Promise issues
        const renderedHTML = ejs.renderFile(contentPath, data, { async: false });

        // Return the response
        return {
            statusCode: 200,
            isBase64Encoded: false,
            headers: {
                "Content-Type": "text/html"
            },
            body: await renderedHTML,
        };
    }
    catch (e) {
        console.error('Error in handler:', e);
        
        // If the error is from an API call, include more details
        if (e.statusCode && e.data) {
            console.error(`API Error Status: ${e.statusCode}`);
            console.error(`API Error Data: ${e.data}`);
            return {
                statusCode: e.statusCode,
                body: `API Error: ${e.statusCode}\n${e.data}`,
                headers: { 'Content-Type': 'text/plain' }
            };
        }
        
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
        console.log(`Making GET request to: ${url}`);
        console.log('Headers:', JSON.stringify(headers));
        
        // Parse the URL to extract hostname and path
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            port: urlObj.port || 443,
            method: 'GET',
            headers: headers
        };
        
        console.log('Request options:', JSON.stringify(options));
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
  
            res.on('end', () => {
                console.log(`Response status: ${res.statusCode}`);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data,
                    });
                } else {
                    console.error(`API Error: ${res.statusCode}`);
                    console.error(`Response data: ${data}`);
                    reject({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data,
                    });
                }
            });
        });
  
        req.on('error', (error) => {
            console.error(`Request error: ${error.message}`);
            reject(error);
        });
  
        req.end();
    });
}

// HTTP POST request
async function putApi(url, data, headers) {
    return new Promise((resolve, reject) => {
        console.log(`Making POST request to: ${url}`);
        console.log('Request data:', JSON.stringify(data));
        console.log('Headers:', JSON.stringify(headers));
        
        // Parse the URL to extract hostname and path
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            port: urlObj.port || 443,
            method: 'POST',
            headers: headers
        };
        
        console.log('Request options:', JSON.stringify(options));
        
        const req = https.request(options, (res) => {
            let responseData = '';
  
            res.on('data', (chunk) => {
                responseData += chunk;
            });
  
            res.on('end', () => {
                console.log(`Response status: ${res.statusCode}`);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({
                        statusCode: res.statusCode,
                        body: responseData,
                        headers: res.headers,
                    });
                } else {
                    console.error(`API Error: ${res.statusCode}`);
                    console.error(`Response data: ${responseData}`);
                    reject(new Error(`Request failed with status code ${res.statusCode}: ${responseData}`));
                }
            });
        });
  
        req.on('error', (error) => {
            console.error(`Request error: ${error.message}`);
            reject(error);
        });
  
        const jsonData = JSON.stringify(data);
        req.write(jsonData);
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