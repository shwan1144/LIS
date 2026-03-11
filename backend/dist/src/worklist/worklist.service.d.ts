import { Repository } from 'typeorm';
import { CultureResultPayload, OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Test } from '../entities/test.entity';
import { Antibiotic } from '../entities/antibiotic.entity';
import { Lab } from '../entities/lab.entity';
import { TestAntibiotic } from '../entities/test-antibiotic.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import type { TestCultureConfig, TestParameterDefinition, TestResultEntryType, TestResultTextOption } from '../entities/test.entity';
import { AuditService } from '../audit/audit.service';
import { PanelStatusService } from '../panels/panel-status.service';
import { LabActorContext } from '../types/lab-actor-context';
export interface WorklistItem {
    id: string;
    testId: string;
    orderNumber: string;
    patientName: string;
    patientSex: string | null;
    patientAge: number | null;
    patientAgeDisplay: string | null;
    testCode: string;
    testName: string;
    testAbbreviation: string | null;
    testType: 'SINGLE' | 'PANEL';
    testUnit: string | null;
    normalMin: number | null;
    normalMax: number | null;
    normalText: string | null;
    resultEntryType: TestResultEntryType;
    resultTextOptions: TestResultTextOption[] | null;
    allowCustomResultText: boolean;
    cultureConfig: TestCultureConfig | null;
    cultureAntibioticIds: string[];
    tubeType: string | null;
    status: OrderTestStatus;
    resultValue: number | null;
    resultText: string | null;
    flag: ResultFlag | null;
    cultureResult: CultureResultPayload | null;
    resultedAt: Date | null;
    resultedBy: string | null;
    verifiedAt: Date | null;
    verifiedBy: string | null;
    registeredAt: Date;
    orderId: string;
    sampleId: string;
    parentOrderTestId: string | null;
    departmentId: string | null;
    departmentCode: string | null;
    departmentName: string | null;
    parameterDefinitions: TestParameterDefinition[] | null;
    resultParameters: Record<string, string> | null;
    rejectionReason: string | null;
    panelSortOrder: number | null;
}
export declare enum WorklistView {
    FULL = "full",
    VERIFY = "verify"
}
export declare enum WorklistOrderMode {
    ENTRY = "entry",
    VERIFY = "verify"
}
export declare enum WorklistEntryStatus {
    PENDING = "pending",
    COMPLETED = "completed"
}
export declare enum WorklistVerificationStatus {
    UNVERIFIED = "unverified",
    VERIFIED = "verified"
}
export interface WorklistOrderSummaryItem {
    orderId: string;
    orderNumber: string;
    registeredAt: Date;
    patientName: string;
    patientSex: string | null;
    patientAge: number | null;
    patientAgeDisplay: string | null;
    progressTotalRoot: number;
    progressPending: number;
    progressCompleted: number;
    progressVerified: number;
    progressRejected: number;
    firstRejectedReason: string | null;
    hasEnterable: boolean;
    hasVerifiable: boolean;
}
export interface WorklistOrderTestsPayload {
    orderId: string;
    orderNumber: string;
    registeredAt: Date;
    patientName: string;
    patientSex: string | null;
    patientAge: number | null;
    patientAgeDisplay: string | null;
    items: WorklistItem[];
}
export interface CultureEntryHistoryDto {
    microorganisms: string[];
    conditions: string[];
    colonyCounts: string[];
}
export declare class WorklistService {
    private readonly orderTestRepo;
    private readonly orderRepo;
    private readonly testRepo;
    private readonly testAntibioticRepo;
    private readonly antibioticRepo;
    private readonly labRepo;
    private readonly userDeptRepo;
    private readonly departmentRepo;
    private readonly panelStatusService;
    private readonly auditService;
    private static readonly CULTURE_HISTORY_MAX_ITEMS;
    private static readonly CULTURE_HISTORY_MAX_VALUE_LENGTH;
    private readonly logger;
    private readonly worklistPerfLogThresholdMs;
    constructor(orderTestRepo: Repository<OrderTest>, orderRepo: Repository<Order>, testRepo: Repository<Test>, testAntibioticRepo: Repository<TestAntibiotic>, antibioticRepo: Repository<Antibiotic>, labRepo: Repository<Lab>, userDeptRepo: Repository<UserDepartmentAssignment>, departmentRepo: Repository<Department>, panelStatusService: PanelStatusService, auditService: AuditService);
    getWorklist(labId: string, params: {
        status?: OrderTestStatus[];
        search?: string;
        date?: string;
        departmentId?: string;
        page?: number;
        size?: number;
        view?: WorklistView;
    }, userId?: string): Promise<{
        items: WorklistItem[];
        total: number;
    }>;
    getWorklistOrders(labId: string, params: {
        search?: string;
        date?: string;
        departmentId?: string;
        page?: number;
        size?: number;
        mode?: WorklistOrderMode;
        entryStatus?: WorklistEntryStatus;
        verificationStatus?: WorklistVerificationStatus;
    }, userId?: string): Promise<{
        items: WorklistOrderSummaryItem[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getWorklistOrderTests(orderId: string, labId: string, params: {
        mode?: WorklistOrderMode;
        departmentId?: string;
    }, userId?: string): Promise<WorklistOrderTestsPayload>;
    getWorklistItemDetail(orderTestId: string, labId: string, userId?: string): Promise<WorklistItem>;
    getCultureEntryHistory(labId: string): Promise<CultureEntryHistoryDto>;
    enterResult(orderTestId: string, labId: string, actor: LabActorContext, data: {
        resultValue?: number | null;
        resultText?: string | null;
        comments?: string | null;
        resultParameters?: Record<string, string> | null;
        cultureResult?: CultureResultPayload | null;
        forceEditVerified?: boolean;
    }, actorRole?: string): Promise<OrderTest>;
    batchEnterResults(labId: string, actor: LabActorContext, actorRole: string | undefined, updates: Array<{
        orderTestId: string;
        resultValue?: number | null;
        resultText?: string | null;
        comments?: string | null;
        resultParameters?: Record<string, string> | null;
        cultureResult?: CultureResultPayload | null;
        forceEditVerified?: boolean;
    }>): Promise<OrderTest[]>;
    verifyResult(orderTestId: string, labId: string, actor: LabActorContext): Promise<OrderTest>;
    verifyMultiple(orderTestIds: string[], labId: string, actor: LabActorContext): Promise<{
        verified: number;
        failed: number;
    }>;
    rejectResult(orderTestId: string, labId: string, actor: LabActorContext, reason: string): Promise<OrderTest>;
    private getAllowedDepartmentIdsForUser;
    private mapRawWorklistItem;
    private normalizeResultEntryType;
    private normalizeResultText;
    private normalizeResultTextOptions;
    private normalizeCultureConfig;
    private normalizeCultureResultFromStorage;
    private summarizeCultureResult;
    private normalizeCultureResultInput;
    private appendCultureEntryHistorySafe;
    private appendCultureEntryHistory;
    private collectCultureEntryHistory;
    private normalizeCultureEntryHistory;
    private normalizeHistoryList;
    private prependUniqueHistoryValues;
    private areHistoryArraysEqual;
    private attachCultureAntibioticIds;
    private findMatchingResultTextOption;
    private resolveFlagFromResultText;
    private toResultFlag;
    private toResultTextOptionFlag;
    private calculateFlag;
    private computePatientAgeYears;
    private computePatientAgeSnapshot;
    private resolveWorklistPerfLogThresholdMs;
    private elapsedMs;
    getWorklistStats(labId: string): Promise<{
        pending: number;
        completed: number;
        verified: number;
        rejected: number;
    }>;
    private getLabTimeZone;
    private getDateRangeOrThrow;
    private syncOrderStatus;
}
