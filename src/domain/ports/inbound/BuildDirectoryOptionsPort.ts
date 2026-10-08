import type { DirectoryOption } from "@session-manager/domain/model/Session"

/** Inbound port: the option list shown by the transfer directory picker. */
export interface BuildDirectoryOptionsPort {
  execute(home: string): Promise<DirectoryOption[]>
}
