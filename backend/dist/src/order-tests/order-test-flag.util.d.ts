import { ResultFlag } from '../entities/order-test.entity';
export type PublicResultFlag = ResultFlag.NORMAL | ResultFlag.HIGH | ResultFlag.LOW | ResultFlag.POSITIVE | ResultFlag.NEGATIVE | ResultFlag.ABNORMAL;
export declare function normalizeOrderTestFlag(flag: string | ResultFlag | null | undefined): ResultFlag | null;
