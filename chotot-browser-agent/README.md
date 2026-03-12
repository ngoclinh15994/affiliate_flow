ChoTot Browser Agent SDK (MVP)
================================

## Overview

**ChoTot Browser Agent SDK** is an MVP that demonstrates how an AI system (e.g. OpenClaw) can retrieve structured product data from real ChoTot product pages using:

- **Chrome Extension (Manifest V3)** running in a real browser.
- **Java Spring Boot backend** exposing a simple REST API.

Communication flow:

OpenClaw AI → Java Backend API → Chrome Extension → ChoTot Page DOM

The backend exposes a REST endpoint that triggers the extension to read the active ChoTot tab’s DOM and return a structured product snapshot.

---

## Project Structure

```text
shopee-browser-agent/
│
├── backend-java/
│   ├── pom.xml
│   ├── application.properties
│   └── src/main/java/com/agent/
│       ├── ChoTotBrowserAgentApplication.java
│       ├── controller/
│       │   └── ProductController.java
│       ├── service/
│       │   └── AgentRequestService.java
│       └── model/
│           └── ProductSnapshot.java
│
├── chrome-extension/
│   ├── manifest.json
│   ├── background.js
│   ├── contentScript.js
│   ├── agent.js
│   ├── chototParser.js
│   ├── selectors.properties
│   └── utils.js
│
└── README.md
```

---

## Backend (Java, Spring Boot)

### Architecture

- **REST API**:
  - **`GET /api/product-snapshot`** – triggers a request to the extension to read the active Shopee product page and returns the structured product JSON.
- **WebSocket**:
  - Endpoint: **`ws://localhost:8080/ws/agent`**
  - Used by the Chrome extension’s background service worker to:
    - Receive commands like `REQUEST_SNAPSHOT`.
    - Send back responses like `PRODUCT_SNAPSHOT`.

The backend coordinates HTTP requests from OpenClaw with WebSocket messages to/from the extension.

### Data Model

`ProductSnapshot` (Java):

```json
{
  "title": "",
  "price": "",
  "rating": "",
  "sold": "",
  "shop": "",
  "images": []
}
```

All fields are strings (except `images` which is a list of strings). If a selector cannot be found, the extension returns `null` for that field.

### Running the Backend

Requirements:

- Java 17+
- Maven 3.8+

Steps:

```bash
cd shopee-browser-agent/backend-java
mvn spring-boot:run
```

By default the backend starts on `http://localhost:8080`.

You should see logs indicating that the WebSocket endpoint `/ws/agent` is active.

---

## Chrome Extension (Manifest V3)

### Responsibilities

- Inject **content scripts** into Shopee pages.
- Extract product data using selectors defined in `selectors.properties`.
- Implement core functions:
  - `getProductSnapshot()`
  - `scrollPage()`
  - `getPageUrl()`
- Listen for commands from the background service worker and from the backend (via WebSocket).
- Return structured product data to the backend.

### Files

- **`manifest.json`** – Extension manifest (MV3), declares background service worker, content script, permissions, and web-accessible resources.
- **`background.js`** – Service worker:
  - Connects to `ws://localhost:8080/ws/agent`.
  - Listens for `REQUEST_SNAPSHOT` messages from backend.
  - Forwards commands to the active Shopee tab.
  - Receives responses from content script and sends them back over WebSocket as `PRODUCT_SNAPSHOT`.
- **`contentScript.js`** – Runs in the context of Shopee pages:
  - Dynamically imports `agent.js`.
  - Listens for messages from background.
  - Calls `getProductSnapshot()`, `scrollPage()`, `getPageUrl()`.
- **`agent.js`** – High-level agent API for the DOM:
  - Uses `shopeeParser.js` to read product information.
  - Implements:
    - `getProductSnapshot()`
    - `scrollPage()`
    - `getPageUrl()`
- **`shopeeParser.js`** – Shopee-specific DOM parser:
  - Loads CSS selectors from `selectors.properties`.
  - Exposes `extractProduct()` which returns the product object.
  - Handles missing selectors by returning `null` fields instead of throwing.
- **`selectors.properties`** – Simple key/value selector configuration file.
- **`utils.js`** – Shared helper utilities (e.g. safe query helpers, selector parsing, logging).

### Installing the Extension (Developer Mode)

1. Build and run the backend as described above.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in top-right).
4. Click **“Load unpacked”**.
5. Select the `shopee-browser-agent/chrome-extension` folder.
6. Ensure the extension is enabled.

Once installed, when you navigate to a Shopee product page, the content script will be injected automatically (based on URL match patterns).

---

