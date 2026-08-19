export type ServiceBoundaryKind =
  | 'AppView provider'
  | 'identity resolver'
  | 'labeler directory'

export type ServiceBoundary = {
  kind: ServiceBoundaryKind
  displayName: string
  serviceDid: string
}

/**
 * Keep failures attributable to the service that actually handled the read.
 * The original error is retained for logging/debugging, but the user-facing
 * message deliberately does not echo arbitrary upstream response text.
 */
export class ServiceBoundaryError extends Error {
  readonly boundary: ServiceBoundary
  readonly cause: unknown

  constructor(boundary: ServiceBoundary, cause?: unknown) {
    super(
      `${boundary.kind} ${boundary.displayName} (${boundary.serviceDid}) is unavailable`,
    )
    this.name = 'ServiceBoundaryError'
    this.boundary = boundary
    this.cause = cause
  }
}

export function serviceBoundaryError(
  boundary: ServiceBoundary,
  cause?: unknown,
): ServiceBoundaryError {
  return new ServiceBoundaryError(boundary, cause)
}
