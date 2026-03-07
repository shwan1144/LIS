"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Forwarder = void 0;
class Forwarder {
    handler;
    constructor(initialHandler) {
        this.handler = initialHandler;
    }
    setHandler(nextHandler) {
        this.handler = nextHandler;
    }
    async deliver(message) {
        return this.handler(message);
    }
}
exports.Forwarder = Forwarder;
