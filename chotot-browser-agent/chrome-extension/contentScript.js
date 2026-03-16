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
    } else if (message.type === 'RUN_PRODUCT_SELECTOR_DISCOVERY') {
      const selectors = await agent.runProductSelectorDiscovery(message.expectedSelectors);
      sendResponse({ selectors });
    } else if (message.type === 'START_RESELECT') {
      startReselectMode(message.fieldKey, sendResponse);
    }
  })();

  // Indicate that we will send a response asynchronously.
  return true;
});

let reselectState = null;
let hoverOverlay = null;

function showReselectToast(text) {
  try {
    const doc = window.document;
    if (!doc) return;

    const containerId = 'chotot-agent-reselect-toast-container';
    let container = doc.getElementById(containerId);

    if (!container) {
      container = doc.createElement('div');
      container.id = containerId;
      container.style.position = 'fixed';
      container.style.top = '10px';
      container.style.right = '10px';
      container.style.zIndex = '2147483647';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.maxWidth = '360px';
      container.style.fontFamily =
        '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
      doc.body.appendChild(container);
    }

    const toast = doc.createElement('div');
    toast.textContent = text;
    toast.style.background = 'rgba(0, 0, 0, 0.85)';
    toast.style.color = '#fff';
    toast.style.padding = '6px 10px';
    toast.style.borderRadius = '6px';
    toast.style.fontSize = '12px';
    toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    toast.style.wordBreak = 'break-word';

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
      if (container.childElementCount === 0 && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 4000);
  } catch {
    // best-effort only
  }
}

function ensureOverlay() {
  if (hoverOverlay && hoverOverlay.parentElement) {
    return hoverOverlay;
  }
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.zIndex = '2147483647';
  overlay.style.pointerEvents = 'none';
  overlay.style.border = '2px solid #10b981';
  overlay.style.background = 'rgba(16, 185, 129, 0.08)';
  overlay.style.display = 'none';
  document.documentElement.appendChild(overlay);
  hoverOverlay = overlay;
  return overlay;
}

function clearOverlay() {
  if (hoverOverlay && hoverOverlay.parentElement) {
    hoverOverlay.parentElement.removeChild(hoverOverlay);
  }
  hoverOverlay = null;
}

function updateOverlayForElement(el) {
  const overlay = ensureOverlay();
  if (!el || !el.getBoundingClientRect) {
    overlay.style.display = 'none';
    return;
  }
  const rect = el.getBoundingClientRect();
  overlay.style.left = `${rect.left + window.scrollX}px`;
  overlay.style.top = `${rect.top + window.scrollY}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.display = 'block';
}

function generateAbsoluteSelector(el) {
  if (!el || !el.ownerDocument) {
    return null;
  }
  let path = [];
  let current = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.nodeName.toLowerCase();

    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else {
      let sib = current;
      let nth = 1;
      // eslint-disable-next-line no-cond-assign
      while ((sib = sib.previousElementSibling)) {
        if (sib.nodeName.toLowerCase() === selector) nth++;
      }
      selector += `:nth-of-type(${nth})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

function stopReselectMode(result) {
  if (reselectState && reselectState.fieldKey) {
    const key = reselectState.fieldKey;
    if (result && result.ok && result.selector) {
      showReselectToast(`Đã cập nhật selector cho ${key}.`);
    } else if (result && result.cancelled) {
      showReselectToast(`Đã huỷ chọn lại selector cho ${key}.`);
    } else {
      showReselectToast(`Không lưu được selector cho ${key}.`);
    }
  }

  if (reselectState && reselectState.onComplete) {
    reselectState.onComplete(result);
  }

  if (reselectState && reselectState.mouseMoveHandler) {
    document.removeEventListener('mousemove', reselectState.mouseMoveHandler, true);
  }
  if (reselectState && reselectState.clickHandler) {
    document.removeEventListener('click', reselectState.clickHandler, true);
  }
  clearOverlay();
  reselectState = null;
}

function startReselectMode(fieldKey, sendResponse) {
  if (!fieldKey) {
    sendResponse({ ok: false });
    return;
  }

  if (reselectState) {
    stopReselectMode({ cancelled: true });
  }

  const state = {
    fieldKey,
    mouseMoveHandler: null,
    clickHandler: null,
    onComplete: (result) => {
      sendResponse(result);
    }
  };

  showReselectToast(`Đang chọn selector cho ${fieldKey}. Rê chuột và click vào phần tử cần chọn.`);

  state.mouseMoveHandler = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      updateOverlayForElement(null);
      return;
    }
    updateOverlayForElement(target);
  };

  state.clickHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target;
    if (!(target instanceof Element)) {
      stopReselectMode({ ok: false });
      return;
    }

    const selector = generateAbsoluteSelector(target);
    if (!selector) {
      stopReselectMode({ ok: false });
      return;
    }

    chrome.runtime.sendMessage(
      { type: 'RESELECT_RESULT', fieldKey, selector },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          stopReselectMode({ ok: false });
        } else {
          stopReselectMode({ ok: true, selector });
        }
      }
    );
  };

  document.addEventListener('mousemove', state.mouseMoveHandler, true);
  document.addEventListener('click', state.clickHandler, true);
  reselectState = state;
}

