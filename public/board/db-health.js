/**
 * 043 A — the save-status voice: what bootDb found and what a failed
 * flush means, said once through the toast. The editor's status line
 * (editorStatus) carries the persistent state; this is the alert.
 */
export function reportDbHealth(dbHandle, toast, flushDb) {
  const h = dbHandle.dbHealth();
  if (h.restoredFromPrev) {
    toast("Opened the previous copy — the latest save wouldn't load. Everything that opened is safe.", null,
      { actionLabel: "OK", onAction: () => {} });
  } else if (h.readFailed || h.corrupt) {
    toast("Couldn't read the saved board — showing a temporary one. Your saved copy wasn't touched.", null,
      { actionLabel: "Reload", onAction: () => location.reload() });
  }
  let said = false;
  dbHandle.onSaveIssue = () => {
    if (said) return;
    said = true;
    toast("Couldn't save — keep this tab open and try again.", null,
      { actionLabel: "Try again", onAction: () => flushDb() });
  };
}
