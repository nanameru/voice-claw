import log from 'electron-log'

// Configure electron-log for structured file + console logging
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB per log file
log.transports.console.level = 'info'
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

const LOG_PREFIX = '[VoiceClaw]'

export const logger = {
  debug: (...args: unknown[]) => log.debug(LOG_PREFIX, '[debug]', ...args),
  info: (...args: unknown[]) => log.info(LOG_PREFIX, ...args),
  warn: (...args: unknown[]) => log.warn(LOG_PREFIX, ...args),
  error: (...args: unknown[]) => log.error(LOG_PREFIX, ...args),
}
