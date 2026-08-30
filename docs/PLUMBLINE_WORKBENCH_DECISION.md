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

## 10. Iteration 4 — canonical chat links and app-icon identity

The chat invite surface now uses the runtime Plumbline origin for copied invite
links and reply previews. The shared URL boundary recognizes both canonical
Plumbline application paths and reference `bsky.app` paths, so existing links
remain interoperable while new links do not silently return users to the
reference client. The app-icon settings surface now calls its internal icon set
“Plumbline variants” and removes the remaining user-facing “Bluesky+” and
“Bluesky Classic” labels; technical package and asset identifiers remain
unchanged.

### Implementation and verification evidence

- `src/lib/strings/url-helpers.ts` accepts exact reference and canonical app
  origins for post, feed, list, starter-pack, RSS, and chat-path recognition,
  while rejecting lookalike hosts and preserving external HTTP(S) behavior.
- `src/components/dms/ChatInvite/Root.tsx`,
  `src/screens/Messages/components/InviteLinkDialog.tsx`, and
  `src/components/dms/replyPreview.ts` use the shared runtime-origin helper.
- `src/screens/Settings/AppIconSettings/` uses Plumbline terminology for the
  visible variant group; native icon IDs and files remain compatible.
- URL-helper tests pass 4/4, targeted Oxlint and Prettier pass, and
  `pnpm run typecheck:web` passes.
- `pnpm run build-web` completed with the existing bundle-size warnings; the
  resulting export uses the Plumbline title, mark, metadata, and canonical
  share origin.

This iteration does not rename ATProto protocol namespaces or external provider
identifiers. A visible provider name such as Bluesky remains when it identifies
an external service or reference URL rather than Plumbline product branding.

## 11. Iteration 5 — canonical profile invites and starter-pack links

The canonical-origin boundary now covers the remaining user-facing profile
invite and starter-pack share generators. New QR payloads, copied invite
links, starter-pack share links, and their displayed URLs use the runtime
Plumbline origin. Existing `bsky.app` links remain accepted by the shared
parsers so interoperability is preserved rather than silently redirecting
legacy input.

### Implementation and verification evidence

- `src/features/inviteFriends/urls.ts` derives share and display URLs from
  `getRuntimePublicWebOrigin()`; the displayed value and copied value remain
  the same URL apart from the scheme label.
- `src/lib/routes/links.ts` uses the same runtime origin for starter-pack
  share links, including links created from a starter-pack view.
- `src/features/inviteFriends/urls.test.ts` and
  `src/lib/routes/links.test.ts` cover canonical output, custom handles,
  leading-at normalization, and view-derived starter-pack routes.
- The focused suites pass 13/13 tests; targeted Oxlint, Prettier,
  `git diff --check`, and `pnpm run typecheck:web` pass.
- `pnpm run build-web` completed with the existing bundle-size warnings and
  produced the exact export that is ready for Pages deployment. Deployment
  and public live verification remain separate steps for this iteration.

This is a share-output change only. Protocol collection names, external
provider URLs, and parsing of reference Bluesky links remain unchanged.

## 12. Iteration 6 — canonical quote, draft, chat, and RSS paths

The remaining internal post-link generators now use the shared runtime-origin
helper. Quote composition, draft restoration, embedded-post chat previews,
and relative RSS opening therefore stay on Plumbline for new internal links.
The URL classifier recognizes canonical Plumbline RSS links as internal while
continuing to accept reference Bluesky paths and external HTTP(S) URLs.

### Implementation and verification evidence

- `src/state/shell/composer/index.tsx` and
  `src/view/com/composer/state/composer.ts` use the runtime share helper when
  precaching or creating quote embeds.
- `src/view/com/composer/drafts/state/api.ts` uses the same helper while
  restoring a quote from a persisted draft.
- `src/components/dms/getMessageInfo.ts` keeps embedded post previews on the
  current Plumbline origin, and `src/lib/hooks/useOpenLink.ts` resolves
  relative RSS paths through that boundary.
