import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Brand } from './Home'
import { errorText } from './model'

type AdminAccount = { id:string; email:string|null; confirmed:boolean; suspended:boolean; administrator:boolean }
type AdminWorkspace = { id:string; suspended:boolean }
type AccessChange = { id:string; resource:'account'|'workspace'; suspend:boolean; label:string }

export function Admin({db}:{db:SupabaseClient}) {
  const [accounts,setAccounts] = useState<AdminAccount[]>([])
  const [workspaces,setWorkspaces] = useState<AdminWorkspace[]>([])
  const [account,setAccount] = useState<AdminAccount|null>(null)
  const [accountPage,setAccountPage] = useState(1)
  const [workspacePage,setWorkspacePage] = useState(1)
  const [totalAccounts,setTotalAccounts] = useState(0)
  const [totalWorkspaces,setTotalWorkspaces] = useState(0)
  const [change,setChange] = useState<AccessChange|null>(null)
  const [revision,setRevision] = useState(0)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [loadingAccounts,setLoadingAccounts] = useState(true)
  const [loadingWorkspaces,setLoadingWorkspaces] = useState(false)

  useEffect(()=>{
    let current = true
    setLoadingAccounts(true)
    void db.rpc('admin_directory',{page_number:accountPage}).then(({data,error})=>{
      if (!current) return
      setLoadingAccounts(false)
      if (error) setError(error.code==='42501' ? 'Administrator access is required.' : errorText(error))
      else { setAccounts(data.accounts); setTotalAccounts(data.total_accounts) }
    })
    return ()=>{ current = false }
  },[db,accountPage,revision])

  const accountId = account?.id
  useEffect(()=>{
    if (!accountId) return
    let current = true
    setLoadingWorkspaces(true)
    void db.rpc('admin_workspaces',{account_id:accountId,page_number:workspacePage}).then(({data,error})=>{
      if (!current) return
      setLoadingWorkspaces(false)
      if (error) setError(errorText(error))
      else { setWorkspaces(data.workspaces); setTotalWorkspaces(data.total_workspaces) }
    })
    return ()=>{ current = false }
  },[db,accountId,workspacePage,revision])

  async function confirmChange() {
    if (!change || saving) return
    setSaving(true)
    setError('')
    const {error} = await db.rpc('admin_set_access',{target_id:change.id,resource:change.resource,suspend:change.suspend})
    setSaving(false)
    if (error) { setError(errorText(error)); return }
    setChange(null)
    setRevision(value=>value+1)
  }

  function viewWorkspaces(owner:AdminAccount) {
    if (accountId===owner.id) return
    setWorkspaces([])
    setTotalWorkspaces(0)
    setWorkspacePage(1)
    setAccount(owner)
  }

  return <>
    <header className="topbar"><Brand/><a href="/login">My workspace</a></header>
    <main className="main admin-page">
      <h1>Rolemapper administration</h1>
      <p>Manage access to accounts and workspaces.</p>
      {error&&<p className="error" role="alert">{error}</p>}
      {change&&<section className="admin-confirm" aria-label="Confirm access change">
        <p>{change.suspend?'Suspend':'Restore'} access for {change.label}?</p>
        <button className="primary" type="button" disabled={saving} onClick={()=>void confirmChange()}>Confirm</button>{' '}
        <button type="button" disabled={saving} onClick={()=>setChange(null)}>Cancel</button>
      </section>}
      <section aria-labelledby="admin-accounts">
        <h2 id="admin-accounts">Accounts</h2>
        {loadingAccounts?<p role="status">Loading accounts…</p>:<ul className="admin-list">
          {accounts.map(owner=><li key={owner.id}>
            <div><strong>{owner.email||owner.id}</strong><p>{owner.administrator?'Administrator · ':''}{owner.suspended?'Suspended':owner.confirmed?'Confirmed':'Awaiting confirmation'}</p></div>
            <div className="panel-actions">
              <button type="button" onClick={()=>viewWorkspaces(owner)} aria-pressed={accountId===owner.id}>Workspaces</button>
              {!owner.administrator&&<button type="button" onClick={()=>setChange({
                id:owner.id,resource:'account',suspend:!owner.suspended,label:owner.email||owner.id,
              })}>{owner.suspended?'Restore access':'Suspend access'}</button>}
            </div>
          </li>)}
        </ul>}
        {totalAccounts>50&&<Pager page={accountPage} total={totalAccounts} setPage={setAccountPage}/>}
      </section>
      {account&&<section aria-labelledby="admin-workspaces">
        <h2 id="admin-workspaces">Workspaces for {account.email||account.id}</h2>
        {loadingWorkspaces?<p role="status">Loading workspaces…</p>:workspaces.length===0?<p>No workspaces.</p>:<ul className="admin-list">
          {workspaces.map(workspace=><li key={workspace.id}>
            <div><strong>{workspace.id}</strong><p>{workspace.suspended?'Suspended':'Available'}</p></div>
            {!account.administrator&&<button type="button" onClick={()=>setChange({
              id:workspace.id,resource:'workspace',suspend:!workspace.suspended,label:'workspace '+workspace.id,
            })}>{workspace.suspended?'Restore access':'Suspend access'}</button>}
          </li>)}
        </ul>}
        {totalWorkspaces>50&&<Pager page={workspacePage} total={totalWorkspaces} setPage={setWorkspacePage}/>}
      </section>}
    </main>
  </>
}

function Pager({page,total,setPage}:{page:number;total:number;setPage:(page:number)=>void}) {
  const last = Math.ceil(total/50)
  return <div className="panel-actions">
    <button type="button" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button>
    <span>Page {page} of {last}</span>
    <button type="button" disabled={page>=last} onClick={()=>setPage(page+1)}>Next</button>
  </div>
}
