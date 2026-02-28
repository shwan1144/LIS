import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as net from 'net';
import {
  Instrument,
  InstrumentStatus,
  ConnectionType,
  InstrumentProtocol,
} from '../entities/instrument.entity';
import { InstrumentMessage } from '../entities/instrument.entity';
import { HL7ParserService } from './hl7-parser.service';
import { AstmParserService } from './astm-parser.service';
import { HL7IngestionService } from './hl7-ingestion.service';
import { AstmIngestionService } from './astm-ingestion.service';

interface ActiveConnection {
  server?: net.Server;
  socket?: net.Socket;
  buffer: string;
  instrumentId: string;
}

@Injectable()
export class TCPListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TCPListenerService.name);
  private connections: Map<string, ActiveConnection> = new Map();

  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    @InjectRepository(InstrumentMessage)
    private readonly messageRepo: Repository<InstrumentMessage>,
    private readonly hl7Parser: HL7ParserService,
    private readonly astmParser: AstmParserService,
    private readonly hl7Ingestion: HL7IngestionService,
    private readonly astmIngestion: AstmIngestionService,
  ) {}

  async onModuleInit() {
    // Start listeners for all active instruments
    await this.initializeAllListeners();
  }

  async onModuleDestroy() {
    // Close all connections
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
      if (instrument.connectionType === ConnectionType.TCP_SERVER && instrument.port) {
        await this.startServer(instrument);
      } else if (instrument.connectionType === ConnectionType.TCP_CLIENT && instrument.host && instrument.port) {
        await this.connectToInstrument(instrument);
      }
    }
  }

  /**
   * Start TCP server for instrument to connect to
   */
  async startServer(instrument: Instrument): Promise<boolean> {
    if (!instrument.port) {
      this.logger.error(`No port configured for instrument ${instrument.code}`);
      return false;
    }

    // Close existing server if any
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
        await this.updateInstrumentStatus(instrument.id, InstrumentStatus.ERROR, err.message);
        resolve(false);
      });

      server.listen(instrument.port, async () => {
        this.logger.log(`TCP server started for ${instrument.code} on port ${instrument.port}`);
        await this.updateInstrumentStatus(instrument.id, InstrumentStatus.ONLINE);
        
        this.connections.set(instrument.id, {
          server,
          buffer: '',
          instrumentId: instrument.id,
        });
        resolve(true);
      });
    });
  }

  /**
   * Connect to instrument as TCP client
   */
  async connectToInstrument(instrument: Instrument): Promise<boolean> {
    if (!instrument.host || !instrument.port) {
      this.logger.error(`No host/port configured for instrument ${instrument.code}`);
      return false;
    }

    await this.updateInstrumentStatus(instrument.id, InstrumentStatus.CONNECTING);

    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.connect(instrument.port!, instrument.host!, async () => {
        this.logger.log(`Connected to ${instrument.code} at ${instrument.host}:${instrument.port}`);
        await this.updateInstrumentStatus(instrument.id, InstrumentStatus.ONLINE);
        
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
        await this.updateInstrumentStatus(instrument.id, InstrumentStatus.ERROR, err.message);
        resolve(false);
      });

      // Set timeout
      socket.setTimeout(30000, () => {
        this.logger.warn(`Connection timeout for ${instrument.code}`);
        socket.destroy();
      });
    });
  }

  /**
   * Handle incoming connection from instrument
   */
  private handleConnection(instrument: Instrument, socket: net.Socket) {
    this.logger.log(`Instrument ${instrument.code} connected from ${socket.remoteAddress}`);
    
    const conn = this.connections.get(instrument.id);
    if (conn) {
      conn.socket = socket;
    }

    this.updateInstrumentStatus(instrument.id, InstrumentStatus.ONLINE);
    this.setupSocketHandlers(instrument, socket);
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(instrument: Instrument, socket: net.Socket) {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();
      this.logger.debug(`Received data from ${instrument.code}: ${data.length} bytes`);

      // Extract complete messages by protocol (HL7/ASTM)
      const messages = instrument.protocol === InstrumentProtocol.ASTM
        ? this.extractAstmMessages(buffer)
        : this.extractMessages(buffer, instrument);
      buffer = messages.remaining;

      for (const rawMessage of messages.complete) {
        await this.processMessage(instrument, rawMessage);
      }

      // Update last message time
      await this.instrumentRepo.update(instrument.id, {
        lastMessageAt: new Date(),
      });
    });

    socket.on('close', async () => {
      this.logger.log(`Connection closed for ${instrument.code}`);
      await this.updateInstrumentStatus(instrument.id, InstrumentStatus.OFFLINE);
    });

    socket.on('error', async (err) => {
      this.logger.error(`Socket error for ${instrument.code}: ${err.message}`);
      await this.updateInstrumentStatus(instrument.id, InstrumentStatus.ERROR, err.message);
    });
  }

  /**
   * Extract complete HL7 messages from buffer
   */
  private extractMessages(buffer: string, instrument: Instrument): { complete: string[]; remaining: string } {
    const complete: string[] = [];
    let remaining = buffer;

    const startBlock = instrument.hl7StartBlock || '\x0b';
    const endBlock = instrument.hl7EndBlock || '\x1c\x0d';

    while (true) {
      const startIndex = remaining.indexOf(startBlock);
      if (startIndex === -1) break;

      const endIndex = remaining.indexOf(endBlock, startIndex);
      if (endIndex === -1) break;

      const message = remaining.substring(startIndex + startBlock.length, endIndex);
      complete.push(message);
      remaining = remaining.substring(endIndex + endBlock.length);
    }

    return { complete, remaining };
  }

  /**
   * Extract complete ASTM messages from buffer.
   * ASTM streams can include framing bytes and record numbers, so we anchor on H|...L|.
   */
  private extractAstmMessages(buffer: string): { complete: string[]; remaining: string } {
    const complete: string[] = [];
    let remaining = buffer.replace(/\r\n/g, '\r').replace(/\n/g, '\r');

    while (true) {
      const headerStart = this.findAstmHeaderStart(remaining);
      if (headerStart === -1) {
        if (remaining.length > 4096) {
          remaining = remaining.slice(-4096);
        }
        break;
      }

      if (headerStart > 0) {
        remaining = remaining.slice(headerStart);
      }

      const endIndex = this.findAstmMessageEnd(remaining);
      if (endIndex === -1) {
        break;
      }

      const message = remaining.slice(0, endIndex).trim();
      if (message) {
        complete.push(message);
      }
      remaining = remaining.slice(endIndex);
    }

    return { complete, remaining };
  }

  private findAstmHeaderStart(value: string): number {
    for (let i = 0; i < value.length - 1; i += 1) {
      if (value[i] === 'H' && value[i + 1] === '|') {
        return i;
      }
      if (i < value.length - 2 && /\d/.test(value[i]) && value[i + 1] === 'H' && value[i + 2] === '|') {
        return i;
      }
    }
    return -1;
  }

  private findAstmMessageEnd(value: string): number {
    for (let i = 0; i < value.length - 1; i += 1) {
      const lineStart = i === 0 || value[i - 1] === '\r';
      if (!lineStart) continue;

      const startsWithL = value[i] === 'L' && value[i + 1] === '|';
      const startsWithFrameAndL =
        i < value.length - 2 &&
        /\d/.test(value[i]) &&
        value[i + 1] === 'L' &&
        value[i + 2] === '|';

      if (!startsWithL && !startsWithFrameAndL) continue;

      const lineBreakIndex = value.indexOf('\r', i);
      if (lineBreakIndex === -1) {
        return -1;
      }

      let end = lineBreakIndex + 1;
      while (end < value.length && (value[end] === '\r' || value[end] === '\n' || value[end] === '\x04')) {
        end += 1;
      }
      return end;
    }

    return -1;
  }

  /**
   * Simulate receiving a message (for testing)
   */
  async simulateMessage(instrument: Instrument, rawMessage: string): Promise<{ success: boolean; message?: string; messageId?: string }> {
    this.logger.log(`Simulating message for ${instrument.code}`);
    
    try {
      // Process the message just like we received it from the instrument
      const result = await this.processMessageInternal(instrument, rawMessage);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: errorMsg };
    }
  }

  /**
   * Process received HL7 message
   */
  private async processMessage(instrument: Instrument, rawMessage: string) {
    await this.processMessageInternal(instrument, rawMessage);
  }

  /**
   * Internal message processing
   */
  private async processMessageInternal(instrument: Instrument, rawMessage: string): Promise<{ success: boolean; message?: string; messageId?: string }> {
    this.logger.log(`Processing message from ${instrument.code}`);
    const shouldUseAstm =
      instrument.protocol === InstrumentProtocol.ASTM ||
      (instrument.protocol !== InstrumentProtocol.HL7_V2 && this.astmParser.isLikelyAstm(rawMessage));

    // Save incoming message
    const messageRecord = this.messageRepo.create({
      instrumentId: instrument.id,
      direction: 'IN',
      messageType: 'UNKNOWN',
      rawMessage,
      status: 'RECEIVED',
    });

    try {
      if (shouldUseAstm) {
        const parsed = this.astmParser.parseMessage(rawMessage);
        messageRecord.messageType = parsed.messageType;
        messageRecord.parsedMessage = {
          protocol: 'ASTM',
          sender: parsed.sender,
          variant: parsed.protocolVariant,
          terminationCode: parsed.terminationCode,
        };
        await this.messageRepo.save(messageRecord);

        const result = await this.astmIngestion.ingestAstmResult(instrument.id, rawMessage, {
          strictMode: true,
        });

        if (result.unmatched > 0 && result.errors.length === 0) {
          messageRecord.errorMessage = `${result.unmatched} unmatched results`;
        } else if (result.errors.length > 0) {
          messageRecord.errorMessage = result.errors.join('; ');
        }

        messageRecord.status = result.errors.length > 0 ? 'ERROR' : 'PROCESSED';
        await this.messageRepo.save(messageRecord);

        const conn = this.connections.get(instrument.id);
        if (conn?.socket && !conn.socket.destroyed) {
          await this.sendAstmControl(
            instrument,
            result.ackCode === 'AA' ? 'ACK' : 'NAK',
          );
        }

        return {
          success: result.success,
          message: `Processed ${result.messageId ? parsed.messageType : 'ASTM'} message`,
          messageId: messageRecord.id,
        };
      }

      // Parse the message
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

      // Process based on message type
      let ackCode: 'AA' | 'AE' | 'AR' = 'AA';
      if (parsed.messageType.startsWith('ORU')) {
        ackCode = await this.processORU(instrument, rawMessage, messageRecord);
      } else if (parsed.messageType.startsWith('ORM')) {
        // Order/query message from instrument (future: send ORM/ACK flow)
        if (instrument.bidirectionalEnabled) {
          this.logger.log(`Received order query from ${instrument.code} (bidirectional enabled)`);
        } else {
          this.logger.warn(
            `Received order query from ${instrument.code} but bidirectional mode is disabled`,
          );
        }
      }

      // Send ACK (only if there's an active connection)
      const conn = this.connections.get(instrument.id);
      if (conn?.socket && !conn.socket.destroyed) {
        const ack = this.hl7Parser.generateACK(parsed, ackCode, messageRecord.errorMessage || undefined);
        await this.sendMessage(instrument, ack);
      }

      messageRecord.status = 'PROCESSED';
      await this.messageRepo.save(messageRecord);
      
      return { success: true, message: `Processed ${parsed.messageType} message`, messageId: messageRecord.id };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing message from ${instrument.code}: ${errorMsg}`);
      
      messageRecord.status = 'ERROR';
      messageRecord.errorMessage = errorMsg;
      await this.messageRepo.save(messageRecord);

      // Try to send NAK only if connected
      try {
        const conn = this.connections.get(instrument.id);
        if (conn?.socket && !conn.socket.destroyed) {
          if (shouldUseAstm) {
            await this.sendAstmControl(instrument, 'NAK');
          } else {
            try {
              const parsed = this.hl7Parser.parseMessage(rawMessage);
              const nak = this.hl7Parser.generateACK(parsed, 'AE', errorMsg);
              await this.sendMessage(instrument, nak);
            } catch {
              // Can't even parse the message to send NAK
            }
          }
        }
      } catch {
        // Connection error
      }
      
      return { success: false, message: errorMsg, messageId: messageRecord.id };
    }
  }

  /**
   * Process ORU (Observation Result) message using strict ingestion service
   */
  private async processORU(
    instrument: Instrument,
    rawMessage: string,
    messageRecord: InstrumentMessage,
  ) {
    try {
      // Use new strict ingestion service
      const result = await this.hl7Ingestion.ingestHL7Oru(instrument.id, rawMessage, {
        sampleIdentifierField: 'OBR-3', // Configurable per instrument later
        strictMode: true,
      });

      this.logger.log(
        `Processed ORU: ${result.processed} matched, ${result.unmatched} unmatched, ACK: ${result.ackCode}`,
      );

      // Update message record with results
      if (result.processed > 0) {
        messageRecord.status = 'PROCESSED';
      } else if (result.unmatched > 0) {
        messageRecord.status = 'PROCESSED'; // Processed but has unmatched
        messageRecord.errorMessage = `${result.unmatched} unmatched results`;
      }

      if (result.errors.length > 0) {
        messageRecord.errorMessage = result.errors.join('; ');
      }

      await this.messageRepo.save(messageRecord);

      // Return ACK code for sending
      return result.ackCode;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in ORU ingestion: ${errorMsg}`);
      messageRecord.status = 'ERROR';
      messageRecord.errorMessage = errorMsg;
      await this.messageRepo.save(messageRecord);
      return 'AE' as const;
    }
  }

  /**
   * Send message to instrument
   */
  async sendMessage(instrument: Instrument, message: string): Promise<boolean> {
    const conn = this.connections.get(instrument.id);
    if (!conn?.socket || conn.socket.destroyed) {
      this.logger.error(`No active connection for ${instrument.code}`);
      return false;
    }

    // Use HL7 MLLP framing for HL7 protocol; send raw payload otherwise.
    const framedMessage = instrument.protocol === InstrumentProtocol.HL7_V2
      ? this.hl7Parser.addMLLPFraming(message)
      : message;

    return new Promise((resolve) => {
      conn.socket!.write(framedMessage, (err) => {
        if (err) {
          this.logger.error(`Error sending to ${instrument.code}: ${err.message}`);
          resolve(false);
        } else {
          this.logger.debug(`Sent message to ${instrument.code}`);
          
          // Save outgoing message
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

  private async sendAstmControl(instrument: Instrument, control: 'ACK' | 'NAK'): Promise<boolean> {
    const conn = this.connections.get(instrument.id);
    if (!conn?.socket || conn.socket.destroyed) {
      this.logger.error(`No active connection for ${instrument.code}`);
      return false;
    }

    const payload = control === 'ACK' ? '\x06' : '\x15';

    return new Promise((resolve) => {
      conn.socket!.write(payload, (err) => {
        if (err) {
          this.logger.error(`Error sending ASTM ${control} to ${instrument.code}: ${err.message}`);
          resolve(false);
          return;
        }

        this.messageRepo.save({
          instrumentId: instrument.id,
          direction: 'OUT',
          messageType: `ASTM_${control}`,
          rawMessage: payload,
          status: 'SENT',
        });

        resolve(true);
      });
    });
  }

  /**
   * Send order to instrument
   */
  async sendOrder(instrumentId: string, orderData: Parameters<HL7ParserService['generateORM']>[0]): Promise<boolean> {
    const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
    if (!instrument) {
      throw new Error('Instrument not found');
    }
    if (!instrument.bidirectionalEnabled) {
      this.logger.warn(
        `sendOrder blocked: bidirectional mode is disabled for instrument ${instrument.code}`,
      );
      return false;
    }
    if (instrument.protocol !== InstrumentProtocol.HL7_V2) {
      this.logger.warn(
        `sendOrder is currently implemented for HL7 instruments only (instrument ${instrument.code} uses ${instrument.protocol})`,
      );
      return false;
    }

    // Add instrument-specific settings
    orderData.sendingApplication = orderData.sendingApplication || 'LIS';
    orderData.sendingFacility = instrument.sendingFacility || 'LAB';
    orderData.receivingApplication = instrument.receivingApplication || instrument.code;
    orderData.receivingFacility = instrument.receivingFacility || '';

    const ormMessage = this.hl7Parser.generateORM(orderData);
    return this.sendMessage(instrument, ormMessage);
  }

  /**
   * Update instrument status
   */
  private async updateInstrumentStatus(
    instrumentId: string,
    status: InstrumentStatus,
    errorMessage?: string,
  ) {
    await this.instrumentRepo.update(instrumentId, {
      status,
      lastError: errorMessage || null,
      lastConnectedAt: status === InstrumentStatus.ONLINE ? new Date() : undefined,
    });
  }

  /**
   * Restart listener for instrument
   */
  async restartListener(instrumentId: string): Promise<boolean> {
    const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
    if (!instrument) return false;

    // Close existing connection
    const existing = this.connections.get(instrumentId);
    if (existing) {
      existing.server?.close();
      existing.socket?.destroy();
      this.connections.delete(instrumentId);
    }

    // Start new connection
    if (instrument.connectionType === ConnectionType.TCP_SERVER) {
      return this.startServer(instrument);
    } else if (instrument.connectionType === ConnectionType.TCP_CLIENT) {
      return this.connectToInstrument(instrument);
    }

    return false;
  }

  /**
   * Get connection status for instrument
   */
  getConnectionStatus(instrumentId: string): { connected: boolean; hasServer: boolean } {
    const conn = this.connections.get(instrumentId);
    return {
      connected: conn?.socket !== undefined && !conn.socket.destroyed,
      hasServer: conn?.server !== undefined && conn.server.listening,
    };
  }
}
