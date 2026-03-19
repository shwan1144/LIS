import axios, { type InternalAxiosRequestConfig } from 'axios';
import {
  ensureFreshSession,
  getAccessToken,
  hasRefreshToken,
} from '../auth/sessionManager';
import { getCurrentAuthScope, resolveApiBaseUrl, type AuthScope } from '../utils/tenant-scope';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const ADMIN_WRITE_TIMEOUT_MS = 15_000;

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

function isAuthLifecycleRequest(url?: string): boolean {
  const normalizedUrl = url || '';
  return [
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/portal-login',
    '/admin/auth/login',
    '/admin/auth/refresh',
    '/admin/auth/logout',
  ].some((path) => normalizedUrl.endsWith(path));
}

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    // Don't add auth header if no token (e.g., login endpoint)
    delete config.headers.Authorization;
  }

  if (typeof window !== 'undefined') {
    // Preserve tenant context when frontend and backend are on different hosts.
    // Backend middleware prefers x-forwarded-host for lab/admin subdomain resolution.
    config.headers['x-forwarded-host'] = window.location.host;
    config.headers['x-forwarded-proto'] = window.location.protocol.replace(':', '');
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config as RetriableRequestConfig | undefined;
    if (
      err.response?.status === 401 &&
      config &&
      !config._retry &&
      !isAuthLifecycleRequest(config.url) &&
      hasRefreshToken()
    ) {
      config._retry = true;
      try {
        const session = await ensureFreshSession();
        const refreshedAccessToken = session?.accessToken ?? getAccessToken();
        if (refreshedAccessToken) {
          config.headers.Authorization = `Bearer ${refreshedAccessToken}`;
        }
        return api(config);
      } catch {
        return Promise.reject(err);
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
  subdomain?: string | null;
  timezone?: string;
  labelSequenceBy?: 'tube_type' | 'department';
  sequenceResetBy?: 'day' | 'shift';
  enableOnlineResults?: boolean;
  onlineResultWatermarkDataUrl?: string | null;
  onlineResultWatermarkText?: string | null;
  reportBranding?: ReportBrandingDto;
  reportStyle?: ReportStyleDto | null;
}

export interface ReportBrandingDto {
  bannerDataUrl: string | null;
  footerDataUrl: string | null;
  logoDataUrl: string | null;
  watermarkDataUrl: string | null;
}

export type ReportTextAlign = 'left' | 'center' | 'right';
export type ReportFontFamilyDto =
  | 'system-sans'
  | 'arial'
  | 'tahoma'
  | 'verdana'
  | 'georgia'
  | 'times-new-roman'
  | 'courier-new';

export interface ReportPatientInfoCellStyleDto {
  backgroundColor: string;
  textColor: string;
  fontFamily: ReportFontFamilyDto;
  fontSizePx: number;
  fontWeight: 400 | 500 | 600 | 700 | 800;
  textAlign: ReportTextAlign;
  paddingYpx: number;
  paddingXpx: number;
}

export interface ReportPatientInfoStyleDto {
  backgroundColor: string;
  borderColor: string;
  borderRadiusPx: number;
  paddingYpx: number;
  paddingXpx: number;
  marginTopPx: number;
  marginBottomPx: number;
  dividerWidthPx: number;
  labelCellStyle: ReportPatientInfoCellStyleDto;
  valueCellStyle: ReportPatientInfoCellStyleDto;
}

export interface ReportColumnStyleDto {
  textColor: string;
  fontSizePx: number;
  textAlign: ReportTextAlign;
  bold: boolean;
}

export interface ReportResultsTableSectionStyleDto {
  textColor: string;
  borderColor: string;
  fontFamily: ReportFontFamilyDto;
  fontSizePx: number;
  textAlign: ReportTextAlign;
  paddingYpx: number;
  paddingXpx: number;
  borderRadiusPx: number;
}

export interface ReportResultsTableFilledSectionStyleDto extends ReportResultsTableSectionStyleDto {
  backgroundColor: string;
}

export interface ReportPanelSectionStyleDto extends ReportResultsTableFilledSectionStyleDto {
  bold: boolean;
  borderWidthPx: number;
  borderRadiusPx: number;
  marginTopPx: number;
  marginBottomPx: number;
}

export interface ReportTitleStyleDto {
  text: string;
  textColor: string;
  fontSizePx: number;
  textAlign: ReportTextAlign;
  bold: boolean;
  underline: boolean;
  paddingYpx: number;
  paddingXpx: number;
}

export interface ReportResultsTableStyleDto {
  headerStyle: ReportResultsTableFilledSectionStyleDto;
  bodyStyle: ReportResultsTableSectionStyleDto;
  panelSectionStyle: ReportPanelSectionStyleDto;
  rowStripeEnabled: boolean;
  rowStripeColor: string;
  abnormalRowBackgroundColor: string;
  referenceValueColor: string;
  showStatusColumn: boolean;
  showDepartmentRow: boolean;
  departmentRowStyle: ReportResultsTableFilledSectionStyleDto;
  showCategoryRow: boolean;
  categoryRowStyle: ReportResultsTableFilledSectionStyleDto;
  statusNormalColor: string;
  statusHighColor: string;
  statusLowColor: string;
  regularDepartmentBlockBreak: 'auto' | 'avoid';
  regularRowBreak: 'auto' | 'avoid';
  panelTableBreak: 'auto' | 'avoid';
  panelRowBreak: 'auto' | 'avoid';
  testColumn: ReportColumnStyleDto;
  resultColumn: ReportColumnStyleDto;
  unitColumn: ReportColumnStyleDto;
  statusColumn: ReportColumnStyleDto;
  referenceColumn: ReportColumnStyleDto;
}

export interface ReportPageLayoutStyleDto {
  pageMarginTopMm: number;
  pageMarginRightMm: number;
  pageMarginBottomMm: number;
  pageMarginLeftMm: number;
  contentMarginXMm: number;
}

export interface ReportCultureSectionStyleDto {
  fontFamily: ReportFontFamilyDto;
  sectionTitleColor: string;
  sectionTitleBorderColor: string;
  sectionTitleAlign: ReportTextAlign;
  noGrowthBackgroundColor: string;
  noGrowthBorderColor: string;
  noGrowthTextColor: string;
  noGrowthPaddingYpx: number;
  noGrowthPaddingXpx: number;
  metaTextColor: string;
  metaTextAlign: ReportTextAlign;
  commentTextColor: string;
  commentTextAlign: ReportTextAlign;
  notesTextColor: string;
  notesBorderColor: string;
  notesTextAlign: ReportTextAlign;
  notesPaddingYpx: number;
  notesPaddingXpx: number;
  astGridGapPx: number;
  astMinHeightPx: number;
  astColumnBorderRadiusPx: number;
  astColumnPaddingPx: number;
  astColumnTitleColor: string;
  astColumnTitleBorderColor: string;
  astBodyTextColor: string;
  astEmptyTextColor: string;
  astSensitiveBorderColor: string;
  astSensitiveBackgroundColor: string;
  astIntermediateBorderColor: string;
  astIntermediateBackgroundColor: string;
  astResistanceBorderColor: string;
  astResistanceBackgroundColor: string;
}

export interface ReportStyleDto {
  version: 1;
  patientInfo: ReportPatientInfoStyleDto;
  reportTitle: ReportTitleStyleDto;
  resultsTable: ReportResultsTableStyleDto;
  pageLayout: ReportPageLayoutStyleDto;
  cultureSection: ReportCultureSectionStyleDto;
}

export interface UserDto {
  id: string;
  username: string;
  fullName: string | null;
  role: string;
  subLabId?: string | null;
  subLabName?: string | null;
  isImpersonation?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
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
  refreshToken: string;
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
    refreshToken: res.data.refreshToken,
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

export interface AdminGatewayActivationCodeResponse {
  activationCode: string;
  expiresAt: string;
  labId: string;
}

export interface AdminLabSettingsSummaryDto {
  id: string;
  code: string;
  name: string;
  reportDesignFingerprint: string;
  dashboardAnnouncementText: string | null;
  labelSequenceBy: 'tube_type' | 'department';
  sequenceResetBy: 'day' | 'shift';
  enableOnlineResults: boolean;
  hasOnlineResultWatermarkImage: boolean;
  onlineResultWatermarkText: string | null;
  printing: {
    mode: 'browser' | 'direct_gateway';
    receiptPrinterName: string | null;
    labelsPrinterName: string | null;
    reportPrinterName: string | null;
  };
  hasReportBanner: boolean;
  hasReportFooter: boolean;
  hasReportLogo: boolean;
  hasReportWatermark: boolean;
  uiTestGroups?: { id: string; name: string; testIds: string[] }[];
  referringDoctors?: string[];
}

export interface AdminLabSettingsUpdateDto extends AdminLabSettingsSummaryDto {
  reportBranding: ReportBrandingDto;
  reportStyle: ReportStyleDto | null;
  onlineResultWatermarkDataUrl: string | null;
}

export interface AdminLabReportDesignDto {
  id: string;
  code: string;
  name: string;
  reportDesignFingerprint: string;
  reportBranding: ReportBrandingDto;
  reportStyle: ReportStyleDto | null;
  onlineResultWatermarkDataUrl: string | null;
  onlineResultWatermarkText: string | null;
}

export interface AdminLabTestsTransferIssueDto {
  testCode: string;
  departmentCode?: string | null;
  shiftCode?: string | null;
}

export interface AdminLabTestsTransferResultDto {
  dryRun: boolean;
  sourceLab: {
    id: string;
    code: string;
    name: string;
  };
  targetLab: {
    id: string;
    code: string;
    name: string;
  };
  totalSourceTests: number;
  createCount: number;
  updateCount: number;
  pricingRowsCopied: number;
  pricingRowsSkipped: number;
  unmatchedDepartments: Array<{
    testCode: string;
    departmentCode: string | null;
  }>;
  unmatchedShiftPrices: Array<{
    testCode: string;
    shiftCode: string | null;
  }>;
  warnings: string[];
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
    testAbbreviation: string | null;
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
  barcode: string | null;
}

export interface AdminOrderTestDetail {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';
  flag: ResultFlag | null;
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
  /** @deprecated Legacy sample identifier kept for compatibility; new flows use orderNumber/barcode. */
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
    accessTokenLifetimeMinutes: number;
    refreshTokenLifetimeDays: number;
    passwordMinLength: number;
    requireStrongPassword: boolean;
  };
  mfa: {
    mode: 'OPTIONAL' | 'REQUIRED';
    enabledAccounts: number;
    totalAccounts: number;
  };
}

export interface AdminGlobalDashboardAnnouncementDto {
  dashboardAnnouncementText: string | null;
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
  refreshToken: string;
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
  const res = await api.post<AdminLabDto>('/admin/api/labs', data, {
    timeout: ADMIN_WRITE_TIMEOUT_MS,
  });
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

export interface AdminReportPreviewRequest {
  orderId: string;
  previewMode?: 'full' | 'culture_only';
  reportBranding: ReportBrandingDto;
  reportStyle: ReportStyleDto;
}

export async function previewAdminLabReportPdf(
  labId: string,
  data: AdminReportPreviewRequest,
): Promise<Blob> {
  const res = await api.post<Blob>(`/admin/api/labs/${labId}/report-preview`, data, {
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

export async function getAdminGlobalDashboardAnnouncement(): Promise<AdminGlobalDashboardAnnouncementDto> {
  const res = await api.get<AdminGlobalDashboardAnnouncementDto>('/admin/api/announcements/dashboard');
  return res.data;
}

export async function updateAdminGlobalDashboardAnnouncement(
  data: { dashboardAnnouncementText?: string | null },
): Promise<AdminGlobalDashboardAnnouncementDto> {
  const res = await api.patch<AdminGlobalDashboardAnnouncementDto>(
    '/admin/api/announcements/dashboard',
    data,
  );
  return res.data;
}

export async function getAdminImpersonationStatus(): Promise<AdminImpersonationStatusDto> {
  const res = await api.get<AdminImpersonationStatusDto>('/admin/api/impersonation');
  return res.data;
}

export async function startAdminImpersonation(data: {
  labId: string;
  reason: string;
  refreshToken: string;
}): Promise<AdminImpersonationTokenResponse> {
  const res = await api.post<AdminImpersonationTokenResponse>('/admin/api/impersonation/start', data);
  return res.data;
}

export async function stopAdminImpersonation(data: {
  refreshToken: string;
}): Promise<AdminImpersonationTokenResponse> {
  const res = await api.post<AdminImpersonationTokenResponse>('/admin/api/impersonation/stop', data);
  return res.data;
}

export async function createAdminImpersonationLabPortalToken(): Promise<AdminImpersonationOpenLabResponse> {
  const res = await api.post<AdminImpersonationOpenLabResponse>('/admin/api/impersonation/open-lab');
  return res.data;
}

export async function updateAdminLab(labId: string, data: UpdateAdminLabRequest): Promise<AdminLabDto> {
  const res = await api.patch<AdminLabDto>(`/admin/api/labs/${labId}`, data, {
    timeout: ADMIN_WRITE_TIMEOUT_MS,
  });
  return res.data;
}

export async function setAdminLabStatus(
  labId: string,
  data: SetAdminLabStatusRequest,
): Promise<AdminLabDto> {
  const res = await api.post<AdminLabDto>(`/admin/api/labs/${labId}/status`, data, {
    timeout: ADMIN_WRITE_TIMEOUT_MS,
  });
  return res.data;
}

export async function createAdminGatewayActivationCode(data: {
  labId: string;
  expiresInMinutes?: number;
}): Promise<AdminGatewayActivationCodeResponse> {
  const res = await api.post<AdminGatewayActivationCodeResponse>(
    '/admin/api/gateway/activation-codes',
    data,
    {
      timeout: ADMIN_WRITE_TIMEOUT_MS,
    },
  );
  return res.data;
}

export async function getAdminSettingsRoles(): Promise<string[]> {
  const res = await api.get<string[]>('/admin/api/settings/roles');
  return res.data;
}

export async function getAdminLabSettings(labId: string): Promise<AdminLabSettingsSummaryDto> {
  const res = await api.get<AdminLabSettingsSummaryDto>(`/admin/api/labs/${labId}/settings`);
  return res.data;
}

export async function getAdminLabReportDesign(labId: string): Promise<AdminLabReportDesignDto> {
  const res = await api.get<AdminLabReportDesignDto>(`/admin/api/labs/${labId}/report-design`);
  return res.data;
}

export async function updateAdminLabSettings(
  labId: string,
  data: {
    dashboardAnnouncementText?: string | null;
    labelSequenceBy?: 'tube_type' | 'department';
    sequenceResetBy?: 'day' | 'shift';
    enableOnlineResults?: boolean;
    onlineResultWatermarkDataUrl?: string | null;
    onlineResultWatermarkText?: string | null;
    printing?: {
      mode?: 'browser' | 'direct_gateway';
      receiptPrinterName?: string | null;
      labelsPrinterName?: string | null;
      reportPrinterName?: string | null;
    };
    reportBranding?: Partial<ReportBrandingDto>;
    reportStyle?: ReportStyleDto | null;
    uiTestGroups?: { id: string; name: string; testIds: string[] }[] | null;
    referringDoctors?: string[] | null;
  },
): Promise<AdminLabSettingsUpdateDto> {
  const res = await api.patch<AdminLabSettingsUpdateDto>(`/admin/api/labs/${labId}/settings`, data);
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
  const res = await api.post<SettingsUserDto>(`/admin/api/labs/${labId}/users`, data, {
    timeout: ADMIN_WRITE_TIMEOUT_MS,
  });
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
  const res = await api.patch<SettingsUserDto>(`/admin/api/labs/${labId}/users/${userId}`, data, {
    timeout: ADMIN_WRITE_TIMEOUT_MS,
  });
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
    {
      timeout: ADMIN_WRITE_TIMEOUT_MS,
    },
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

export async function transferAdminLabTests(
  labId: string,
  data: {
    sourceLabId: string;
    dryRun?: boolean;
  },
): Promise<AdminLabTestsTransferResultDto> {
  const res = await api.post<AdminLabTestsTransferResultDto>(
    `/admin/api/labs/${labId}/tests-transfer`,
    data,
    {
      timeout: ADMIN_WRITE_TIMEOUT_MS,
    },
  );
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
  const res = await api.get<
    PatientSearchResult
    | PatientDto[]
    | { data?: PatientSearchResult | PatientDto[] }
    | null
  >('/patients', { params });

  const payload = (res.data && typeof res.data === 'object' && 'data' in res.data)
    ? (res.data.data as PatientSearchResult | PatientDto[] | undefined)
    : res.data;

  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
      page: Number(params.page ?? 1),
      size: Number(params.size ?? (payload.length || 20)),
      totalPages: 1,
    };
  }

  if (payload && typeof payload === 'object' && 'items' in payload) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    const page = Number((payload as PatientSearchResult).page ?? params.page ?? 1);
    const size = Number((payload as PatientSearchResult).size ?? params.size ?? 20);
    const total = Number((payload as PatientSearchResult).total ?? items.length);
    const totalPages = Number((payload as PatientSearchResult).totalPages ?? Math.max(1, Math.ceil(total / Math.max(1, size))));
    return {
      items,
      total,
      page,
      size,
      totalPages,
    };
  }

  return {
    items: [],
    total: 0,
    page: Number(params.page ?? 1),
    size: Number(params.size ?? 20),
    totalPages: 0,
  };
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
  avgTatHours: number | null;
  totalPatients: number;
}

export interface DashboardAnnouncementDto {
  text: string | null;
  source: 'LAB' | 'GLOBAL' | 'NONE';
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
    avgTatHours:
      raw.avgTatHours === null || raw.avgTatHours === undefined
        ? null
        : Number(raw.avgTatHours),
    totalPatients: Number(raw.totalPatients ?? 0),
  };
}

export async function getDashboardAnnouncement(): Promise<DashboardAnnouncementDto> {
  const res = await api.get<DashboardAnnouncementDto>('/dashboard/announcement');
  return {
    text: res.data?.text?.trim() || null,
    source: res.data?.source ?? 'NONE',
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
export type StatisticsSourceType = 'ALL' | 'IN_HOUSE' | 'SUB_LAB';

export interface StatisticsDto {
  orders: {
    total: number;
    byStatus: Record<string, number>;
    byShift: { shiftId: string | null; shiftName: string; count: number }[];
  };
  profit: number;
  revenue: number;
  departmentTestTotal: number;
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
    totalVerified: number;
  };
  subLabBilling: {
    activeSourceType: StatisticsSourceType;
    billableRootTests: number;
    billableAmount: number;
    completedRootTests: number;
    verifiedRootTests: number;
    inHouse: {
      billableRootTests: number;
      billableAmount: number;
      completedRootTests: number;
      verifiedRootTests: number;
    };
    bySubLab: {
      subLabId: string;
      subLabName: string;
      billableRootTests: number;
      billableAmount: number;
      completedRootTests: number;
      verifiedRootTests: number;
    }[];
    byTest: { testId: string; testCode: string; testName: string; count: number; amount: number }[];
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
  shiftId?: string;
  departmentId?: string;
  sourceType?: StatisticsSourceType;
}): Promise<StatisticsDto> {
  const res = await api.get<StatisticsDto>('/dashboard/statistics', { params });
  return res.data;
}

export async function downloadStatisticsPDF(params: {
  startDate?: string;
  endDate?: string;
  shiftId?: string;
  departmentId?: string;
  sourceType?: StatisticsSourceType;
}): Promise<Blob> {
  const res = await api.get('/dashboard/statistics/pdf', {
    params,
    responseType: 'blob',
  });
  return res.data;
}

// Orders
export type OrderStatus = 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PatientType = 'WALK_IN' | 'HOSPITAL' | 'CONTRACT';
export type TubeType = 'SERUM' | 'PLASMA' | 'WHOLE_BLOOD' | 'URINE' | 'STOOL' | 'SWAB' | 'OTHER';
export type OrderTestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';
export type CreateOrderView = 'summary' | 'full';
export type OrderDetailView = 'compact' | 'full';
export type OrderResultStatus = 'PENDING' | 'COMPLETED' | 'VERIFIED' | 'REJECTED';

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
  cultureResult?: CultureResultPayload | null;
  flag?: ResultFlag | null;
  resultedAt?: string | null;
  resultedBy?: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  comments?: string | null;
  resultDocument?: ResultDocumentDto | null;
  test: TestDto;
}

export interface SampleDto {
  id: string;
  orderId: string;
  /** @deprecated Legacy sample identifier kept for compatibility; new flows use orderNumber/barcode. */
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
  sourceSubLabId: string | null;
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
  deliveryMethods?: DeliveryMethod[];
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
  patient: PatientDto;
  lab: LabDto;
  shift: { id: string; code: string; name: string | null } | null;
  sourceSubLab?: { id: string; name: string } | null;
  samples: SampleDto[];
  testsCount?: number;
  readyTestsCount?: number;
  reportReady?: boolean;
}

export interface CreateOrderTestDto {
  testId: string;
}

export interface CreateSampleDto {
  /** @deprecated Accepted for backward compatibility only; ignored by backend. */
  sampleId?: string;
  tubeType?: TubeType;
  tests: CreateOrderTestDto[];
}

export type DeliveryMethod = 'PRINT' | 'WHATSAPP' | 'VIBER';

export interface CreateOrderDto {
  patientId: string;
  shiftId?: string;
  patientType?: PatientType;
  notes?: string;
  sourceSubLabId?: string;
  discountPercent?: number;
  deliveryMethods?: DeliveryMethod[];
  samples: CreateSampleDto[];
}

export interface OrderSearchParams {
  page?: number;
  size?: number;
  search?: string;
  status?: OrderStatus;
  resultStatus?: OrderResultStatus;
  patientId?: string;
  shiftId?: string;
  sourceSubLabId?: string;
  departmentId?: string;
  startDate?: string;
  endDate?: string;
  dateFilterTimeZone?: string;
}

export interface OrderSearchResult {
  items: OrderDto[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface OrderHistoryItemDto {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  registeredAt: string;
  deliveryMethods?: DeliveryMethod[];
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paidAmount: number | null;
  totalAmount?: number;
  discountPercent?: number;
  finalAmount: number;
  patient: PatientDto;
  shift: { id: string; code: string; name: string | null } | null;
  sourceSubLab: { id: string; name: string } | null;
  testsCount: number;
  readyTestsCount: number;
  reportReady: boolean;
  resultStatus?: OrderResultStatus;
  resultSummary?: string | null;
  pendingTestsCount?: number;
  completedTestsCount?: number;
  verifiedTestsCount?: number;
  rejectedTestsCount?: number;
}

export interface OrderHistorySearchResult {
  items: OrderHistoryItemDto[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface OrderCreateSummaryDto {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  registeredAt: string;
  deliveryMethods?: DeliveryMethod[];
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paidAmount: number | null;
  totalAmount: number;
  discountPercent: number;
  finalAmount: number;
  patient: PatientDto;
  shift: { id: string; code: string; name: string | null } | null;
  sourceSubLab: { id: string; name: string } | null;
  testsCount: number;
  readyTestsCount: number;
  reportReady: boolean;
  resultStatus?: OrderResultStatus;
  resultSummary?: string | null;
  pendingTestsCount?: number;
  completedTestsCount?: number;
  verifiedTestsCount?: number;
  rejectedTestsCount?: number;
}

export async function getOrderPriceEstimate(
  testIds: string[],
  shiftId?: string | null,
  sourceSubLabId?: string | null,
): Promise<{ subtotal: number }> {
  const params: { testIds: string; shiftId?: string; sourceSubLabId?: string } = {
    testIds: testIds.join(','),
  };
  if (shiftId) params.shiftId = shiftId;
  if (sourceSubLabId) params.sourceSubLabId = sourceSubLabId;
  const res = await api.get<{ subtotal: number }>('/orders/estimate-price', { params });
  return res.data;
}

export async function createOrder(
  data: CreateOrderDto,
  options?: { view?: 'summary'; timeoutMs?: number },
): Promise<OrderCreateSummaryDto>;
export async function createOrder(
  data: CreateOrderDto,
  options: { view: 'full'; timeoutMs?: number },
): Promise<OrderDto>;
export async function createOrder(
  data: CreateOrderDto,
  options: { view?: CreateOrderView; timeoutMs?: number } = {},
): Promise<OrderCreateSummaryDto | OrderDto> {
  const view = options.view ?? 'summary';
  const timeout = options.timeoutMs ?? 15_000;
  const res = await api.post<OrderCreateSummaryDto | OrderDto>('/orders', data, {
    params: { view },
    timeout,
  });
  return res.data;
}

export async function searchOrders(params: OrderSearchParams): Promise<OrderSearchResult> {
  const res = await api.get<OrderSearchResult>('/orders', { params });
  return res.data;
}

function toHistoryItem(order: OrderDto): OrderHistoryItemDto {
  const rootTests = (order.samples ?? [])
    .flatMap((sample) => sample.orderTests ?? [])
    .filter((test) => !test.parentOrderTestId);
  const testsCount = rootTests.length > 0 ? rootTests.length : Number(order.testsCount ?? 0) || 0;
  let pendingTestsCount = 0;
  let completedTestsCount = 0;
  let verifiedTestsCount = 0;
  let rejectedTestsCount = 0;
  for (const test of rootTests) {
    if (test.status === 'COMPLETED') {
      completedTestsCount += 1;
    } else if (test.status === 'VERIFIED') {
      verifiedTestsCount += 1;
    } else if (test.status === 'REJECTED') {
      rejectedTestsCount += 1;
    } else {
      pendingTestsCount += 1;
    }
  }
  if (rootTests.length === 0 && testsCount > 0) {
    pendingTestsCount = Math.max(
      0,
      testsCount - completedTestsCount - verifiedTestsCount - rejectedTestsCount,
    );
  }
  const resultStatus: OrderResultStatus =
    rejectedTestsCount > 0
      ? 'REJECTED'
      : testsCount > 0 && verifiedTestsCount === testsCount
        ? 'VERIFIED'
        : completedTestsCount > 0 && completedTestsCount + verifiedTestsCount === testsCount
          ? 'COMPLETED'
          : 'PENDING';

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    registeredAt: order.registeredAt,
    deliveryMethods: order.deliveryMethods ?? [],
    paymentStatus: order.paymentStatus === 'paid' || order.paymentStatus === 'partial' ? order.paymentStatus : 'unpaid',
    paidAmount: order.paidAmount != null ? Number(order.paidAmount) : null,
    totalAmount: Number(order.totalAmount ?? 0),
    discountPercent: Number(order.discountPercent ?? 0),
    finalAmount: Number(order.finalAmount ?? 0),
    patient: order.patient,
    shift: order.shift,
    sourceSubLab: order.sourceSubLab ?? null,
    testsCount,
    readyTestsCount: Number(order.readyTestsCount ?? 0) || 0,
    reportReady:
      Boolean(order.reportReady) ||
      (testsCount > 0 && verifiedTestsCount === testsCount),
    resultStatus,
    resultSummary: null,
    pendingTestsCount,
    completedTestsCount,
    verifiedTestsCount,
    rejectedTestsCount,
  };
}

export async function searchOrdersHistory(params: OrderSearchParams): Promise<OrderHistorySearchResult> {
  try {
    const res = await api.get<OrderHistorySearchResult>('/orders/history', { params });
    return res.data;
  } catch (error: unknown) {
    if (!axios.isAxiosError(error) || error.response?.status !== 404) {
      throw error;
    }

    const fallback = await searchOrders(params);
    return {
      ...fallback,
      items: fallback.items.map(toHistoryItem),
    };
  }
}

export async function getOrder(
  id: string,
  options: { view?: OrderDetailView } = {},
): Promise<OrderDto> {
  const res = await api.get<OrderDto>(`/orders/${id}`, {
    params: options.view ? { view: options.view } : undefined,
  });
  return res.data;
}

export async function getSubLabPortalProfile(): Promise<{ id: string; name: string; labId: string }> {
  const res = await api.get<{ id: string; name: string; labId: string }>('/sub-lab/profile');
  return res.data;
}

export async function getSubLabPortalOrders(
  params: OrderSearchParams,
): Promise<OrderHistorySearchResult> {
  const res = await api.get<OrderHistorySearchResult>('/sub-lab/orders', { params });
  return res.data;
}

export async function getSubLabPortalOrder(orderId: string): Promise<OrderDto> {
  const res = await api.get<OrderDto>(`/sub-lab/orders/${orderId}`);
  return res.data;
}

export async function downloadSubLabTestResultsPDF(orderId: string): Promise<Blob> {
  const res = await api.get<Blob>(`/sub-lab/orders/${orderId}/results`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function getSubLabPortalStatistics(params: {
  startDate?: string;
  endDate?: string;
}): Promise<StatisticsDto> {
  const res = await api.get<StatisticsDto>('/sub-lab/statistics', { params });
  return res.data;
}

export async function updateOrderPayment(
  orderId: string,
  data: { paymentStatus: 'unpaid' | 'partial' | 'paid'; paidAmount?: number }
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/payment`, data);
  return res.data;
}

export async function updateOrderDiscount(
  orderId: string,
  data: { discountPercent: number },
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/discount`, data);
  return res.data;
}

export async function previewLabReportPdf(data: AdminReportPreviewRequest): Promise<Blob> {
  const res = await api.post<Blob>('/settings/lab/report-preview', data, {
    responseType: 'blob',
    timeout: ADMIN_WRITE_TIMEOUT_MS,
  });
  return res.data;
}

export async function updateOrderNotes(
  orderId: string,
  data: { notes?: string | null; sourceSubLabId?: string | null },
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/notes`, data);
  return res.data;
}

export async function updateOrderTests(
  orderId: string,
  data: {
    testIds: string[];
    forceRemoveVerified?: boolean;
    removalReason?: string;
  },
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/tests`, data);
  return res.data;
}

export async function updateOrderDeliveryMethods(
  orderId: string,
  data: { deliveryMethods?: DeliveryMethod[] },
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/delivery-methods`, data);
  return res.data;
}

export async function cancelOrder(
  orderId: string,
  data: { reason?: string } = {},
): Promise<OrderDto> {
  const res = await api.patch<OrderDto>(`/orders/${orderId}/cancel`, data);
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

export interface DownloadTestResultsPdfProfilingHeaders {
  correlationId?: string;
  totalMs?: string;
  snapshotMs?: string;
  verifierLookupMs?: string;
  assetsMs?: string;
  htmlMs?: string;
  renderMs?: string;
  fallbackMs?: string;
  cacheHit?: string;
  inFlightJoin?: string;
}

export interface DownloadTestResultsPdfResult {
  blob: Blob;
  profilingHeaders: DownloadTestResultsPdfProfilingHeaders;
}

function readResponseHeader(
  headers: unknown,
  key: string,
): string | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const value =
    (headers as Record<string, unknown>)[key] ??
    (headers as Record<string, unknown>)[key.toLowerCase()];

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' && first.trim() ? first : undefined;
  }

  return undefined;
}

export async function downloadTestResultsPDF(
  orderId: string,
  options?: { correlationId?: string },
): Promise<DownloadTestResultsPdfResult> {
  const res = await api.get(`/reports/orders/${orderId}/results`, {
    responseType: 'blob',
    headers: options?.correlationId
      ? {
        'x-report-print-attempt-id': options.correlationId,
      }
      : undefined,
  });

  return {
    blob: res.data,
    profilingHeaders: {
      correlationId: readResponseHeader(res.headers, 'x-report-print-attempt-id'),
      totalMs: readResponseHeader(res.headers, 'x-report-pdf-total-ms'),
      snapshotMs: readResponseHeader(res.headers, 'x-report-pdf-snapshot-ms'),
      verifierLookupMs: readResponseHeader(
        res.headers,
        'x-report-pdf-verifier-lookup-ms',
      ),
      assetsMs: readResponseHeader(res.headers, 'x-report-pdf-assets-ms'),
      htmlMs: readResponseHeader(res.headers, 'x-report-pdf-html-ms'),
      renderMs: readResponseHeader(res.headers, 'x-report-pdf-render-ms'),
      fallbackMs: readResponseHeader(res.headers, 'x-report-pdf-fallback-ms'),
      cacheHit: readResponseHeader(res.headers, 'x-report-pdf-cache-hit'),
      inFlightJoin: readResponseHeader(res.headers, 'x-report-pdf-inflight-join'),
    },
  };
}

export type ReportActionKind = 'PDF' | 'PRINT' | 'WHATSAPP' | 'VIBER';

export interface ReportActionFlagsDto {
  pdf: boolean;
  print: boolean;
  whatsapp: boolean;
  viber: boolean;
  timestamps?: {
    pdf?: string | null;
    print?: string | null;
    whatsapp?: string | null;
    viber?: string | null;
  };
}

export async function logReportAction(orderId: string, action: ReportActionKind): Promise<void> {
  await api.post(`/reports/orders/${orderId}/action-log`, { action });
}

export async function getReportActionFlags(
  orderIds: string[],
): Promise<Record<string, ReportActionFlagsDto>> {
  if (orderIds.length === 0) {
    return {};
  }
  const res = await api.get<Record<string, ReportActionFlagsDto>>('/reports/orders/action-flags', {
    params: { orderIds: orderIds.join(',') },
  });
  return res.data;
}

export async function logReportDelivery(orderId: string, channel: 'WHATSAPP' | 'VIBER'): Promise<void> {
  await logReportAction(orderId, channel);
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
  /** Optional parameter-specific unit for parameter-style panels such as GUE/GSE. */
  unit?: string | null;
}

export interface TestNumericAgeRange {
  sex: 'ANY' | 'M' | 'F';
  ageUnit?: TestNumericAgeUnit | null;
  minAge?: number | null;
  maxAge?: number | null;
  minAgeYears?: number | null;
  maxAgeYears?: number | null;
  normalMin?: number | null;
  normalMax?: number | null;
}

export type TestNumericAgeUnit = 'DAY' | 'MONTH' | 'YEAR';

export interface TestCultureConfig {
  interpretationOptions: string[];
  micUnit?: string | null;
}

export interface CultureResultAntibioticRow {
  antibioticId?: string | null;
  antibioticCode?: string | null;
  antibioticName?: string | null;
  interpretation: string;
  mic?: string | null;
}

export interface CultureResultIsolate {
  isolateKey: string;
  organism: string;
  source?: string | null;
  condition?: string | null;
  colonyCount?: string | null;
  comment?: string | null;
  antibiotics: CultureResultAntibioticRow[];
}

export interface CultureResultPayload {
  noGrowth: boolean;
  noGrowthResult?: string | null;
  notes?: string | null;
  isolates: CultureResultIsolate[];
}

export interface ResultDocumentDto {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string | null;
  uploadedBy: string | null;
}

export type TestResultEntryType =
  | 'NUMERIC'
  | 'QUALITATIVE'
  | 'TEXT'
  | 'CULTURE_SENSITIVITY'
  | 'PDF_UPLOAD';

export interface TestResultTextOption {
  value: string;
  flag?: ResultFlag | null;
  isDefault?: boolean;
}

export interface TestPanelComponent {
  childTestId: string;
  required: boolean;
  sortOrder: number;
  reportSection: string | null;
  reportGroup: string | null;
  childTest?: {
    id: string;
    code: string;
    name: string;
    type: TestType;
    unit: string | null;
    isActive: boolean;
  };
}

export interface TestDto {
  id: string;
  code: string;
  name: string;
  abbreviation: string | null;
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
  normalTextMale: string | null;
  normalTextFemale: string | null;
  numericAgeRanges: TestNumericAgeRange[] | null;
  resultEntryType: TestResultEntryType;
  resultTextOptions: TestResultTextOption[] | null;
  allowCustomResultText: boolean;
  allowPanelSaveWithChildDefaults: boolean;
  showPanelUnitColumnInReport: boolean;
  cultureConfig: TestCultureConfig | null;
  cultureAntibioticIds?: string[];
  panelComponents?: TestPanelComponent[];
  description: string | null;
  childTestIds: string | null;
  parameterDefinitions: TestParameterDefinition[] | null;
  departmentId: string | null;
  isActive: boolean;
  sortOrder: number;
  defaultPrice?: number | null;
  expectedCompletionMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestDto {
  code: string;
  name: string;
  abbreviation: string;
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
  normalTextMale?: string | null;
  normalTextFemale?: string | null;
  numericAgeRanges?: TestNumericAgeRange[] | null;
  resultEntryType?: TestResultEntryType;
  resultTextOptions?: TestResultTextOption[] | null;
  allowCustomResultText?: boolean;
  allowPanelSaveWithChildDefaults?: boolean;
  showPanelUnitColumnInReport?: boolean;
  cultureConfig?: TestCultureConfig | null;
  cultureAntibioticIds?: string[] | null;
  panelComponents?: TestPanelComponent[] | null;
  panelComponentTestIds?: string[] | null;
  description?: string;
  childTestIds?: string;
  parameterDefinitions?: TestParameterDefinition[] | null;
  departmentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  expectedCompletionMinutes?: number | null;
}

export interface AntibioticDto {
  id: string;
  labId: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAntibioticDto {
  code: string;
  name: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function getAntibiotics(includeInactive = false): Promise<AntibioticDto[]> {
  const res = await api.get<AntibioticDto[]>('/antibiotics', {
    params: includeInactive ? { includeInactive: 'true' } : undefined,
  });
  return res.data;
}

export async function createAntibiotic(data: CreateAntibioticDto): Promise<AntibioticDto> {
  const res = await api.post<AntibioticDto>('/antibiotics', data);
  return res.data;
}

export async function updateAntibiotic(
  id: string,
  data: Partial<CreateAntibioticDto>,
): Promise<AntibioticDto> {
  const res = await api.patch<AntibioticDto>(`/antibiotics/${id}`, data);
  return res.data;
}

export async function deleteAntibiotic(id: string): Promise<void> {
  await api.delete(`/antibiotics/${id}`);
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

export async function seedUrinalysisTests(): Promise<SeedResult> {
  const res = await api.post<SeedResult>('/tests/seed/urinalysis');
  return res.data;
}

export async function seedAllTests(): Promise<{
  cbc: SeedResult;
  chemistry: SeedResult;
  urinalysis: SeedResult;
  total: { created: number; skipped: number };
}> {
  const res = await api.post<{
    cbc: SeedResult;
    chemistry: SeedResult;
    urinalysis: SeedResult;
    total: { created: number; skipped: number };
  }>('/tests/seed/all');
  return res.data;
}

// Worklist
export type ResultFlag = 'N' | 'H' | 'L' | 'POS' | 'NEG' | 'ABN';

export const ResultFlag = {
  NORMAL: 'N' as const,
  HIGH: 'H' as const,
  LOW: 'L' as const,
  POSITIVE: 'POS' as const,
  NEGATIVE: 'NEG' as const,
  ABNORMAL: 'ABN' as const,
};

export interface WorklistItem {
  id: string;
  testId: string;
  orderNumber: string;
  orderId: string;
  sampleId: string;
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
  allowPanelSaveWithChildDefaults: boolean;
  cultureConfig: TestCultureConfig | null;
  cultureAntibioticIds: string[];
  tubeType: string | null;
  status: OrderTestStatus;
  resultValue: number | null;
  resultText: string | null;
  cultureResult: CultureResultPayload | null;
  flag: ResultFlag | null;
  resultedAt: string | null;
  resultedBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  registeredAt: string;
  parentOrderTestId: string | null;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  parameterDefinitions: TestParameterDefinition[] | null;
  resultParameters: Record<string, string> | null;
  resultDocument: ResultDocumentDto | null;
  rejectionReason: string | null;
  sortOrder: number;
  panelSortOrder: number | null;
}

export async function enterResult(
  id: string,
  data: {
    resultValue?: number | null;
    resultText?: string | null;
    comments?: string | null;
    resultParameters?: Record<string, string> | null;
    cultureResult?: CultureResultPayload | null;
    forceEditVerified?: boolean;
  }
): Promise<void> {
  await api.patch(`/worklist/${id}/result`, data);
}

export async function uploadResultDocument(
  id: string,
  file: File,
  options?: { forceEditVerified?: boolean },
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.forceEditVerified) {
    formData.append('forceEditVerified', 'true');
  }
  await api.post(`/worklist/order-tests/${id}/result-document`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function removeResultDocument(
  id: string,
  options?: { forceEditVerified?: boolean },
): Promise<void> {
  await api.delete(`/worklist/order-tests/${id}/result-document`, {
    params: options?.forceEditVerified ? { forceEditVerified: 'true' } : undefined,
  });
}

export async function downloadResultDocument(
  id: string,
  options?: { download?: boolean },
): Promise<Blob> {
  const res = await api.get(`/worklist/order-tests/${id}/result-document`, {
    params: options?.download ? { download: 'true' } : undefined,
    responseType: 'blob',
  });
  return res.data;
}

export async function batchEnterResults(
  updates: Array<{
    orderTestId: string;
    resultValue?: number | null;
    resultText?: string | null;
    comments?: string | null;
    resultParameters?: Record<string, string> | null;
    cultureResult?: CultureResultPayload | null;
    forceEditVerified?: boolean;
  }>
): Promise<void> {
  await api.patch('/worklist/batch-result', { updates });
}

export interface WorklistParams {
  status?: OrderTestStatus[];
  search?: string;
  date?: string;
  departmentId?: string;
  page?: number;
  size?: number;
  view?: 'full' | 'verify';
}

export interface WorklistResult {
  items: WorklistItem[];
  total: number;
}

export type WorklistOrderMode = 'entry' | 'verify';
export type WorklistEntryStatusFilter = 'pending' | 'completed';
export type VerificationRowStatusFilter = 'unverified' | 'verified';

export interface WorklistOrderSummaryDto {
  orderId: string;
  orderNumber: string;
  registeredAt: string;
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

export interface WorklistOrderSummaryResult {
  items: WorklistOrderSummaryDto[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface WorklistOrderModalDto {
  orderId: string;
  orderNumber: string;
  registeredAt: string;
  patientName: string;
  patientSex: string | null;
  patientAge: number | null;
  patientAgeDisplay: string | null;
  items: WorklistItem[];
}

export interface WorklistStats {
  pending: number;
  completed: number;
  verified: number;
  rejected: number;
}

export interface CultureEntryHistoryDto {
  microorganisms: string[];
  conditions: string[];
  colonyCounts: string[];
}

export async function getWorklist(params: WorklistParams): Promise<WorklistResult> {
  const queryParams: Record<string, string> = {};
  if (params.status?.length) queryParams.status = params.status.join(',');
  if (params.search) queryParams.search = params.search;
  if (params.date) queryParams.date = params.date;
  if (params.departmentId) queryParams.departmentId = params.departmentId;
  if (params.page) queryParams.page = params.page.toString();
  if (params.size) queryParams.size = params.size.toString();
  if (params.view) queryParams.view = params.view;

  const res = await api.get<WorklistResult>('/worklist', { params: queryParams });
  return res.data;
}

export async function getWorklistItemDetail(id: string): Promise<WorklistItem> {
  const res = await api.get<WorklistItem>(`/worklist/${id}/detail`);
  return res.data;
}

export async function getWorklistOrders(params: {
  search?: string;
  date?: string;
  departmentId?: string;
  page?: number;
  size?: number;
  mode?: WorklistOrderMode;
  entryStatus?: WorklistEntryStatusFilter;
  verificationStatus?: VerificationRowStatusFilter;
}): Promise<WorklistOrderSummaryResult> {
  const queryParams: Record<string, string> = {};
  if (params.search) queryParams.search = params.search;
  if (params.date) queryParams.date = params.date;
  if (params.departmentId) queryParams.departmentId = params.departmentId;
  if (params.page) queryParams.page = params.page.toString();
  if (params.size) queryParams.size = params.size.toString();
  if (params.mode) queryParams.mode = params.mode;
  if (params.entryStatus) queryParams.entryStatus = params.entryStatus;
  if (params.verificationStatus) queryParams.verificationStatus = params.verificationStatus;

  const res = await api.get<WorklistOrderSummaryResult>('/worklist/orders', {
    params: queryParams,
  });
  return res.data;
}

export async function getWorklistOrderTests(
  orderId: string,
  params: {
    mode?: WorklistOrderMode;
    departmentId?: string;
  } = {},
): Promise<WorklistOrderModalDto> {
  const queryParams: Record<string, string> = {};
  if (params.mode) queryParams.mode = params.mode;
  if (params.departmentId) queryParams.departmentId = params.departmentId;
  const res = await api.get<WorklistOrderModalDto>(`/worklist/orders/${orderId}/tests`, {
    params: queryParams,
  });
  return res.data;
}

export async function getWorklistStats(): Promise<WorklistStats> {
  const res = await api.get<WorklistStats>('/worklist/stats');
  return res.data;
}

export async function getCultureEntryHistory(): Promise<CultureEntryHistoryDto> {
  const res = await api.get<CultureEntryHistoryDto>('/worklist/culture-entry-history');
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
  reportDesignFingerprint: string;
  dashboardAnnouncementText: string | null;
  labelSequenceBy: 'tube_type' | 'department';
  sequenceResetBy: 'day' | 'shift';
  enableOnlineResults: boolean;
  onlineResultWatermarkDataUrl: string | null;
  onlineResultWatermarkText: string | null;
  printing: {
    mode: 'browser' | 'direct_gateway';
    receiptPrinterName: string | null;
    labelsPrinterName: string | null;
    reportPrinterName: string | null;
  };
  reportBranding: ReportBrandingDto;
  reportStyle: ReportStyleDto | null;
  uiTestGroups?: { id: string; name: string; testIds: string[] }[];
  referringDoctors?: string[];
}

export async function getLabSettings(): Promise<LabSettingsDto> {
  const res = await api.get<LabSettingsDto>('/settings/lab');
  return res.data;
}

export interface UpdateLabSettingsDto {
  labelSequenceBy?: 'tube_type' | 'department';
  sequenceResetBy?: 'day' | 'shift';
  enableOnlineResults?: boolean;
  onlineResultWatermarkDataUrl?: string | null;
  onlineResultWatermarkText?: string | null;
  printing?: {
    mode?: 'browser' | 'direct_gateway';
    receiptPrinterName?: string | null;
    labelsPrinterName?: string | null;
    reportPrinterName?: string | null;
  };
  reportBranding?: Partial<ReportBrandingDto>;
  reportStyle?: ReportStyleDto | null;
  uiTestGroups?: { id: string; name: string; testIds: string[] }[] | null;
  referringDoctors?: string[] | null;
}

export async function updateLabSettings(data: UpdateLabSettingsDto): Promise<LabSettingsDto> {
  const res = await api.patch<LabSettingsDto>('/settings/lab', data);
  return res.data;
}

export interface ReportThemeDto {
  id: string;
  name: string;
  reportStyle: ReportStyleDto;
  reportBranding: ReportBrandingDto;
  onlineResultWatermarkDataUrl: string | null;
  onlineResultWatermarkText: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getReportThemes(): Promise<ReportThemeDto[]> {
  const res = await api.get<ReportThemeDto[]>('/settings/lab/themes');
  return res.data;
}

export async function saveReportTheme(data: {
  name: string;
  reportStyle: ReportStyleDto;
  reportBranding: Partial<ReportBrandingDto>;
  onlineResultWatermarkDataUrl: string | null;
  onlineResultWatermarkText: string | null;
}): Promise<ReportThemeDto> {
  const res = await api.post<ReportThemeDto>('/settings/lab/themes', data);
  return res.data;
}

export async function applyReportTheme(id: string): Promise<LabSettingsDto> {
  const res = await api.post<LabSettingsDto>(`/settings/lab/themes/${id}/apply`);
  return res.data;
}

export async function deleteReportTheme(id: string): Promise<void> {
  await api.delete(`/settings/lab/themes/${id}`);
}

export interface SubLabOptionDto {
  id: string;
  name: string;
}

export interface SubLabListItemDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  username: string | null;
  priceCount: number;
}

export interface SubLabPriceDto {
  id?: string;
  testId: string;
  price: number;
}

export interface SubLabDetailDto {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  username: string | null;
  prices: SubLabPriceDto[];
}

export interface SaveSubLabRequest {
  name: string;
  username: string;
  password?: string;
  isActive?: boolean;
  prices?: Array<{ testId: string; price: number }>;
}

export async function getSubLabOptions(): Promise<SubLabOptionDto[]> {
  const res = await api.get<SubLabOptionDto[]>('/settings/sub-labs/options');
  return res.data;
}

export async function getSubLabs(): Promise<SubLabListItemDto[]> {
  const res = await api.get<SubLabListItemDto[]>('/settings/sub-labs');
  return res.data;
}

export async function getSubLab(id: string): Promise<SubLabDetailDto> {
  const res = await api.get<SubLabDetailDto>(`/settings/sub-labs/${id}`);
  return res.data;
}

export async function createSubLab(data: SaveSubLabRequest): Promise<SubLabDetailDto> {
  const res = await api.post<SubLabDetailDto>('/settings/sub-labs', data);
  return res.data;
}

export async function updateSubLab(
  id: string,
  data: SaveSubLabRequest,
): Promise<SubLabDetailDto> {
  const res = await api.patch<SubLabDetailDto>(`/settings/sub-labs/${id}`, data);
  return res.data;
}

export async function deleteSubLab(id: string): Promise<void> {
  await api.delete(`/settings/sub-labs/${id}`);
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
  bidirectionalEnabled: boolean;
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

export interface SendInstrumentTestOrderRequest {
  orderNumber: string;
  /** @deprecated Legacy alias accepted by backend for compatibility. */
  orderId?: string;
  patientId: string;
  patientName: string;
  patientDob?: string;
  patientSex?: string;
  priority?: string;
  tests: Array<{ code: string; name?: string }>;
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

export async function sendInstrumentTestOrder(
  id: string,
  data: SendInstrumentTestOrderRequest,
): Promise<{ success: boolean; message: string }> {
  const res = await api.post<{ success: boolean; message: string }>(`/instruments/${id}/send-test-order`, data);
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
