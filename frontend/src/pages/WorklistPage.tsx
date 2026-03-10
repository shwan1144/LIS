import { useCallback, useEffect, useMemo, useState, type Key } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  enterResult,
  getDepartments,
  getWorklistOrderTests,
  getWorklistOrders,
  getWorklistStats,
  type DepartmentDto,
  type ResultFlag,
  type TestParameterDefinition,
  type WorklistEntryStatusFilter,
  type WorklistItem,
  type WorklistOrderModalDto,
  type WorklistOrderSummaryDto,
  type WorklistStats,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import { useFillToViewportBottom } from '../hooks/useFillToViewportBottom';
import {
  RESULT_FLAG_COLOR as FLAG_COLOR,
  RESULT_FLAG_LABEL as FLAG_LABEL,
  normalizeResultFlag,
} from '../utils/result-flag';
import {
  buildWorklistOrderGroups,
  type WorklistOrderGroupSummary,
} from './worklistGrouping';
import './QueuePages.css';

const { Title, Text } = Typography;

interface GroupedOrderCache {
  order: WorklistOrderModalDto;
  groups: WorklistOrderGroupSummary[];
  appliedDepartmentId: string | null;
}

function resolveFlagFromResultText(
  resultText: string | null,
  options: Array<{ value: string; flag?: string | null }> | null | undefined,
): ResultFlag | null {
  if (!resultText || !options?.length) return null;
  const candidate = resultText.trim().toLowerCase();
  const matched = options.find((option) => option.value.trim().toLowerCase() === candidate);
  return normalizeResultFlag(matched?.flag ?? null);
}

function calculateNumericFlagFromRange(
  resultValue: number | null,
  normalMin: number | null,
  normalMax: number | null,
): ResultFlag | null {
  if (resultValue === null) return null;
  if (normalMin === null && normalMax === null) return null;

  if (normalMax !== null && resultValue > normalMax) {
    return 'H';
  }

  if (normalMin !== null && resultValue < normalMin) {
    return 'L';
  }

  return 'N';
}

function normalizeNumericResultInput(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace(',', '.');
  const numericPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;
  if (!numericPattern.test(normalized)) {
    return null;
  }
  return normalized;
}

function formatReferenceRange(item: WorklistItem): string {
  if (item.normalText && item.normalText.length > 0) return item.normalText;
  if (item.normalMin != null || item.normalMax != null) {
    return `${item.normalMin ?? '-'} - ${item.normalMax ?? '-'}${item.testUnit ? ` ${item.testUnit}` : ''}`;
  }
  return '-';
}

