import { LAB_ROLE_GROUPS, hasLabRole } from './lab-role-matrix';

describe('lab-role-matrix', () => {
  it('keeps admin bypass roles in every lane', () => {
    const lanes = Object.values(LAB_ROLE_GROUPS);
    for (const lane of lanes) {
      expect(hasLabRole('LAB_ADMIN', lane)).toBe(true);
      expect(hasLabRole('SUPER_ADMIN', lane)).toBe(true);
    }
  });

  it('allows reception only in order/patient/settings-lab lanes', () => {
    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.ORDERS_WORKFLOW)).toBe(true);
    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.ORDERS_HISTORY_READ)).toBe(true);
    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.PATIENTS)).toBe(true);
    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.SETTINGS_LAB_READ)).toBe(true);

    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.WORKLIST_ENTRY)).toBe(false);
    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.WORKLIST_VERIFY)).toBe(false);
    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.REPORTS)).toBe(false);
    expect(hasLabRole('RECEPTION', LAB_ROLE_GROUPS.INSTRUMENTS)).toBe(false);
  });

  it('allows technician only in entry lane related groups', () => {
    expect(hasLabRole('TECHNICIAN', LAB_ROLE_GROUPS.WORKLIST_ENTRY)).toBe(true);
    expect(hasLabRole('TECHNICIAN', LAB_ROLE_GROUPS.WORKLIST_LANE_READ)).toBe(true);
    expect(hasLabRole('TECHNICIAN', LAB_ROLE_GROUPS.WORKLIST_STATS_READ)).toBe(true);
    expect(hasLabRole('TECHNICIAN', LAB_ROLE_GROUPS.ANTIBIOTICS_READ)).toBe(true);

    expect(hasLabRole('TECHNICIAN', LAB_ROLE_GROUPS.WORKLIST_VERIFY)).toBe(false);
    expect(hasLabRole('TECHNICIAN', LAB_ROLE_GROUPS.REPORTS)).toBe(false);
    expect(hasLabRole('TECHNICIAN', LAB_ROLE_GROUPS.ORDERS_WORKFLOW)).toBe(false);
  });

  it('allows verifier only in verification lane related groups', () => {
    expect(hasLabRole('VERIFIER', LAB_ROLE_GROUPS.WORKLIST_VERIFY)).toBe(true);
    expect(hasLabRole('VERIFIER', LAB_ROLE_GROUPS.WORKLIST_LANE_READ)).toBe(true);
    expect(hasLabRole('VERIFIER', LAB_ROLE_GROUPS.WORKLIST_STATS_READ)).toBe(true);
    expect(hasLabRole('VERIFIER', LAB_ROLE_GROUPS.ANTIBIOTICS_READ)).toBe(true);

    expect(hasLabRole('VERIFIER', LAB_ROLE_GROUPS.WORKLIST_ENTRY)).toBe(false);
    expect(hasLabRole('VERIFIER', LAB_ROLE_GROUPS.REPORTS)).toBe(false);
    expect(hasLabRole('VERIFIER', LAB_ROLE_GROUPS.ORDERS_WORKFLOW)).toBe(false);
  });

  it('allows doctor only in reports and scoped read lanes', () => {
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.REPORTS)).toBe(true);
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.ORDERS_HISTORY_READ)).toBe(true);
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.WORKLIST_STATS_READ)).toBe(true);
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.SETTINGS_LAB_READ)).toBe(true);

    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.ORDERS_WORKFLOW)).toBe(false);
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.PATIENTS)).toBe(false);
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.WORKLIST_ENTRY)).toBe(false);
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.WORKLIST_VERIFY)).toBe(false);
    expect(hasLabRole('DOCTOR', LAB_ROLE_GROUPS.INSTRUMENTS)).toBe(false);
  });

  it('allows instrument-service only in instruments and tests read lanes', () => {
    expect(hasLabRole('INSTRUMENT_SERVICE', LAB_ROLE_GROUPS.INSTRUMENTS)).toBe(true);
    expect(hasLabRole('INSTRUMENT_SERVICE', LAB_ROLE_GROUPS.TESTS_READ)).toBe(true);

    expect(hasLabRole('INSTRUMENT_SERVICE', LAB_ROLE_GROUPS.ORDERS_WORKFLOW)).toBe(false);
    expect(hasLabRole('INSTRUMENT_SERVICE', LAB_ROLE_GROUPS.REPORTS)).toBe(false);
    expect(hasLabRole('INSTRUMENT_SERVICE', LAB_ROLE_GROUPS.WORKLIST_ENTRY)).toBe(false);
    expect(hasLabRole('INSTRUMENT_SERVICE', LAB_ROLE_GROUPS.WORKLIST_VERIFY)).toBe(false);
  });
});
