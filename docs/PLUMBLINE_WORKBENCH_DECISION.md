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

## 17. Iteration 11 — carry provider provenance into post inspection

The feed query already retained provider provenance, composition status, and
the limits of declared operator identity, but the evidence stopped at the
feed-level workbench. This iteration carries that typed metadata with each
feed slice and transient post source so the post's `Why this post?` inspector
can identify the read provider(s), endpoint, service DID, declared operator,
composition status, and whether independent control has actually been proven.

### Implementation and verification evidence

- `src/state/queries/post-feed.ts` attaches page-level provider metadata to
  each `FeedPostSlice`; `PostFeed` and `PostFeedItem` preserve it for the
  rendered post and the post-thread transition.
- `src/components/Post/PostProvenance.tsx` and `src/lib/attention-ui.ts`
  expose bounded provider identifiers and endpoints, composition status, and
  the explicit `independent control not proven` limitation. The data remains
  inspectable and does not promote a provider merely because it was selected.
- `src/state/unstable-post-source.tsx` and
  `src/screens/PostThread/components/ThreadItemAnchor.tsx` preserve the same
  evidence when a user opens a post detail view.
- The focused attention/provider/identity/PLC/OAuth suite passes (39 tests),
  targeted Oxlint and Prettier pass, web TypeScript passes, and the production
  web export contains the new post-inspector labels.
- Client commit `586491ade` was pushed to
  `fork/codex/spaces-alpha-integration`.
- Wrangler deployed the exact export at
  `https://91b75138.social-edriffles.pages.dev`; the preview and canonical
  `https://plumblines.uk/` return HTTP 200, the Plumbline title, and
  `main.d4df7bec.js`.
- The credential-free ChatGPT in-app-browser smoke check loaded the canonical
  shell with the Plumbline title, feed tabs, and post-provenance affordance,
  with no error state. No credentials were read and no mutation was performed.

This closes a provenance visibility gap in the client UI. It does not prove
authenticated provider switching, independent operator control, or the
external Relay/AppView and short-TTL OAuth gates.

## 18. Iteration 12 — make policy ownership explicit in settings

The settings UI previously sent users directly to provider-owned policy URLs
from the About and Privacy & Security screens. That made the browser destination
look like an implicit Plumbline policy and left the source boundary unclear.
This iteration routes those actions through the existing local support screens,
which identify the hosting provider as the policy owner before exposing the
external document. Takedown, community-guideline, and copyright copy now uses
the same source-explicit language.

### Implementation and verification evidence

- `src/screens/Settings/AboutSettings.tsx` now exposes `Provider Terms of
  Service` and `Provider Privacy Policy` through the existing `/support/tos`
  and `/support/privacy` routes.
- `src/screens/Settings/PrivacyAndSecuritySettings.tsx` now labels its policy
  link as the hosting provider's privacy policy and uses the same internal
  support route. `src/screens/Takendown.tsx`,
  `src/view/screens/CommunityGuidelines.tsx`, and
  `src/view/screens/CopyrightPolicy.tsx` explicitly identify provider
  ownership without inventing a Plumbline legal policy.
- The focused attention/provider/identity/PLC/OAuth suite passes (39 tests),
  targeted Oxlint and Prettier pass, web TypeScript passes, and the web export
  completes with only the existing bundle-size warnings.
- Client commit `4f87b2880` was pushed to
  `fork/codex/spaces-alpha-integration`.
- Wrangler deployed the exact export at
  `https://b41a65f2.social-edriffles.pages.dev`; the preview and canonical
  `https://plumblines.uk/` return HTTP 200 and the export uses
  `main.94d5b092.js`.
- The credential-free ChatGPT in-app-browser smoke check verified the
  Plumbline home shell, the provider-labelled About links, and the provider
  privacy support route without an error state. No credentials were read and
  no mutation was performed.

This reduces a user-facing authority ambiguity. It does not change the
hosting provider's legal documents, establish independent policy authority, or
close the external Relay/AppView, short-TTL OAuth, or PLC-operator gates.

## 19. Iteration 13 — make provider ownership visible on support and identity entry points

The previous policy-link work did not cover every user-facing entry point. The
support screen still described the help destination as if Plumbline itself
owned the support relationship, the age-gate linked directly to an unlabeled
provider document, and the custom-handle flow used an unsourced “Learn more”
label. This iteration keeps the existing provider destinations but makes their
ownership explicit and keeps the links addressable through the existing
Plumbline support routes where appropriate.

### Implementation and verification evidence

- `src/view/screens/Support.tsx` now identifies the hosting provider's support
  form while preserving the external help-desk destination.
- `src/components/dialogs/BirthDateSettings.tsx` now routes the age-gate
  policy link through `/support/tos` and labels it as the hosting provider's
  Terms of Service.
- `src/screens/Settings/components/ChangeHandleDialog.tsx` now labels the
  existing provider domain-handle article as the hosting provider's
  domain-handle guide; the external provider URL remains intact.
- `src/locale/locales/en/messages.po` was regenerated and the compiled English
  catalog was rebuilt. The live route previously exposed the generated
  message ID `kfpVmS`; the post-build browser probe now shows the complete
  English support sentence and no message ID.
- Targeted `git diff --check`, Prettier, and Oxlint pass. The focused OAuth,
  provider-composition, attention, and account-profile suites pass (40 tests).
  The production web export completes with only the existing bundle-size
  warnings.
- Client commits `4a6bab405` and `4f9d54fd6` were pushed to
  `fork/codex/spaces-alpha-integration`.
- Wrangler deployed the corrected export at
  `https://d6bbc7bf.social-edriffles.pages.dev`; the canonical
  `https://plumblines.uk/` browser check verified the provider-labelled
  support copy, provider terms/privacy labels, `Following — Plumbline` home
  title, `/plumbline-mark.svg` favicon, and no visible error state. No
  credentials were read and no mutation was performed.

This makes three remaining provider-owned destinations inspectable without
pretending they are Plumbline-operated services. It does not change provider
policy, establish independent operator control, or close the external
Relay/AppView, short-TTL OAuth, or PLC-operator gates.

## 20. Iteration 14 — distinguish the account service from the repository PDS

The Services and Identity workbenches previously used the active account's
generic `service` value as a fallback for the repository host. For hosted
OAuth sessions that value can identify the login or account-entryway service,
not the PDS that stores the user's repository. This iteration aligns both
workbenches with the session-state contract: login authority and repository
hosting are separate rows, and an unavailable DID-backed PDS is shown as
unknown rather than inferred.

### Implementation and verification evidence

- `src/screens/Settings/ServicesSettings.tsx` now labels the generic service
  as `Account service (login)` and adds a separate `Repository PDS` row sourced
  only from `currentAccount.pdsUrl`. Missing DID-backed PDS state is rendered
  as `Not available from the DID-backed session state`.
- `src/screens/Settings/IdentitySovereigntySettings.tsx` now labels the PDS as
  `Repository PDS (from DID document)` and the generic service as
  `Session login service`; it no longer presents the login service as the PDS.
- Existing `session-data.ts` behavior and session-core coverage continue to
  prove that `pdsUrl` does not fall back to the login service. Targeted
  Prettier, Oxlint, and `git diff --check` pass; the focused session and
  identity suite passes (43 tests).
- Client commit `fc0898981` was pushed to
  `fork/codex/spaces-alpha-integration`.
- The generated web export contains `main.05652ee9.js` and Wrangler deployed
  it at `https://3096c3e8.social-edriffles.pages.dev`. The credential-free
  ChatGPT in-app-browser check of the canonical Plumbline deployment verified
  `Services — Plumbline`, the separate account-service and repository-PDS
  labels, the explicit unavailable PDS state, `Identity sovereignty —
  Plumbline`, and the separate identity labels. The home route remained
  `Following — Plumbline` with no visible error. No credentials were read and
  no mutation was performed.

