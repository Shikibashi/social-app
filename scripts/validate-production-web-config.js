const EXPECTED_PUBLIC_WEB_ORIGIN = 'https://plumblines.uk'
const EXPECTED_ACCOUNT_SERVICE = 'https://plumblines.uk'

/**
 * Read a public build variable without loading a developer's local dotenv
 * files. Production release configuration must be supplied by the release
 * environment so a stale local value cannot silently select a provider.
 *
 * @param {string} name
 * @returns {string | undefined}
 */
function readEnv(name) {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

/**
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = readEnv(name)
  if (!value) {
    throw new Error(`Production web builds must set ${name}`)
  }
  return value
}

/**
 * @param {string} name
 * @param {string} value
 * @param {string} expected
 */
function assertExpectedOrigin(name, value, expected) {
  if (value !== expected) {
    throw new Error(
      `Production web builds must use ${expected} as ${name}; received ${value}`,
    )
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(
      `Production web builds must use a valid HTTPS URL for ${name}`,
    )
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.pathname !== '/' ||
    parsed.search
  ) {
    throw new Error(
      `Production web builds must use an HTTPS origin for ${name}`,
    )
  }
}

/**
 * @param {string} name
 * @param {string} value
 */
function assertHttpsEndpoint(name, value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(
      `Production web builds must use a valid HTTPS URL for ${name}`,
    )
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1' ||
    parsed.hostname.endsWith('.invalid')
  ) {
    throw new Error(
      `Production web builds must use a public HTTPS endpoint for ${name}`,
    )
  }
}

/**
 * @param {string} name
 * @param {string} value
 */
function assertDid(name, value) {
  if (!/^did:[a-z0-9]+:[^\s/]+$/i.test(value)) {
    throw new Error(
      `Production web builds must configure a valid DID for ${name}`,
    )
  }
}

/**
 * @param {string} name
 * @param {string} value
 */
function assertBinaryFlag(name, value) {
  if (value !== '0' && value !== '1') {
    throw new Error(`Production web builds must set ${name} to 0 or 1`)
  }
}

/**
 * Validate the public values that are compiled into a production web bundle.
 * These values are not secrets. They identify the user-facing origin and the
 * replaceable public providers that the bundle is allowed to use.
 */
function assertProductionPublicWebConfig() {
  if (readEnv('EXPO_PUBLIC_ENV') !== 'production') return

  assertExpectedOrigin(
    'EXPO_PUBLIC_PUBLIC_WEB_ORIGIN',
    requireEnv('EXPO_PUBLIC_PUBLIC_WEB_ORIGIN'),
    EXPECTED_PUBLIC_WEB_ORIGIN,
  )
  assertExpectedOrigin(
    'EXPO_PUBLIC_ACCOUNT_SERVICE',
    requireEnv('EXPO_PUBLIC_ACCOUNT_SERVICE'),
    EXPECTED_ACCOUNT_SERVICE,
  )

  const appViewEndpoint = requireEnv('EXPO_PUBLIC_PUBLIC_APPVIEW_URL')
  assertHttpsEndpoint('EXPO_PUBLIC_PUBLIC_APPVIEW_URL', appViewEndpoint)
  const appViewDid = requireEnv('EXPO_PUBLIC_APPVIEW_SERVICE_DID')
  assertDid('EXPO_PUBLIC_APPVIEW_SERVICE_DID', appViewDid)
  requireEnv('EXPO_PUBLIC_APPVIEW_SERVICE_FRAGMENT')

  const defaultFeedOwner = requireEnv('EXPO_PUBLIC_DEFAULT_FEED_OWNER_DID')
  assertDid('EXPO_PUBLIC_DEFAULT_FEED_OWNER_DID', defaultFeedOwner)
  const defaultFeedRkey = requireEnv('EXPO_PUBLIC_DEFAULT_FEED_RKEY')
  if (!/^[A-Za-z0-9._~:-]+$/.test(defaultFeedRkey)) {
    throw new Error(
      'Production web builds must configure a valid EXPO_PUBLIC_DEFAULT_FEED_RKEY',
    )
  }

  const spacesEnabled = requireEnv('EXPO_PUBLIC_SPACES_ALPHA_ENABLED')
  const spacesProductionEnabled = requireEnv(
    'EXPO_PUBLIC_SPACES_ALPHA_PRODUCTION_ENABLED',
  )
  assertBinaryFlag('EXPO_PUBLIC_SPACES_ALPHA_ENABLED', spacesEnabled)
  assertBinaryFlag(
    'EXPO_PUBLIC_SPACES_ALPHA_PRODUCTION_ENABLED',
    spacesProductionEnabled,
  )
  if (spacesEnabled === '1' && spacesProductionEnabled !== '1') {
    throw new Error(
      'Production web builds must acknowledge EXPO_PUBLIC_SPACES_ALPHA_PRODUCTION_ENABLED=1 when Communities is enabled',
    )
  }
}

if (require.main === module) {
  assertProductionPublicWebConfig()
  console.log('Production public web configuration passed')
}

module.exports = {assertProductionPublicWebConfig}
