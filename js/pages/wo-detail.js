// Document detail: stage + stepper, role-aware actions (SCM pricing, approve/reject with
// signature), line items, signature stamps, timeline and webhook payload preview.
import { KEYS } from '../config.js';
import { getDoc } from '../data.js';
import { HOLDER_BY_ROLE, STAMP_LABEL, getCurrentUser } from '../people.js';
import { getSignature, signatureSnapshot } from '../signature.js';
import {
  STAGES, describe, actionsFor, holderOf, statusAfter, priceWO, approveDoc, rejectDoc, WorkflowError,
} from '../workflow.js';
import { send, lastPayloadFor } from '../outbox.js';
import { esc, dur, ms, fmtDate, fmtDateTime, fmtShort, fmtMoney, fmtNumber } from '../format.js';
import {
  mountShell, onUserChange, switchUser, toast, openDialog, icon, badge, typeTag, overdueTag, timer, avatar,
  FIELD, setFieldError, startTimers,
} from '../ui.js';

const $ = (id) => document.getElementById(id);
const docId = new URLSearchParams(window.location.search).get('id');

let user = mountShell({ active: 'dashboard' });
let doc = null;

const you = (p) => (p && p.id === user.id ? ' <span class="font-normal text-neutral-400">(you)</span>' : '');
const card = (title, body, aside = '') => `
  <div class="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3.5 sm:px-5">
    <h2 class="text-sm font-semibold">${title}</h2>${aside}
  </div>${body}`;

