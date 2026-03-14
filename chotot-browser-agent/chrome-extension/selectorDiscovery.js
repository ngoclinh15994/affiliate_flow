import { safeText, log } from './utils.js';
import { SAMPLE_PRODUCT_EXPECTED } from './selectorDiscoveryConfig.js';

function normalizeText(value) {
  if (value == null) return '';
  const str = String(value);
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function findElementByText(root, expectedRaw) {
  const expected = normalizeText(expectedRaw);
  if (!expected) {
    return null;
  }

  const doc = root.ownerDocument || window.document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

  let node;
  while ((node = walker.nextNode())) {
    const nodeValue = node.nodeValue;
    if (!nodeValue) continue;
    const norm = normalizeText(nodeValue);
    if (!norm) continue;

    if (norm.includes(expected) || expected.includes(norm)) {
      return node.parentElement || null;
    }
  }

  return null;
}

function generateSelector(el) {
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

export async function discoverProductSelectors(expectedOverride) {
  const doc = window.document;
  if (!doc) {
    return {};
  }

  const root = doc.querySelector('#__next') || doc.body || doc.documentElement;
  if (!root) {
    return {};
  }

  const expected = expectedOverride && typeof expectedOverride === 'object'
    ? expectedOverride
    : SAMPLE_PRODUCT_EXPECTED;

  const result = {};

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (typeof expectedValue !== 'string' || !expectedValue.trim()) {
      continue;
    }

    try {
      const baseElement = findElementByText(root, expectedValue);
      if (!baseElement) {
        log('Selector discovery: no element found for key', key);
        continue;
      }

      const selector = generateSelector(baseElement);
      if (!selector) {
        log('Selector discovery: failed to generate selector for key', key);
        continue;
      }
      result[key] = selector;
    } catch (e) {
      log('Selector discovery: error while processing key', key, e);
    }
  }

  return result;
}

