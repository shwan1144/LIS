"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAB_ROLE_GROUPS = exports.LAB_ROLES = void 0;
exports.hasLabRole = hasLabRole;
exports.resolveWorklistLaneFromMode = resolveWorklistLaneFromMode;
exports.resolveWorklistLaneFromView = resolveWorklistLaneFromView;
exports.canAccessWorklistLane = canAccessWorklistLane;
exports.assertWorklistModeAllowed = assertWorklistModeAllowed;
exports.assertWorklistViewAllowed = assertWorklistViewAllowed;
const common_1 = require("@nestjs/common");
exports.LAB_ROLES = [
    'SUPER_ADMIN',
    'LAB_ADMIN',
    'RECEPTION',
    'TECHNICIAN',
    'VERIFIER',
    'DOCTOR',
    'INSTRUMENT_SERVICE',
];
const ADMIN = ['LAB_ADMIN', 'SUPER_ADMIN'];
const ORDERS_WORKFLOW = ['RECEPTION', ...ADMIN];
const ORDERS_HISTORY_READ = ['DOCTOR', ...ORDERS_WORKFLOW];
const PATIENTS = ORDERS_WORKFLOW;
const WORKLIST_ENTRY = ['TECHNICIAN', ...ADMIN];
const WORKLIST_VERIFY = ['VERIFIER', ...ADMIN];
const WORKLIST_LANE_READ = ['TECHNICIAN', 'VERIFIER', ...ADMIN];
const WORKLIST_STATS_READ = ['TECHNICIAN', 'VERIFIER', 'DOCTOR', ...ADMIN];
const REPORTS = ['DOCTOR', ...ADMIN];
const INSTRUMENTS = ['INSTRUMENT_SERVICE', ...ADMIN];
const TESTS_READ = ['RECEPTION', 'INSTRUMENT_SERVICE', ...ADMIN];
const DEPARTMENTS_READ = ['RECEPTION', 'TECHNICIAN', 'VERIFIER', ...ADMIN];
const SHIFTS_READ = ['RECEPTION', ...ADMIN];
const ANTIBIOTICS_READ = ['TECHNICIAN', 'VERIFIER', ...ADMIN];
const SETTINGS_LAB_READ = ['RECEPTION', 'DOCTOR', ...ADMIN];
exports.LAB_ROLE_GROUPS = {
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
};
function hasLabRole(role, allowedRoles) {
    if (!role) {
        return false;
    }
    return allowedRoles.includes(role);
}
function resolveWorklistLaneFromMode(mode) {
    return String(mode ?? '')
        .trim()
        .toLowerCase() === 'verify'
        ? 'verify'
        : 'entry';
}
function resolveWorklistLaneFromView(view) {
    return String(view ?? '')
        .trim()
        .toLowerCase() === 'verify'
        ? 'verify'
        : 'entry';
}
function canAccessWorklistLane(role, lane) {
    const allowed = lane === 'verify' ? exports.LAB_ROLE_GROUPS.WORKLIST_VERIFY : exports.LAB_ROLE_GROUPS.WORKLIST_ENTRY;
    return hasLabRole(role, allowed);
}
function assertWorklistModeAllowed(role, mode) {
    const lane = resolveWorklistLaneFromMode(mode);
    if (!canAccessWorklistLane(role, lane)) {
        throw new common_1.ForbiddenException(lane === 'verify'
            ? 'Insufficient permissions for verification mode'
            : 'Insufficient permissions for result-entry mode');
    }
}
function assertWorklistViewAllowed(role, view) {
    const lane = resolveWorklistLaneFromView(view);
    if (!canAccessWorklistLane(role, lane)) {
        throw new common_1.ForbiddenException(lane === 'verify'
            ? 'Insufficient permissions for verification view'
            : 'Insufficient permissions for entry view');
    }
}
//# sourceMappingURL=lab-role-matrix.js.map