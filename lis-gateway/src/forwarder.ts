import type { OutboxMessageRecord } from './queue/types';

export interface DeliveryResult {
  messageId?: string;
  warning?: string;
}

export type DeliveryHandler = (
  message: Pick<OutboxMessageRecord, 'id' | 'instrumentId' | 'rawMessage' | 'protocolHint'>,
) => Promise<DeliveryResult>;

export class Forwarder {
  private handler: DeliveryHandler;

  constructor(initialHandler: DeliveryHandler) {
    this.handler = initialHandler;
  }

  setHandler(nextHandler: DeliveryHandler): void {
    this.handler = nextHandler;
  }

  async deliver(
    message: Pick<OutboxMessageRecord, 'id' | 'instrumentId' | 'rawMessage' | 'protocolHint'>,
  ): Promise<DeliveryResult> {
    return this.handler(message);
  }
}
