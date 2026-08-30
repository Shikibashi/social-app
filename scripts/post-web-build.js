const path = require('path')
const fs = require('fs')

const projectRoot = path.join(__dirname, '..')
const expectedPublicWebOrigin = 'https://plumblines.uk'
const expectedAccountService = 'https://plumblines.uk'
const isProductionBuild = process.env.EXPO_PUBLIC_ENV === 'production'

/**
 * @param {string} name
 * @returns {string | undefined}
 */
function readEnv(name) {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : undefined
}

/**
 * @param {string} name
 * @returns {string | undefined}
 */
function readProjectEnvValue(name) {
  const fromProcess = readEnv(name)
  if (fromProcess) return fromProcess

  for (const filename of ['.env.local', '.env']) {
    const file = path.join(projectRoot, filename)
    if (!fs.existsSync(file)) continue
    const line = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find(entry => entry.trim().startsWith(`${name}=`))
    if (!line) continue
    const value = line.slice(line.indexOf('=') + 1).trim()
    if (value) return value
  }

  return undefined
}

if (isProductionBuild) {
  const configuredPublicWebOrigin =
    readEnv('EXPO_PUBLIC_PUBLIC_WEB_ORIGIN') || expectedPublicWebOrigin
  if (configuredPublicWebOrigin !== expectedPublicWebOrigin) {
    throw new Error(
      `Production web builds must use ${expectedPublicWebOrigin} as EXPO_PUBLIC_PUBLIC_WEB_ORIGIN; received ${configuredPublicWebOrigin}`,
    )
  }
  const configuredAccountService =
    readEnv('EXPO_PUBLIC_ACCOUNT_SERVICE') || expectedAccountService
  if (configuredAccountService !== expectedAccountService) {
    throw new Error(
      `Production web builds must use ${expectedAccountService} as EXPO_PUBLIC_ACCOUNT_SERVICE; received ${configuredAccountService}`,
    )
  }

  const configuredDefaultFeedOwner = readProjectEnvValue(
    'EXPO_PUBLIC_DEFAULT_FEED_OWNER_DID',
  )
  const configuredDefaultFeedRkey = readProjectEnvValue(
    'EXPO_PUBLIC_DEFAULT_FEED_RKEY',
  )
  if (!configuredDefaultFeedOwner || !configuredDefaultFeedRkey) {
    throw new Error(
      'Production web builds must configure EXPO_PUBLIC_DEFAULT_FEED_OWNER_DID and EXPO_PUBLIC_DEFAULT_FEED_RKEY',
    )
  }
}

const templateFile = path.join(
  projectRoot,
  'bskyweb',
  'templates',
  'scripts.html',
)

/** @type {{entrypoints: string[]}} */
const assetManifest = require(
  path.join(projectRoot, 'web-build/asset-manifest.json'),
)
const {entrypoints} = assetManifest

// Expo emits entrypoint URLs without a leading slash. That works after
// client-side navigation, but a direct request to a nested route such as
// /settings/personalization resolves `static/js/...` relative to that route
// and receives the SPA shell instead of JavaScript from a static host.
const indexFile = path.join(projectRoot, 'web-build', 'index.html')
const indexHtml = fs.readFileSync(indexFile, 'utf8')
const rootRelativeIndexHtml = indexHtml.replace(
  /((?:src|href)=")(?!(?:\/|[a-z][a-z0-9+.-]*:|#))([^"]+)(")/gi,
  (_, prefix, value, suffix) => `${prefix}/${value}${suffix}`,
)
if (rootRelativeIndexHtml !== indexHtml) {
  fs.writeFileSync(indexFile, rootRelativeIndexHtml)
  console.log(`Normalized static asset URLs in ${indexFile}`)
}

// Expo's web exporter does not copy this repository's public/ directory. The
// OAuth client-id metadata document is therefore copied explicitly so the
// discoverable HTTPS client ID remains bound to the deployed artifact.
const oauthMetadataSource = path.join(
  projectRoot,
  'public/oauth-client-metadata.json',
)
const oauthMetadataTarget = path.join(
  projectRoot,
  'web-build/oauth-client-metadata.json',
)
if (fs.existsSync(oauthMetadataSource)) {
  fs.copyFileSync(oauthMetadataSource, oauthMetadataTarget)
  console.log(`Copied ${oauthMetadataSource} to ${oauthMetadataTarget}`)

  if (isProductionBuild) {
    /** @type {{client_id?: string, client_uri?: string, redirect_uris?: string[]}} */
    const metadata = JSON.parse(fs.readFileSync(oauthMetadataTarget, 'utf8'))
    const expectedClientId = `${expectedPublicWebOrigin}/oauth-client-metadata.json`
    const expectedCallback = `${expectedPublicWebOrigin}/oauth/callback`
    if (
      metadata.client_id !== expectedClientId ||
      metadata.client_uri !== expectedPublicWebOrigin ||
      metadata.redirect_uris?.[0] !== expectedCallback
    ) {
      throw new Error(
        `Production OAuth metadata must be bound to ${expectedPublicWebOrigin}`,
      )
    }
  }
}

