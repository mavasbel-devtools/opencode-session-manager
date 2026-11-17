/** Small persistent values (the last notification sent). */
export interface KeyValuePort {
  get(key: string): Promise<string | null>
  set(key: string, value: string | null): Promise<void>
}
