# Social Dynamics Analyzer Codebase Documentation

Generated for future Codex maintenance on 2026-04-15.

This file documents the visible codebase in this workspace. It is intentionally comprehensive: the goal is to make the next change request faster, safer, and less dependent on rediscovering product and architecture context.

## 1. What This Site Is For

The site is a Hebrew-first, RTL web app branded as "הדודה" ("The Aunt"). Users upload or paste exported WhatsApp or Slack conversations. The app parses the chat, anonymizes participant names into stable placeholders such as `P1`, `P2`, removes/redacts common sensitive content, sends anonymized context to Gemini, and returns social/psychological analyses in Hebrew.

The core product promise is: help users understand interpersonal dynamics in chats while preserving names from the AI provider. The app restores original display names locally after AI output returns, and prepends a privacy notice explaining that AI saw anonymized participant identities.

Main user-facing analysis modes:

- Personal analysis for a selected participant, returning personality, what others think, improvement suggestions, and hidden thoughts.
- Group dynamics analysis for all or selected participants, including participant-axis scoring.
- Romantic dynamics analysis when exactly two participants are selected.
- "Ask The Aunt", a one-question Q&A mode over the original chat or over person-focused context, optionally with up to three extra chats.
- Share outputs as copied text, social share links, printable/PDF-like output, and visual/card assets.

The business layer has free, basic, super, and friends tiers. Free users get three total successful analyses. Paid users use daily quotas and can choose standard or deep analysis mode. Friends codes are intended to grant temporary high/unlimited access.

## 2. High-Level Architecture

Runtime stack:

- Next.js 16 App Router.
- React 19 client components.
- Tailwind CSS 4 through `@tailwindcss/postcss`.
- Firebase Auth client SDK for login/signup/profile.
- Firebase Admin / Firestore for users, quotas, analytics, admin dashboard, prompt drafts, transactions, referrals, and feedback.
- Google Gemini through `@google/genai` for text analysis.
- Google Vertex AI Imagen through `@google-cloud/aiplatform` for generated cartoon images.
- PayPal subscription APIs and webhooks for paid tiers.
- Mixpanel for client analytics with conservative privacy settings.

Important architecture choices:

- The landing page at `app/page.tsx` is the central orchestrator. It handles auth state, upload flow, chat parsing, quota checks, analysis request dispatch, local cache, modals, and rendered page states.
- AI model calls live server-side in `lib/gemini-server.ts`, but client code imports several server actions directly for sharing/image features.
- Full analysis requests use API routes rather than direct server actions. This was likely done because chats are large and need explicit route/body/timeout/quota control.
- Chat persistence has largely been removed. `storeChat` is currently a stub that returns `null`; `chatCode` and `generateChatCodeClient` are legacy remnants.
- Quota is consumed only after a successful, non-empty analysis result. Failed, timed-out, rejected, or malformed analysis responses should not deduct quota.
- Prompt text lives in `lib/prompts.ts`, but production/draft prompt versions can be managed in Firestore through the admin prompt manager and optionally committed back to GitHub.

## 3. Repository Map

Top-level files:

- `package.json`: dependencies and scripts. Main scripts are `npm run dev`, `npm run build`, `npm start`, `npm run lint`.
- `next.config.ts`: Next config with Turbopack root, output tracing root, 500 MB server action body size, dev filesystem cache, and remote image allowance for `madaduhcom.wpcomstaging.com`.
- `apphosting.yaml`: Firebase App Hosting runtime limits and secret/env exposure for Mixpanel, PayPal, Gemini, Firebase project ID, and GitHub prompt deployment.
- `tsconfig.json`: strict TypeScript, ES2022 target, bundler module resolution, `@/*` path alias, incremental compilation.
- `postcss.config.mjs`: Tailwind 4 PostCSS plugin.
- `.gitignore`: ignores logs, build output, `.env`, `/data/`, and `firebase-admin-key.json`.
- `README.md`: mostly the original AI Studio scaffold, not a complete product README.
- `start-ok.txt`: contains `hello`; likely a deployment/smoke artifact.
- `types.ts`: shared domain, analysis, tier, prompt, admin dashboard, feedback, AI ops, and analytics types.

Main source areas:

- `app/`: Next App Router pages, layout, API routes, and server actions.
- `components/`: reusable client UI and modal components.
- `components/admin/`: admin dashboard and prompt manager clients.
- `lib/`: client/server utilities, Gemini, Firestore, auth, caching, logging, prompt, GitHub, Mixpanel.
- `services/`: chat parsing and privacy redaction.
- `data/chrome-headless/`: generated browser/profile data ignored by git and not part of app source.

## 4. End-To-End User Flow

1. User lands on `/`.
2. `app/layout.tsx` sets `lang="he"` and `dir="rtl"`, loads Heebo and Share Tech Mono fonts, injects Google Analytics, wraps the app with `ClientLayout` and `PayPalProvider`.
3. `ClientLayout` wraps children with `MixpanelProvider`, which identifies authenticated users and tracks page views.
4. The landing page checks Firebase auth. In local/tunnel development it can also use test-auth email stored in localStorage.
5. Pre-upload UI offers file upload, paste upload, and export instructions.
6. Upload/paste runs `handleFileLoaded`, which calls `parseChatFile`.
7. `parseChatFile` detects WhatsApp formats, consolidates duplicate participant names, anonymizes participants, redacts sensitive values, and returns `ParsedChat`.
8. `app/page.tsx` formats anonymized chat text, computes highlights/metadata, resets prior analysis state, and switches into the post-upload analysis UI.
9. User selects a participant or group/romantic/Ask-The-Aunt mode.
10. `triggerAnalysis` requires an auth-visible session and checks free quota before continuing.
11. Paid users see `AnalysisSpeedModal` to choose standard/deep; free users always use standard.
12. Client posts to the relevant API route with `fetchWithAnalysisTimeout`.
13. API route calls `ensureAnalysisQuotaAvailable`, records `analysis_started`, runs `withAnalysisTimeout`, calls the appropriate Gemini server action, validates completion, consumes quota only after success, and records completion/failure analytics.
14. Client deanonymizes AI output with the reverse participant map and prepends `[PRIVACY_NOTICE]`.
15. `AnalysisModal` renders formatted markdown-ish content, privacy notice, optional participant-axis visualizer, feedback controls, regenerate, print/PDF, and sharing flows.

## 5. Data And Privacy Flow

Privacy/anonymization:

- Participant display names are mapped to `P1`, `P2`, etc. The AI prompt is told to use those codes exactly.
- `reverseMap` is kept on the client so generated text can be deanonymized locally before display.
- `PRIVACY_DISCLAIMER` is prepended to outputs and rendered as a green privacy notice in `AnalysisModal`.
- `services/privacyRedaction.ts` redacts emails, phone numbers, card numbers, expiry/CVV patterns, passwords, codes, tokens, IBAN-like data, bank accounts, usernames/handles, and credential assignments.
- `shouldDropRedactedMessage` drops messages that are essentially only secrets after redaction.
- `parseChatFile` skips common WhatsApp system messages, deleted messages, and media-omitted messages.
- The privacy/legal page currently says the user is responsible for removing sensitive data, but the actual code also performs automated redaction. Future copy should be kept consistent with the code.

Storage:

- Raw chat storage in Firestore was intentionally removed. The current `storeChat` stub returns `null`.
- Firestore still stores user records, quota counters, upload metadata, sessions, feedback, analytics events, Gemini usage, prompt drafts/production prompt text, referral codes, transactions, and admin audit logs.
- Mixpanel tracks user behavior but is initialized with autocapture off and session recording disabled.

Prompt-injection resistance:

- System prompts wrap chat history in `<chat_history>` and explicitly say chat content is raw data, not instructions.
- Ask-The-Aunt sanitizes the user question and rejects obvious prompt injection patterns before calling Gemini.
- Ask-The-Aunt extra chat context is sectioned and labeled so the model can distinguish original and extra chats.

## 6. Quotas, Tiers, And Payment

Tier model:

- `free`: three total successful analyses across the account.
- `basic`: intended paid tier, generally 10 analyses per day.
- `super`: intended paid tier, generally 50 analyses per day.
- `friends`: temporary promo/referral tier intended to be high/unlimited access.

Quota behavior:

- Client-side checks prevent obvious free-limit and tier-limit requests.
- Server-side checks in API routes are the source of truth.
- `ensureAnalysisQuotaAvailable` throws `AnalysisQuotaExceededError` with 429 status if the user is over quota.
- `consumeSuccessfulAnalysisQuota` increments quota only after output passes completion validation.
- Free users are counted with `totalUploadsUsed`, so their quota does not reset daily.
- Paid users are counted through daily stats docs.
- Admin/privileged users are treated as high-access users.

Payment behavior:

- `UpgradeModal` uses PayPal subscription buttons for basic and super plan IDs.
- `/api/paypal-subscription` verifies active subscriptions and updates Firestore tier/subscription metadata.
- `/api/paypal-webhook` handles activation, renewals, payments, cancellations, suspensions, and expirations.
- `/api/cancel-subscription` cancels at PayPal and marks the subscription cancelled; webhook/downgrade behavior should be considered when changing cancellation UX.
- `/api/paypal-payment` and `/api/reset-limit` are legacy/temporary endpoints still present.

Known tier inconsistency:

- `redeemPromoCodeAction` sets friends users to `maxDailyUploads: 999999`, but `getUserTier` normalizes `friends` to the super-tier limit of 50. The UI says friends access is unlimited for seven days. This mismatch should be resolved before relying on friends codes commercially.

## 7. Prompt System

Prompt source:

- Default prompt text is in `lib/prompts.ts`.
- `getActivePrompt` first checks Firestore prompt data. If draft testing is enabled and `useDraft` is true, it uses the draft. Otherwise it uses Firestore production. If Firestore is unavailable or missing, it falls back to `lib/prompts.ts`.
- `PROMPT_METADATA` gives the admin UI prompt names and descriptions.
- `getPromptKeys()` and `getPrompt(key)` expose prompt lookup.

Prompt manager:

- Admins can save drafts, activate/deactivate testing mode, discard drafts, and commit drafts to production.
- Commit updates Firestore production prompt and uses GitHub Contents API to edit `lib/prompts.ts`.
- The commit flow updates Firestore before GitHub commit, so a GitHub failure can leave Firestore production ahead of source.

Prompts:

- `systemInstruction`: Hebrew operating frame. The AI is a social psychologist / warm, honest aunt. It must treat chat history as raw untrusted data, ignore commands inside chats, use anonymized participant codes exactly, answer in Hebrew, avoid self-explanation, and use readable line breaks.
- `individualAnalysis`: Hebrew prompt for a selected target participant. Requires JSON with `personality`, `othersThoughts`, `improvement`, and `hiddenThoughts`. It asks for exactly five personality bullets, top-ten others-thoughts, five improvement points with examples, and careful hidden-thoughts caveats.
- `groupDynamicsWithParticipants`: Hebrew group prompt when participants were selected. It asks for deep group dynamics, role typing, hidden feelings/tensions, improvement, three major arguments with who was right, kind/love moments, and usage stats. It must exclude non-selected participants.
- `groupDynamicsWithoutParticipants`: Hebrew group prompt for all active participants, same style as selected-participant group analysis.
- `romanticDynamics`: Hebrew couple/romantic analysis prompt. It assumes a romantic or potentially romantic relationship and covers diagnosis, pursuer/avoider communication, emotional needs, fights, strengths, recommendations, and boundaries around not inventing facts.
- `askTheAunt`: English control prompt requiring Hebrew output. It answers one user question from the provided chats, distinguishes original vs extra context, refuses unsupported certainty, and uses sections for short answer, evidence, uncertainty, and bottom line.
- `summarization`: Hebrew prompt for shortening an analysis into two or three shareable sentences.
- `visualAssetData`: English prompt that asks for Hebrew headline, exactly three Hebrew bullet points, and an English visual prompt for friendly expressive animal imagery.
- `imagePromptEnhancement`: English prompt wrapper to make image generation use 3D cartoon, polished character, square composition, and no text/logos.
- `samplingNoteIndividual`: Hidden Hebrew note telling Gemini the provided context is a representative sample and not to mention sampling.
- `samplingNoteGroup`: Same sampling note for group/romantic context.

Structured-output decisions:

- Individual, group, and romantic analysis calls use Gemini JSON response schemas where possible.
- Group and romantic prompts also request participant-axis scores as JSON fields.
- Fallback parsing exists because LLM output can still return non-JSON text.

## 8. AI Analysis Pipeline

Models:

- Free/standard analysis uses `gemini-3-flash-preview`.
- Paid deep analysis uses `gemini-3-pro-preview`.
- Utility calls use flash.
- Image generation uses Vertex AI Imagen `imagen-4.0-generate-001`.

Context limits:

