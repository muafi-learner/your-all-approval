// Approval dashboard: pipeline tiles, filters, cards (mobile) and table (desktop).
import { KEYS } from '../config.js';
import { loadDocs, resetDocs } from '../data.js';
import { HOLDER_BY_ROLE, getCurrentUser } from '../people.js';
import { STAGES, ACTIVE, describe, isOverdue } from '../workflow.js';
import { esc, dur, ms, fmtShort, fmtTime, fmtMoney } from '../format.js';
import {
  mountShell, onUserChange, toast, openDialog, icon, steps, badge, typeTag, overdueTag, timer, avatar, startTimers,
} from '../ui.js';

const $ = (id) => document.getElementById(id);

let user = mountShell({ active: 'dashboard' });
let docs = loadDocs();
const filters = { scope: 'all', status: null, query: '', sort: 'bottleneck' };

onUserChange((u) => { user = u; renderAll(); });

const isMine = (r) => (user.role === 'SPV'
  ? r.doc.createdBy.id === user.id
  : !r.closed && r.holder && r.holder.id === user.id);
const mineLabel = () => (user.role === 'SPV' ? 'My requests' : 'Waiting on me');
const you = (p) => (p && p.id === user.id ? ' <span class="font-normal text-neutral-400">(you)</span>' : '');

// ---------- Fragments ----------
function valueHTML(r) {
  if (r.total == null) return '<span class="text-xs text-neutral-400">Awaiting pricing</span>';
  const n = r.doc.items.length;
  return `<p class="tabular font-mono text-sm">${fmtMoney(r.total)}</p><p class="mt-0.5 text-xs text-neutral-500">${n} item${n === 1 ? '' : 's'}</p>`;
}

function rowHTML(r) {
  const d = r.doc;
  const holderCell = r.closed
    ? `<p class="text-xs text-neutral-500">${d.status === 'APPROVED' ? 'Approved' : 'Rejected'} by</p>
       <p class="mt-0.5 truncate font-medium">${esc(r.closedBy.name)}${you(r.closedBy)}</p>`
    : `<div class="flex items-center gap-2.5">
         ${avatar(r.holder, { me: r.holder.id === user.id })}
         <div class="min-w-0">
           <p class="truncate font-medium">${esc(r.holder.name)}${you(r.holder)}</p>
           <p class="truncate text-xs text-neutral-500">${esc(r.holder.title)}</p>
         </div>
       </div>`;
  const timeCell = r.closed
    ? `<p class="text-neutral-400">—</p><p class="mt-0.5 text-xs text-neutral-500">Cycle ${dur(r.cycleMs)}</p>`
    : `<div class="flex items-center gap-1.5">${timer(r.since, 'text-sm font-medium')}${overdueTag(r.since, r.overdue)}</div>
       <p class="mt-0.5 text-xs text-neutral-500">since ${fmtShort(r.since)}</p>`;

  return `<tr data-href="${r.href}" data-id="${esc(d.id)}" class="group cursor-pointer transition hover:bg-neutral-50">
    <td class="px-5 py-3.5 align-top">
      <div class="flex items-center gap-2">
        <a href="${r.href}" class="font-mono text-xs font-medium underline-offset-2 hover:underline">${esc(r.number)}</a>
        ${typeTag(d.type)}
      </div>
      <p class="mt-1 truncate font-medium" title="${esc(d.title)}">${esc(d.title)}</p>
      <p class="mt-0.5 truncate text-xs text-neutral-500">${esc(d.project)} · ${esc(d.createdBy.name)}</p>
    </td>
    <td class="px-3 py-3.5 align-top">${badge(d.status)}</td>
    <td class="px-3 py-3.5 align-top">${holderCell}</td>
    <td class="px-3 py-3.5 align-top">${timeCell}</td>
    <td class="px-3 py-3.5 text-right align-top">${valueHTML(r)}</td>
    <td class="py-3.5 pr-4 align-top text-neutral-300 transition group-hover:text-neutral-900">${icon('chevronRight', 'h-4 w-4', 2)}</td>
  </tr>`;
}

