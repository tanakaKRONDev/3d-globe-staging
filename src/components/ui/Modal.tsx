import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Modal.css'

export interface ModalProps {
  open: boolean
  title: string
  children: ReactNode
  onClose?: () => void
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  width = 'md',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open || !onClose) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !dialogRef.current) return
    const firstButton = dialogRef.current.querySelector<HTMLButtonElement>(
      'button:not([disabled])'
    )
    firstButton?.focus()
  }, [open])

  if (!open) return null

  const content = (
    <div
      className="ui-modal-backdrop"
      onClick={onClose ? () => onClose() : undefined}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`ui-modal-dialog ui-modal-dialog--${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ui-modal-title" className="ui-modal-title">
          {title}
        </h2>
        <div className="ui-modal-body">{children}</div>
        {footer != null && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
