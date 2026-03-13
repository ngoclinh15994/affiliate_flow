// Shared utilities for the Shopee Browser Agent extension (MVP).

export function log(...args) {
  // Centralized logging so it can be adjusted later if needed.
  const message = args
    .map((a) => {
      try {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');

  console.log('[ShopeeAgent]', ...args);

  // If running in a page context with a DOM, also show a small toast.
  try {
    if (typeof window !== 'undefined' && window.document) {
      showToast(message);
    }
  } catch {
    // Best-effort only; ignore toast errors so logging never breaks logic.
  }
}

function showToast(text) {
  const doc = window.document;
  if (!doc) return;

  const containerId = 'chotot-agent-toast-container';
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
  toast.style.padding = '8px 12px';
  toast.style.borderRadius = '6px';
  toast.style.fontSize = '12px';
  toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
  toast.style.wordBreak = 'break-word';

  container.appendChild(toast);

  // Auto-remove after 6 seconds.
  setTimeout(() => {
    if (toast.parentNode === container) {
      container.removeChild(toast);
    }
    // Clean up empty container to avoid accumulating nodes.
    if (container.childElementCount === 0 && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }, 6000);
}

/**
 * Very small .properties parser.
 * Supports:
 *  - key=value pairs
 *  - lines starting with # as comments
 *  - ignores blank lines
 */
export function parseProperties(text) {
  const result = {};
  if (!text) {
    return result;
  }
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

export function safeText(element) {
  if (!element) return null;
  const text = element.textContent || element.innerText || '';
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function safeAttr(element, attr) {
  if (!element) return null;
  const value = element.getAttribute(attr);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

