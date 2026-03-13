import { useCallback, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  RESULT_FLAG_LABEL as FLAG_LABEL,
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
  dirtyCount: number;
  submittableCount: number;
  hasTouchedChanges: boolean;
  onCancel: () => void;
  onLoadAllTests: () => void;
  onSubmit: () => void;
  onFinish: (values: Record<string, any>) => Promise<void> | void;
  onValuesChange: (allValues: Record<string, any>) => void;
  getCultureOptionsForTarget: (target: WorklistItem) => CultureAntibioticOption[];
  formatReferenceRange: (item: WorklistItem) => string;
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
  dirtyCount,
  submittableCount,
  hasTouchedChanges,
  onCancel,
  onLoadAllTests,
  onSubmit,
  onFinish,
  onValuesChange,
  getCultureOptionsForTarget,
  formatReferenceRange,
}: ResultEntryModalProps) {
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
      if (!saveDisabled && !submitting) {
        onSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSubmit, open, saveDisabled, submitting]);

  const footerCopy = hasTouchedChanges
    ? submittableCount > 0
      ? `${submittableCount} row${submittableCount === 1 ? '' : 's'} ready to save`
      : 'Unsaved changes need a valid result before they can be saved'
    : 'No changes yet';

  return (
    <Modal
      title={
        <div className="result-entry-modal__title">
          <div className="result-entry-modal__title-copy">
            <Title level={4}>Enter Result</Title>
            <Text type="secondary">
              Compact result entry for single tests, panels, and culture groups.
            </Text>
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
              {dirtyCount > submittableCount ? ` • ${dirtyCount - submittableCount} row needs attention` : ''}
            </Text>
          </div>
          <Space>
            <Button onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={saveDisabled}
              onClick={onSubmit}
            >
              Save
            </Button>
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

          {showLoadAllTestsHint ? (
            <div className="result-entry-modal__notice">
              <div className="result-entry-modal__notice-copy">
                <div>
                  <Text strong>No editable tests in this department view.</Text>
                  <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                    Load the full order if this group belongs to another department.
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
                <div className="result-entry-modal__section-head">
                  <div>
                    <span className="result-entry-modal__section-kicker">{section.kind}</span>
                    <Title level={5} className="result-entry-modal__section-title">
                      {section.title}
                    </Title>
                    <Text className="result-entry-modal__section-subtitle">
                      {section.subtitle}
                    </Text>
                  </div>
                  <div className="result-entry-modal__section-stats">
                    <Tag style={{ margin: 0 }}>{section.rows.length} rows</Tag>
                    <Tag
                      color={
                        section.kind === 'panel'
                          ? 'purple'
                          : section.kind === 'culture'
                            ? 'cyan'
                            : 'blue'
                      }
                      style={{ margin: 0 }}
                    >
                      {section.kind === 'panel'
                        ? 'Panel workflow'
                        : section.kind === 'culture'
                          ? 'Culture workflow'
                          : 'Single workflow'}
                    </Tag>
                  </div>
                </div>

                {section.panelRoot ? (
                  <div className="result-entry-modal__panel-shell">
                    <div className="result-entry-modal__panel-card">
                      <div className="result-entry-modal__panel-title">
                        <Tag color="purple" style={{ margin: 0 }}>
                          Panel
                        </Tag>
                        <Text strong>{section.panelRoot.testName}</Text>
                      </div>
                      <div className="result-entry-modal__panel-meta">
                        Non-editable header. Enter results in the component tests below.
                      </div>
                    </div>
                  </div>
                ) : null}

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
                                  <span className="result-entry-modal__test-code">
                                    {target.testCode}
                                    {row.isPanelChild ? ' • Panel component' : ''}
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
                                  {FLAG_LABEL[displayFlag] || displayFlag}
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
