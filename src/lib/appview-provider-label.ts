/**
 * Give a configured read provider a truthful default label without implying
 * that the client bundle owns or operates the endpoint.
 */
export function getDefaultAppViewDisplayName(
  endpoint: string,
  configuredName?: string,
): string {
  if (configuredName?.trim()) return configuredName.trim()

  try {
    const hostname = new URL(endpoint).hostname.toLowerCase()
    if (hostname === 'api.bsky.app' || hostname === 'public.api.bsky.app') {
      return 'Public AT Protocol AppView (external read provider)'
    }
  } catch {
    // Endpoint validation reports the malformed endpoint separately.
  }

  return 'Configured AT Protocol read provider'
}
