import { createHash } from 'crypto';

export function generateIdempotencyKey(
  operation: string,
  resourceId: string,
  suffix?: string,
): string {
  const parts = [operation, resourceId];
  if (suffix) parts.push(suffix);
  return parts.join('_');
}

export function generateUniqueIdempotencyKey(
  operation: string,
  ...identifiers: string[]
): string {
  const input = [operation, ...identifiers].join(':');
  return `${operation}_${createHash('sha256').update(input).digest('hex').slice(0, 16)}`;
}
