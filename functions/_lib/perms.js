// Roles follow the requirements document (section 5). The owner may do everything.
// Health details (a client's own words about their condition) are visible only to roles with health.view.
export const ROLES = {
  owner: 'Owner / Director',
  supervisor: 'Operations supervisor',
  coordinator: 'Care coordinator',
  finance: 'Finance officer',
  network: 'Network manager',
  compliance: 'Compliance / audit',
  management: 'Management (read-only)',
  admin: 'System administrator'
};

const GRANTS = {
  owner: '*',
  supervisor: ['dashboard', 'cases.view', 'cases.edit', 'cases.assign', 'cases.close', 'health.view', 'clients.view', 'clients.edit', 'clients.export', 'providers.view', 'billing.view', 'billing.create', 'accounts.view', 'services.view', 'tasks.view', 'tasks.edit', 'audit.view', 'reports.view'],
  coordinator: ['dashboard', 'cases.view', 'cases.edit', 'cases.close', 'health.view', 'clients.view', 'clients.edit', 'providers.view', 'billing.view', 'billing.create', 'services.view', 'tasks.view', 'tasks.edit'],
  finance: ['dashboard', 'cases.view', 'clients.view', 'billing.view', 'billing.create', 'billing.manage', 'accounts.view', 'accounts.export', 'services.view', 'services.edit', 'reports.view'],
  network: ['dashboard', 'providers.view', 'providers.edit', 'providers.verify', 'services.view', 'tasks.view'],
  compliance: ['dashboard', 'audit.view', 'clients.view', 'providers.view', 'accounts.view', 'services.view'],
  management: ['dashboard', 'accounts.view', 'providers.view', 'services.view', 'reports.view'],
  admin: ['dashboard', 'settings.view', 'settings.edit', 'staff.edit', 'audit.view', 'services.view']
};

export function can(staff, perm) {
  const g = GRANTS[staff && staff.role];
  return g === '*' || (Array.isArray(g) && g.includes(perm));
}
export function permsFor(role) {
  const g = GRANTS[role];
  return g === '*' ? ['*'] : g || [];
}
