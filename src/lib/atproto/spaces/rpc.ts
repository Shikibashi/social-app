import {com} from '#/lexicons'

/**
 * The Space transport uses the generated Lexicons from the matching PDS
 * Spaces alpha checkout. The app's pinned lex runtime does not know the
 * alpha-only `space-ref` format and applies the public `at-uri` validator too
 * narrowly to Space record URIs. The checked-in source JSON therefore leaves
 * those two fields unconstrained at the client boundary; the PDS remains
 * authoritative for Space reference and record URI validation.
 */
export const toSpaceRpc = com.atproto.space
