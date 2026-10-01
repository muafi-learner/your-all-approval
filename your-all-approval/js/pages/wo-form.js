// New WO form (SPV). Validates, writes the WO to Local Storage, logs the webhook
// payload, then returns to the dashboard with the new WO highlighted.
import { CONFIG } from '../config.js';
import { loadDocs } from '../data.js';
import { DIVISIONS, HOLDER_BY_ROLE, STAMP_LABEL, firstUserWithRole } from '../people.js';
import { getSignature, signatureSnapshot } from '../signature.js';
import { createWO, WorkflowError } from '../workflow.js';
import { send } from '../outbox.js';
import { esc, todayYMD } from '../format.js';
import { mountShell, onUserChange, switchUser, toast, icon, FIELD, setFieldError } from '../ui.js';

const $ = (id) => document.getElementById(id);
const form = $('woForm');
const itemList = $('itemList');

let user = mountShell({ active: 'new' });
let itemSeq = 0;
let submitting = false;

const UNITS = ['unit', 'pcs', 'set', 'lot', 'box', 'pack', 'bag', 'roll', 'sheet', 'pail', 'm', 'm²', 'm³', 'kg', 'L'];

// ---------- Static setup ----------
$('unitList').innerHTML = UNITS.map((u) => `<option value="${esc(u)}"></option>`).join('');
$('projectList').innerHTML = [...new Set(loadDocs().map((d) => d.project))].sort()
  .map((p) => `<option value="${esc(p)}"></option>`).join('');
$('division').innerHTML = DIVISIONS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
$('requiredBy').min = todayYMD();

// ---------- Line items ----------
function itemHTML(n) {
  const id = (f) => `item${n}-${f}`;
  return `
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium text-neutral-500">Item <span data-index class="tabular"></span></span>
      <button type="button" data-remove class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-30">
        ${icon('trash', 'h-3.5 w-3.5')}Remove
      </button>
    </div>
    <div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-12">
      <div class="col-span-2 sm:col-span-6">
        <label for="${id('name')}" class="${FIELD.label}">Item name</label>
        <input id="${id('name')}" data-field="name" maxlength="80" autocomplete="off" placeholder="e.g. LED panel 60×60" class="${FIELD.input}" />
        <p data-error class="${FIELD.error}"></p>
      </div>
      <div class="col-span-2 sm:col-span-6">
        <label for="${id('spec')}" class="${FIELD.label}">Specification <span class="${FIELD.optional}">(optional)</span></label>
        <input id="${id('spec')}" data-field="spec" maxlength="120" autocomplete="off" placeholder="Size, brand, grade…" class="${FIELD.input}" />
      </div>
      <div class="sm:col-span-3">
        <label for="${id('qty')}" class="${FIELD.label}">Quantity</label>
        <input id="${id('qty')}" data-field="qty" type="number" inputmode="decimal" min="0" step="any" placeholder="0" class="${FIELD.input} tabular" />
        <p data-error class="${FIELD.error}"></p>
      </div>
      <div class="sm:col-span-3">
        <label for="${id('unit')}" class="${FIELD.label}">Unit</label>
        <input id="${id('unit')}" data-field="unit" list="unitList" maxlength="12" autocomplete="off" placeholder="pcs" class="${FIELD.input}" />
        <p data-error class="${FIELD.error}"></p>
      </div>
    </div>`;
}

function addItem(focus = false) {
  if (itemList.children.length >= CONFIG.MAX_LINE_ITEMS) {
    toast(`A WO can have up to ${CONFIG.MAX_LINE_ITEMS} items.`, 'error');
    return;
  }
  const li = document.createElement('li');
  li.dataset.item = '';
  li.className = 'rounded-lg border border-neutral-200 p-3 sm:p-4';
  li.innerHTML = itemHTML(++itemSeq);
  itemList.appendChild(li);
  renumber();
  if (focus) li.querySelector('[data-field="name"]').focus();
}

function renumber() {
  const rows = [...itemList.children];
  rows.forEach((li, i) => {
    li.querySelector('[data-index]').textContent = i + 1;
    li.querySelector('[data-remove]').disabled = rows.length === 1;
  });
  $('itemCount').textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
}

$('addItem').addEventListener('click', () => addItem(true));

itemList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn || itemList.children.length === 1) return;
  const li = btn.closest('[data-item]');
  const next = li.nextElementSibling || li.previousElementSibling;
  li.remove();
  renumber();
  if (next) next.querySelector('[data-field="name"]').focus();
});

// Clear a field's error as soon as the user edits it
form.addEventListener('input', (e) => {
  if (e.target.getAttribute('aria-invalid') === 'true') setFieldError(e.target, '');
  if (e.target.id === 'justification') $('justCount').textContent = `${e.target.value.length}/500`;
});

// ---------- Sidebar ----------
function renderRoute() {
  const spv = user.role === 'SPV' ? user : firstUserWithRole('SPV');
  const route = [
    { label: STAMP_LABEL.SPV, who: spv, note: 'signs on submit' },
    { label: 'SCM pricing', who: HOLDER_BY_ROLE.SCM, note: 'adds prices, converts to PR' },
    { label: 'Manager review', who: HOLDER_BY_ROLE.MANAGER, note: 'approves and signs' },
    { label: 'MD approval', who: HOLDER_BY_ROLE.MD, note: 'final approval and signature' },
  ];
  $('routeList').innerHTML = route.map((s, i) => `
    <li class="relative flex gap-3 ${i < route.length - 1 ? 'pb-4' : ''}">
      ${i < route.length - 1 ? '<span class="absolute bottom-0 left-[11px] top-7 w-px bg-neutral-200" aria-hidden="true"></span>' : ''}
      <span class="tabular relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${i === 0 ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-500'}">${i + 1}</span>
      <div class="min-w-0">
        <p class="text-sm font-medium">${esc(s.label)}</p>
        <p class="truncate text-xs text-neutral-500">${esc(s.who.name)} · ${esc(s.note)}</p>
      </div>
    </li>`).join('');
}

