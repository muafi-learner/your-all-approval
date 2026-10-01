// Shared UI: app shell (header, nav, demo-user switcher), toast, dialog,
// form-field helpers and small HTML fragments (badges, timers, avatars).
import { CONFIG, KEYS } from './config.js';
import { DEMO_USERS, getCurrentUser, setCurrentUser } from './people.js';
import { esc, initials, dur, ms } from './format.js';
import { STAGES, isOverdue } from './workflow.js';

// ---------------------------------------------------------------------------
// Icons (inline SVG, stroke-based, inherit currentColor)
// ---------------------------------------------------------------------------
const PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pen: '<path d="M3 16c2.5-2.5 4-8.5 6.5-8.5 2 0 .2 7 2.2 7 1.3 0 2-2.6 3.1-2.6 1 0 1.2 1.6 2.4 1.6H21"/><path d="M3 20.5h18"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  filePlus: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11.5v6M9 14.5h6"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
};

export function icon(name, cls = 'h-4 w-4', strokeWidth = 1.75) {
  return `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
const NAV = [
  { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard', icon: 'dashboard' },
  { key: 'new', href: 'wo-form.html', label: 'New WO', icon: 'filePlus' },
  { key: 'signature', href: 'index.html', label: 'Signature', icon: 'pen' },
];

function headerHTML(active) {
  const links = NAV.map((n) => {
    const on = n.key === active;
    return `<a href="${n.href}" ${on ? 'aria-current="page"' : ''}
      class="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm transition ${on ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}">${icon(n.icon)}${n.label}</a>`;
  }).join('');

  return `<header class="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
      <div class="flex items-center gap-8">
        <a href="dashboard.html" class="flex items-center gap-2.5" aria-label="Your All Approval, go to dashboard">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-neutral-900 text-white">${icon('check', 'h-4 w-4', 2.5)}</span>
          <span class="text-[15px] font-semibold tracking-tight">Your All Approval</span>
        </a>
        <nav class="hidden items-center gap-1 md:flex" aria-label="Primary">${links}</nav>
      </div>
      <div class="flex items-center gap-3">
        <span class="hidden text-[11px] uppercase tracking-[0.14em] text-neutral-400 lg:inline">Demo user</span>
        <div class="relative">
          <select id="shellUserSelect" aria-label="Switch demo user" class="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none text-base opacity-0"></select>
          <div class="flex h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white pl-1 pr-2.5 transition peer-hover:border-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-900 peer-focus-visible:ring-offset-2">
            <span id="shellAvatar" class="grid h-7 w-7 place-items-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white"></span>
            <span class="hidden flex-col leading-tight sm:flex">
              <span id="shellName" class="text-[13px] font-medium"></span>
              <span id="shellRole" class="text-[11px] text-neutral-500"></span>
            </span>
            ${icon('chevronDown', 'h-4 w-4 text-neutral-400', 2)}
          </div>
        </div>
      </div>
    </div>
  </header>`;
}

function bottomNavHTML(active) {
  const items = NAV.map((n) => {
    const on = n.key === active;
    return `<li><a href="${n.href}" ${on ? 'aria-current="page"' : ''}
      class="relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${on ? 'text-neutral-900 before:absolute before:top-0 before:h-0.5 before:w-10 before:rounded-full before:bg-neutral-900' : 'text-neutral-400 hover:text-neutral-900'}">${icon(n.icon, 'h-5 w-5')}<span>${n.label}</span></a></li>`;
  }).join('');
  return `<nav class="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Primary">
    <ul class="mx-auto grid max-w-md grid-cols-3">${items}</ul>
  </nav>`;
}

const TOAST_HTML = `<div class="pointer-events-none fixed inset-x-0 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6" aria-live="polite">
  <div id="shellToast" class="flex max-w-md translate-y-2 items-center gap-2 rounded-lg border border-transparent bg-neutral-900 px-4 py-3 text-sm text-white opacity-0 shadow-lg transition duration-200">
    <span id="shellToastIcon" class="shrink-0"></span><span id="shellToastMsg"></span>
  </div>
</div>`;

function syncUser(user, notify) {
  const select = document.getElementById('shellUserSelect');
  if (select) select.value = user.id;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('shellAvatar', initials(user.name));
  set('shellName', user.name);
  set('shellRole', user.title);
  if (notify) document.dispatchEvent(new CustomEvent('yaa:userchange', { detail: user }));
}

/**
 * Insert the header, bottom nav and toast container into the page.
 * @param {{active: 'dashboard'|'new'|'signature'}} options
 * @returns the current demo user
 */
export function mountShell({ active }) {
  document.body.insertAdjacentHTML('afterbegin', headerHTML(active));
  document.body.insertAdjacentHTML('beforeend', bottomNavHTML(active) + TOAST_HTML);

  const select = document.getElementById('shellUserSelect');
  DEMO_USERS.forEach((u) => select.add(new Option(`${u.name} — ${u.title}`, u.id)));
  select.addEventListener('change', () => {
    const user = switchUser(select.value);
    toast(`Now testing as ${user.name} (${user.title})`);
  });

  // Stay in sync when the user is switched in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.user) syncUser(getCurrentUser(), true);
  });

  const user = getCurrentUser();
  syncUser(user, false);
  return user;
}

/** Switch the demo user from page code (e.g. a "Switch to Andi" button) */
export function switchUser(id) {
  const user = setCurrentUser(id);
  syncUser(user, true);
  return user;
}

export function onUserChange(handler) {
  document.addEventListener('yaa:userchange', (e) => handler(e.detail));
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = 0;
export function toast(message, type = 'success') {
  const el = document.getElementById('shellToast');
  if (!el) return;
  const isError = type === 'error';
  el.classList.toggle('bg-neutral-900', !isError);
  el.classList.toggle('text-white', !isError);
  el.classList.toggle('border-transparent', !isError);
  el.classList.toggle('bg-white', isError);
  el.classList.toggle('text-neutral-900', isError);
  el.classList.toggle('border-neutral-900', isError);
  document.getElementById('shellToastIcon').innerHTML = icon(isError ? 'alert' : 'check', 'h-4 w-4', 2);
  document.getElementById('shellToastMsg').textContent = message;
  el.classList.remove('opacity-0', 'translate-y-2');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('opacity-0', 'translate-y-2'), isError ? 4500 : 3000);
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
/**
 * Modal dialog. Resolves with the form's FormData on confirm, or null on cancel.
 * `html` is trusted markup: escape any user text with esc() before passing it in.
 * `validate(formData)` may return an error message to keep the dialog open.
 */
export function openDialog({ title, html = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', validate, wide = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `m-auto ${wide ? 'w-[min(92vw,28rem)]' : 'w-[min(92vw,24rem)]'} rounded-xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-950/40`;
    const hasAutofocus = /\bautofocus\b/.test(html);
    dlg.innerHTML = `<form class="p-5" novalidate>
      <h3 class="text-base font-semibold">${esc(title)}</h3>
      <div class="mt-2 text-sm leading-relaxed text-neutral-600">${html}</div>
      <p data-dialog-error class="mt-3 hidden items-center gap-1.5 text-xs font-medium text-neutral-900"></p>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" data-cancel class="h-10 rounded-lg border border-neutral-300 px-4 text-sm font-medium transition hover:border-neutral-900">${esc(cancelLabel)}</button>
        <button type="submit" ${hasAutofocus ? '' : 'autofocus'} class="h-10 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-700">${esc(confirmLabel)}</button>
      </div>
    </form>`;
    document.body.appendChild(dlg);

    const form = dlg.querySelector('form');
    const errorEl = dlg.querySelector('[data-dialog-error]');
    let result = null;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const error = validate ? validate(data) : '';
      if (error) {
        errorEl.innerHTML = `${icon('alert', 'h-3.5 w-3.5 shrink-0', 2)}<span>${esc(error)}</span>`;
        errorEl.classList.remove('hidden');
        errorEl.classList.add('flex');
        return;
      }
      result = data;
      dlg.close();
    });
    dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });

    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      // Very old browsers: fall back to a native confirm
      dlg.remove();
      resolve(window.confirm(title) ? new FormData(form) : null);
    }
  });
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export const FIELD = {
  label: 'mb-1.5 block text-xs font-medium text-neutral-700',
  input: 'h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:bg-neutral-100 aria-[invalid=true]:border-neutral-900 aria-[invalid=true]:bg-neutral-50 sm:text-sm',
  error: 'mt-1.5 hidden items-center gap-1 text-xs font-medium text-neutral-900',
  optional: 'font-normal text-neutral-400',
};

/** Show or clear the error under a field. The error <p data-error> must share the input's parent. */
export function setFieldError(input, message) {
  const box = input.parentElement.querySelector('[data-error]');
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (!box) return;
  if (!box.id) box.id = `${input.id || `f${Math.random().toString(36).slice(2, 8)}`}-error`;
  input.setAttribute('aria-describedby', box.id);
  box.innerHTML = message ? `${icon('alert', 'h-3.5 w-3.5 shrink-0', 2)}<span>${esc(message)}</span>` : '';
  box.classList.toggle('hidden', !message);
  box.classList.toggle('flex', !!message);
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/** Three segments = three approval stages, filled up to the current one */
export function steps(step, inverted = false) {
  const on = inverted ? 'bg-white' : 'bg-neutral-900';
  const off = inverted ? 'bg-neutral-600' : 'bg-neutral-200';
  return `<span class="flex gap-0.5" aria-hidden="true">${[1, 2, 3]
    .map((i) => `<span class="h-1.5 w-2.5 rounded-full ${i <= step ? on : off}"></span>`).join('')}</span>`;
}

export function badge(status) {
  if (status === 'APPROVED') {
    return `<span class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white">${icon('check', 'h-3 w-3', 3)}Approved</span>`;
  }
  if (status === 'REJECTED') {
    return `<span class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-neutral-400 px-2.5 py-1 text-[11px] font-medium text-neutral-500">${icon('x', 'h-3 w-3', 3)}Rejected</span>`;
  }
  const s = STAGES[status];
  return `<span class="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-900">${steps(s.step)}${s.label}<span class="sr-only">, stage ${s.step} of 3</span></span>`;
}

