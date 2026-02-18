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
var TCPListenerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TCPListenerService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const net = require("net");
const instrument_entity_1 = require("../entities/instrument.entity");
const instrument_entity_2 = require("../entities/instrument.entity");
const hl7_parser_service_1 = require("./hl7-parser.service");
const result_processor_service_1 = require("./result-processor.service");
const hl7_ingestion_service_1 = require("./hl7-ingestion.service");
let TCPListenerService = TCPListenerService_1 = class TCPListenerService {
    constructor(instrumentRepo, messageRepo, hl7Parser, resultProcessor, hl7Ingestion) {
        this.instrumentRepo = instrumentRepo;
        this.messageRepo = messageRepo;
        this.hl7Parser = hl7Parser;
        this.resultProcessor = resultProcessor;
        this.hl7Ingestion = hl7Ingestion;
        this.logger = new common_1.Logger(TCPListenerService_1.name);
        this.connections = new Map();
    }
    async onModuleInit() {
        await this.initializeAllListeners();
    }
    async onModuleDestroy() {
        for (const [id, conn] of this.connections) {
            this.logger.log(`Closing connection for instrument ${id}`);
            conn.server?.close();
            conn.socket?.destroy();
        }
        this.connections.clear();
    }
    async initializeAllListeners() {
        const instruments = await this.instrumentRepo.find({
            where: { isActive: true },
        });
        for (const instrument of instruments) {
            if (instrument.connectionType === instrument_entity_1.ConnectionType.TCP_SERVER && instrument.port) {
                await this.startServer(instrument);
            }
            else if (instrument.connectionType === instrument_entity_1.ConnectionType.TCP_CLIENT && instrument.host && instrument.port) {
                await this.connectToInstrument(instrument);
            }
        }
    }
    async startServer(instrument) {
        if (!instrument.port) {
            this.logger.error(`No port configured for instrument ${instrument.code}`);
            return false;
        }
        const existing = this.connections.get(instrument.id);
        if (existing?.server) {
            existing.server.close();
        }
        return new Promise((resolve) => {
            const server = net.createServer((socket) => {
                this.handleConnection(instrument, socket);
            });
            server.on('error', async (err) => {
                this.logger.error(`Server error for ${instrument.code}: ${err.message}`);
                await this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.ERROR, err.message);
                resolve(false);
            });
            server.listen(instrument.port, async () => {
                this.logger.log(`TCP server started for ${instrument.code} on port ${instrument.port}`);
                await this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.ONLINE);
                this.connections.set(instrument.id, {
                    server,
                    buffer: '',
                    instrumentId: instrument.id,
                });
                resolve(true);
            });
        });
    }
    async connectToInstrument(instrument) {
        if (!instrument.host || !instrument.port) {
            this.logger.error(`No host/port configured for instrument ${instrument.code}`);
            return false;
        }
        await this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.CONNECTING);
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.connect(instrument.port, instrument.host, async () => {
                this.logger.log(`Connected to ${instrument.code} at ${instrument.host}:${instrument.port}`);
                await this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.ONLINE);
                this.connections.set(instrument.id, {
                    socket,
                    buffer: '',
                    instrumentId: instrument.id,
                });
                this.setupSocketHandlers(instrument, socket);
                resolve(true);
            });
            socket.on('error', async (err) => {
                this.logger.error(`Connection error for ${instrument.code}: ${err.message}`);
                await this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.ERROR, err.message);
                resolve(false);
            });
            socket.setTimeout(30000, () => {
                this.logger.warn(`Connection timeout for ${instrument.code}`);
                socket.destroy();
            });
        });
    }
    handleConnection(instrument, socket) {
        this.logger.log(`Instrument ${instrument.code} connected from ${socket.remoteAddress}`);
        const conn = this.connections.get(instrument.id);
        if (conn) {
            conn.socket = socket;
        }
        this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.ONLINE);
        this.setupSocketHandlers(instrument, socket);
    }
    setupSocketHandlers(instrument, socket) {
        let buffer = '';
        socket.on('data', async (data) => {
            buffer += data.toString();
            this.logger.debug(`Received data from ${instrument.code}: ${data.length} bytes`);
            const messages = this.extractMessages(buffer, instrument);
            buffer = messages.remaining;
            for (const rawMessage of messages.complete) {
                await this.processMessage(instrument, rawMessage);
            }
            await this.instrumentRepo.update(instrument.id, {
                lastMessageAt: new Date(),
            });
        });
        socket.on('close', async () => {
            this.logger.log(`Connection closed for ${instrument.code}`);
            await this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.OFFLINE);
        });
        socket.on('error', async (err) => {
            this.logger.error(`Socket error for ${instrument.code}: ${err.message}`);
            await this.updateInstrumentStatus(instrument.id, instrument_entity_1.InstrumentStatus.ERROR, err.message);
        });
    }
    extractMessages(buffer, instrument) {
        const complete = [];
        let remaining = buffer;
        const startBlock = instrument.hl7StartBlock || '\x0b';
        const endBlock = instrument.hl7EndBlock || '\x1c\x0d';
        while (true) {
            const startIndex = remaining.indexOf(startBlock);
            if (startIndex === -1)
                break;
            const endIndex = remaining.indexOf(endBlock, startIndex);
            if (endIndex === -1)
                break;
            const message = remaining.substring(startIndex + startBlock.length, endIndex);
            complete.push(message);
            remaining = remaining.substring(endIndex + endBlock.length);
        }
        return { complete, remaining };
    }
    async simulateMessage(instrument, rawMessage) {
        this.logger.log(`Simulating message for ${instrument.code}`);
        try {
            const result = await this.processMessageInternal(instrument, rawMessage);
            return result;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, message: errorMsg };
        }
    }
    async processMessage(instrument, rawMessage) {
        await this.processMessageInternal(instrument, rawMessage);
    }
    async processMessageInternal(instrument, rawMessage) {
        this.logger.log(`Processing message from ${instrument.code}`);
        const messageRecord = this.messageRepo.create({
            instrumentId: instrument.id,
            direction: 'IN',
            messageType: 'UNKNOWN',
            rawMessage,
            status: 'RECEIVED',
        });
        try {
            const parsed = this.hl7Parser.parseMessage(rawMessage);
            messageRecord.messageType = parsed.messageType;
            messageRecord.messageControlId = parsed.messageControlId;
            messageRecord.parsedMessage = {
                sendingApp: parsed.sendingApplication,
                sendingFacility: parsed.sendingFacility,
                dateTime: parsed.dateTime,
                version: parsed.version,
            };
            await this.messageRepo.save(messageRecord);
            let ackCode = 'AA';
            if (parsed.messageType.startsWith('ORU')) {
                ackCode = await this.processORU(instrument, rawMessage, messageRecord);
            }
            else if (parsed.messageType.startsWith('ORM')) {
                this.logger.log(`Received order query from ${instrument.code}`);
            }
            const conn = this.connections.get(instrument.id);
            if (conn?.socket && !conn.socket.destroyed) {
                const ack = this.hl7Parser.generateACK(parsed, ackCode, messageRecord.errorMessage || undefined);
                await this.sendMessage(instrument, ack);
            }
            messageRecord.status = 'PROCESSED';
            await this.messageRepo.save(messageRecord);
            return { success: true, message: `Processed ${parsed.messageType} message`, messageId: messageRecord.id };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Error processing message from ${instrument.code}: ${errorMsg}`);
            messageRecord.status = 'ERROR';
            messageRecord.errorMessage = errorMsg;
            await this.messageRepo.save(messageRecord);
            try {
                const conn = this.connections.get(instrument.id);
                if (conn?.socket && !conn.socket.destroyed) {
                    try {
                        const parsed = this.hl7Parser.parseMessage(rawMessage);
                        const nak = this.hl7Parser.generateACK(parsed, 'AE', errorMsg);
                        await this.sendMessage(instrument, nak);
                    }
                    catch {
                    }
                }
            }
            catch {
            }
            return { success: false, message: errorMsg, messageId: messageRecord.id };
        }
    }
    async processORU(instrument, rawMessage, messageRecord) {
        try {
            const result = await this.hl7Ingestion.ingestHL7Oru(instrument.id, rawMessage, {
                sampleIdentifierField: 'OBR-3',
                strictMode: true,
            });
            this.logger.log(`Processed ORU: ${result.processed} matched, ${result.unmatched} unmatched, ACK: ${result.ackCode}`);
            if (result.processed > 0) {
                messageRecord.status = 'PROCESSED';
            }
            else if (result.unmatched > 0) {
                messageRecord.status = 'PROCESSED';
                messageRecord.errorMessage = `${result.unmatched} unmatched results`;
            }
            if (result.errors.length > 0) {
                messageRecord.errorMessage = result.errors.join('; ');
            }
            await this.messageRepo.save(messageRecord);
            return result.ackCode;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Error in ORU ingestion: ${errorMsg}`);
            messageRecord.status = 'ERROR';
            messageRecord.errorMessage = errorMsg;
            await this.messageRepo.save(messageRecord);
            return 'AE';
        }
    }
    async sendMessage(instrument, message) {
        const conn = this.connections.get(instrument.id);
        if (!conn?.socket || conn.socket.destroyed) {
            this.logger.error(`No active connection for ${instrument.code}`);
            return false;
        }
        const framedMessage = this.hl7Parser.addMLLPFraming(message);
        return new Promise((resolve) => {
            conn.socket.write(framedMessage, (err) => {
                if (err) {
                    this.logger.error(`Error sending to ${instrument.code}: ${err.message}`);
                    resolve(false);
                }
                else {
                    this.logger.debug(`Sent message to ${instrument.code}`);
                    this.messageRepo.save({
                        instrumentId: instrument.id,
                        direction: 'OUT',
                        messageType: message.includes('ACK') ? 'ACK' : 'ORM',
                        rawMessage: message,
                        status: 'SENT',
                    });
                    resolve(true);
                }
            });
        });
    }
    async sendOrder(instrumentId, orderData) {
        const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
        if (!instrument) {
            throw new Error('Instrument not found');
        }
        orderData.sendingApplication = orderData.sendingApplication || 'LIS';
        orderData.sendingFacility = instrument.sendingFacility || 'LAB';
        orderData.receivingApplication = instrument.receivingApplication || instrument.code;
        orderData.receivingFacility = instrument.receivingFacility || '';
        const ormMessage = this.hl7Parser.generateORM(orderData);
        return this.sendMessage(instrument, ormMessage);
    }
    async updateInstrumentStatus(instrumentId, status, errorMessage) {
        await this.instrumentRepo.update(instrumentId, {
            status,
            lastError: errorMessage || null,
            lastConnectedAt: status === instrument_entity_1.InstrumentStatus.ONLINE ? new Date() : undefined,
        });
    }
    async restartListener(instrumentId) {
        const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
        if (!instrument)
            return false;
        const existing = this.connections.get(instrumentId);
        if (existing) {
            existing.server?.close();
            existing.socket?.destroy();
            this.connections.delete(instrumentId);
        }
        if (instrument.connectionType === instrument_entity_1.ConnectionType.TCP_SERVER) {
            return this.startServer(instrument);
        }
        else if (instrument.connectionType === instrument_entity_1.ConnectionType.TCP_CLIENT) {
            return this.connectToInstrument(instrument);
        }
        return false;
    }
    getConnectionStatus(instrumentId) {
        const conn = this.connections.get(instrumentId);
        return {
            connected: conn?.socket !== undefined && !conn.socket.destroyed,
            hasServer: conn?.server !== undefined && conn.server.listening,
        };
    }
};
exports.TCPListenerService = TCPListenerService;
exports.TCPListenerService = TCPListenerService = TCPListenerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(instrument_entity_1.Instrument)),
    __param(1, (0, typeorm_1.InjectRepository)(instrument_entity_2.InstrumentMessage)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        hl7_parser_service_1.HL7ParserService,
        result_processor_service_1.InstrumentResultProcessor,
        hl7_ingestion_service_1.HL7IngestionService])
], TCPListenerService);
//# sourceMappingURL=tcp-listener.service.js.map