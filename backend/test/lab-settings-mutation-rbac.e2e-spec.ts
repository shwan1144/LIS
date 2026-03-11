import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/auth/roles.guard';
import { TestsController } from '../src/tests/tests.controller';
import { ShiftsController } from '../src/shifts/shifts.controller';
import { DepartmentsController } from '../src/departments/departments.controller';
import { InstrumentsController } from '../src/instruments/instruments.controller';
import { AntibioticsController } from '../src/antibiotics/antibiotics.controller';
import { UnmatchedResultsController } from '../src/unmatched/unmatched-results.controller';

type LabRole = 'SUPER_ADMIN' | 'LAB_ADMIN' | 'TECHNICIAN' | undefined;
type ControllerType = new (...args: never[]) => object;

function buildContext(
  controller: ControllerType,
  handlerName: string,
  role: LabRole,
): ExecutionContext {
  const handler = (controller as unknown as { prototype: Record<string, unknown> }).prototype[
    handlerName
  ] as (...args: unknown[]) => unknown;
  const reqUser = role ? { role } : undefined;

  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: reqUser }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getClass: () => controller,
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('Lab settings mutation RBAC (e2e-style)', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it('blocks TECHNICIAN from tests mutation endpoint', () => {
    const ctx = buildContext(TestsController, 'create', 'TECHNICIAN');
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows TECHNICIAN on tests read endpoint without role metadata', () => {
    const ctx = buildContext(TestsController, 'findAll', 'TECHNICIAN');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows LAB_ADMIN on protected settings mutation endpoints', () => {
    const contexts = [
      buildContext(ShiftsController, 'create', 'LAB_ADMIN'),
      buildContext(DepartmentsController, 'update', 'LAB_ADMIN'),
      buildContext(InstrumentsController, 'simulateMessage', 'LAB_ADMIN'),
      buildContext(AntibioticsController, 'create', 'LAB_ADMIN'),
      buildContext(UnmatchedResultsController, 'resolve', 'LAB_ADMIN'),
    ];

    for (const ctx of contexts) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('blocks TECHNICIAN on protected settings mutation endpoints', () => {
    const contexts = [
      buildContext(ShiftsController, 'create', 'TECHNICIAN'),
      buildContext(DepartmentsController, 'update', 'TECHNICIAN'),
      buildContext(InstrumentsController, 'simulateMessage', 'TECHNICIAN'),
      buildContext(AntibioticsController, 'create', 'TECHNICIAN'),
      buildContext(UnmatchedResultsController, 'resolve', 'TECHNICIAN'),
    ];

    for (const ctx of contexts) {
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    }
  });
});

