export declare const NAME: string;
export declare const LABEL: string;
export declare const UNITS: string[];
export declare const ENABLED: string[];
export declare const USAGE: string;
export declare const WIN32_REFUSAL: string;
export declare function homeOf(env?: Record<string, string | undefined>): string;
export declare function systemdDir(env?: Record<string, string | undefined>): string;
export declare function launchdDir(env?: Record<string, string | undefined>): string;
export declare function uidOf(env?: Record<string, string | undefined>): string;
export interface WatchReport {
  kind: "systemd" | "launchd";
  directory: string;
  plist?: string;
  installed: boolean;
  verify: string;
  enabled?: Record<string, string>;
  active?: Record<string, string>;
  loaded?: boolean;
}
export interface WatchResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  report: WatchReport | null;
}
export declare function runWatch(options: {
  command: string;
  platform?: string;
  env?: Record<string, string | undefined>;
}): WatchResult;
