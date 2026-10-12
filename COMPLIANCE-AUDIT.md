# Shiftwise focused audit — 2026-10-06

Scope: app-owned source, shipped assets, dependencies and Worker routes. Not a legal opinion or certification. Platform authentication, infrastructure logs and any email campaigns operated outside this repository were not independently audited.

1. Signup age: new vaults require an adult self-declaration. UI accepts an unselected numeric age, checks locally and blocks under-18 setup, with a tab-session denial marker to prevent immediate retries. Exact age is not persisted or transmitted. New-record API writes require ageConfirmed to be boolean true. This is self-reporting, not identity verification; direct callers can falsify their declaration. Existing encrypted accounts retain access and are not retroactively age-verified. ChatGPT sign-in precedes app onboarding and is not controlled by this code. Adult-only is a product policy, not a claim that all finance trackers legally require age 18. Reassess audience and age obligations before allowing children or teens.

2. Fonts: no external font stylesheet was present; named fonts were falling back to installed fonts. Bundled licensed DejaVu Sans regular/bold, same-origin font declarations, Worker font MIME/binary handling, offline cache entries, explicit font-src self. License at /font-license.txt. No Google Fonts requests.

3. Replay: no session replay or analytics SDK, recorder, upload endpoint or runtime dependency found. App browser network calls are own-origin state and market endpoints; server market fetch is Coinbase. Retained restrictive script/connect CSP. This does not certify the hosting/sign-in provider's infrastructure. Do not introduce replay of unlocked financial screens.

4. Marketing email: no sending code, campaign templates, mailing list or provider integration exists. No emails changed or sent. Before adding marketing, supply the real sender identity and postal address, include visible unsubscribe in HTML and plain text, implement durable suppression and a no-login opt-out, keep opt-out functional 30 days and honor within 10 business days. An unimplemented link or placeholder address is not a fix. External campaigns require separate audit.

5. Recurring billing: no checkout, payment integration, subscription button or renewal flow exists. No fabricated pricing/terms added. Before implementing recurring payment, place actual price/currency, billing interval, trial length and conversion date/price, auto-renewal, cancellation method/deadline and applicable fees adjacent to the purchase button. Obtain affirmative consent and preserve evidence; review applicable jurisdiction rules at launch.

6. DMCA: no registration was submitted. Owner must identify legal operator, public street address, alternate app/domain names, and designated agent with mailing address, telephone and email. Registration is public; operator street-address rule differs from agent mailing-address rule. Current fee $6; renew before three years expire and update changes. Publish matching agent details on a publicly accessible website; current owner-private app alone is insufficient for public notice. Registration is only one safe-harbor condition; address notice/counter-notice processes and repeat-infringer policy with counsel. Encrypted private records limit content visibility; do not promise inspection capability.

Official sources checked:
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- https://www.copyright.gov/dmca-directory/
- https://www.copyright.gov/dmca-directory/faq.html
- https://www.copyright.gov/512/

Validation: encryption/sync/market suite, rejected underage UI with no write, denial retry, API adult-declaration type checks, existing-account sync, font bytes/MIME/CSP/cache entries. No physical-device installation or independent security/legal audit.