// Cloudflare Pages only applies response headers when the generated export
// contains a root-level `_headers` file. Keep the repository's shared header
// policy in the deployed artifact so the public alpha uses the same CSP and
// privacy headers as the checked-in deployment contract.
const headersSource = path.join(projectRoot, '../../deploy/static-headers')
const headersTarget = path.join(projectRoot, 'web-build/_headers')
if (fs.existsSync(headersSource)) {
  fs.copyFileSync(headersSource, headersTarget)
  console.log(`Copied ${headersSource} to ${headersTarget}`)
}

// Expo's exporter does not copy public/ static files. Keep the Plumbline web
// identity available at stable root URLs for browser tabs, install prompts,
// and the server-rendered bskyweb shell.
const publicBrandFiles = [
  ['public/plumbline-mark.svg', 'web-build/plumbline-mark.svg'],
  ['public/favicon.ico', 'web-build/favicon.ico'],
  ['public/favicon-16.png', 'web-build/favicon-16.png'],
  ['public/favicon-32.png', 'web-build/favicon-32.png'],
  ['public/apple-touch-icon.png', 'web-build/apple-touch-icon.png'],
  ['public/safari-pinned-tab.svg', 'web-build/safari-pinned-tab.svg'],
  [
    'public/social-card-default.png',
    'web-build/static/social-card-default.png',
  ],
  [
    'public/social-card-default-gradient.png',
    'web-build/static/social-card-default-gradient.png',
  ],
]

for (const [source, target] of publicBrandFiles) {
  const sourcePath = path.join(projectRoot, source)
  const targetPath = path.join(projectRoot, target)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing required Plumbline web asset: ${sourcePath}`)
  }
  fs.copyFileSync(sourcePath, targetPath)
  console.log(`Copied ${sourcePath} to ${targetPath}`)
}

const serverBrandFiles = [
  ['public/plumbline-mark.svg', 'bskyweb/static/plumbline-mark.svg'],
  ['public/apple-touch-icon.png', 'bskyweb/static/apple-touch-icon.png'],
  ['public/favicon-32.png', 'bskyweb/static/favicon-32x32.png'],
  ['public/favicon-16.png', 'bskyweb/static/favicon-16x16.png'],
  ['assets/plumbline/plumbline-icon.png', 'bskyweb/static/favicon.png'],
  ['public/safari-pinned-tab.svg', 'bskyweb/static/safari-pinned-tab.svg'],
  ['public/social-card-default.png', 'bskyweb/static/social-card-default.png'],
  [
    'public/social-card-default-gradient.png',
    'bskyweb/static/social-card-default-gradient.png',
  ],
]

for (const [source, target] of serverBrandFiles) {
  const sourcePath = path.join(projectRoot, source)
  const targetPath = path.join(projectRoot, target)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing required server web asset: ${sourcePath}`)
  }
  fs.copyFileSync(sourcePath, targetPath)
  console.log(`Copied ${sourcePath} to ${targetPath}`)
}

console.log(`Found ${entrypoints.length} entrypoints`)
console.log(`Writing ${templateFile}`)

const outputFile = entrypoints
  .map(name => {
    const file = path.basename(name)
    const ext = path.extname(file)

    if (ext === '.js') {
      return `<script defer="defer" src="{{ staticCDNHost }}/static/js/${file}"></script>`
    }
    if (ext === '.css') {
      return `<link rel="stylesheet" href="{{ staticCDNHost }}/static/css/${file}">`
    }

    return ''
  })
  .join('\n')
fs.writeFileSync(templateFile, outputFile)

function copyFiles(sourceDir, targetDir) {
  const files = fs.readdirSync(path.join(projectRoot, sourceDir))
  files.forEach(file => {
    const sourcePath = path.join(projectRoot, sourceDir, file)
    const targetPath = path.join(projectRoot, targetDir, file)
    fs.copyFileSync(sourcePath, targetPath)
    console.log(`Copied ${sourcePath} to ${targetPath}`)
  })
}

copyFiles('web-build/static/js', 'bskyweb/static/js')
copyFiles('web-build/static/css', 'bskyweb/static/css')
copyFiles('web-build/static/media', 'bskyweb/static/media')
