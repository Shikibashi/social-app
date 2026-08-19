const path = require('path')
const fs = require('fs')

const projectRoot = path.join(__dirname, '..')
const templateFile = path.join(
  projectRoot,
  'bskyweb',
  'templates',
  'scripts.html',
)

const {entrypoints} = require(
  path.join(projectRoot, 'web-build/asset-manifest.json'),
)

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
