import { ForbiddenException } from '@nestjs/common';
import {
  assertWorklistModeAllowed,
  assertWorklistViewAllowed,
  canAccessWorklistLane,
  resolveWorklistLaneFromMode,
  resolveWorklistLaneFromView,
} from './lab-role-matrix';

describe('lab-role-matrix worklist gating', () => {
  it('resolves mode and view lane correctly', () => {
    expect(resolveWorklistLaneFromMode('entry')).toBe('entry');
    expect(resolveWorklistLaneFromMode('verify')).toBe('verify');
    expect(resolveWorklistLaneFromMode(undefined)).toBe('entry');

    expect(resolveWorklistLaneFromView('full')).toBe('entry');
    expect(resolveWorklistLaneFromView('verify')).toBe('verify');
    expect(resolveWorklistLaneFromView(undefined)).toBe('entry');
  });

  it('allows TECHNICIAN only in entry lane', () => {
    expect(canAccessWorklistLane('TECHNICIAN', 'entry')).toBe(true);
    expect(canAccessWorklistLane('TECHNICIAN', 'verify')).toBe(false);

    expect(() => assertWorklistModeAllowed('TECHNICIAN', 'entry')).not.toThrow();
    expect(() => assertWorklistViewAllowed('TECHNICIAN', 'full')).not.toThrow();
    expect(() => assertWorklistModeAllowed('TECHNICIAN', 'verify')).toThrow(ForbiddenException);
    expect(() => assertWorklistViewAllowed('TECHNICIAN', 'verify')).toThrow(ForbiddenException);
  });

  it('allows VERIFIER only in verify lane', () => {
    expect(canAccessWorklistLane('VERIFIER', 'entry')).toBe(false);
    expect(canAccessWorklistLane('VERIFIER', 'verify')).toBe(true);

    expect(() => assertWorklistModeAllowed('VERIFIER', 'verify')).not.toThrow();
    expect(() => assertWorklistViewAllowed('VERIFIER', 'verify')).not.toThrow();
    expect(() => assertWorklistModeAllowed('VERIFIER', 'entry')).toThrow(ForbiddenException);
    expect(() => assertWorklistViewAllowed('VERIFIER', 'full')).toThrow(ForbiddenException);
  });

  it('allows admins in both lanes', () => {
    expect(() => assertWorklistModeAllowed('LAB_ADMIN', 'entry')).not.toThrow();
    expect(() => assertWorklistModeAllowed('LAB_ADMIN', 'verify')).not.toThrow();
    expect(() => assertWorklistViewAllowed('SUPER_ADMIN', 'full')).not.toThrow();
    expect(() => assertWorklistViewAllowed('SUPER_ADMIN', 'verify')).not.toThrow();
  });
});
