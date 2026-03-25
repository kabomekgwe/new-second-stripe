import { randomUUID } from 'crypto';

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
  resourceId: string,
): string {
  return `${operation}_${resourceId}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}
