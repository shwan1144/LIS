"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwarder = exports.Forwarder = void 0;
const axios_1 = __importDefault(require("axios"));
class Forwarder {
    async deliver(message) {
        const apiUrl = (process.env.LIS_API_URL || '').trim();
        const apiKey = (process.env.LIS_API_KEY || '').trim();
        const gatewayId = (process.env.GATEWAY_ID || '').trim();
        if (!apiUrl || !apiKey) {
            throw new Error('LIS_API_URL or LIS_API_KEY not configured in .env');
        }
        const timeoutMs = parseInt(process.env.FORWARD_TIMEOUT_MS || '8000', 10);
        try {
            const response = await axios_1.default.post(`${apiUrl}/instruments/${message.instrumentId}/simulate`, {
                rawMessage: message.rawMessage,
                localMessageId: message.id,
                gatewayId: gatewayId || undefined,
                protocolHint: message.protocolHint ?? undefined,
            }, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: timeoutMs,
            });
            if (response.data?.success === false) {
                throw new Error(response.data?.message || 'API returned success=false');
            }
            return {
                messageId: response.data?.messageId,
                warning: response.data?.success === true
                    ? undefined
                    : (typeof response.data?.message === 'string' ? response.data.message : undefined),
            };
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                const status = error.response?.status;
                const responseMessage = error.response?.data?.message;
                const rootMessage = typeof responseMessage === 'string'
                    ? responseMessage
                    : (error.message || 'Unknown HTTP error');
                throw new Error(status ? `HTTP ${status}: ${rootMessage}` : rootMessage);
            }
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(String(error));
        }
    }
}
exports.Forwarder = Forwarder;
exports.forwarder = new Forwarder();