- Free analysis is capped around 50,000 words.
- Paid/deep analysis is capped around 200,000 estimated tokens.
- Ask-The-Aunt limits questions to 500 chars and context to around 50,000 words.
- `getTruncatedMessages` currently returns all messages for `Infinity`; older truncation behavior is retained for non-infinite limits.
- Sampling code prefers dense days and target-neighborhood messages rather than blind first-N truncation.

Participant axes:

- Axes are liberalism, calmness, rationalism, and humor.
- Gemini is asked for 1-10 numeric scores per participant.
- Invalid/missing scores are normalized to neutral values.
- Group analysis appends a readable Hebrew participant-axis section, which `AnalysisModal` parses and visualizes.
- Axis distribution summaries are currently in memory only, so percentile comparisons reset on cold start and are not globally persistent.

Telemetry:

- Server actions extract token usage, model names, durations, and feature labels.
- `logGeminiUsageDetailed` records token/cost data in Firestore and analytics events.
- Costs are estimated through `GEMINI_MODEL_PRICING_USD_PER_MILLION`; pro pricing can come from env because preview pricing is unstable.

## 9. File And Function Reference

### `app/layout.tsx`

- Defines global metadata.
- Loads Google fonts.
- Sets RTL Hebrew document direction.
- Injects Google Analytics script ID `G-854NNDYL9V`.
- Wraps every page in `ClientLayout` and `PayPalProvider`.

### `app/globals.css`

- Imports Tailwind.
- Forces Heebo as the default font and Share Tech Mono for `.mono`.
- Adds custom range-slider styles for feedback sliders.
- Uses indigo/purple slider gradients with hover and active states.

### `app/page.tsx`

The central client component and state machine for the product.

Key state groups:

- Chat state: `chatData`, `pastedChatText`, `processing`, `progress`, `highlights`.
- Analysis state: `selectedUser`, `activeAnalysisType`, `userAnalysisData`, `cachedOutputs`, `currentAnalysisMode`, `activeGroupParticipants`.
- Loading state: `loading`, `loadingMessage`, `loadingSnippet`, typewriter refs and message phase state.
- Auth/tier state: Firebase user, test email, admin flag, `selectedTier`, `uploadLimitData`.
- Modal state: upgrade, speed selection, group selector, ask-the-aunt, promo, regenerate confirm.

Important functions:

- `escapeRegex`: escapes names before replacement in dynamic regexes.
- `deanonymizeText`: converts model output from `P1`/`[Participant_1]` back to display names using `reverseMap`, sorting longest aliases first to avoid partial replacements.
- `getApiErrorMessage`: normalizes API failures, including Hebrew timeout copy for gateway/timeout status codes.
- `syncQuotaFromPayload`: updates client quota state from server payloads.
- `withAnalysisFailureQuotaMessage`: appends a Hebrew reassurance that failed analyses did not consume quota.
- `fetchWithAnalysisTimeout`: aborts analysis fetches after server timeout plus a client buffer.
- `ensureAnalysisQuotaAvailable`: client-side quota gate that asks `/api/track-upload` to check availability and opens upgrade UX for free users.
- `postAnalysisRequest`: posts JSON to analysis endpoints, handles 429 quota responses, and extracts server errors.
- `resetAskTheAuntState`: clears Ask-The-Aunt modal/input/file state.
- `buildAskTheAuntContext`: builds general or person-focused anonymized chat sections, remaps extra chats into the original placeholder namespace, filters messages by/about a target, and returns combined reverse maps.
- `handleOpenAskTheAuntModal`: opens the Ask-The-Aunt modal and initializes mode.
- `startAnalysisRequest`: starts a queued analysis after mode selection.
- `queueAnalysisRequest`: either opens speed selection for paid users or immediately starts standard mode.
- `handleAnalysisModeSelected`: receives standard/deep choice and executes pending analysis.
- `beginAskTheAuntFlow`: auth/quota/logging gate before opening Ask-The-Aunt.
- `handleAskTheAuntWantsExtraChatsChange`: allows extra chats only for person mode.
- `handleAskTheAuntExtraFilesSelected`: validates extra TXT/ZIP files, size, duplicates, and max count.
- `handleAskTheAuntSubmit`: validates question/context, parses extra files, calls `/api/ask-the-aunt`, stores output, and reopens the modal on failures.
- `renderPaidTierBadge`: renders tier badges on analysis cards.
- `isPaidTier`: treats basic/super/friends as paid-like.
- `hasVisibleAuthSession`: accepts Firebase user or test auth email.
- `resolveAnalysisMode`: free always standard; paid respects chosen mode.
- `getAnalysisModeCacheSuffix`, `buildCacheKey`, `buildAnalysisStateKey`: build cache keys and state keys; free outputs do not get explicit mode suffixes.
- `hasExhaustedFreeAnalyses`: checks free quota state.
- `hasParticipantAxisSection`: prevents reusing stale group cache if the axis section is missing.
- `runAnalysis`: logs analysis button events and calls `executeAnalysis`.
- `executeAnalysis`: dispatches individual/group/romantic analysis, checks cache/quota, calls relevant API route, validates output, deanonymizes result, and stores state.
- `getCacheKey`: legacy cache-key helper for regenerate logic.
- `triggerAnalysis`: main click handler for all analysis cards.
- `handleRegenerateAnalysis`: clears cache/state for a specific output and reruns bypassing cache.
- `confirmRegenerate`, `cancelRegenerate`: legacy confirm modal hooks; the current modal path usually regenerates directly.
- `storeChat`: legacy persistence stub that intentionally clears `chatCode` and returns `null`.
- `handleFileLoaded`: parses uploaded/pasted chats, builds anonymized text, logs upload metadata, resets UI state, and pushes history state.
- `handlePastedTextSubmit`: trims textarea content and passes it as a virtual file to `handleFileLoaded`.
- `focusPasteInput`: scrolls/focuses the paste box.
- `getNextHighlight`: picks non-repeating loading snippets.
- `handleUpgrade`: updates local tier state after upgrade/promo flow.
- `getModalContent`: selects the active modal content from state.

Notable effects:

- Loads dynamic loading messages from `/api/messages`, with constant fallback.
- Subscribes to Firebase auth and test auth fallback.
- Checks admin status and unlimited access.
- Handles browser back button by clearing loaded chat instead of navigating away.
- Rotates loading messages by elapsed analysis time phase.
- Typewrites loading text and rotates preview snippets.

### API routes

