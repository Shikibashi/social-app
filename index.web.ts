import '#/platform/markBundleStartTime'
import '#/platform/polyfills'

import {registerRootComponent} from 'expo'

import {getDevelopmentLoopbackRedirectUrl} from '#/state/session/oauth-scopes'
import {ENV} from '#/env'

// The AT Protocol browser OAuth loopback exception stores callback state on an
// IP address. Keep the page and the callback on the same browser origin before
// evaluating App, which mounts the session provider and may initialize OAuth.
const developmentLoopbackRedirectUrl = getDevelopmentLoopbackRedirectUrl(
  ENV,
  window.location.href,
)

if (developmentLoopbackRedirectUrl) {
  window.location.replace(developmentLoopbackRedirectUrl)
} else {
  // Delayed evaluation is intentional: loading App on localhost could create
  // IndexedDB-backed OAuth state in a namespace the IP-loopback callback
  // cannot read.
  const AppModule = require('#/App') as typeof import('#/App')
  registerRootComponent(AppModule.default)
}
