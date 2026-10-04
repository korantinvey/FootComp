// RevenueCat → Supabase: keeps groups.subscribed_until in sync with the stores.
// Deploy as an Edge Function named "revenuecat-webhook" with "Verify JWT" off,
// and set the secret REVENUECAT_WEBHOOK_SECRET (same value as the
// Authorization header configured in RevenueCat → Integrations → Webhooks).
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Events after which the subscription is (still) active until expiration_at_ms.
const ACTIVE = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED', 'EXPIRATION']);

const groupIdOf = (appUserId: string | undefined) =>
  appUserId?.startsWith('group_') ? appUserId.slice('group_'.length) : null;

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('REVENUECAT_WEBHOOK_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { event } = await req.json();

  if (event?.type === 'TRANSFER') {
    // A restore moved the subscription from one group to another.
    for (const from of event.transferred_from ?? []) {
      const g = groupIdOf(from);
      if (g) await supabase.from('groups').update({ subscribed_until: null }).eq('id', g);
    }
    return new Response('ok');
  }

  const groupId = groupIdOf(event?.app_user_id);
  if (!groupId || !ACTIVE.has(event.type) || !event.expiration_at_ms) return new Response('ignored');

  const { error } = await supabase
    .from('groups')
    .update({ subscribed_until: new Date(event.expiration_at_ms).toISOString() })
    .eq('id', groupId);
  return new Response(error ? error.message : 'ok', { status: error ? 500 : 200 });
});
