"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestRlsContextService = void 0;
const common_1 = require("@nestjs/common");
const node_async_hooks_1 = require("node:async_hooks");
const request_rls_context_types_1 = require("./request-rls-context.types");
let RequestRlsContextService = class RequestRlsContextService {
    constructor() {
        this.storage = new node_async_hooks_1.AsyncLocalStorage();
    }
    runWithContext(context, execute) {
        return this.storage.run(context, execute);
    }
    getContext() {
        return this.storage.getStore() ?? request_rls_context_types_1.NONE_RLS_CONTEXT;
    }
};
exports.RequestRlsContextService = RequestRlsContextService;
exports.RequestRlsContextService = RequestRlsContextService = __decorate([
    (0, common_1.Injectable)()
], RequestRlsContextService);
//# sourceMappingURL=request-rls-context.service.js.map