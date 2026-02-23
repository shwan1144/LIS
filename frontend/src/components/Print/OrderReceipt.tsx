import { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import dayjs from 'dayjs';
import type { OrderDto } from '../../api/client';
import './print.css';

interface OrderReceiptProps {
  order: OrderDto;
  labName?: string;
}

export const OrderReceipt = forwardRef<HTMLDivElement, OrderReceiptProps>(
  ({ order, labName }, ref) => {
    // Collect root-level tests only (panels, not their children)
    const allTests = order.samples.flatMap((sample) =>
      sample.orderTests
        .filter((ot) => !ot.parentOrderTestId)
        .map((ot) => ({
          code: ot.test.code,
          name: ot.test.name,
          price: ot.price,
        }))
    );

    const patientName = order.patient.fullName || '';
    const patientAge = order.patient.dateOfBirth
      ? dayjs().diff(dayjs(order.patient.dateOfBirth), 'year')
      : null;
    const apiBase = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '');
    const patientResultUrl = `${apiBase}/public/results/${order.id}`;
    const onlineResultsEnabled = order.lab?.enableOnlineResults !== false;
    const qrValue = onlineResultsEnabled ? patientResultUrl : (order.orderNumber || order.id);
    const qrNote = onlineResultsEnabled ? 'Scan to check result status' : 'QR shows order number';

    return (
      <div ref={ref} className="print-receipt">
        {/* Header */}
        <div className="receipt-header">
          <h2 className="receipt-lab-name">{labName || order.lab?.name || 'Laboratory'}</h2>
          <p className="receipt-subtitle">Laboratory Information System</p>
        </div>

        {/* QR Code */}
        <div className="receipt-qr">
          <QRCodeSVG
            value={qrValue}
            size={80}
            level="M"
          />
          <div className="receipt-qr-note">{qrNote}</div>
        </div>

        {/* Order Info */}
        <div className="receipt-order-info">
          <div className="receipt-row">
            <span className="receipt-label">Order #:</span>
            <span className="receipt-value receipt-order-number">{order.orderNumber || '—'}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-label">Date:</span>
            <span className="receipt-value">{dayjs(order.registeredAt).format('YYYY-MM-DD HH:mm')}</span>
          </div>
          {order.shift && (
            <div className="receipt-row">
              <span className="receipt-label">Shift:</span>
              <span className="receipt-value">{order.shift.name || order.shift.code}</span>
            </div>
          )}
        </div>

        <div className="receipt-divider" />

        {/* Patient Info */}
        <div className="receipt-patient-info">
          <div className="receipt-row">
            <span className="receipt-label">Patient:</span>
            <span className="receipt-value">{patientName}</span>
          </div>
          {patientAge !== null && (
            <div className="receipt-row">
              <span className="receipt-label">Age:</span>
              <span className="receipt-value">{patientAge} years</span>
            </div>
          )}
          {order.patient.sex && (
            <div className="receipt-row">
              <span className="receipt-label">Gender:</span>
              <span className="receipt-value">{order.patient.sex === 'M' ? 'Male' : order.patient.sex === 'F' ? 'Female' : order.patient.sex}</span>
            </div>
          )}
          {order.patient.phone && (
            <div className="receipt-row">
              <span className="receipt-label">Phone:</span>
              <span className="receipt-value">{order.patient.phone}</span>
            </div>
          )}
        </div>

        <div className="receipt-divider" />

        {/* Tests */}
        <div className="receipt-tests">
          <table className="receipt-table">
            <thead>
              <tr>
                <th className="receipt-th-left">Test</th>
                <th className="receipt-th-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {allTests.map((test, idx) => (
                <tr key={idx}>
                  <td className="receipt-td-left">{test.code}</td>
                  <td className="receipt-td-right">
                    {test.price !== null ? `${parseFloat(test.price.toString()).toFixed(0)} IQD` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="receipt-divider-double" />

        {/* Subtotal */}
        <div className="receipt-row">
          <span className="receipt-label">Subtotal</span>
          <span className="receipt-value">
            {parseFloat(order.totalAmount.toString()).toFixed(0)} IQD
          </span>
        </div>
        {order.discountPercent != null && Number(order.discountPercent) > 0 && (
          <>
            <div className="receipt-row">
              <span className="receipt-label">Discount</span>
              <span className="receipt-value">
                {parseFloat(order.discountPercent.toString()).toFixed(0)}%
              </span>
            </div>
            <div className="receipt-row">
              <span className="receipt-label">Discount Amount</span>
              <span className="receipt-value">
                -{(
                  parseFloat(order.totalAmount.toString()) -
                  parseFloat((order.finalAmount ?? order.totalAmount).toString())
                ).toFixed(0)} IQD
              </span>
            </div>
          </>
        )}
        {/* Total */}
        <div className="receipt-total">
          <span className="receipt-total-label">TOTAL</span>
          <span className="receipt-total-value">
            {(
              order.finalAmount != null
                ? parseFloat(order.finalAmount.toString())
                : parseFloat(order.totalAmount.toString())
            ).toFixed(0)} IQD
          </span>
        </div>

        {/* Payment Status */}
        <div className="receipt-divider" />
        {order.paymentStatus === 'paid' ? (
          <div className="receipt-payment-status receipt-payment-paid">
            ✓ PAID
          </div>
        ) : order.paymentStatus === 'partial' ? (
          <div className="receipt-payment-status receipt-payment-partial">
            <div className="receipt-payment-badge">PARTIALLY PAID</div>
            {order.paidAmount != null && (
              <>
                <div className="receipt-row">
                  <span className="receipt-label">Paid</span>
                  <span className="receipt-value">
                    {parseFloat(order.paidAmount.toString()).toFixed(0)} IQD
                  </span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Remaining</span>
                  <span className="receipt-value" style={{ fontWeight: 'bold' }}>
                    {(
                      (order.finalAmount != null
                        ? parseFloat(order.finalAmount.toString())
                        : parseFloat(order.totalAmount.toString())) -
                      parseFloat(order.paidAmount.toString())
                    ).toFixed(0)} IQD
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="receipt-payment-status receipt-payment-unpaid">
            ✗ NOT PAID
          </div>
        )}

        {/* Footer */}
        <div className="receipt-footer">
          {order.notes && (
            <p className="receipt-notes">Notes: {order.notes}</p>
          )}
          <p className="receipt-thank-you">Thank you for choosing our laboratory</p>
          <p className="receipt-timestamp">
            Printed: {dayjs().format('YYYY-MM-DD HH:mm:ss')}
          </p>
        </div>
      </div>
    );
  }
);

OrderReceipt.displayName = 'OrderReceipt';