export const typeTag = (type) => (type === 'PR'
  ? '<span class="rounded bg-neutral-100 px-1 py-px font-mono text-[10px] font-medium text-neutral-700">PR</span>'
  : '<span class="rounded border border-neutral-300 px-1 font-mono text-[10px] font-medium text-neutral-600">WO</span>');

export const overdueTag = (since, show) => `<span data-overdue-since="${esc(since)}" class="${show ? '' : 'hidden '}rounded bg-neutral-900 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">Overdue</span>`;

/** Live elapsed time since an ISO timestamp (updated by startTimers) */
export const timer = (since, cls = '') => `<span data-since="${esc(since)}" class="tabular font-mono ${cls}">${dur(Date.now() - ms(since))}</span>`;

export function avatar(person, { me = false, size = 'h-7 w-7 text-[10px]' } = {}) {
  return `<span class="grid ${size} shrink-0 place-items-center rounded-full font-semibold ${me ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700'}">${esc(initials(person.name))}</span>`;
}

// ---------------------------------------------------------------------------
// Live timers: update text in place so focus and scroll are never disturbed
// ---------------------------------------------------------------------------
export function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-since]').forEach((el) => {
    el.textContent = dur(now - ms(el.dataset.since));
  });
  document.querySelectorAll('[data-overdue-since]').forEach((el) => {
    el.classList.toggle('hidden', !isOverdue(el.dataset.overdueSince));
  });
  document.querySelectorAll('[data-overdue-card]').forEach((el) => {
    const over = isOverdue(el.dataset.overdueCard);
    el.classList.toggle('border-neutral-900', over);
    el.classList.toggle('border-neutral-200', !over);
  });
}

export function startTimers() {
  setInterval(tick, CONFIG.TICK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}
