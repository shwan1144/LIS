import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Button, Form, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { CultureSensitivityEditor, type CultureAntibioticOption } from '../CultureSensitivityEditor';
import type {
  DepartmentDto,
  ResultFlag,
  TestParameterDefinition,
  WorklistItem,
  WorklistOrderModalDto,
} from '../../api/client';
import {
  RESULT_FLAG_COLOR as FLAG_COLOR,
  getResultFlagLabel,
} from '../../utils/result-flag';
import type { WorklistOrderGroupSummary } from '../../pages/worklistGrouping';
import type { ResultEntryRowModel, ResultEntrySection } from './resultEntryModel';
import './ResultEntryModal.css';

const { Paragraph, Text, Title } = Typography;

function findInteractiveTarget(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  if (
    root.matches(
      'input,textarea,[role="combobox"],.ant-select-selector,.ant-input',
    )
  ) {
    return root;
  }
  return (
    (root.querySelector(
      'input,textarea,[role="combobox"],.ant-select-selector,.ant-input',
    ) as HTMLElement | null) ?? root
  );
}

function renderStatusTags(
  row: ResultEntryRowModel,
  canAdminEditVerified: boolean,
) {
  const { target } = row;

  return (
    <div className="result-entry-modal__status-tags">
      {target.status === 'REJECTED' ? (
        <Tag color="error" style={{ margin: 0 }}>
          Rejected
        </Tag>
      ) : null}
      {target.status === 'VERIFIED' ? (
        <Tag color={canAdminEditVerified ? 'gold' : 'success'} style={{ margin: 0 }}>
          {canAdminEditVerified ? 'Verified / Admin edit' : 'Verified'}
        </Tag>
      ) : null}
      {row.isReadOnly && target.status !== 'VERIFIED' ? (
        <Tag style={{ margin: 0 }}>Read only</Tag>
      ) : null}
    </div>
  );
}

function renderParameterField(
  form: FormInstance<any>,
  definition: TestParameterDefinition,
  target: WorklistItem,
  disabled: boolean,
  onFieldKeyDown: (event: ReactKeyboardEvent<HTMLElement>, targetId: string) => void,
) {
  const selectedValue = form.getFieldValue([
    target.id,
    'resultParameters',
    definition.code,
  ]);
  const showCustomInput = definition.type === 'select' && selectedValue === '__other__';

  return (
    <div className="result-entry-modal__parameter-field" key={`${target.id}-${definition.code}`}>
      <label className="result-entry-modal__parameter-label">{definition.label}</label>
      <Form.Item
        name={[target.id, 'resultParameters', definition.code]}
        style={{ marginBottom: 0 }}
      >
        {definition.type === 'select' ? (
          <Select
            allowClear
            showSearch
            disabled={disabled}
            placeholder={`Select ${definition.label.toLowerCase()}`}
            optionFilterProp="label"
            data-entry-target-id={target.id}
            options={[
              ...(definition.options ?? []).map((option) => ({
                label: option,
                value: option,
              })),
              { label: 'Other...', value: '__other__' },
            ]}
            onKeyDown={(event) => onFieldKeyDown(event, target.id)}
          />
        ) : (
          <Input
            disabled={disabled}
            placeholder={`Enter ${definition.label.toLowerCase()}`}
            data-entry-target-id={target.id}
            onKeyDown={(event) => onFieldKeyDown(event, target.id)}
          />
        )}
      </Form.Item>
      {showCustomInput ? (
        <div style={{ marginTop: 8 }}>
          <label className="result-entry-modal__custom-label">Custom value</label>
          <Form.Item
            name={[target.id, 'resultParametersCustom', definition.code]}
            style={{ marginBottom: 0 }}
          >
            <Input
              disabled={disabled}
              placeholder="Type custom value"
              data-entry-target-id={target.id}
              onKeyDown={(event) => onFieldKeyDown(event, target.id)}
            />
          </Form.Item>
        </div>
      ) : null}
    </div>
  );
}

