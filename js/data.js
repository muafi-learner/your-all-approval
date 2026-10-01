// Document storage: dummy seed data, load/save, numbering.
//
// Document shape (shared by every page):
// {
//   id, woNo, prNo, type: 'WO' | 'PR', status, version,
//   title, project, division, requiredBy: 'YYYY-MM-DD', justification,
//   createdBy: { id, name, role, title },
//   items:  [{ name, spec, qty, unit, unitPrice: number|null, vendor: string|null }],
//   events: [{ type: 'SUBMITTED'|'PRICED'|'APPROVED'|'REJECTED', by, at: ISO, comment,
//              signed: boolean, signature: { dataUrl, sha256 } | null, toStatus }]
// }
import { KEYS } from './config.js';
import { store } from './storage.js';
import { PEOPLE, personRef } from './people.js';

export const STATUSES = ['PENDING_SCM', 'PENDING_MANAGER', 'PENDING_MD', 'APPROVED', 'REJECTED'];

const isValidDoc = (d) => d && typeof d.id === 'string' && STATUSES.includes(d.status)
  && Array.isArray(d.events) && d.events.length > 0 && Array.isArray(d.items) && d.createdBy;

export function loadDocs() {
  let list = store.get(KEYS.docs);
  if (!Array.isArray(list) || list.length === 0) {
    list = seedDocs();
    store.set(KEYS.docs, list);
  }
  return list.filter(isValidDoc);
}

/** @returns {boolean} false when storage is full */
export const saveDocs = (list) => store.set(KEYS.docs, list);

export const getDoc = (id) => loadDocs().find((d) => d.id === id) || null;

export function resetDocs() {
  const list = seedDocs();
  store.set(KEYS.docs, list);
  store.remove(KEYS.outbox);
  return list;
}

/** Sum of all lines, or null while any line is unpriced */
export function docTotal(doc) {
  if (!doc.items.length || doc.items.some((it) => typeof it.unitPrice !== 'number')) return null;
  return doc.items.reduce((sum, it) => sum + Math.round(it.qty * it.unitPrice), 0);
}

