const LOG_PREFIX = '[VoiceClaw]'

export const logger = {
  debug: (...args: unknown[]) => console.log(LOG_PREFIX, '[debug]', ...args),
  info: (...args: unknown[]) => console.log(LOG_PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(LOG_PREFIX, ...args),
  error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
}
