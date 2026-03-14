// Background service worker (Manifest V3) for the ChoTot Browser Agent.
// - Connects to the local Java backend via WebSocket.
// - Receives REQUEST_SNAPSHOT commands.
// - Forwards commands to the active Shopee tab and returns PRODUCT_SNAPSHOT results.

import { log } from './utils.js';
import { SAMPLE_PRODUCT_URL, SAMPLE_PRODUCT_EXPECTED } from './selectorDiscoveryConfig.js';

const BACKEND_BASE_URL = 'http://localhost:8095';

const AGENT_POLL_ALARM = 'AGENT_POLL_ALARM';
const POLL_PERIOD_MINUTES = 0.1; // ~6 seconds

const DAILY_SELECTOR_DISCOVERY_ALARM = 'DAILY_SELECTOR_DISCOVERY_ALARM';
const DAILY_DISCOVERY_PERIOD_MINUTES = 24 * 60; // 1 day

async function pollOnce() {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/agent/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agentId: 'chrome-extension' })
    });

    if (res.status === 204) {
      // No job available
      return;
    }

    if (!res.ok) {
      log('Poll error status', res.status);
      return;
    }

    const job = await res.json();
    await handleJob(job);
  } catch (e) {
    log('Poll error', e);
  }
}

async function handleJob(job) {
  if (!job || !job.type || !job.jobId) {
    return;
  }

  const type = job.type;
  const jobId = job.jobId;
  const url = job.url || null;

  if (type === 'SNAPSHOT') {
    const product = await performSnapshot(url);
    await sendJobResult(jobId, type, product);
  } else if (type === 'LATEST_PRODUCTS') {
    const products = await performLatestProducts(url);
    await sendJobResult(jobId, type, products);
  } else {
    log('Unknown job type', type);
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

async function performSnapshot(url) {
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
      return null;
    }

    const product = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'GET_PRODUCT_SNAPSHOT' },
        (response) => {
          if (chrome.runtime.lastError) {
            log('Error sending message to content script', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response && response.product ? response.product : null);
          }

          if (createdTabId) {
            setTimeout(() => {
              chrome.tabs.remove(createdTabId, () => {
                if (chrome.runtime.lastError) {
                  log('Failed to close snapshot tab', chrome.runtime.lastError);
                }
              });
            }, 10000);
          }
        }
      );
    });

    return product;
  } catch (e) {
    log('Error in performSnapshot()', e);

    if (createdTabId) {
      setTimeout(() => {
        chrome.tabs.remove(createdTabId, () => {
          if (chrome.runtime.lastError) {
            log('Failed to close snapshot tab after error', chrome.runtime.lastError);
          }
        });
      }, 10000);
    }

    return null;
  }
}

async function performLatestProducts(url) {
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
      return [];
    }

    const products = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'GET_LATEST_PRODUCTS' },
        (response) => {
          if (chrome.runtime.lastError) {
            log('Error sending GET_LATEST_PRODUCTS to content script', chrome.runtime.lastError);
            resolve([]);
          } else {
            resolve(response && Array.isArray(response.products) ? response.products : []);
          }

          if (createdTabId) {
            setTimeout(() => {
              chrome.tabs.remove(createdTabId, () => {
                if (chrome.runtime.lastError) {
                  log('Failed to close latest products tab', chrome.runtime.lastError);
                }
              });
            }, 10000);
          }
        }
      );
    });

    return products;
  } catch (e) {
    log('Error in performLatestProducts()', e);

    if (createdTabId) {
      setTimeout(() => {
        chrome.tabs.remove(createdTabId, () => {
          if (chrome.runtime.lastError) {
            log('Failed to close latest products tab after error', chrome.runtime.lastError);
          }
        });
      }, 10000);
    }

    return [];
  }
}

async function sendJobResult(jobId, type, payload) {
  try {
    await fetch(`${BACKEND_BASE_URL}/api/agent/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobId,
        type,
        payload
      })
    });
  } catch (e) {
    log('Failed to send job result', e);
  }
}

async function runDailySelectorDiscovery() {
  try {
    const url = SAMPLE_PRODUCT_URL;
    if (!url || typeof url !== 'string') {
      log('Daily selector discovery skipped: SAMPLE_PRODUCT_URL is not configured');
      return;
    }

    let createdTabId = null;

    let tab = await new Promise((resolve) => {
      chrome.tabs.create({ url }, (newTab) => {
        createdTabId = newTab.id;
        resolve(newTab);
      });
    });

    tab = await waitForTabComplete(tab.id);

    if (!tab || !tab.id || !tab.url || !tab.url.includes('chotot.com')) {
      log('Daily selector discovery: no ChoTot tab after opening sample URL');
      return;
    }

    const expectedSelectors = SAMPLE_PRODUCT_EXPECTED && typeof SAMPLE_PRODUCT_EXPECTED === 'object'
      ? SAMPLE_PRODUCT_EXPECTED
      : {};

    const selectors = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'RUN_PRODUCT_SELECTOR_DISCOVERY', expectedSelectors },
        (response) => {
          if (chrome.runtime.lastError) {
            log('Daily selector discovery: error sending message to content script', chrome.runtime.lastError);
            resolve({});
          } else if (response && response.selectors && typeof response.selectors === 'object') {
            resolve(response.selectors);
          } else {
            resolve({});
          }

          if (createdTabId) {
            setTimeout(() => {
              chrome.tabs.remove(createdTabId, () => {
                if (chrome.runtime.lastError) {
                  log('Daily selector discovery: failed to close sample tab', chrome.runtime.lastError);
                }
              });
            }, 10000);
          }
        }
      );
    });

    if (selectors && Object.keys(selectors).length > 0) {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ dynamicSelectors: selectors }, () => {
          if (chrome.runtime.lastError) {
            log('Daily selector discovery: failed to save selectors', chrome.runtime.lastError);
          } else {
            log('Daily selector discovery: selectors updated', selectors);
          }
        });
      } else {
        log('Daily selector discovery: chrome.storage.local is not available, selectors not persisted');
      }
    } else {
      log('Daily selector discovery: no selectors discovered');
    }
  } catch (e) {
    log('Daily selector discovery: unexpected error', e);
  }
}

// Set up alarms to periodically poll the backend and refresh selectors.
function createPollAlarm() {
  chrome.alarms.create(AGENT_POLL_ALARM, { periodInMinutes: POLL_PERIOD_MINUTES });
}

function createDailyDiscoveryAlarm() {
  chrome.alarms.create(DAILY_SELECTOR_DISCOVERY_ALARM, { periodInMinutes: DAILY_DISCOVERY_PERIOD_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  log('Service worker installed at', new Date().toISOString());
  createPollAlarm();
  createDailyDiscoveryAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  log('Service worker startup at', new Date().toISOString());
  createPollAlarm();
  createDailyDiscoveryAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AGENT_POLL_ALARM) {
    pollOnce();
  } else if (alarm.name === DAILY_SELECTOR_DISCOVERY_ALARM) {
    runDailySelectorDiscovery();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'RUN_PRODUCT_SELECTOR_DISCOVERY_NOW') {
    (async () => {
      await runDailySelectorDiscovery();
      sendResponse({ ok: true });
    })();
    return true;
  }
  return undefined;
});