function cardHTML(r) {
  const d = r.doc;
  const who = r.closed ? r.closedBy : r.holder;
  const whoLabel = r.closed ? (d.status === 'APPROVED' ? 'Approved by' : 'Rejected by') : 'Holder';
  const timeBlock = r.closed
    ? `<dt class="text-neutral-500">Cycle time</dt><dd class="tabular mt-0.5 font-mono font-medium">${dur(r.cycleMs)}</dd>`
    : `<dt class="text-neutral-500">In stage</dt>
       <dd class="mt-0.5 flex items-center justify-end gap-1.5">${overdueTag(r.since, r.overdue)}${timer(r.since, 'font-medium')}</dd>`;

  return `<li>
    <a href="${r.href}" data-id="${esc(d.id)}" ${r.closed ? '' : `data-overdue-card="${esc(r.since)}"`}
       class="block h-full rounded-xl border ${r.overdue ? 'border-neutral-900' : 'border-neutral-200'} bg-white p-4 transition hover:border-neutral-900 active:bg-neutral-50">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2"><span class="font-mono text-xs font-medium">${esc(r.number)}</span>${typeTag(d.type)}</div>
        ${badge(d.status)}
      </div>
      <p class="mt-2.5 font-medium leading-snug">${esc(d.title)}</p>
      <p class="mt-0.5 truncate text-xs text-neutral-500">${esc(d.project)}</p>
      <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-neutral-100 pt-3 text-xs">
        <div class="min-w-0">
          <dt class="text-neutral-500">${whoLabel}</dt>
          <dd class="mt-0.5 truncate font-medium">${esc(who.name)}${you(who)}</dd>
        </div>
        <div class="text-right">${timeBlock}</div>
        <div class="min-w-0">
          <dt class="text-neutral-500">Requested by</dt>
          <dd class="mt-0.5 truncate">${esc(d.createdBy.name)}${you(d.createdBy)}</dd>
        </div>
        <div class="text-right">
          <dt class="text-neutral-500">Value</dt>
          <dd class="mt-0.5">${r.total == null ? '<span class="text-neutral-400">Awaiting pricing</span>' : `<span class="tabular font-mono">${fmtMoney(r.total)}</span>`}</dd>
        </div>
      </dl>
    </a>
  </li>`;
}

// ---------- Summary tiles ----------
function tileClass(selected) {
  return `min-w-0 rounded-xl border p-3 text-left transition sm:p-4 ${selected ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white hover:border-neutral-900'}`;
}

