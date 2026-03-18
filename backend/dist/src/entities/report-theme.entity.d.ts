import { Lab } from './lab.entity';
export declare class ReportTheme {
    id: string;
    labId: string;
    lab: Lab;
    name: string;
    reportStyle: any;
    reportBranding: any;
    onlineResultWatermarkDataUrl: string | null;
    onlineResultWatermarkText: string | null;
    createdAt: Date;
    updatedAt: Date;
}
