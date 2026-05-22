import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white font-medium hover:brightness-110',
  ghost: 'border border-border-strong text-text hover:border-accent hover:text-accent',
  danger: 'border border-error/40 text-error hover:border-error',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'ghost', className = '', ...rest }: Props) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm transition duration-100 ${VARIANTS[variant]} ${className}`.trim()}
      {...rest}
    />
  )
}
