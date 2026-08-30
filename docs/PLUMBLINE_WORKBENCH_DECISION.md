# Plumbline workbench and provider composition decision record

Status: active implementation decision

This record describes the current boundary for the seamful AT Protocol workbench. It does not turn a local declaration into proof of independent operation, and it does not make an external deployment or AppView response authoritative.

## 1. Residual authority concentration discovered

The client still has a strong default path through one configured AppView, and several read surfaces have historically accepted the first successful response without showing its source. The Services screen also exposed provider controls as one long settings list, which made the account host, read providers, identity resolvers, and local policy look like one undifferentiated service.

## 2. Why it matters

An outage, stale index, incorrect claim, or privacy-sensitive provider choice becomes difficult to diagnose when the source and reconciliation rule are hidden. A bundled provider must remain a convenience default rather than acquiring authority over identity, writes, or the user's interpretation of disagreement.

## 3. Existing ecosystem precedent

- AT Protocol OAuth uses explicit client metadata, PKCE, PAR, issuer binding, DPoP, and scoped permission sets; the client must treat a requested scope as a request rather than as an automatic grant. See [OAuth](https://atproto.com/specs/oauth) and the [scope builder](https://atproto.com/guides/scope-builder).
- PLC replicas are intended to be independently queryable and self-hostable, while replica availability alone does not prove that operators are independent. See [PLC replicas](https://atproto.com/blog/plc-replicas).
- PLC histories are signed DAG-CBOR operations with previous-CID chaining, key rotation, and tombstone behavior. See the [PLC DID method specification](https://github.com/did-method-plc/did-method-plc/blob/main/website/spec/v0.1/did-plc.md).
- Blacksky's public fork separates ingestion/indexing concerns from the AppView query surface, which supports keeping provider boundaries explicit rather than treating one query service as the protocol itself. See [Blacksky's ATProto fork](https://github.com/blacksky-algorithms/atproto).

## 4. Chosen architectural change

The existing provider registry and generic composition contract are the single composition boundary. The client now:

- stores a descriptor, service DID, declared operator identity, capability set, and per-surface reconciliation rule;
- fans out eligible reads through `composeProviderResults`, preserving every observation, status, verification result, timestamp, and provider identity;
- rejects stale, invalid, unavailable, or disagreeing results when the selected local policy requires agreement;
- permits an explicit first-verified, preferred-provider, or merge policy instead of using a hidden request-time fallback;
- applies the concrete fan-out to custom feed reads through `ComposedCustomFeedAPI`, including retryable transport evidence for an external feed-provider 503;
- displays selected provider provenance, composition state, and the distinction between declared operator IDs and proven independent control in feed context, and exposes a change-provider action when a composition fails;
- preserves the complete `ProviderCompositionResult` by raising `ProviderCompositionError` at fail-closed query boundaries, so provider disagreement and unavailable observations remain available to error UIs;
- presents provider registration, capability selection, reconciliation, export/import/reset, OAuth upgrades, identity resolution, and PLC resolver declarations in a Navigator → Workspace → Inspector Services workbench.

The provider registry already routes profiles, threads/post details, feed metadata, search, notifications, and labeler reads through the same generic boundary. The Community Board now composes the signed-in account PDS directory with a deep-linked community-authority PDS only when a remote community is explicitly requested; it does not create a global community index or silently fan out private reads. Media remains a PDS/CDN boundary-owned surface because its existing blob contract is not an AppView query contract.

## 5. Authority before and after

| Boundary | Before | After |
| --- | --- | --- |
| Account and writes | The session's account host and the read provider were easy to conflate. | The PDS/account host is shown separately; read-provider changes cannot move writes. |
| Public reads | One default AppView commonly looked like the answer. | Providers are explicit, observations remain attributable, and the local policy chooses whether a value may be promoted. |
| Feed outage | A feed-generator failure surfaced as an opaque feed error. | Retryable failure is retained with provider identity and the user can retry or choose an explicitly registered provider. |
| Identity | Resolver/provider selection was easy to treat as identity ownership. | Identity capability is separately revocable; resolver declarations are claims, not proof of control. |
| User policy | Provider choices were difficult to inspect or move. | Provider capability and reconciliation state can be exported, imported only onto known providers, or reset without credentials. |
| PLC resolution | A primary resolver could be treated as infallible. | Multiple declared resolvers can be enabled, histories are cryptographically checked, and disagreement remains visible; operator independence stays an external evidence gate. |

## 6. Interoperability and security tradeoffs

The implementation keeps standard XRPC, AppView, OAuth, and PLC interfaces. It does not invent a replacement protocol or send session credentials to public-read providers by default. Requiring agreement can fail closed during an outage and may feel less available; first-verified, preferred-provider, and merge modes therefore require an explicit local choice. Merged feed pages discard a single-provider `feedContext` because carrying one provider's interaction token across a mixed result would be unsafe. Provider metadata and errors are displayed for diagnosis, but no endpoint, token, or service-auth material is included in policy exports.

## 7. Implementation evidence

- `src/lib/provider-composition.ts` is the generic attribution and reconciliation contract.
- `src/state/queries/provider-composition.ts` binds that contract to registered AppView providers without widening public reads into authenticated reads.
- `src/lib/api/feed/custom.ts` implements the concrete multi-provider custom-feed boundary.
- `src/state/queries/provider-composition.ts` keeps fail-closed query errors attributable to their complete composition result.
- `src/view/com/posts/PostFeedErrorMessage.tsx` retains retryable composition evidence and offers an explicit Services route.
- `src/components/FeedProvenanceCard.tsx`, `src/view/com/feeds/FeedPage.tsx`, and `src/view/com/posts/PostFeed.tsx` expose provider provenance in feed context.
- `src/lib/attention-ui.ts` and `src/lib/api/feed/types.ts` carry provider composition and independence evidence through the feed boundary.
- `src/screens/Settings/ServicesSettings.tsx` makes service domains and user controls inspectable in the workbench.
- `src/state/session/providers.ts`, `src/state/session/plc-resolvers.ts`, and `src/lib/personalization.ts` provide validated persistence and portable policy boundaries.
- `src/lib/moderation.ts` exposes a typed moderation policy trace that keeps the label source, issuer assertion, viewer rule, override boundary, and local presentation behavior together without creating a new moderation authority.
- `src/components/moderation/ModerationDetailsDialog.tsx` presents label decisions as Source → Assertion → Your rule → Plumbline action, retains labeler provenance and expiry, and distinguishes issuer-enforced behavior from viewer-configurable presentation.
- `src/lib/atproto/spaces/community-directory.ts` composes account-PDS and explicitly deep-linked community-authority directory observations while retaining outage and metadata disagreement.
- `src/screens/CommunityBoardScreen.tsx` shows directory source IDs, endpoints, status, errors, and the selected local merge result without presenting a provider as the community owner.
- `src/lib/api/account-profile.ts` keeps the signed-in profile record authoritative and derives profile-media URLs from the account PDS blob CIDs when an AppView view is stale or missing.
- `src/lib/strings/url-helpers.ts` resolves internal share and embed paths against the runtime Plumbline origin while preserving absolute external HTTP(S) links; hashtag, topic, and search share actions use that boundary.
- `src/view/com/auth/SplashScreen.web.tsx` keeps the signed-out web footer on the canonical `plumblines.uk` origin and removes links to routes that are not implemented by the Plumbline SPA; `src/screens/CommunityBoardScreen.tsx` uses Plumbline in its visible section label while preserving protocol namespaces.
- `src/screens/PostThread/components/ThreadItemAnchor.tsx` retains the existing `Why this post?` provenance inspector in thread detail when navigation originated from a feed, and `src/screens/Moderation/index.tsx` uses the canonical Plumbline web link.
- The ChatGPT in-app browser check on 2026-08-29 loaded `https://plumblines.uk/` with the Plumbline title, public feed posts, no alert, and the Plumbline favicon/mark assets. The same public flow reached the `plumblines.uk` OAuth consent screen for `pds.edriffles.us` without authorizing an account, and a public post-detail route rendered with its reactions and replies.

## 8. Tests proving the boundary

- `src/lib/provider-composition.test.ts` covers all declared surfaces, stale data, malicious verification failure, outage handling, explicit merge, and credential-free fixtures for partial support, revoked grants, block boundaries, labeler disagreement, and migration state.
- `src/lib/api/feed/custom-composed.test.ts` covers provenance, explicit outage continuation, fail-closed agreement, and retryable evidence.
- `src/state/queries/provider-composition.test.ts` proves fail-closed reads preserve the original composition object on `ProviderCompositionError`.
- `src/lib/api/feed/retry.test.ts` covers transient versus permanent XRPC errors and composed transport failures.
- `src/lib/moderation.test.ts` proves the policy trace preserves the labeler assertion and viewer rule while marking system no-override behavior as non-overridable.
- `src/lib/atproto/spaces/community-directory.test.ts` proves directory merge, source outage, fail-closed unavailability, and credential-free evidence serialization.
- `src/lib/api/account-profile.test.ts` proves the PDS blob URL derivation and PDS-owned media precedence over stale AppView URLs.
- `pnpm typecheck:web`, the focused Jest suites, targeted Oxlint, and the parent contract validator are required completion checks for this batch.
- Latest observed results: the existing provider-focused suites remain passing; this iteration adds 2 URL-helper tests and reruns the 6 attention/provenance tests (8 tests passed), `pnpm run typecheck:web`, targeted Oxlint, targeted Prettier, and `git diff --check`.
- `pnpm run build-web` completed with the existing bundle-size warnings; Wrangler deployed the exact export at `https://7361cb4b.social-edriffles.pages.dev`, and `https://plumblines.uk/` serves `main.5bcabf4f.js` with the Plumbline title and mark.
- The credential-free live public-contract probe passed at `2026-08-30T08:16:45Z` with no credentials and no writes. The ChatGPT in-app browser connector was not rerun because its required Chromium binary remains unavailable; this is not a signed-in browser result.
- The full `pnpm lint` command remains FAIL on a broad existing/upstream-wide set of import-order, unused-variable, and suppression diagnostics outside this focused batch.
- The browser evidence is public/read-only. Signed-in OAuth authorization and account mutations were not run because no disposable credential was available and no production credential was used.

## 9. Iteration 3 — canonical Plumbline sharing

The client now treats the Plumbline web origin as the default for internal
shareable application paths. This prevents copied profile, post, feed, list,
embed, hashtag, topic, and search links from silently returning people to
`bsky.app`, while leaving external HTTP(S) URLs intact for interoperability.
Thread detail also keeps the feed provenance inspector visible after a feed
item is opened, so the user's context does not disappear at the navigation
boundary.

The client commit for this iteration is `dca8068f2`, pushed to
`fork/codex/spaces-alpha-integration`. It does not alter ATProto namespaces,
provider endpoints, account-PDS writes, or the external evidence gates.

## 10. Remaining concentrations worth attacking next

1. Add a compatible, independently attributable media delivery composition contract only if it can preserve PDS blob authority and safe browser delivery; do not treat a CDN URL as a second authoritatively owned record.
2. Add credentialed multi-provider browser fixtures for revoked grants, migration, block boundaries, and partial service support without using production credentials.
3. Complete visible PLC disagreement/reconciliation evidence and independently operated resolver evidence; declared operator IDs are not sufficient.
4. Run a controlled Relay/AppView private-canary scan and a disposable short-TTL OAuth expiry/replay walkthrough; local tests cannot close those external gates.
5. Continue replacing remaining user-facing legacy product copy with the current Plumbline identity while preserving Edriffles Computer Web lineage and protocol identifiers.