This removes a user-facing authority conflation without claiming that the
client can discover a PDS when the DID-backed session state does not provide
one. It does not establish independent operators, close the external
Relay/AppView or short-TTL OAuth gates, or prove authenticated write flows.

## 21. Iteration 15 — recover the repository PDS during browser OAuth initialization

Hosted OAuth sessions can authenticate through an account entryway whose
`getSession` response does not include a DID document. The browser callback
path previously adopted that session without resolving the repository PDS,
leaving the Services workbench with no repository host and allowing the
pre-refresh request path to fall back to the login service. This iteration
uses the existing DID-backed resolver at that boundary and retains the result
through refresh and reconstruction.

### Implementation and verification evidence

- `src/state/session/oauth-session.ts` now resolves the repository PDS from
  the authenticated DID when the OAuth identity response omits `didDoc`.
  `OAuthSessionAdapter` retains the resolved or stored `pdsUrl` when rotating
  tokens, and sessions reconstructed from persisted accounts retain the same
  route. The login entryway remains the OAuth issuer; it is not relabeled as
  the PDS.
- The regression fixture covers an omitted `didDoc` response and asserts that
  the DID document's PDS endpoint is recovered. Focused OAuth, PDS-resolution,
  and session tests pass (23 tests), targeted Oxlint, Prettier, and web
  TypeScript pass, and the web export completes with only the existing
  bundle-size warnings.
- The exact export was deployed at
  `https://e6660482.social-edriffles.pages.dev`. The credential-free
  ChatGPT in-app-browser check of the canonical Plumbline deployment verified
  `Repository PDS https://pds.edriffles.us/`, a loaded home feed with posts,
  the owner profile, and `Profile media delivery` sourced from the account
  PDS. No credentials were read and no authenticated mutation was performed.

This repairs the browser cold-start routing gap without changing the
intentional `plumblines.uk` OAuth entryway or weakening DID/PDS authority
checks. It does not prove credentialed write flows, independent PLC operator
control, or the external Relay/AppView and short-TTL OAuth gates.

## 23. Iteration 16 — make the service authority map inspectable

The Services workbench already exposed provider registration and policy
controls, but the overview required users to infer the relationship between
identity, hosting, read providers, authorization, moderation, media, and
communities from separate rows and sections. This iteration adds a compact
capability map to the existing overview. It keeps the current session and
provider registry as the sources of truth; it does not add a new service or
make the bundled AppView authoritative.

### Implementation and verification evidence

- `src/screens/Settings/ServicesSettings.tsx` now presents an explicit
  capability map for Identity, Personal Data Server, AppView reads, Feeds,
  Moderation & Reach, Search, Notifications, Authorization, Media,
  Communities, and Exit & backups. Each row identifies the current source,
  state, explanation, and an `Inspect` action into the existing workbench
  section.
- Boundary-owned media and community services remain labeled as such instead
  of being exposed as AppView choices. Provider names and endpoints are still
  rendered as inspectable values, and no account credential is moved across a
  provider boundary by this UI change.
- The map keeps a wide table-like layout only at the wide-tablet breakpoint;
  narrower workspaces stack source and state details so the Inspector does not
  make the primary service surface unreadable.
- Targeted Prettier, Oxlint, and web TypeScript checks pass. The production web
  export completes with the existing bundle-size warnings and was deployed to
  `https://177916bd.social-edriffles.pages.dev` behind the canonical
  `https://plumblines.uk` host. The credential-free in-app-browser check found
  all eleven rows, no error state, and a working Identity inspection action.

This makes the service seams legible in one place while preserving the existing
authority boundaries. It does not establish independent operator control,
close the external Relay/AppView or short-TTL OAuth gates, or prove
credentialed write behavior.

## 23. Iteration 17 — route service inspection to the owning boundary

The capability map made service seams visible, but several `Inspect` actions
still opened a generic Services section even when the capability had an
existing authority-owned settings surface. This iteration keeps the map as
the entry point while routing each action to the screen that can actually
explain or change that boundary.

### Implementation and verification evidence

- `src/screens/Settings/ServicesSettings.tsx` now gives each row an explicit
  workbench destination. Provider-backed identity, AppView, feed, search,
  notification, and authorization rows remain in the Services workbench;
  Moderation & Reach opens moderation settings, Media opens Content & Media,
  Communities opens private Spaces settings, and Personal Data Server plus
  Exit & backups open Identity sovereignty.
- The destination is modeled as a typed Services-section or route target, so
  adding a capability row cannot silently turn its inspection action into a
  generic provider redirect.
- Prettier, Oxlint, web TypeScript, and the production web export pass. The
  export was deployed to `https://8ef923ad.social-edriffles.pages.dev` behind
  `https://plumblines.uk`. The credential-free ChatGPT in-app-browser check
  exercised all five route-backed actions, confirmed the expected URLs and
  titles, found no error state, and returned to the Services overview.

This makes the authority map actionable without adding a second settings
system or changing provider selection, PDS routing, OAuth grants, or account
data. It does not establish independent operators, close the external
Relay/AppView or short-TTL OAuth gates, or prove credentialed write behavior.

## 24. Remaining concentrations worth attacking next

1. Add a compatible, independently attributable media delivery composition contract only if it can preserve PDS blob authority and safe browser delivery; do not treat a CDN URL as a second authoritatively owned record.
2. Add credentialed multi-provider browser fixtures for revoked grants, migration, block boundaries, and partial service support without using production credentials.
3. Complete visible PLC disagreement/reconciliation evidence and independently operated resolver evidence; declared operator IDs are not sufficient.
4. Run a controlled Relay/AppView private-canary scan and a disposable short-TTL OAuth expiry/replay walkthrough; local tests cannot close those external gates.
5. Continue replacing remaining user-facing legacy product copy with the current Plumbline identity while preserving Edriffles Computer Web lineage and protocol identifiers.

## 25. Iteration 18 — persistent feed authority summary

The feed surface previously exposed its provider and ordering model only after
the user opened `Show feed details`. That made the ordinary timeline look
more authoritative than the underlying composed read actually was: a user
could see posts without seeing which feed and provider supplied the current
candidate set. The existing provenance inspector remains the detailed seam;
this iteration adds a compact summary beside it rather than creating a second
feed-state model.

### Authority before versus after

| Surface | Before iteration 18 | After iteration 18 |
| --- | --- | --- |
| Active feed context | Provider and ordering hidden behind an expansion | Feed name, ordering model, and source provider visible in the ordinary view |
| Provider substitution | Available from expanded details | Still available from the same existing inspector and Services route |
| Protocol evidence | Detailed feed/provider IDs remained inspectable | Detailed IDs remain inspectable; the summary does not imply verification or operator independence |

### Implementation and verification evidence

- `src/components/FeedProvenanceCard.tsx` now renders a compact, accessible
  `feed-provenance-summary` with the active feed name, algorithm/order label,
  and source provider. The existing expanded details retain provider DIDs,
  observations, health, privacy, feed URI, and change-provider controls.
- The summary uses the existing theme contrast token and Plumbline's vertical
  rule grammar. The disclosure control now has an explicit border while
  preserving its existing state and browser-visible interaction.
- The feed still receives candidates from the configured provider boundary;
  this UI change does not make a provider authoritative, add a hidden
  fallback, or move account credentials across services.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Feed attention model tests | PASS | `src/lib/attention-ui.test.ts` — 6 tests |
| Targeted Prettier | PASS | `pnpm exec prettier --check src/components/FeedProvenanceCard.tsx` |
| Targeted Oxlint | PASS | `pnpm exec oxlint --quiet src/components/FeedProvenanceCard.tsx` |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| Production-shaped web export | PASS | `pnpm run build-web`; export completed with the existing bundle-size warnings |
| Deployed browser verification | PASS | Wrangler deployment `https://4d5949ec.social-edriffles.pages.dev`; canonical `https://plumblines.uk/?deployment=4d5949ec` loaded in the ChatGPT in-app browser with 4 summaries, 1 feed-details control, 96 like controls, 32 reply controls, 32 repost/quote controls, and no application error |