interface ResultEntryModalProps {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  order: WorklistOrderModalDto | null;
  group: WorklistOrderGroupSummary | null;
  department: DepartmentDto | null;
  sections: ResultEntrySection[];
  editableTargetIds: string[];
  liveFlags: Record<string, ResultFlag | null>;
  canAdminEditVerified: boolean;
  isDark: boolean;
  form: FormInstance<any>;
  showLoadAllTestsHint: boolean;
  loadingAllTests: boolean;
  saveDisabled: boolean;
  saveBlockedReason?: string | null;
  readOnlyMode: boolean;
  readOnlyReason?: string | null;
  attentionCount: number;
  dirtyCount: number;
  submittableCount: number;
  hasTouchedChanges: boolean;
  hasDocumentSessionChanges: boolean;
  onCancel: () => void;
  onLoadAllTests: () => void;
  onSubmit: () => void;
  onFinish: (values: Record<string, any>) => Promise<void> | void;
  onValuesChange: (allValues: Record<string, any>) => void;
  getCultureOptionsForTarget: (target: WorklistItem) => CultureAntibioticOption[];
  formatReferenceRange: (item: WorklistItem) => string;
  documentActionTargetId: string | null;
  onUploadResultDocument: (target: WorklistItem, file: File) => Promise<void> | void;
  onPreviewResultDocument: (target: WorklistItem) => Promise<void> | void;
  onDownloadResultDocument: (target: WorklistItem) => Promise<void> | void;
  onRemoveResultDocument: (target: WorklistItem) => Promise<void> | void;
}