- `app/api/analyze-chat-full/route.ts`: validates body, checks quota, records start/completion/failure analytics, calls `serverAnalyzeChatFull`, consumes quota after completed output.
- `app/api/analyze-group-dynamics/route.ts`: same pattern for group dynamics via `serverAnalyzeGroupDynamics`.
- `app/api/analyze-romantic-dynamics/route.ts`: same pattern for romantic dynamics via `serverAnalyzeRomanticDynamics`.
- `app/api/ask-the-aunt/route.ts`: same pattern for question-answer mode via `serverAskTheAunt`; records question mode and extra chat count metadata.
- `app/api/track-upload/route.ts`: `check` or `increment` quota endpoint. The current analysis flow mostly uses `check`; actual consumption happens after successful analysis.
- `app/api/reset-limit/route.ts`: temporary/legacy reset endpoint that deletes today's daily stats; does not fully manage subscriptions.
- `app/api/user-data/route.ts`: verifies bearer token matches requested user, initializes user if needed, returns tier, transactions, and today's usage.
- `app/api/check-admin/route.ts`: returns `{ isAdmin: false }` for unauthorized users rather than hard failing the UI.
- `app/api/messages/route.ts`: returns loading message phases; duplicates the fallback constants but with server-controlled copy.
- `app/api/health/route.ts`: simple ok/time health response.
- `app/api/paypal-subscription/route.ts`: verifies PayPal subscription, updates tier/subscription Firestore data, logs transaction and analytics.
- `app/api/paypal-payment/route.ts`: legacy one-time PayPal order verification.
- `app/api/cancel-subscription/route.ts`: validates user token, cancels PayPal subscription, writes cancellation transaction/analytics.
- `app/api/paypal-webhook/route.ts`: validates webhook signatures when configured, handles PayPal subscription lifecycle events, and downgrades cancelled/suspended/expired users to free.
- `app/api/admin/dashboard/route.ts`: admin-only dashboard snapshot.
- `app/api/admin/users/route.ts`: admin-only user table search/filter.
- `app/api/admin/users/[userId]/route.ts`: admin-only user detail.
- `app/api/admin/feedback/route.ts`: admin-only feedback summary and entries.
- `app/api/admin/logs/route.ts`: admin-only recent logs.
- `app/api/admin/prompts/route.ts`: admin-only prompt detail GET and prompt actions POST.
- `app/api/admin/prompts/summary/route.ts`: admin-only prompt statuses.
- `app/api/admin/actions/reset-upload-limit/route.ts`: admin action to reset a user's daily quota.
- `app/api/admin/actions/update-user-tier/route.ts`: admin action to set free/basic/super.
- `app/api/admin/actions/generate-referral-code/route.ts`: admin action to create referral/friends codes.
- `app/api/admin/actions/reconcile-subscription/route.ts`: admin action to restore max limits or downgrade stale subscription states.

### `app/actions/admin-actions.ts`

- `redeemPromoCodeAction`: uppercases a code, transactionally checks `referralCodes`, prevents exhausted codes, records usage, grants friends tier for seven days, and returns updated access.
- `checkUnlimitedAccessAction`: reads the effective tier and returns whether the user has unlimited/high access.

### `app/actions/analytics-actions.ts`

- `logUploadAction`: server action wrapper around Firestore upload logging.
- `logButtonPressAction`: records button presses.
- `logShareAction`: records share events.
- `logImageGenerationAction`: records image-generation events.
- `logFeedbackAction`: records rating/comment feedback.
- `logGeminiUsageAction`: records model usage.

### Auth and account pages

- `app/login/page.tsx`: full styled login page. Uses Google and email/password auth. Redirects local `127.0.0.1`/`0.0.0.0` to canonical localhost. RTL, gradient background, animated card, and legal links.
- `app/signup/page.tsx`: full styled signup page. Validates password match and minimum length, supports Google signup/login, uses matching animated card style.
- `app/profile/page.tsx`: profile, tier, usage, subscription, friends-code expiry, transaction history, admin badge, upgrade modal, cancellation flow, logout. It supports test-auth fallback.
- `app/privacy/page.tsx`: Hebrew privacy policy page, last updated 2026-03-11. It emphasizes legal consent, partial anonymization, user responsibility for sensitive info, no AI model training, and DPO contact.
- `app/terms/page.tsx`: Hebrew terms page, last updated 2026-03-11. It frames analyses as entertainment/enrichment rather than professional advice.
- `app/admin/page.tsx`: exports `AdminDashboardClient`.
- `app/admin/prompts/page.tsx`: exports `AdminPromptsClient`.

### `lib/gemini-server.ts`

Server-only Gemini, Imagen, prompt, and telemetry layer.

Key helpers:

- `clampParticipantAxisScore`: clamps model scores to valid 1-10 range.
- `sortParticipantCodes`: sorts participant IDs numerically by P-code.
- `getParticipantCodesFromMessages`: extracts participant codes from anonymized message text.
- `buildParticipantAxisInstruction`: builds the strict JSON-axis instruction appended to prompts.
- `normalizeParticipantAxisScores`: validates participant-axis JSON and fills neutral scores for missing participants.
- `calculateParticipantAxisPercentile`: compares a score against the in-memory distribution summary.
- `buildParticipantAxisSection`: converts score JSON into Hebrew markdown text for modal parsing.
- `extractJsonObjectCandidates`: scans raw text for balanced JSON object candidates.
- `parseStructuredJsonObject`: parses cleaned JSON or candidate objects.
- `getAnalysisBudget`: chooses free word cap vs paid token cap.
- `getAnalysisModel`: chooses flash vs pro based on tier and analysis mode.
- `sanitizeUserQuestion`: strips markup/control/backticks, collapses whitespace, and truncates Ask-The-Aunt questions.
- `looksLikePromptInjection`: detects obvious prompt injection phrases/tags.
- `limitAskAuntSections`: proportionally samples Ask-The-Aunt chat sections under the word budget.
- `serializeChatSections`: labels and joins chat sections for the model.
- `getActivePrompt`: loads draft/production/fallback prompt text.
- `getSystemInstruction`: loads the active system instruction.
- `truncateChatForContext`: formats messages by date and sender, respecting a message limit.
- `cleanJson`: removes code fences, extracts JSON-ish text, strips trailing commas/control chars, and attempts simple brace repair.
- `normalizeModelText`: normalizes generated text via `normalizeGeneratedText`.
- `extractUsageTokens`: extracts token counts from Gemini responses.
- `createGeminiCallTelemetry`: builds model/timing/token metadata.
- `getApiKey`: reads `GEMINI_API_KEY`, dev `API_KEY`, or Secret Manager.

Server actions:

