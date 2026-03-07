"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const runtime_paths_1 = require("./runtime-paths");
class Logger {
    logFile;
    recentLines = [];
    maxRecentLines = 2000;
    constructor() {
        const logsDir = process.env.GATEWAY_LOG_DIR || (0, runtime_paths_1.resolveRuntimePaths)().logsDir;
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        this.logFile = path.join(logsDir, `gateway-${new Date().toISOString().split('T')[0]}.log`);
    }
    log(message, context) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [INFO] ${context ? `[${context}] ` : ''}${message}`;
        console.log(formatted);
        this.appendToFile(formatted);
    }
    warn(message, context) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [WARN] ${context ? `[${context}] ` : ''}${message}`;
        console.warn(formatted);
        this.appendToFile(formatted);
    }
    error(message, context) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [ERROR] ${context ? `[${context}] ` : ''}${message}`;
        console.error(formatted);
        this.appendToFile(formatted);
    }
    appendToFile(line) {
        try {
            this.recentLines.push(line);
            if (this.recentLines.length > this.maxRecentLines) {
                this.recentLines.splice(0, this.recentLines.length - this.maxRecentLines);
            }
            fs.appendFileSync(this.logFile, line + '\n');
        }
        catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }
    getRecent(limit = 200) {
        const safeLimit = Math.max(1, Math.min(limit, this.maxRecentLines));
        return this.recentLines.slice(-safeLimit);
    }
    getLogFilePath() {
        return this.logFile;
    }
}
exports.Logger = Logger;
exports.logger = new Logger();
