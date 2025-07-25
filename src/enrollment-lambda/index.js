const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const https = require('https');
const crypto = require('crypto');
const QRCode = require('qrcode');
const ejs = require('ejs');
const path = require('path');

// Configuration constants
const CONFIG = {
  TOKEN_EXPIRATION_MINUTES: 30,
  REENROLL_DAYS: 365,
  FORM_SUBMIT_DELAY_MS: 500,
  DEFAULT_BRANDING: 'generic'
};

// Helper function declarations at the top for better readability
async function getAuthToken() {
  try {
    const secretsManager = new SecretsManagerClient();
    const secretArn = process.env.AUTHENTIK_API_TOKEN_SECRET_ARN;
    
    if (!secretArn) {
      throw new Error('AUTHENTIK_API_TOKEN_SECRET_ARN environment variable is not set');
    }
    
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
    console.error('Error retrieving Authentik API token');
    throw error;
  }
}

async function httpRequest(url, method, headers, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      port: urlObj.port || 443,
      method: method,
      headers: headers
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData,
          });
        } else {
          reject({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData,
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      const jsonData = JSON.stringify(data);
      req.write(jsonData);
    }
    req.end();
  });
}

async function getApi(url, headers) {
  try {
    return await httpRequest(url, 'GET', headers);
  } catch (error) {
    console.error(`GET request to ${url} failed:`, error.statusCode || error.message);
    throw error;
  }
}

async function postApi(url, data, headers) {
  try {
    return await httpRequest(url, 'POST', headers, data);
  } catch (error) {
    console.error(`POST request to ${url} failed:`, error.statusCode || error.message);
    throw error;
  }
}

async function generateBase64QRCode(text) {
  try {
    return await QRCode.toDataURL(text);
  } catch (error) {
    console.error("Error generating QR code");
    throw error;
  }
}

function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isTokenExpired(oidcData) {
  try {
    const decodedToken = JSON.parse(Buffer.from(oidcData.split('.')[1], 'base64').toString());
    const now = Math.floor(Date.now() / 1000);
    return decodedToken.exp < now;
  } catch (error) {
    console.error('Error validating token expiration:', error);
    return true; // Treat invalid tokens as expired
  }
}

function getCacheControlHeaders() {
  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  };
}

function getBrandingStrings(branding) {
  return {
    heading: branding === 'tak-nz' ? 'TAK.NZ Device Enrollment' : 'Device Enrollment',
    footer: branding === 'tak-nz' ? 'TAK.NZ &bull; Team Awareness &bull; Te m&#333;hio o te r&#333;p&#363;' : 'TAK - Team Awareness Kit'
  };
}

console.log('Loading enrollment function');

/**
 * Main Lambda handler function
 */
exports.handler = async (event, context) => {
    // Check if this is the initial request or the actual data request
    const isDataRequest = event.queryStringParameters && event.queryStringParameters.load === 'true';
    try {
        // Extract and validate OIDC data
        const oidcData = extractOidcData(event);
        if (!oidcData) {
            return {
                statusCode: 400,
                body: 'Bad Request: Missing OIDC authentication data',
                headers: { 'Content-Type': 'text/plain', ...getCacheControlHeaders() }
            };
        }
        
        // Check if token is expired
        if (isTokenExpired(oidcData)) {
            console.log('OIDC token expired, forcing re-authentication');
            return {
                statusCode: 302,
                headers: {
                    'Location': '/oauth2/idpresponse',
                    ...getCacheControlHeaders()
                }
            };
        }
        
        // Validate request path
        if (!isValidPath(event.path)) {
            return {
                statusCode: 404,
                body: 'Not Found',
                headers: { 'Content-Type': 'text/plain', ...getCacheControlHeaders() }
            };
        }
        
        // If this is the initial request, return the loading page immediately
        if (!isDataRequest) {
            return await handleInitialRequest();
        }
        
        // For data requests, continue with the full processing
        console.log('Data request - processing enrollment');
        
        // Process the enrollment request
        return await handleEnrollmentRequest(oidcData, event.headers);
    } catch (e) {
        console.error('Error in handler:', e);
        
        // Prepare error data for the template
        let errorMessage = 'An error occurred during enrollment';
        let errorDetails = 'Please try again later or contact support.';
        let statusCode = 500;
        
        // If the error is from an API call, include more details
        if (e.statusCode && e.data) {
            statusCode = e.statusCode;
            errorMessage = `API Error (${e.statusCode})`;
            try {
                // Try to parse the API error data for more details
                const errorData = JSON.parse(e.data);
                if (errorData.detail) {
                    errorDetails = errorData.detail;
                } else if (errorData.message) {
                    errorDetails = errorData.message;
                }
            } catch {
                errorDetails = 'Error communicating with authentication service';
            }
        } else if (e.message) {
            // Use the error message if available
            errorDetails = e.message;
        }
        
        try {
            // Get branding from environment variables
            const branding = process.env.BRANDING || CONFIG.DEFAULT_BRANDING;
            
            const errorPath = path.join(__dirname, 'views/error.ejs');
            
            const brandingStrings = getBrandingStrings(branding);
            const errorData = {
                title: 'Enrollment Error',
                ...brandingStrings,
                branding: branding,
                errorMessage: errorMessage,
                errorDetails: errorDetails
            };
            
            const renderedHTML = await ejs.renderFile(errorPath, errorData);
            
            return {
                statusCode: statusCode,
                isBase64Encoded: false,
                headers: {
                    "Content-Type": "text/html",
                    ...getCacheControlHeaders()
                },
                body: renderedHTML,
            };
        } catch (renderError) {
            // Fallback if rendering the error page fails
            console.error('Error rendering error page:', renderError);
            return {
                statusCode: 500,
                body: 'Internal Server Error: ' + e.message,
                headers: { 'Content-Type': 'text/plain', ...getCacheControlHeaders() }
            };
        }
    }
};

