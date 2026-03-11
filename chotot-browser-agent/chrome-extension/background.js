// Background service worker (Manifest V3) for the ChoTot Browser Agent.
// - Connects to the local Java backend via WebSocket.
// - Receives REQUEST_SNAPSHOT commands.
// - Forwards commands to the active Shopee tab and returns PRODUCT_SNAPSHOT results.

import { log } from './utils.js';

const WS_URL = 'ws://localhost:8095/ws/agent';

let socket = null;
let reconnectTimeoutId = null;
let healthCheckIntervalId = null;

function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  log('Connecting WebSocket to backend at', WS_URL);
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    log('WebSocket connected to backend');
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }

    if (healthCheckIntervalId) {
      clearInterval(healthCheckIntervalId);
      healthCheckIntervalId = null;
    }

    // Periodic health check every 30 seconds
    healthCheckIntervalId = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        log('WebSocket health check failed, reconnecting');
        connectWebSocket();
      }
    }, 30000);
  };

  socket.onclose = () => {
    log('WebSocket closed, scheduling reconnect');
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    log('WebSocket error', err);
  };

  socket.onmessage = (event) => {
    handleBackendMessage(event.data);
  };
}

function scheduleReconnect() {
  if (reconnectTimeoutId) return;
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    connectWebSocket();
  }, 3000);
}

async function handleBackendMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    log('Failed to parse backend message', e);
    return;
  }

  if (msg.type === 'REQUEST_SNAPSHOT') {
    await handleRequestSnapshot(msg.requestId, msg.url);
  } else if (msg.type === 'REQUEST_LATEST_PRODUCTS') {
    await handleRequestLatestProducts(msg.requestId, msg.url);
  }
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let timeoutId;

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, timeoutMs);
  });
}

async function handleRequestSnapshot(requestId, url) {
  let createdTabId = null;

  try {
    let tab;

    if (url && typeof url === 'string' && url.startsWith('http')) {
      // Open the requested URL in a new tab and wait for it to finish loading.
      tab = await new Promise((resolve) => {
        chrome.tabs.create({ url }, (newTab) => {
          createdTabId = newTab.id;
          resolve(newTab);
        });
      });
      tab = await waitForTabComplete(tab.id);
    } else {
      // Fallback: use the currently active tab.
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }

    if (!tab || !tab.id || !tab.url || !tab.url.includes('chotot.com')) {
      log('No active ChoTot tab found for snapshot request');
      sendSnapshotToBackend(requestId, null);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'GET_PRODUCT_SNAPSHOT', requestId },
      (response) => {
        if (chrome.runtime.lastError) {
          log('Error sending message to content script', chrome.runtime.lastError);
          sendSnapshotToBackend(requestId, null);
        } else {
          const product = response && response.product ? response.product : null;
          sendSnapshotToBackend(requestId, product);
        }

        if (createdTabId) {
          setTimeout(() => {
            chrome.tabs.remove(createdTabId, () => {
              if (chrome.runtime.lastError) {
                log('Failed to close snapshot tab', chrome.runtime.lastError);
              }
            });
          }, 1000);
        }
      }
    );
  } catch (e) {
    log('Error handling REQUEST_SNAPSHOT', e);
    sendSnapshotToBackend(requestId, null);

    if (createdTabId) {
      setTimeout(() => {
        chrome.tabs.remove(createdTabId, () => {
          if (chrome.runtime.lastError) {
            log('Failed to close snapshot tab after error', chrome.runtime.lastError);
          }
        });
      }, 1000);
    }
  }
}

async function handleRequestLatestProducts(requestId, url) {
  const targetUrl = typeof url === 'string' && url.startsWith('http')
    ? url
    : 'https://www.chotot.com/mua-ban-do-dien-tu?f=p&sp=0&page=1';

  let createdTabId = null;

  try {
    let tab = await new Promise((resolve) => {
      chrome.tabs.create({ url: targetUrl }, (newTab) => {
        createdTabId = newTab.id;
        resolve(newTab);
      });
    });
    tab = await waitForTabComplete(tab.id);

    if (!tab || !tab.id || !tab.url || !tab.url.includes('chotot.com')) {
      log('No active ChoTot tab found for latest products request');
      sendLatestProductsToBackend(requestId, []);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'GET_LATEST_PRODUCTS', requestId },
      (response) => {
        if (chrome.runtime.lastError) {
          log('Error sending GET_LATEST_PRODUCTS to content script', chrome.runtime.lastError);
          sendLatestProductsToBackend(requestId, []);
        } else {
          const products = response && Array.isArray(response.products) ? response.products : [];
          sendLatestProductsToBackend(requestId, products);
        }

        if (createdTabId) {
          setTimeout(() => {
            chrome.tabs.remove(createdTabId, () => {
              if (chrome.runtime.lastError) {
                log('Failed to close latest products tab', chrome.runtime.lastError);
              }
            });
          }, 1000);
        }
      }
    );
  } catch (e) {
    log('Error handling REQUEST_LATEST_PRODUCTS', e);
    sendLatestProductsToBackend(requestId, []);

    if (createdTabId) {
      setTimeout(() => {
        chrome.tabs.remove(createdTabId, () => {
          if (chrome.runtime.lastError) {
            log('Failed to close latest products tab after error', chrome.runtime.lastError);
          }
        });
      }, 1000);
    }
  }
}

function sendSnapshotToBackend(requestId, product) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    log('Cannot send snapshot, WebSocket is not open');
    return;
  }

  const safeProduct = product || {
    title: null,
    price: null,
    rating: null,
    sold: null,
    shop: null,
    images: []
  };

  const message = {
    type: 'PRODUCT_SNAPSHOT',
    requestId,
    payload: safeProduct
  };

  try {
    socket.send(JSON.stringify(message));
    log('Sent PRODUCT_SNAPSHOT for requestId', requestId);
  } catch (e) {
    log('Failed to send PRODUCT_SNAPSHOT', e);
  }
}

function sendLatestProductsToBackend(requestId, products) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    log('Cannot send latest products, WebSocket is not open');
    return;
  }

  const safeProducts = Array.isArray(products) ? products : [];

  const message = {
    type: 'LATEST_PRODUCTS',
    requestId,
    payload: safeProducts
  };

  try {
    socket.send(JSON.stringify(message));
    log('Sent LATEST_PRODUCTS for requestId', requestId);
  } catch (e) {
    log('Failed to send LATEST_PRODUCTS', e);
  }
}

// Immediately attempt to connect when the service worker starts.
connectWebSocket();

