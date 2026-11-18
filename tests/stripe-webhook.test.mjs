import assert from 'node:assert/strict'
import { test } from 'node:test'
import Stripe from 'stripe'
import { createWebhook } from '../netlify/functions/stripe-webhook.mjs'

const env = {
  STRIPE_API_KEY:'sk_test_fixture',
  STRIPE_WEBHOOK_SECRET:'whsec_fixture',
  STRIPE_PRICE_ID:'price_fixture',
  STRIPE_MODE:'test',
}
const stripe = new Stripe(env.STRIPE_API_KEY)
const url = 'https://rolemapper.cc/api/stripe/webhook'

function request({signature=true,modified=false,livemode=false}={}) {
  const payload = JSON.stringify({
    id:'evt_fixture', type:'invoice.paid', livemode,
    data:{object:{customer:'cus_fixture',status:'unpaid'}},
  })
  const headers = signature ? {
    'stripe-signature':stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET}),
  } : {}
  return new globalThis.Request(url,{method:'POST',headers,body:modified?payload+' ':payload})
}

test('only signed events from the chosen mode can reach subscription storage', async () => {
  const webhook = createWebhook({env,dbClient:{rpc(){assert.fail('Unexpected storage call')}}})
  assert.equal((await webhook(request({signature:false}))).status,400)
  assert.equal((await webhook(request({modified:true}))).status,400)
  assert.equal((await webhook(request({livemode:true}))).status,400)
})

test('billing sync uses the current matching Stripe plan and skips an already processed event', async () => {
  const calls = []
  let reads = 0
  const dbClient = {async rpc(name,args) {
    calls.push([name,args])
    return {data:name==='begin_stripe_sync' && calls.length===1 ? 1 : null}
  }}
  const stripeClient = {
    webhooks:stripe.webhooks,
    subscriptions:{async *list(args) {
      reads++
      assert.equal(args.customer,'cus_fixture')
      yield {id:'sub_other',status:'active',created:3,items:{data:[{price:{id:'price_other'},quantity:1}]}}
      yield {id:'sub_cancelled',status:'canceled',created:2,items:{data:[{price:{id:'price_fixture'},quantity:1}]}}
      yield {id:'sub_fixture',status:'active',created:1,cancel_at_period_end:true,items:{data:[
        {price:{id:'price_fixture'},quantity:1,current_period_end:2_000_000_000},
      ]}}
    }},
  }
  const webhook = createWebhook({env,dbClient,stripeClient})
  assert.equal((await webhook(request())).status,200)
  assert.equal((await webhook(request())).status,200)
  assert.equal(reads,1)
  assert.deepEqual(calls[1],['finish_stripe_sync',{
    customer_id:'cus_fixture',event_reference:'evt_fixture',sync_revision:1,
    subscription_id:'sub_fixture',current_status:'active',
    current_eligible_until:new Date(2_000_000_000_000).toISOString(),current_cancel_at_period_end:true,
  }])
})
