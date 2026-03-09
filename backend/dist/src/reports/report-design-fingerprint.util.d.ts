type ReportBrandingShape = {
    bannerDataUrl?: string | null;
    footerDataUrl?: string | null;
    logoDataUrl?: string | null;
    watermarkDataUrl?: string | null;
};
type ReportDesignFingerprintInput = {
    reportBranding?: ReportBrandingShape | null;
    reportStyle?: unknown;
};
export declare function buildReportDesignFingerprint(input: ReportDesignFingerprintInput): string;
export {};