## How OpenClaw Calls the Backend API

OpenClaw (or any other client) only needs to talk to the **Java backend** via HTTP.

### API Endpoint

- **Method**: `GET`
- **URL**: `http://localhost:8080/api/product-snapshot`

### High-Level Flow

1. OpenClaw sends `GET /api/product-snapshot` to the backend.
2. Backend:
   - Generates a request ID.
   - Sends a WebSocket message to the extension: `{ "type": "REQUEST_SNAPSHOT", "requestId": "..." }`.
   - Waits for a matching `PRODUCT_SNAPSHOT` response (with timeout).
3. Background script receives `REQUEST_SNAPSHOT`:
   - Locates the active Shopee tab.
   - Sends a message to the content script asking for `GET_PRODUCT_SNAPSHOT`.
4. Content script:
   - Calls `getProductSnapshot()` from `agent.js`.
   - `agent.js` calls `extractProduct()` in `shopeeParser.js`.
   - `shopeeParser.js` uses selectors from `selectors.properties` to parse the DOM.
   - Returns structured product JSON.
5. Background script sends the JSON back to backend over WebSocket as:
   - `{ "type": "PRODUCT_SNAPSHOT", "requestId": "...", "payload": { ...product... } }`
6. Backend resolves the waiting HTTP request and returns the product JSON to OpenClaw.

---

## Example API Request and Response

### Example `curl` Request

```bash
curl http://localhost:8080/api/product-snapshot
```

### Example Response

```json
{
  "title": "Wireless Bluetooth Headphones XYZ",
  "price": "₫299.000",
  "rating": "4.8",
  "sold": "1.2k sold",
  "shop": "Awesome Tech Store",
  "images": [
    "https://cf.shopee.vn/file/abc123",
    "https://cf.shopee.vn/file/def456"
  ]
}
```

If fields are missing due to selector mismatch, they will be `null` instead of causing errors:

```json
{
  "title": null,
  "price": null,
  "rating": null,
  "sold": null,
  "shop": null,
  "images": []
}
```

---

## Updating `selectors.properties` When Shopee Changes the DOM

**Goal:** Make DOM selector updates possible without touching any JavaScript or Java code.

### File Format

`chrome-extension/selectors.properties`:

```properties
product.title=.pdp-mod-product-badge-title
product.price=.pdp-price
product.rating=.rating-star
product.sold=.sold-count
product.shop=.shop-name
product.images=.product-image-selector
```

Rules:

- One `key=value` pair per line.
- Lines starting with `#` are treated as comments.
- Blank lines are ignored.
- Values are standard CSS selectors.

### How It Works

- `shopeeParser.js` loads `selectors.properties` once (and caches it).
- For each field (`product.title`, `product.price`, etc.), it:
  - Looks up the selector string.
  - Queries the DOM using `document.querySelector` or `document.querySelectorAll`.
  - Returns `innerText`/`textContent` or `src` for images.
- If a selector is missing or no element matches, the field is set to `null` (or `[]` for images).

### Steps to Update Selectors

1. Open a Shopee product page in Chrome.
2. Use Chrome DevTools to inspect the DOM and find the correct CSS selectors for:
   - Title
   - Price
   - Rating
   - Sold count
   - Shop name
   - Product images
3. Edit `chrome-extension/selectors.properties` and update the values.
4. In `chrome://extensions`, click **“Reload”** on the extension to pick up changes.
5. Test again by hitting the backend endpoint and verifying the returned JSON.

No backend or extension JavaScript code changes are required as long as the keys remain the same.

---

## Error Handling and Limitations (MVP)

- If the extension is not connected via WebSocket when `/api/product-snapshot` is called:
  - Backend returns HTTP `503 Service Unavailable` with a simple error message.
- If the extension does not respond in time (e.g. page too slow or user not on Shopee):
  - Backend returns HTTP `504 Gateway Timeout` (or `500` with a friendly error).
- If individual selectors fail:
  - The corresponding fields in the JSON are `null`.
  - The call still succeeds (no crash).

**MVP Scope:**

- Only **single-page snapshot** of the currently active tab.
- No crawling, pagination, or multi-product listing scraping.
- No persistence or database.

This is intentionally minimal to prove the architecture and flow between OpenClaw, backend, Chrome extension, and Shopee DOM.

---

## Next Steps / Possible Enhancements

- Support multiple concurrent browser connections with per-session IDs.
- Add authentication / API keys on the backend.
- Support additional actions such as:
  - Clicking UI elements.
  - Changing filters.
  - Navigating through search results.
- Add richer product metadata (variants, attributes, shipping info, etc.).

