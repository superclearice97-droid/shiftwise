# Store and AI connections

Open **Discounts → Connected deals**. Add a store connection, then open **AI & refresh settings** and enable API requests. Enter a desired item and press **Check local prices**. Watch an exact product and size to set a target; linked watches are checked independently of the search, up to 10 per refresh. Manual tracking remains available offline.

## Supported store sources

- **Kroger Products API:** supply an authorized bearer access token and an eight-digit location ID from Kroger's Locations API. Use your actual store name. Prices come from the location's `items[].price` (regular/promo), not national estimates. Obtain/renew tokens through your registered Kroger developer application; Shiftwise does not automatically renew tokens or store OAuth client secrets. This integration does not activate coupons, access your shopper account, or change carts. Official docs: https://developer.kroger.com/reference/api/product-api-public and https://developer.kroger.com/reference/api/location-api-public.
- **Authorized JSON feed:** supply your own approved store API or adapter endpoint and optional bearer key. Arbitrary retailer websites and incompatible native API responses cannot be imported directly. An adapter must implement the contract below. This is how other local stores can be connected; Walmart, Target and Aldi do not have preconfigured adapters in this update.

Every feed receives `GET <endpoint>?zip=60438&locationId=north&q=coffee`. Exact watch checks also send `productId=coffee-12oz`; Kroger translates that into `filter.productId` with its product identifier. Your adapter must honor the explicit location, return USD prices for that location, and preserve exact product IDs and variants.

```json
{
  "offers": [
    {
      "id": "coffee-12oz",
      "name": "Coffee",
      "store": "Local store",
      "variant": "12 oz bag",
      "price": 5.00,
      "regularPrice": 8.00,
      "currency": "USD",
      "url": "https://store.example/coffee",
      "terms": "Member price. Verify eligibility. Tax and delivery excluded.",
      "locationId": "north",
      "zip": "60438",
      "observedAt": "2026-10-13T19:00:00Z",
      "expiresAt": null
    }
  ]
}
```

All fields are required. `regularPrice` may be null if unknown; otherwise it must be at least `price`. `url` can be empty, and otherwise must be HTTPS without embedded credentials. `expiresAt` is null or an ISO timestamp. Use a current `observedAt`: observations older than 24 hours and timestamps more than a minute into the future are rejected. Maximum 100 offers and 500 KB per response. Redirects are refused so bearer keys cannot be forwarded to an unexpected host. The example timestamp is illustrative, not a live deal.

The app shows shelf price, source, size, location, observation time and supplied terms. Expired and stale cached prices are excluded from connected recommendations. A supplied regular price allows an explicit markdown calculation; no regular price means no claimed discount. Kroger does not provide offer expiry through this adapter; verify checkout conditions. Changing an API-linked watch's name/store/variant detaches its automated link to avoid comparing different products.

## AI

Use any API implementing OpenAI-compatible **Chat Completions**: enter the full `/v1/chat/completions` endpoint, API key, and an exact model name supported by your provider. OpenAI is prefilled; no model is hardcoded. For Ollama on Linux use `http://127.0.0.1:11434/v1/chat/completions` on the same computer, or a numeric LAN IP for another computer. Android connections require HTTPS, including a trusted HTTPS gateway for a local model. Do not disable certificate verification.

Each question requires confirmation naming the recipient and showing the question, ZIP and observation count. AI receives up to 30 current feed observations (names, sizes, stores, prices, terms and times). Pay, expenses, holdings, vault passphrases and other providers' keys are excluded. Answers are plain escaped text held in memory, cleared on lock and refresh, and never used as new price observations. AI is advisory; it can still make mistakes. No autonomous purchases, coupon activation or web searches occur. Chat subscriptions are separate from API access and billing.

### AI deal watcher (opt-in)

In **AI & refresh settings**, tick **Let AI watch deals for me** (requires AI comparison) and optionally describe what to look for. After each successful store refresh, Shiftwise sends one request (`action: "aiwatch"`) with the ZIP, up to 30 current observations referenced by number, up to 10 API-linked watches (name, store, size, target) and your note. The model must reply with JSON `{"picks":[{"n":1,"reason":"…"}],"summary":"…"}`; Shiftwise keeps at most 5 valid, unique picks (reasons capped at 300 characters), ignores anything else, and shows them as **✦ AI picks** on the watcher card, the offer cards and the floating deal orbs. Unchanged prices are not re-sent, so a 15-minute refresh costs at most one AI request when something changed. Failures never block store prices. Picks stay in memory and clear on lock. **Turn off** on the watcher card stops automatic requests immediately.

### Deals in motion

The Discounts tab shows saved offers, recorded price drops and connected store prices as floating wireframe orbs. Swipe across them to push and spin them; tap one for details and its action. Arrow keys move between orbs, and a screen-reader list mirrors them. Motion stops with the app's motion setting or the system reduced-motion preference. Drawn locally; nothing is sent.

API reference: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create. Native HTTP reference: https://capacitorjs.com/docs/apis/http.

## Refresh and storage

Keys, feed configuration, targets and fetched observations are stored in the existing encrypted vault, encrypted sync and encrypted backups. Removing a store deletes its key and cached feed, retaining saved history. Disable requests in AI & refresh settings to stop API access. AI replies are not persisted. After the first manual check, optional refresh runs every 15 minutes only while the app is visible, unlocked and no form is open. Closed/locked apps do not poll, and there are no push notifications. Alerts appear in the app after a refreshed exact product reaches its target or a new recorded low. Watch histories include API provenance and ZIP; they retain old observations when a provider is unavailable.

## Hosted website

`POST /api/deals` requires the existing platform-authenticated identity, a same-origin `Origin`, JSON content type and a 200 KB request body limit. Only `https://api.kroger.com` and `https://api.openai.com` are enabled by default. An administrator can add comma-separated **exact HTTPS origins** with Worker environment variable `DEAL_API_ORIGINS`. Only configure trusted public provider hosts; never allow hosts resolving to private infrastructure. Home LAN APIs are unavailable through the hosted website.

The server handles the user-provided API key, search and AI context in plaintext transiently to call the provider; at-rest vault encryption does not hide those request payloads from the hosting service. They are neither logged nor cached by Shiftwise. Infrastructure may retain independent request metadata. The per-isolate 20 requests/minute guard is a basic limit; broader deployment needs infrastructure rate limiting as well. Follow the existing verified-authentication requirements in README before hosting outside Sites.

Downloaded Linux uses a same-app protocol handler with Node HTTP transport, keeping external renderer networking blocked. Android uses Capacitor's native HTTP helper with redirects disabled, without broadening WebView CSP or enabling general fetch patching. No geolocation permission is needed: location is supplied explicitly.

## Validation status

Automated tests cover provider response validation, Kroger mapping, stale/expired data, URL restrictions, limited AI payloads, error handling, authenticated hosted requests, encryption and sync. Development UI tests use simulated store and AI feeds. Real store/API credentials and Android/Linux device connectivity still need testing by the account owner.
