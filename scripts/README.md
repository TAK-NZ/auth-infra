# Development Scripts

This directory contains utility scripts for development and testing.

## toggle-bundling.sh

This script toggles between development and test modes for Lambda bundling.

### Usage

```bash
# Enable bundling for development/deployment
./toggle-bundling.sh dev

# Disable bundling for tests
./toggle-bundling.sh test
```

### Why is this needed?

When running tests, the CDK attempts to bundle Lambda functions using Docker, which can cause issues in certain environments (like CI/CD pipelines or when Docker is not available). This script allows you to disable bundling during tests and re-enable it for actual deployments.

### NPM Scripts

The following npm scripts are available:

- `npm run bundling:enable` - Enable bundling for development/deployment
- `npm run bundling:disable` - Disable bundling for tests

All test commands automatically disable bundling before running tests and re-enable it afterward:

- `npm run test` - Run all tests
- `npm run test:unit` - Run unit tests
- `npm run test:integration` - Run integration tests
- `npm run test:validation` - Run validation tests
- `npm run test:coverage` - Run all tests with coverage
- `npm run test:coverage:unit` - Run unit tests with coverage