function load() {
  doc = docId ? getDoc(docId) : null;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function renderHeader(v) {
  const d = v.doc;
  document.title = `${v.number} · Your All Approval`;
  $('docMeta').innerHTML = `
    <span class="font-mono text-sm font-medium">${esc(v.number)}</span>${typeTag(d.type)}${badge(d.status)}
    ${d.prNo ? `<span class="text-xs text-neutral-500">from ${esc(d.woNo)}</span>` : ''}`;
  $('docTitle').textContent = d.title;
  $('docSub').textContent = `${d.project} · ${d.division} · Requested by ${d.createdBy.name} · Needed by ${fmtDate(d.requiredBy)}`;
  $('docTotal').innerHTML = v.total == null
    ? '<span class="font-sans text-sm font-normal text-neutral-400">Awaiting pricing</span>'
    : esc(fmtMoney(v.total));
}

// ---------------------------------------------------------------------------
// Current stage + stepper
// ---------------------------------------------------------------------------
function stepperHTML(d) {
  const labels = ['Submitted', 'Pricing', 'Manager', 'MD', 'Approved'];
  const order = { PENDING_SCM: 1, PENDING_MANAGER: 2, PENDING_MD: 3, APPROVED: 5 };
  let current = order[d.status];
  let rejectedAt = -1;
  if (d.status === 'REJECTED') {
    const before = d.events.length > 1 ? statusAfter(d.events[d.events.length - 2]) : 'PENDING_SCM';
    rejectedAt = order[before] || 1;
  }

  const nodes = labels.map((label, i) => {
    let state = i < current ? 'done' : i === current ? 'current' : 'todo';
    if (rejectedAt >= 0) state = i < rejectedAt ? 'done' : i === rejectedAt ? 'rejected' : 'skipped';
    const reached = state === 'done' || state === 'current' || state === 'rejected';
    const dot = {
      done: `<span class="relative z-10 grid h-6 w-6 place-items-center rounded-full bg-neutral-900 text-white">${icon('check', 'h-3 w-3', 3)}</span>`,
      current: '<span class="relative z-10 grid h-6 w-6 place-items-center rounded-full border-2 border-neutral-900 bg-white"><span class="h-2 w-2 rounded-full bg-neutral-900"></span></span>',
      todo: '<span class="relative z-10 h-6 w-6 rounded-full border border-neutral-300 bg-white"></span>',
      rejected: `<span class="relative z-10 grid h-6 w-6 place-items-center rounded-full border-2 border-neutral-900 bg-white">${icon('x', 'h-3 w-3', 3)}</span>`,
      skipped: '<span class="relative z-10 h-6 w-6 rounded-full border border-dashed border-neutral-300 bg-white"></span>',
    }[state];
    const stateText = { done: 'done', current: 'current stage', todo: 'not started', rejected: 'rejected here', skipped: 'skipped' }[state];
    return `<li class="relative flex flex-col items-center text-center">
      ${i > 0 ? `<span class="absolute right-1/2 top-3 h-px w-full ${reached ? 'bg-neutral-900' : 'bg-neutral-200'}" aria-hidden="true"></span>` : ''}
      ${dot}
      <span class="mt-1.5 text-[11px] ${state === 'current' || state === 'rejected' ? 'font-semibold text-neutral-900' : reached ? 'text-neutral-700' : 'text-neutral-400'}">${state === 'rejected' ? 'Rejected' : label}</span>
      <span class="sr-only">: ${stateText}</span>
    </li>`;
  }).join('');
  return `<ol class="grid grid-cols-5">${nodes}</ol>`;
}

function renderStage(v) {
  const d = v.doc;
  const last = d.events[d.events.length - 1];
  let top;
  if (!v.closed) {
    const h = v.holder;
    top = `
      <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Currently with</p>
      <div class="mt-2 flex items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-3">
          ${avatar(h, { me: h.id === user.id, size: 'h-10 w-10 text-xs' })}
          <div class="min-w-0">
            <p class="truncate font-medium">${esc(h.name)}${you(h)}</p>
            <p class="truncate text-xs text-neutral-500">${esc(h.title)} · ${esc(v.stage.label)}</p>
          </div>
        </div>
        <div class="shrink-0 text-right">
          <div class="flex items-center justify-end gap-1.5">${overdueTag(v.since, v.overdue)}${timer(v.since, 'text-xl font-semibold')}</div>
          <p class="text-xs text-neutral-500">in this stage · since ${fmtShort(v.since)}</p>
        </div>
      </div>`;
  } else if (d.status === 'APPROVED') {
    top = `
      <div class="flex items-start gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-900 text-white">${icon('check', 'h-5 w-5', 2.5)}</span>
        <div class="min-w-0">
          <p class="font-medium">Fully approved</p>
          <p class="text-xs text-neutral-500">by ${esc(last.by.name)} on ${fmtDateTime(last.at)} · cycle time ${dur(v.cycleMs)}</p>
          <p class="mt-2 inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">${icon('file', 'h-3.5 w-3.5')}Final PDF is generated by n8n (not in this prototype)</p>
        </div>
      </div>`;
  } else {
    top = `
      <div class="flex items-start gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-neutral-900">${icon('x', 'h-5 w-5', 2.5)}</span>
        <div class="min-w-0">
          <p class="font-medium">Rejected</p>
          <p class="text-xs text-neutral-500">by ${esc(last.by.name)} (${esc(last.by.title)}) on ${fmtDateTime(last.at)}</p>
          ${last.comment ? `<p class="mt-2 rounded-md border-l-2 border-neutral-900 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">${esc(last.comment)}</p>` : ''}
        </div>
      </div>`;
  }
  $('stagePanel').innerHTML = `<div class="p-4 sm:p-5">${top}</div>
    <div class="border-t border-neutral-200 px-4 py-4 sm:px-5">${stepperHTML(d)}</div>`;
}

// ---------------------------------------------------------------------------
// Action panel (role-aware)
// ---------------------------------------------------------------------------
function renderAction(v, actions) {
  const panel = $('actionPanel');
  const d = v.doc;
  panel.className = '';

  if (v.closed) {
    panel.innerHTML = '';
    panel.classList.add('hidden');
    return;
  }

  // Someone else's turn: offer a one-tap switch so the loop can be tested
  if (!actions.length) {
    const h = v.holder;
    panel.className = 'rounded-xl border border-dashed border-neutral-300 bg-white';
    panel.innerHTML = `<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <p class="text-sm font-medium">Waiting on ${esc(h.name)}</p>
        <p class="mt-0.5 text-xs text-neutral-500">You're viewing as ${esc(user.name)} (${esc(user.title)}). Switch to ${esc(h.name.split(' ')[0])} to try the next step.</p>
      </div>
      <button type="button" data-act="switch" data-user="${esc(h.id)}" class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-4 text-sm font-medium transition hover:border-neutral-900">${icon('swap')}Switch to ${esc(h.name)}</button>
    </div>`;
    return;
  }

  panel.className = 'rounded-xl border border-neutral-900 bg-white';

  // SCM: add prices and convert to PR
  if (actions.includes('PRICE')) {
    const next = HOLDER_BY_ROLE.MANAGER;
    panel.innerHTML = `<div class="p-4 sm:p-5">
      <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Your action</p>
      <h2 class="mt-1 font-semibold">Add pricing and convert to PR</h2>
      <p class="mt-1 text-sm text-neutral-600">Enter a unit price for every line below. Converting sends the PR to ${esc(next.name)} (${esc(next.title)}) for review.</p>
      <div class="mt-4 flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3">
        <span class="text-sm text-neutral-600">PR total</span>
        <span id="pricingTotal" class="tabular font-mono font-semibold">${fmtMoney(0)}</span>
      </div>
      <button type="button" data-act="convert" class="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white transition hover:bg-neutral-700 sm:w-auto">${icon('check', 'h-4 w-4', 2)}Convert to PR</button>
    </div>`;
    return;
  }

  // Manager / MD: approve or reject
  const sig = getSignature(user.id);
  const isFinal = d.status === 'PENDING_MD';
  const next = isFinal ? null : HOLDER_BY_ROLE.MD;
  panel.innerHTML = `<div class="p-4 sm:p-5">
    <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">Your action</p>
    <h2 class="mt-1 font-semibold">${isFinal ? 'Final approval' : 'Review and decide'}</h2>
    <p class="mt-1 text-sm text-neutral-600">${isFinal
      ? 'Approving completes this PR and stamps your signature as "Approved by". n8n then generates the signed PDF.'
      : `Approving stamps your signature as "Reviewed by" and sends the PR to ${esc(next.name)} (${esc(next.title)}).`}</p>
    ${sig
      ? `<div class="mt-4 flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2">
           <img src="${esc(sig.dataUrl)}" alt="Your signature" class="h-9 w-24 object-contain object-left" />
           <p class="text-xs text-neutral-500">Your saved signature will be attached.</p>
         </div>`
      : `<div class="mt-4 rounded-lg border border-dashed border-neutral-400 px-3 py-2.5">
           <p class="flex items-center gap-1.5 text-sm font-medium">${icon('alert')}No signature saved for ${esc(user.name)}</p>
           <a href="index.html" class="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">Set up your signature to approve${icon('chevronRight', 'h-3.5 w-3.5', 2)}</a>
         </div>`}
    <div class="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      <button type="button" data-act="reject" class="h-11 rounded-lg border border-neutral-300 px-5 text-sm font-medium transition hover:border-neutral-900 sm:h-10">Reject</button>
      <button type="button" data-act="approve" ${sig ? '' : 'disabled'} class="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 sm:h-10">${icon('pen')}Approve</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Line items (read-only, or with price inputs for SCM)
// ---------------------------------------------------------------------------
function itemRow(it) {
  const priced = typeof it.unitPrice === 'number';
  return `<li class="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5">
    <div class="min-w-0">
      <p class="font-medium">${esc(it.name)}</p>
      ${it.spec ? `<p class="text-xs text-neutral-500">${esc(it.spec)}</p>` : ''}
      <p class="tabular mt-1 text-xs text-neutral-600">${fmtNumber(it.qty)} ${esc(it.unit)}${priced ? ` × ${fmtMoney(it.unitPrice)}` : ''}${it.vendor ? ` · ${esc(it.vendor)}` : ''}</p>
    </div>
    <p class="tabular shrink-0 font-mono text-sm ${priced ? '' : 'text-neutral-400'}">${priced ? fmtMoney(Math.round(it.qty * it.unitPrice)) : '—'}</p>
  </li>`;
}

function pricingRow(it, i) {
  return `<li class="px-4 py-3.5 sm:px-5">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="font-medium">${esc(it.name)}</p>
        ${it.spec ? `<p class="text-xs text-neutral-500">${esc(it.spec)}</p>` : ''}
        <p class="tabular mt-1 text-xs text-neutral-600">${fmtNumber(it.qty)} ${esc(it.unit)}</p>
      </div>
      <p data-line-total="${i}" class="tabular shrink-0 font-mono text-sm text-neutral-400">—</p>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-3">
      <div>
        <label for="price-${i}" class="${FIELD.label}">Unit price (IDR)</label>
        <input id="price-${i}" data-price="${i}" inputmode="numeric" autocomplete="off" placeholder="0" class="${FIELD.input} font-mono tabular" />
        <p data-error class="${FIELD.error}"></p>
      </div>
      <div>
        <label for="vendor-${i}" class="${FIELD.label}">Vendor <span class="${FIELD.optional}">(optional)</span></label>
        <input id="vendor-${i}" data-vendor="${i}" maxlength="60" autocomplete="off" placeholder="Supplier name" class="${FIELD.input}" />
      </div>
    </div>
  </li>`;
}

function renderItems(v, pricing) {
  const d = v.doc;
  const n = d.items.length;
  $('itemsPanel').innerHTML = card('Line items', `
    <ul class="divide-y divide-neutral-100">${d.items.map((it, i) => (pricing ? pricingRow(it, i) : itemRow(it))).join('')}</ul>
    <div class="flex items-center justify-between border-t border-neutral-200 px-4 py-3.5 sm:px-5">
      <span class="text-sm font-medium">Total</span>
      <span id="itemsTotal" class="tabular font-mono text-sm font-semibold">${pricing ? fmtMoney(0) : v.total == null ? '<span class="font-sans font-normal text-neutral-400">Awaiting pricing</span>' : fmtMoney(v.total)}</span>
    </div>`, `<span class="tabular text-xs text-neutral-500">${n} item${n === 1 ? '' : 's'}</span>`);
}

const parsePrice = (s) => {
  const digits = String(s).replace(/\D/g, '').slice(0, 12);
  return digits ? Number(digits) : 0;
};

function updatePricingTotals() {
  let total = 0;
  doc.items.forEach((it, i) => {
    const price = parsePrice($(`price-${i}`).value);
    const cell = document.querySelector(`[data-line-total="${i}"]`);
    if (price > 0) {
      const line = Math.round(price * it.qty);
      total += line;
      cell.textContent = fmtMoney(line);
      cell.classList.remove('text-neutral-400');
    } else {
      cell.textContent = '—';
      cell.classList.add('text-neutral-400');
    }
  });
  if ($('pricingTotal')) $('pricingTotal').textContent = fmtMoney(total);
  $('itemsTotal').textContent = fmtMoney(total);
}

// Digits only while typing; thousands separators when the field loses focus
$('itemsPanel').addEventListener('input', (e) => {
  if (!e.target.matches('[data-price]')) return;
  setFieldError(e.target, '');
  updatePricingTotals();
});
$('itemsPanel').addEventListener('focusin', (e) => {
  if (e.target.matches('[data-price]')) e.target.value = String(parsePrice(e.target.value) || '');
});
$('itemsPanel').addEventListener('focusout', (e) => {
  if (!e.target.matches('[data-price]')) return;
  const n = parsePrice(e.target.value);
  e.target.value = n ? fmtNumber(n) : '';
});

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------
function renderDetails(v) {
  const d = v.doc;
  const row = (label, value) => `<div><dt class="text-xs text-neutral-500">${label}</dt><dd class="mt-0.5 text-sm">${value}</dd></div>`;
  $('detailsPanel').innerHTML = card('Details', `
    <div class="p-4 sm:p-5">
      <dl class="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        ${row('Project', esc(d.project))}
        ${row('Division', esc(d.division))}
        ${row('Needed by', esc(fmtDate(d.requiredBy)))}
        ${row('Requested by', `${esc(d.createdBy.name)}${you(d.createdBy)}`)}
        ${row('Submitted', esc(fmtDateTime(v.createdAt)))}
        ${row('Numbers', `<span class="font-mono text-xs">${esc(d.woNo)}${d.prNo ? ` → ${esc(d.prNo)}` : ''}</span>`)}
      </dl>
      <div class="mt-5 border-t border-neutral-100 pt-4">
        <p class="text-xs text-neutral-500">Justification</p>
        <p class="mt-1 whitespace-pre-line text-sm leading-relaxed">${esc(d.justification)}</p>
      </div>
    </div>`);
}

// ---------------------------------------------------------------------------
// Signature stamps (as they will appear on the PDF)
// ---------------------------------------------------------------------------
function renderStamps(v) {
  const d = v.doc;
  const decided = (role) => d.events.find((e) => (e.type === 'APPROVED' || e.type === 'REJECTED') && e.by.role === role);
  const slots = [
    { label: STAMP_LABEL.SPV, ev: d.events.find((e) => e.type === 'SUBMITTED'), expected: d.createdBy },
    { label: STAMP_LABEL.MANAGER, ev: decided('MANAGER'), expected: HOLDER_BY_ROLE.MANAGER },
    { label: STAMP_LABEL.MD, ev: decided('MD'), expected: HOLDER_BY_ROLE.MD },
  ];

  const boxes = slots.map((s) => {
    const ev = s.ev;
    let mark;
    let lineCls = 'border-dashed border-neutral-300';
    let foot;
    if (ev && ev.type === 'REJECTED') {
      mark = `<span class="inline-flex items-center gap-1 text-[11px] font-semibold">${icon('x', 'h-3 w-3', 3)}Rejected</span>`;
      foot = fmtShort(ev.at);
    } else if (ev) {
      lineCls = 'border-neutral-900';
      mark = ev.signature && ev.signature.dataUrl
        ? `<img src="${esc(ev.signature.dataUrl)}" alt="Signature of ${esc(ev.by.name)}" class="max-h-full max-w-full object-contain object-left-bottom" />`
        : '<span class="font-mono text-[10px] text-neutral-400">signed · sample data</span>';
      foot = fmtShort(ev.at);
    } else {
      mark = '';
      foot = v.closed ? 'Not required' : 'Pending';
    }
    const person = ev ? ev.by : s.expected;
    return `<div class="min-w-0 rounded-lg border ${ev ? 'border-neutral-200' : 'border-dashed border-neutral-300'} p-2.5">
      <p class="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">${esc(s.label)}</p>
      <div class="mt-1.5 flex h-10 items-end">${mark}</div>
      <div class="mt-1 border-t ${lineCls} pt-1">
        <p class="truncate text-[11px] font-semibold ${ev ? '' : 'text-neutral-400'}">${esc(person.name)}</p>
        <p class="tabular truncate text-[10px] text-neutral-500">${esc(foot)}</p>
      </div>
    </div>`;
  }).join('');

  $('stampsPanel').innerHTML = card('Signatures', `
    <div class="p-4 sm:p-5">
      <div class="grid grid-cols-3 gap-2">${boxes}</div>
      <p class="mt-3 text-xs text-neutral-500">These stamps are placed on the final PDF.</p>
    </div>`);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
function eventLabel(ev, d) {
  if (ev.type === 'SUBMITTED') return 'WO submitted';
  if (ev.type === 'PRICED') return `Priced · converted to ${d.prNo || 'PR'}`;
  if (ev.type === 'APPROVED') return ev.by.role === 'MD' ? 'Final approval' : 'Approved by Manager';
  if (ev.type === 'REJECTED') return 'Rejected';
  return ev.type;
}

function renderTimeline(v) {
  const d = v.doc;
  const items = d.events.map((ev, i) => {
    const prev = i > 0 ? d.events[i - 1] : null;
    const waitedStage = prev ? STAGES[statusAfter(prev)] : null;
    const isReject = ev.type === 'REJECTED';
    const isLastItem = v.closed && i === d.events.length - 1;
    return `<li class="relative ${isLastItem ? '' : 'pb-5'} pl-8">
      ${isLastItem ? '' : '<span class="absolute bottom-0 left-[11px] top-6 w-px bg-neutral-200" aria-hidden="true"></span>'}
      <span class="absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-full ${isReject ? 'border-2 border-neutral-900 bg-white' : 'bg-neutral-900 text-white'}">${icon(isReject ? 'x' : 'check', 'h-3 w-3', 3)}</span>
      <p class="text-sm font-medium">${esc(eventLabel(ev, d))}</p>
      <p class="text-xs text-neutral-500">${esc(ev.by.name)} · ${esc(ev.by.title)}</p>
      <p class="tabular text-xs text-neutral-500">${fmtDateTime(ev.at)}</p>
      ${prev ? `<p class="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500">${icon('clock', 'h-3 w-3')}after ${dur(ms(ev.at) - ms(prev.at))} in ${esc(waitedStage ? waitedStage.label : 'previous stage')}</p>` : ''}
      ${ev.comment ? `<p class="mt-1.5 rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs leading-relaxed text-neutral-700">“${esc(ev.comment)}”</p>` : ''}
      ${ev.signed ? `<p class="mt-1 flex items-center gap-1 text-[11px] text-neutral-500">${icon('pen', 'h-3 w-3')}Signed${ev.signature && ev.signature.sha256 ? ` · <span class="font-mono">${esc(ev.signature.sha256.slice(0, 10))}…</span>` : ''}</p>` : ''}
    </li>`;
  });

  if (!v.closed) {
    items.push(`<li class="relative pl-8">
      <span class="absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-full border-2 border-neutral-900 bg-white"><span class="h-2 w-2 rounded-full bg-neutral-900"></span></span>
      <p class="text-sm font-medium">Waiting on ${esc(v.holder.name)}${you(v.holder)}</p>
      <p class="text-xs text-neutral-500">${esc(v.stage.label)} · ${timer(v.since)} so far</p>
    </li>`);
  }

  $('timelinePanel').innerHTML = card('Timeline', `<ol class="p-4 sm:p-5">${items.join('')}</ol>`);
}

// ---------------------------------------------------------------------------
// Webhook payload preview
// ---------------------------------------------------------------------------
function renderPayload() {
  const panel = $('payloadPanel');
  const wasOpen = panel.open;
  const entry = lastPayloadFor(doc.id);
  const json = entry ? JSON.stringify({ meta: entry.meta, data: entry.data }, null, 2) : '';
  panel.innerHTML = `
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
      <span class="text-sm font-semibold">Webhook payload</span>
      <span class="flex items-center gap-2 text-xs text-neutral-500">${entry ? esc(entry.endpoint) : 'none yet'}
        <span class="transition group-open:rotate-180">${icon('chevronDown', 'h-4 w-4', 2)}</span></span>
    </summary>
    <div class="border-t border-neutral-200 px-4 py-4 sm:px-5">
      ${entry
        ? `<p class="text-xs leading-relaxed text-neutral-500">The JSON for the latest action on this document, ready to POST to n8n. Delivery: ${esc(entry.delivery)}. Signature images are shortened here.</p>
           <pre class="mt-3 max-h-80 overflow-auto rounded-lg bg-neutral-950 p-3 font-mono text-[11px] leading-relaxed text-neutral-100">${esc(json)}</pre>
           <button type="button" id="copyPayload" class="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-sm font-medium transition hover:border-neutral-900">${icon('copy')}Copy JSON</button>`
        : '<p class="text-xs leading-relaxed text-neutral-500">No payload yet. Actions taken on this document in this browser will show their JSON here.</p>'}
    </div>`;
  panel.open = wasOpen;
  const copy = $('copyPayload');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(json);
        toast('Payload copied');
      } catch {
        toast('Copy failed. Select the text instead.', 'error');
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  if (!doc) {
    $('docView').classList.add('hidden');
    $('notFound').classList.remove('hidden');
    document.title = 'Not found · Your All Approval';
    return;
  }
  $('notFound').classList.add('hidden');
  $('docView').classList.remove('hidden');

  const v = describe(doc);
  const actions = actionsFor(doc, user);
  renderHeader(v);
  renderStage(v);
  renderAction(v, actions);
  renderItems(v, actions.includes('PRICE'));
  renderDetails(v);
  renderStamps(v);
  renderTimeline(v);
  renderPayload();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function fail(err) {
  if (err instanceof WorkflowError) {
    toast(err.message, 'error');
    load();
    render();
  } else {
    console.error(err);
    toast('Something went wrong. Check the browser console.', 'error');
  }
}

async function deliver(payload) {
  const result = await send(payload);
  renderPayload();
  if (result.sent && !result.ok) toast('Saved, but the webhook call failed.', 'error');
}

async function onConvert() {
  const lines = doc.items.map((it, i) => ({
    unitPrice: parsePrice($(`price-${i}`).value),
    vendor: $(`vendor-${i}`).value.trim() || null,
  }));
  let firstBad = null;
  lines.forEach((line, i) => {
    const input = $(`price-${i}`);
    const bad = !(line.unitPrice > 0);
    setFieldError(input, bad ? 'Enter a unit price.' : '');
    if (bad && !firstBad) firstBad = input;
  });
  if (firstBad) {
    firstBad.focus();
    toast('Every line needs a unit price.', 'error');
    return;
  }

  const total = lines.reduce((sum, line, i) => sum + Math.round(line.unitPrice * doc.items[i].qty), 0);
  const next = HOLDER_BY_ROLE.MANAGER;
  const ok = await openDialog({
    title: 'Convert to PR?',
    html: `${esc(doc.woNo)} becomes a Purchase Request worth <span class="font-semibold text-neutral-900">${esc(fmtMoney(total))}</span> and goes to ${esc(next.name)} (${esc(next.title)}) for review.`,
    confirmLabel: 'Convert to PR',
  });
  if (!ok) return;

  try {
    const { doc: updated, payload } = priceWO(doc.id, lines, user, doc.version);
    doc = updated;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Converted to ${updated.prNo}. Sent to ${next.name}.`);
    await deliver(payload);
  } catch (err) {
    fail(err);
  }
}