/** Next running number for the current year, e.g. "WO-2026-0132" */
export function nextNumber(list, prefix) {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = list.reduce((top, d) => {
    [d.woNo, d.prNo].forEach((n) => {
      const hit = typeof n === 'string' && n.match(pattern);
      if (hit) top = Math.max(top, Number(hit[1]));
    });
    return top;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Dummy documents. Timestamps are relative to the moment they are seeded.
// ---------------------------------------------------------------------------
export function seedDocs() {
  const now = Date.now();
  const at = (hoursAgo) => new Date(now - hoursAgo * 3600e3).toISOString();
  const day = (daysAhead) => {
    const d = new Date(now + daysAhead * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const TO = { SUBMITTED: 'PENDING_SCM', PRICED: 'PENDING_MANAGER', REJECTED: 'REJECTED' };
  const ev = (type, by, hoursAgo, comment = '') => ({
    type,
    by: personRef(by),
    at: at(hoursAgo),
    comment,
    signed: type === 'SUBMITTED' || type === 'APPROVED',
    signature: null, // sample data has no signature images
    toStatus: type === 'APPROVED' ? (by.role === 'MANAGER' ? 'PENDING_MD' : 'APPROVED') : TO[type],
  });
  const P = PEOPLE;
  const who = personRef;

  return [
    {
      id: 'WO-2026-0131', woNo: 'WO-2026-0131', prNo: null, type: 'WO', status: 'PENDING_SCM',
      title: 'Ceramic floor tiles — Showroom renovation', project: 'PRJ-031 · Showroom Renovation',
      division: 'Project Design', requiredBy: day(14), createdBy: who(P.rina),
      justification: 'Replace cracked flooring in the main showroom before the client launch event.',
      items: [
        { name: 'Homogeneous tile 60×60', spec: 'Polished, light grey, grade A', qty: 120, unit: 'm²', unitPrice: null, vendor: null },
        { name: 'Tile adhesive', spec: 'Cement-based, 25 kg bag', qty: 40, unit: 'bag', unitPrice: null, vendor: null },
        { name: 'Tile grout', spec: 'Dark grey, 1 kg pack', qty: 30, unit: 'pack', unitPrice: null, vendor: null },
      ],
      events: [ev('SUBMITTED', P.rina, 3.2)], version: 1,
    },
    {
      id: 'WO-2026-0129', woNo: 'WO-2026-0129', prNo: null, type: 'WO', status: 'PENDING_SCM',
      title: 'Ergonomic chairs — Design studio', project: 'INT-004 · Office Facilities',
      division: 'Supply Chain', requiredBy: day(10), createdBy: who(P.dimas),
      justification: 'Current chairs are over 6 years old; several are broken.',
      items: [
        { name: 'Ergonomic mesh chair', spec: 'Adjustable lumbar, 4D armrests', qty: 8, unit: 'unit', unitPrice: null, vendor: null },
      ],
      events: [ev('SUBMITTED', P.dimas, 30.5)], version: 1,
    },
    {
      id: 'WO-2026-0130', woNo: 'WO-2026-0130', prNo: null, type: 'WO', status: 'PENDING_SCM',
      title: 'Safety signage set — Project site B', project: 'PRJ-028 · Warehouse Expansion',
      division: 'Project Design', requiredBy: day(7), createdBy: who(P.rina),
      justification: 'Required before the site safety audit.',
      items: [
        { name: 'Fire extinguisher sign', spec: 'Photoluminescent, A4', qty: 20, unit: 'pcs', unitPrice: null, vendor: null },
        { name: 'Emergency exit sign', spec: 'LED, double-sided', qty: 6, unit: 'unit', unitPrice: null, vendor: null },
        { name: 'PPE mandatory sign', spec: 'Aluminium, 40×60 cm', qty: 10, unit: 'pcs', unitPrice: null, vendor: null },
      ],
      events: [ev('SUBMITTED', P.rina, 0.7)], version: 1,
    },
    {
      id: 'WO-2026-0126', woNo: 'WO-2026-0126', prNo: 'PR-2026-0047', type: 'PR', status: 'PENDING_MANAGER',
      title: 'LED panel lights — Office 3rd floor', project: 'PRJ-030 · Office Refurbishment',
      division: 'Project Design', requiredBy: day(12), createdBy: who(P.rina),
      justification: 'Replace fluorescent fittings as part of the 3rd-floor refurbishment.',
      items: [
        { name: 'LED panel 60×60', spec: '40W, 4000K, with driver', qty: 45, unit: 'unit', unitPrice: 385000, vendor: 'CV Terang Abadi' },
        { name: 'Surface mounting frame', spec: '60×60, aluminium', qty: 45, unit: 'pcs', unitPrice: 32000, vendor: 'CV Terang Abadi' },
      ],
      events: [ev('SUBMITTED', P.rina, 26.1), ev('PRICED', P.budi, 5.3)], version: 2,
    },
    {
      id: 'WO-2026-0124', woNo: 'WO-2026-0124', prNo: 'PR-2026-0046', type: 'PR', status: 'PENDING_MANAGER',
      title: 'Gypsum partition — Meeting room B', project: 'PRJ-030 · Office Refurbishment',
      division: 'Project Design', requiredBy: day(5), createdBy: who(P.rina),
      justification: 'Split the open area into a soundproofed meeting room.',
      items: [
        { name: 'Gypsum board', spec: '9 mm, 1200×2400', qty: 120, unit: 'sheet', unitPrice: 78000, vendor: 'PT Bangun Sentosa' },
        { name: 'Metal furring', spec: 'Hollow 40×40, 4 m', qty: 300, unit: 'pcs', unitPrice: 32500, vendor: 'PT Bangun Sentosa' },
        { name: 'Rockwool insulation', spec: '50 mm, density 60', qty: 40, unit: 'roll', unitPrice: 385000, vendor: 'PT Bangun Sentosa' },
        { name: 'Screws & accessories', spec: 'Drywall screws, joint tape, compound', qty: 1, unit: 'lot', unitPrice: 2150000, vendor: 'PT Bangun Sentosa' },
      ],
      events: [ev('SUBMITTED', P.rina, 75.4), ev('PRICED', P.budi, 51.2)], version: 2,
    },
    {
      id: 'WO-2026-0127', woNo: 'WO-2026-0127', prNo: 'PR-2026-0048', type: 'PR', status: 'PENDING_MANAGER',
      title: 'Exterior paint & primer — Façade touch-up', project: 'PRJ-028 · Warehouse Expansion',
      division: 'Supply Chain', requiredBy: day(9), createdBy: who(P.dimas),
      justification: 'Peeling paint on the north façade ahead of the rainy season.',
      items: [
        { name: 'Exterior paint', spec: 'Weatherproof, white, 20 L', qty: 12, unit: 'pail', unitPrice: 685000, vendor: 'Toko Warna Jaya' },
        { name: 'Alkali-resistant primer', spec: '20 L', qty: 3, unit: 'pail', unitPrice: 545000, vendor: 'Toko Warna Jaya' },
      ],
      events: [ev('SUBMITTED', P.dimas, 9.4), ev('PRICED', P.budi, 0.8)], version: 2,
    },
    {
      id: 'WO-2026-0121', woNo: 'WO-2026-0121', prNo: 'PR-2026-0045', type: 'PR', status: 'PENDING_MD',
      title: 'Large-format plotter — Drawing room', project: 'INT-004 · Office Facilities',
      division: 'Project Design', requiredBy: day(6), createdBy: who(P.rina),
      justification: 'The current plotter is out of support and jams on A0 sheets.',
      items: [
        { name: 'A0 plotter 36"', spec: '4-colour, network-ready', qty: 1, unit: 'unit', unitPrice: 78500000, vendor: 'PT Grafika Solusi' },
        { name: 'Ink cartridge set', spec: '4 colours, 130 ml', qty: 2, unit: 'set', unitPrice: 3250000, vendor: 'PT Grafika Solusi' },
      ],
      events: [
        ev('SUBMITTED', P.rina, 70.3), ev('PRICED', P.budi, 52.6),
        ev('APPROVED', P.andi, 20.4, 'Needed for the Q4 drawing workload.'),
      ],
      version: 3,
    },
    {
      id: 'WO-2026-0119', woNo: 'WO-2026-0119', prNo: 'PR-2026-0044', type: 'PR', status: 'PENDING_MD',
      title: 'Split duct AC 5 PK — Warehouse office', project: 'PRJ-028 · Warehouse Expansion',
      division: 'Supply Chain', requiredBy: day(3), createdBy: who(P.dimas),
      justification: 'Existing units fail daily; staff are working in 33°C+ heat.',
      items: [
        { name: 'Split duct AC 5 PK', spec: 'Inverter, R32', qty: 2, unit: 'unit', unitPrice: 48750000, vendor: 'PT Sejuk Mandiri' },
        { name: 'Installation & piping', spec: 'Incl. ducting up to 15 m', qty: 1, unit: 'lot', unitPrice: 18600000, vendor: 'PT Sejuk Mandiri' },
      ],
      events: [
        ev('SUBMITTED', P.dimas, 140), ev('PRICED', P.budi, 121.5),
        ev('APPROVED', P.andi, 74.2, 'Urgent. Within the facilities budget.'),
      ],
      version: 3,
    },
    {
      id: 'WO-2026-0116', woNo: 'WO-2026-0116', prNo: 'PR-2026-0043', type: 'PR', status: 'APPROVED',
      title: '3D rendering workstations (2 units)', project: 'INT-004 · Office Facilities',
      division: 'Project Design', requiredBy: day(-2), createdBy: who(P.rina),
      justification: 'Rendering times on current machines are delaying client presentations.',
      items: [
        { name: 'Rendering workstation', spec: 'RTX-class GPU, 64 GB RAM, 2 TB SSD', qty: 2, unit: 'unit', unitPrice: 42800000, vendor: 'PT Komputindo' },
        { name: '27" 4K monitor', spec: 'Colour-calibrated', qty: 2, unit: 'unit', unitPrice: 5200000, vendor: 'PT Komputindo' },
      ],
      events: [
        ev('SUBMITTED', P.rina, 192), ev('PRICED', P.budi, 171),
        ev('APPROVED', P.andi, 149, 'Approved.'), ev('APPROVED', P.sari, 26.5, 'Go ahead.'),
      ],
      version: 4,
    },
    {
      id: 'WO-2026-0112', woNo: 'WO-2026-0112', prNo: 'PR-2026-0041', type: 'PR', status: 'APPROVED',
      title: 'Vinyl wallpaper — Client lounge', project: 'PRJ-031 · Showroom Renovation',
      division: 'Supply Chain', requiredBy: day(-4), createdBy: who(P.dimas),
      justification: 'Finishing material for the client lounge redesign.',
      items: [
        { name: 'Vinyl wallpaper', spec: 'Textured linen, 10 m roll', qty: 18, unit: 'roll', unitPrice: 865000, vendor: 'CV Dekorindo' },
      ],
      events: [
        ev('SUBMITTED', P.dimas, 221), ev('PRICED', P.budi, 204),
        ev('APPROVED', P.andi, 189), ev('APPROVED', P.sari, 100.5),
      ],
      version: 4,
    },
    {
      id: 'WO-2026-0118', woNo: 'WO-2026-0118', prNo: 'PR-2026-0042', type: 'PR', status: 'REJECTED',
      title: 'Decorative pendant lamps — Lobby', project: 'PRJ-031 · Showroom Renovation',
      division: 'Project Design', requiredBy: day(8), createdBy: who(P.rina),
      justification: 'Statement lighting for the renovated lobby.',
      items: [
        { name: 'Pendant lamp', spec: 'Brass finish, Ø45 cm', qty: 12, unit: 'unit', unitPrice: 4850000, vendor: 'Lumina Studio' },
      ],
      events: [
        ev('SUBMITTED', P.rina, 162), ev('PRICED', P.budi, 141),
        ev('APPROVED', P.andi, 111, 'OK from design side.'),
        ev('REJECTED', P.sari, 50.3, 'Over the lobby lighting budget. Please propose a lower-cost alternative.'),
      ],
      version: 4,
    },
  ];
}
