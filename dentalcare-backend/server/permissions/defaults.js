// permissions/defaults.js — افتراضيات صلاحيات الأدوار (مدمجة مع تخصيص العيادة)

const VALID_ROLES = ['OWNER', 'ACCOUNTANT', 'DOCTOR', 'RECEPTIONIST'];
const PERMISSION_KEYS = [
  'clinical', 'appointments', 'patients', 'doctors',
  'receipts', 'payments', 'journal', 'openingBalance', 'checks',
  'accounts', 'reports', 'admin', 'employees', 'users',
];
const VALID_LEVELS = ['none', 'view', 'edit'];

const BUILTIN_DEFAULTS = {
  OWNER: {
    clinical: 'edit', appointments: 'edit', receipts: 'edit', payments: 'edit', journal: 'edit', openingBalance: 'edit',
    patients: 'edit', doctors: 'edit', employees: 'edit', checks: 'edit', reports: 'view', accounts: 'edit',
    admin: 'edit', users: 'edit',
  },
  ACCOUNTANT: {
    clinical: 'none', appointments: 'none', receipts: 'edit', payments: 'edit', journal: 'edit', openingBalance: 'none',
    patients: 'edit', doctors: 'view', employees: 'edit', checks: 'edit', reports: 'view', accounts: 'edit',
    admin: 'view', users: 'none',
  },
  DOCTOR: {
    clinical: 'edit', appointments: 'edit', receipts: 'none', payments: 'none', journal: 'none', openingBalance: 'none',
    patients: 'view', doctors: 'none', employees: 'none', checks: 'none', reports: 'view', accounts: 'none',
    admin: 'none', users: 'none',
  },
  RECEPTIONIST: {
    clinical: 'none', appointments: 'edit', receipts: 'edit', payments: 'none', journal: 'none', openingBalance: 'none',
    patients: 'edit', doctors: 'none', employees: 'none', checks: 'view', reports: 'view', accounts: 'none',
    admin: 'view', users: 'none',
  },
};

function sanitizePermissionsOverride(overrides) {
  if (!overrides || typeof overrides !== 'object') return {};
  const clean = {};
  for (const key of PERMISSION_KEYS) {
    if (VALID_LEVELS.includes(overrides[key])) clean[key] = overrides[key];
  }
  return clean;
}

function sanitizeRoleDefaultsMap(raw) {
  const out = {};
  for (const role of VALID_ROLES) {
    const base = BUILTIN_DEFAULTS[role];
    const override = raw && typeof raw === 'object' ? raw[role] : null;
    out[role] = {
      ...base,
      ...sanitizePermissionsOverride(override),
    };
  }
  return out;
}

function mergeTenantDefaults(stored) {
  return sanitizeRoleDefaultsMap(stored || {});
}

module.exports = {
  VALID_ROLES,
  PERMISSION_KEYS,
  VALID_LEVELS,
  BUILTIN_DEFAULTS,
  sanitizePermissionsOverride,
  sanitizeRoleDefaultsMap,
  mergeTenantDefaults,
};
