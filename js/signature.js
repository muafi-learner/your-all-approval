// Saved signatures, one per demo user, in Local Storage.
import { KEYS } from './config.js';
import { store } from './storage.js';

/** @returns {{dataUrl, sha256, width, height, bytes, source, updatedAt} | null} */
export function getSignature(userId) {
  const rec = store.get(KEYS.signature(userId));
  return rec && rec.dataUrl ? rec : null;
}

export const saveSignature = (userId, record) => store.set(KEYS.signature(userId), record);

export const deleteSignature = (userId) => store.remove(KEYS.signature(userId));

/** The part of a signature that is stamped into a document event */
export const signatureSnapshot = (rec) => (rec ? { dataUrl: rec.dataUrl, sha256: rec.sha256 || null } : null);