- `serverAnalyzeChatFull`: builds individual context around target participant, sends structured JSON request, logs AI usage, records participant axes, and returns the four individual-analysis fields.
- `serverAnalyzeGroupDynamics`: samples group context, chooses selected/all participant prompt, requests analysis text plus axis scores, logs usage, records axis scores, appends participant-axis section, and returns output.
- `serverAnalyzeRomanticDynamics`: samples romantic context, requests analysis text plus axis scores, records scores, and returns romantic output. Unlike group analysis, it currently does not append a visible axis section.
- `serverAskTheAunt`: sanitizes/rejects suspicious question text, limits context sections, calls Gemini with context and user question, logs usage, and returns normalized Hebrew answer.
- `serverSummarizeForSharing`: utility model call to create a short shareable summary.
- `serverGenerateCartoonImage`: enhances visual prompt and calls Vertex AI Imagen; returns base64 image data or throws on safety/RAI filtering.
- `serverGetVisualAssetData`: asks Gemini for share-card headline, bullets, and visual prompt with JSON schema and fallback content.

### `lib/prompts.ts`

- Holds production prompt literals and metadata.
- Comments say admin panel changes require git commit/deploy.
- `PROMPTS`: full prompt map.
- `PROMPT_METADATA`: admin display name/description per prompt.
- `getPromptKeys`: returns prompt keys.
- `getPrompt`: returns prompt text by key.

### `lib/firestore-admin.ts`

Server-only Firestore/Admin data layer.

Initialization and identity:

- `getAdminDb`: initializes Firebase Admin using local service-account file, env credentials, or ADC.
- `isAdminUser`: allows configured admin emails or Firestore `isAdmin`.
- `ensureUserInitialized`: creates missing user docs with free/super defaults and admin flags.
- `setAdminStatus`: updates admin flag.
- `getUserTier`: resolves effective tier/max uploads, handles privileged emails and expired friends tier.

Quota and tier:

- `checkDailyUploadLimit`: returns quota availability for free, paid, admin, and high-limit users.
- `incrementDailyUpload`: increments total free usage or paid daily usage.
- `resetDailyUploadLimit`: deletes today's daily stats.
- `updateUserTier`: sets tier, maxDailyUploads, and optional expiry metadata.

Analytics/logging:

- `recordAnalyticsEvent`: writes analytics events.
- `mergeAdminDailyMetrics`: updates daily aggregate metrics.
- `recordAdminAuditLog`: records admin actions.
- `logUpload`: writes upload/session metadata and upload analytics.
- `logButtonPress`: increments global button counters and analytics.
- `logShare`: appends share metadata to sessions and analytics.
- `logImageGeneration`: appends image metadata and analytics.
- `logFeedback`: writes feedback into session and top-level feedback entries.
- `logGeminiUsage`: legacy usage logger.
- `logGeminiUsageDetailed`: detailed model usage, cost, analytics, and daily metrics.

Referral/prompt/axis:

- `createGlobalReferralCode`: creates referral code documents.
- `recordParticipantAxisScores`: records scores in an in-memory distribution summary.
- `getParticipantAxisDistributionSummary`: returns current in-memory axis distribution.
- `getPromptData`, `getAllPrompts`, `savePromptDraft`, `activatePromptDraft`, `deactivatePromptDraft`, `discardPromptDraft`, `updateProductionPrompt`: Firestore prompt management.
- `getAllStats`: legacy aggregate stats helper.

### `lib/admin-dashboard.ts`

Admin dashboard data composer.

Helpers:

- `safeString`, `safeDate`, `getTimestamp`: normalize Firestore-ish data.
- `normalizeTier`, `normalizeAnalysisMode`: map unknown values into dashboard categories.
- `average`, `sum`: aggregate helpers.
- `buildDateRange`, `isInRange`, `buildTimeSeries`: filter and bucket data.
- `addBreakdown`, `mapToBreakdownItems`: build sorted dashboard breakdowns.
- `buildAnalysisIssueSummary`: detects failed analysis events and likely stuck requests where a start has no completion/failure after 20 minutes.
- Firestore fetch helpers load top-level collections, collection groups, auth emails, button counters, feedback, users, and logs.

Main exports:

- `getAdminDashboardSnapshot`: builds the complete dashboard: overview, time series, usage, users, revenue, feedback, AI ops, analysis issues, prompt statuses, logs, and alerts.
- `getAdminUsers`: filtered user table.
- `getAdminUserDetail`: one-user detail with transactions, feedback, and recent sessions/uploads.
- `getAdminFeedbackData`: filtered feedback summary and entries.
- `getAdminLogs`: recent analytics/log entries.
- `getAdminPromptDetails`, `getAdminPromptStatuses`: prompt manager data.
- `saveAdminPromptDraft`, `activateAdminPromptDraft`, `deactivateAdminPromptDraft`, `discardAdminPromptDraft`, `commitAdminPromptToProduction`: prompt actions, including GitHub source commit.
- `resetAdminUserUploadLimit`, `updateAdminUserTier`, `generateAdminReferralCode`, `reconcileAdminSubscription`: admin actions.

### `lib/analysis-quota.ts`

- `AnalysisQuotaExceededError`: typed quota error with status 429 and tier-aware Hebrew messages.
- `getAnalysisQuotaSnapshot`: initializes user and returns tier/quota state.
- `ensureAnalysisQuotaAvailable`: throws if no analysis can be consumed.
- `consumeSuccessfulAnalysisQuota`: increments quota after success only.

### `lib/analysis-output.ts`

- `isCompletedFullAnalysisResult`: checks at least one of the four full-analysis fields is non-empty.
- `isCompletedSingleAnalysisResult`: checks string output is non-empty.

### `lib/analysis-text.ts`

- `normalizeGeneratedText`: converts HTML entities, literal `\n`, common HTML tags, list tags, and excessive whitespace into clean plain text.

### `lib/analysis-timeout.ts`

- `ANALYSIS_EXECUTION_TIMEOUT_MS`: 220 seconds.
- `withAnalysisTimeout`: races analysis promise against timeout.

### `lib/cache-utils.ts`

- `sanitizeCacheKey`: strips unsafe key chars.
- `buildFullAnalysisCacheKey`: cache key for selected-user full analysis.
- `buildGroupAnalysisCacheKey`: cache key for group analysis. Note: it sorts the participant array in-place.
- `buildRomanticAnalysisCacheKey`: cache key for romantic analysis.

### `lib/chat-utils.ts`

