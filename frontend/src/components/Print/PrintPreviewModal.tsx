import { useRef } from 'react';
import { Modal, Button, Space } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useReactToPrint } from 'react-to-print';
import { OrderReceipt } from './OrderReceipt';
import { AllSampleLabels } from './SampleLabel';
import type { DepartmentDto, OrderDto } from '../../api/client';
import './print.css';

interface PrintPreviewModalProps {
  open: boolean;
  onClose: () => void;
  order: OrderDto | null;
  type: 'receipt' | 'labels';
  labName?: string;
  labelSequenceBy?: 'tube_type' | 'department';
  departments?: DepartmentDto[];
}

export function PrintPreviewModal({
  open,
  onClose,
  order,
  type,
  labName,
  labelSequenceBy,
  departments,
}: PrintPreviewModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: type === 'receipt' 
      ? `Receipt-${order?.orderNumber || 'order'}` 
      : `Labels-${order?.orderNumber || 'order'}`,
  });

  if (!order) return null;

  return (
    <Modal
      title={type === 'receipt' ? 'Print Receipt' : 'Print Sample Labels'}
      open={open}
      onCancel={onClose}
      width={type === 'receipt' ? 400 : 500}
      className="print-preview-modal"
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => handlePrint()}
          >
            Print
          </Button>
        </Space>
      }
    >
      <div className="print-preview-container">
        <div className="print-preview-paper">
          <div ref={printRef} className="print-container">
            {type === 'receipt' ? (
              <OrderReceipt order={order} labName={labName} />
            ) : (
              <AllSampleLabels
                order={order}
                labelSequenceBy={labelSequenceBy}
                departments={departments}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
