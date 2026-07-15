export const QUEUES = {
  EMAIL: 'email',
  INVENTORY: 'inventory',
  SEARCH_INDEX: 'search-index',
  CART_CLEANUP: 'cart-cleanup',
} as const;

export const JOBS = {
  ORDER_CONFIRMATION: 'order-confirmation',
  SHIPPING_NOTIFICATION: 'shipping-notification',
  LOW_STOCK_ALERT: 'low-stock-alert',
  INDEX_PRODUCT: 'index-product',
  REMOVE_PRODUCT: 'remove-product',
  EXPIRE_CARTS: 'expire-carts',
} as const;
