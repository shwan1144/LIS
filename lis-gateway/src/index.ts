import * as dotenv from 'dotenv';
import { logger } from './logger';
import { GatewayAgent } from './agent';

dotenv.config();

const agent = new GatewayAgent();

function bootstrap(): void {
  try {
    agent.start();
    logger.log('Gateway agent running and ready for HL7 TCP traffic.', 'System');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Fatal startup error: ${message}`, 'System');
    process.exit(1);
  }
}

function shutdown(signal: string): void {
  logger.log(`Received ${signal}, stopping gateway agent...`, 'System');
  try {
    agent.stop();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap();
