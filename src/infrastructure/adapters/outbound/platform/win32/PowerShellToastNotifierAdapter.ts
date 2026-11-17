import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"

const run = promisify(execFile)

/** PowerShell's own AppUserModelID: no application of ours is registered for toasts. Unverified on hardware (no Windows host). */
const APP_ID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"

const SCRIPT = [
  "$Title = $args[0]; $Body = $args[1]",
  "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
  `$AppId = '${APP_ID}'`,
  "$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
  "$texts = $template.GetElementsByTagName('text')",
  "$texts.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null",
  "$texts.Item(1).AppendChild($template.CreateTextNode($Body)) | Out-Null",
  "$toast = [Windows.UI.Notifications.ToastNotification]::new($template)",
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)",
].join("\n")

/**
 * `NotifierPort` on Windows: a PowerShell toast notification. The title and body travel as
 * arguments (never interpolated into the script), so no quoting can break them. The PowerShell
 * executable is a constructor argument so the adapter can be exercised against a stand-in
 * off Windows.
 */
export class PowerShellToastNotifierAdapter implements NotifierPort {
  constructor(private readonly powershell: string) {}

  async notify(title: string, body: string): Promise<void> {
    await run(this.powershell, ["-NoProfile", "-Command", SCRIPT, title, body])
  }
}
