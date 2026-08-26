/**
 * Default/test resolution uses the official browser implementation. Metro
 * selects oauth-client.native.ts for iOS/Android, while Webpack selects
 * oauth-client.web.ts for the web bundle.
 */
export {BrowserOAuthClient as ExpoOAuthClient} from '@atproto/oauth-client-browser'
