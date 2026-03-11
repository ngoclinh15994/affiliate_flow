// Shopee-specific DOM parser.
// Reads selectors from selectors.properties and extracts product data.

import { parseProperties, safeText, safeAttr, log } from './utils.js';

let selectorsPromise = null;

async function loadSelectors() {
  if (!selectorsPromise) {
    selectorsPromise = (async () => {
      try {
        const url = chrome.runtime.getURL('selectors.properties');
        const resp = await fetch(url);
        if (!resp.ok) {
          log('Failed to load selectors.properties', resp.status);
          return {};
        }
        const text = await resp.text();
        const props = parseProperties(text);
        log('Loaded selectors.properties', props);
        return props;
      } catch (e) {
        log('Error loading selectors.properties', e);
        return {};
      }
    })();
  }
  return selectorsPromise;
}

/**
 * Extracts a product snapshot from the current Shopee product page.
 * All fields are nullable; missing selectors or elements simply yield null.
 */
export async function extractProduct() {
  const selectors = await loadSelectors();

  const titleSelector = selectors['product.title'];
  const priceSelector = selectors['product.price'];
  const ratingSelector = selectors['product.rating'];
  const soldSelector = selectors['product.sold'];
  const shopSelector = selectors['product.shop'];
  const imagesSelector = selectors['product.images'];
  const descriptionSelector = selectors['product.description'];
  const ownerPhoneSelector = selectors['product.owner.phone'];

  const title = titleSelector ? safeText(document.querySelector(titleSelector)) : null;
  const price = priceSelector ? safeText(document.querySelector(priceSelector)) : null;
  const rating = ratingSelector ? safeText(document.querySelector(ratingSelector)) : null;
  const sold = soldSelector ? safeText(document.querySelector(soldSelector)) : null;

  let shop = null;
  let shopUrl = null;
  if (shopSelector) {
    const shopEl = document.querySelector(shopSelector);
    shop = safeText(shopEl);
    shopUrl = safeAttr(shopEl, 'href');
  }
  const description = descriptionSelector ? safeText(document.querySelector(descriptionSelector)) : null;

  let phoneNumber = null;
  if (ownerPhoneSelector) {
    phoneNumber = await revealOwnerPhone(ownerPhoneSelector);
  }

  let images = [];
  if (imagesSelector) {
    const containers = Array.from(document.querySelectorAll(imagesSelector));
    const allSrcs = containers
      .flatMap(container => Array.from(container.querySelectorAll('img')))
      .map(img => safeAttr(img, 'src'))
      .filter(Boolean);

    const imageExtRegex = /\.(jpe?g|png|gif|webp|bmp|svg)(?:\?|#|$)/i;
    images = allSrcs
      // Bỏ qua ảnh base64 / data URI
      .filter(src => !src.startsWith('data:'))
      // Chỉ giữ các URL có đuôi ảnh phổ biến
      .filter(src => imageExtRegex.test(src));
  }

  return {
    title: title ?? null,
    price: price ?? null,
    rating: rating ?? null,
    sold: sold ?? null,
    shop: shop ?? null,
    shopUrl: shopUrl ?? null,
    description: description ?? null,
    phoneNumber: phoneNumber ?? null,
    images: images || []
  };
}

export async function extractLatestProducts() {
  const selectors = await loadSelectors();

  const containerSelector = selectors['list.container'];
  const itemSelector = selectors['list.item'] || 'div[role="button"]';

  if (!containerSelector) {
    return [];
  }

  const container = document.querySelector(containerSelector);
  if (!container) {
    return [];
  }

  const items = Array.from(container.querySelectorAll(itemSelector));

  const normalizeSelectorForItem = (rawSel) => {
    if (!rawSel) return null;
    let sel = rawSel.trim();
    // Nếu selector đã tương đối (không bắt đầu bằng '#' hoặc ':'), dùng luôn
    if (!sel.startsWith('#') && !sel.startsWith(':')) {
      return sel;
    }
    // Nếu selector bắt đầu bằng containerSelector, cắt phần prefix container + div:nth-child(1)
    if (containerSelector && sel.startsWith(containerSelector)) {
      sel = sel.slice(containerSelector.length).trim();
      if (sel.startsWith('>')) {
        sel = sel.slice(1).trim();
      }
      // Trường hợp: div:nth-child(1) là wrapper cho từng item
      if (sel.startsWith('div:nth-child(1)')) {
        sel = sel.slice('div:nth-child(1)'.length).trim();
        if (sel.startsWith('>')) {
          sel = sel.slice(1).trim();
        }
      }
      return sel || null;
    }
    return sel;
  };

  const getText = (item, key) => {
    const rawSel = selectors[key];
    const sel = normalizeSelectorForItem(rawSel);
    if (!sel) return null;
    return safeText(item.querySelector(sel));
  };

  const getAttr = (item, key, attr) => {
    const rawSel = selectors[key];
    const sel = normalizeSelectorForItem(rawSel);
    if (!sel) return null;
    return safeAttr(item.querySelector(sel), attr);
  };

  return items.map((item) => {
    const title = getText(item, 'list.product.title');
    const price = getText(item, 'list.product.price');
    const location = getText(item, 'list.product.location');
    const shop = getText(item, 'list.product.shop');
    const image = getAttr(item, 'list.product.image', 'src');
    const detailUrl = getAttr(item, 'list.product.detail_url', 'href');

    let numberImage = null;
    const numberImageText = getText(item, 'list.product.number_image');
    if (numberImageText) {
      const digits = numberImageText.replace(/\D/g, '');
      if (digits) {
        numberImage = digits;
      }
    }

    return {
      title: title ?? null,
      price: price ?? null,
      location: location ?? null,
      shop: shop ?? null,
      image: image ?? null,
      detailUrl: detailUrl ?? null,
      numberImage: numberImage
    };
  });
}

async function revealOwnerPhone(buttonSelector) {
  const button = document.querySelector(buttonSelector);
  if (!button) return null;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const extractText = () => safeText(button);
  const isFullPhone = (text) => {
    if (!text) return false;
    if (text.includes('*')) return false;
    const digits = text.replace(/\D/g, '');
    return digits.length >= 8;
  };

  // Initial click to reveal phone
  try {
    button.click();
  } catch (e) {
    log('Failed to click phone button', e);
  }

  // Poll until the number is fully revealed or timeout
  const maxAttempts = 10;
  const delayMs = 300;
  for (let i = 0; i < maxAttempts; i++) {
    const text = extractText();
    if (isFullPhone(text)) {
      return text;
    }
    await sleep(delayMs);
  }

  const finalText = extractText();
  return isFullPhone(finalText) ? finalText : null;
}

