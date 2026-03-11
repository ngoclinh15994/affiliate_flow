// High-level agent interface for interacting with the ChoTot page DOM.
// Provides the core MVP functions:
//  - getProductSnapshot()
//  - scrollPage()
//  - getPageUrl()

import { extractProduct } from './chototParser.js';
import { extractLatestProducts } from './chototParser.js';
import { log } from './utils.js';

export async function getProductSnapshot() {
  try {
    const product = await extractProduct();
    return normalizeProduct(product);
  } catch (e) {
    log('Error in getProductSnapshot()', e);
    // Return a safe empty product on error
    return {
      title: null,
      price: null,
      rating: null,
      sold: null,
      shop: null,
      description: null,
      phoneNumber: null,
      images: []
    };
  }
}

export async function getLatestProducts() {
  try {
    const products = await extractLatestProducts();
    return normalizeLatestProducts(products);
  } catch (e) {
    log('Error in getLatestProducts()', e);
    return [];
  }
}

export function scrollPage() {
  try {
    window.scrollBy({
      top: window.innerHeight,
      left: 0,
      behavior: 'smooth'
    });
  } catch (e) {
    log('Error in scrollPage()', e);
  }
}

export function getPageUrl() {
  try {
    return window.location.href;
  } catch (e) {
    log('Error in getPageUrl()', e);
    return null;
  }
}

function normalizeProduct(product) {
  const safe = product || {};
  return {
    title: safe.title ?? null,
    price: safe.price ?? null,
    rating: safe.rating ?? null,
    sold: safe.sold ?? null,
    shop: safe.shop ?? null,
    shopUrl: safe.shopUrl ?? null,
    description: safe.description ?? null,
    phoneNumber: safe.phoneNumber ?? null,
    images: Array.isArray(safe.images) ? safe.images.filter(Boolean) : []
  };
}

function normalizeLatestProducts(products) {
  if (!Array.isArray(products)) {
    return [];
  }
  return products.map((p) => {
    const safe = p || {};
    return {
      title: safe.title ?? null,
      price: safe.price ?? null,
      location: safe.location ?? null,
      image: safe.image ?? null,
      shop: safe.shop ?? null,
      detailUrl: safe.detailUrl ?? null,
      numberImage: safe.numberImage ?? null
    };
  });
}