- `buildPersonReferenceAliases`: builds target aliases; first-name alias is added only when unique.
- `messageMentionsPerson`: Unicode-aware alias matching.
- `messageIsByPerson`: sender match for target.
- `isMessageByOrAboutPerson`: combines sender and mention checks.
- `replacePersonAliasesInText`: replaces aliases with the target P-code.
- `buildMessageLookupKey`: timestamp/rawLine alignment key.
- `sortParticipantsByMessageCount`: count-descending participant ordering.
- `getTruncatedMessages`: legacy limit helper; returns all for `Infinity`.
- `getChatMetadata`: extracts safe, varied loading snippets.
- `countWords`, `estimateTokens`, `countMessagesWordsAndTokens`: approximate budget helpers.
- `groupMessagesByDate`, `formatMessagesToString`: context formatting.
- `createGroupAnalysisChunksWithBudget`: density-based date sampling under budget.
- `createIndividualAnalysisChunksWithBudget`: target-neighborhood sampling, then group sampling if needed.

### `lib/chat-file-utils.ts`

- `readChatUploadFile`: validates size and extension, dispatches TXT or ZIP reading.
- `readTextFile`: reads UTF-8 text with FileReader.
- `readZipFile`: dynamically imports JSZip and returns the first non-empty `.txt` in the archive.

### `services/chatParser.ts`

- `sanitizeInput`: strips HTML tags from uploaded text.
- `generateNameFingerprint`: normalizes names for duplicate detection.
- `cleanDisplayName`: removes bidi/control chars and whitespace noise.
- `consolidateParticipants`: merges WhatsApp contact variants like "Name mobile" into canonical names.
- `detectDateOrder`: infers DMY vs MDY using valid date evidence, defaulting to DMY.
- `normalizeYear`: converts short years.
- `parseChatTimestamp`: parses iOS/Android WhatsApp date/time with optional seconds and AM/PM.
- `parseChatFile`: main parser. Splits lines, detects message starts, accumulates multiline messages, skips system/deleted/media messages, consolidates names, builds `P#` maps, redacts content, drops credential-only messages, and returns `ParsedChat`.

### `services/privacyRedaction.ts`

- Contains label lists and regexes for sensitive values.
- Uses Luhn checks to reduce false positive card redaction.
- Collects prioritized non-overlapping spans, replaces with placeholders, and decides whether fully redacted messages should be dropped.
- `redactSensitiveContent`: exported redaction function used by the parser.
- `shouldDropRedactedMessage`: exported drop heuristic.

### Auth, analytics, logging, and GitHub libs

- `lib/auth.ts`: Firebase client auth, Google/email signup/login, localhost redirect, local/tunnel test-auth fallback, Identity Toolkit REST fallback for test hosts, logout with Mixpanel reset.
- `lib/firebase.ts`: Firebase client app/auth initialization with hardcoded public project config.
- `lib/admin-auth.ts`: verifies Firebase ID tokens, supports test-auth header in non-production, checks Firestore/admin email, and syncs admin identity.
- `lib/admin-identity.ts`: admin email allowlist and normalization helpers.
- `lib/mixpanel.ts`: Mixpanel wrapper, event constants, identify/reset helpers, page/file/analysis/share/image/feedback tracking; session recording is off.
- `lib/logger.ts`: structured JSON server logging and user-friendly error helpers.
- `lib/client-logger.ts`: structured client-side error logging and friendly messages for server-action/deploy mismatches.
- `lib/github.ts`: GitHub Contents API helper and prompt literal replacement logic for admin prompt commits.
- `lib/client-hash.ts`: Web Crypto SHA-256 chat-code helper; currently legacy because chat persistence is disabled.

### Core UI components

- `AnalysisCard`: reusable action card with color variants, disabled state, hover lift, icon animation, CTA arrow, and bottom indicator bar.
- `FileUpload`: drag/drop/click uploader for TXT/ZIP, max-size errors, loading overlay, privacy/tip copy.
- `HowToExport`: accordion instructions for exporting WhatsApp on iPhone/Android and Slack copy/paste.
- `GroupParticipantSelector`: modal with top-15 default selection, max 15 participants, select all top 15, clear, and confirm.
- `AnalysisSpeedModal`: paid-tier standard/deep selector. Free users skip it.
- `AskTheAuntModal`: modal for person/general question mode, template questions, optional extra chat files for person mode, validation errors, and clear prompt-injection-safe copy.
- `AnalysisModal`: output modal. It parses privacy notice, renders lightweight markdown, parses/visualizes participant axes, collects feedback, triggers regenerate, prints/downloads, summarizes share text, opens social share links, generates visual assets, copies canvas/poster images, and locks body scroll while open.
- `ParticipantAxisVisualizer`: renders app UI axis cards and hidden share-poster cards. Includes champion detection and responsive poster column sizing.
- `UpgradeModal`: PayPal subscription modal for basic/super plans, success handling, and current usage context.
- `PromoCodeModal`: friends-code redemption modal using `redeemPromoCodeAction`.
- `RegenerateConfirmModal`: modal for using existing vs generating new output; currently mostly legacy because direct regenerate is used.
- `PayPalProvider`: global PayPal script provider. If the public client ID is missing, it logs a warning and renders children without PayPal script.
- `MixpanelProvider`: identifies authenticated users, resets on logout, and tracks page views.
- `ClientLayout`: wraps the app in Mixpanel context.
- `AuthDetails`: older auth status widget, not used in the main landing flow.
- `Login` and `SignUp`: minimal older auth components, superseded by full `app/login` and `app/signup` pages.
- `PasswordModal`: simple password modal, likely legacy/dev-only.
- `Icons`: hand-written SVG icons for brain, group, happy, secret, warning, privacy, and lightbulb.

### Admin UI components

- `components/admin/useAdminAccess.ts`: resolves Firebase/test auth, asks `/api/check-admin`, exposes `visibleEmail`, `isAdmin`, `checking`, and `getAuthHeaders`.
- `AdminDashboardClient`: English operator dashboard with tabs for overview, usage, users, revenue, feedback, AI ops, prompts, and logs. It fetches admin APIs, handles filters, generates one-use friends codes, runs safe user actions, renders Recharts charts, and redirects unauthorized users home.
- `AdminPromptsClient`: prompt manager UI. It loads prompt details, edits textarea content, saves drafts, activates/deactivates testing, discards drafts, commits drafts to production, and displays action messages.

## 10. Styling, UI, And UX Decisions

Global design:

- The public product is Hebrew-first and RTL.
- Heebo is used as the main typeface; Share Tech Mono exists for code/mono accents.
- The visual language is colorful, rounded, high-contrast, and friendly rather than enterprise/minimal.
- Public pages use gradients, blurred decorative blobs, soft cards, large rounded corners, and hover motion.
- Admin pages deliberately switch to a calmer English dashboard style: slate backgrounds, white cards, compact tables, Recharts, and operator labels.

