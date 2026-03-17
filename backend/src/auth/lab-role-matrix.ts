import { ForbiddenException } from '@nestjs/common';

export const LAB_ROLES = [
  'SUPER_ADMIN',
  'LAB_ADMIN',
  'RECEPTION',
  'TECHNICIAN',
  'VERIFIER',
  'DOCTOR',
  'INSTRUMENT_SERVICE',
  'SUB_LAB',
] as const;

export type LabRole = (typeof LAB_ROLES)[number];

const ADMIN = ['LAB_ADMIN', 'SUPER_ADMIN'] as const;
const ORDERS_WORKFLOW = ['RECEPTION', ...ADMIN] as const;
const ORDERS_HISTORY_READ = ['DOCTOR', ...ORDERS_WORKFLOW] as const;
const PATIENTS = ORDERS_WORKFLOW;
const WORKLIST_ENTRY = ['TECHNICIAN', ...ADMIN] as const;
const WORKLIST_VERIFY = ['VERIFIER', ...ADMIN] as const;
const WORKLIST_LANE_READ = ['TECHNICIAN', 'VERIFIER', ...ADMIN] as const;
const WORKLIST_STATS_READ = ['TECHNICIAN', 'VERIFIER', 'DOCTOR', ...ADMIN] as const;
const REPORTS = ['DOCTOR', ...ADMIN] as const;
const INSTRUMENTS = ['INSTRUMENT_SERVICE', ...ADMIN] as const;
const TESTS_READ = ['RECEPTION', 'INSTRUMENT_SERVICE', ...ADMIN] as const;
const DEPARTMENTS_READ = ['RECEPTION', 'TECHNICIAN', 'VERIFIER', ...ADMIN] as const;
const SHIFTS_READ = ['RECEPTION', ...ADMIN] as const;
const ANTIBIOTICS_READ = ['TECHNICIAN', 'VERIFIER', ...ADMIN] as const;
const SETTINGS_LAB_READ = ['RECEPTION', 'DOCTOR', ...ADMIN] as const;
const SUB_LAB_PORTAL = ['SUB_LAB'] as const;

export const LAB_ROLE_GROUPS = {
  ADMIN,
  ORDERS_WORKFLOW,
  ORDERS_HISTORY_READ,
  PATIENTS,
  WORKLIST_ENTRY,
  WORKLIST_VERIFY,
  WORKLIST_LANE_READ,
  WORKLIST_STATS_READ,
  REPORTS,
  INSTRUMENTS,
  TESTS_READ,
  DEPARTMENTS_READ,
  SHIFTS_READ,
  ANTIBIOTICS_READ,
  SETTINGS_LAB_READ,
  SUB_LAB_PORTAL,
} as const;

export type WorklistLane = 'entry' | 'verify';

export function hasLabRole(
  role: string | null | undefined,
  allowedRoles: readonly string[],
): boolean {
  if (!role) {
    return false;
  }
  return allowedRoles.includes(role);
}

export function resolveWorklistLaneFromMode(mode: string | null | undefined): WorklistLane {
  return String(mode ?? '')
    .trim()
    .toLowerCase() === 'verify'
    ? 'verify'
    : 'entry';
}

export function resolveWorklistLaneFromView(view: string | null | undefined): WorklistLane {
  return String(view ?? '')
    .trim()
    .toLowerCase() === 'verify'
    ? 'verify'
    : 'entry';
}

export function canAccessWorklistLane(
  role: string | null | undefined,
  lane: WorklistLane,
): boolean {
  const allowed = lane === 'verify' ? LAB_ROLE_GROUPS.WORKLIST_VERIFY : LAB_ROLE_GROUPS.WORKLIST_ENTRY;
  return hasLabRole(role, allowed);
}

export function assertWorklistModeAllowed(
  role: string | null | undefined,
  mode: string | null | undefined,
): void {
  const lane = resolveWorklistLaneFromMode(mode);
  if (!canAccessWorklistLane(role, lane)) {
    throw new ForbiddenException(
      lane === 'verify'
        ? 'Insufficient permissions for verification mode'
        : 'Insufficient permissions for result-entry mode',
    );
  }
}

export function assertWorklistViewAllowed(
  role: string | null | undefined,
  view: string | null | undefined,
): void {
  const lane = resolveWorklistLaneFromView(view);
  if (!canAccessWorklistLane(role, lane)) {
    throw new ForbiddenException(
      lane === 'verify'
        ? 'Insufficient permissions for verification view'
        : 'Insufficient permissions for entry view',
    );
  }
}