This iteration improves ordinary-view legibility of feed authority without
claiming provider independence, cryptographic feed manifests, or completion
of the external OAuth/Relay/AppView/PLC gates.

## 26. Iteration 19 — delegated OAuth authority inspector

The Authorization workbench previously exposed only feature counts and upgrade
rows even though the existing OAuth scope ledger already distinguished posting,
profile editing, social graph, AppView, chat, Spaces, media, and notifications.
That presentation made delegated authority harder to inspect than provider
authority elsewhere in the workbench.

### Authority before versus after

| Surface | Before iteration 19 | After iteration 19 |
| --- | --- | --- |
| Feature grant | Count-only row or generic upgrade action | Progressive inspector with purpose, authority, resource, audiences, exact requested/granted/missing scopes, and feature-scoped upgrade |
| Session control | Revocation was explained in identity settings | Authorization states that the current integration revokes the whole OAuth session and exposes the existing logout action |
| Community authorization | Spaces prompts opened Providers | Spaces prompts open Authorization, where the missing grant can be inspected and upgraded |

### Implementation evidence

- `src/state/session/oauth-scopes.ts` derives presentation metadata from the
  existing scope constants and grant status. It is presentation-only and does
  not carry credentials.
- `src/components/AuthorizationProvenance.tsx` provides the progressive
  disclosure seam inside the existing Services workbench. DID, service, PDS,
  audiences, exact scope strings, purpose, status, and revocation boundary are
  selectable/inspectable without making protocol details mandatory for normal
  use.
- `src/screens/Settings/ServicesSettings.tsx` reuses `upgradeOAuthFeature` and
  `logoutCurrentAccount`; it does not invent a parallel authorization or
  revocation mechanism.
- `src/screens/CommunityBoardScreen.tsx` directs missing Spaces authorization
  to the new Authorization section.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| OAuth permission contract | PASS | `src/state/session/__tests__/oauth-scopes-test.ts` — 11 tests |
| Targeted Prettier | PASS | All five touched TypeScript/TSX files |
| Targeted Oxlint | PASS | All five touched TypeScript/TSX files |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| Production-shaped web export | PASS | `pnpm run build-web`; completed with existing bundle-size warnings |
| Client commit and fork push | PASS | `168a70986 ui: expose delegated oauth authority`; pushed to `https://github.com/Shikibashi/social-app` branch `codex/spaces-alpha-integration` |
| Hosted anonymous/home check | PASS | Wrangler Pages deployment `https://53c2d93b.social-edriffles.pages.dev`; canonical `https://plumblines.uk/?deployment=53c2d93b` rendered Plumbline branding, feed posts, and no application error in the in-app browser |
| Hosted Authorization workbench check | PASS | `https://plumblines.uk/settings/services?section=authorization&deployment=53c2d93b` exposed and expanded delegated authority, requested scopes, feature upgrades, and whole-session revocation text without an application error |

This is a UI/provenance slice, not an action-level permission enforcement
claim. Posting, likes, profile editing, chat, and Spaces behavior remains on
the existing compatibility path until the separate caller-level preflight
batch is implemented and verified.

## 27. Iteration 20 — action-level OAuth preflight

The Authorization inspector exposed feature grants, but the principal write
surfaces did not yet enforce those grants before optimistic state or network
mutation. Plumbline now uses the existing OAuth feature ledger and upgrade API
at the action boundary.

- `oauth-authority.ts` is a pure, testable decision contract; it does not
  inspect or store credentials.
- `oauth-feature-gate.ts` requests one missing feature at a time, deduplicates
  concurrent prompts, and stops the current attempt until the refreshed
  session is rendered.
- Posts, likes, reposts, profile edits, media uploads, chat mutations, and
  Spaces/private-record actions gate before optimistic updates, uploads, or
  writes. Password sessions and legacy-compatible grants retain their existing
  behavior.
- The OAuth client still owns PAR, PKCE, DPoP, refresh, state, and storage;
  this boundary only prevents a caller from using an insufficient grant.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| OAuth authority contract | PASS | `src/state/session/__tests__/oauth-authority-test.ts` and `oauth-scopes-test.ts` — 15 tests |
| Prettier | PASS | All touched TypeScript/TSX files |
| Oxlint | PASS | All touched TypeScript/TSX files |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| Diff hygiene | PASS | `git diff --check` |

This is a bounded mutation slice rather than a claim that every settings or
chat-administration RPC has a feature preflight. Credentialed browser writes,
external Relay/AppView privacy evidence, short-TTL OAuth expiry evidence, and
independent PLC operator evidence remain separate gates.

### Hosted release evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Production-shaped export | PASS | `pnpm run build-web` from client revision `d1f8c0d52`; only the existing bundle-size warnings were emitted |
| Canonical home | PASS | Wrangler deployment `https://68880dc6.social-edriffles.pages.dev`, inspected at `https://plumblines.uk/?deployment=68880dc6`; title `Following — Plumbline`, posts present, no application error |
| Branding asset | PASS | Published document advertises `/plumbline-mark.svg` as the favicon |
| Authorization workbench | PASS | The deployed `settings/services?section=authorization` route expanded the delegated-authority inspector with feature authority, upgrades, and whole-session revocation text |
| Credentialed mutation walkthrough | NOT RUN | The browser check was read-only; no credential or live social mutation was used |

## 28. Iteration 21 — make authority seams visible and addressable

The composition inspector already preserved provider observations, but on
profile, search, notification, thread, and label surfaces the ordinary view
only exposed an inspection link. The Services workbench also changed sections
locally without putting the selected authority surface in the browser URL.

### Authority before versus after

| Surface | Before iteration 21 | After iteration 21 |
| --- | --- | --- |
| Composed public reads | Source and reconciliation state were hidden until expansion | A compact Source / Rule / State summary is visible before expansion; full observations remain one action away |
| Reconciliation language | Policy modes could appear as internal identifiers | The inspector uses user-facing labels while retaining the same policy semantics |
| Services workbench | Section selection was local component state | Section selection updates the route parameter, so a service inspection can be copied, refreshed, and revisited |

### Implementation evidence

- `src/components/ProviderCompositionProvenance.tsx` reuses the existing
  composition result to show participating provider names, the local rule,
  and the observed state. It does not infer operator independence or promote
  an unverified claim.
- `src/screens/Settings/ServicesSettings.tsx` routes all in-workbench section
  changes through `navigation.setParams`, preserving the existing
  `ServicesSettingsSection` contract and incoming deep links.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Provider composition semantics | PASS | Existing `src/lib/provider-composition.test.ts` coverage retained; no selection or verification logic changed |
| Targeted formatting/lint/type checks | PASS | Prettier, Oxlint, and `pnpm run typecheck:web` passed for the changed client boundary |
| Public browser summary | PASS | Canonical `https://plumblines.uk/profile/davidwilliampippy.bsky.social?deployment=fdd04899` rendered Plumbline branding, `Source:`, `Rule:`, and `State:` with no application errors or Lingui ID artifacts |
| Services workbench content | NOT RUN | The in-app browser was logged out; the `section=providers` deep-link parameter was preserved, but authenticated workbench content was not exercised without a credential |

This iteration improves inspectability and browser addressability without
claiming provider independence, changing write routing, or closing the
external OAuth, Relay/AppView, short-TTL, or PLC operator gates.

## 29. Iteration 22 — align authority summaries across read surfaces

The compact Source / Rule / State seam introduced for composed provider reads
was not yet shared by feed provenance, identity resolution, or profile-media
provenance. Identity evidence also retained the reconciliation policy only in
the query key and resolver call, which made the rule harder for a screen to
show beside the claims it governed.

