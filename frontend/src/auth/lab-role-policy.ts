export type LabUserRole =
  | 'SUPER_ADMIN'
  | 'LAB_ADMIN'
  | 'RECEPTION'
  | 'TECHNICIAN'
  | 'VERIFIER'
  | 'DOCTOR'
  | 'INSTRUMENT_SERVICE'
  | string;

const ADMIN_ROLES = new Set(['LAB_ADMIN', 'SUPER_ADMIN']);

const PATH_PREFIXES_BY_ROLE: Record<string, readonly string[]> = {
  RECEPTION: ['/orders', '/patients'],
  TECHNICIAN: ['/worklist'],
  VERIFIER: ['/verification'],
  DOCTOR: ['/reports'],
  INSTRUMENT_SERVICE: ['/settings/instruments'],
};

type LabAction =
  | 'orders.force_remove_locked_tests'
  | 'worklist.edit_verified_result'
  | 'reports.edit_results';

function normalizePath(pathname: string): string {
  const raw = String(pathname || '/').trim();
  if (!raw) return '/';
  if (raw === '/') return '/';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function isPathMatch(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAdminRole(role: LabUserRole | null | undefined): boolean {
  return typeof role === 'string' && ADMIN_ROLES.has(role);
}

export function getDefaultRouteForRole(role: LabUserRole | null | undefined): string {
  if (isAdminRole(role)) return '/';
  if (role === 'RECEPTION') return '/orders';
  if (role === 'TECHNICIAN') return '/worklist';
  if (role === 'VERIFIER') return '/verification';
  if (role === 'DOCTOR') return '/reports';
  if (role === 'INSTRUMENT_SERVICE') return '/settings/instruments';
  return '/orders';
}

export function canAccessPath(role: LabUserRole | null | undefined, pathname: string): boolean {
  if (isAdminRole(role)) return true;
  if (!role) return false;

  const normalizedPath = normalizePath(pathname);
  if (normalizedPath === '/') return false;

  const allowedPrefixes = PATH_PREFIXES_BY_ROLE[role] ?? [];
  return allowedPrefixes.some((prefix) => isPathMatch(normalizedPath, prefix));
}

export function canAccessAction(role: LabUserRole | null | undefined, action: LabAction): boolean {
  if (isAdminRole(role)) {
    return true;
  }

  if (!role) {
    return false;
  }

  switch (action) {
    case 'orders.force_remove_locked_tests':
    case 'worklist.edit_verified_result':
    case 'reports.edit_results':
      return false;
    default:
      return false;
  }
}
