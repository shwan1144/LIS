import axios from 'axios';
import { getCurrentAuthScope, resolveApiBaseUrl, type AuthScope } from '../utils/tenant-scope';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // Don't add auth header if no token (e.g., login endpoint)
    delete config.headers.Authorization;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only handle 401 Unauthorized (not network errors or other status codes)
    if (err.response?.status === 401) {
      // Don't redirect if we're already on the login page
      if (window.location.pathname !== '/login') {
        sessionStorage.setItem('sessionExpired', '1');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        localStorage.removeItem('lab');
        localStorage.removeItem('authScope');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export interface LabLoginRequest {
  username: string;
  password: string;
}

export interface PlatformLoginRequest {
  email: string;
  password: string;
}

export interface LabDto {
  id: string;
  code: string;
  name: string;
  labelSequenceBy?: 'tube_type' | 'department';
  sequenceResetBy?: 'day' | 'shift';
  enableOnlineResults?: boolean;
  onlineResultWatermarkDataUrl?: string | null;
  onlineResultWatermarkText?: string | null;
  reportBranding?: ReportBrandingDto;
}

export interface ReportBrandingDto {
  bannerDataUrl: string | null;
  footerDataUrl: string | null;
  logoDataUrl: string | null;
  watermarkDataUrl: string | null;
}

export interface UserDto {
  id: string;
  username: string;
  fullName: string | null;
  role: string;
  isImpersonation?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: UserDto;
  lab: LabDto | null;
  scope: AuthScope;
}

export interface PlatformUserDto {
  id: string;
  email: string;
  role: string;
}

export interface PlatformLoginResponse {
  accessToken: string;
  platformUser: PlatformUserDto;
}

export async function loginLab(data: LabLoginRequest): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/login', data);
  return { ...res.data, scope: 'LAB', lab: res.data.lab };
}

export async function loginLabViaBridgeToken(data: { token: string }): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/portal-login', data);
  return { ...res.data, scope: 'LAB', lab: res.data.lab };
}

export async function loginPlatform(data: PlatformLoginRequest): Promise<LoginResponse> {
  const res = await api.post<PlatformLoginResponse>('/admin/auth/login', data);
  return {
    accessToken: res.data.accessToken,
    scope: 'PLATFORM',
    lab: null,
    user: {
      id: res.data.platformUser.id,
      username: res.data.platformUser.email,
      fullName: null,
      role: res.data.platformUser.role,
    },
  };
}

export async function login(data: LabLoginRequest): Promise<LoginResponse> {
  return getCurrentAuthScope() === 'PLATFORM'
    ? loginPlatform({ email: data.username, password: data.password })
    : loginLab(data);
}

export interface AdminLabDto {
  id: string;
  code: string;
  name: string;
  timezone: string;
  subdomain: string | null;
  isActive: boolean;
  usersCount?: number;
  orders30dCount?: number;
  createdAt: string;
}

