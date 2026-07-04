import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  children: ReactNode;
}

// Reusable button. Variants map to .btn--primary/ghost/danger; `block` makes it
// full-width. Defaults type="button" so it never accidentally submits a form.
export function Button({
  variant = 'ghost',
  block = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = `btn btn--${variant}${block ? ' btn--block' : ''}${className ? ` ${className}` : ''}`;
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
