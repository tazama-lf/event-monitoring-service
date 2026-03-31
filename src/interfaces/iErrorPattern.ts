export interface ErrorPattern {
  pattern: string;
  condition?: (msg: string) => boolean;
  exception: new (message: string) => Error;
  log: 'warn' | 'error';
  getMessage: (context: string, additionalInfo?: Record<string, string>) => string;
}