function renderTiles(rows) {
  const active = rows.filter((r) => !r.closed);
  const closed = rows.filter((r) => r.closed);
  $('activeCount').textContent = `${active.length} open`;
  $('closedCount').textContent = `${closed.length} total`;

  $('tilesActive').innerHTML = ACTIVE.map((status) => {
    const s = STAGES[status];
    const list = active.filter((r) => r.doc.status === status);
    const oldest = list.map((r) => r.since).sort()[0];
    const over = oldest && isOverdue(oldest);
    const sel = filters.status === status;
    const sub = sel ? 'text-neutral-300' : 'text-neutral-500';
    const overCls = sel ? 'font-semibold text-white' : 'font-semibold text-neutral-900';
    return `<button type="button" data-status="${status}" aria-pressed="${sel}" class="${tileClass(sel)}">
      <span class="flex items-center justify-between gap-2">
        <span class="truncate text-[11px] font-medium sm:text-xs ${sub}">${s.label}</span>
        <span class="hidden sm:flex">${steps(s.step, sel)}</span>
      </span>
      <span class="tabular mt-1.5 block text-2xl font-semibold sm:text-3xl">${list.length}</span>
      <span class="mt-1 block truncate text-[11px] ${over ? overCls : sub}">${oldest ? `${over ? '● ' : ''}Oldest ${timer(oldest)}` : 'All clear'}</span>
      <span class="mt-0.5 hidden truncate text-[11px] sm:block ${sub}">${esc(HOLDER_BY_ROLE[s.role].name)}</span>
    </button>`;
  }).join('');

  const approved = closed.filter((r) => r.doc.status === 'APPROVED');
  const rejected = closed.filter((r) => r.doc.status === 'REJECTED');
  const avgCycle = approved.length ? approved.reduce((s, r) => s + r.cycleMs, 0) / approved.length : null;
  const rejectRate = closed.length ? Math.round((rejected.length / closed.length) * 100) : 0;
  const tiles = [
    { status: 'APPROVED', icon: 'check', count: approved.length, sub: avgCycle == null ? 'No approvals yet' : `Avg cycle ${dur(avgCycle)}` },
    { status: 'REJECTED', icon: 'x', count: rejected.length, sub: `${rejectRate}% of closed` },
  ];
  $('tilesClosed').innerHTML = tiles.map((t) => {
    const sel = filters.status === t.status;
    const sub = sel ? 'text-neutral-300' : 'text-neutral-500';
    return `<button type="button" data-status="${t.status}" aria-pressed="${sel}" class="${tileClass(sel)}">
      <span class="flex items-center gap-1.5 truncate text-[11px] font-medium sm:text-xs ${sub}">${icon(t.icon, 'h-3 w-3', 3)}${STAGES[t.status].label}</span>
      <span class="tabular mt-1.5 block text-2xl font-semibold sm:text-3xl">${t.count}</span>
      <span class="mt-1 block truncate text-[11px] ${sub}">${t.sub}</span>
      <span class="mt-0.5 hidden text-[11px] sm:block">&nbsp;</span>
    </button>`;
  }).join('');
}

// ---------- Scope tabs ----------
const scopeBtns = document.querySelectorAll('[data-scope]');
function renderScope(rows) {
  $('mineLabel').textContent = mineLabel();
  const count = rows.filter(isMine).length;
  $('mineCount').textContent = count;
  $('mineCount').classList.toggle('hidden', count === 0);
  scopeBtns.forEach((btn) => {
    const active = btn.dataset.scope === filters.scope;
    btn.setAttribute('aria-selected', String(active));
    btn.classList.toggle('bg-white', active);
    btn.classList.toggle('shadow-sm', active);
    btn.classList.toggle('text-neutral-900', active);
    btn.classList.toggle('text-neutral-500', !active);
  });
}

// ---------- Filtering & sorting ----------
function applyFilters(rows) {
  const q = filters.query.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (filters.scope === 'mine' && !isMine(r)) return false;
    if (filters.status && r.doc.status !== filters.status) return false;
    if (q) {
      const hay = [r.doc.woNo, r.doc.prNo, r.doc.title, r.doc.project, r.doc.createdBy.name].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return out.sort((a, b) => {
    if (filters.sort === 'newest') return ms(b.createdAt) - ms(a.createdAt);
    if (filters.sort === 'value') return (b.total == null ? -1 : b.total) - (a.total == null ? -1 : a.total);
    // Bottleneck: open documents first (oldest stage first), then closed (most recent first)
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    return a.closed ? ms(b.since) - ms(a.since) : ms(a.since) - ms(b.since);
  });
}

const hasFilters = () => filters.scope !== 'all' || !!filters.status || !!filters.query.trim();

function renderFilterBar(shown, total) {
  const chip = (label, key) => `<button type="button" data-clear="${key}" aria-label="Remove filter: ${esc(label)}"
    class="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-neutral-700 transition hover:border-neutral-900">${esc(label)}${icon('x', 'h-3 w-3', 2.5)}</button>`;
  const parts = [`<span class="tabular">Showing ${shown} of ${total}</span>`];
  if (filters.scope === 'mine') parts.push(chip(mineLabel(), 'scope'));
  if (filters.status) parts.push(chip(STAGES[filters.status].label, 'status'));
  if (filters.query.trim()) parts.push(chip(`“${filters.query.trim()}”`, 'query'));
  if (hasFilters()) parts.push('<button type="button" data-clear="all" class="underline underline-offset-2 transition hover:text-neutral-900">Clear all</button>');
  $('filterBar').innerHTML = parts.join('');
}

function renderList(rows) {
  const list = applyFilters(rows);
  $('cardList').innerHTML = list.map(cardHTML).join('');
  $('tableBody').innerHTML = list.map(rowHTML).join('');
  $('results').classList.toggle('hidden', list.length === 0);
  $('emptyState').classList.toggle('hidden', list.length !== 0);

  if (!list.length) {
    const nothingMine = filters.scope === 'mine' && !filters.status && !filters.query.trim();
    $('emptyTitle').textContent = nothingMine
      ? (user.role === 'SPV' ? 'You have no requests yet' : 'Nothing is waiting on you')
      : 'No documents match';
    $('emptyText').textContent = nothingMine
      ? (user.role === 'SPV' ? 'Create a WO to start an approval.' : 'New items appear here when they reach your stage.')
      : 'Try a different search or clear the filters.';
  }
  renderFilterBar(list.length, rows.length);
}

function renderAll() {
  const rows = docs.map(describe);
  renderTiles(rows);
  renderScope(rows);
  renderList(rows);
  $('updatedAt').textContent = `Updated ${fmtTime(new Date())}`;
}

function reload() {
  docs = loadDocs();
  user = getCurrentUser();
  renderAll();
}

// ---------- Events ----------
$('pipeline').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-status]');
  if (!btn) return;
  filters.status = filters.status === btn.dataset.status ? null : btn.dataset.status;
  renderAll();
});

