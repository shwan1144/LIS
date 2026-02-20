import { Repository } from 'typeorm';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Test } from '../entities/test.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import type { TestParameterDefinition } from '../entities/test.entity';
import { AuditService } from '../audit/audit.service';
import { PanelStatusService } from '../panels/panel-status.service';
import { LabActorContext } from '../types/lab-actor-context';
export interface WorklistItem {
    id: string;
    orderNumber: string;
    patientName: string;
    patientSex: string | null;
    patientAge: number | null;
    testCode: string;
    testName: string;
    testUnit: string | null;
    normalMin: number | null;
    normalMax: number | null;
    normalText: string | null;
    tubeType: string | null;
    status: OrderTestStatus;
    resultValue: number | null;
    resultText: string | null;
    flag: ResultFlag | null;
    resultedAt: Date | null;
    resultedBy: string | null;
    verifiedAt: Date | null;
    verifiedBy: string | null;
    registeredAt: Date;
    orderId: string;
    sampleId: string;
    departmentId: string | null;
    departmentCode: string | null;
    departmentName: string | null;
    parameterDefinitions: TestParameterDefinition[] | null;
    resultParameters: Record<string, string> | null;
}
export declare class WorklistService {
    private readonly orderTestRepo;
    private readonly orderRepo;
    private readonly testRepo;
    private readonly userDeptRepo;
    private readonly departmentRepo;
    private readonly panelStatusService;
    private readonly auditService;
    constructor(orderTestRepo: Repository<OrderTest>, orderRepo: Repository<Order>, testRepo: Repository<Test>, userDeptRepo: Repository<UserDepartmentAssignment>, departmentRepo: Repository<Department>, panelStatusService: PanelStatusService, auditService: AuditService);
    getWorklist(labId: string, params: {
        status?: OrderTestStatus[];
        search?: string;
        date?: string;
        departmentId?: string;
        page?: number;
        size?: number;
    }, userId?: string): Promise<{
        items: WorklistItem[];
        total: number;
    }>;
    enterResult(orderTestId: string, labId: string, actor: LabActorContext, data: {
        resultValue?: number | null;
        resultText?: string | null;
        comments?: string | null;
        resultParameters?: Record<string, string> | null;
    }): Promise<OrderTest>;
    verifyResult(orderTestId: string, labId: string, actor: LabActorContext): Promise<OrderTest>;
    verifyMultiple(orderTestIds: string[], labId: string, actor: LabActorContext): Promise<{
        verified: number;
        failed: number;
    }>;
    rejectResult(orderTestId: string, labId: string, actor: LabActorContext, reason: string): Promise<OrderTest>;
    private calculateFlag;
    getWorklistStats(labId: string): Promise<{
        pending: number;
        completed: number;
        verified: number;
        rejected: number;
    }>;
    private syncOrderStatus;
}
