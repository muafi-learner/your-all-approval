// Webhook payloads ("outbox").
// Every action builds the JSON that n8n will receive. In prototype mode it is only
// logged locally; when a URL is set in CONFIG.WEBHOOKS it is also POSTed.
import { APP, CONFIG, KEYS } from './config.js';
import { store } from './storage.js';
import { uuid } from './crypto.js';

/** Standard request envelope from the PRD: { meta, data } */
export function envelope(endpoint, data) {
  return {
    endpoint,
    meta: {
      request_id: uuid(),
      sent_at: new Date().toISOString(),
      client: `yaa-web/${APP.version}`,
    },
    data,
  };
}

// Shorten base64 images so the stored log stays small and readable
function redact(value) {
  return JSON.parse(JSON.stringify(value, (key, v) => (
    typeof v === 'string' && v.startsWith('data:image/')
      ? `[base64 image, ${Math.round((v.length * 0.75) / 1024)} KB]`
      : v
  )));
}

function setDelivery(requestId, delivery) {
  const log = store.get(KEYS.outbox) || [];
  const entry = log.find((e) => e.meta && e.meta.request_id === requestId);
  if (entry) {
    entry.delivery = delivery;
    store.set(KEYS.outbox, log);
  }
}

/**
 * Log the payload and, if a webhook URL is configured, POST it.
 * @returns {Promise<{sent: boolean, ok?: boolean, status?: number, error?: string}>}
 */
export async function send(env) {
  const url = CONFIG.WEBHOOKS[env.endpoint] || '';
  const log = store.get(KEYS.outbox) || [];
  log.unshift({ ...redact(env), delivery: url ? 'sending' : 'local only (no webhook URL set)' });
  store.set(KEYS.outbox, log.slice(0, CONFIG.OUTBOX_LIMIT));
  console.info(`[YAA] ${env.endpoint}`, env);

  if (!url) return { sent: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: env.meta, data: env.data }),
      signal: controller.signal,
    });
    setDelivery(env.meta.request_id, res.ok ? 'delivered' : `failed (HTTP ${res.status})`);
    return { sent: true, ok: res.ok, status: res.status };
  } catch (err) {
    setDelivery(env.meta.request_id, 'failed (network)');
    return { sent: true, ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Most recent logged payload for a document */
export function lastPayloadFor(docId) {
  return (store.get(KEYS.outbox) || []).find((e) => e.data && e.data.doc_id === docId) || null;
}
