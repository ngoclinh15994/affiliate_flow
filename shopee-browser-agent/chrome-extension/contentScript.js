// Content script injected into Shopee pages.
// It delegates to agent.js for the core logic and responds to messages
// from the background service worker.

// Lazy-load agent.js as an ES module to keep the content script itself simple.
async function loadAgentModule() {
  const url = chrome.runtime.getURL('agent.js');
  return import(url);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const agent = await loadAgentModule();

    if (message.type === 'GET_PRODUCT_SNAPSHOT') {
      const product = await agent.getProductSnapshot();
      sendResponse({ product, requestId: message.requestId });
    } else if (message.type === 'GET_LATEST_PRODUCTS') {
      const products = await agent.getLatestProducts();
      sendResponse({ products, requestId: message.requestId });
    } else if (message.type === 'SCROLL_PAGE') {
      agent.scrollPage();
      sendResponse({ ok: true });
    } else if (message.type === 'GET_PAGE_URL') {
      const url = agent.getPageUrl();
      sendResponse({ url });
    }
  })();

  // Indicate that we will send a response asynchronously.
  return true;
});

