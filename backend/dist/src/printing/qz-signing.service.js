"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QzSigningService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const QZ_SIGNATURE_ALGORITHM = 'SHA512';
let QzSigningService = class QzSigningService {
    getCertificate() {
        return this.loadConfig().certificate;
    }
    getSignatureAlgorithm() {
        return QZ_SIGNATURE_ALGORITHM;
    }
    signPayload(payload) {
        const normalizedPayload = payload ?? '';
        if (!normalizedPayload.trim()) {
            throw new common_1.BadRequestException('QZ signing payload is empty');
        }
        const config = this.loadConfig();
        const signer = (0, crypto_1.createSign)('RSA-SHA512');
        signer.update(normalizedPayload, 'utf8');
        signer.end();
        return signer.sign(config.passphrase
            ? { key: config.privateKey, passphrase: config.passphrase }
            : config.privateKey, 'base64');
    }
    loadConfig() {
        const certificate = this.readPemValue(process.env.QZ_CERT_PEM, process.env.QZ_CERT_PATH, 'QZ certificate');
        const privateKey = this.readPemValue(process.env.QZ_PRIVATE_KEY_PEM, process.env.QZ_PRIVATE_KEY_PATH, 'QZ private key');
        const passphrase = this.normalizeOptionalValue(process.env.QZ_PRIVATE_KEY_PASSPHRASE);
        return {
            certificate,
            privateKey,
            ...(passphrase ? { passphrase } : {}),
        };
    }
    readPemValue(inlineValue, filePath, label) {
        const normalizedInline = this.normalizeOptionalValue(inlineValue);
        if (normalizedInline) {
            return normalizedInline.replace(/\\n/g, '\n');
        }
        const normalizedPath = this.normalizeOptionalValue(filePath);
        if (normalizedPath) {
            try {
                return (0, fs_1.readFileSync)(normalizedPath, 'utf8').trim();
            }
            catch (error) {
                throw new common_1.ServiceUnavailableException(`${label} could not be read from ${normalizedPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const envHint = label === 'QZ certificate'
            ? 'QZ_CERT_PEM or QZ_CERT_PATH'
            : 'QZ_PRIVATE_KEY_PEM or QZ_PRIVATE_KEY_PATH';
        throw new common_1.ServiceUnavailableException(`${label} is not configured. Set ${envHint} on the backend.`);
    }
    normalizeOptionalValue(value) {
        if (typeof value !== 'string') {
            return null;
        }
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }
};
exports.QzSigningService = QzSigningService;
exports.QzSigningService = QzSigningService = __decorate([
    (0, common_1.Injectable)()
], QzSigningService);
//# sourceMappingURL=qz-signing.service.js.map