- The obsolete internal `toBskyAppUrl` and
  `createBskyAppAbsoluteUrl` generators were removed after all repository
  callers moved to `toShareUrl`.
- `src/lib/strings/__tests__/url-helpers.test.ts` now covers canonical and
  reference RSS classification. The focused URL/route suites pass 17/17
  tests; targeted Oxlint, Prettier, `git diff --check`, and
  `pnpm run typecheck:web` pass.

This preserves ATProto collection names and external provider URLs. It only
changes the destination used for new internal application links and keeps
legacy reference links interoperable.

## 13. Iteration 7 — inspectable account-PDS profile media

The signed-in account profile already used the account PDS profile record as
the authority for avatar and banner CIDs, but the UI did not expose that
boundary. This iteration keeps the direct `com.atproto.sync.getBlob` delivery
path and adds progressive inspection for the source, record owner, endpoint,
protocol method, and CIDs. It does not add a second media provider or treat a
CDN URL as an authoritatively owned record.

### Implementation and verification evidence

- `src/lib/api/account-profile.ts` extracts the profile-record blob CIDs,
  normalizes the account PDS origin, preserves the direct public blob URLs,
  and carries typed `AccountProfileMediaProvenance` alongside the owner
  profile view.
- `src/components/MediaDeliveryProvenance.tsx` adds a collapsed/expanded
  inspector to the profile header. It identifies the account PDS as the
  authority and explains that AppView/CDN views cannot replace the profile
  record. `src/view/screens/Profile.tsx` renders it only when this verified
  owner-PDS evidence exists.
- `src/lib/api/account-profile.test.ts` covers the six account-profile cases,
  including provenance normalization and refusal to claim a source without a
  usable endpoint or blob. Web TypeScript, targeted Oxlint, Prettier, and
  whitespace checks pass.
- Client commit `0774e978e` was pushed to
  `fork/codex/spaces-alpha-integration`.
- The exact web export was deployed with Wrangler at
  `https://22c77414.social-edriffles.pages.dev`; both the preview and
  `https://plumblines.uk/` serve the Plumbline title, mark, and
  `main.40c760a2.js` bundle.
- The credential-free public-contract probe passed at
  `2026-08-30T09:06:34.065473Z` with `credentialsUsed: false` and
  `writesPerformed: false`. The ChatGPT in-app browser loaded the canonical
  shell and populated public feed content and provenance controls without
  performing a mutation.

This evidence is intentionally narrower than a general media federation
claim. Non-owner profiles continue to use the existing public AppView/CDN
media view until a safe, independently verified PDS endpoint can be derived;
no account credential is sent to obtain that fallback.

## 14. Iteration 8 — make provider substitution reachable from evidence

The provider-composition inspector already made source, disagreement, and
limitations visible, but it stopped at explanation. This iteration adds a
progressive `Change read provider` action to the expanded inspector. The
action routes to the existing Services workbench, where the user can select
capabilities, reconciliation, and provider configuration. It does not create
a second provider-settings store or silently change the active provider.

### Implementation and verification evidence

- `src/components/ProviderCompositionProvenance.tsx` adds the accessible
  action and keeps it inside the expanded evidence view. It uses the existing
  `ServicesSettings` route and the existing provider-composition policy.
- Web TypeScript, targeted Oxlint, Prettier, whitespace validation, and the
  production web export pass. The bundle contains the updated component and
  retains the existing Plumbline title, icon, and public-origin configuration.
- Client commit `30e165ef3` was pushed to
  `fork/codex/spaces-alpha-integration`.
- Wrangler deployed the exact export at
  `https://95255e0f.social-edriffles.pages.dev`; the preview and canonical
  `https://plumblines.uk/` return HTTP 200, the Plumbline title, and
  `main.12405af4.js`.
- The credential-free ChatGPT in-app-browser smoke check loaded the canonical
  shell, populated public feed content, and exposed the existing provenance
  control. No credentials were read and no mutation was performed.

This is a reachability improvement at the existing policy boundary. It does
not claim that every surface has an independent provider available, or that
the canonical public smoke check proves signed-in provider mutation behavior.

