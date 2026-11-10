import { createContext, useContext, type AnchorHTMLAttributes } from 'react'

export const Navigation = createContext<(path: string) => void>(() => undefined)
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const navigate = useContext(Navigation)
  return <a {...props} href={href} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !props.target) {
      event.preventDefault(); navigate(href)
    }
  }} />
}
