import { type OnModuleDestroy } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { User } from '../entities/user.entity';
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
    generateOrderReceiptPDF(orderId: string, labId: string): Promise<Buffer>;
    generateTestResultsPDF(orderId: string, labId: string): Promise<Buffer>;
    private renderTestResultsFallbackPDF;
}
