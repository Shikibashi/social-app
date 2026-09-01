#!/usr/bin/env node

/* oxlint-disable import/no-nodejs-modules -- This file is a Node-only preview server. */

/**
 * Serve an exported web bundle for local verification.
 *
 * The OAuth callback is a browser route, not a physical file in `web-build`.
 * A generic file server will therefore return a 404 before the application can
 * restore the authorization transaction. This preview server preserves static
 * asset responses while routing extensionless application paths to index.html.
 */
const fs = require('fs/promises')
const http = require('http')
const path = require('path')

const buildDirectory = path.resolve(__dirname, '..', 'web-build')
const host = process.env.HOST || '127.0.0.1'
const port = Number.parseInt(process.env.PORT || '4174', 10)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function contentType(filePath) {
  return (
    mimeTypes.get(path.extname(filePath).toLowerCase()) ||
    'application/octet-stream'
  )
}

function resolveBuildFile(pathname) {
  const candidate = path.resolve(buildDirectory, `.${pathname}`)
  if (
    candidate !== buildDirectory &&
    !candidate.startsWith(`${buildDirectory}${path.sep}`)
  ) {
    return undefined
  }
  return candidate
}

async function readFileIfPresent(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile() ? await fs.readFile(filePath) : undefined
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined
    throw error
  }
}

function canUseSpaFallback(pathname) {
  return path.extname(pathname) === ''
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response)
})

/**
 * @param {import('http').IncomingMessage} request
 * @param {import('http').ServerResponse} response
 */
async function handleRequest(request, response) {
  if (!request.url || !['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, {Allow: 'GET, HEAD'})
    response.end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    )
  } catch {
    response.writeHead(400)
    response.end('Bad request')
    return
  }

  try {
    const requestedFile = resolveBuildFile(
      pathname === '/' ? '/index.html' : pathname,
    )
    let filePath = requestedFile
    let body = requestedFile
      ? await readFileIfPresent(requestedFile)
      : undefined

    if (!body && canUseSpaFallback(pathname)) {
      filePath = path.join(buildDirectory, 'index.html')
      body = await readFileIfPresent(filePath)
    }

    if (!body || !filePath) {
      response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'})
      response.end('Not found')
      return
    }

    response.writeHead(200, {
      'Cache-Control': filePath.endsWith('index.html')
        ? 'no-store'
        : 'public, max-age=0',
      'Content-Type': contentType(filePath),
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch (error) {
    console.error(error)
    response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'})
    response.end('Preview server failed')
  }
}

server.once('error', error => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(
      `Cannot start preview: http://${host}:${port} is already in use`,
    )
  } else {
    console.error(error)
  }
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`Serving ${buildDirectory} at http://${host}:${port}/`)
})
