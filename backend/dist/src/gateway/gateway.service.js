"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const jwt_1 = require("@nestjs/jwt");
const instrument_entity_1 = require("../entities/instrument.entity");
const lab_entity_1 = require("../entities/lab.entity");
const gateway_entity_1 = require("../entities/gateway.entity");
const password_util_1 = require("../auth/password.util");
const instruments_service_1 = require("../instruments/instruments.service");
let GatewayService = class GatewayService {
    constructor(gatewayRepo, activationCodeRepo, gatewayTokenRepo, receiptRepo, instrumentRepo, labRepo, jwtService, instrumentsService) {
        this.gatewayRepo = gatewayRepo;
        this.activationCodeRepo = activationCodeRepo;
        this.gatewayTokenRepo = gatewayTokenRepo;
        this.receiptRepo = receiptRepo;
        this.instrumentRepo = instrumentRepo;
        this.labRepo = labRepo;
        this.jwtService = jwtService;
        this.instrumentsService = instrumentsService;
    }
    async createActivationCode(dto) {
        const lab = await this.labRepo.findOne({ where: { id: dto.labId } });
        if (!lab || !lab.isActive) {
            throw new common_1.NotFoundException('Lab not found or inactive');
        }
        const activationCode = this.generateActivationCode();
        const now = Date.now();
        const ttlMinutes = Number.isFinite(dto.expiresInMinutes)
            ? dto.expiresInMinutes
            : this.getDefaultActivationCodeTtlMinutes();
        const expiresAt = new Date(now + ttlMinutes * 60 * 1000);
        const code = this.activationCodeRepo.create({
            id: (0, crypto_1.randomUUID)(),
            labId: dto.labId,
            codeHash: this.hashActivationCode(activationCode),
            expiresAt,
            usedAt: null,
            revokedAt: null,
        });
        await this.activationCodeRepo.save(code);
        return {
            activationCode,
            expiresAt: expiresAt.toISOString(),
            labId: dto.labId,
        };
    }
    async activateGateway(dto) {
        const activation = await this.activationCodeRepo.findOne({
            where: { codeHash: this.hashActivationCode(dto.activationCode.trim()) },
        });
        if (!activation) {
            throw new common_1.UnauthorizedException('Invalid activation code');
        }
        const now = new Date();
        if (activation.revokedAt) {
            throw new common_1.UnauthorizedException('Activation code is revoked');
        }
        if (activation.usedAt) {
            throw new common_1.UnauthorizedException('Activation code already used');
        }
        if (activation.expiresAt.getTime() <= now.getTime()) {
            throw new common_1.UnauthorizedException('Activation code expired');
        }
        const fingerprintHash = this.hashFingerprint(dto.machineFingerprint);
        let gateway = await this.gatewayRepo.findOne({
            where: { labId: activation.labId, fingerprintHash },
        });
        if (!gateway) {
            gateway = this.gatewayRepo.create({
                id: (0, crypto_1.randomUUID)(),
                labId: activation.labId,
                name: dto.deviceName.trim(),
                fingerprintHash,
                status: gateway_entity_1.GatewayDeviceStatus.ACTIVE,
                version: dto.gatewayVersion?.trim() || null,
                lastSeenAt: now,
                lastHeartbeat: null,
            });
        }
        else {
            gateway.name = dto.deviceName.trim();
            gateway.version = dto.gatewayVersion?.trim() || gateway.version;
            gateway.status = gateway_entity_1.GatewayDeviceStatus.ACTIVE;
            gateway.lastSeenAt = now;
        }
        await this.gatewayRepo.save(gateway);
        activation.usedAt = now;
        await this.activationCodeRepo.save(activation);
        const tokenPair = await this.issueGatewayTokens(gateway.id, gateway.labId);
        return {
            gatewayId: gateway.id,
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            expiresInSec: this.getAccessTtlSeconds(),
        };
    }
    async refreshGatewayToken(dto) {
        const gateway = await this.gatewayRepo.findOne({ where: { id: dto.gatewayId } });
        if (!gateway || gateway.status === gateway_entity_1.GatewayDeviceStatus.DISABLED) {
            throw new common_1.UnauthorizedException('Gateway not found or disabled');
        }
        const { tokenId, tokenSecret } = this.parseRefreshToken(dto.refreshToken);
        const existingToken = await this.gatewayTokenRepo.findOne({
            where: { id: tokenId, gatewayId: gateway.id },
        });
        if (!existingToken) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (existingToken.revokedAt) {
            throw new common_1.UnauthorizedException('Refresh token revoked');
        }
        if (existingToken.expiresAt.getTime() <= Date.now()) {
            existingToken.revokedAt = new Date();
            await this.gatewayTokenRepo.save(existingToken);
            throw new common_1.UnauthorizedException('Refresh token expired');
        }
        const valid = await (0, password_util_1.verifyPassword)(tokenSecret, existingToken.refreshHash);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        existingToken.revokedAt = new Date();
        await this.gatewayTokenRepo.save(existingToken);
        const tokenPair = await this.issueGatewayTokens(gateway.id, gateway.labId);
        return {
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            expiresInSec: this.getAccessTtlSeconds(),
        };
    }
    async getGatewayConfig(auth) {
        await this.assertGateway(auth);
        const instruments = await this.instrumentRepo.find({
            where: {
                labId: auth.labId,
                isActive: true,
            },
            order: { code: 'ASC' },
        });
        const mappedInstruments = [];
        for (const item of instruments) {
            const isHl7Tcp = item.protocol === instrument_entity_1.InstrumentProtocol.HL7_V2 &&
                item.connectionType === instrument_entity_1.ConnectionType.TCP_SERVER &&
                Number.isFinite(item.port) &&
                item.port != null;
            if (isHl7Tcp) {
                mappedInstruments.push({
                    instrumentId: item.id,
                    name: item.name,
                    protocol: instrument_entity_1.InstrumentProtocol.HL7_V2,
                    connectionType: instrument_entity_1.ConnectionType.TCP_SERVER,
                    enabled: item.isActive !== false,
                    port: item.port,
                    hl7StartBlock: item.hl7StartBlock || '\u000b',
                    hl7EndBlock: item.hl7EndBlock || '\u001c\r',
                });
                continue;
            }
            const isAstmSerial = item.protocol === instrument_entity_1.InstrumentProtocol.ASTM &&
                item.connectionType === instrument_entity_1.ConnectionType.SERIAL &&
                Boolean(item.serialPort?.trim()) &&
                Number.isFinite(item.baudRate) &&
                item.baudRate != null &&
                Boolean(item.dataBits?.trim()) &&
                Boolean(item.parity?.trim()) &&
                Boolean(item.stopBits?.trim());
            if (isAstmSerial) {
                mappedInstruments.push({
                    instrumentId: item.id,
                    name: item.name,
                    protocol: instrument_entity_1.InstrumentProtocol.ASTM,
                    connectionType: instrument_entity_1.ConnectionType.SERIAL,
                    enabled: item.isActive !== false,
                    serialPort: item.serialPort,
                    baudRate: item.baudRate,
                    dataBits: item.dataBits,
                    parity: item.parity,
                    stopBits: item.stopBits,
                });
            }
        }
        return {
            gatewayId: auth.gatewayId,
            pollIntervalSec: this.getConfigPollIntervalSec(),
            heartbeatIntervalSec: this.getHeartbeatIntervalSec(),
            instruments: mappedInstruments,
        };
    }
    async ingestGatewayMessage(auth, dto) {
        this.assertGatewayContext(auth, dto.gatewayId);
        const instrument = await this.instrumentRepo.findOne({
            where: { id: dto.instrumentId, labId: auth.labId },
        });
        if (!instrument) {
            throw new common_1.NotFoundException('Instrument not found for this gateway lab');
        }
        const existing = await this.receiptRepo.findOne({
            where: { gatewayId: auth.gatewayId, localMessageId: dto.localMessageId.trim() },
        });
        if (existing) {
            return {
                accepted: true,
                serverMessageId: existing.serverMessageId ?? undefined,
                duplicate: true,
            };
        }
        const result = await this.instrumentsService.simulateMessage(instrument.id, auth.labId, {
            rawMessage: dto.rawMessage,
            localMessageId: dto.localMessageId.trim(),
            gatewayId: auth.gatewayId,
        });
        const receipt = this.receiptRepo.create({
            id: (0, crypto_1.randomUUID)(),
            gatewayId: auth.gatewayId,
            localMessageId: dto.localMessageId.trim().slice(0, 128),
            instrumentId: instrument.id,
            serverMessageId: result.messageId ?? null,
            receivedAt: this.safeParseDate(dto.receivedAt) ?? new Date(),
        });
        try {
            await this.receiptRepo.save(receipt);
        }
        catch (error) {
            if (error instanceof typeorm_2.QueryFailedError &&
                typeof error.driverError
                    ?.code === 'string' &&
                error.driverError.code ===
                    '23505') {
                return {
                    accepted: true,
                    serverMessageId: result.messageId,
                    duplicate: true,
                };
            }
            throw error;
        }
        return {
            accepted: true,
            serverMessageId: result.messageId,
            duplicate: Boolean(result.duplicate),
        };
    }
    async recordHeartbeat(auth, dto) {
        this.assertGatewayContext(auth, dto.gatewayId);
        const gateway = await this.assertGateway(auth);
        gateway.lastSeenAt = new Date();
        gateway.version = dto.version;
        gateway.status = gateway_entity_1.GatewayDeviceStatus.ACTIVE;
        gateway.lastHeartbeat = {
            queueDepth: dto.queueDepth,
            listeners: dto.listeners,
            receivedAt: new Date().toISOString(),
        };
        await this.gatewayRepo.save(gateway);
        return {
            accepted: true,
            serverTime: new Date().toISOString(),
        };
    }
    assertGatewayContext(auth, requestedGatewayId) {
        if (auth.gatewayId !== requestedGatewayId) {
            throw new common_1.ForbiddenException('Gateway token does not match gatewayId');
        }
    }
    async assertGateway(auth) {
        const gateway = await this.gatewayRepo.findOne({
            where: {
                id: auth.gatewayId,
                labId: auth.labId,
            },
        });
        if (!gateway || gateway.status === gateway_entity_1.GatewayDeviceStatus.DISABLED) {
            throw new common_1.UnauthorizedException('Gateway not authorized');
        }
        return gateway;
    }
    async issueGatewayTokens(gatewayId, labId) {
        const accessToken = this.jwtService.sign({
            sub: gatewayId,
            labId,
            tokenType: 'gateway_access',
            scope: ['gateway:config:read', 'gateway:message:write', 'gateway:heartbeat:write'],
        }, {
            expiresIn: this.getAccessTtlSeconds(),
        });
        const refreshToken = await this.issueRefreshToken(gatewayId);
        return {
            accessToken,
            refreshToken,
        };
    }
    async issueRefreshToken(gatewayId) {
        const tokenId = (0, crypto_1.randomUUID)();
        const secret = (0, crypto_1.randomBytes)(48).toString('base64url');
        const token = `${tokenId}.${secret}`;
        const refreshHash = await (0, password_util_1.hashPassword)(secret);
        const expiresAt = new Date(Date.now() + this.getRefreshTtlDays() * 24 * 60 * 60 * 1000);
        const tokenRecord = this.gatewayTokenRepo.create({
            id: tokenId,
            gatewayId,
            refreshHash,
            expiresAt,
            revokedAt: null,
        });
        await this.gatewayTokenRepo.save(tokenRecord);
        return token;
    }
    parseRefreshToken(rawToken) {
        const [tokenId, tokenSecret] = (rawToken || '').trim().split('.');
        if (!tokenId || !tokenSecret) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        return { tokenId, tokenSecret };
    }
    generateActivationCode() {
        const left = (0, crypto_1.randomBytes)(3).toString('hex').toUpperCase();
        const right = (0, crypto_1.randomBytes)(3).toString('hex').toUpperCase();
        return `GW-${left}-${right}`;
    }
    hashActivationCode(value) {
        const pepper = (process.env.GATEWAY_ACTIVATION_PEPPER || '').trim();
        return (0, crypto_1.createHash)('sha256')
            .update(`${pepper}:${value.trim().toUpperCase()}`)
            .digest('hex');
    }
    hashFingerprint(value) {
        return (0, crypto_1.createHash)('sha256').update(value.trim()).digest('hex');
    }
    safeParseDate(input) {
        const ts = Date.parse(input);
        if (!Number.isFinite(ts))
            return null;
        return new Date(ts);
    }
    getAccessTtlSeconds() {
        const value = parseInt(process.env.GATEWAY_ACCESS_TTL_SEC || '3600', 10);
        return Number.isFinite(value) && value > 60 ? value : 3600;
    }
    getRefreshTtlDays() {
        const value = parseInt(process.env.GATEWAY_REFRESH_TTL_DAYS || '30', 10);
        return Number.isFinite(value) && value > 0 ? value : 30;
    }
    getDefaultActivationCodeTtlMinutes() {
        const value = parseInt(process.env.GATEWAY_ACTIVATION_TTL_MIN || '1440', 10);
        return Number.isFinite(value) && value > 0 ? value : 1440;
    }
    getConfigPollIntervalSec() {
        const value = parseInt(process.env.GATEWAY_CONFIG_POLL_SEC || '60', 10);
        return Number.isFinite(value) && value >= 15 ? value : 60;
    }
    getHeartbeatIntervalSec() {
        const value = parseInt(process.env.GATEWAY_HEARTBEAT_SEC || '30', 10);
        return Number.isFinite(value) && value >= 10 ? value : 30;
    }
};
exports.GatewayService = GatewayService;
exports.GatewayService = GatewayService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(gateway_entity_1.GatewayDevice)),
    __param(1, (0, typeorm_1.InjectRepository)(gateway_entity_1.GatewayActivationCode)),
    __param(2, (0, typeorm_1.InjectRepository)(gateway_entity_1.GatewayToken)),
    __param(3, (0, typeorm_1.InjectRepository)(gateway_entity_1.GatewayMessageReceipt)),
    __param(4, (0, typeorm_1.InjectRepository)(instrument_entity_1.Instrument)),
    __param(5, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService,
        instruments_service_1.InstrumentsService])
], GatewayService);
//# sourceMappingURL=gateway.service.js.map