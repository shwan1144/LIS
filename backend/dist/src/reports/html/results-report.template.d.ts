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
    defaultLogoBase64?: string;
    kurdishFontBase64?: string;
}): string;
