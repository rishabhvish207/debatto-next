"use client";

// Generic centered confirm modal — used instead of window.confirm()/alert()
// anywhere the app needs to ask "are you sure?" (e.g. leaving a match
// mid-debate via the global Back button or the in-battle Exit button).
export function ConfirmModal({
  title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = true,
  onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="drawer-overlay" onClick={onCancel} />
      <div className="confirm-modal">
        <div className="heading" style={{ fontSize: 16, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </>
  );
}
