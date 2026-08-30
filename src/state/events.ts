import {EventEmitter} from 'eventemitter3'

type UnlistenFn = () => void

const emitter = new EventEmitter()

// a "soft reset" typically means scrolling to top and loading latest
// but it can depend on the screen
export function emitSoftReset() {
  emitter.emit('soft-reset')
}
export function listenSoftReset(fn: () => void): UnlistenFn {
  emitter.on('soft-reset', fn)
  return () => emitter.off('soft-reset', fn)
}

export function emitSessionDropped() {
  emitter.emit('session-dropped')
}
export function listenSessionDropped(fn: () => void): UnlistenFn {
  emitter.on('session-dropped', fn)
  return () => emitter.off('session-dropped', fn)
}

export function emitNetworkConfirmed() {
  emitter.emit('network-confirmed')
}
export function listenNetworkConfirmed(fn: () => void): UnlistenFn {
  emitter.on('network-confirmed', fn)
  return () => emitter.off('network-confirmed', fn)
}

export function emitNetworkLost() {
  emitter.emit('network-lost')
}
export function listenNetworkLost(fn: () => void): UnlistenFn {
  emitter.on('network-lost', fn)
  return () => emitter.off('network-lost', fn)
}

export function emitPostCreated() {
  emitter.emit('post-created')
}
export function listenPostCreated(fn: () => void): UnlistenFn {
  emitter.on('post-created', fn)
  return () => emitter.off('post-created', fn)
}

export function emitFocusSearch() {
  emitter.emit('focus-search')
}
export function listenFocusSearch(fn: () => void): UnlistenFn {
  emitter.on('focus-search', fn)
  return () => emitter.off('focus-search', fn)
}

export function emitPersonalizationChanged(accountDid: string) {
  emitter.emit('personalization-changed', accountDid)
}
export function listenPersonalizationChanged(
  fn: (accountDid: string) => void,
): UnlistenFn {
  emitter.on('personalization-changed', fn)
  return () => emitter.off('personalization-changed', fn)
}

export function emitAppViewProviderChanged(
  accountDid: string,
  providerId: string,
) {
  emitter.emit('appview-provider-changed', accountDid, providerId)
}
export function listenAppViewProviderChanged(
  fn: (accountDid: string, providerId: string) => void,
): UnlistenFn {
  emitter.on('appview-provider-changed', fn)
  return () => emitter.off('appview-provider-changed', fn)
}

/**
 * A provider capability or reconciliation-policy change invalidates every
 * cached read for the current account, even when the selected endpoint did
 * not change. The event intentionally carries no provider identity: the
 * changed policy is local user state, not a claim made by a provider.
 */
export function emitAppViewProviderPolicyChanged() {
  emitter.emit('appview-provider-policy-changed')
}
export function listenAppViewProviderPolicyChanged(fn: () => void): UnlistenFn {
  emitter.on('appview-provider-policy-changed', fn)
  return () => emitter.off('appview-provider-policy-changed', fn)
}
