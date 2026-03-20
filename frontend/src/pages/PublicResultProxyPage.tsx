import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

type PublicResultTestItem = {
  orderTestId: string;
  testCode: string;
  testName: string;
  departmentName: string;
  expectedCompletionMinutes: number | null;
  status: string;
  isVerified: boolean;
  resultDocument?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string | null;
    uploadedBy: string | null;
  } | null;
};

type PublicResultStatus = {
  orderId: string;
  orderNumber: string;
  patientName: string;
  registeredAt: string;
  paymentStatus: string;
  reportableCount: number;
  verifiedCount: number;
  progressPercent: number;
  ready: boolean;
  tests: PublicResultTestItem[];
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function deriveApiBaseUrl(): string {
  const envBase = String(import.meta.env.VITE_API_URL ?? '').trim();
  if (envBase.length > 0) {
    return normalizeBaseUrl(envBase);
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const { protocol, hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return `${protocol}//${hostname}:3001`;
  }

  if (!hostname.startsWith('api.')) {
    const hostParts = hostname.split('.');
    if (hostParts.length >= 2) {
      const baseDomain = hostParts.slice(-2).join('.');
      return `${protocol}//api.${baseDomain}`;
    }
  }

  return normalizeBaseUrl(origin);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function normalizeStatus(status: string | null | undefined): string {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (normalized === 'VERIFIED') return 'VERIFIED';
  if (normalized === 'COMPLETED') return 'COMPLETED';
  if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (normalized === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

function resolveTestProgress(current: PublicResultStatus, test: PublicResultTestItem) {
  const status = normalizeStatus(test.status);
  if (test.isVerified || status === 'VERIFIED') {
    return { percent: 100, barClass: 'verified', meta: 'Verified' };
  }

  const expected = Number(test.expectedCompletionMinutes ?? 0);
  const registeredAtMs = Date.parse(current.registeredAt || '');
  const nowMs = Date.now();

  if (Number.isFinite(expected) && expected > 0 && Number.isFinite(registeredAtMs)) {
    const totalMs = Math.round(expected) * 60 * 1000;
    const elapsedMs = Math.max(0, nowMs - registeredAtMs);
    let percent = Math.round((elapsedMs / totalMs) * 100);
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    const dueAtMs = registeredAtMs + totalMs;
    const remainingMs = dueAtMs - nowMs;
    if (remainingMs >= 0) {
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
      return { percent, barClass: '', meta: `ETA ${remainingMinutes} min` };
    }

    const overdueMinutes = Math.max(1, Math.ceil(Math.abs(remainingMs) / (60 * 1000)));
    return { percent: 100, barClass: 'overdue', meta: `Overdue ${overdueMinutes} min` };
  }

  const neutralPercent = status === 'IN_PROGRESS' ? 45 : 20;
  return { percent: neutralPercent, barClass: 'neutral', meta: '' };
}

function resolveBadge(status: string) {
  if (status === 'VERIFIED') {
    return { label: 'Verified', className: 'badge badge-verified' };
  }
  if (status === 'COMPLETED' || status === 'IN_PROGRESS') {
    return { label: 'In progress', className: 'badge badge-progress' };
  }
  if (status === 'REJECTED') {
    return { label: 'Rejected', className: 'badge badge-rejected' };
  }
  return { label: 'Pending', className: 'badge badge-pending' };
}

function parseErrorMessageFromPayload(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const maybeMessage = (payload as { message?: string | string[] }).message;
  if (Array.isArray(maybeMessage)) return maybeMessage[0] || fallback;
  if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) return maybeMessage;
  return fallback;
}

export function PublicResultProxyPage() {
  const { id, '*': remainder } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState<PublicResultStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pdfOpenUrl, setPdfOpenUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);

  const apiBaseUrl = useMemo(() => deriveApiBaseUrl(), []);
  const encodedOrderId = useMemo(() => encodeURIComponent(String(id ?? '')), [id]);
  const apiStatusUrl = useMemo(
    () => (id ? `${apiBaseUrl}/public/results/${encodedOrderId}/status` : null),
    [apiBaseUrl, encodedOrderId, id],
  );
  const apiPdfUrl = useMemo(
    () => (id ? `${apiBaseUrl}/public/results/${encodedOrderId}/pdf` : null),
    [apiBaseUrl, encodedOrderId, id],
  );
  const publicResultDocumentBaseUrl = useMemo(
    () => (id ? `${apiBaseUrl}/public/results/${encodedOrderId}/tests` : null),
    [apiBaseUrl, encodedOrderId, id],
  );
  const remainderSegment = String(remainder ?? '')
    .split('/')
    .filter(Boolean)[0]
    ?.toLowerCase();
  const isPdfMode = remainderSegment === 'pdf';

  useEffect(() => {
    if (!id || isPdfMode || !apiStatusUrl) return;

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const response = await fetch(apiStatusUrl, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        });
        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json()
          : null;
        if (!response.ok) {
          throw new Error(parseErrorMessageFromPayload(payload, 'Unable to load result status.'));
        }
        if (cancelled) return;
        const nextStatus = payload as PublicResultStatus;
        setStatus(nextStatus);
        setLastUpdated(new Date());
        setStatusError(null);
        if (nextStatus.ready) {
          navigate(`/public/results/${encodedOrderId}/pdf${location.search || ''}`, { replace: true });
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unable to load result status.';
        setStatusError(message);
      }
    };

    void pollStatus();
    const intervalId = window.setInterval(() => {
      void pollStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiStatusUrl, encodedOrderId, id, isPdfMode, location.search, navigate]);

  useEffect(() => {
    if (!id || !isPdfMode || !apiPdfUrl) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);

    const loadPdf = async () => {
      try {
        const response = await fetch(apiPdfUrl, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok) {
          let message = `Unable to load PDF (${response.status}).`;
          try {
            const payload = await response.json();
            message = parseErrorMessageFromPayload(payload, message);
          } catch {
            // keep default message when body is not JSON
          }
          throw new Error(message);
        }
        const blob = await response.blob();
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        setPdfOpenUrl(nextUrl);
        window.location.replace(nextUrl);
      } catch (error) {
        if (cancelled) return;
        setPdfError(error instanceof Error ? error.message : 'Unable to load PDF.');
      } finally {
        if (!cancelled) {
          setPdfLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [apiPdfUrl, id, isPdfMode]);

  if (!id) {
    return (
      <div className="public-result-proxy-shell">
        <div className="public-result-card">
          <div className="public-result-error">Invalid public result link.</div>
        </div>
      </div>
    );
  }

  if (isPdfMode) {
    return (
      <div className="public-result-pdf-shell">
        {pdfLoading ? <div className="public-result-pdf-message">Opening PDF result...</div> : null}
        {pdfError ? (
          <div className="public-result-pdf-message">
            <div>{pdfError}</div>
            {apiPdfUrl ? (
              <a href={apiPdfUrl} target="_blank" rel="noreferrer">
                Open PDF directly
              </a>
            ) : null}
          </div>
        ) : null}
        {!pdfLoading && !pdfError && pdfOpenUrl ? (
          <div className="public-result-pdf-message">
            <div>PDF is ready.</div>
            <a href={pdfOpenUrl}>Open PDF</a>
          </div>
        ) : null}
        <style>{`
          .public-result-pdf-shell {
            min-height: 100vh;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px;
          }
          .public-result-pdf-message {
            margin: auto;
            color: #334155;
            text-align: center;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          }
          .public-result-pdf-message a {
            color: #2563eb;
          }
        `}</style>
      </div>
    );
  }

  const current = status;
  const tests = current?.tests ?? [];
  const canAccessUploadedDocuments = current?.paymentStatus === 'paid';
  const reportableCount = Number(current?.reportableCount ?? 0);
  const verifiedCount = Number(current?.verifiedCount ?? 0);
  const progressPercentRaw = Number(current?.progressPercent ?? 0);
  const progressPercent = Number.isFinite(progressPercentRaw)
    ? Math.max(0, Math.min(100, progressPercentRaw))
    : 0;

  return (
    <div className="public-result-proxy-shell">
      <div className="public-result-card">
        <div className="public-result-header">
          <p className="public-result-top-line" dir="rtl">تکایە چاوەڕێ بکە، ئەنجامی تاقیکردنەوەکانت بە شێوەی خۆکار نوێ دەبێتەوە.</p>
          <p className="public-result-top-line public-result-top-line-alt" dir="rtl">يرجى الانتظار، يتم تحديث حالة التحاليل تلقائياً حتى اكتمال النتيجة.</p>
        </div>

        <div className="public-result-summary">
          <div className="public-result-summary-row">
            <span lang="ckb" dir="rtl">ناو</span>
            <strong>{current?.patientName || '-'}</strong>
          </div>
          <div className="public-result-summary-row">
            <span lang="ckb" dir="rtl">داواكاری</span>
            <strong>{current?.orderNumber || '-'}</strong>
          </div>
          <div className="public-result-summary-row">
            <span lang="ckb" dir="rtl">بەرواری تۆمار</span>
            <strong>{formatDateTime(current?.registeredAt)}</strong>
          </div>
        </div>

        <div className="public-result-overall">
          <div className="public-result-overall-head">
            <span>Progress</span>
            <span>{verifiedCount} / {reportableCount}</span>
          </div>
          <div className="public-result-overall-track">
            <div className="public-result-overall-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="public-result-tests">
          {tests.length === 0 ? (
            <div className="public-result-test-row">
              <div className="public-result-test-name">No reportable tests yet.</div>
            </div>
          ) : (
            tests.map((test) => {
              const normalized = normalizeStatus(test.status);
              const badge = resolveBadge(normalized);
              const progress = current ? resolveTestProgress(current, test) : { percent: 0, barClass: 'neutral', meta: '' };
              return (
                <div key={test.orderTestId} className="public-result-test-row">
                  <div className="public-result-test-head">
                    <div className="public-result-test-name">{test.testCode || '-'} - {test.testName || '-'}</div>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                  <div className="public-result-test-dept">{test.departmentName || '-'}</div>
                  <div className="public-result-bar-track">
                    <div className={`public-result-bar-fill ${progress.barClass}`} style={{ width: `${progress.percent}%` }} />
                  </div>
                  <div className="public-result-test-meta">{progress.meta}</div>
                  {canAccessUploadedDocuments && publicResultDocumentBaseUrl && test.resultDocument?.fileName ? (
                    <div className="public-result-doc-links">
                      <a
                        href={`${publicResultDocumentBaseUrl}/${encodeURIComponent(test.orderTestId)}/document`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View PDF
                      </a>
                      <a
                        href={`${publicResultDocumentBaseUrl}/${encodeURIComponent(test.orderTestId)}/document?download=true`}
                        rel="noreferrer"
                      >
                        Download PDF
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="public-result-footer">
          <div>Checking every 5 seconds...</div>
          <div>{lastUpdated ? `Last update: ${lastUpdated.toLocaleTimeString()}` : '-'}</div>
        </div>

        {statusError ? <div className="public-result-error">{statusError}</div> : null}
      </div>

      <style>{`
        .public-result-proxy-shell {
          min-height: 100vh;
          background: linear-gradient(180deg, #e2e8f0 0%, #f8fafc 40%, #f8fafc 100%);
          padding: 18px;
          color: #0f172a;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        }
        .public-result-card {
          max-width: 860px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
          overflow: hidden;
        }
        .public-result-header {
          padding: 20px 20px 14px;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        }
        .public-result-top-line {
          margin: 0;
          line-height: 1.55;
          font-size: 1.04rem;
          font-weight: 700;
          color: #1d4ed8;
        }
        .public-result-top-line-alt {
          margin-top: 6px;
          color: #0f766e;
        }
        .public-result-summary {
          padding: 14px 20px;
          display: grid;
          gap: 8px;
          border-bottom: 1px solid #e2e8f0;
        }
        .public-result-summary-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          font-size: 1.03rem;
          color: #64748b;
        }
        .public-result-summary-row strong {
          color: #0f172a;
          font-weight: 700;
          font-size: 1.08rem;
        }
        .public-result-overall {
          padding: 14px 20px;
          border-bottom: 1px solid #e2e8f0;
          background: #fcfdff;
        }
        .public-result-overall-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          color: #64748b;
          font-size: 0.95rem;
          font-weight: 600;
        }
        .public-result-overall-track {
          height: 11px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }
        .public-result-overall-fill {
          height: 100%;
          width: 0;
          background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%);
          transition: width 0.35s ease;
        }
        .public-result-tests {
          padding: 14px 20px 18px;
          display: grid;
          gap: 10px;
        }
        .public-result-test-row {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          background: #fff;
        }
        .public-result-test-head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
        }
        .public-result-test-name {
          font-weight: 700;
          font-size: 1rem;
          color: #0f172a;
          line-height: 1.3;
        }
        .public-result-test-dept {
          margin-top: 2px;
          font-size: 0.9rem;
          color: #64748b;
        }
        .badge {
          font-size: 0.82rem;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid transparent;
          white-space: nowrap;
        }
        .badge-verified {
          color: #166534;
          background: #dcfce7;
          border-color: #86efac;
        }
        .badge-progress {
          color: #92400e;
          background: #ffedd5;
          border-color: #fdba74;
        }
        .badge-pending {
          color: #334155;
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .badge-rejected {
          color: #991b1b;
          background: #fee2e2;
          border-color: #fecaca;
        }
        .public-result-bar-track {
          margin-top: 8px;
          height: 8px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }
        .public-result-bar-fill {
          height: 100%;
          width: 0;
          border-radius: inherit;
          transition: width 0.35s ease;
          background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
        }
        .public-result-bar-fill.verified {
          background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
        }
        .public-result-bar-fill.neutral {
          background: linear-gradient(90deg, #94a3b8 0%, #64748b 100%);
        }
        .public-result-bar-fill.overdue {
          background: linear-gradient(90deg, #f97316 0%, #dc2626 100%);
        }
        .public-result-test-meta {
          margin-top: 6px;
          min-height: 1.1em;
          font-size: 0.88rem;
          color: #64748b;
          font-weight: 600;
        }
        .public-result-doc-links {
          margin-top: 10px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .public-result-doc-links a {
          color: #2563eb;
          font-size: 0.9rem;
          font-weight: 700;
          text-decoration: none;
        }
        .public-result-doc-links a:hover {
          text-decoration: underline;
        }
        .public-result-footer {
          border-top: 1px solid #e2e8f0;
          padding: 10px 20px 14px;
          color: #64748b;
          font-size: 0.9rem;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .public-result-error {
          margin: 0 20px 16px;
          padding: 10px 12px;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fff1f2;
          color: #9f1239;
          font-size: 0.9rem;
        }
        @media (max-width: 640px) {
          .public-result-proxy-shell {
            padding: 10px;
          }
          .public-result-header,
          .public-result-summary,
          .public-result-overall,
          .public-result-tests,
          .public-result-footer {
            padding-left: 12px;
            padding-right: 12px;
          }
          .public-result-top-line {
            font-size: 1.02rem;
          }
          .public-result-summary-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
}
