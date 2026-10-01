// Approval workflow: stages, who may act, and the state transitions.
// Every transition saves to Local Storage and returns the webhook payload for n8n.
import { CONFIG } from './config.js';
import { loadDocs, saveDocs, docTotal, nextNumber } from './data.js';
import { HOLDER_BY_ROLE, personRef } from './people.js';
import { envelope } from './outbox.js';
import { ms } from './format.js';

export const STAGES = {
  PENDING_SCM:     { label: 'SCM pricing',    step: 1, role: 'SCM' },
  PENDING_MANAGER: { label: 'Manager review', step: 2, role: 'MANAGER' },
  PENDING_MD:      { label: 'MD approval',    step: 3, role: 'MD' },
  APPROVED:        { label: 'Approved', closed: true },
  REJECTED:        { label: 'Rejected', closed: true },
};

export const ACTIVE = ['PENDING_SCM', 'PENDING_MANAGER', 'PENDING_MD'];

// The only moves allowed at each stage, and where they lead
const TRANSITIONS = {
  PENDING_SCM:     { PRICE: 'PENDING_MANAGER' },
  PENDING_MANAGER: { APPROVE: 'PENDING_MD', REJECT: 'REJECTED' },
  PENDING_MD:      { APPROVE: 'APPROVED', REJECT: 'REJECTED' },
};

export class WorkflowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export const isOverdue = (iso) => Date.now() - ms(iso) >= CONFIG.OVERDUE_HOURS * 3600e3;

/** Person currently holding the document, or null when closed */
export function holderOf(doc) {
  const stage = STAGES[doc.status];
  return stage && stage.role ? HOLDER_BY_ROLE[stage.role] : null;
}

/** Actions this user may take right now: [] | ['PRICE'] | ['APPROVE', 'REJECT'] */
export function actionsFor(doc, user) {
  const stage = STAGES[doc.status];
  if (!stage || stage.closed || stage.role !== user.role) return [];
  return Object.keys(TRANSITIONS[doc.status]);
}

/** Status the document entered after an event (works for older data without toStatus) */
export function statusAfter(event) {
  if (event.toStatus) return event.toStatus;
  if (event.type === 'SUBMITTED') return 'PENDING_SCM';
  if (event.type === 'PRICED') return 'PENDING_MANAGER';
  if (event.type === 'REJECTED') return 'REJECTED';
  if (event.type === 'APPROVED') return event.by && event.by.role === 'MANAGER' ? 'PENDING_MD' : 'APPROVED';
  return null;
}

