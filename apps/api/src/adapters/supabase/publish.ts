// Estado de publicación del sitio (site_publish) con service_role; el deploy hook lo llama adapters/deploy.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublishPorts } from '../../modules/publish/publish'
import { teamPorts } from './team'

export function publishPorts(db: SupabaseClient, trigger: () => Promise<void>): PublishPorts {
  const team = teamPorts(db)
  return {
    verify: team.verify,
    profileOf: team.profileOf,
    trigger,
    async claim(quietSeconds) {
      const { data, error } = await db.rpc('claim_site_publish', { p_quiet_seconds: quietSeconds })
      if (error) throw new Error(`claim_site_publish: ${error.message}`)
      return data === true
    },
    async request() {
      const { error } = await db.rpc('request_site_publish')
      if (error) throw new Error(`request_site_publish: ${error.message}`)
    },
    async finish(ok, message) {
      const { error } = await db.rpc('finish_site_publish', { p_ok: ok, p_error: message })
      if (error) throw new Error(`finish_site_publish: ${error.message}`)
    },
  }
}
