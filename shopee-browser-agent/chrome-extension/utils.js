// Shared utilities for the Shopee Browser Agent extension (MVP).

export function log(...args) {
  // Centralized logging so it can be adjusted later if needed.
  console.log('[ShopeeAgent]', ...args);
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