function sortModalItems(items: WorklistItem[]): WorklistItem[] {
  const roots = items.filter((item) => !item.parentOrderTestId);
  const rootIds = new Set(roots.map((item) => item.id));
  const children = items.filter((item) => Boolean(item.parentOrderTestId));

  const sortByOrder = (a: WorklistItem, b: WorklistItem) => {
    const aOrder = a.panelSortOrder ?? 9999;
    const bOrder = b.panelSortOrder ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.testCode.localeCompare(b.testCode);
  };

  const singleRoots = roots
    .filter((item) => item.testType !== 'PANEL')
    .sort(sortByOrder);
  const panelRoots = roots
    .filter((item) => item.testType === 'PANEL')
    .sort(sortByOrder);

  const childrenByParent = new Map<string, WorklistItem[]>();
  for (const child of children) {
    const parentId = child.parentOrderTestId;
    if (!parentId) continue;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(child);
    childrenByParent.set(parentId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(sortByOrder);
  }

  const ordered: WorklistItem[] = [...singleRoots];
  for (const panelRoot of panelRoots) {
    ordered.push(panelRoot);
    ordered.push(...(childrenByParent.get(panelRoot.id) ?? []));
  }

  const orphanChildren = children
    .filter((item) => !rootIds.has(item.parentOrderTestId ?? ''))
    .sort(sortByOrder);
  ordered.push(...orphanChildren);

  return ordered;
}

function buildInitialFormValues(items: WorklistItem[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const target of items) {
    if (target.testType === 'PANEL') {
      continue;
    }

    const existingParams = target.resultParameters ?? {};
    const defsByCode = new Map(
      (target.parameterDefinitions ?? []).map((definition) => [
        definition.code,
        definition,
      ]),
    );

    const resultParametersInitial: Record<string, string> = {};
    const resultParametersCustomInitial: Record<string, string> = {};
    const defaults: Record<string, string> = {};

    (target.parameterDefinitions ?? []).forEach((definition) => {
      if (
        definition.defaultValue != null &&
        definition.defaultValue.trim() !== '' &&
        (existingParams[definition.code] == null ||
          String(existingParams[definition.code]).trim() === '')
      ) {
        defaults[definition.code] = definition.defaultValue.trim();
      }
    });

    for (const [code, rawValue] of Object.entries(existingParams)) {
      const value = rawValue != null ? String(rawValue).trim() : '';
      if (!value) continue;
      const definition = defsByCode.get(code);
      if (definition?.type === 'select') {
        const known = new Set(
          (definition.options ?? []).map((option) => option.trim().toLowerCase()),
        );
        if (known.size > 0 && !known.has(value.toLowerCase())) {
          resultParametersInitial[code] = '__other__';
          resultParametersCustomInitial[code] = value;
          continue;
        }
      }
      resultParametersInitial[code] = value;
    }

    const qualitativeOptions = target.resultTextOptions ?? [];
    const defaultQualitativeOption =
      qualitativeOptions.find((option) => option.isDefault)?.value ??
      qualitativeOptions[0]?.value;
    const knownOptionValues = new Set(
      qualitativeOptions.map((option) => option.value.trim().toLowerCase()),
    );

    let initialResultText = target.resultText ?? undefined;
    let customResultText: string | undefined;

    if (target.resultEntryType === 'QUALITATIVE') {
      if (!initialResultText && defaultQualitativeOption) {
        initialResultText = defaultQualitativeOption;
      }
      if (
        initialResultText &&
        target.allowCustomResultText &&
        !knownOptionValues.has(initialResultText.trim().toLowerCase())
      ) {
        customResultText = initialResultText;
        initialResultText = '__other__';
      }
    }

    const numericResultText = normalizeNumericResultInput(target.resultText);
    const numericInitialValue =
      target.resultEntryType === 'NUMERIC'
        ? (numericResultText ??
          (target.resultValue !== null && target.resultValue !== undefined
            ? String(target.resultValue)
            : undefined))
        : undefined;

    values[target.id] = {
      resultValue:
        target.resultEntryType === 'QUALITATIVE' || target.resultEntryType === 'TEXT'
          ? undefined
          : numericInitialValue,
      resultText: initialResultText,
      customResultText,
      resultParameters: { ...defaults, ...resultParametersInitial },
      resultParametersCustom: resultParametersCustomInitial,
    };
  }

  return values;
}

function resolveGroupByIdentity(
  groups: WorklistOrderGroupSummary[],
  currentGroup: WorklistOrderGroupSummary | null,
): WorklistOrderGroupSummary | null {
  if (groups.length === 0) return null;
  if (!currentGroup) return groups[0] ?? null;
  if (currentGroup.groupKind === 'single') {
    return groups.find((group) => group.groupKind === 'single') ?? null;
  }
  if (currentGroup.panelRootId) {
    return (
      groups.find(
        (group) =>
          group.groupKind === 'panel' &&
          group.panelRootId === currentGroup.panelRootId,
      ) ?? null
    );
  }
  return groups.find((group) => group.groupId === currentGroup.groupId) ?? null;
}

export function WorklistPage() {
  const { user } = useAuth();
  const isDark = useTheme().theme === 'dark';
  const { containerRef, filledMinHeightPx } = useFillToViewportBottom();
  const canAdminEditVerified =
    user?.role === 'LAB_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WorklistOrderSummaryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WorklistStats | null>(null);

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [entryStatusFilter, setEntryStatusFilter] =
    useState<WorklistEntryStatusFilter>('pending');
  const [departmentId, setDepartmentId] = useState<string | ''>('');
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(25);

  const [expandedOrderKeys, setExpandedOrderKeys] = useState<Key[]>([]);
  const [groupsByOrderKey, setGroupsByOrderKey] = useState<
    Record<string, GroupedOrderCache>
  >({});
  const [expandingOrderId, setExpandingOrderId] = useState<string | null>(null);
  const [entryLoadingGroupKey, setEntryLoadingGroupKey] = useState<string | null>(
    null,
  );

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [modalOrder, setModalOrder] = useState<WorklistOrderModalDto | null>(null);
  const [modalGroup, setModalGroup] = useState<WorklistOrderGroupSummary | null>(
    null,
  );
  const [modalLoading, setModalLoading] = useState(false);
  const [modalAppliedDepartmentId, setModalAppliedDepartmentId] = useState<string | null>(null);
  const [loadingAllTests, setLoadingAllTests] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [liveFlags, setLiveFlags] = useState<Record<string, ResultFlag | null>>({});
  const [resultForm] = Form.useForm<any>();

  const orderCacheKey = useCallback(
    (orderId: string, appliedDepartmentId?: string | null) =>
      `${orderId}::${appliedDepartmentId ?? (departmentId || 'all')}`,
    [departmentId],
  );

  const closeEntryModal = useCallback(() => {
    setResultModalOpen(false);
    setModalOrder(null);
    setModalGroup(null);
    setModalAppliedDepartmentId(null);
    setLoadingAllTests(false);
    setLiveFlags({});
    resultForm.resetFields();
  }, [resultForm]);

  const hydrateModalPayload = useCallback(
    (
      payload: WorklistOrderModalDto,
      group: WorklistOrderGroupSummary,
      appliedDepartmentId: string | null,
    ) => {
      setModalOrder(payload);
      setModalGroup(group);
      setModalAppliedDepartmentId(appliedDepartmentId);
      const sortedItems = sortModalItems(group.items);
      resultForm.setFieldsValue(buildInitialFormValues(sortedItems));
      const initialFlags: Record<string, ResultFlag | null> = {};
      for (const item of sortedItems) {
        if (item.testType !== 'PANEL') {
          initialFlags[item.id] = item.flag ?? null;
        }
      }
      setLiveFlags(initialFlags);
    },
    [resultForm],
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWorklistOrders({
        mode: 'entry',
        search: search.trim() || undefined,
        date: dateFilter?.format('YYYY-MM-DD'),
        entryStatus: entryStatusFilter,
        departmentId: departmentId || undefined,
        page,
        size,
      });
      setRows(result.items ?? []);
      setTotal(Number(result.total ?? 0));
    } catch {
      message.error('Failed to load worklist');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, departmentId, entryStatusFilter, page, search, size]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getWorklistStats();
      setStats(result);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void getDepartments()
      .then(setDepartments)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setExpandedOrderKeys([]);
  }, [departmentId, entryStatusFilter, page]);

  const loadOrderGroups = useCallback(
    async (
      orderId: string,
      options?: { force?: boolean; departmentOverride?: string | null },
    ): Promise<GroupedOrderCache | null> => {
      const appliedDepartmentId =
        options?.departmentOverride !== undefined
          ? options.departmentOverride
          : (departmentId || null);
      const key = orderCacheKey(orderId, appliedDepartmentId);
      const cached = groupsByOrderKey[key];
      if (!options?.force && cached) {
        return cached;
      }

      setExpandingOrderId(orderId);
      try {
        const payload = await getWorklistOrderTests(orderId, {
          mode: 'entry',
          departmentId: appliedDepartmentId ?? undefined,
        });
        const nextCache: GroupedOrderCache = {
          order: payload,
          groups: buildWorklistOrderGroups(payload.items),
          appliedDepartmentId,
        };
        setGroupsByOrderKey((previous) => ({ ...previous, [key]: nextCache }));
        return nextCache;
      } catch {
        message.error('Failed to load order tests');
        return null;
      } finally {
        setExpandingOrderId((current) => (current === orderId ? null : current));
      }
    },
    [departmentId, groupsByOrderKey, orderCacheKey],
  );

  const getCachedGroupsForOrder = useCallback(
    (orderId: string) => groupsByOrderKey[orderCacheKey(orderId)] ?? null,
    [groupsByOrderKey, orderCacheKey],
  );

  const orderedModalItems = useMemo(
    () => sortModalItems(modalGroup?.items ?? []),
    [modalGroup],
  );

  const isEditableTarget = useCallback(
    (item: WorklistItem) => {
      if (item.testType === 'PANEL') return false;
      if (item.status === 'VERIFIED' && !canAdminEditVerified) return false;
      return true;
    },
    [canAdminEditVerified],
  );

  const editableTargetIds = useMemo(
    () =>
      orderedModalItems
        .filter((item) => isEditableTarget(item))
        .map((item) => item.id),
    [isEditableTarget, orderedModalItems],
  );

  const modalDepartment = useMemo(
    () =>
      modalAppliedDepartmentId
        ? departments.find((department) => department.id === modalAppliedDepartmentId) ?? null
        : null,
    [departments, modalAppliedDepartmentId],
  );

  const showLoadAllTestsHint = Boolean(
    modalAppliedDepartmentId &&
    modalOrder &&
    editableTargetIds.length === 0,
  );

  const firstPanelIndex = useMemo(
    () =>
      orderedModalItems.findIndex(
        (item) => item.testType === 'PANEL' && !item.parentOrderTestId,
      ),
    [orderedModalItems],
  );

  const focusNextEditableInput = useCallback(
    (currentTargetId: string) => {
      const idx = editableTargetIds.indexOf(currentTargetId);
      if (idx < 0) return;
      const nextTargetId = editableTargetIds[idx + 1];
      if (!nextTargetId) return;
      const targetRoot = document.querySelector(
        `[data-entry-target-id="${nextTargetId}"]`,
      ) as HTMLElement | null;
      if (!targetRoot) return;

      const focusTarget =
        targetRoot.matches('input,textarea')
          ? targetRoot
          : (targetRoot.querySelector('input,textarea') as HTMLElement | null);
      (focusTarget ?? targetRoot).focus();
    },
    [editableTargetIds],
  );

  const recomputeLiveFlags = useCallback(
    (allValues: Record<string, any>) => {
      const nextFlags: Record<string, ResultFlag | null> = {};

      for (const target of orderedModalItems) {
        if (target.testType === 'PANEL') continue;

        const values = allValues[target.id] ?? {};
        const resultEntryType = target.resultEntryType ?? 'NUMERIC';
        let resultText =
          values.resultText != null ? String(values.resultText).trim() : '';
        if (resultText === '__other__') {
          resultText =
            values.customResultText != null
              ? String(values.customResultText).trim()
              : '';
        }

        if (resultEntryType === 'QUALITATIVE' || resultEntryType === 'TEXT') {
          nextFlags[target.id] =
            resolveFlagFromResultText(
              resultText || null,
              target.resultTextOptions ?? null,
            ) ?? target.flag ?? null;
          continue;
        }

        const optionFlag = resolveFlagFromResultText(
          resultText || null,
          target.resultTextOptions ?? null,
        );
        if (optionFlag) {
          nextFlags[target.id] = optionFlag;
          continue;
        }

        const normalizedNumericInput = normalizeNumericResultInput(values.resultValue);
        const numericValue =
          normalizedNumericInput === null ? null : Number(normalizedNumericInput);
        const safeNumericValue =
          numericValue != null && Number.isFinite(numericValue)
            ? numericValue
            : null;

        nextFlags[target.id] =
          calculateNumericFlagFromRange(
            safeNumericValue,
            target.normalMin ?? null,
            target.normalMax ?? null,
          ) ?? target.flag ?? null;
      }

      setLiveFlags(nextFlags);
    },
    [orderedModalItems],
  );

  const openEntryModalForGroup = useCallback(
    async (orderId: string, group: WorklistOrderGroupSummary) => {
      setEntryLoadingGroupKey(`${orderId}:${group.groupId}`);
      setModalLoading(true);
      try {
        const cached = await loadOrderGroups(orderId);
        if (!cached) return;
        let nextPayload = cached.order;
        let nextAppliedDepartmentId = cached.appliedDepartmentId;
        let nextGroup = resolveGroupByIdentity(cached.groups, group);
        if (!nextGroup) {
          message.warning('This test group is no longer available in current filter');
          return;
        }
        if (nextGroup.groupKind === 'panel' && nextGroup.testsCount === 0) {
          if (cached.appliedDepartmentId) {
            const fullPayload = await getWorklistOrderTests(orderId, {
              mode: 'entry',
            });
            const fullGroups = buildWorklistOrderGroups(fullPayload.items);
            const resolvedFullGroup = resolveGroupByIdentity(fullGroups, nextGroup);
            if (resolvedFullGroup && resolvedFullGroup.testsCount > 0) {
              const fullKey = orderCacheKey(orderId, null);
              setGroupsByOrderKey((previous) => ({
                ...previous,
                [fullKey]: {
                  order: fullPayload,
                  groups: fullGroups,
                  appliedDepartmentId: null,
                },
              }));
              nextPayload = fullPayload;
              nextAppliedDepartmentId = null;
              nextGroup = resolvedFullGroup;
              message.info(
                'Loaded this panel from all departments because current filter has no panel children.',
              );
            } else {
              message.warning('This panel has no child tests in this order.');
            }
          } else {
            message.warning('This panel has no child tests in this order.');
          }
        }
        hydrateModalPayload(nextPayload, nextGroup, nextAppliedDepartmentId);
        setResultModalOpen(true);
      } finally {
        setModalLoading(false);
        setEntryLoadingGroupKey(null);
      }
    },
    [hydrateModalPayload, loadOrderGroups, orderCacheKey],
  );

  const handleLoadAllOrderTests = useCallback(async () => {
    if (!modalOrder) return;
    setLoadingAllTests(true);
    try {
      const payload = await getWorklistOrderTests(modalOrder.orderId, {
        mode: 'entry',
      });
      const groups = buildWorklistOrderGroups(payload.items);
      const nextGroup = resolveGroupByIdentity(groups, modalGroup);
      if (!nextGroup) {
        message.warning('No groups available in this order');
        return;
      }
      const key = orderCacheKey(modalOrder.orderId, null);
      setGroupsByOrderKey((previous) => ({
        ...previous,
        [key]: {
          order: payload,
          groups,
          appliedDepartmentId: null,
        },
      }));
      hydrateModalPayload(payload, nextGroup, null);
      message.success('Loaded all tests for this order');
    } catch {
      message.error('Failed to load all tests for this order');
    } finally {
      setLoadingAllTests(false);
    }
  }, [hydrateModalPayload, modalGroup, modalOrder, orderCacheKey]);

  const handleSearch = () => {
    setPage(1);
    void loadRows();
  };

  const handleSubmitResult = async (values: Record<string, any>) => {
    if (!modalOrder) return;
    const targets = orderedModalItems.filter((item) => isEditableTarget(item));
    if (targets.length === 0) {
      const hasVerifiedTargets = orderedModalItems.some(
        (item) => item.testType !== 'PANEL' && item.status === 'VERIFIED',
      );
      if (showLoadAllTestsHint) {
        message.info(
          'No editable tests in current department view. Use "Load all tests for this order".',
        );
      } else if (!canAdminEditVerified && hasVerifiedTargets) {
        message.info('All tests are verified and read-only for your role.');
      } else {
        message.info('No editable tests in this group');
      }
      return;
    }

    const verifiedOverrideCount = targets.filter(
      (target) => canAdminEditVerified && target.status === 'VERIFIED',
    ).length;

    if (verifiedOverrideCount > 0) {
      const proceed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: 'Edit verified results?',
          content: 'You are editing verified result(s). Continue?',
          okText: 'Continue',
          cancelText: 'Cancel',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!proceed) {
        return;
      }
    }

    setSubmitting(true);
    try {
      if (import.meta.env.DEV) {
        console.debug('[worklist.submit]', {
          orderId: modalOrder.orderId,
          groupId: modalGroup?.groupId,
          totalTargets: targets.length,
          verifiedOverrideCount,
          departmentFilter: modalAppliedDepartmentId,
        });
      }

      const invalidNumericTargets = targets
        .filter((target) => target.resultEntryType === 'NUMERIC')
        .map((target) => ({
          target,
          normalized: normalizeNumericResultInput(values[target.id]?.resultValue),
          raw:
            values[target.id]?.resultValue !== null &&
              values[target.id]?.resultValue !== undefined
              ? String(values[target.id].resultValue).trim()
              : '',
        }))
        .filter(({ raw, normalized }) => raw.length > 0 && normalized === null)
        .map(({ target }) => target.testName);

      if (invalidNumericTargets.length > 0) {
        message.error(`Invalid numeric value for: ${invalidNumericTargets[0]}`);
        return;
      }

      await Promise.all(
        targets.map(async (target) => {
          const itemValues = values[target.id] || {};
          const rawParams = itemValues.resultParameters ?? {};
          const rawCustomParams = itemValues.resultParametersCustom ?? {};
          const resultParamsEntries: Array<[string, string]> = [];

          for (const [code, rawValue] of Object.entries(rawParams)) {
            const value = rawValue != null ? String(rawValue).trim() : '';
            if (!value) continue;
            if (value === '__other__') {
              const customValue =
                rawCustomParams[code] != null
                  ? String(rawCustomParams[code]).trim()
                  : '';
              if (!customValue) continue;
              resultParamsEntries.push([code, customValue]);
              continue;
            }
            resultParamsEntries.push([code, value]);
          }

          const resultParameters = Object.fromEntries(resultParamsEntries);
          const hasResultParameters = Object.keys(resultParameters).length > 0;
          const resultEntryType = target.resultEntryType ?? 'NUMERIC';
          const normalizedNumericInput = normalizeNumericResultInput(itemValues.resultValue);
          let resultValue = itemValues.resultValue ?? null;
          let resultText = itemValues.resultText?.trim() || null;

          if (resultEntryType === 'NUMERIC') {
            resultValue = normalizedNumericInput !== null ? Number(normalizedNumericInput) : null;
            resultText = normalizedNumericInput;
          } else if (resultEntryType === 'QUALITATIVE') {
            if (resultText === '__other__') {
              resultText = itemValues.customResultText?.trim() || null;
            }
            resultValue = null;
          } else if (resultEntryType === 'TEXT') {
            resultValue = null;
          }

          const isVerifiedOverride =
            canAdminEditVerified && target.status === 'VERIFIED';

          await enterResult(target.id, {
            resultValue,
            resultText,
            resultParameters: hasResultParameters ? resultParameters : null,
            ...(isVerifiedOverride ? { forceEditVerified: true } : {}),
          });
        }),
      );

      message.success(
        verifiedOverrideCount > 0
          ? 'Verified results updated by admin'
          : 'Results saved',
      );
      const submittedOrderId = modalOrder.orderId;
      const submittedDepartment = modalAppliedDepartmentId;
      closeEntryModal();
      await Promise.all([loadRows(), loadStats()]);
      await loadOrderGroups(submittedOrderId, {
        force: true,
        departmentOverride: submittedDepartment,
      });
    } catch {
      message.error('Failed to save results');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpandRow = useCallback(
    (expanded: boolean, record: WorklistOrderSummaryDto) => {
      setExpandedOrderKeys(expanded ? [record.orderId] : []);
      if (expanded) {
        void loadOrderGroups(record.orderId);
      }
    },
    [loadOrderGroups],
  );

  const queueColumns: ColumnsType<WorklistOrderSummaryDto> = [
    {
      title: 'Patient',
      dataIndex: 'patientName',
      key: 'patientName',
      width: 280,
      render: (_: unknown, record) => (
        <div>
          <Text strong style={{ display: 'block', fontSize: 13, lineHeight: '16px' }}>
            {record.patientName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, lineHeight: '14px' }}>
            {record.patientAgeDisplay || '-'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 350,
      render: (_: unknown, record) => (
        <Space size={[4, 4]} wrap>
          <Tag style={{ margin: 0 }}>
            {record.progressTotalRoot} tests
          </Tag>
          {record.progressPending > 0 && (
            <Tag style={{ margin: 0 }}>
              Pending {record.progressPending}
            </Tag>
          )}
          {record.progressCompleted > 0 && (
            <Tag color="processing" style={{ margin: 0 }}>
              Completed {record.progressCompleted}
            </Tag>
          )}
          {record.progressVerified > 0 && (
            <Tag color="success" style={{ margin: 0 }}>
              Verified {record.progressVerified}
            </Tag>
          )}
          {record.progressRejected > 0 && (
            <Tag color="error" style={{ margin: 0 }}>
              Rejected {record.progressRejected}
            </Tag>
          )}
          {record.firstRejectedReason?.trim() && (
            <Text type="danger" style={{ fontSize: 11 }}>
              Reason: {record.firstRejectedReason}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Order Number',
      key: 'orderNumber',
      width: 180,
      render: (_: unknown, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.orderNumber}
        </Text>
      ),
    },
    {
      title: 'Order Time',
      key: 'registeredAt',
      width: 180,
      render: (_: unknown, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(record.registeredAt).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 130,
      render: (_: unknown, record) => {
        const expanded = expandedOrderKeys.includes(record.orderId);
        return (
          <Button
            size="small"
            loading={expandingOrderId === record.orderId}
            onClick={(event) => {
              event.stopPropagation();
              handleExpandRow(!expanded, record);
            }}
          >
            {expanded ? 'Hide groups' : 'Groups'}
          </Button>
        );
      },
    },
  ];

  const renderExpandedRow = (record: WorklistOrderSummaryDto) => {
    const cached = getCachedGroupsForOrder(record.orderId);
    if (!cached) {
      return (
        <div style={{ padding: '6px 8px' }}>
          {expandingOrderId === record.orderId ? (
            <Text type="secondary">Loading groups...</Text>
          ) : (
            <Button
              size="small"
              onClick={() => {
                void loadOrderGroups(record.orderId);
              }}
            >
              Load groups
            </Button>
          )}
        </div>
      );
    }

    if (cached.groups.length === 0) {
      return (
        <div style={{ padding: '6px 8px' }}>
          <Text type="secondary">No available groups in this department</Text>
        </div>
      );
    }

    return (
      <div className="worklist-group-shell">
        <div className="worklist-group-shell-title">Grouped test entries</div>
        <div className="worklist-group-list">
          {cached.groups.map((group) => {
            const isEmptyPanel = group.groupKind === 'panel' && group.testsCount === 0;
            const openGroup = () => {
              if (isEmptyPanel) {
                message.warning(
                  'This panel has no configured child tests. Configure panel components in Test Management.',
                );
                return;
              }
              void openEntryModalForGroup(record.orderId, group);
            };

            return (
              <div
                key={group.groupId}
                className={`worklist-group-item ${group.groupKind === 'panel'
                    ? 'worklist-group-item-panel'
                    : 'worklist-group-item-single'
                  }`}
                onClick={openGroup}
              >
                <div className="worklist-group-main">
                  <div className="worklist-group-title-row">
                    <Text strong style={{ fontSize: 12 }}>
                      {group.label}
                    </Text>
                    {group.testsCount === 0 && (
                      <Tag color="warning" style={{ margin: 0 }}>
                        No child tests in this filter
                      </Tag>
                    )}
                  </div>
                  <Space size={[4, 4]} wrap>
                    <Tag style={{ margin: 0 }}>{group.testsCount} tests</Tag>
                    {group.pending > 0 && (
                      <Tag style={{ margin: 0 }}>Pending {group.pending}</Tag>
                    )}
                    {group.completed > 0 && (
                      <Tag color="processing" style={{ margin: 0 }}>
                        Completed {group.completed}
                      </Tag>
                    )}
                    {group.verified > 0 && (
                      <Tag color="success" style={{ margin: 0 }}>
                        Verified {group.verified}
                      </Tag>
                    )}
                    {group.rejected > 0 && (
                      <Tag color="error" style={{ margin: 0 }}>
                        Rejected {group.rejected}
                      </Tag>
                    )}
                  </Space>
                </div>
                <Button
                  type="primary"
                  ghost
                  size="small"
                  disabled={isEmptyPanel}
                  loading={entryLoadingGroupKey === `${record.orderId}:${group.groupId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openGroup();
                  }}
                >
                  Edit
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <style>{`
        .worklist-orders-table .worklist-order-row > td {
          cursor: pointer;
          transition:
            background-color 0.18s ease,
            border-color 0.18s ease;
        }
        .worklist-orders-table .worklist-order-row:hover > td {
          background: ${isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)'} !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td {
          background: ${isDark ? 'rgba(37,99,235,0.12)' : '#eff6ff'} !important;
          border-top: 1px solid ${isDark ? 'rgba(96,165,250,0.48)' : '#93c5fd'} !important;
          border-bottom: 0 !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td:first-child {
          border-left: 2px solid ${isDark ? '#3b82f6' : '#2563eb'} !important;
          border-top-left-radius: 10px !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td:last-child {
          border-right: 1px solid ${isDark ? 'rgba(96,165,250,0.48)' : '#bfdbfe'} !important;
          border-top-right-radius: 10px !important;
        }
        .worklist-orders-table .ant-table-expanded-row > td {
          padding: 6px 10px 10px !important;
          background: transparent !important;
          border-left: 2px solid ${isDark ? '#3b82f6' : '#2563eb'} !important;
          border-right: 1px solid ${isDark ? 'rgba(96,165,250,0.48)' : '#bfdbfe'} !important;
          border-bottom: 1px solid ${isDark ? 'rgba(96,165,250,0.48)' : '#bfdbfe'} !important;
          border-bottom-left-radius: 10px !important;
          border-bottom-right-radius: 10px !important;
        }
        .worklist-group-list {
          margin-top: 6px;
          margin-left: 22px;
          border-left: 2px dashed ${isDark ? 'rgba(148,163,184,0.35)' : '#c7d9ff'};
          padding-left: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .worklist-group-shell {
          border: 1px solid ${isDark ? 'rgba(148,163,184,0.22)' : '#dbe8ff'};
          border-radius: 10px;
          background: ${isDark ? 'rgba(2,6,23,0.36)' : '#f3f8ff'};
          padding: 8px;
        }
        .worklist-group-shell-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
          color: ${isDark ? 'rgba(191,219,254,0.95)' : '#1d4ed8'};
          text-transform: uppercase;
        }
        .worklist-group-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 8px;
          border: 1px solid ${isDark ? 'rgba(148,163,184,0.2)' : '#d9e8ff'};
          padding: 8px 10px;
          cursor: pointer;
        }
        .worklist-group-item-single {
          background: ${isDark ? 'rgba(30,58,138,0.16)' : '#eef5ff'};
        }
        .worklist-group-item-panel {
          background: ${isDark ? 'rgba(88,28,135,0.16)' : '#f5efff'};
        }
        .worklist-group-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .worklist-group-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .panel-entry-modal .ant-modal {
          max-width: calc(100vw - 32px) !important;
          top: 20px;
          padding-bottom: 0;
        }
        .panel-entry-modal .ant-modal-content {
          border-radius: 14px;
          overflow: hidden;
        }
        .panel-entry-modal .ant-modal-header {
          padding: 5px 8px;
          margin-bottom: 0;
        }
        .panel-entry-modal .ant-modal-body {
          padding: 5px 8px 6px !important;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
        }
        .panel-entry-modal .ant-form-item {
          margin-bottom: 0 !important;
        }
        .panel-entry-modal .ant-form-item-label {
          padding-bottom: 0 !important;
        }
        .panel-entry-modal .ant-form-item-label > label {
          font-size: 10px !important;
          line-height: 1.1 !important;
          min-height: 12px !important;
        }
        .panel-entry-modal .ant-input-number,
        .panel-entry-modal .ant-input,
        .panel-entry-modal .ant-select-selector {
          min-height: 24px !important;
          height: 24px !important;
        }
        .panel-entry-modal .ant-input-number-input {
          height: 22px !important;
        }
      `}</style>

      <Title level={4} style={{ marginTop: 0, marginBottom: 10 }}>
        Worklist
      </Title>
      <WorklistStatusDashboard stats={stats} style={{ marginBottom: 12 }} />

      <div
        ref={containerRef}
        className="queue-pane-shell"
        style={{ minHeight: filledMinHeightPx }}
      >
        <Card className="queue-main-card">
          <div className="queue-filters-block">
            <Space wrap size={[10, 10]} className="queue-filter-toolbar">
              <Input
                placeholder="Search order #, patient, test..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 250 }}
                allowClear
              />
              <Select
                value={entryStatusFilter}
                onChange={(value) => {
                  setEntryStatusFilter(value as WorklistEntryStatusFilter);
                  setPage(1);
                }}
                style={{ width: 150 }}
                allowClear={false}
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
              <Select
                placeholder="Department"
                value={departmentId || undefined}
                onChange={(value) => setDepartmentId(value ?? '')}
                style={{ width: 200 }}
                allowClear
                options={departments.map((department) => ({
                  label: `${department.code} - ${department.name}`,
                  value: department.id,
                }))}
              />
              <DatePicker
                value={dateFilter}
                onChange={setDateFilter}
                allowClear
                placeholder="Filter by date"
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                Search
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void Promise.all([loadRows(), loadStats()]);
                }}
              >
                Refresh
              </Button>
            </Space>
          </div>

          <div className="queue-table-block">
            <Table<WorklistOrderSummaryDto>
              className="worklist-orders-table queue-orders-table"
              rowKey="orderId"
              columns={queueColumns}
              dataSource={rows}
              loading={loading}
              showHeader
              rowClassName={(record) =>
                expandedOrderKeys.includes(record.orderId)
                  ? 'worklist-order-row worklist-order-row-expanded'
                  : 'worklist-order-row'
              }
              expandable={{
                expandedRowRender: renderExpandedRow,
                expandedRowKeys: expandedOrderKeys,
                expandRowByClick: true,
                showExpandColumn: false,
                onExpand: handleExpandRow,
              }}
              pagination={{
                current: page,
                pageSize: size,
                total,
                showSizeChanger: false,
                showTotal: (value) => `Total ${value} orders`,
                onChange: (nextPage) => setPage(nextPage),
              }}
              scroll={{ x: 1100 }}
              size="small"
            />
          </div>
        </Card>
      </div>

      <Modal
        title={
          <Space size={8}>
            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
              Enter Result
            </span>
            {modalOrder && (
              <Tag color="blue" style={{ margin: 0 }}>
                {modalOrder.orderNumber}
              </Tag>
            )}
            {modalGroup && (
              <Tag color="purple" style={{ margin: 0 }}>
                {modalGroup.label}
              </Tag>
            )}
            {modalDepartment && (
              <Tag color="geekblue" style={{ margin: 0 }}>
                Dept: {modalDepartment.code}
              </Tag>
            )}
          </Space>
        }
        open={resultModalOpen}
        onCancel={() => {
          closeEntryModal();
        }}
        footer={null}
        width={980}
        className="panel-entry-modal"
        styles={{
          header: {
            borderBottom: isDark
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px solid #f0f0f0',
          },
        }}
      >
        {modalLoading ? (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <Text type="secondary">Loading order tests...</Text>
          </div>
        ) : modalOrder && modalGroup ? (
          <div>
            <div
              style={{
                marginBottom: 6,
                padding: '6px 8px',
                borderRadius: 6,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
                border: isDark
                  ? '1px solid rgba(255,255,255,0.08)'
                  : '1px solid #f0f0f0',
              }}
            >
              <Row gutter={[8, 2]}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Patient
                  </Text>
                  <div style={{ marginTop: 2 }}>
                    <Text strong>{modalOrder.patientName}</Text>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Order
                  </Text>
                  <div style={{ marginTop: 2 }}>
                    <Text strong>{modalOrder.orderNumber}</Text>
                  </div>
                </Col>
              </Row>
            </div>

            {showLoadAllTestsHint && (
              <div
                style={{
                  marginBottom: 6,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid #ffe58f',
                  backgroundColor: '#fffbe6',
                }}
              >
                <Space size={8} wrap>
                  <Text style={{ fontSize: 12, color: '#ad6800' }}>
                    No editable tests in this department view.
                  </Text>
                  <Button
                    size="small"
                    loading={loadingAllTests}
                    onClick={() => {
                      void handleLoadAllOrderTests();
                    }}
                  >
                    Load all tests for this order
                  </Button>
                </Space>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Button
                onClick={() => {
                  closeEntryModal();
                }}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                loading={submitting}
                onClick={() => {
                  void resultForm.submit();
                }}
              >
                Save
              </Button>
            </div>

            <Form
              form={resultForm}
              layout="vertical"
              onFinish={handleSubmitResult}
              onValuesChange={(_, allValues) => {
                recomputeLiveFlags(allValues as Record<string, any>);
              }}
            >
              <div
                style={{
                  display: 'flex',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
                  borderRadius: '6px 6px 0 0',
                  borderBottom: isDark
                    ? '1px solid rgba(255,255,255,0.1)'
                    : '1px solid #e8e8e8',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '2px 6px',
                }}
              >
                <div style={{ flex: '1 1 40%', textAlign: 'center' }}>Test</div>
                <div style={{ flex: '1 1 26%', textAlign: 'center' }}>Result</div>
                <div style={{ flex: '1 1 8%', textAlign: 'center' }}>Unit</div>
                <div style={{ flex: '1 1 10%', textAlign: 'center' }}>Flag</div>
                <div style={{ flex: '1 1 16%', textAlign: 'center' }}>Ref. Range</div>
              </div>

              {orderedModalItems.map((target, index) => {
                const isPanelRoot =
                  target.testType === 'PANEL' && !target.parentOrderTestId;
                const isPanelChild = Boolean(target.parentOrderTestId);
                const isReadOnly =
                  isPanelRoot ||
                  (target.status === 'VERIFIED' && !canAdminEditVerified);
                const parameterDefinitions = target.parameterDefinitions ?? [];
                const hasParams = parameterDefinitions.length > 0;
                const displayFlag =
                  target.testType === 'PANEL'
                    ? null
                    : (liveFlags[target.id] ?? target.flag ?? null);

                return (
                  <div key={target.id}>
                    {firstPanelIndex > 0 && index === firstPanelIndex && (
                      <div
                        style={{
                          borderTop: '1px dashed #91caff',
                          marginTop: 1,
                          paddingTop: 3,
                          marginBottom: 1,
                        }}
                      >
                        <Text strong style={{ fontSize: 11 }}>
                          Panel Tests
                        </Text>
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1px 6px',
                        borderBottom:
                          index < orderedModalItems.length - 1
                            ? isDark
                              ? '1px solid rgba(255,255,255,0.05)'
                              : '1px solid #f0f0f0'
                            : 'none',
                        backgroundColor: isPanelRoot
                          ? isDark
                            ? 'rgba(114,46,209,0.14)'
                            : 'rgba(114,46,209,0.08)'
                          : 'transparent',
                      }}
                    >
                      <div style={{ flex: '1 1 40%', paddingRight: 8, textAlign: 'center' }}>
                        <Space size={6}>
                          {isPanelRoot ? (
                            <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                              Panel
                            </Tag>
                          ) : null}
                          {target.status === 'REJECTED' ? (
                            <Tag color="error" style={{ margin: 0, fontSize: 11 }}>
                              Rejected
                            </Tag>
                          ) : null}
                          {target.status === 'VERIFIED' && canAdminEditVerified ? (
                            <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>
                              Verified (admin edit)
                            </Tag>
                          ) : null}
                        </Space>
                        <div style={{ marginTop: 1, paddingLeft: isPanelChild ? 10 : 0 }}>
                          <Text
                            strong={isPanelRoot}
                            style={{
                              fontSize: 12,
                              lineHeight: '14px',
                              display: 'block',
                              whiteSpace: 'normal',
                              wordBreak: 'break-word',
                            }}
                          >
                            {target.testName}
                          </Text>
                        </div>
                        {target.rejectionReason?.trim() && (
                          <Text type="danger" style={{ display: 'block', fontSize: 11 }}>
                            {target.rejectionReason}
                          </Text>
                        )}
                      </div>

                      <div style={{ flex: '1 1 26%', paddingRight: 8, textAlign: 'center' }}>
                        {isPanelRoot ? (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Panel header
                          </Text>
                        ) : hasParams ? (
                          <Space direction="vertical" style={{ width: '100%' }} size={2}>
                            {parameterDefinitions.map((definition: TestParameterDefinition) => (
                              <Form.Item
                                key={`${target.id}-${definition.code}`}
                                name={[target.id, 'resultParameters', definition.code]}
                                style={{ marginBottom: 0 }}
                                label={
                                  <span style={{ fontSize: 10 }}>{definition.label}</span>
                                }
                              >
                                {definition.type === 'select' ? (
                                  <Select
                                    allowClear
                                    size="small"
                                    disabled={isReadOnly}
                                    data-entry-target-id={target.id}
                                    options={[
                                      ...(definition.options ?? []).map((option) => ({
                                        label: option,
                                        value: option,
                                      })),
                                      { label: 'Other...', value: '__other__' },
                                    ]}
                                    onKeyDown={(event) => {
                                      if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        focusNextEditableInput(target.id);
                                      }
                                    }}
                                  />
                                ) : (
                                  <Input
                                    size="small"
                                    disabled={isReadOnly}
                                    data-entry-target-id={target.id}
                                    onKeyDown={(event) => {
                                      if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        focusNextEditableInput(target.id);
                                      }
                                    }}
                                  />
                                )}
                              </Form.Item>
                            ))}
                          </Space>
                        ) : (
                          <Form.Item
                            name={[target.id, target.resultEntryType === 'NUMERIC' ? 'resultValue' : 'resultText']}
                            style={{ marginBottom: 0 }}
                          >
                            {target.resultEntryType === 'NUMERIC' ? (
                              <Input
                                id={`result-input-${target.id}`}
                                data-entry-target-id={target.id}
                                style={{ width: '100%', textAlign: 'center' }}
                                size="small"
                                disabled={isReadOnly}
                                inputMode="decimal"
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusNextEditableInput(target.id);
                                  }
                                }}
                              />
                            ) : target.resultEntryType === 'QUALITATIVE' &&
                              (target.resultTextOptions?.length ?? 0) > 0 ? (
                              <Select
                                id={`result-input-${target.id}`}
                                data-entry-target-id={target.id}
                                allowClear
                                showSearch
                                size="small"
                                disabled={isReadOnly}
                                style={{ textAlign: 'center' }}
                                dropdownStyle={{ textAlign: 'center' }}
                                options={[
                                  ...(target.resultTextOptions ?? []).map((option) => ({
                                    label: option.value,
                                    value: option.value,
                                  })),
                                  ...(target.allowCustomResultText
                                    ? [{ label: 'Other...', value: '__other__' }]
                                    : []),
                                ]}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusNextEditableInput(target.id);
                                  }
                                }}
                              />
                            ) : (
                              <Input
                                id={`result-input-${target.id}`}
                                data-entry-target-id={target.id}
                                size="small"
                                disabled={isReadOnly}
                                style={{ textAlign: 'center' }}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusNextEditableInput(target.id);
                                  }
                                }}
                              />
                            )}
                          </Form.Item>
                        )}
                      </div>

                      <div style={{ flex: '1 1 8%', textAlign: 'center', fontSize: 12 }}>
                        {target.testUnit || '-'}
                      </div>
                      <div style={{ flex: '1 1 10%', textAlign: 'center' }}>
                        {displayFlag ? (
                          <Tag
                            color={FLAG_COLOR[displayFlag] || 'default'}
                            style={{ margin: 0, fontSize: 11 }}
                          >
                            {FLAG_LABEL[displayFlag] || displayFlag}
                          </Tag>
                        ) : (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            -
                          </Text>
                        )}
                      </div>
                      <div
                        style={{
                          flex: '1 1 16%',
                          textAlign: 'center',
                          fontSize: 12,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {formatReferenceRange(target)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Form>
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