### Authority before versus after

| Boundary | Before iteration 22 | After iteration 22 |
| --- | --- | --- |
| Feed provenance | Feed name and provider appeared in a bespoke summary with no explicit rule or state. | The existing feed algorithm/objective, provider, health, and composition state are shown through the shared Source / Rule / State summary. |
| Identity resolution | Resolver evidence was available after expansion, while the selected policy was not carried in the result. | Resolver sources and unavailable providers are visible before expansion, and the result carries the user-owned reconciliation policy into the inspector. |
| Profile media | The account-PDS delivery seam was hidden until expansion. | The ordinary profile view identifies the account PDS as record authority while retaining CID and delivery details behind the inspector. |

### Implementation evidence

- `src/components/PlumblineAuthoritySummary.tsx` is a presentation-only
  seam. It consumes source, rule, and state already produced by the existing
  provider or record boundary; it does not select a provider or mint access.
- `src/components/FeedProvenanceCard.tsx`,
  `src/components/IdentityResolutionProvenance.tsx`,
  `src/components/MediaDeliveryProvenance.tsx`, and
  `src/components/ProviderCompositionProvenance.tsx` use the same compact
  layout while retaining their detailed inspectors.
- `src/lib/identity-runtime.ts` and `src/state/queries/resolve-uri.ts` carry
  the existing `IdentityResolutionPolicy` through direct, resolved, invalid,
  and cached claim results. No resolver is promoted to a universal authority.

### Interoperability and security tradeoffs

The change is additive to the `IdentityClaimsResult` shape and preserves the
existing fail-closed disagreement behavior. Source text may include provider
IDs when no display name is available, which is intentionally attributable
rather than silently replaced with a generic network label. The profile-media
summary identifies the account PDS as the record authority but does not claim
that its CDN or AppView delivery path is independently authoritative.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Resolver/provider behavior | PASS | `src/lib/provider-composition.test.ts`, `src/lib/attention-ui.test.ts`, and `src/lib/identity-runtime.test.ts` — 3 suites, 34 tests |
| Targeted formatting and lint | PASS | Prettier and Oxlint passed for all changed TypeScript/TSX files |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| Production-shaped web export | PASS | `pnpm run build-web`; completed with existing bundle-size warnings |
| Public browser verification | PASS | Wrangler deployment `https://f01fb7c9.social-edriffles.pages.dev`; canonical `https://plumblines.uk/?deployment=f01fb7c9` rendered `Following — Plumbline` with four feed Source / Rule / State summaries and no page alerts; the profile route rendered identity and profile-provider summaries, posts, and Plumbline favicon links |

This iteration improves disclosure at an existing boundary. It does not
claim authenticated write verification, independent PLC operator control, or
closure of the external Relay/AppView and short-TTL OAuth gates.

## 30. Iteration 23 — make user-held PLC recovery authority registrable

The identity screen could prepare a non-exportable browser key, but key
generation alone did not give that key any PLC authority. The missing boundary
was an explicit, user-triggered path from a prepared key to a PDS-signed PLC
operation that includes the key in the DID document.

### Residual concentration and why it matters

The account PDS still controls the initial PLC operation and the bootstrap
email authorization. Without a registration path, the user-held key was only
local custody metadata and could not support later recovery or rotation. This
was a real concentration of authority, not a presentation problem.

### Ecosystem precedent and chosen change

