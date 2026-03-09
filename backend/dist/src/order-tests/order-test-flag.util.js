"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeOrderTestFlag = normalizeOrderTestFlag;
const order_test_entity_1 = require("../entities/order-test.entity");
function normalizeOrderTestFlag(flag) {
    const normalized = String(flag ?? '').trim().toUpperCase();
    if (!normalized)
        return null;
    if (normalized === order_test_entity_1.ResultFlag.NORMAL)
        return order_test_entity_1.ResultFlag.NORMAL;
    if (normalized === order_test_entity_1.ResultFlag.HIGH || normalized === order_test_entity_1.ResultFlag.CRITICAL_HIGH) {
        return order_test_entity_1.ResultFlag.HIGH;
    }
    if (normalized === order_test_entity_1.ResultFlag.LOW || normalized === order_test_entity_1.ResultFlag.CRITICAL_LOW) {
        return order_test_entity_1.ResultFlag.LOW;
    }
    if (normalized === order_test_entity_1.ResultFlag.POSITIVE)
        return order_test_entity_1.ResultFlag.POSITIVE;
    if (normalized === order_test_entity_1.ResultFlag.NEGATIVE)
        return order_test_entity_1.ResultFlag.NEGATIVE;
    if (normalized === order_test_entity_1.ResultFlag.ABNORMAL)
        return order_test_entity_1.ResultFlag.ABNORMAL;
    return null;
}
//# sourceMappingURL=order-test-flag.util.js.map