import type { Order } from '../../entities/order.entity';
import type { OrderTest } from '../../entities/order-test.entity';
export declare function buildResultsReportHtml(input: {
    order: Order;
    orderTests: OrderTest[];
    verifiedCount: number;
    reportableCount: number;
    verifiers: string[];
    latestVerifiedAt: Date | null;
    comments: string[];
    kurdishFontBase64?: string;
    orderQrDataUrl?: string | null;
}): string;
