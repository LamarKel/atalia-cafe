// Deploy hook del sitio (Cloudflare Pages: Settings → Builds → Deploy hooks). Es un secreto: la URL
// incluye el token, así que va con `wrangler secret put DEPLOY_HOOK_URL`, nunca en wrangler.jsonc.
export function deployHook(url: string): () => Promise<void> {
  return async () => {
    const res = await fetch(url, { method: 'POST' })
    if (!res.ok) throw new Error(`deploy hook ${String(res.status)}`)
  }
}