scopeBtns.forEach((btn) => btn.addEventListener('click', () => {
  filters.scope = btn.dataset.scope;
  renderAll();
}));

$('search').addEventListener('input', (e) => {
  filters.query = e.target.value;
  renderList(docs.map(describe));
});

$('sort').addEventListener('change', (e) => {
  filters.sort = e.target.value;
  renderList(docs.map(describe));
});

function clearFilter(key) {
  if (key === 'scope' || key === 'all') filters.scope = 'all';
  if (key === 'status' || key === 'all') filters.status = null;
  if (key === 'query' || key === 'all') { filters.query = ''; $('search').value = ''; }
  renderAll();
}
$('filterBar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-clear]');
  if (btn) clearFilter(btn.dataset.clear);
});
$('emptyClear').addEventListener('click', () => clearFilter('all'));

// Whole table row opens the document in the same tab
$('tableBody').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const tr = e.target.closest('tr[data-href]');
  if (tr) window.location.href = tr.dataset.href;
});

$('refreshBtn').addEventListener('click', () => { reload(); toast('Dashboard is up to date'); });

$('resetBtn').addEventListener('click', async () => {
  const ok = await openDialog({
    title: 'Reset demo data?',
    html: 'All WOs and PRs go back to the original sample set. Anything created or approved while testing will be lost. Saved signatures are kept.',
    confirmLabel: 'Reset',
  });
  if (!ok) return;
  resetDocs();
  clearFilter('all');
  reload();
  toast('Demo data reset');
});

// Keep in sync with other tabs, and when returning with the Back button
window.addEventListener('storage', (e) => { if (e.key === KEYS.docs) reload(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) reload(); });

// ---------- Highlight a just-created WO (wo-form.html redirects here with ?created=ID) ----------
function highlightCreated() {
  const params = new URLSearchParams(window.location.search);
  const created = params.get('created');
  if (!created) return;
  history.replaceState(null, '', window.location.pathname);
  const doc = docs.find((d) => d.id === created);
  if (!doc) return;
  toast(`${doc.woNo} submitted. Now waiting on SCM pricing.`);
  const marks = ['ring-2', 'ring-neutral-900', 'ring-offset-2', 'bg-neutral-100'];
  const targets = document.querySelectorAll(`[data-id="${CSS.escape(created)}"]`);
  targets.forEach((el) => el.classList.add(...marks));
  const visible = [...targets].find((el) => el.offsetParent !== null);
  if (visible) visible.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => targets.forEach((el) => el.classList.remove(...marks)), 5000);
}

// ---------- Init ----------
renderAll();
highlightCreated();
startTimers();