async function onApprove() {
  const sig = getSignature(user.id);
  if (!sig) {
    toast('Save your signature first.', 'error');
    return;
  }
  const v = describe(doc);
  const isFinal = doc.status === 'PENDING_MD';
  const data = await openDialog({
    title: isFinal ? 'Give final approval?' : 'Approve this PR?',
    wide: true,
    confirmLabel: 'Approve & sign',
    html: `
      <div class="rounded-lg border border-neutral-200 p-3">
        <div class="flex items-center justify-between gap-3">
          <span class="font-mono text-xs font-medium text-neutral-900">${esc(v.number)}</span>
          <span class="tabular font-mono text-sm font-semibold text-neutral-900">${v.total == null ? '' : esc(fmtMoney(v.total))}</span>
        </div>
        <p class="mt-1 text-sm text-neutral-900">${esc(doc.title)}</p>
      </div>
      <div class="mt-3 rounded-lg border border-neutral-200 p-3">
        <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">${esc(STAMP_LABEL[user.role])}</p>
        <img src="${esc(sig.dataUrl)}" alt="Your signature" class="mt-1 h-14 max-w-full object-contain object-left" />
        <p class="mt-1 border-t border-neutral-900 pt-1.5 text-xs"><span class="font-semibold text-neutral-900">${esc(user.name)}</span> · ${esc(user.title)}</p>
      </div>
      <label for="dlgComment" class="mt-3 block text-xs font-medium text-neutral-700">Comment <span class="font-normal text-neutral-400">(optional)</span></label>
      <textarea id="dlgComment" name="comment" rows="2" maxlength="300" placeholder="Add a note for the requester"
        class="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 sm:text-sm"></textarea>`,
  });
  if (!data) return;

  try {
    const comment = String(data.get('comment') || '').trim();
    const { doc: updated, payload } = approveDoc(doc.id, user, signatureSnapshot(sig), comment, doc.version);
    doc = updated;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const next = holderOf(updated);
    toast(next ? `Approved and signed. Sent to ${next.name}.` : `${updated.prNo} is fully approved. Ready for PDF.`);
    await deliver(payload);
  } catch (err) {
    fail(err);
  }
}

