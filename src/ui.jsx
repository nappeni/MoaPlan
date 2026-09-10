import React from 'react';
import { LoaderCircle } from 'lucide-react';
import { statusLabels } from './api';
export function Button({ children, busy, kind = '', className = '', ...props }) {
  return (
    <button
      className={'btn ' + kind + ' ' + className}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Field({ label, hint, children, ...props }) {
  return (
    <label className={'field ' + (props.wide ? 'wide' : '')}>
      <span>{label}</span>
      {children || (
        <input {...Object.fromEntries(Object.entries(props).filter(([k]) => k !== 'wide'))} />
      )}{' '}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Badge({ status }) {
  return <span className={'badge ' + status}>{statusLabels[status] || status}</span>;
}
export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{Icon && <Icon size={30} />}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
