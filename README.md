# FrictionFlow

FrictionFlow is a mindful-browsing tool designed to put a deliberate pause between an impulse and opening a distracting website.

## Browser extension

The canonical Manifest V3 extension is in extension/.

### What it does

- Starts with rules for YouTube, Instagram and Twitter/X.
- Lets you add a website domain, set a 1–600 second wait and optionally require a maths challenge.
- Intercepts top-level HTTP/HTTPS navigation to a matching domain or one of its subdomains.
- Shows a pause screen and, when enabled, a randomly generated addition question.
- Grants a 15-minute focus pass for that domain after the pause/challenge.
- Stores rules and temporary passes in browser sync storage.
- Lets you abandon the attempt and close the blocked tab.

Domain matching is exact or a subdomain boundary match. For example, a rule for reddit.com matches www.reddit.com and old.reddit.com, but not reddit.com.evil.test.

### Privacy

The extension does not send browsing activity to the backend by default. Analytics is sent only if both analyticsEnabled: true and a backendApiKey are explicitly set in extension sync storage. The analytics request never blocks the page redirect.

The extension needs broad host access because user-defined rules can target arbitrary websites. It observes top-level navigation URLs only; it does not read page contents, form entries, passwords or keystrokes.

### Install / update

**Chrome, Brave and Edge**
1. Open chrome://extensions and enable Developer mode.
2. Choose Load unpacked and select extension/.
3. After updating, press Reload on the extension card.

**Firefox**
1. Run npm run build:firefox from this directory.
2. Open about:debugging#/runtime/this-firefox.
3. Choose Load Temporary Add-on and select dist/firefox-extension/manifest.json.
4. Rebuild and reload the temporary add-on after changes.

The Chrome package uses a Manifest V3 service worker. The Firefox build uses its supported non-persistent background-script manifest; both share the same source files.

### Backend

The optional Express + SQLite service is in this directory. It supports analytics and a dashboard; it is not required for the extension's core blocking behavior.

Run:

    npm install
    npm test
    npm start

Set API_KEY before exposing the backend. Do not expose an unauthenticated analytics database to the public internet. Use HOST=127.0.0.1 for local-only development unless remote access is intentional.

## Project layout

- server.js: Express API
- public/: backend dashboard
- extension/: canonical browser extension
- web/: standalone concept prototype
- scripts/: smoke and unit tests