Landing page UX:

- Pre-upload flow is educational and trust-building: hero, export instructions, upload/paste choices, privacy reassurance, value cards, pricing, reviews, collaboration disclaimer, legal footer.
- Post-upload flow shifts into task cards: group, romantic, Ask-The-Aunt, participant chips, and individual analysis cards.
- Romantic dynamics is disabled unless exactly two participants are selected, preventing nonsensical calls.
- Ask-The-Aunt offers person/general modes because some questions need targeted context and some need full-chat context.
- The browser back button after upload clears the loaded chat instead of logging out or leaving abruptly.

Loading UX:

- Loading messages are phase-based: early, mid, and long-running copy.
- Typewriter animation and rotating chat snippets make long analysis waits feel alive.
- Loading snippets are chosen from safe short messages with at least two speakers when possible.

Analysis output UX:

- Output is displayed in a full modal to keep focus.
- Privacy notice is visually separated from the AI analysis.
- Markdown rendering is intentionally lightweight and controlled rather than using a full markdown parser.
- Feedback uses a 1-10 slider and optional comments to gather product quality data.
- Share flow offers multiple versions: original, short summary, and cartoon image/card.
- Download/PDF is implemented through a print window rather than a PDF generation library.

Payments/profile UX:

- Upgrade prompts appear when free users exhaust quota or when profile users want to upgrade.
- Profile page shows total usage for free users and daily usage for paid users.
- Friends access shows expiry date and days remaining.

## 11. Past Decisions And Likely Rationale

These are inferred from git history and source state; exact rationale is only certain when comments/code make it explicit.

- 2026-03-17: Google Analytics and promo codes were added, likely to support growth/measurement and manual access grants.
- 2026-03-18: Chat saving was removed and a 50k-word cap was added, likely to reduce privacy risk and bound model cost/context size.
- 2026-03-18: Valid JSON output was forced, likely because free-form model responses were breaking UI parsing.
- 2026-03-18: Several regenerate TypeScript/build fixes landed, implying regenerate UX was added iteratively.
- 2026-03-19: Prompt admin was added, likely so prompts could be edited without code changes.
- 2026-03-19: A change moved chat passing from server action to API route, likely because large chat bodies/server-action constraints caused failures.
- 2026-03-19: Mixpanel build config was fixed by using boolean `autocapture`, likely due SDK type/build constraints.
- 2026-03-20: Secret/env permission changes were added for deployment/App Hosting.
- 2026-03-20: Prompt updates and output formatting fixes were made, likely in response to poor model formatting and row breaks.
- 2026-03-20: Romantic analysis received hard-coded/prompt-level behavior, likely to make couple analysis more consistently available and stylistically distinct.
- 2026-03-23: AM/PM parsing was added, likely to support WhatsApp exports from locales that use 12-hour time.
- 2026-03-23: Upload area became bigger/clickable, improving first-run usability.
- 2026-03-24: Profile/admin/friends-code/unlimited-access/Firestore-cleanup work landed, likely to operationalize subscriptions and manual access.
- 2026-03-24: Download button, cursor pointers, admin emails, and share link were added, likely product polish.
- 2026-03-24: "jibrish" was removed and `Riloo` became `Rilloo`, showing recent copy/encoding cleanup.

## 12. Unique Or Unusual Decisions

- `app/page.tsx` is very large and owns many responsibilities. This makes behavior easy to trace in one file but harder to test/refactor safely.
- Raw chat persistence is disabled, but legacy chat-code/cache utilities remain. Treat chat persistence as intentionally removed unless asked otherwise.
- The AI receives anonymized names but not fully abstracted content. Sensitive-value redaction exists, but users can still upload private conversation content.
- Quota is charged only after a valid output. This is user-friendly and should be preserved.
- Free quota is total lifetime usage, while paid quota is daily.
- Prompt admin can use Firestore drafts in production without a source deploy; this is powerful but can create source/runtime divergence.
- Participant-axis percentile data is in-memory only and not durable.
- Group cache reuse checks for participant-axis text to avoid stale outputs after axes were added.
- `AnalysisModal` imports server actions from `lib/gemini-server.ts` in a client component for summarization/image/share flows. Be cautious when changing this because bundling/server-action boundaries can be fragile.
- `PayPalProvider` globally uses `intent: 'capture'`, while profile wraps `UpgradeModal` with `intent: 'subscription'`. Subscription behavior depends on context and should be tested after PayPal changes.
- PayPal webhook verification returns true when webhook credentials are missing. This is convenient for development but risky if production env is incomplete.
- `buildGroupAnalysisCacheKey` sorts participant arrays in place.
- The same header/footer/collaboration disclaimer appears in multiple branches of `app/page.tsx`.
- Loading messages exist both in constants and `/api/messages`.
- Pricing copy has possible daily/weekly inconsistencies between landing/profile/upgrade text.
- Some Hebrew strings remain mojibake/corrupted in `components/AnalysisModal.tsx` and `lib/gemini-server.ts`, despite a recent "removed the jibrish" commit. Use UTF-8 reads/writes and verify rendered Hebrew carefully.
- `romanticDynamics` collects participant axis scores but does not append the visible axis section to the output.
- `RegenerateConfirmModal` and `showRegenerateConfirm` are largely legacy because current regenerate calls bypass the confirm modal.
- Minimal `components/Login.tsx` and `components/SignUp.tsx` are legacy alongside the real `/login` and `/signup` pages.
- The privacy page says automated anonymization targets names only, but actual code redacts additional sensitive data. Align legal/product copy before making claims.
- `start-ok.txt` and generated browser/profile data are artifacts, not part of product behavior.

## 13. Maintenance Guidance For Future Changes

Before changing analysis behavior:

- Check `lib/prompts.ts`, Firestore prompt override behavior, and admin prompt manager expectations.
- Preserve prompt-injection boundaries around `<chat_history>` and Ask-The-Aunt.
- Keep quota consumption after success, not before model calls.
- Test both free and paid mode keying, because cache/state keys differ by tier and mode.
- Verify deanonymization still handles both `P1` and `[Participant_1]` forms.

Before changing upload/parsing:

- Test iOS and Android WhatsApp formats.
- Test AM/PM timestamps.
- Test multiline messages.
- Test duplicate participant names with phone/mobile suffixes.
- Test redaction does not erase normal conversation accidentally.
- Test ZIP with a single exported TXT.

Before changing UI:

- Preserve RTL on public Hebrew pages.
- Check mobile first, especially modals and upload paths.
- Keep cursor-pointer and disabled affordances on clickable card/button areas.
- Remember admin UI is intentionally more utilitarian and English-heavy than public UI.

