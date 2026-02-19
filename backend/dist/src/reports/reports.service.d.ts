import { type OnModuleDestroy } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { User } from '../entities/user.entity';
export interface PublicResultTestItem {
    orderTestId: string;
    testCode: string;
    testName: string;
    departmentName: string;
    status: string;
    isVerified: boolean;
    hasResult: boolean;
    resultValue: string | null;
    unit: string | null;
    verifiedAt: string | null;
}
export interface PublicResultStatus {
    orderId: string;
    orderNumber: string;
    patientName: string;
    labName: string;
    onlineResultWatermarkText: string | null;
    registeredAt: string;
    paymentStatus: string;
    reportableCount: number;
    verifiedCount: number;
    progressPercent: number;
    ready: boolean;
    verifiedAt: string | null;
    tests: PublicResultTestItem[];
}
export declare class ReportsService implements OnModuleDestroy {
    private readonly orderRepo;
    private readonly orderTestRepo;
    private readonly patientRepo;
    private readonly labRepo;
    private readonly userRepo;
    private browserPromise;
    constructor(orderRepo: Repository<Order>, orderTestRepo: Repository<OrderTest>, patientRepo: Repository<Patient>, labRepo: Repository<Lab>, userRepo: Repository<User>);
    private getBrowser;
    private renderPdfFromHtml;
    onModuleDestroy(): Promise<void>;
    private decodeImageDataUrl;
    private applyFallbackPageBranding;
    private getReportableOrderTests;
    private loadOrderResultsSnapshot;
    getPublicResultStatus(orderId: string): Promise<PublicResultStatus>;
    generatePublicTestResultsPDF(orderId: string): Promise<Buffer>;
    generateOrderReceiptPDF(orderId: string, labId: string): Promise<Buffer>;
    generateTestResultsPDF(orderId: string, labId: string): Promise<Buffer>;
    private renderTestResultsFallbackPDF;
}
