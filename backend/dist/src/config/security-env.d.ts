export declare function isProductionEnv(): boolean;
export declare function requireSecret(envName: string, devFallback: string, source: string): string;
export declare function assertRequiredProductionEnv(envNames: string[], source: string): void;
