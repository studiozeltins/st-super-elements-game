import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface ModalProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}

// Reusable dialog built on Radix: focus trap, ESC-to-close, scroll lock, ARIA
// (role=dialog, aria-modal, labelled by the title) all handled for us. Styling
// is entirely our own CSS (.modal__*). Use for any repeating modal dialog.
export function Modal({ open, onOpenChange, title, children, footer, size = 'sm' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal__overlay" />
        <Dialog.Content className={`modal__panel modal__panel--${size}`} aria-describedby={undefined}>
          <div className="modal__header">
            <Dialog.Title className="modal__title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-btn" aria-label="Aizvērt">
                ✕
              </button>
            </Dialog.Close>
          </div>
          <div className="modal__body">{children}</div>
          {footer && <div className="modal__footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
