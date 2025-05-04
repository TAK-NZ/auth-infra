#!/usr/bin/env sh
# This script expects the following environment variables:
# AUTHENTIK_API_TOKEN - An API token to authenticate to the Authentik API with
# AUTHTENTIK_HOST - The base URL of the Authentik API
# OUTPOST_NAME - Exact name of the Outpost to fetch the token for
# AUTHENTIK_INSECURE - Whether to skip verification of Authentik API SSL certificate

inscureArg=""
if [ "${AUTHENTIK_INSECURE}" = "true" ]; then
  insecureArg="--insecure"
fi

# Fetch outpost instances from API
outpostInstances=$(curl ${insecureArg} -s --get --data-urlencode "name__iexact=${OUTPOST_NAME}" -L "${AUTHENTIK_HOST}/api/v3/outposts/instances/" -H 'Accept: application/json' -H "Authorization: Bearer ${AUTHENTIK_API_TOKEN}")

# Check if we found the outpost
# Since the search was for the exact name, only 0 or 1 results should ever be returned
numberOfResults=$(echo "${outpostInstances}" | jq -r '.results | length')

if [ ${numberOfResults} -eq 0 ]; then
  echo "Outpost with name ${OUTPOST_NAME} not found, aborting..."
  exit 1
fi
# Extract the token identifier
tokenIdentifier=$(echo  "${outpostInstances}" | jq -r --arg outpost_name "${OUTPOST_NAME}" '.results[] | select(.name == $outpost_name) | .token_identifier')
# Sanity check, should not happen
if [ -z "${tokenIdentifier}" ]; then
  echo "Token identifier for outpost ${OUTPOST_NAME} not found, aborting..."
  exit 1
fi

# Fetch the token
viewKeyResult=$(curl ${insecureArg} -s -L "${AUTHENTIK_HOST}/api/v3/core/tokens/${tokenIdentifier}/view_key/" -H 'Accept: application/json' -H "Authorization: Bearer ${AUTHENTIK_API_TOKEN}")
outpostToken=$(echo "${viewKeyResult}" | jq -r '.key')
# Sanity check
if [ -z "${outpostToken}" ]; then
  echo "Token for outpost ${OUTPOST_NAME} not found, aborting..."
  exit 1
fi

echo $outpostToken