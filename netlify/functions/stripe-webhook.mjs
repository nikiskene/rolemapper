import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const config = { path: '/api/stripe/webhook' }

const events = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])

const livePrice = 'price_1Ud5EMEQ9WPDgXa9OGWEr4n4'
const customerId = object => typeof object?.customer === 'string' ? object.customer : object?.customer?.id

function entitlement(subscriptions, priceId) {
  const matching = subscriptions.flatMap(subscription =>
    subscription.items.data.filter(item=>item.price.id===priceId && item.quantity===1)
      .map(item=>({subscription,item}))
  )
  const active = matching.filter(({subscription})=>subscription.status==='active')
  const candidates = active.length ? active : matching
  candidates.sort((a,b)=>b.subscription.created-a.subscription.created)
  const match = candidates[0]
  if (!match) return { subscription_id:null, current_status:'none', current_eligible_until:null, current_cancel_at_period_end:false }
  const {subscription,item} = match
  const periodEnd = item.current_period_end ?? subscription.current_period_end
  const cancelAt = subscription.cancel_at
  const eligibleUntil = subscription.status==='active' && Number.isFinite(periodEnd)
    ? new Date(1000*(Number.isFinite(cancelAt) ? Math.min(periodEnd,cancelAt) : periodEnd)).toISOString()
    : null
  return {
    subscription_id:subscription.id,
    current_status:subscription.status,
    current_eligible_until:eligibleUntil,
    current_cancel_at_period_end:subscription.cancel_at_period_end,
  }
}

export function createWebhook({env=process.env,stripeClient,dbClient}={}) {
  return async function handle(request) {
    const respond = (body,status) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}})
    if (request.method!=='POST') return respond({error:'Use POST.'},405)

    const signature = request.headers.get('stripe-signature')
    if (!signature) return respond({error:'Stripe signature required.'},400)

    const secret = env.STRIPE_WEBHOOK_SECRET
    const apiKey = env.STRIPE_API_KEY
    const isLive = env.STRIPE_MODE!=='test'
    const keyMode = isLive ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/
    if (!secret?.startsWith('whsec_') || !keyMode.test(apiKey||'')) {
      return respond({error:'Stripe webhook is not configured.'},503)
    }
    const stripe = stripeClient ?? new Stripe(apiKey,{timeout:5000,maxNetworkRetries:0})
    let event
    try {
      const payload = Buffer.from(await request.arrayBuffer())
      event = stripe.webhooks.constructEvent(payload,signature,secret)
    } catch {
      return respond({error:'Invalid Stripe signature or event.'},400)
    }
    if (event.livemode!==isLive) return respond({error:'Stripe mode mismatch.'},400)
    if (!events.has(event.type)) return respond({received:true},200)
    const customer = customerId(event.data.object)
    if (!/^cus_[A-Za-z0-9]+$/.test(customer||'')) return respond({received:true},200)

    const projectUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    const price = env.STRIPE_PRICE_ID || (isLive ? livePrice : null)
    if (!(dbClient || projectUrl && serviceKey) || !price) {
      return respond({error:'Subscription storage is not configured.'},503)
    }
    const db = dbClient ?? createClient(projectUrl,serviceKey,{
      auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
    })
    try {
      const identity = {customer_id:customer,event_reference:event.id}
      const begin = await db.rpc('begin_stripe_sync',identity)
      if (begin.error) throw begin.error
      if (begin.data===null) return respond({received:true},200)
      const subscriptions = []
      for await (const subscription of stripe.subscriptions.list({customer,status:'all',limit:100})) {
        subscriptions.push(subscription)
      }
      const result = await db.rpc('finish_stripe_sync',{
        ...identity,
        sync_revision:begin.data,
        ...entitlement(subscriptions,price),
      })
      if (result.error) throw result.error
      return respond({received:true},200)
    } catch {
      // Return a retryable failure without logging the Stripe payload or credentials.
      console.error('Stripe subscription synchronization failed.')
      return respond({error:'Subscription update failed.'},503)
    }
  }
}

export default createWebhook()