export interface AdminLabsResult {
  items: AdminLabDto[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface CreateAdminLabRequest {
  code: string;
  name: string;
  subdomain?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface UpdateAdminLabRequest {
  code?: string;
  name?: string;
  subdomain?: string;
  timezone?: string;
}

export interface SetAdminLabStatusRequest {
  isActive: boolean;
  reason: string;
}

export interface AdminSummaryDto {
  labsCount: number;
  activeLabsCount: number;
  totalPatientsCount: number;
  ordersCount: number;
  ordersTodayCount: number;
  pendingResultsCount: number;
  completedTodayCount: number;
  dateRange: {
    from: string;
    to: string;
  };
  ordersTrend: Array<{
    date: string;
    ordersCount: number;
  }>;
  topTests: Array<{
    testId: string;
    testCode: string;
    testName: string;
    ordersCount: number;
    verifiedCount: number;
  }>;
  ordersByLab: Array<{
    labId: string;
    labCode: string;
    labName: string;
    ordersCount: number;
    totalTestsCount: number;
    verifiedTestsCount: number;
    pendingResultsCount: number;
    completionRate: number;
  }>;
  alerts: {
    inactiveLabs: Array<{
      labId: string;
      labCode: string;
      labName: string;
      lastOrderAt: string | null;
      daysSinceLastOrder: number | null;
    }>;
    highPendingLabs: Array<{
      labId: string;
      labCode: string;
      labName: string;
      pendingResultsCount: number;
      totalTestsCount: number;
      pendingRate: number;
    }>;
    failedLoginsLast24h: {
      totalCount: number;
      platformCount: number;
      labCount: number;
      byLab: Array<{
        labId: string;
        labCode: string;
        labName: string;
        failedCount: number;
      }>;
    };
  };
}

export interface AdminOrderListItem {
  id: string;
  labId: string;
  labCode: string | null;
  labName: string | null;
  orderNumber: string | null;
  status: 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  registeredAt: string;
  patientId: string;
  patientName: string | null;
  patientPhone: string | null;
  paymentStatus: string | null;
  finalAmount: number | null;
  testsCount: number;
  verifiedTestsCount: number;
  hasCriticalFlag: boolean;
  barcode: string | null;
}

export interface AdminOrderTestDetail {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';
  flag: 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN' | null;
  resultValue: number | null;
  resultText: string | null;
  verifiedAt: string | null;
  test: {
    id: string;
    code: string;
    name: string;
    unit: string | null;
  };
}

export interface AdminOrderSampleDetail {
  id: string;
  sampleId: string | null;
  tubeType: string | null;
  barcode: string | null;
  collectedAt: string | null;
  orderTests: AdminOrderTestDetail[];
}

export interface AdminOrderDetail {
  id: string;
  labId: string;
  orderNumber: string | null;
  status: 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  patientType: string;
  notes: string | null;
  paymentStatus: string;
  paidAmount: number | null;
  totalAmount: number;
  finalAmount: number;
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
  patient: {
    id: string;
    fullName: string;
    phone: string | null;
    nationalId: string | null;
    sex: string | null;
    dateOfBirth: string | null;
  };
  lab: {
    id: string;
    code: string;
    name: string;
    subdomain: string | null;
  };
  shift: { id: string; code: string; name: string | null } | null;
  samples: AdminOrderSampleDetail[];
  testsCount: number;
  verifiedTestsCount: number;
  completedTestsCount: number;
  pendingTestsCount: number;
  hasCriticalFlag: boolean;
  lastVerifiedAt: string | null;
}

export interface AdminOrdersResult {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface AdminAuditLogItem {
  id: string;
  actorType: 'LAB_USER' | 'PLATFORM_USER' | null;
  actorId: string | null;
  labId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    fullName: string | null;
  } | null;
  lab: {
    id: string;
    code: string;
    name: string;
    subdomain: string | null;
  } | null;
}

export interface AdminAuditLogResult {
  items: AdminAuditLogItem[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface AdminSystemHealthDto {
  status: 'ok' | 'degraded';
  checkedAt: string;
  uptimeSeconds: number;
  environment: string;
  db: {
    connected: boolean;
    serverTime: string | null;
    error: string | null;
  };
}

export interface AdminPlatformSettingsOverviewDto {
  branding: {
    logoUploadEnabled: boolean;
    themeColor: string;
  };
  securityPolicy: {
    sessionTimeoutMinutes: number;
    passwordMinLength: number;
    requireStrongPassword: boolean;
  };
  mfa: {
    mode: 'OPTIONAL' | 'REQUIRED';
    enabledAccounts: number;
    totalAccounts: number;
  };
}

export interface AdminImpersonationStatusDto {
  active: boolean;
  labId: string | null;
  lab: {
    id: string;
    code: string;
    name: string;
    subdomain: string | null;
    isActive: boolean;
  } | null;
}

export interface AdminImpersonationTokenResponse {
  accessToken: string;
  impersonation: AdminImpersonationStatusDto;
}

export interface AdminImpersonationOpenLabResponse {
  bridgeToken: string;
  expiresAt: string;
  lab: {
    id: string;
    code: string;
    name: string;
    subdomain: string | null;
  };
}

export async function getAdminLabs(): Promise<AdminLabDto[]> {
  const res = await api.get<AdminLabDto[]>('/admin/api/labs');
  return res.data;
}

export async function getAdminLabsPage(params: {
  q?: string;
  status?: 'all' | 'active' | 'disabled';
  page?: number;
  size?: number;
}): Promise<AdminLabsResult> {
  const res = await api.get<AdminLabsResult>('/admin/api/labs/list', { params });
  return res.data;
}

export async function getAdminLab(labId: string): Promise<AdminLabDto> {
  const res = await api.get<AdminLabDto>(`/admin/api/labs/${labId}`);
  return res.data;
}

export async function getAdminSummary(params?: {
  labId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AdminSummaryDto> {
  const res = await api.get<AdminSummaryDto>('/admin/api/dashboard/summary', { params });
  return res.data;
}

export async function createAdminLab(data: CreateAdminLabRequest): Promise<AdminLabDto> {
  const res = await api.post<AdminLabDto>('/admin/api/labs', data);
  return res.data;
}

export async function getAdminOrders(params: {
  labId?: string;
  status?: 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  size?: number;
}): Promise<AdminOrdersResult> {
  const res = await api.get<AdminOrdersResult>('/admin/api/orders', { params });
  return res.data;
}

export async function getAdminOrder(orderId: string): Promise<AdminOrderDetail> {
  const res = await api.get<AdminOrderDetail>(`/admin/api/orders/${orderId}`);
  return res.data;
}

export async function getAdminOrderResultsPdf(orderId: string): Promise<Blob> {
  const res = await api.get<Blob>(`/admin/api/orders/${orderId}/results`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function getAdminAuditLogs(params: {
  labId?: string;
  actorType?: 'LAB_USER' | 'PLATFORM_USER';
  action?: string;
  entityType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  size?: number;
}): Promise<AdminAuditLogResult> {
  const res = await api.get<AdminAuditLogResult>('/admin/api/audit-logs', { params });
  return res.data;
}

export async function getAdminAuditActions(): Promise<string[]> {
  const res = await api.get<string[]>('/admin/api/audit-logs/actions');
  return res.data;
}

export async function getAdminAuditEntityTypes(labId?: string): Promise<string[]> {
  const res = await api.get<string[]>('/admin/api/audit-logs/entity-types', {
    params: labId ? { labId } : undefined,
  });
  return res.data;
}

export async function exportAdminAuditLogsCsv(data: {
  labId?: string;
  actorType?: 'LAB_USER' | 'PLATFORM_USER';
  action?: string;
  entityType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  maxRows?: number;
  reason: string;
}): Promise<{ blob: Blob; fileName: string }> {
  const res = await api.post<Blob>('/admin/api/audit-logs/export', data, {
    responseType: 'blob',
  });

  const dispositionHeader = res.headers['content-disposition'] as string | undefined;
  const fileNameMatch = dispositionHeader?.match(/filename="([^"]+)"/i);
  const fileName = fileNameMatch?.[1] || 'audit-logs.csv';

  return {
    blob: res.data,
    fileName,
  };
}

export async function getAdminSystemHealth(): Promise<AdminSystemHealthDto> {
  const res = await api.get<AdminSystemHealthDto>('/admin/api/system-health');
  return res.data;
}

export async function getAdminPlatformSettingsOverview(): Promise<AdminPlatformSettingsOverviewDto> {
  const res = await api.get<AdminPlatformSettingsOverviewDto>('/admin/api/settings/platform');
  return res.data;
}

export async function getAdminImpersonationStatus(): Promise<AdminImpersonationStatusDto> {
  const res = await api.get<AdminImpersonationStatusDto>('/admin/api/impersonation');
  return res.data;
}

export async function startAdminImpersonation(data: {
  labId: string;
  reason: string;
}): Promise<AdminImpersonationTokenResponse> {
  const res = await api.post<AdminImpersonationTokenResponse>('/admin/api/impersonation/start', data);
  return res.data;
}

export async function stopAdminImpersonation(): Promise<AdminImpersonationTokenResponse> {
  const res = await api.post<AdminImpersonationTokenResponse>('/admin/api/impersonation/stop');
  return res.data;
}

export async function createAdminImpersonationLabPortalToken(): Promise<AdminImpersonationOpenLabResponse> {
  const res = await api.post<AdminImpersonationOpenLabResponse>('/admin/api/impersonation/open-lab');
  return res.data;
}

export async function updateAdminLab(labId: string, data: UpdateAdminLabRequest): Promise<AdminLabDto> {
  const res = await api.patch<AdminLabDto>(`/admin/api/labs/${labId}`, data);
  return res.data;
}

export async function setAdminLabStatus(
  labId: string,
  data: SetAdminLabStatusRequest,
): Promise<AdminLabDto> {
  const res = await api.post<AdminLabDto>(`/admin/api/labs/${labId}/status`, data);
  return res.data;
}

export async function getAdminSettingsRoles(): Promise<string[]> {
  const res = await api.get<string[]>('/admin/api/settings/roles');
  return res.data;
}

export async function getAdminLabSettings(labId: string): Promise<LabSettingsDto> {
  const res = await api.get<LabSettingsDto>(`/admin/api/labs/${labId}/settings`);
  return res.data;
}

export async function updateAdminLabSettings(
  labId: string,
  data: {
    labelSequenceBy?: 'tube_type' | 'department';
    sequenceResetBy?: 'day' | 'shift';
    enableOnlineResults?: boolean;
    onlineResultWatermarkDataUrl?: string | null;
    onlineResultWatermarkText?: string | null;
    reportBranding?: Partial<ReportBrandingDto>;
  },
): Promise<LabSettingsDto> {
  const res = await api.patch<LabSettingsDto>(`/admin/api/labs/${labId}/settings`, data);
  return res.data;
}

export async function getAdminLabUsers(labId: string): Promise<SettingsUserDto[]> {
  const res = await api.get<SettingsUserDto[]>(`/admin/api/labs/${labId}/users`);
  return res.data;
}

export async function getAdminLabUser(
  labId: string,
  userId: string,
): Promise<{
  user: SettingsUserDto;
  labIds: string[];
  shiftIds: string[];
  departmentIds: string[];
}> {
  const res = await api.get<{
    user: SettingsUserDto;
    labIds: string[];
    shiftIds: string[];
    departmentIds: string[];
  }>(`/admin/api/labs/${labId}/users/${userId}`);
  return res.data;
}

export async function createAdminLabUser(
  labId: string,
  data: {
    username: string;
    password: string;
    fullName?: string;
    email?: string;
    role: string;
    shiftIds?: string[];
    departmentIds?: string[];
  },
): Promise<SettingsUserDto> {
  const res = await api.post<SettingsUserDto>(`/admin/api/labs/${labId}/users`, data);
  return res.data;
}

export async function updateAdminLabUser(
  labId: string,
  userId: string,
  data: {
    fullName?: string;
    email?: string;
    role?: string;
    defaultLabId?: string;
    isActive?: boolean;
    shiftIds?: string[];
    departmentIds?: string[];
    password?: string;
  },
): Promise<SettingsUserDto> {
  const res = await api.patch<SettingsUserDto>(`/admin/api/labs/${labId}/users/${userId}`, data);
  return res.data;
}

export async function deleteAdminLabUser(labId: string, userId: string): Promise<void> {
  await api.delete(`/admin/api/labs/${labId}/users/${userId}`);
}

export async function resetAdminLabUserPassword(
  labId: string,
  userId: string,
  data: {
    password: string;
    reason: string;
  },
): Promise<{ success: true }> {
  const res = await api.post<{ success: true }>(
    `/admin/api/labs/${labId}/users/${userId}/reset-password`,
    data,
  );
  return res.data;
}

export async function getAdminLabShifts(labId: string): Promise<ShiftDto[]> {
  const res = await api.get<ShiftDto[]>(`/admin/api/labs/${labId}/shifts`);
  return res.data;
}

export async function getAdminLabDepartments(labId: string): Promise<DepartmentDto[]> {
  const res = await api.get<DepartmentDto[]>(`/admin/api/labs/${labId}/departments`);
  return res.data;
}

// Patients
export interface PatientDto {
  id: string;
  patientNumber: string;
  nationalId: string | null;
  phone: string | null;
  externalId: string | null;
  fullName: string;
  dateOfBirth: string | null;
  sex: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientSearchParams {
  search?: string;
  nationalId?: string;
  phone?: string;
  page?: number;
  size?: number;
}

export interface PatientSearchResult {
  items: PatientDto[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface CreatePatientDto {
  nationalId?: string;
  phone?: string;
  externalId?: string;
  fullName: string;
  dateOfBirth?: string;
  sex?: string;
  address?: string;
}

export async function searchPatients(params: PatientSearchParams): Promise<PatientSearchResult> {
  const res = await api.get<PatientSearchResult>('/patients', { params });
  return res.data;
}

export async function getPatient(id: string): Promise<PatientDto> {
  const res = await api.get<PatientDto>(`/patients/${id}`);
  return res.data;
}

export async function createPatient(data: CreatePatientDto): Promise<PatientDto> {
  const res = await api.post<PatientDto>('/patients', data);
  return res.data;
}

export async function updatePatient(id: string, data: Partial<CreatePatientDto>): Promise<PatientDto> {
  const res = await api.patch<PatientDto>(`/patients/${id}`, data);
  return res.data;
}

// Dashboard
export interface DashboardKpis {
  ordersToday: number;
  pendingVerification: number;
  criticalAlerts: number;
  avgTatHours: number | null;
  totalPatients: number;
}

export interface OrdersTrendPoint {
  date: string;
  count: number;
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const res = await api.get<Partial<DashboardKpis> | null>('/dashboard/kpis');
  const raw = res.data ?? {};
  return {
    ordersToday: Number(raw.ordersToday ?? 0),
    pendingVerification: Number(raw.pendingVerification ?? 0),
    criticalAlerts: Number(raw.criticalAlerts ?? 0),
    avgTatHours:
      raw.avgTatHours === null || raw.avgTatHours === undefined
        ? null
        : Number(raw.avgTatHours),
    totalPatients: Number(raw.totalPatients ?? 0),
  };
}

export async function getOrdersTrend(days?: number): Promise<OrdersTrendPoint[]> {
  const res = await api.get<{ data?: OrdersTrendPoint[] } | OrdersTrendPoint[] | null>(
    '/dashboard/orders-trend',
    {
    params: days ? { days } : undefined,
    },
  );

  const payload = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.data)
      ? res.data.data
      : [];

  return payload
    .map((item) => ({
      date: String(item?.date ?? ''),
      count: Number(item?.count ?? 0),
    }))
    .filter((item) => item.date.length > 0);
}

// Statistics (date range)
export interface StatisticsDto {
  orders: {
    total: number;
    byStatus: Record<string, number>;
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
  };
  revenue: number;
  tests: {
    total: number;
    byDepartment: { departmentId: string | null; departmentName: string; count: number }[];
    byTest: { testId: string; testCode: string; testName: string; count: number }[];
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
  };
  tat: {
    medianMinutes: number | null;
    p95Minutes: number | null;
    withinTargetCount: number;
    withinTargetTotal: number;
    targetMinutes: number;
  };
  quality: {
    abnormalCount: number;
    criticalCount: number;
    totalVerified: number;
  };
  unmatched: {
    pending: number;
    resolved: number;
    discarded: number;
    byReason: Record<string, number>;
  };
  instrumentWorkload: { instrumentId: string; instrumentName: string; count: number }[];
}

export async function getStatistics(params: {
  startDate?: string;
  endDate?: string;
}): Promise<StatisticsDto> {
  const res = await api.get<StatisticsDto>('/dashboard/statistics', { params });
  return res.data;
}

// Orders
export type OrderStatus = 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PatientType = 'WALK_IN' | 'HOSPITAL' | 'CONTRACT';
export type TubeType = 'SERUM' | 'PLASMA' | 'WHOLE_BLOOD' | 'URINE' | 'STOOL' | 'SWAB' | 'OTHER';
export type OrderTestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';

export const OrderTestStatus = {
  PENDING: 'PENDING' as const,
  IN_PROGRESS: 'IN_PROGRESS' as const,
  COMPLETED: 'COMPLETED' as const,
  VERIFIED: 'VERIFIED' as const,
  REJECTED: 'REJECTED' as const,
};

export interface OrderTestDto {
  id: string;
  sampleId: string;
  testId: string;
  parentOrderTestId: string | null;
  status: OrderTestStatus;
  price: number | null;
  resultValue?: number | null;
  resultText?: string | null;
  resultParameters?: Record<string, string> | null;
  flag?: ResultFlag | null;
  resultedAt?: string | null;
  resultedBy?: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  comments?: string | null;
  test: TestDto;
}

export interface SampleDto {
  id: string;
  orderId: string;
  sampleId: string | null;
  tubeType: TubeType | null;
  barcode: string | null;
  /** Tube sequence (1, 2, 3...) within scope (tube type or department); resets per day/shift */
  sequenceNumber: number | null;
  qrCode: string | null;
  collectedAt: string | null;
  notes: string | null;
  orderTests: OrderTestDto[];
}

export interface OrderDto {
  id: string;
  patientId: string;
  labId: string;
  shiftId: string | null;
  orderNumber: string | null;
  status: OrderStatus;
  patientType: PatientType;
  notes: string | null;
  totalAmount: number;
  discountPercent: number;
  finalAmount: number;
  /** unpaid | partial | paid — required to print/download/send results */
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  /** Amount paid so far (for partial) */
  paidAmount?: number | null;
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
  patient: PatientDto;
  lab: LabDto;
  shift: { id: string; code: string; name: string | null } | null;
  samples: SampleDto[];
  testsCount?: number;
  readyTestsCount?: number;
  reportReady?: boolean;
}

export interface CreateOrderTestDto {
  testId: string;
}

export interface CreateSampleDto {
  sampleId?: string;
  tubeType?: TubeType;
  tests: CreateOrderTestDto[];
}

export interface CreateOrderDto {
  patientId: string;
  shiftId?: string;
  patientType?: PatientType;
  notes?: string;
  discountPercent?: number;
  samples: CreateSampleDto[];
}

export interface OrderSearchParams {
  page?: number;
  size?: number;
  search?: string;
  status?: OrderStatus;
  patientId?: string;
  startDate?: string;
  endDate?: string;
}

export interface OrderSearchResult {
  items: OrderDto[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export async function getOrderPriceEstimate(
  testIds: string[],
  shiftId?: string | null
): Promise<{ subtotal: number }> {
  const params: { testIds: string; shiftId?: string } = { testIds: testIds.join(',') };
  if (shiftId) params.shiftId = shiftId;
  const res = await api.get<{ subtotal: number }>('/orders/estimate-price', { params });
  return res.data;
}

export async function createOrder(data: CreateOrderDto): Promise<OrderDto> {
  const res = await api.post<OrderDto>('/orders', data);
  return res.data;
}

export async function searchOrders(params: OrderSearchParams): Promise<OrderSearchResult> {
  const res = await api.get<OrderSearchResult>('/orders', { params });
  return res.data;
}

export async function getOrder(id: string): Promise<OrderDto> {
  const res = await api.get<OrderDto>(`/orders/${id}`);
  return res.data;
}

export async function updateOrderPayment(
  orderId: string,
  data: { paymentStatus: 'unpaid' | 'partial' | 'paid'; paidAmount?: number }
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/payment`, data);
  return res.data;
}

export async function updateOrderTests(
  orderId: string,
  data: { testIds: string[] },
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/tests`, data);
  return res.data;
}

/** Lab-scoped orders worklist: shared for all users with access to the lab */
export interface OrdersWorklistItem {
  rowId: string;
  patient: PatientDto;
  createdOrder: OrderDto | null;
}

export async function getOrdersWorklist(shiftId: string | null): Promise<OrdersWorklistItem[]> {
  const res = await api.get<OrdersWorklistItem[]>('/orders/worklist', {
    params: shiftId ? { shiftId } : {},
  });
  return res.data;
}

export async function saveOrdersWorklist(
  shiftId: string | null,
  items: { rowId: string; patientId: string; orderId?: string }[],
): Promise<void> {
  await api.post('/orders/worklist', { shiftId, items });
}

/** Next order number that would be assigned for this shift (preview; actual number set at create). */
export async function getNextOrderNumber(shiftId: string | null): Promise<string> {
  const res = await api.get<{ orderNumber: string }>('/orders/next-order-number', {
    params: shiftId ? { shiftId } : {},
  });
  return res.data.orderNumber;
}

// Reports
export async function downloadOrderReceiptPDF(orderId: string): Promise<Blob> {
  const res = await api.get(`/reports/orders/${orderId}/receipt`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function downloadTestResultsPDF(orderId: string): Promise<Blob> {
  const res = await api.get(`/reports/orders/${orderId}/results`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function logReportDelivery(orderId: string, channel: 'WHATSAPP' | 'VIBER'): Promise<void> {
  await api.post(`/reports/orders/${orderId}/delivery-log`, { channel });
}

// Today's patients (patients registered today)
export async function getTodayPatients(): Promise<PatientDto[]> {
  const res = await api.get<PatientDto[]>('/patients/today');
  return res.data;
}

// Patients who have orders today (lab-specific)
export async function getOrdersTodayPatients(): Promise<
  Array<{ patient: PatientDto; orderCount: number; lastOrderAt: string | null }>
> {
  const res = await api.get<Array<{ patient: PatientDto; orderCount: number; lastOrderAt: string | null }>>('/orders/today-patients');
  return res.data;
}

// Tests
export type TestType = 'SINGLE' | 'PANEL';
export type TestTubeType = 'SERUM' | 'PLASMA' | 'WHOLE_BLOOD' | 'URINE' | 'STOOL' | 'SWAB' | 'CSF' | 'OTHER';

export interface TestParameterDefinition {
  code: string;
  label: string;
  type: 'select' | 'text';
  options?: string[];
  /** Option values considered normal (e.g. yellow = normal, red = abnormal). */
  normalOptions?: string[];
  /** Default value when entering result (e.g. nil for Crystal). */
  defaultValue?: string;
}

export interface TestNumericAgeRange {
  sex: 'ANY' | 'M' | 'F';
  minAgeYears?: number | null;
  maxAgeYears?: number | null;
  normalMin?: number | null;
  normalMax?: number | null;
}

export type TestResultEntryType = 'NUMERIC' | 'QUALITATIVE' | 'TEXT';

export interface TestResultTextOption {
  value: string;
  flag?: ResultFlag | null;
  isDefault?: boolean;
}

export interface TestDto {
  id: string;
  code: string;
  name: string;
  type: TestType;
  tubeType: TestTubeType;
  unit: string | null;
  category: string | null;
  normalMin: number | null;
  normalMax: number | null;
  normalMinMale: number | null;
  normalMaxMale: number | null;
  normalMinFemale: number | null;
  normalMaxFemale: number | null;
  normalText: string | null;
  numericAgeRanges: TestNumericAgeRange[] | null;
  resultEntryType: TestResultEntryType;
  resultTextOptions: TestResultTextOption[] | null;
  allowCustomResultText: boolean;
  description: string | null;
  childTestIds: string | null;
  parameterDefinitions: TestParameterDefinition[] | null;
  departmentId: string | null;
  isActive: boolean;
  sortOrder: number;
  expectedCompletionMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestDto {
  code: string;
  name: string;
  type?: TestType;
  tubeType?: TestTubeType;
  unit?: string;
  category?: string | null;
  normalMin?: number | null;
  normalMax?: number | null;
  normalMinMale?: number | null;
  normalMaxMale?: number | null;
  normalMinFemale?: number | null;
  normalMaxFemale?: number | null;
  normalText?: string;
  numericAgeRanges?: TestNumericAgeRange[] | null;
  resultEntryType?: TestResultEntryType;
  resultTextOptions?: TestResultTextOption[] | null;
  allowCustomResultText?: boolean;
  description?: string;
  childTestIds?: string;
  parameterDefinitions?: TestParameterDefinition[] | null;
  departmentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  expectedCompletionMinutes?: number | null;
}

export async function getTests(activeOnly?: boolean): Promise<TestDto[]> {
  const res = await api.get<TestDto[]>('/tests', {
    params: activeOnly !== undefined ? { active: activeOnly } : undefined,
  });
  return res.data;
}

export async function getTest(id: string): Promise<TestDto> {
  const res = await api.get<TestDto>(`/tests/${id}`);
  return res.data;
}

export async function createTest(data: CreateTestDto): Promise<TestDto> {
  const res = await api.post<TestDto>('/tests', data);
  return res.data;
}

export async function updateTest(id: string, data: Partial<CreateTestDto>): Promise<TestDto> {
  const res = await api.patch<TestDto>(`/tests/${id}`, data);
  return res.data;
}

export async function deleteTest(id: string): Promise<void> {
  await api.delete(`/tests/${id}`);
}

export async function toggleTestActive(id: string): Promise<TestDto> {
  const res = await api.patch<TestDto>(`/tests/${id}/toggle-active`);
  return res.data;
}

export interface SeedResult {
  created: number;
  skipped: number;
  tests: string[];
}

export async function seedCBCTests(): Promise<SeedResult> {
  const res = await api.post<SeedResult>('/tests/seed/cbc');
  return res.data;
}

export async function seedChemistryTests(): Promise<SeedResult> {
  const res = await api.post<SeedResult>('/tests/seed/chemistry');
  return res.data;
}

export async function seedAllTests(): Promise<{ cbc: SeedResult; chemistry: SeedResult; total: { created: number; skipped: number } }> {
  const res = await api.post<{ cbc: SeedResult; chemistry: SeedResult; total: { created: number; skipped: number } }>('/tests/seed/all');
  return res.data;
}

// Worklist
export type ResultFlag = 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN';

export const ResultFlag = {
  NORMAL: 'N' as const,
  HIGH: 'H' as const,
  LOW: 'L' as const,
  CRITICAL_HIGH: 'HH' as const,
  CRITICAL_LOW: 'LL' as const,
  POSITIVE: 'POS' as const,
  NEGATIVE: 'NEG' as const,
  ABNORMAL: 'ABN' as const,
};

export interface WorklistItem {
  id: string;
  orderNumber: string;
  orderId: string;
  sampleId: string;
  patientName: string;
  patientSex: string | null;
  patientAge: number | null;
  testCode: string;
  testName: string;
  testUnit: string | null;
  normalMin: number | null;
  normalMax: number | null;
  normalText: string | null;
  resultEntryType: TestResultEntryType;
  resultTextOptions: TestResultTextOption[] | null;
  allowCustomResultText: boolean;
  tubeType: string | null;
  status: OrderTestStatus;
  resultValue: number | null;
  resultText: string | null;
  flag: ResultFlag | null;
  resultedAt: string | null;
  resultedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  registeredAt: string;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  parameterDefinitions: TestParameterDefinition[] | null;
  resultParameters: Record<string, string> | null;
}

export async function enterResult(
  id: string,
  data: {
    resultValue?: number | null;
    resultText?: string | null;
    comments?: string | null;
    resultParameters?: Record<string, string> | null;
    forceEditVerified?: boolean;
  }
): Promise<void> {
  await api.patch(`/worklist/${id}/result`, data);
}

export interface WorklistParams {
  status?: OrderTestStatus[];
  search?: string;
  date?: string;
  departmentId?: string;
  page?: number;
  size?: number;
}

export interface WorklistResult {
  items: WorklistItem[];
  total: number;
}

export interface WorklistStats {
  pending: number;
  completed: number;
  verified: number;
  rejected: number;
}

export async function getWorklist(params: WorklistParams): Promise<WorklistResult> {
  const queryParams: Record<string, string> = {};
  if (params.status?.length) queryParams.status = params.status.join(',');
  if (params.search) queryParams.search = params.search;
  if (params.date) queryParams.date = params.date;
  if (params.departmentId) queryParams.departmentId = params.departmentId;
  if (params.page) queryParams.page = params.page.toString();
  if (params.size) queryParams.size = params.size.toString();

  const res = await api.get<WorklistResult>('/worklist', { params: queryParams });
  return res.data;
}

export async function getWorklistStats(): Promise<WorklistStats> {
  const res = await api.get<WorklistStats>('/worklist/stats');
  return res.data;
}

export async function verifyResult(id: string): Promise<void> {
  await api.patch(`/worklist/${id}/verify`);
}

export async function verifyMultipleResults(ids: string[]): Promise<{ verified: number; failed: number }> {
  const res = await api.post<{ verified: number; failed: number }>('/worklist/verify-multiple', { ids });
  return res.data;
}

export async function rejectResult(id: string, reason: string): Promise<void> {
  await api.patch(`/worklist/${id}/reject`, { reason });
}

// Shifts
export interface ShiftDto {
  id: string;
  labId: string;
  code: string;
  name: string | null;
  startTime: string | null;
  endTime: string | null;
  isEmergency: boolean;
}

export async function getShifts(): Promise<ShiftDto[]> {
  const res = await api.get<ShiftDto[]>('/shifts');
  return res.data;
}

export async function createShift(data: { code: string; name?: string; startTime?: string; endTime?: string; isEmergency?: boolean }): Promise<ShiftDto> {
  const res = await api.post<ShiftDto>('/shifts', data);
  return res.data;
}

export async function updateShift(id: string, data: Partial<{ code: string; name: string; startTime: string; endTime: string; isEmergency: boolean }>): Promise<ShiftDto> {
  const res = await api.patch<ShiftDto>(`/shifts/${id}`, data);
  return res.data;
}

export async function deleteShift(id: string): Promise<void> {
  await api.delete(`/shifts/${id}`);
}

// Departments
export interface DepartmentDto {
  id: string;
  labId: string;
  code: string;
  name: string;
}

export async function getDepartments(): Promise<DepartmentDto[]> {
  const res = await api.get<DepartmentDto[]>('/departments');
  return res.data;
}

export async function createDepartment(data: { code: string; name?: string }): Promise<DepartmentDto> {
  const res = await api.post<DepartmentDto>('/departments', data);
  return res.data;
}

export async function updateDepartment(id: string, data: { code?: string; name?: string }): Promise<DepartmentDto> {
  const res = await api.patch<DepartmentDto>(`/departments/${id}`, data);
  return res.data;
}

export async function deleteDepartment(id: string): Promise<void> {
  await api.delete(`/departments/${id}`);
}

// Settings - Users
export interface SettingsUserDto {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  defaultLabId: string | null;
  isActive: boolean;
  labAssignments?: { labId: string }[];
  shiftAssignments?: { shiftId: string; shift?: ShiftDto }[];
  departmentAssignments?: { departmentId: string; department?: DepartmentDto }[];
}

export async function getSettingsRoles(): Promise<string[]> {
  const res = await api.get<string[]>('/settings/roles');
  return res.data;
}

export async function getSettingsUsers(): Promise<SettingsUserDto[]> {
  const res = await api.get<SettingsUserDto[]>('/settings/users');
  return res.data;
}

export async function getSettingsUser(id: string): Promise<{
  user: SettingsUserDto;
  labIds: string[];
  shiftIds: string[];
  departmentIds: string[];
}> {
  const res = await api.get<{
    user: SettingsUserDto;
    labIds: string[];
    shiftIds: string[];
    departmentIds: string[];
  }>(`/settings/users/${id}`);
  return res.data;
}

export async function createSettingsUser(data: {
  username: string;
  password: string;
  fullName?: string;
  email?: string;
  role: string;
  shiftIds?: string[];
  departmentIds?: string[];
}): Promise<SettingsUserDto> {
  const res = await api.post<SettingsUserDto>('/settings/users', data);
  return res.data;
}

export async function updateSettingsUser(id: string, data: {
  fullName?: string;
  email?: string;
  role?: string;
  defaultLabId?: string;
  isActive?: boolean;
  shiftIds?: string[];
  departmentIds?: string[];
  password?: string;
}): Promise<SettingsUserDto> {
  const res = await api.patch<SettingsUserDto>(`/settings/users/${id}`, data);
  return res.data;
}

export async function deleteSettingsUser(id: string): Promise<void> {
  await api.delete(`/settings/users/${id}`);
}

export interface LabSettingsDto {
  id: string;
  code: string;
  name: string;
  labelSequenceBy: 'tube_type' | 'department';
  sequenceResetBy: 'day' | 'shift';
  enableOnlineResults: boolean;
  onlineResultWatermarkDataUrl: string | null;
  onlineResultWatermarkText: string | null;
  reportBranding: ReportBrandingDto;
}

export async function getLabSettings(): Promise<LabSettingsDto> {
  const res = await api.get<LabSettingsDto>('/settings/lab');
  return res.data;
}

export async function updateLabSettings(data: {
  labelSequenceBy?: 'tube_type' | 'department';
  sequenceResetBy?: 'day' | 'shift';
  enableOnlineResults?: boolean;
  onlineResultWatermarkDataUrl?: string | null;
  onlineResultWatermarkText?: string | null;
  reportBranding?: Partial<ReportBrandingDto>;
}): Promise<LabSettingsDto> {
  const res = await api.patch<LabSettingsDto>('/settings/lab', data);
  return res.data;
}

// Test pricing by shift
export interface TestPricingItemDto {
  shiftId: string | null;
  shiftCode?: string | null;
  price: number;
}

export async function getTestPricing(testId: string): Promise<TestPricingItemDto[]> {
  const res = await api.get<TestPricingItemDto[]>(`/tests/${testId}/pricing`);
  return res.data;
}

export async function setTestPricing(testId: string, prices: { shiftId: string | null; price: number }[]): Promise<void> {
  await api.patch(`/tests/${testId}/pricing`, { prices });
}

// Audit Log
export interface AuditLogItem {
  id: string;
  labId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    fullName: string | null;
  } | null;
}

export interface AuditLogResult {
  items: AuditLogItem[];
  total: number;
}

export interface AuditLogParams {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  size?: number;
}

export async function getAuditLogs(params: AuditLogParams): Promise<AuditLogResult> {
  const queryParams: Record<string, string> = {};
  if (params.userId) queryParams.userId = params.userId;
  if (params.action) queryParams.action = params.action;
  if (params.entityType) queryParams.entityType = params.entityType;
  if (params.entityId) queryParams.entityId = params.entityId;
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;
  if (params.search) queryParams.search = params.search;
  if (params.page) queryParams.page = params.page.toString();
  if (params.size) queryParams.size = params.size.toString();

  const res = await api.get<AuditLogResult>('/audit', { params: queryParams });
  return res.data;
}

export async function getAuditActions(): Promise<string[]> {
  const res = await api.get<string[]>('/audit/actions');
  return res.data;
}

export async function getAuditEntityTypes(): Promise<string[]> {
  const res = await api.get<string[]>('/audit/entity-types');
  return res.data;
}

// Instruments
export type InstrumentProtocol = 'HL7_V2' | 'ASTM' | 'POCT1A' | 'CUSTOM';
export type ConnectionType = 'TCP_SERVER' | 'TCP_CLIENT' | 'SERIAL' | 'FILE_WATCH';
export type InstrumentStatus = 'OFFLINE' | 'ONLINE' | 'ERROR' | 'CONNECTING';

export interface InstrumentDto {
  id: string;
  labId: string;
  code: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  protocol: InstrumentProtocol;
  connectionType: ConnectionType;
  host: string | null;
  port: number | null;
  serialPort: string | null;
  baudRate: number | null;
  dataBits: string | null;
  parity: string | null;
  stopBits: string | null;
  watchFolder: string | null;
  filePattern: string | null;
  sendingApplication: string | null;
  sendingFacility: string | null;
  receivingApplication: string | null;
  receivingFacility: string | null;
  status: InstrumentStatus;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
  isActive: boolean;
  autoPost: boolean;
  requireVerification: boolean;
  createdAt: string;
  updatedAt: string;
  _connectionStatus?: { connected: boolean; hasServer: boolean };
}

export interface InstrumentMappingDto {
  id: string;
  instrumentId: string;
  testId: string;
  instrumentTestCode: string;
  instrumentTestName: string | null;
  multiplier: number | null;
  isActive: boolean;
}

export interface InstrumentMessageDto {
  id: string;
  instrumentId: string;
  direction: 'IN' | 'OUT';
  messageType: string;
  messageControlId: string | null;
  rawMessage: string;
  parsedMessage: Record<string, unknown> | null;
  status: 'RECEIVED' | 'PROCESSED' | 'ERROR' | 'SENT' | 'ACKNOWLEDGED';
  errorMessage: string | null;
  orderId: string | null;
  orderTestId: string | null;
  createdAt: string;
}

export async function getInstruments(): Promise<InstrumentDto[]> {
  const res = await api.get<InstrumentDto[]>('/instruments');
  return res.data;
}

export async function getInstrument(id: string): Promise<InstrumentDto> {
  const res = await api.get<InstrumentDto>(`/instruments/${id}`);
  return res.data;
}

export async function createInstrument(data: Partial<InstrumentDto>): Promise<InstrumentDto> {
  const res = await api.post<InstrumentDto>('/instruments', data);
  return res.data;
}

export async function updateInstrument(id: string, data: Partial<InstrumentDto>): Promise<InstrumentDto> {
  const res = await api.patch<InstrumentDto>(`/instruments/${id}`, data);
  return res.data;
}

export async function deleteInstrument(id: string): Promise<void> {
  await api.delete(`/instruments/${id}`);
}

export async function toggleInstrumentActive(id: string): Promise<InstrumentDto> {
  const res = await api.patch<InstrumentDto>(`/instruments/${id}/toggle-active`);
  return res.data;
}

export async function restartInstrumentConnection(id: string): Promise<{ success: boolean }> {
  const res = await api.post<{ success: boolean }>(`/instruments/${id}/restart`);
  return res.data;
}

export async function getInstrumentMappings(instrumentId: string): Promise<InstrumentMappingDto[]> {
  const res = await api.get<InstrumentMappingDto[]>(`/instruments/${instrumentId}/mappings`);
  return res.data;
}

/** Mappings for a test (for Test management: "this test receives from these instruments"). */
export async function getInstrumentMappingsByTestId(testId: string): Promise<(InstrumentMappingDto & { instrument?: { id: string; code: string; name: string } })[]> {
  const res = await api.get(`/instruments/mappings-by-test/${testId}`);
  return res.data;
}

export async function createInstrumentMapping(
  instrumentId: string,
  data: { testId: string; instrumentTestCode: string; instrumentTestName?: string; multiplier?: number }
): Promise<InstrumentMappingDto> {
  const res = await api.post<InstrumentMappingDto>(`/instruments/${instrumentId}/mappings`, data);
  return res.data;
}

export async function updateInstrumentMapping(
  instrumentId: string,
  mappingId: string,
  data: Partial<{ testId: string; instrumentTestCode: string; instrumentTestName: string; multiplier: number }>
): Promise<InstrumentMappingDto> {
  const res = await api.patch<InstrumentMappingDto>(`/instruments/${instrumentId}/mappings/${mappingId}`, data);
  return res.data;
}

export async function deleteInstrumentMapping(instrumentId: string, mappingId: string): Promise<void> {
  await api.delete(`/instruments/${instrumentId}/mappings/${mappingId}`);
}

export async function getInstrumentMessages(
  instrumentId: string,
  params?: { page?: number; size?: number; direction?: 'IN' | 'OUT' }
): Promise<{ items: InstrumentMessageDto[]; total: number }> {
  const queryParams: Record<string, string> = {};
  if (params?.page) queryParams.page = params.page.toString();
  if (params?.size) queryParams.size = params.size.toString();
  if (params?.direction) queryParams.direction = params.direction;
  const res = await api.get<{ items: InstrumentMessageDto[]; total: number }>(
    `/instruments/${instrumentId}/messages`,
    { params: queryParams }
  );
  return res.data;
}

// Simulate sending a message to instrument (for testing)
export async function simulateInstrumentMessage(
  instrumentId: string,
  rawMessage: string
): Promise<{ success: boolean; message?: string; messageId?: string }> {
  const res = await api.post<{ success: boolean; message?: string; messageId?: string }>(
    `/instruments/${instrumentId}/simulate`,
    { rawMessage }
  );
  return res.data;
}

// Unmatched Instrument Results
export interface UnmatchedResultDto {
  id: string;
  instrumentId: string;
  instrumentCode: string;
  instrumentTestName: string | null;
  sampleIdentifier: string;
  resultValue: number | null;
  resultText: string | null;
  unit: string | null;
  flag: string | null;
  referenceRange: string | null;
  reason: 'UNORDERED_TEST' | 'UNMATCHED_SAMPLE' | 'NO_MAPPING' | 'INVALID_SAMPLE_STATUS' | 'DUPLICATE_RESULT';
  details: string | null;
  receivedAt: string;
  status: 'PENDING' | 'RESOLVED' | 'DISCARDED';
  createdAt: string;
}

export interface UnmatchedStats {
  pending: number;
  resolved: number;
  discarded: number;
  byReason: Record<string, number>;
}

export interface ResolveUnmatchedDto {
  action: 'ATTACH' | 'DISCARD';
  orderTestId?: string;
  notes?: string;
}

export async function getUnmatchedResults(params?: {
  status?: 'PENDING' | 'RESOLVED' | 'DISCARDED';
  instrumentId?: string;
  reason?: string;
  page?: number;
  size?: number;
}): Promise<{ items: UnmatchedResultDto[]; total: number }> {
  const res = await api.get<{ items: UnmatchedResultDto[]; total: number }>('/unmatched-results', { params });
  return res.data;
}

export async function getUnmatchedStats(): Promise<UnmatchedStats> {
  const res = await api.get<UnmatchedStats>('/unmatched-results/stats');
  return res.data;
}

export async function getUnmatchedResult(id: string): Promise<UnmatchedResultDto> {
  const res = await api.get<UnmatchedResultDto>(`/unmatched-results/${id}`);
  return res.data;
}

export async function resolveUnmatchedResult(id: string, dto: ResolveUnmatchedDto): Promise<UnmatchedResultDto> {
  const res = await api.post<UnmatchedResultDto>(`/unmatched-results/${id}/resolve`, dto);
  return res.data;
}
