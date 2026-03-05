import * as fs from 'fs';
import * as path from 'path';

export class Logger {
    private logFile: string;

    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir);
        }
        this.logFile = path.join(logsDir, `gateway-${new Date().toISOString().split('T')[0]}.log`);
    }

    log(message: string, context?: string) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [INFO] ${context ? `[${context}] ` : ''}${message}`;
        console.log(formatted);
        this.appendToFile(formatted);
    }

    warn(message: string, context?: string) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [WARN] ${context ? `[${context}] ` : ''}${message}`;
        console.warn(formatted);
        this.appendToFile(formatted);
    }

    error(message: string, context?: string) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [ERROR] ${context ? `[${context}] ` : ''}${message}`;
        console.error(formatted);
        this.appendToFile(formatted);
    }

    private appendToFile(line: string) {
        try {
            fs.appendFileSync(this.logFile, line + '\n');
        } catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }
}

export const logger = new Logger();
