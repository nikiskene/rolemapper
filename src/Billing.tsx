import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorText } from './model'

type Plan = {paid:boolean;status:string;eligible_until?:string;cancel_at_period_end?:boolean;has_customer:boolean}

export async function openBilling(db:SupabaseClient,workspace:string,action:'checkout'|'portal',beforeRedirect?:()=>void) {
  const {data,error} = await db.auth.getSession()
  if (error || !data.session) throw new Error('Sign in again to manage billing.')
  const response = await fetch('/api/stripe/billing',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
    body:JSON.stringify({workspace,action}),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Billing is temporarily unavailable.')
  const destination = new URL(result.url)
  if (destination.protocol !== 'https:' || !['checkout.stripe.com','billing.stripe.com'].includes(destination.hostname)) {
    throw new Error('The billing page is unavailable.')
  }
  beforeRedirect?.()
  window.location.assign(destination.href)
}

export function Billing({db,workspace,count,returned}:{db:SupabaseClient;workspace:string;count:number;returned:boolean}) {
  const [plan,setPlan] = useState<Plan|null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [refresh,setRefresh] = useState(0)

  useEffect(()=>{
    let alive=true
    let timer:number|undefined
    let checks=0
    async function load() {
      const {data,error}=await db.rpc('billing_summary',{workspace})
      if(!alive)return
      if(error) setError(errorText(error))
      else {
        setPlan(data)
        if(returned && !data.paid && ++checks<12) timer=window.setTimeout(()=>void load(),2500)
      }
    }
    void load()
    return ()=>{alive=false;window.clearTimeout(timer)}
  },[db,workspace,returned,refresh])

  async function action(kind:'checkout'|'portal') {
    if(busy)return
    setError('');setBusy(true)
    try { await openBilling(db,workspace,kind) }
    catch(error) { setError(errorText(error));setBusy(false) }
  }

  return <section className="guide" aria-label="Billing">
    <div>
      <h2>{plan?.paid?'Paid plan':'Workspace billing'}</h2>
      <p>{count} {count===1?'person':'people'} on the map{plan && !plan.paid?' · 5 included free':''}.</p>
      {plan && !plan.paid && <p>Upgrade for USD $10 per year to add more than five people.</p>}
      {plan && !plan.paid && count>5 && <p>You can keep and edit your existing map. Upgrade to increase the number of people.</p>}
      {plan?.paid && plan.cancel_at_period_end && plan.eligible_until &&
        <p>Paid access ends on {new Date(plan.eligible_until).toLocaleDateString()}.</p>}
      {returned && plan && !plan.paid && <p role="status">Waiting for Stripe to confirm your subscription.</p>}
      {error&&<p className="error" role="alert">{error}</p>}
    </div>
    <div className="panel-actions">
      {plan && !plan.paid && <button className="primary" disabled={busy} onClick={()=>void action('checkout')}>Upgrade</button>}
      {plan?.has_customer && <button disabled={busy} onClick={()=>void action('portal')}>Manage billing</button>}
      <button disabled={busy} onClick={()=>{setError('');setRefresh(value=>value+1)}}>Refresh status</button>
    </div>
  </section>
}
