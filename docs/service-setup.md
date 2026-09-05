# Service setup

No production credentials have been committed or configured. The private browser preview uses platform-authenticated accounts and sample vocabulary; it does not verify email/Apple sign-in or live AI.

## Browser and database

The Sites project is registered in the hosting manifests. The owner-only preview can provision D1 and run the browser/API together without an external domain. The deployment package includes Drizzle schema migrations. Do not edit a migration after it has been deployed; add a new one.

For local development, install the browser dependencies, run `npm --prefix apps/web run db:migrate`, then `npm run dev`. Sign in through the local preview link. The simulated Sites identity exists only in development.

## Live AI

Set server-only `OPENAI_API_KEY` and `OPENAI_MODEL` through the hosting environment. Pick a model only after representative language-quality and usage measurements; this implementation deliberately has no silent model default. If an OpenAI Developers plugin is available, its API-key setup flow can provision a key with the owner’s approval. Otherwise create/configure the provider account and key through the provider’s own account UI.

The adapter uses the [Responses API’s structured output format](https://developers.openai.com/api/docs/guides/structured-outputs). It sends only the captured expression/context and relevant lexical configuration, requests no tools, sets `store:false`, bounds output and timeouts, and validates results before publishing. Failed automatic repairs are part of the original page reservation.

Optional `OPENAI_INPUT_USD_PER_MILLION` and `OPENAI_OUTPUT_USD_PER_MILLION` values enable explicit estimated cost records. Leave them blank when prices have not been confirmed. Actual billing and cached-token pricing require comparison with provider usage before commercial planning.

## Email verification

Provision a Resend account and verified sender domain, then configure:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `AUTH_SECRET`: a random server secret of at least 32 characters.

Verify real delivery, spam handling, expiration, retry/rate limits, logout, and account isolation. The automated tests substitute email delivery and therefore do not establish real deliverability.

## Sign in with Apple

Create the Apple developer/app identity, enable Sign in with Apple, configure the web Services ID and return URL, and group associated app/web identifiers appropriately. Configure:

- `APPLE_CLIENT_ID`: comma-separated accepted audiences, web Services ID first and the iOS bundle ID second when both are used.
- `APPLE_REDIRECT_URI`: the exact HTTPS `/api/auth/apple/callback` URL registered with Apple.
- `APP_ORIGIN`: the canonical browser origin when it differs from the incoming worker request origin.

The server checks Apple signatures, issuer, audience, expiry, and the nonce. [Apple’s authentication guidance](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple) is the integration reference. Real-device Apple sign-in, credential revocation, account deletion requirements, and explicit verified identity linking still need completion before distribution. Current email/Apple identities are kept separate rather than merged from an email claim.

## iOS

Install full Xcode, select it as the active developer directory, install XcodeGen, and follow [the iOS setup](../apps/ios/README.md). Supply an Apple development team and provision both targets with the shared App Group. The existing Command Line Tools installation is insufficient for simulator/device builds.

## External clients and production recovery

The private Sites preview has a platform sign-in gate in front of the application API. A bearer token alone does not bypass that gate. Before testing native or Chrome clients against hosted production, arrange an endpoint/access configuration that supports the public email/Apple account flow. Do not make the preview public merely to get around authentication.

Configure an independent queue/scheduled generation worker for autonomous recovery after Worker interruption when no client returns. Current `waitUntil` execution plus foreground/alarm ticks are adequate for development validation, but not a guarantee of eventual processing without further invocations.

## Release checks

Complete the remaining evidence in [implementation status](implementation-status.md), especially actual iOS sharing, Chrome installation/service-worker restart, offline reload in a production browser, independent-device convergence, live provider quality/cost evaluation, Apple revocation/linking, and account deletion. No subscriptions, checkout, or monthly quota reset are part of this MVP.
