"use client";

export default function DialogActions({
  busy,
  busyLabel,
  submitLabel,
  submitDisabled = false,
  onCancel,
}: {
  busy: boolean;
  busyLabel: string;
  submitLabel: string;
  submitDisabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-actions">
      <button type="button" onClick={onCancel} disabled={busy}>
        Cancelar
      </button>
      <button className="primary" disabled={busy || submitDisabled}>
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  );
}
