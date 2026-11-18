import { useState, type FormEvent } from 'react'
import { Brand } from './Home'
import { errorText } from './model'

export function FeatureRequest() {
  const [sent,setSent]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(saving)return
    const fields=Object.fromEntries(new FormData(event.currentTarget))
    setSaving(true);setError('')
    try {
      const response=await fetch('/api/feature-request',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields),
      })
      if(response.status===429)throw new Error('Too many requests. Please try again in a minute.')
      const result=await response.json()
      if(!response.ok||!result.ok)throw new Error(result.error||'Could not submit your request.')
      setSent(true)
    } catch(error){setError(errorText(error))}
    finally{setSaving(false)}
  }

  return <div className="marketing">
    <header className="site-header"><div className="site-wrap feature-header"><Brand/></div></header>
    <main className="site-wrap site-section planner-page">
      <h1>Feature request</h1>
      {sent?<section className="planner-card" role="status">
        <h2>Request received</h2><p>Thanks for helping improve Rolemapper.</p>
        <div className="site-actions"><button className="site-button secondary" onClick={()=>setSent(false)}>Send another request</button><a className="site-button" href="/">Back to Rolemapper</a></div>
      </section>:<form onSubmit={submit} className="planner-card">
        <label>Headline<input name="headline" required maxLength={100} placeholder="Give your idea a short title"/></label>
        <label>Short description<textarea name="description" required maxLength={1000} placeholder="What would you like to do?"/></label>
        <label>Expected benefit<textarea name="benefit" required maxLength={700} placeholder="How would this help you or your team?"/></label>
        <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
        <p className="hint">Your request goes to the Rolemapper team. Please leave out confidential company or personal details.</p>
        {error&&<p className="error" role="alert">{error}</p>}
        <div className="site-actions"><button className="site-button" disabled={saving}>{saving?'Sending…':'Submit request'}</button><a className="site-button secondary" href="/">Cancel</a></div>
      </form>}
    </main>
  </div>
}