function renderSignature() {
  const isSpv = user.role === 'SPV';
  const sig = isSpv ? getSignature(user.id) : null;
  const box = $('sigBox');

  if (!isSpv) {
    box.innerHTML = '<p class="text-xs text-neutral-500">Switch to an SPV to sign and submit.</p>';
  } else if (sig) {
    box.innerHTML = `
      <div class="rounded-lg border border-neutral-200 p-3">
        <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">${esc(STAMP_LABEL.SPV)}</p>
        <img src="${esc(sig.dataUrl)}" alt="Your signature" class="mt-1 h-12 max-w-full object-contain object-left" />
        <div class="mt-1 border-t border-neutral-900 pt-1.5">
          <p class="text-xs font-semibold">${esc(user.name)}</p>
          <p class="text-[11px] text-neutral-500">${esc(user.title)} · stamped when you submit</p>
        </div>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="rounded-lg border border-dashed border-neutral-400 p-3">
        <p class="flex items-center gap-1.5 text-sm font-medium">${icon('alert')}No signature saved</p>
        <p class="mt-1 text-xs leading-relaxed text-neutral-500">Your signature is stamped on the WO as "${esc(STAMP_LABEL.SPV)}" when you submit.</p>
        <a href="index.html" class="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">Set up signature${icon('chevronRight', 'h-3.5 w-3.5', 2)}</a>
      </div>`;
  }
  $('submitBtn').disabled = !isSpv || !sig || submitting;
}

function renderGate() {
  const isSpv = user.role === 'SPV';
  const spv = firstUserWithRole('SPV');
  $('roleGate').classList.toggle('hidden', isSpv);
  $('roleGateText').textContent = `You're testing as ${user.name} (${user.title}).`;
  $('switchToSpv').textContent = `Switch to ${spv.name}`;
  $('formFields').disabled = !isSpv;
}

function renderAll() {
  renderGate();
  renderRoute();
  renderSignature();
}

$('switchToSpv').addEventListener('click', () => {
  const spv = switchUser(firstUserWithRole('SPV').id);
  toast(`Now testing as ${spv.name} (${spv.title})`);
});

onUserChange((u) => {
  user = u;
  if (u.role === 'SPV') $('division').value = DIVISIONS.includes(u.division) ? u.division : DIVISIONS[0];
  renderAll();
});

// ---------- Validation ----------
function collect() {
  const invalid = [];
  const check = (input, message) => {
    setFieldError(input, message);
    if (message) invalid.push(input);
  };
  const el = form.elements;
  const values = {
    title: el.title.value.trim(),
    division: el.division.value,
    project: el.project.value.trim(),
    requiredBy: el.requiredBy.value,
    justification: el.justification.value.trim(),
    items: [],
  };

  check(el.title, values.title.length < 5 ? 'Enter a title of at least 5 characters.' : '');
  check(el.requiredBy, !values.requiredBy ? 'Pick the date you need this by.'
    : values.requiredBy < todayYMD() ? 'Pick today or a later date.' : '');
  check(el.project, !values.project ? 'Enter the project this is for.' : '');
  check(el.justification, values.justification.length < 10 ? 'Explain the need in at least 10 characters.' : '');

  [...itemList.children].forEach((li) => {
    const f = (name) => li.querySelector(`[data-field="${name}"]`);
    const name = f('name').value.trim();
    const spec = f('spec').value.trim();
    const qtyRaw = f('qty').value.trim();
    const qty = Number(qtyRaw);
    const unit = f('unit').value.trim();
    check(f('name'), !name ? 'Enter the item name.' : '');
    check(f('qty'), !qtyRaw || !Number.isFinite(qty) || qty <= 0 ? 'Enter a quantity above 0.'
      : qty > 1e6 ? 'That quantity looks too large.' : '');
    check(f('unit'), !unit ? 'Enter a unit.' : '');
    values.items.push({ name, spec, qty, unit });
  });

  return { values, invalid };
}

// ---------- Submit ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitting) return;

  const { values, invalid } = collect();
  if (invalid.length) {
    invalid[0].focus();
    toast(`Please fix ${invalid.length} highlighted field${invalid.length === 1 ? '' : 's'}.`, 'error');
    return;
  }

  const sig = getSignature(user.id);
  if (!sig) {
    toast('Save your signature first.', 'error');
    return;
  }

  submitting = true;
  $('submitBtn').disabled = true;
  $('submitLabel').textContent = 'Submitting…';
  try {
    const { doc, payload } = createWO(values, user, signatureSnapshot(sig));
    const result = await send(payload);
    if (result.sent && !result.ok) toast('Saved, but the webhook call failed.', 'error');
    window.location.href = `dashboard.html?created=${encodeURIComponent(doc.id)}`;
  } catch (err) {
    submitting = false;
    $('submitLabel').textContent = 'Submit WO';
    renderSignature();
    if (err instanceof WorkflowError) {
      toast(err.message, 'error');
    } else {
      console.error(err);
      toast('Something went wrong. Check the browser console.', 'error');
    }
  }
});

// ---------- Init ----------
$('division').value = user.role === 'SPV' && DIVISIONS.includes(user.division) ? user.division : DIVISIONS[0];
addItem(false);
renderAll();
