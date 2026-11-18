import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorText } from './model'

const labels = {unread:'Unread', working:'Working on it', ignored:'Ignored', resolved:'Resolved'} as const
type Status = keyof typeof labels
type RequestEntry = {id:string;headline:string;description:string;benefit:string;status:Status;created_at:string}

export function FeatureInbox({db}:{db:SupabaseClient}) {
  const [entries,setEntries]=useState<RequestEntry[]>([])
  const [filter,setFilter]=useState<Status|'all'>('all')
  const [page,setPage]=useState(1)
  const [total,setTotal]=useState(0)
  const [unread,setUnread]=useState(0)
  const [revision,setRevision]=useState(0)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [deleting,setDeleting]=useState<string|null>(null)

  useEffect(()=>{
    let active=true
    setLoading(true)
    void db.rpc('admin_feature_requests',{inbox_status:filter,page_number:page}).then(({data,error})=>{
      if(!active)return
      setLoading(false)
      if(error){setEntries([]);setError(errorText(error));return}
      const last=Math.max(1,Math.ceil(data.total/25))
      if(page>last){setPage(last);return}
      setEntries(data.requests);setTotal(data.total);setUnread(data.unread)
    })
    return ()=>{active=false}
  },[db,filter,page,revision])

  async function change(id:string,status:Status|'deleted') {
    if(busy)return
    setBusy(true);setError('')
    try {
      const {error}=await db.rpc('admin_set_feature_request',{request_id:id,next_status:status})
      if(error)throw error
      setDeleting(null);setRevision(value=>value+1)
    } catch(error){setError(errorText(error))}
    finally{setBusy(false)}
  }

  return <section aria-labelledby="feature-inbox-title">
    <h2 id="feature-inbox-title">Feature requests</h2>
    <div className="panel-actions inbox-toolbar">
      <label>Show requests<select value={filter} onChange={event=>{
        setError('');setDeleting(null);setPage(1);setFilter(event.target.value as typeof filter)
      }}>
        <option value="all">All requests</option>
        {Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <span>{unread} unread</span>
      <button type="button" disabled={busy||loading} onClick={()=>{setError('');setRevision(value=>value+1)}}>Refresh</button>
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    {loading?<p role="status">Loading requests…</p>:entries.length===0?<p>No requests in this view.</p>:<ul className="admin-list feature-inbox">
      {entries.map(entry=><li key={entry.id}>
        <div><h3>{entry.headline}</h3><p>{labels[entry.status]} · <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleDateString()}</time></p></div>
        <p className="feature-text">{entry.description}</p>
        <div><strong>Expected benefit</strong><p className="feature-text">{entry.benefit}</p></div>
        {deleting===entry.id?<div className="panel-actions">
          <span>Permanently remove this request’s content?</span>
          <button type="button" disabled={busy} onClick={()=>void change(entry.id,'deleted')}>Confirm deletion</button>
          <button type="button" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button>
        </div>:<div className="panel-actions">
          <label>Change status<select value={entry.status} disabled={busy||loading}
            onChange={event=>void change(entry.id,event.target.value as Status)}>
            {Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          <button type="button" disabled={busy||loading} onClick={()=>setDeleting(entry.id)}>Delete</button>
        </div>}
      </li>)}
    </ul>}
    {total>25&&<div className="panel-actions">
      <button type="button" disabled={loading||page===1} onClick={()=>setPage(value=>value-1)}>Previous</button>
      <span>Page {page} of {Math.ceil(total/25)}</span>
      <button type="button" disabled={loading||page>=Math.ceil(total/25)} onClick={()=>setPage(value=>value+1)}>Next</button>
    </div>}
  </section>
}
