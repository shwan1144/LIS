import type { Lab } from '../entities/lab.entity';
import type { HostScope } from '../tenant/host-scope.enum';

declare global {
  namespace Express {
    interface Request {
      tenantHost?: string;
      hostScope?: HostScope;
      tenantSubdomain?: string | null;
      labId?: string | null;
      lab?: Lab | null;
    }
  }
}

export {};

