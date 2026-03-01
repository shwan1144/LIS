"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderResultStatus = exports.OrderDetailView = exports.CreateOrderView = void 0;
var CreateOrderView;
(function (CreateOrderView) {
    CreateOrderView["SUMMARY"] = "summary";
    CreateOrderView["FULL"] = "full";
})(CreateOrderView || (exports.CreateOrderView = CreateOrderView = {}));
var OrderDetailView;
(function (OrderDetailView) {
    OrderDetailView["COMPACT"] = "compact";
    OrderDetailView["FULL"] = "full";
})(OrderDetailView || (exports.OrderDetailView = OrderDetailView = {}));
var OrderResultStatus;
(function (OrderResultStatus) {
    OrderResultStatus["PENDING"] = "PENDING";
    OrderResultStatus["COMPLETED"] = "COMPLETED";
    OrderResultStatus["VERIFIED"] = "VERIFIED";
    OrderResultStatus["REJECTED"] = "REJECTED";
})(OrderResultStatus || (exports.OrderResultStatus = OrderResultStatus = {}));
//# sourceMappingURL=create-order-response.dto.js.map