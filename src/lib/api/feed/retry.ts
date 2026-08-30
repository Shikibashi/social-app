import {ProviderCompositionError} from '#/lib/provider-composition'
import {isNetworkError, isRetryableHttpStatus} from '#/lib/strings/errors'
import {getErrorStatus} from '#/lib/xrpc-error'

/**
 * Feed reads are intentionally fail-fast by default, but a feed generator
 * outage is often transient. Retry only transport failures and retryable HTTP
 * responses, and leave malformed or policy/auth failures visible to the user.
 */
export function shouldRetryPostFeedError(error: unknown): boolean {
  if (error instanceof ProviderCompositionError) {
    return error.composition.observations.some(
      observation => observation.retryable === true,
    )
  }
  return (
    isRetryableHttpStatus(getErrorStatus(error) ?? 0) || isNetworkError(error)
  )
}