/** Everything the UI needs, derived from a stored document */
export function describe(doc) {
  const stage = STAGES[doc.status];
  const first = doc.events[0];
  const last = doc.events[doc.events.length - 1];
  const closed = !!stage.closed;
  return {
    doc,
    stage,
    number: doc.prNo || doc.woNo,
    href: `wo-detail.html?id=${encodeURIComponent(doc.id)}`,
    closed,
    since: last.at,
    createdAt: first.at,
    overdue: !closed && isOverdue(last.at),
    holder: holderOf(doc),
    closedBy: closed ? last.by : null,
    cycleMs: closed ? ms(last.at) - ms(first.at) : null,
    total: docTotal(doc),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
function commit(list, doc) {
  const i = list.findIndex((d) => d.id === doc.id);
  if (i === -1) list.unshift(doc);
  else list[i] = doc;
  if (!saveDocs(list)) {
    throw new WorkflowError('Browser storage is full. Reset the demo data from the dashboard and try again.');
  }
}

function takeForAction(id, user, action, expectedVersion) {
  const list = loadDocs();
  const doc = list.find((d) => d.id === id);
  if (!doc) throw new WorkflowError('This document no longer exists.');
  if (expectedVersion != null && doc.version !== expectedVersion) {
    throw new WorkflowError('This document changed since you opened it. The page has been refreshed.');
  }
  if (!actionsFor(doc, user).includes(action)) {
    throw new WorkflowError(`${user.name} can't do that at the "${STAGES[doc.status].label}" stage.`);
  }
  return { list, doc };
}

const sigPayload = (sig, at) => (sig
  ? { format: 'image/png', data_url: sig.dataUrl, sha256: sig.sha256 || null, signed_at: at }
  : null);

// WhatsApp notification data for n8n: who should hear about this next
function notification(doc, actor, comment = '') {
  const next = holderOf(doc);
  const vars = {
    doc_no: doc.prNo || doc.woNo,
    title: doc.title,
    total: docTotal(doc),
    from_name: actor.name,
    from_role: actor.role,
  };
  if (next) {
    return {
      channel: 'whatsapp', event: 'PENDING_ACTION',
      recipient_role: next.role, recipient_user_id: next.id,
      template_vars: { ...vars, stage: STAGES[doc.status].label },
    };
  }
  return {
    channel: 'whatsapp', event: doc.status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
    recipient_role: 'SPV', recipient_user_id: doc.createdBy.id,
    template_vars: { ...vars, comment },
  };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** SPV creates a WO → PENDING_SCM. The SPV's signature is stamped as "Prepared by". */
export function createWO(input, user, signature) {
  if (user.role !== 'SPV') throw new WorkflowError('Only an SPV can create a WO.');
  if (!signature) throw new WorkflowError('Save your signature before submitting.');
  if (!input.items || !input.items.length) throw new WorkflowError('Add at least one line item.');

  const list = loadDocs();
  const woNo = nextNumber(list, 'WO');
  const now = new Date().toISOString();
  const doc = {
    id: woNo, woNo, prNo: null, type: 'WO', status: 'PENDING_SCM', version: 1,
    title: input.title, project: input.project, division: input.division,
    requiredBy: input.requiredBy, justification: input.justification,
    createdBy: personRef(user),
    items: input.items.map((it) => ({
      name: it.name, spec: it.spec || '', qty: it.qty, unit: it.unit, unitPrice: null, vendor: null,
    })),
    events: [{
      type: 'SUBMITTED', by: personRef(user), at: now, comment: '',
      signed: true, signature, toStatus: 'PENDING_SCM',
    }],
  };
  commit(list, doc);

  const payload = envelope('wo.submit', {
    doc_id: doc.id,
    wo_no: woNo,
    status: doc.status,
    version: doc.version,
    title: doc.title,
    division: doc.division,
    project: doc.project,
    required_by: doc.requiredBy,
    justification: doc.justification,
    items: doc.items.map(({ name, spec, qty, unit }) => ({ name, spec, qty, unit })),
    prepared_by: { ...personRef(user), signature: sigPayload(signature, now) },
    notification: notification(doc, user),
  });
  return { doc, payload };
}

/** SCM adds unit prices → WO becomes a PR → PENDING_MANAGER */
export function priceWO(id, lines, user, expectedVersion) {
  const { list, doc } = takeForAction(id, user, 'PRICE', expectedVersion);
  if (!Array.isArray(lines) || lines.length !== doc.items.length) {
    throw new WorkflowError('Every line item needs a price.');
  }
  lines.forEach((line, i) => {
    if (!Number.isInteger(line.unitPrice) || line.unitPrice <= 0) {
      throw new WorkflowError(`Line ${i + 1} needs a unit price above zero.`);
    }
  });

  const fromStatus = doc.status;
  const now = new Date().toISOString();
  doc.items = doc.items.map((it, i) => ({ ...it, unitPrice: lines[i].unitPrice, vendor: lines[i].vendor || null }));
  doc.prNo = nextNumber(list, 'PR');
  doc.type = 'PR';
  doc.status = TRANSITIONS[fromStatus].PRICE;
  doc.version += 1;
  doc.events.push({
    type: 'PRICED', by: personRef(user), at: now, comment: '',
    signed: false, signature: null, toStatus: doc.status,
  });
  commit(list, doc);

  const payload = envelope('wo.price', {
    doc_id: doc.id,
    wo_no: doc.woNo,
    pr_no: doc.prNo,
    from_status: fromStatus,
    to_status: doc.status,
    expected_version: doc.version - 1,
    priced_by: personRef(user),
    items: doc.items.map(({ name, qty, unit, unitPrice, vendor }) => ({
      name, qty, unit, unit_price: unitPrice, vendor, line_total: Math.round(qty * unitPrice),
    })),
    total: docTotal(doc),
    currency: CONFIG.CURRENCY,
    notification: notification(doc, user),
  });
  return { doc, payload };
}

/** Manager or MD approves and signs. MD approval completes the PR and asks n8n for the PDF. */
export function approveDoc(id, user, signature, comment, expectedVersion) {
  if (!signature) throw new WorkflowError('Save your signature before approving.');
  const { list, doc } = takeForAction(id, user, 'APPROVE', expectedVersion);

  const fromStatus = doc.status;
  const now = new Date().toISOString();
  doc.status = TRANSITIONS[fromStatus].APPROVE;
  doc.version += 1;
  doc.events.push({
    type: 'APPROVED', by: personRef(user), at: now, comment: comment || '',
    signed: true, signature, toStatus: doc.status,
  });
  commit(list, doc);

  const payload = envelope('approval.action', {
    doc_id: doc.id,
    pr_no: doc.prNo,
    action: 'APPROVE',
    from_status: fromStatus,
    to_status: doc.status,
    expected_version: doc.version - 1,
    actor: personRef(user),
    comment: comment || '',
    signature: sigPayload(signature, now),
    total: docTotal(doc),
    generate_pdf: doc.status === 'APPROVED',
    notification: notification(doc, user, comment),
  });
  return { doc, payload };
}

/** Manager or MD rejects with a reason → REJECTED (final) */
export function rejectDoc(id, user, reason, expectedVersion) {
  const text = String(reason || '').trim();
  if (text.length < 10) throw new WorkflowError('Give a reason of at least 10 characters.');
  const { list, doc } = takeForAction(id, user, 'REJECT', expectedVersion);

  const fromStatus = doc.status;
  const now = new Date().toISOString();
  doc.status = TRANSITIONS[fromStatus].REJECT;
  doc.version += 1;
  doc.events.push({
    type: 'REJECTED', by: personRef(user), at: now, comment: text,
    signed: false, signature: null, toStatus: doc.status,
  });
  commit(list, doc);

  const payload = envelope('approval.action', {
    doc_id: doc.id,
    pr_no: doc.prNo,
    action: 'REJECT',
    from_status: fromStatus,
    to_status: doc.status,
    expected_version: doc.version - 1,
    actor: personRef(user),
    comment: text,
    signature: null,
    generate_pdf: false,
    notification: notification(doc, user, text),
  });
  return { doc, payload };
}
