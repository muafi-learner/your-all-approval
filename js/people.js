// Dummy directory and the "current demo user" (stands in for login).
import { KEYS } from './config.js';
import { store } from './storage.js';

export const PEOPLE = {
  rina:  { id: 'U-SPV-01', name: 'Rina Wijaya',   role: 'SPV',     title: 'Supervisor',        division: 'Project Design' },
  dimas: { id: 'U-SPV-02', name: 'Dimas Prakoso', role: 'SPV',     title: 'Supervisor',        division: 'Supply Chain' },
  budi:  { id: 'U-SCM-01', name: 'Budi Santoso',  role: 'SCM',     title: 'SCM Staff',         division: 'Supply Chain' },
  andi:  { id: 'U-MGR-01', name: 'Andi Pratama',  role: 'MANAGER', title: 'Manager',           division: 'Project Design' },
  sari:  { id: 'U-MD-01',  name: 'Sari Utami',    role: 'MD',      title: 'Managing Director', division: 'Head Office' },
};

/** Users available in the header switcher */
export const DEMO_USERS = [PEOPLE.rina, PEOPLE.budi, PEOPLE.andi, PEOPLE.sari];

/** Who holds each approval stage */
export const HOLDER_BY_ROLE = { SCM: PEOPLE.budi, MANAGER: PEOPLE.andi, MD: PEOPLE.sari };

/** Label printed above each signature on the PDF */
export const STAMP_LABEL = { SPV: 'Prepared by', SCM: 'Priced by', MANAGER: 'Reviewed by', MD: 'Approved by' };

export const DIVISIONS = ['Project Design', 'Supply Chain'];

const DEFAULT_USER = PEOPLE.andi;

/** The subset of a person that gets stored inside documents */
export const personRef = (p) => ({ id: p.id, name: p.name, role: p.role, title: p.title });

export const findUser = (id) => DEMO_USERS.find((u) => u.id === id) || null;
export const firstUserWithRole = (role) => DEMO_USERS.find((u) => u.role === role) || null;

export function getCurrentUser() {
  return findUser(store.get(KEYS.user)) || DEFAULT_USER;
}

export function setCurrentUser(id) {
  const user = findUser(id) || DEFAULT_USER;
  store.set(KEYS.user, user.id);
  return user;
}
