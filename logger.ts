import winston from "winston"
import { format } from "logform"
import "dotenv/config"

const consoleLevel = process.env.CONSOLELEVEL || "error"
console.log(`process.env.CONSOLELEVEL: ${process.env.CONSOLELEVEL}`)
const warnLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "orange",
    verbose: "blue",
    debug: "pink",
  },
}

const commonWinstonParams = {}

// log to file everything over consoleLevel
const logger = winston.createLogger({
  level: consoleLevel,
  levels: warnLevels.levels,
  format: format.combine(format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), format.json()),
  transports: [
    new winston.transports.Console({
      level: consoleLevel,
      handleExceptions: true,
      format: format.combine(
        format.colorize({ all: true }),
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
      ),
    }),
  ],
})

export default logger
