// Central settings for the prototype. Change values here, not in page code.

export const APP = {
  name: 'Your All Approval',
  version: '0.3.0-prototype',
};

export const CONFIG = {
  OVERDUE_HOURS: 24,              // a document sitting in one stage longer than this is flagged "Overdue"
  TICK_MS: 30000,                 // how often live timers refresh
  LOCALE: 'en-GB',                // dates and times
  MONEY_LOCALE: 'id-ID',          // number grouping for amounts
  CURRENCY: 'IDR',
  MAX_LINE_ITEMS: 20,

  SIGNATURE_MAX_W: 600,           // final signature size (px)
  SIGNATURE_MAX_H: 200,
  SIGNATURE_MAX_UPLOAD: 5 * 1024 * 1024,

  // n8n webhook URLs. Leave empty to keep payloads local (prototype mode).
  // When filled in, each action also POSTs its JSON payload to the URL.
  WEBHOOKS: {
    'wo.submit': '',
    'wo.price': '',
    'approval.action': '',
  },
  WEBHOOK_TIMEOUT_MS: 8000,
  OUTBOX_LIMIT: 30,               // how many recent payloads to keep for preview
};

// Local Storage keys (shared by every page)
export const KEYS = {
  user: 'yaa.demoUser',
  docs: 'yaa.documents.v1',
  outbox: 'yaa.outbox.v1',
  signature: (userId) => `yaa.signature.${userId}`,
};
