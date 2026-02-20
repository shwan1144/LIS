export interface JwtPayload {
  sub: string;
  username: string;
  labId: string;
  role: string;
  tokenType?: 'lab_access' | 'lab_impersonation_access';
  platformUserId?: string;
}
