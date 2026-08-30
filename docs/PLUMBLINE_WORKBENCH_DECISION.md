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