/**
 * Extract OIDC data from the event
 */
function extractOidcData(event) {
    return event.headers ? event.headers['x-amzn-oidc-data'] : null;
}

/**
 * Validate if the request path is supported
 */
function isValidPath(path) {
    return path === '/' || path === undefined || path === '/oauth2/idpresponse';
}

/**
 * Handle the initial request by returning a loading page
 */
async function handleInitialRequest() {
    console.log('Initial request - returning loading page');
    
    // Get branding from environment variables
    const branding = process.env.BRANDING || CONFIG.DEFAULT_BRANDING;
    
    const loaderPath = path.join(__dirname, 'views/loader.ejs');
    
    const brandingStrings = getBrandingStrings(branding);
    const loadingData = {
        title: 'Loading Enrollment',
        ...brandingStrings,
        branding: branding
    };
    
    try {
        const renderedHTML = await ejs.renderFile(loaderPath, loadingData);
        
        return {
            statusCode: 200,
            isBase64Encoded: false,
            headers: {
                "Content-Type": "text/html",
                ...getCacheControlHeaders()
            },
            body: renderedHTML,
        };
    } catch (error) {
        console.error('Error rendering loading page');
        throw error;
    }
}

/**
 * Handle the enrollment request
 */
async function handleEnrollmentRequest(oidcData, headers) {
    // Get configuration from environment variables
    const takServer = process.env.TAK_SERVER_DOMAIN;
    const apiHost = process.env.AUTHENTIK_API_ENDPOINT;
    const branding = process.env.BRANDING || CONFIG.DEFAULT_BRANDING;
    
    if (!takServer || !apiHost) {
        throw new Error('Missing required environment variables');
    }
    
    // Get the auth token from Secrets Manager
    const auth_token = await getAuthToken();
    
    // Extract user information from the OIDC token
    const decodedToken = JSON.parse(Buffer.from(
        oidcData.split('.')[1], 
        'base64'
    ).toString());
    
    const device_platform = headers['sec-ch-ua-platform'];
    const user = decodedToken.preferred_username || decodedToken.email;
    
    const randomString = generateRandomString(16);
    const now = new Date();
    const tokenExpirationDate = new Date(now.getTime() + CONFIG.TOKEN_EXPIRATION_MINUTES * 60 * 1000);
    const reEnrollDate = new Date(now.getTime() + CONFIG.REENROLL_DAYS * 24 * 60 * 60 * 1000);

    // Hide enrollment link on non-Android devices
    const hide_enrollment_link = device_platform !== '"Android"' ? ' hidden ' : '';

    const dateOptions = {
        timeZone: 'Pacific/Auckland',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    const expireTimeInNZ = tokenExpirationDate.toLocaleTimeString('en-NZ', dateOptions);
    
    // Format reenroll time based on branding
    const reenrollTime = branding === 'tak-nz' 
        ? reEnrollDate.toLocaleTimeString('en-NZ', dateOptions) + ' NZT'
        : reEnrollDate.toLocaleTimeString('en-US', { timeZone: 'UTC', ...dateOptions }) + ' UTC';

    const tokenIdentifier = `TAK-Enrollment-${user.replace(/[@.]/g, "-")}-${randomString}`;

    const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth_token}`, 
    };
    
    // Get user ID from Authentik
    const apiHostNormalized = apiHost.endsWith('/') ? apiHost.slice(0, -1) : apiHost;
    const userUrl = `${apiHostNormalized}/api/v3/core/users/?username=${encodeURIComponent(user)}`;
    
    const userIdResponse = await getApi(userUrl, requestHeaders);
    const userIdData = JSON.parse(userIdResponse.data);
        
    if (!userIdData.results || userIdData.results.length === 0) {
        throw new Error(`User ${user} not found in Authentik`);
    }
    
    const userId = userIdData.results[0].pk;
    
    // Extract TAK attributes with default fallbacks
    const userData = userIdData.results[0];
    const userAttributes = userData.attributes || {};
    
    const takAttributes = {
        takCallsign: extractAttribute(userAttributes, 'takCallsign'),
        takColor: extractAttribute(userAttributes, 'takColor'),
        takRole: extractAttribute(userAttributes, 'takRole')
    };
    
    // Create enrollment token
    const requestData = {
        identifier: tokenIdentifier,
        intent: 'app_password',
        user: userId,
        description: 'ATAK enrollment token',
        expires: tokenExpirationDate.toISOString(),
        expiring: true
    };

    const tokenUrl = `${apiHostNormalized}/api/v3/core/tokens/`;
    await postApi(tokenUrl, requestData, requestHeaders);

    // Get the token key
    const appPasswordUrl = `${apiHostNormalized}/api/v3/core/tokens/${tokenIdentifier}/view_key/`;
    const app_password = await getApi(appPasswordUrl, requestHeaders);
    const tokenKey = JSON.parse(app_password.data).key;

    // Generate QR codes in parallel
    const ATAKqrCodeData = `tak://com.atakmap.app/enroll?host=${takServer}&username=${user}&token=${tokenKey}`;
    const iTAKqrCodeData = `${takServer},${takServer}8089,ssl`;
    
    const [ATAKbase64QRCode, iTAKbase64QRCode] = await Promise.all([
        generateBase64QRCode(ATAKqrCodeData),
        generateBase64QRCode(iTAKqrCodeData)
    ]);

    // Prepare template data
    const brandingStrings = getBrandingStrings(branding);
    const data = {
        title: 'Device Enrollment',
        ...brandingStrings,
        branding: branding,
        server: takServer,
        user: user,
        token: tokenKey,
        link: ATAKqrCodeData,
        atakQrcode: ATAKbase64QRCode,
        itakQrcode: iTAKbase64QRCode,
        expire: expireTimeInNZ,
        expire_utc: tokenExpirationDate.toISOString(),
        reenroll: reenrollTime,
        hide_enrollment_link: hide_enrollment_link,
        takRole: takAttributes.takRole,
        takColor: takAttributes.takColor,
        takCallsign: takAttributes.takCallsign,
        customScripts: generateCountdownScript(tokenExpirationDate.toISOString())
    };
    
    // Use the content.ejs template
    const contentPath = path.join(__dirname, 'views/content.ejs');
    
    try {
        // Render the final HTML
        const renderedHTML = await ejs.renderFile(contentPath, data);

        // Return the response
        return {
            statusCode: 200,
            isBase64Encoded: false,
            headers: {
                "Content-Type": "text/html",
                ...getCacheControlHeaders()
            },
            body: renderedHTML,
        };
    } catch (error) {
        console.error('Error rendering enrollment page');
        throw error;
    }
}

