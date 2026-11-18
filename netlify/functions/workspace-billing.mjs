import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const config = {
  path: '/api/stripe/billing',
  rateLimit: { windowLimit: 25, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
const livePrice = 'price_1Ud5EMEQ9WPDgXa9OGWEr4n4'
const allowedOrigins = new Set(['https://rolemapper.cc','https://rolemapper.netlify.app'])
const workspaceId = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const terminal = new Set(['canceled','incomplete_expired'])
const respond = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}})

async function rpc(db,name,args) {
  const {data,error} = await db.rpc(name,args)
  if (error) throw error
  return data
}

async function openCheckout(stripe,db,price,customer,identity,returnUrl) {
  // Reuse an open session, including after a network failure during creation.
  for await (const subscription of stripe.subscriptions.list({customer,status:'all',limit:50})) {
    if (!terminal.has(subscription.status)) {
      return respond({error:'This workspace already has a subscription. Use Manage billing.'},409)
    }
  }
  const {data:sessions} = await stripe.checkout.sessions.list({customer,status:'open',limit:1})
  if (sessions[0]?.url) return respond({url:sessions[0].url})

  const stripePrice = await stripe.prices.retrieve(price)
  if (!stripePrice.active || stripePrice.currency!=='usd' || stripePrice.unit_amount!==1000 ||
      stripePrice.recurring?.interval!=='year' || stripePrice.recurring.interval_count!==1) {
    return respond({error:'The annual plan is temporarily unavailable.'},503)
  }
  const {attempt,expires} = await rpc(db,'reserve_stripe_checkout',identity)
  if (expires <= Math.floor(Date.now()/1000)+30*60+10) {
    return respond({error:'Your last checkout is expiring. Try again once it has expired.'},409)
  }
  // One reservation yields one session, even across repeated or concurrent requests.
  const checkout = await stripe.checkout.sessions.create({
    mode:'subscription',
    customer,
    payment_method_types:['card'],
    line_items:[{price,quantity:1}],
    client_reference_id:identity.workspace,
    expires_at:expires,
    success_url:returnUrl+'&billing=returned',
    cancel_url:returnUrl+'&billing=canceled',
  },{idempotencyKey:'rolemapper-checkout-'+attempt})
  if (!checkout.url) throw new Error('Checkout returned no URL')
  return respond({url:checkout.url})
}

export function createBillingHandler({env=process.env,stripeClient,dbClient}={}) {
  return async function handler(request) {
    if (request.method!=='POST') return respond({error:'Use POST.'},405)
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return respond({error:'Sign in to manage billing.'},401)
    const origin = new URL(request.url).origin
    if (request.headers.get('origin') && request.headers.get('origin')!==origin) {
      return respond({error:'Use the Rolemapper workspace.'},403)
    }
    const project = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    const test = env.STRIPE_MODE==='test'
    const key = env.STRIPE_API_KEY
    const price = env.STRIPE_PRICE_ID || (test ? null : livePrice)
    const keyPattern = test ? /^(sk|rk)_test_/ : /^(sk|rk)_live_/
    if (!(dbClient || project && serviceKey) || !keyPattern.test(key||'') ||
        !env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') || !price) {
      return respond({error:'Billing is temporarily unavailable.'},503)
    }
    let payload
    try { payload = await request.json() } catch { return respond({error:'Choose a workspace.'},400) }
    if (typeof payload?.workspace!=='string' || !workspaceId.test(payload.workspace) ||
        !['checkout','portal'].includes(payload.action)) {
      return respond({error:'Choose a workspace and billing action.'},400)
    }

    const db = dbClient ?? createClient(project,serviceKey,{
      auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
    })
    const stripe = stripeClient ?? new Stripe(key,{timeout:6000,maxNetworkRetries:1})
    try {
      const {data,error} = await db.auth.getUser(token)
      if (error || !data.user) return respond({error:'Sign in again to manage billing.'},401)
      const identity = {workspace:payload.workspace,account_owner:data.user.id}
      let customer = await rpc(db,'stripe_workspace_account',identity)
      const returnOrigin = test && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
        ? origin
        : allowedOrigins.has(origin) ? origin : 'https://rolemapper.cc'
      const returnUrl = returnOrigin+'/login?workspace='+identity.workspace

      if (payload.action==='portal') {
        if (!customer) return respond({error:'This workspace has no Stripe billing account yet.'},409)
        const portal = await stripe.billingPortal.sessions.create({
          customer,return_url:returnUrl,
          ...(env.STRIPE_PORTAL_CONFIGURATION_ID ? {configuration:env.STRIPE_PORTAL_CONFIGURATION_ID} : {}),
        })
        return respond({url:portal.url})
      }
      if (!customer) {
        const metadata = {rolemapper_workspace:identity.workspace}
        // Recover a customer if Stripe succeeded but the earlier DB write did not.
        const search = await stripe.customers.search({query:"metadata['rolemapper_workspace']:'"+identity.workspace+"'",limit:1})
        const created = search.data[0] ?? await stripe.customers.create({metadata},{
          idempotencyKey:'rolemapper-customer-'+identity.workspace,
        })
        customer = await rpc(db,'stripe_workspace_account',{...identity,customer:created.id})
      }
      return await openCheckout(stripe,db,price,customer,identity,returnUrl)
    } catch (error) {
      if (error?.code==='42501') return respond({error:'Only the workspace owner can manage billing.'},403)
      if (error?.type==='StripeIdempotencyError') return respond({error:'Checkout is already being prepared. Try again.'},409)
      console.error('Rolemapper billing request failed.',error?.type||error?.code||'unknown')
      return respond({error:'Billing is temporarily unavailable. Try again shortly.'},503)
    }
  }
}

export default createBillingHandler()