async function onReject() {
  const data = await openDialog({
    title: 'Reject this PR?',
    confirmLabel: 'Reject PR',
    html: `
      <p>${esc(doc.createdBy.name)} will be notified with your reason. Rejection is final; they will need to submit a new WO.</p>
      <label for="dlgReason" class="mt-3 block text-xs font-medium text-neutral-700">Reason</label>
      <textarea id="dlgReason" name="reason" rows="3" maxlength="300" autofocus placeholder="What needs to change?"
        class="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 sm:text-sm"></textarea>`,
    validate: (fd) => (String(fd.get('reason') || '').trim().length < 10 ? 'Give a reason of at least 10 characters.' : ''),
  });
  if (!data) return;

  try {
    const { doc: updated, payload } = rejectDoc(doc.id, user, String(data.get('reason')), doc.version);
    doc = updated;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Rejected. ${updated.createdBy.name} will be notified.`);
    await deliver(payload);
  } catch (err) {
    fail(err);
  }
}

$('actionPanel').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act;
  if (act === 'switch') {
    const u = switchUser(btn.dataset.user);
    toast(`Now testing as ${u.name} (${u.title})`);
  } else if (act === 'convert') onConvert();
  else if (act === 'approve') onApprove();
  else if (act === 'reject') onReject();
});

// ---------------------------------------------------------------------------
// Sync & init
// ---------------------------------------------------------------------------
onUserChange((u) => { user = u; render(); });
window.addEventListener('storage', (e) => {
  if (e.key === KEYS.docs || e.key === KEYS.outbox) { load(); render(); }
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) { user = getCurrentUser(); load(); render(); }
});

load();
render();
startTimers();