## 15. Iteration 9 — route provider changes to the relevant workbench section

The provider-change affordance now carries an explicit typed destination into
Services. Provider evidence and feed/provider error recovery open the
Providers section directly; identity evidence opens the Identity section.
Community and custom-feed provider controls use the same route contract. This
reduces the gap between explaining a provider boundary and giving the user a
real replacement path without adding surface-specific settings stores.

### Implementation and verification evidence

- `src/lib/routes/types.ts` defines the optional `ServicesSettingsSection`
  route parameter, and `src/screens/Settings/ServicesSettings.tsx` honors it
  while preserving the normal overview default.
- Provider composition, feed, custom-feed, post-feed-error, and community
  controls pass the relevant `providers` or `identity` section explicitly.
- Web TypeScript, targeted Oxlint, Prettier, whitespace validation, focused
  provider/identity/OAuth/PLC tests (33 tests), and the production web export
  pass.
- Client commit `fdfd0213d` was pushed to
  `fork/codex/spaces-alpha-integration`.
- Wrangler deployed the exact export at
  `https://b6788290.social-edriffles.pages.dev`; the preview and canonical
  `https://plumblines.uk/` return HTTP 200, the Plumbline title, and
  `main.93da2ac9.js`.
- The credential-free ChatGPT in-app-browser smoke check loaded the canonical
  shell, populated feed tabs, and loaded a public profile without an error.
  No credentials were read and no mutation was performed.

The browser smoke check does not claim that an authenticated provider switch
was performed. It verifies the deployed route shell; authenticated selection
remains guarded by the existing session and provider availability checks.

## 16. Iteration 10 — make identity exit utilities first-class

The Identity & recovery workbench now exposes the existing exit utilities at
the same boundary as DID, PDS, recovery, and session state. It reuses the
repository/chat export dialog and links to the existing portable policy backup
controls rather than introducing duplicate state or a second exporter. The
migration status remains honest: an unavailable upstream migration API is not
presented as a completed migration workflow.

### Implementation and verification evidence

- `src/screens/Settings/IdentitySovereigntySettings.tsx` adds an Exit
  utilities group with repository/chat export and a route to portable policy
  backup, import, and reset controls.
- The existing CAR / JSONL exporter remains the implementation boundary and
  keeps credentials excluded; the existing Personalization workbench remains
  the policy backup boundary.
- Client commit `688a0e2d0` was pushed to
  `fork/codex/spaces-alpha-integration`.
- Targeted Oxlint, Prettier, whitespace validation, web TypeScript, and the
  focused provider/identity/PLC-custody/OAuth suite pass (33 tests).
- Wrangler deployed the exact export at
  `https://d7bbfe2a.social-edriffles.pages.dev`; the preview and canonical
  `https://plumblines.uk/` return HTTP 200, the Plumbline title, and
  `main.0e1bc6c1.js`.
- The credential-free ChatGPT in-app-browser smoke check loaded the canonical
  shell with Plumbline branding and feed tabs and without an error state. No
  credentials were read and no mutation was performed.

This makes export and portable policy controls directly discoverable from the
identity boundary. It does not claim that an authenticated export was run in
the browser or that PDS migration is available when the upstream API is not.

## 17. Remaining concentrations worth attacking next

1. Add a compatible, independently attributable media delivery composition contract only if it can preserve PDS blob authority and safe browser delivery; do not treat a CDN URL as a second authoritatively owned record.
2. Add credentialed multi-provider browser fixtures for revoked grants, migration, block boundaries, and partial service support without using production credentials.
3. Complete visible PLC disagreement/reconciliation evidence and independently operated resolver evidence; declared operator IDs are not sufficient.
4. Run a controlled Relay/AppView private-canary scan and a disposable short-TTL OAuth expiry/replay walkthrough; local tests cannot close those external gates.
5. Continue replacing remaining user-facing legacy product copy with the current Plumbline identity while preserving Edriffles Computer Web lineage and protocol identifiers.