Before changing payments/tiers:

- Reconcile friends unlimited behavior in `redeemPromoCodeAction`, `getUserTier`, profile copy, and quota checks.
- Verify PayPal plan IDs, provider options, subscription verification, cancellation behavior, and webhook downgrades.
- Avoid relying on `/api/reset-limit` as a real payment/tier mechanism.

Before changing admin/prompt deployment:

- Decide whether Firestore should update before or after GitHub commit.
- Audit admin actions through `recordAdminAuditLog`.
- Keep test-auth header support limited to non-production.

Encoding guidance:

- Use UTF-8-aware reads/writes.
- Do not trust default PowerShell rendering of Hebrew if output looks corrupted; re-read with `-Encoding utf8`.
- After editing Hebrew prompt/copy strings, run a local build and visually inspect rendered output where possible.

## 14. Additional Exact Reference Notes

### `types.ts`

- `ChatMessage`: canonical parsed message shape with `sender`, `content`, `timestamp`, and optional `rawLine`.
- `ParsedChat`: parser output with original/anonymized messages, loading previews, participant list, `nameMap`, and `reverseMap`.
- `AnalysisType`: all analysis modes used by cards, modals, cache keys, and telemetry.
- `UserTier`: `free`, `basic`, `super`, `friends`.
- `AnalysisDepthMode`: `standard` and `deep`.
- `ParticipantAxisScores`: numeric scoring model for liberalism, calmness, rationalism, and humor.
- Admin interfaces define dashboard snapshots, metrics, users, uploads, sessions, transactions, feedback, prompts, audit logs, AI ops, analysis issues, and revenue summaries.

### `lib/constants.tsx`

- `LOGO_URL`: shared remote logo URL.
- `PRIVACY_DISCLAIMER`: marker plus Hebrew privacy notice prepended to generated analyses.
- `MAX_FILE_SIZE_BYTES`: 10 MB upload cap.
- `FREE_TIER_TOTAL_ANALYSIS_LIMIT`: three total free analyses.
- `TIER_CONFIG`: display labels, colors, and icons for free/basic/super/friends.
- `ANALYSIS_CONFIG`: Hebrew titles, descriptions, colors, and icons for all analysis cards.
- `LOADING_MESSAGES`: fallback loading text grouped into early/middle/late phases.

### `components/AnalysisModal.tsx`

- `PrivacyNotice`: renders extracted `[PRIVACY_NOTICE]` text in a green trust box.
- `SnippetRenderer`: renders loading snippets as colored chat bubbles.
- `MarkdownRenderer`: lightweight renderer for bold spans, headings, bullets, and paragraph spacing; avoids a full markdown dependency.
- Participant-axis extraction helpers locate the `מפת הצירים של המשתתפים` section, parse participant blocks and axis rows, filter by selected participants, and feed `ParticipantAxisVisualizer`.
- `handleFeedbackSubmit`: sends rating/comment feedback through the provided logging callback.
- `constructShareableText`: builds copied/shared text with title, body, branding, current URL, and privacy line.
- `handleCopyText`: copies the current share text to the clipboard.
- `handleSocialShare`: opens WhatsApp, Telegram, Facebook, or LinkedIn share URLs.
- `handleCopyCanvasToClipboard`: copies the generated cartoon canvas as PNG.
- `handleCopyVisualsToClipboard`: uses `html-to-image` to copy the hidden participant-axis share poster.
- `handleDownloadPDF`: opens a print window with styled HTML; despite the name, the browser print dialog creates the PDF.
- `handleVersionSelect`: switches share version between original text, AI summary, and cartoon image/card generation.
- The image-composition effect draws a 1080x1080 canvas with generated image background, logo, headline, points, and attribution.

### `components/ParticipantAxisVisualizer.tsx`

- `getAxisChampions`: finds highest-scoring participant(s) per axis, preserving ties.
- `getSharePosterColumns`: chooses poster columns and width based on participant count.
- `ParticipantMetricRow`, `ParticipantAxisCard`, `AxisChampionCard`: in-modal visual rows/cards.
- `SharePosterMetricTile`, `SharePosterParticipantCard`, `SharePosterChampionCard`: hidden high-resolution poster UI for clipboard/image sharing.
- `ParticipantAxisVisualizer`: normal app visualization.
- `ParticipantAxisSharePoster`: offscreen share-poster rendering target.

### Admin client helpers

- `AdminDashboardClient.callAdminApi`: attaches admin auth headers, redirects unauthorized users, and unwraps API payloads.
- `AdminDashboardClient.loadDashboard`: fetches the full dashboard snapshot for the selected preset.
- `AdminDashboardClient.loadUsers`: searches/fetches users.
- `AdminDashboardClient.loadUserDetail`: loads one user's transactions, feedback, and usage.
- `AdminDashboardClient.loadFeedback`: fetches filtered feedback summary and entries.
- `AdminDashboardClient.loadLogs`: fetches recent logs.
- `AdminDashboardClient.generateFriendsCode`: creates a one-use `FRIENDS-*` referral code.
- `AdminDashboardClient.copyFriendsCode`: copies generated friend code to clipboard.
- `AdminDashboardClient.runAdminAction`: shared wrapper for reset tier, set tier, referral, and reconcile actions.
- `AdminDashboardClient.feedbackHistogram`: memoized 1-10 rating histogram.
- `AdminPromptsClient.callPromptApi`: attaches admin headers and unwraps prompt API responses.
- `AdminPromptsClient.loadPrompts`: loads prompts and initializes the selected prompt/editor content.
- `AdminPromptsClient.runPromptAction`: sends draft/testing/discard/commit actions and reloads prompt state.

### Account page helpers

- `LoginPage.handleEmailSignIn`: email/password login then returns to `/`.
- `LoginPage.handleGoogleSignIn`: Google login then returns to `/`.
- `SignUpPage.handleSignUp`: validates password confirmation/min length and creates an email account.
- `SignUpPage.handleGoogleSignIn`: Google signup/login then returns to `/`.
- `ProfilePage.fetchUserData`: fetches tier, transactions, usage, and admin status.
- `ProfilePage.handleCancelSubscription`: confirms, authenticates, calls cancellation API, and refreshes profile data.
- `ProfilePage.handleLogout`: logs out and returns home.
- `ProfilePage.getTierConfig`: maps tiers to Hebrew labels, gradients, and icons.
- `ProfilePage.getStatusIcon` and `getStatusText`: map subscription statuses to UI affordances.