/**
 * Extract an attribute with a default fallback
 */
function extractAttribute(attributes, attributeName, defaultValue = 'None') {
    try {
        const value = attributes[attributeName];
        return (value === undefined || value === 'undefined' || value === null) ? defaultValue : value;
    } catch (e) {
        console.error(`Error extracting attribute ${attributeName}:`, e.message);
        return defaultValue;
    }
}

/**
 * Generate the countdown timer script
 */
function generateCountdownScript(expirationTime) {
    return `
        // Set the date we're counting down to
        var countDownDate = new Date("${expirationTime}").getTime();

        // Update the count down every 1 second
        var x = setInterval(function() {
            // Get today's date and time
            var now = new Date().getTime();
            
            // Find the distance between now and the count down date
            var distance = countDownDate - now;
            
            // Time calculations for minutes and seconds
            var minutes = String(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
            var seconds = String(Math.floor((distance % (1000 * 60)) / 1000)).padStart(2, '0');
            
            // Output the result in an element with id="timer"
            document.getElementById("timer").innerHTML = minutes + " : " + seconds;
            
            // If the count down is over, write some text 
            if (distance < 0) {
                clearInterval(x);
                document.getElementById("timer").innerHTML = "EXPIRED";
                document.getElementById("enroll_link").innerHTML = "Enrollment link EXPIRED";
            }
        }, 1000);
    `;
}