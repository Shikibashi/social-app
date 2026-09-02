/* oxlint-disable import/no-nodejs-modules -- This file runs only under Node's test runner. */

const assert = require('node:assert/strict')
const {spawnSync} = require('node:child_process')
const test = require('node:test')
const path = require('node:path')

const validator = path.join(__dirname, 'validate-production-web-config.js')

function runValidator(overrides) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith('EXPO_PUBLIC_'),
    ),
  )
  const result = spawnSync(process.execPath, [validator], {
    env: {...environment, ...overrides},
    encoding: 'utf8',
  })
  return result
}

void test('production validation fails when the public provider configuration is absent', () => {
  const result = runValidator({EXPO_PUBLIC_ENV: 'production'})

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /EXPO_PUBLIC_PUBLIC_WEB_ORIGIN/)
})

void test('production validation requires the Spaces production acknowledgement when enabled', () => {
  const result = runValidator({
    EXPO_PUBLIC_ENV: 'production',
    EXPO_PUBLIC_PUBLIC_WEB_ORIGIN: 'https://plumblines.uk',
    EXPO_PUBLIC_ACCOUNT_SERVICE: 'https://plumblines.uk',
    EXPO_PUBLIC_PUBLIC_APPVIEW_URL: 'https://api.bsky.app',
    EXPO_PUBLIC_APPVIEW_SERVICE_DID: 'did:web:api.bsky.app',
    EXPO_PUBLIC_APPVIEW_SERVICE_FRAGMENT: 'bsky_appview',
    EXPO_PUBLIC_DEFAULT_FEED_OWNER_DID: 'did:plc:z72i7hdynmk6r22z27h6tvur',
    EXPO_PUBLIC_DEFAULT_FEED_RKEY: 'whats-hot',
    EXPO_PUBLIC_SPACES_ALPHA_ENABLED: '1',
    EXPO_PUBLIC_SPACES_ALPHA_PRODUCTION_ENABLED: '0',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /SPACES_ALPHA_PRODUCTION_ENABLED=1/)
})

void test('production validation accepts the reviewed public configuration', () => {
  const result = runValidator({
    EXPO_PUBLIC_ENV: 'production',
    EXPO_PUBLIC_PUBLIC_WEB_ORIGIN: 'https://plumblines.uk',
    EXPO_PUBLIC_ACCOUNT_SERVICE: 'https://plumblines.uk',
    EXPO_PUBLIC_PUBLIC_APPVIEW_URL: 'https://api.bsky.app',
    EXPO_PUBLIC_APPVIEW_SERVICE_DID: 'did:web:api.bsky.app',
    EXPO_PUBLIC_APPVIEW_SERVICE_FRAGMENT: 'bsky_appview',
    EXPO_PUBLIC_DEFAULT_FEED_OWNER_DID: 'did:plc:z72i7hdynmk6r22z27h6tvur',
    EXPO_PUBLIC_DEFAULT_FEED_RKEY: 'whats-hot',
    EXPO_PUBLIC_SPACES_ALPHA_ENABLED: '1',
    EXPO_PUBLIC_SPACES_ALPHA_PRODUCTION_ENABLED: '1',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Production public web configuration passed/)
})