export function ResultEntryModal({
  open,
  loading,
  submitting,
  order,
  group,
  department,
  sections,
  editableTargetIds,
  liveFlags,
  canAdminEditVerified,
  isDark,
  form,
  showLoadAllTestsHint,
  loadingAllTests,
  saveDisabled,
  saveBlockedReason,
  readOnlyMode,
  readOnlyReason,
  attentionCount,
  dirtyCount,
  submittableCount,
  hasTouchedChanges,
  hasDocumentSessionChanges,
  onCancel,
  onLoadAllTests,
  onSubmit,
  onFinish,
  onValuesChange,
  getCultureOptionsForTarget,
  formatReferenceRange,
  documentActionTargetId,
  onUploadResultDocument,
  onPreviewResultDocument,
  onDownloadResultDocument,
  onRemoveResultDocument,
}: ResultEntryModalProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusEditableTarget = useCallback((targetId: string) => {
    const targetRoot = document.querySelector(
      `[data-entry-target-id="${targetId}"]`,
    ) as HTMLElement | null;
    const focusTarget = findInteractiveTarget(targetRoot);
    focusTarget?.focus();
  }, []);

  const focusRelativeEditableTarget = useCallback(
    (currentTargetId: string, direction: 1 | -1) => {
      const currentIndex = editableTargetIds.indexOf(currentTargetId);
      if (currentIndex < 0) return;
      const nextTargetId = editableTargetIds[currentIndex + direction];
      if (!nextTargetId) return;
      focusEditableTarget(nextTargetId);
    },
    [editableTargetIds, focusEditableTarget],
  );

  const handleFieldKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, targetId: string) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const currentTarget = event.currentTarget as HTMLElement;
      const isExpanded = currentTarget.getAttribute('aria-expanded') === 'true';
      const isTextarea = currentTarget.tagName === 'TEXTAREA';

      if (event.key === 'ArrowDown' && !isExpanded) {
        event.preventDefault();
        focusRelativeEditableTarget(targetId, 1);
        return;
      }

      if (event.key === 'ArrowUp' && !isExpanded) {
        event.preventDefault();
        focusRelativeEditableTarget(targetId, -1);
        return;
      }

      if (event.key === 'Enter' && !isTextarea && !isExpanded) {
        event.preventDefault();
        focusRelativeEditableTarget(targetId, 1);
      }
    },
    [focusRelativeEditableTarget],
  );

  useEffect(() => {
    if (!open || loading || editableTargetIds.length === 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      focusEditableTarget(editableTargetIds[0]);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [editableTargetIds, focusEditableTarget, loading, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
        return;
      }
      event.preventDefault();
      if (!readOnlyMode && !saveDisabled && !submitting) {
        onSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSubmit, open, readOnlyMode, saveDisabled, submitting]);

  const footerCopy =
    readOnlyReason
      ? readOnlyReason
      : saveBlockedReason
      ? saveBlockedReason
      : submittableCount > 0
        ? `${submittableCount} row${submittableCount === 1 ? '' : 's'} ready to save`
        : hasDocumentSessionChanges
          ? 'PDF changes applied. Hit Save to finish.'
        : dirtyCount > 0
          ? 'Results applied. Hit Save to confirm.'
          : hasTouchedChanges
            ? 'Unsaved changes need a valid result before they can be saved'
            : 'No changes yet';

  return (
    <Modal
      title={
        <div className="result-entry-modal__title">
          <div className="result-entry-modal__title-copy">
            <Title level={4}>{readOnlyMode ? 'View Results' : 'Enter Result'}</Title>
          </div>
        </div>
      }
      open={open}
      onCancel={onCancel}
      width={1120}
      centered
      footer={
        <div className="result-entry-modal__footer">
          <div className="result-entry-modal__footer-copy">
            <Text type="secondary">
              {footerCopy}
              {attentionCount > 0
                ? ` | ${attentionCount} row${attentionCount === 1 ? '' : 's'} ${attentionCount === 1 ? 'needs' : 'need'} attention`
                : ''}
            </Text>
          </div>
          <Space>
            <Button onClick={onCancel} disabled={submitting}>
              {readOnlyMode ? 'Close' : 'Cancel'}
            </Button>
            {!readOnlyMode ? (
              <Button
                type="primary"
                loading={submitting}
                disabled={saveDisabled}
                onClick={onSubmit}
              >
                Save
              </Button>
            ) : null}
          </Space>
        </div>
      }
      className={`result-entry-modal ${isDark ? 'result-entry-modal--dark' : ''}`}
      maskClosable={!submitting}
      keyboard={!submitting}
      destroyOnHidden={false}
    >
      {loading ? (
        <div className="result-entry-modal__scroll">
          <Text type="secondary">Loading order tests...</Text>
        </div>
      ) : order && group ? (
        <div className="result-entry-modal__scroll">
          <div className="result-entry-modal__summary">
            <div className="result-entry-modal__summary-block">
              <span className="result-entry-modal__summary-label">Patient</span>
              <span className="result-entry-modal__summary-value">{order.patientName}</span>
            </div>
            <div className="result-entry-modal__summary-block">
              <span className="result-entry-modal__summary-label">Order</span>
              <span className="result-entry-modal__summary-value">{order.orderNumber}</span>
            </div>
            <div className="result-entry-modal__summary-block">
              <span className="result-entry-modal__summary-label">Group</span>
              <span className="result-entry-modal__summary-value">{group.label}</span>
            </div>
            <div className="result-entry-modal__summary-block">
              <span className="result-entry-modal__summary-label">Department</span>
              <span className="result-entry-modal__summary-value">
                {department ? `${department.code} - ${department.name}` : 'All departments'}
              </span>
            </div>
            <div className="result-entry-modal__summary-tags" style={{ gridColumn: '1 / -1' }}>
              {order.orderStatus === 'CANCELLED' ? (
                <Tag color="error" style={{ margin: 0 }}>
                  Canceled
                </Tag>
              ) : null}
              <Tag color="blue" style={{ margin: 0 }}>
                {group.testsCount} tests
              </Tag>
              {group.pending > 0 ? <Tag style={{ margin: 0 }}>Pending {group.pending}</Tag> : null}
              {group.completed > 0 ? (
                <Tag color="processing" style={{ margin: 0 }}>
                  Completed {group.completed}
                </Tag>
              ) : null}
              {group.verified > 0 ? (
                <Tag color="success" style={{ margin: 0 }}>
                  Verified {group.verified}
                </Tag>
              ) : null}
              {group.rejected > 0 ? (
                <Tag color="error" style={{ margin: 0 }}>
                  Rejected {group.rejected}
                </Tag>
              ) : null}
            </div>
          </div>

          {readOnlyMode ? (
            <div className="result-entry-modal__notice">
              <div className="result-entry-modal__notice-copy">
                <div>
                  <Text strong>Cancelled orders are read-only.</Text>
                  <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                    Results can be inspected, but they cannot be edited, verified, printed, or downloaded.
                  </Paragraph>
                </div>
              </div>
            </div>
          ) : null}

          {showLoadAllTestsHint ? (
            <div className="result-entry-modal__notice">
              <div className="result-entry-modal__notice-copy">
                <div>
                  <Text strong>
                    {readOnlyMode ? 'Some tests are hidden by the current department filter.' : 'No editable tests in this department view.'}
                  </Text>
                  <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                    {readOnlyMode
                      ? 'Load the full order if you need to inspect tests from another department.'
                      : 'Load the full order if this group belongs to another department.'}
                  </Paragraph>
                </div>
                <Button loading={loadingAllTests} onClick={onLoadAllTests}>
                  Load all tests for this order
                </Button>
              </div>
            </div>
          ) : null}

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            onValuesChange={(_, allValues) => {
              onValuesChange(allValues as Record<string, any>);
            }}
          >
            {sections.map((section) => (
              <section
                key={section.id}
                className={`result-entry-modal__section result-entry-modal__section--${section.kind}`}
              >
                <div className="result-entry-modal__grid">
                  <div className="result-entry-modal__grid-header">
                    <div className="result-entry-modal__grid-header-cell">Test</div>
                    <div className="result-entry-modal__grid-header-cell">Result</div>
                    <div className="result-entry-modal__grid-header-cell">Unit</div>
                    <div className="result-entry-modal__grid-header-cell">Flag</div>
                    <div className="result-entry-modal__grid-header-cell">Reference Range</div>
                  </div>

                  <div className="result-entry-modal__rows">
                    {section.rows.map((row) => {
                      const { target } = row;
                      const displayFlag = liveFlags[target.id] ?? target.flag ?? null;
                      const parameterDefinitions = target.parameterDefinitions ?? [];
                      const qualitativeSelection = form.getFieldValue([target.id, 'resultText']);
                      const showCustomResultInput =
                        target.resultEntryType === 'QUALITATIVE' &&
                        qualitativeSelection === '__other__';
                      const isPdfEntry = target.resultEntryType === 'PDF_UPLOAD';
                      const isDocumentBusy = documentActionTargetId === target.id;

                      return (
                        <div
                          key={target.id}
                          className={[
                            'result-entry-modal__row-card',
                            row.isReadOnly ? 'result-entry-modal__row-card--readonly' : '',
                            target.status === 'REJECTED'
                              ? 'result-entry-modal__row-card--rejected'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <div className="result-entry-modal__grid-row">
                            <div className="result-entry-modal__cell" data-label="Test">
                              <div className="result-entry-modal__test-head">
                                <div className="result-entry-modal__test-copy">
                                  <span className="result-entry-modal__test-name">
                                    {target.testName}
                                  </span>
                                </div>
                                {renderStatusTags(row, canAdminEditVerified)}
                              </div>
                              {target.rejectionReason?.trim() ? (
                                <div className="result-entry-modal__row-rejection">
                                  {target.rejectionReason}
                                </div>
                              ) : null}
                            </div>

                            <div className="result-entry-modal__cell" data-label="Result">
                              <div className="result-entry-modal__result-stack">
                                {row.hasParameters ? (
                                  <div className="result-entry-modal__parameter-grid">
                                    {parameterDefinitions.map((definition) =>
                                      renderParameterField(
                                        form,
                                        definition,
                                        target,
                                        row.isReadOnly,
                                        handleFieldKeyDown,
                                      ),
                                    )}
                                  </div>
                                ) : row.isCultureEntry ? (
                                  <Text className="result-entry-modal__muted">
                                    Culture details are entered below.
                                  </Text>
                                ) : isPdfEntry ? (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 8,
                                      alignItems: 'flex-start',
                                    }}
                                  >
                                    <input
                                      ref={(node) => {
                                        fileInputRefs.current[target.id] = node;
                                      }}
                                      type="file"
                                      accept="application/pdf"
                                      style={{ display: 'none' }}
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.currentTarget.value = '';
                                        if (!file) return;
                                        void onUploadResultDocument(target, file);
                                      }}
                                    />
                                    {target.resultDocument ? (
                                      <div>
                                        <Text strong style={{ display: 'block' }}>
                                          {target.resultDocument.fileName}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          {(target.resultDocument.sizeBytes / 1024 / 1024).toFixed(2)} MB
                                        </Text>
                                      </div>
                                    ) : (
                                      <Text className="result-entry-modal__muted">
                                        No PDF uploaded yet.
                                      </Text>
                                    )}
                                    <Space wrap>
                                      {!row.isReadOnly && !readOnlyMode ? (
                                        <Button
                                          size="small"
                                          loading={isDocumentBusy}
                                          onClick={() => fileInputRefs.current[target.id]?.click()}
                                        >
                                          {target.resultDocument ? 'Replace PDF' : 'Upload PDF'}
                                        </Button>
                                      ) : null}
                                      {target.resultDocument && !readOnlyMode ? (
                                        <>
                                          <Button
                                            size="small"
                                            disabled={isDocumentBusy}
                                            onClick={() => {
                                              void onPreviewResultDocument(target);
                                            }}
                                          >
                                            View PDF
                                          </Button>
                                          <Button
                                            size="small"
                                            disabled={isDocumentBusy}
                                            onClick={() => {
                                              void onDownloadResultDocument(target);
                                            }}
                                          >
                                            Download
                                          </Button>
                                          {!row.isReadOnly ? (
                                            <Button
                                              size="small"
                                              danger
                                              disabled={isDocumentBusy}
                                              onClick={() => {
                                                void onRemoveResultDocument(target);
                                              }}
                                            >
                                              Remove
                                            </Button>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </Space>
                                  </div>
                                ) : (
                                  <>
                                    <Form.Item
                                      name={[
                                        target.id,
                                        target.resultEntryType === 'NUMERIC'
                                          ? 'resultValue'
                                          : 'resultText',
                                      ]}
                                      style={{ marginBottom: 0 }}
                                    >
                                      {target.resultEntryType === 'NUMERIC' ? (
                                        <Input
                                          placeholder="Enter value"
                                          disabled={row.isReadOnly}
                                          inputMode="decimal"
                                          data-entry-target-id={target.id}
                                          onKeyDown={(event) =>
                                            handleFieldKeyDown(event, target.id)
                                          }
                                        />
                                      ) : target.resultEntryType === 'QUALITATIVE' &&
                                        (target.resultTextOptions?.length ?? 0) > 0 ? (
                                        <Select
                                          allowClear
                                          showSearch
                                          optionFilterProp="label"
                                          disabled={row.isReadOnly}
                                          placeholder="Select result"
                                          data-entry-target-id={target.id}
                                          options={[
                                            ...(target.resultTextOptions ?? []).map((option) => ({
                                              label: option.value,
                                              value: option.value,
                                            })),
                                            ...(target.allowCustomResultText
                                              ? [{ label: 'Other...', value: '__other__' }]
                                              : []),
                                          ]}
                                          onKeyDown={(event) =>
                                            handleFieldKeyDown(event, target.id)
                                          }
                                        />
                                      ) : (
                                        <Input
                                          placeholder="Enter text result"
                                          disabled={row.isReadOnly}
                                          data-entry-target-id={target.id}
                                          onKeyDown={(event) =>
                                            handleFieldKeyDown(event, target.id)
                                          }
                                        />
                                      )}
                                    </Form.Item>

                                    {showCustomResultInput ? (
                                      <div>
                                        <label className="result-entry-modal__custom-label">
                                          Custom result
                                        </label>
                                        <Form.Item
                                          name={[target.id, 'customResultText']}
                                          style={{ marginBottom: 0 }}
                                        >
                                          <Input
                                            placeholder="Type custom result"
                                            disabled={row.isReadOnly}
                                            data-entry-target-id={target.id}
                                            onKeyDown={(event) =>
                                              handleFieldKeyDown(event, target.id)
                                            }
                                          />
                                        </Form.Item>
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="result-entry-modal__cell" data-label="Unit">
                              {target.testUnit ? (
                                <span className="result-entry-modal__unit">{target.testUnit}</span>
                              ) : (
                                <Text className="result-entry-modal__muted">-</Text>
                              )}
                            </div>

                            <div className="result-entry-modal__cell" data-label="Flag">
                              {displayFlag ? (
                                <Tag color={FLAG_COLOR[displayFlag] || 'default'} style={{ margin: 0 }}>
                                  {getResultFlagLabel(displayFlag) || displayFlag}
                                </Tag>
                              ) : (
                                <Text className="result-entry-modal__muted">-</Text>
                              )}
                            </div>

                            <div className="result-entry-modal__cell" data-label="Reference Range">
                              <span className="result-entry-modal__range">
                                {formatReferenceRange(target)}
                              </span>
                            </div>
                          </div>

                          {row.isCultureEntry ? (
                            <div className="result-entry-modal__culture-detail">
                              <CultureSensitivityEditor
                                baseName={[target.id, 'cultureResult']}
                                antibioticOptions={getCultureOptionsForTarget(target)}
                                interpretationOptions={
                                  target.cultureConfig?.interpretationOptions ?? ['S', 'I', 'R']
                                }
                                micUnit={target.cultureConfig?.micUnit ?? null}
                                disabled={row.isReadOnly}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </Form>
        </div>
      ) : null}
    </Modal>
  );
}
