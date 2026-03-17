export interface JwtPayload {
    sub: string;
    username: string;
    labId: string;
    role: string;
    subLabId?: string | null;
    tokenType?: 'lab_access' | 'lab_impersonation_access';
    platformUserId?: string;
}
