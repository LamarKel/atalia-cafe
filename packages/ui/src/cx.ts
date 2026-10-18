/** Une clases condicionales: cx('a', cond && 'b', undefined) → 'a b'. */
export function cx(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
