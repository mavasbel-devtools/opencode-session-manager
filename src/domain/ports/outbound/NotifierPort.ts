/** Desktop notifications. */
export interface NotifierPort {
  notify(title: string, body: string): Promise<void>
}
