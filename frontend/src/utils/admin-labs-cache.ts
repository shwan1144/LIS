import { getAdminLabs, type AdminLabDto } from '../api/client';

let cachedAdminLabs: AdminLabDto[] | null = null;
let adminLabsPromise: Promise<AdminLabDto[]> | null = null;

export async function loadAdminLabs(options?: { force?: boolean }): Promise<AdminLabDto[]> {
  if (options?.force) {
    cachedAdminLabs = null;
  }

  if (cachedAdminLabs) {
    return cachedAdminLabs;
  }

  if (!adminLabsPromise) {
    adminLabsPromise = getAdminLabs()
      .then((items) => {
        cachedAdminLabs = items;
        return items;
      })
      .finally(() => {
        adminLabsPromise = null;
      });
  }

  return adminLabsPromise;
}

export function invalidateAdminLabsCache(): void {
  cachedAdminLabs = null;
}
