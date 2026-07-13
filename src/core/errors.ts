/** Thrown for any config/load-time failure. A config typo is a boot error, never a
 *  silent runtime no-op (design §2, §4.3). */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Thrown when the engine's termination backstop trips (design §6). */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}
