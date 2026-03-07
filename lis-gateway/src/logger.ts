import * as fs from 'fs';
import * as path from 'path';
import { resolveRuntimePaths } from './runtime-paths';

export class Logger {
    private readonly logFile: string;
    private readonly recentLines: string[] = [];
    private readonly maxRecentLines = 2000;

    constructor() {
        const logsDir = process.env.GATEWAY_LOG_DIR || resolveRuntimePaths().logsDir;
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
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
            this.recentLines.push(line);
            if (this.recentLines.length > this.maxRecentLines) {
                this.recentLines.splice(0, this.recentLines.length - this.maxRecentLines);
            }
            fs.appendFileSync(this.logFile, line + '\n');
        } catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }

    getRecent(limit = 200): string[] {
        const safeLimit = Math.max(1, Math.min(limit, this.maxRecentLines));
        return this.recentLines.slice(-safeLimit);
    }

    getLogFilePath(): string {
        return this.logFile;
    }
}

export const logger = new Logger();
