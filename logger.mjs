import winston from 'winston';
import { format } from 'logform';

const consoleLevel = 'verbose';

const warnLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'orange',
    verbose: 'blue',
    debug: 'pink',
  },
};

// log to file everything over consoleLevel
const logger = winston.createLogger({
  level: consoleLevel,
  levels: warnLevels.levels,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json(),
  ),
  transports: [
    new winston.transports.File({
      timestamp: true,
      colorize: true,
      filename: './logs/error.log',
      level: 'error',
      handleExceptions: true,
      json: true,
      maxsize: 52428800,
      maxFiles: 1,
    }),
    new winston.transports.File({
      timestamp: true,
      colorize: true,
      filename: './logs/warn.log',
      level: 'warn',
      handleExceptions: true,
      json: true,
      maxsize: 52428800,
      maxFiles: 1,
    }),
    new winston.transports.File({
      timestamp: true,
      colorize: true,
      filename: './logs/info.log',
      level: 'info',
      handleExceptions: true,
      json: true,
      maxsize: 52428800,
      maxFiles: 1,
    }),
    new winston.transports.File({
      timestamp: true,
      colorize: true,
      filename: './logs/verbose.log',
      level: 'verbose',
      handleExceptions: true,
      json: true,
      maxsize: 52428800,
      maxFiles: 1,
    }),
    new winston.transports.File({
      timestamp: true,
      colorize: true,
      filename: './logs/debug.log',
      level: 'debug',
      handleExceptions: true,
      json: true,
      maxsize: 52428800,
      maxFiles: 1,
    }),
    new winston.transports.File({
      timestamp: true,
      colorize: true,
      filename: './logs/combined.log',
      handleExceptions: true,
      json: true,
      maxsize: 52428800,
      maxFiles: 1,
    }),
    new winston.transports.Console({
      level: consoleLevel,
      handleExceptions: true,
      json: false,
      colorize: true,
      timestamp: true,
      format: format.combine(
        format.colorize({ all: true }),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(
          (info) => `${info.timestamp} ${info.level}: ${info.message}`,
        ),
      ),
    }),
  ],
});

export const stream = {
  write(message, encoding) {
    logger.info(`${message}, ${encoding}`);
  },
};

export default logger