The implementation follows the protocol's account-recovery and migration
model: the PDS requests an authorization code, returns recommended DID
credentials, signs an updated operation, and accepts a signed operation at the
standard identity endpoint. The client uses the smallest currently supported
scope for these APIs, `identity:*`, only when the user activates registration.
See [Account Recovery](https://atproto.com/guides/account-recovery), [Account
Migration](https://atproto.com/guides/account-migration), and [ATProto
Permissions](https://atproto.com/specs/permission).

The identity workbench now:

- exposes `identity-recovery` as a separate OAuth feature rather than treating
  the legacy generic grant as sufficient;
- requests the PDS email authorization code only after the user asks to
  register a key;
- preserves existing PDS rotation keys while adding the user-held key with
  explicit duplicate and five-key-limit validation;
- validates the returned PLC operation shape before it reaches the submit
  boundary; and
- checks verified resolver claims after submission, showing resolver
  disagreement or missing evidence instead of inferring registration.

### Authority before versus after

| Boundary | Before iteration 23 | After iteration 23 |
| --- | --- | --- |
| Browser key | A non-exportable key could be prepared, but preparation granted no network authority. | The key remains non-exportable and inert until the user explicitly authorizes registration. |
| Bootstrap registration | Only the account PDS could be used through an implicit broad session boundary. | The PDS still performs the email-authorized bootstrap, but the client asks for the separate `identity:*` grant only for this feature and makes the requested operation visible. |
| Ongoing identity evidence | Local metadata could be mistaken for recovery readiness. | Registration is reported only from verified PLC resolver claims; unavailable or disagreeing resolvers remain visible. |

This does not claim that the client has completed every migration, recovery,
lockdown, or native secure-key workflow. It also does not claim operator
independence for the configured resolvers.

### Interoperability and security tradeoffs

`identity:*` is intentionally high-impact and remains opt-in. It is not added
to the ordinary login grant, and the identity screen does not persist the
one-time email code. The PDS remains the authorization and account-state
boundary for the initial registration; the browser only holds the generated
private key and submits the standard signed operation. Resolver propagation
may lag, so the UI separates submitted state from verified directory evidence.

### Implementation evidence

- `src/state/session/oauth-scopes.ts` adds the feature-scoped identity grant
  and prevents `transition:generic` from satisfying it.
- `src/screens/Settings/IdentitySovereigntySettings.tsx` wires the opt-in
  request, credential merge, PDS sign/submit flow, account-switch token
  clearing, and resolver-evidence status.
- `src/lib/plc-key-custody.ts` owns key-set preservation, duplicate handling,
  and the maximum-key invariant.
- `src/lib/plc-history.ts` validates the signed operation before submission.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Focused identity/OAuth/PLC tests | PASS | 6 suites, 51 tests, including scope isolation, PLC history parsing, custody authorization, and the five-key limit |
| Targeted formatting and lint | PASS | Prettier and Oxlint passed for all changed files |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| Android TypeScript | FAIL | Existing unrelated fixture/type errors in session, provider, post, route, and `Logomark.tsx` checks; no changed identity/OAuth diagnostic |
| Full repository Oxlint | FAIL | Existing unrelated import-sort, unused-variable, and Spaces diagnostics; no changed identity/OAuth diagnostic |
| Contract validator | PASS | `python3 scripts/validate_contract.py` — 144 files, 29 blocking rows, 6 feed cases |
| Authenticated browser registration | NOT RUN | No credentialed browser session or disposable identity was available |
| Production-shaped web export | PASS | `pnpm run build-web`; compiled with existing bundle-size warnings and generated the deployed `web-build` export |
| Deployed browser UI | PASS | Wrangler deployment `https://4f0f137f.social-edriffles.pages.dev`; canonical `https://plumblines.uk/?deployment=4f0f137f` rendered `Following — Plumbline`, posts, four provenance summaries, Plumbline icon links, and no page alerts; `/settings/identity-sovereignty` rendered the current identity/PDS workbench with no alerts |

The next remaining concentrations are the PDS-controlled bootstrap email,
the unresolved external PLC operator-independence gate, and the still-open
Relay/AppView and short-TTL OAuth evidence gates.

## 31. Iteration 24 — align route selection with the Plumbline workbench

The shell's route controls still inherited pill geometry and communicated the
current location mainly through color and weight. That made the workbench
look like a generic social client at the exact point where navigation context
should be inspectable at a glance.

### Residual concentration and why it matters

This was a presentation concentration rather than a provider or identity
authority concentration: the shared shell's default geometry made the
application's own navigation state implicit. Users could not reliably see the
alignment boundary that connected a selected route to the active workspace.
The missing signal weakened the Plumbline Test questions "what is happening?"
and "according to whose rule?" without changing the underlying route authority.

### Ecosystem/design precedent and chosen change

The change follows the approved Plumbline `DESIGN.md` geometry and the
existing ECW workbench model: structural rules carry context, square controls
remain browser-native, and the interface exposes detail progressively. A
shared line-and-bob marker now accompanies the selected desktop route. The
interactive route also exposes selected state through the existing
accessibility contract, while the marker itself remains decorative. The
compose control uses the same square web geometry so the shell does not give
one command a separate visual grammar.

### Authority before versus after

| Boundary | Before iteration 24 | After iteration 24 |
| --- | --- | --- |
| Route selection | The selected route was conveyed mostly by inherited pill styling, color, and text weight. | The selected route retains those cues and adds an explicit theme-aware alignment line plus brass bob; selected state is also exposed to assistive technology. |
| Shell geometry | Desktop navigation and compose used rounded web controls inherited from the upstream client. | Web navigation and compose use Plumbline's square one-pixel control radius; avatar and semantic count shapes remain unchanged. |
| Branding token | Plumbline brass was repeated in the mark implementation. | `PLUMBLINE_BRASS` is shared by the mark and selection marker, keeping identity color centralized without reusing it for semantic warnings or success. |

### Interoperability and security tradeoffs

The change is web-scoped presentation only. It does not alter route URLs,
PDS/AppView selection, OAuth grants, social mutations, protocol records, or
native layout behavior. The marker is `aria-hidden`, pointer-transparent, and
does not reduce the 48px target. `accessibilityState.selected` remains on the
interactive route control. No new dependency or network authority was added.

### Implementation evidence

- `src/view/shell/PlumblineSelectionMarker.tsx` owns the shared line-and-bob
  geometry and uses the theme border plus `PLUMBLINE_BRASS`.
- `src/view/shell/desktop/LeftNav.tsx` applies the marker, selected state,
  square web geometry, stable test IDs, and unchanged route links.
- `src/lib/brand.ts` owns `PLUMBLINE_BRASS`, and
  `src/view/icons/PlumblineBrandMark.tsx` consumes it for the mark.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet` on the four changed client files |
| Touched-file formatting and whitespace | PASS | Prettier check and `git diff --check` |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| Focused brand test | PASS | `pnpm test -- --runInBand src/lib/brand.test.ts` — 3 tests |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm run build-web` |
| Pages delivery | PASS | Production deployment `151da74a`, source `e330ff0` |
| Canonical browser shell | PASS | `https://plumblines.uk/?deployment=151da74a` in the ChatGPT in-app browser: Plumbline title, provenance, square 1px route controls, Home marker, 48px targets, no alert |
| Narrow browser shell | NOT RUN | Persistent in-app browser connector does not expose viewport resizing |

This iteration improves shell disclosure without making a presentation
component an authority. The remaining concentrations are the PDS-controlled
bootstrap email, the unresolved external PLC operator-independence gate, and
the still-open Relay/AppView and short-TTL OAuth evidence gates.

## 32. Iteration 25 — make horizontal tab selection inspectable

The shared web tab bar still used the upstream blue-only underline and did
not expose the selected tab through an explicit web attribute. That left Home
and profile section changes visually recognizable only through inherited
color and weight, even though these tabs define the active document surface.

### Residual authority concentration

This was a local presentation concentration, not a network authority. The
client's inherited tab styling made active-surface state less inspectable and
made the Plumbline alignment grammar stop at the side navigation. It did not
change which provider, record, or policy supplied the content.

### Ecosystem/design precedent and chosen architectural change

The change extends the existing ECW tab interaction at its shared web
composition point. Each tab now carries the platform's selected accessibility
state and an explicit `aria-selected` value. The existing blue selection rule
remains the semantic contrast cue; a small brass diamond is added as the
Plumbline alignment marker. The marker is decorative, pointer-transparent,
and available through stable test IDs for browser verification.

### Authority before versus after

| Boundary | Before iteration 25 | After iteration 25 |
| --- | --- | --- |
| Active tab | Selection was conveyed through text weight and a generic blue underline. | The same cues remain, with explicit selected state and a brass alignment marker. |
| Accessibility state | The web tab had `accessibilityRole="tab"` without a selected-state value. | The tab exposes `accessibilityState.selected` and `aria-selected`; the decorative marker is `aria-hidden`. |
| Provider and protocol authority | Unchanged and owned by the existing feed/profile composition. | Unchanged; this is a web-only presentation and disclosure update. |

### Interoperability and security tradeoffs

No route, URL, PDS/AppView selection, OAuth grant, record mutation, storage,
provider, or protocol behavior changed. The marker uses the existing
Plumbline brass token, is not a semantic warning or success color, and does
not reduce the existing tab target sizes. The native tab bar is unchanged.

### Implementation evidence

- `src/view/com/pager/TabBar.web.tsx` adds the selected-state attributes,
  stable indicator/marker test IDs, and the horizontal brass marker while
  retaining the existing tab interaction and blue selection rule.
- `src/lib/brand.ts` remains the single source for `PLUMBLINE_BRASS`.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet src/view/com/pager/TabBar.web.tsx` |
| Formatting and whitespace | PASS | Prettier check and `git diff --check` |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm run build-web`; existing bundle-size warnings remain |
| Client push | PASS | `80b823b95` pushed to `fork/codex/spaces-alpha-integration` |
| Production Pages upload | PASS | `https://d15a243a.social-edriffles.pages.dev`, source `80b823b95` |
| Home browser inspection | PASS | `https://plumblines.uk/?deployment=d15a243a`: selected `Following` tab, `aria-selected=true`, brass marker, no alert |
| Profile browser inspection | PASS | `https://plumblines.uk/profile/edriffles.us?deployment=d15a243a`: selected `Posts` tab, `aria-selected=true`, brass marker, no alert |

This iteration improves active-surface disclosure without adding a new
authority. The external Relay/AppView, short-TTL OAuth, and independent-PLC
operator gates remain separate and unresolved.

## 33. Iteration 26 — make the desktop right rail a contextual inspector

The desktop right rail was still primarily a generic search, feed-shortcut,
progress, live-event, and trending rail. That composition made the
Inspector role in the Plumbline workbench implicit: a user could see related
content, but could not quickly answer which source, rule, and user control
applied to the current surface.

### Residual authority concentration and why it matters

This was a presentation and explanation concentration, not a new network
authority. The shell visually privileged discovery and engagement-adjacent
content over explanation of the selected workspace. That weakened the
Plumbline Test questions "what is happening?", "who or what caused it?", and
"what can I change?" even though the underlying Services and provenance
implementations already supported those distinctions.

### Ecosystem/design precedent and chosen change

The change follows ECW Workbench Mode and the existing Services workbench
instead of creating a second provider registry or a second policy engine. A
route-aware `DesktopWorkbenchInspector` now occupies the top of the desktop
right rail and describes the current surface using four explicit fields:
route, source, rule, and control. It links to the existing feed or Services
surface for the corresponding user action. The page-level provenance
components remain the detailed source of record; this inspector is a
progressive, compact summary.

The feed shortcut list also now exposes stable test IDs and selected state,
uses the existing scroll boundary for long lists, and applies Plumbline's
square web control geometry without changing avatar or semantic shapes.

### Authority before versus after

| Boundary | Before iteration 26 | After iteration 26 |
| --- | --- | --- |
| Desktop right rail | Search, shortcuts, progress, events, and trends appeared without a contextual explanation of the workspace. | The inspector identifies the route, source category, governing rule, and available control before the existing secondary content. |
| Provider disclosure | Detailed provenance existed on some pages, but the shell did not consistently point to the relevant service boundary. | Route-level summaries point to the existing Services or feed controls; detailed page provenance remains authoritative and inspectable. |
| Feed selection | Feed links had hover/current styling but no stable web test identity or selected accessibility state. | Feed links expose `accessibilityState.selected`, stable `plumbline-feed-*` test IDs, and unchanged browser-native links. |
| Authority ownership | No new authority was created, but the shell did not make that fact legible. | The inspector is descriptive only; provider selection, policy, identity, and social-record authority remain in their existing modules. |

### Interoperability and security tradeoffs

This is a web-scoped shell and disclosure change. It does not change route
URLs, PDS or AppView selection, OAuth grants, provider reconciliation,
records, storage, social mutations, or native layout. The inspector consumes
the existing pinned-feed and selected-feed state and links to existing
routes. It does not fetch a privileged provider or silently promote a result.
The selected feed state is exposed to assistive technology, while the
decorative geometry remains non-interactive. New English messages were
extracted and compiled so production does not display Lingui message IDs.

### Implementation evidence

- `src/view/shell/desktop/RightNav.tsx` adds the route-aware
  `DesktopWorkbenchInspector` and square, bordered workbench presentation.
- `src/view/shell/desktop/Feeds.tsx` adds selected-state disclosure, stable
  test IDs, and square web geometry for feed shortcuts and the More feeds
  control.
- `src/locale/locales/en/messages.po` records the inspector strings; the
  generated catalog is compiled by the existing `intl:compile` workflow.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet src/view/shell/desktop/RightNav.tsx src/view/shell/desktop/Feeds.tsx`; the pre-commit Oxlint hook also passed after correcting the accessibility role and hint. |
| Formatting and whitespace | PASS | Prettier check and `git diff --check` |
| Web TypeScript | PASS | `pnpm run typecheck:web` |
| English catalog extraction/compile | PASS | `pnpm intl:extract` and `pnpm intl:compile`; deployed inspector copy is readable English rather than message IDs |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm run build-web`; existing bundle-size warnings remain |
| Client commits and push | PASS | `3c018fd02` UI implementation and `5f836207a` catalog fix pushed to `fork/codex/spaces-alpha-integration` |
| Pages delivery | PASS | `https://46c0c74f.social-edriffles.pages.dev`, deployment source recorded as `5f836207a` |
| Logged-out browser inspection | PASS | Deployment host showed `Create account` and `Sign in`, the inspector, selected Discover tab, no alerts, and the Plumbline title |
| Canonical Home inspection | PASS | `https://plumblines.uk/`: `Following — Plumbline`, inspector source/rule/control copy, 1px inspector radius, selected tab marker, Plumbline favicon, no alerts |
| Canonical profile inspection | PASS | `/profile/edriffles.us`: profile inspector, selected Posts tab marker, loaded PDS/CDN media, no alerts |
| Canonical post inspection | PASS | `/profile/edriffles.us/post/3mu6ho5o4cc2w`: post-thread inspector, reply/repost/like controls present, no alerts |
| Narrow browser inspection | NOT RUN | Persistent ChatGPT in-app browser connector does not expose viewport resizing |

This iteration makes the existing seams legible without turning the shell
into a privileged provider. The external Relay/AppView, short-TTL OAuth, and
independent-PLC operator gates remain separate and unresolved.

## 34. Iteration 27 — make the Chat OAuth boundary explicit

The Chat route could previously call the chat service without the separately
scoped chat grant. When that grant was absent, the user saw a raw RPC error
(`Missing required scope`) instead of an actionable explanation of the
delegation boundary. The same gap affected chat status, unread-count,
conversation-list, request-inbox, and direct-conversation reads.

### Residual authority concentration and why it matters

The problem was an ambient-authority concentration at the client/service
boundary: route entry and query execution implicitly treated the chat service
as available even when the user had not delegated the chat capability. That
made a provider error look like an application failure and gave the service
an opportunity to be contacted before the user had made an explicit choice.

### Ecosystem precedent and chosen change

The implementation reuses current ATProto OAuth feature-scoped permission
behavior already present in this client: `requiresOAuthFeatureUpgrade`,
`useEnsureOAuthFeature`, and the Services authorization provenance surface.
It does not create a second grant registry or a project-specific permission
protocol. Chat reads are disabled when the grant is absent, the main Chat and
request-inbox routes render an explicit authorization panel, and consent is
started only after the user selects `Authorize this feature`. The routes use
the existing Workbench presentation mode and link to the existing Services
authorization section.

### Authority before versus after

| Boundary | Before iteration 27 | After iteration 27 |
| --- | --- | --- |
| Chat read access | Query hooks could contact the chat service and surface a raw missing-scope response. | Chat status, unread, conversation, request, and direct-conversation reads are disabled until the chat grant exists. |
| Permission UX | The missing capability appeared as an implementation error with no clear next action. | The user sees the feature, why more authority is needed, an explicit authorization action, and a Services inspection path. |
| Provider authority | The route implicitly assumed the chat provider was available for the session. | The provider is contacted only after the relevant user delegation is present; existing password-session and legacy compatibility behavior remain intact. |
| Exit and revocation | Existing Services controls remained available, but the route did not explain the missing grant. | The route points to the existing authorization workbench, without adding hidden fallback or automatic consent. |

### Interoperability and security tradeoffs

This is a client-side authorization boundary. It preserves the existing
ATProto OAuth scope, PAR/PKCE/DPoP flow, password-session compatibility, and
legacy `transition:chat.bsky` compatibility. It does not broaden grants,
weaken service authentication, change records, or claim that Chat mutations
work without a granted chat capability. The tradeoff is that a user must
authorize Chat before using it; that is intentional progressive delegation.
The panel uses the existing English catalog and does not expose tokens or
credential material.

### Implementation evidence

- `src/components/AuthorizationProvenance.tsx` exports the reusable
  `OAuthFeatureAccessPrompt` for explicit feature-scoped authorization.
- `src/state/queries/messages/get-status.ts` and
  `src/state/queries/messages/get-unread-counts.ts` gate global Chat reads.
- `src/state/queries/messages/list-conversations.tsx`,
  `src/state/queries/messages/list-conversation-requests.tsx`, and
  `src/state/queries/messages/conversation.ts` gate list and direct-conversation
  reads while preserving caller enablement.
- `src/screens/Messages/ChatList.tsx` and `src/screens/Messages/Inbox.tsx`
  render the explicit panel, suppress unavailable controls, and expose the
  Chat routes as Workbench surfaces.
- `src/locale/locales/en/messages.po` contains the extracted English strings;
  the existing compile workflow generated the runtime catalog.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet` over all eight touched TypeScript/TSX files |
| English catalog extraction/compile | PASS | `pnpm intl:extract && pnpm intl:compile` |
| Web TypeScript | PASS | `pnpm typecheck:web` |
| OAuth authority tests | PASS | `pnpm test -- src/state/session/__tests__/oauth-authority-test.ts src/state/session/__tests__/oauth-scopes-test.ts`; 15 tests |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm build-web`; existing bundle-size warnings remain |
| Client commit and push | PASS | `9d1f6c6fc` pushed to `fork/codex/spaces-alpha-integration` |
| Pages deployment | PASS | `https://49ede667.social-edriffles.pages.dev` uploaded to `social-edriffles` |
| Logged-out deployment shell | PASS | `/?audit=chat-oauth-9d1f6c6fc` showed Sign in/Create account, Plumbline title, and no alert |
| Logged-out deployment Chat route | PASS | `/messages?audit=chat-oauth-9d1f6c6fc` showed the logged-out shell without a missing-scope error |
| Canonical signed-in Chat route | PASS | `https://plumblines.uk/messages?audit=chat-oauth-9d1f6c6fc` showed Additional authorization required, Authorize this feature, and Open Services; no raw scope error |
| Canonical signed-in request inbox | PASS | `https://plumblines.uk/messages/inbox?audit=chat-oauth-9d1f6c6fc` showed the same explicit boundary; no raw scope error |
| Repository-wide lint | FAIL (baseline) | Existing unrelated import-sort, type, and suppression-manifest diagnostics remain outside this slice |

This iteration removes the ambient Chat read assumption without creating a
new sovereign intermediary. The external Relay/AppView, short-TTL OAuth, and
independent-PLC operator gates remain separate and unresolved.

## 35. Iteration 28 — make the Spaces authorization boundary explicit

The Communities route still attempted to read the account/community directory
and selected community metadata while an OAuth session lacked the separate
Spaces permission. The resulting empty directory and generic PDS error made a
missing delegation look like missing community data, and the create-community
control could still open a form before the user had authorized the feature.

### Residual authority concentration and why it matters

This was an ambient-authority concentration at the Spaces control-plane
boundary. A community directory or metadata provider could be contacted by
route entry without an explicit user delegation, while the UI obscured the
distinction between an unavailable provider and an ungranted capability.
That weakened both progressive authorization and the user's ability to tell
whether the community actually existed.

### Ecosystem precedent and chosen change

The change reuses the existing ATProto feature-scoped OAuth machinery and the
community directory's existing provider-composition seam. Both community
directory and selected-community queries are disabled until the Spaces grant
is present. The directory instead renders the shared explicit authorization
panel, `New community` is disabled, and the selected-space branch is withheld
until authorization succeeds. The panel's explanation now identifies the
feature-specific authority rather than hard-coding the Chat service.

### Authority before versus after

| Boundary | Before iteration 28 | After iteration 28 |
| --- | --- | --- |
| Community directory | Could contact the account/authority PDS without the Spaces grant and show an empty/unavailable result. | No directory request is made until the user has delegated Spaces. |
| Community metadata | A deep-linked space could trigger a metadata read without the required feature grant. | Selected-space metadata is also disabled until the same grant is present. |
| Write affordance | New community could open before authorization and fail later in the mutation. | New community is disabled and authorization is offered at the read boundary. |
| User explanation | Generic PDS availability text hid the missing delegation. | The shared panel identifies `Spaces`, the Spaces authority, and the explicit Services path. |

### Interoperability and security tradeoffs

This preserves the existing Spaces OAuth scope, private Space transport,
provider composition, record formats, and mutation assertions. It does not
make communities public, add a fallback provider, or change membership or
posting semantics. A user with a password session or an OAuth session that
already has the Spaces grant keeps the existing path. A user without the
grant must authorize it explicitly, which prevents unintended reads and
avoids treating a provider error as a data claim.

### Implementation evidence

- `src/components/AuthorizationProvenance.tsx` now describes the resource
  associated with each feature-scoped authorization prompt.
- `src/screens/CommunityBoardScreen.tsx` gates directory and metadata reads,
  disables the create control without Spaces authority, and uses the shared
  Spaces authorization panel.
- `src/locale/locales/en/messages.po` contains the extracted feature-specific
  authorization message.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet src/components/AuthorizationProvenance.tsx src/screens/CommunityBoardScreen.tsx` |
| Touched-file formatting and whitespace | PASS | Prettier check and `git diff --check` |
| Web TypeScript | PASS | `pnpm typecheck:web` |
| English catalog extraction/compile | PASS | `pnpm intl:extract && pnpm intl:compile`; 3311 source messages |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm build-web`; existing bundle-size warnings remain |
| Client commit and push | PASS | `c82c4303b` pushed to `fork/codex/spaces-alpha-integration` |
| Pages deployment | PASS | `https://8aefbf18.social-edriffles.pages.dev` uploaded to `social-edriffles` |
| Logged-out deployment community route | PASS | Fresh deployment showed the logged-out shell without a raw scope or community error |
| Canonical signed-in community route | PASS | `https://plumblines.uk/community?audit=spaces-oauth-c82c4303b` showed the Spaces authorization panel, `Feature: Spaces`, `Open Services`, and a disabled `New community` control |
| Legacy community error | PASS | The old `Communities are unavailable or not authorized on this PDS` message was absent from the canonical route |
| Repository-wide lint | FAIL (baseline) | Existing unrelated import-sort, type, and suppression-manifest diagnostics remain outside this slice |

This iteration removes the ambient Spaces read assumption without creating a
new sovereign intermediary. The external Relay/AppView, short-TTL OAuth, and
independent-PLC operator gates remain separate and unresolved.

## Iteration 29: expose the profile-media record and delivery seam

The profile already used the account PDS as the source of truth for the
signed-in owner's avatar and banner CIDs, but the inspector exposed only the
PDS origin and opaque blob references. That made it difficult to answer which
AT record established the media or to open the exact source URL in a browser.

### Residual authority concentration and why it matters

The remaining problem was presentation ambiguity rather than a missing media
provider. A CDN or AppView-derived image URL could look like the author of the
media even though the profile record and blob CID are account-owned. Adding a
second media-provider registry would increase machinery without dispersing
that authority. The high-value change was to make the existing record-to-
delivery boundary inspectable and browser-addressable.

### Ecosystem precedent and chosen change

The implementation follows ATProto's existing repository/blob split: the
`app.bsky.actor.profile/self` record identifies the authored blob CID, while
`com.atproto.sync.getBlob` is a PDS delivery method. The existing
`MediaDeliveryProvenance` component now localizes the authority summary,
exposes the profile AT URI, derives exact avatar/banner PDS blob URLs from the
record-owned CIDs, and renders ordinary external links to those sources. It
does not treat a CDN, AppView, or delivery URL as a second author of the
media.

### Authority before versus after

| Boundary | Before iteration 29 | After iteration 29 |
| --- | --- | --- |
| Media authority | The UI named the Account PDS and CIDs, but did not expose the profile record address. | The inspector identifies the Account PDS profile record and exposes `at://…/app.bsky.actor.profile/self` as selectable evidence. |
| Delivery path | The PDS origin and method were visible, but the user had no direct source action. | The UI derives and opens the exact avatar/banner `com.atproto.sync.getBlob` URLs. |
| Provider semantics | A cached AppView/CDN image could be mistaken for the record source. | The summary and note distinguish authored record/CID authority from transport delivery and cached views. |
| Exit and inspection | Users could read opaque values but had no direct browser path to inspect the media source. | Users can copy the record/CID values or open each direct PDS source in a new browser context. |

### Interoperability and security tradeoffs

This is a backward-compatible UI and provenance extension. It preserves the
ATProto profile record, DID, CID, and standard `com.atproto.sync.getBlob`
semantics. It does not add a privileged media service, rewrite third-party
profile media, weaken URL validation, or grant new write authority. The
external source links are derived only from an already validated HTTP(S) PDS
origin and the record-owned CID; the existing endpoint normalization remains
the gate. The tradeoff is that direct PDS delivery can have different caching
or availability from an AppView/CDN, which is made explicit rather than
silently hidden.

### Implementation evidence

- `src/lib/api/account-profile.ts` adds the profile record AT URI to
  `AccountProfileMediaProvenance` and keeps direct blob URL derivation at the
  account-PDS boundary.
- `src/components/MediaDeliveryProvenance.tsx` localizes the authority
  summary, exposes the record URI, and adds accessible browser-native links
  for avatar and banner sources.
- `src/lib/api/account-profile.test.ts` verifies the new record URI while
  retaining the existing PDS-owned media and endpoint safety cases.
- `src/locale/locales/en/messages.po` contains the extracted English UI
  messages.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet` over the media API, test, and component files |
| Touched-file formatting and whitespace | PASS | Prettier check and `git diff --check` |
| Account-profile tests | PASS | `pnpm exec jest src/lib/api/account-profile.test.ts --runInBand`; 6 tests |
| Web TypeScript | PASS | `pnpm typecheck:web` |
| English catalog extraction/compile | PASS | `pnpm intl:extract && pnpm intl:compile`; 3321 source messages |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm build-web`; existing bundle-size warnings remain |
| Client code commit and push | PASS | `91f7e4314` pushed to `fork/codex/spaces-alpha-integration` |
| Decision record commit and push | PASS | `2bd0816f0` pushed to `fork/codex/spaces-alpha-integration` |
| Pages deployment | PASS | `https://aad5cdf4.social-edriffles.pages.dev` uploaded to `social-edriffles` using Node `v24.19.0` |
| ChatGPT in-app browser profile inspection | PASS | Canonical `https://plumblines.uk/profile/edriffles.us?audit=profile-media-91f7e4314` showed the authority summary, record URI, source links, and no alert |
| Direct media load | PASS | The same browser inspection reported the PDS-served avatar and banner images complete with non-zero dimensions |

The client code remains compatible with the existing provider composition
architecture. The external Relay/AppView, short-TTL OAuth, and independent-PLC
operator evidence gates remain separate and unresolved.

## Iteration 30: make Services controls inline and inspectable

The Services workbench already exposed provider, surface, reconciliation,
identity, and resolver state, but several changes still opened native alert
menus. That hid the available alternatives on the web and made the primary
provider-control path less inspectable than the surrounding workbench.

### Residual authority concentration and why it matters

The issue was an interaction concentration in the client UI, not a new
provider-authority problem. Alert menus made a local choice look like an
implicit command and obscured the endpoint, service identity, current state,
and reversible alternatives. Replacing the existing provider registry or
policy store would increase machinery without dispersing authority.

### Ecosystem precedent and chosen change

The change follows the existing ATProto client pattern of keeping service
descriptors and local policy separate from account writes. The existing
Services workbench now renders inline action panels for provider inspection and
selection, per-surface capability declarations, reconciliation modes and
explicit provider preferences, identity-resolution policy, and PLC resolver
state. The panels expose selectable endpoint/DID values, selected states, and
ordinary close/back actions. Existing persistence and probing functions remain
the only mutation boundary.

### Authority before versus after

| Boundary | Before iteration 30 | After iteration 30 |
| --- | --- | --- |
| Provider selection | A provider row immediately opened an alert-driven choice path. | A provider row opens an inline inspector showing DID, endpoint, capabilities, selected state, and an explicit `Use for new reads` action. |
| Provider surfaces | Surface changes were hidden in an alert menu. | Each runtime surface has its own visible allow/remove control and explanation. |
| Reconciliation | The user selected a surface and mode through nested alerts. | Surface tabs, reconciliation modes, and provider preferences remain visible in the workspace with selected state. |
| Identity and PLC controls | Identity policy and resolver rows relied on alert or immediate toggle behavior. | Identity policy and resolver rows open inspectable panels with the current rule, provider/operator evidence, and reversible controls. |
| Account authority | UI choices could be mistaken for host changes. | The panels state that PDS writes and identity continuity remain outside the read-provider choice. |

### Interoperability and security tradeoffs

This is a web/native-compatible presentation change. It preserves the existing
provider descriptors, capability names, local reconciliation schema, PLC
resolver declarations, OAuth/session boundary, and PDS write path. It adds no
credential handling, no fallback provider, and no authority claim based on a
service's position in the UI. The tradeoff is additional vertical space in
the workbench when an inspector is open; the panel can be closed without
changing state.

### Implementation evidence

- `src/screens/Settings/ServicesSettings.tsx` adds the reusable inline
  `WorkbenchActionPanel` and `ProviderSurfaceActionPanel` and wires them to
  the existing provider, policy, identity, and resolver actions.
- Provider rows now inspect before selection; current source and selected
  state remain visible in the list.
- Per-surface controls preserve independent capability decisions and expose
  browser-visible selected states.
- `246e3c5fd` (`feat(web): make services controls inspectable`) contains only
  the client UI implementation for this iteration.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet src/screens/Settings/ServicesSettings.tsx` |
| Touched-file formatting and whitespace | PASS | Prettier check and `git diff --check` |
| Web TypeScript | PASS | `pnpm typecheck:web` |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm build-web`; existing bundle-size warnings remain |
| Client code commit and push | PASS | `246e3c5fd` pushed to `fork/codex/spaces-alpha-integration` |
| Pages deployment | PENDING | Deployment and canonical browser inspection are the next release steps |

The external Relay/AppView, short-TTL OAuth, and independent-PLC operator
evidence gates remain separate and unresolved.

## Iteration 31: make post records copyable from the provenance seam

The post inspector already exposed a selectable `Post record` value, but the
user still had to select the text manually before using the stable AT Protocol
address elsewhere. That made the protocol object less usable as ordinary
hypertext and made the boundary between a rendered post and its authored
record harder to act on.

### Residual authority concentration and why it matters

This was an addressability and interaction gap, not a missing provider. The
client already receives the post URI from the protocol-shaped post view and
already uses it to construct the post route. Adding another resolver or
provider would duplicate authority rather than improve user control. The
smallest useful change is an explicit copy action at the existing provenance
boundary.

### Ecosystem precedent and chosen change

The action follows ATProto's use of `at://` record URIs as stable, portable
references and the existing client share/menu pattern for copying protocol
addresses. When `Why this post?` is expanded, the inspector now renders an
accessible `Copy AT URI` button beside the selectable record value. The action
copies only the record URI, stops the surrounding post navigation, and uses the
existing toast channel for confirmation. It does not choose an AppView, alter
the post, or grant a new capability.

### Authority before versus after

| Boundary | Before iteration 31 | After iteration 31 |
| --- | --- | --- |
| Post address | The record URI was readable/selectable in the inspector. | The URI remains selectable and has an explicit copy action. |
| Navigation | The surrounding post link remained the only direct interaction path. | Copying the URI is a separate, non-navigating action that preserves the parent link. |
| Provider semantics | A rendered post could still be mistaken for the provider's object. | The inspector gives the user a portable record reference without naming a provider as owner. |
| Exit and inspection | Manual text selection was required to carry the protocol address out. | The stable address can be exported to another client, resolver, or tool directly. |

### Interoperability and security tradeoffs

This is a backward-compatible web/native-compatible presentation change. It
preserves the existing AT URI, post route, provider composition, moderation,
and authentication boundaries. It introduces no network request and no new
credential or clipboard data beyond the record URI the inspector already
displayed. The copy confirmation is intentionally local UI feedback; it does
not claim that a provider resolved or verified the record.

### Implementation evidence

- `src/components/Post/PostProvenance.tsx` adds the `post-provenance-copy-uri`
  action and copies the model's stable post URI through the existing Expo
  clipboard and toast abstractions.
- The action exposes an accessible label and hint and calls
  `stopPropagation()` so expanding the inspector does not accidentally open
  the post route.

### Verification

| Check | Status | Evidence |
| --- | --- | --- |
| Touched-file Oxlint | PASS | `pnpm exec oxlint --quiet src/components/Post/PostProvenance.tsx` |
| Touched-file formatting and whitespace | PASS | Prettier check and `git diff --check` |
| Web TypeScript | PASS | `pnpm typecheck:web` |
| English catalog extraction/compile | PASS | `pnpm intl:extract && pnpm intl:compile`; 3324 source messages |
| Production web export | PASS | `EXPO_PUBLIC_ENV=production pnpm build-web`; existing bundle-size warnings remain |
| Client code commit and push | PASS | `e3d4ce3c0` and `469314890` pushed to `fork/codex/spaces-alpha-integration` |
| Pages deployment | PASS | `https://470139e7.social-edriffles.pages.dev` uploaded to `social-edriffles` with Node `v24.19.0` |
| ChatGPT in-app browser inspection | PASS | `https://plumblines.uk/?deployment=470139e7` showed 32 provenance controls; expanded details exposed the copy action and a read-only click retained the route without an alert |

The external Relay/AppView, short-TTL OAuth, and independent-PLC operator
evidence gates remain separate and unresolved.
