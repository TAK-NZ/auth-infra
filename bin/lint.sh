echo 'Running eslint ...'
eslint *.js cloudformation/
echo 'Running cfn-lint ...'
npx deploy json | jq | cfn-lint