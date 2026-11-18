import { StrictMode, Suspense, lazy, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient, type Session } from '@supabase/supabase-js'
import { errorText, linkedinUrl, zoneLabel, zones, type Card, type Company, type MapData, type Status, type Zone } from './model'
import './style.css'
import { Avatar, ExportPanel, MapPager, RoleMapLayout, SharedMap, mapPageSize, ownerPhotos, photoIds, prepareHeadshot, type DisplayCard, type Photos } from './MapExport'
import { Billing, openBilling } from './Billing'
import { Brand, Homepage, isLegalPath, LegalPage, PlannerPage } from './Home'

const Handoffs = lazy(()=>import('./Planning').then(module=>({default:module.Handoffs})))
const Scenarios = lazy(()=>import('./Planning').then(module=>({default:module.Scenarios})))
const Admin = lazy(()=>import('./Admin').then(module=>({default:module.Admin})))
const FeatureRequest = lazy(()=>import('./FeatureRequest').then(module=>({default:module.FeatureRequest})))

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const authCallback = /(?:^|[&#?])(?:access_token|code|error_code)=/.test(window.location.hash + window.location.search)
const db = url && key ? createClient(url, key) : null
const emptyMap:MapData = {cards:[],people:[],organizations:[]}
const wordmark = <span className="auth-brand"><Brand/></span>

function Auth({startRegister}:{startRegister:boolean}) {
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const [register,setRegister] = useState(startRegister)
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setError(''); setMessage('')
    const credentials = {email:String(data.get('email')).trim(),password:String(data.get('password'))}
    try {
      const result = register ? await db!.auth.signUp({...credentials,options:{emailRedirectTo:window.location.origin}}) : await db!.auth.signInWithPassword(credentials)
      if (result.error) throw result.error
      if (!result.data.session) setMessage('Check your inbox to confirm your email, then sign in.')
    } catch(e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return <main className="welcome"><section className="auth-card">{wordmark}<p className="eyebrow">YOUR PRIVATE WORKSPACE</p><h1>See who makes it happen.</h1>
    <p>Map the people, roles and partners around your company.</p>
    <form onSubmit={submit}>
      <label>Email<input type="email" name="email" required autoComplete="email"/></label>
      <label>Password<input type="password" name="password" required minLength={register ? 8 : undefined} autoComplete={register?'new-password':'current-password'}/></label>
      {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}
      <button className="primary" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button>
      <button type="button" className="link" disabled={busy} onClick={()=>{setRegister(!register);setError('');setMessage('')}}>{register?'Already have an account? Sign in':'New here? Create an account'}</button>
    </form>
    <p className="auth-legal"><a href="/privacy">Privacy notice</a> · <a href="/terms">Terms of use</a></p>
  </section></main>
}

function Workspace({session}:{session:Session}) {
  const [isAdmin,setIsAdmin] = useState(false)
  useEffect(()=>{
    let active = true
    void db!.rpc('is_platform_admin').then(({data,error})=>{
      if (active) setIsAdmin(!error && data===true)
    })
    return ()=>{ active = false }
  },[session.user.id])
  const [companies,setCompanies] = useState<Company[]>([])
  const [selected,setSelected] = useState('')
  const [creating,setCreating] = useState(false)
  const [companiesLoaded,setCompaniesLoaded] = useState(false)
  const [busy,setBusy] = useState(true)
  const [error,setError] = useState('')
  useEffect(()=>{
    let alive=true
    void db!.from('companies').select('id,name').order('name').then(({data,error})=>{
      if (!alive) return
      if(error) setError(error.message)
      else {
        setCompanies(data);setCompaniesLoaded(true)
        const previous=new URLSearchParams(window.location.search).get('workspace') || sessionStorage.getItem('rolemapper:'+session.user.id)
        setSelected(data.find(c=>c.id===previous)?.id??data[0]?.id??'')
      }
      setBusy(false)
    })
    return ()=>{alive=false}
  },[session.user.id])
  function select(id:string) { setSelected(id);sessionStorage.setItem('rolemapper:'+session.user.id,id) }
  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name=String(new FormData(event.currentTarget).get('name')).trim()
    if (!name) return
    setBusy(true);setError('')
    try {
      const {data,error}=await db!.rpc('create_company',{company_name:name})
      if(error) throw error
      setCompanies(c=>[...c,{id:data,name}]);select(data);setCreating(false)
    } catch(e){setError(errorText(e))} finally {setBusy(false)}
  }
  const company=companies.find(c=>c.id===selected)
  return <>
    <header className="topbar">{wordmark}<div className="workspace-controls">
      {companies.length>0&&<select aria-label="Company" disabled={busy} value={selected} onChange={e=>select(e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <button onClick={()=>setCreating(v=>!v)} disabled={busy}>New company</button>
      {isAdmin&&<a href="/admin">Administration</a>}
      <button onClick={async()=>{const {error}=await db!.auth.signOut();if(error)setError(error.message)}}>Sign out</button>
    </div></header>
    {error&&<p className="global-error error" role="alert">{error}</p>}
    {busy&&!company&&!creating&&<p className="global-error" role="status">Loading workspaces…</p>}
    {(creating||(companiesLoaded&&!company))&&<section className="setup">
      <p className="eyebrow">STEP 01 / WORKSPACE</p><h1>Create a company</h1><p>Each company has its own private map.</p>
      <form onSubmit={create}><label>Company name<input name="name" maxLength={100} required autoFocus/></label><button className="primary" disabled={busy}>{busy?'Creating…':'Create company'}</button></form>
    </section>}
    {company&&<MapEditor company={company} accountId={session.user.id} key={company.id}/>}
    <footer className="main workspace-footer"><a className="feature-link" href="/feature-request">Feature request</a></footer>
  </>
}

type CardDraft = { zone:Zone; cardId?:string; fields:Record<string,string>; photo?:string }
function MapEditor({company,accountId}:{company:Company;accountId:string}) {
  const [map,setMap]=useState<MapData>(emptyMap)
  const [loading,setLoading]=useState(true)
  const [loaded,setLoaded]=useState(false)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [editing,setEditing]=useState<{zone:Zone; card?:Card; draft?:Record<string,string>; draftPhoto?:string}|null>(null)
  const [blocked,setBlocked]=useState(false)
  const [checkedOut,setCheckedOut]=useState(false)
  const lastSave=useRef<CardDraft|null>(null)
  const [moving,setMoving]=useState<Card|null>(null)
  const [dragged,setDragged]=useState<string|null>(null)
  const [over,setOver]=useState<string|null>(null)
  const billingReturn=new URLSearchParams(window.location.search).get('billing')
  const [view,setView]=useState(billingReturn?'Billing':'Map')
  const [list,setList]=useState<boolean|null>(null)
  const [narrow]=useState(()=>window.matchMedia('(max-width:720px)').matches)
  const [hiddenZones,setHiddenZones]=useState<Zone[]>([])
  const [hiddenCards,setHiddenCards]=useState<string[]>([])
  const [search,setSearch]=useState('')
  const [mapPage,setMapPage]=useState(0)
  const [photos,setPhotos]=useState<Photos>({})
  const [photoRevision,setPhotoRevision]=useState(0)
  const [exporting,setExporting]=useState(false)
  const operation=useRef(false)
  const id=company.id
  const draftKey='rolemapper:checkout:'+accountId+':'+id
  const [draft,setDraft]=useState<CardDraft|null>(()=>{
    try {
      const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null') as CardDraft|null
      return saved && zones.some(([zone])=>zone===saved.zone) ? saved : null
    } catch { return null }
  })
  async function upgrade() {
    setCheckedOut(true);setError('')
    try {
      await openBilling(db!,id,'checkout',()=>{
        if(lastSave.current)sessionStorage.setItem(draftKey,JSON.stringify(lastSave.current))
      })
    } catch(error) { setError(errorText(error));setCheckedOut(false) }
  }
  async function readMap():Promise<MapData> {
    async function readAll<T>(table:string,sort:string) {
      const items:T[]=[]
      for(let offset=0;;offset+=500){
        const {data,error}=await db!.from(table).select('*').eq('company_id',id)
          .order(sort).order('id').range(offset,offset+499)
        if(error)throw error
        items.push(...data as T[])
        if(data.length<500)return items
      }
    }
    const [cards,people,organizations]=await Promise.all([
      readAll<MapData['cards'][number]>('placements','rank'),
      readAll<MapData['people'][number]>('people','name'),
      readAll<MapData['organizations'][number]>('organizations','name'),
    ])
    return {cards,people,organizations}
  }
  useEffect(()=>{
    let alive=true
    readMap().then(result=>{if(alive){setMap(result);setLoaded(true)}}).catch(e=>{if(alive)setError(errorText(e))}).finally(()=>{if(alive)setLoading(false)})
    return ()=>{alive=false}
    // Each instance is keyed by company ID.
  },[id])
  async function mutate(action:()=>PromiseLike<{error:unknown}>, done:()=>void, success='Changes saved') {
    if(operation.current)return
    operation.current=true;setBusy(true);setNotice('');setError('');setBlocked(false)
    let saved=false
    try {
      const {error}=await action();if(error)throw error
      saved=true;done()
      setMap(await readMap());setPhotoRevision(value=>value+1);setNotice(success)
    } catch(e){
      if(saved){setLoaded(false);setError('Changes were saved, but the map could not reload. ' + errorText(e))}
      else {
        setBlocked(!!e && typeof e==='object' && 'code' in e && e.code==='RM005')
        setError(errorText(e))
      }
    } finally{operation.current=false;setBusy(false)}
  }
  const move=(card:Card,zone:Zone,before:string|null)=>mutate(()=>db!.rpc('move_card',{workspace:id,card:card.id,target:zone,before_card:before}),()=>setMoving(null),'Card moved')
  function drop(zone:Zone,before:string|null) {
    const card=map.cards.find(c=>c.id===dragged)
    setDragged(null);setOver(null)
    if(card&&card.id!==before)void move(card,zone,before)
  }
  const count=new Set(map.cards.flatMap(c=>c.person_id?[c.person_id]:[])).size
  const peopleById=new Map(map.people.map(person=>[person.id,person]))
  const organizationsById=new Map(map.organizations.map(org=>[org.id,org]))
  const displayCards=zones.flatMap(([zone])=>map.cards.filter(card=>card.zone===zone).map(card=>({
    id:card.id,zone,title:card.title,status:card.status,photoId:card.person_id,
    name:(card.person_id&&peopleById.get(card.person_id)?.name) ||
      (card.organization_id&&organizationsById.get(card.organization_id)?.name) || card.title,
  } satisfies DisplayCard)))
  const keyword=search.trim().toLowerCase()
  const filtered=displayCards.filter(card=>!hiddenZones.includes(card.zone)&&!hiddenCards.includes(card.id)&&
    (!keyword||[card.name,card.title,zoneLabel(card.zone),card.status].some(value=>value?.toLowerCase().includes(keyword))))
  const pageSize=mapPageSize(count)
  const pages=Math.ceil(filtered.length/pageSize)
  const currentPage=Math.min(mapPage,Math.max(0,pages-1))
  const onPage=filtered.slice(currentPage*pageSize,(currentPage+1)*pageSize)
  const visibleIds=new Set(onPage.map(card=>card.id))
  const visiblePhotoIds=photoIds(onPage).join(',')
  useEffect(()=>{
    let active=true
    setPhotos({})
    if(visiblePhotoIds)void ownerPhotos(db!,id,visiblePhotoIds.split(','))
      .then(result=>{if(active)setPhotos(result)})
      .catch(error=>{if(active)setError(errorText(error))})
    return ()=>{active=false}
  },[id,visiblePhotoIds,photoRevision])
  const directory=list??(narrow||count>10||displayCards.length>20)
  const needsFounder=!map.cards.some(c=>c.zone==='founder'&&c.person_id)
  return <main className="main">
    <div className="hero"><div><p className="eyebrow">THE PEOPLE AROUND YOUR COMPANY</p><h1>{company.name}</h1><p>See who builds, backs and supports your company.</p></div>
    <span className="privacy"><span aria-hidden="true">●</span> Private workspace</span></div>
    <nav className="views" aria-label="Workspace views">{['Map','Handoffs','Scenarios','Billing'].map(v=><button key={v} aria-current={view===v?'page':undefined} onClick={()=>setView(v)}>{v}</button>)}</nav>
    {(busy||notice||loading)&&<p className="feedback" role="status">{busy?'Saving…':loading?'Loading your map…':notice}</p>}
    {error&&!editing&&!moving&&<p className="error" role="alert">{error}</p>}
    {!loaded&&!loading&&<button onClick={async()=>{setLoading(true);setError('');try{setMap(await readMap());setLoaded(true)}catch(e){setError(errorText(e))}finally{setLoading(false)}}}>Reload map</button>}
    {draft && view==='Map' && loaded && !editing && <section className="guide">
      <p>You have an unsaved card from before checkout.</p>
      <button onClick={()=>{
        const card=map.cards.find(candidate=>candidate.id===draft.cardId)
        if(draft.cardId && !card){setError('This card no longer exists.');return}
        setError('');setBlocked(false);setEditing({zone:draft.zone,card,draft:draft.fields,draftPhoto:draft.photo})
      }}>Resume card</button>
    </section>}
    {view==='Billing'?<Billing db={db!} workspace={id} count={count} returned={billingReturn==='returned'}/>:view==='Handoffs'?loaded&&<Suspense fallback={<p className="planning">Loading handoffs…</p>}><Handoffs key={id} db={db!} workspace={id} map={map}/></Suspense>:view==='Scenarios'?loaded&&<Suspense fallback={<p className="planning">Loading scenarios…</p>}><Scenarios key={id} db={db!} workspace={id} map={map}/></Suspense>:loaded&&<>
      <div className="boardbar"><div><strong>{count} {count===1?'person':'people'}</strong><span>{map.cards.length} {map.cards.length===1?'placement':'placements'}</span></div><div>
        <button onClick={()=>setList(!directory)}>{directory?'Show map':'Show grouped list'}</button>
        <button disabled={!displayCards.length} onClick={()=>setExporting(true)}>Export rolemap</button>
        <button className="primary" disabled={busy} onClick={()=>{setError('');setEditing({zone:needsFounder?'founder':'team'})}}>+ Add card</button>
      </div></div>
      {needsFounder&&<section className="guide"><div><p className="eyebrow">START IN THE CENTER</p><h2>Who is the founding lead?</h2><p>Add the founder’s name, then place the people and roles around them.</p></div><button className="primary" disabled={busy} onClick={()=>{setError('');setEditing({zone:'founder'})}}>Add founding lead</button></section>}
      {displayCards.length>0&&<div className="map-filters">
        <label>Search people, titles or functions<input type="search" value={search} onChange={event=>{setSearch(event.target.value);setMapPage(0)}}/></label>
        <details><summary>Show or hide functions</summary>
          <div className="map-filter-options">{zones.filter(([zone])=>displayCards.some(card=>card.zone===zone)).map(([zone])=><label className="check-line" key={zone}>
            <input type="checkbox" checked={!hiddenZones.includes(zone)} onChange={event=>{
              setMapPage(0);setHiddenZones(items=>event.target.checked?items.filter(item=>item!==zone):[...items,zone])
            }}/>{zoneLabel(zone)}</label>)}</div>
        </details>
        {hiddenCards.length>0&&<details><summary>Hidden tiles ({hiddenCards.length})</summary><div className="map-filter-options">
          {displayCards.filter(card=>hiddenCards.includes(card.id)).map(card=><button key={card.id}
            onClick={()=>setHiddenCards(items=>items.filter(item=>item!==card.id))}>Show {card.name}</button>)}
        </div></details>}
        {(hiddenCards.length>0||hiddenZones.length>0||search)&&<button onClick={()=>{setHiddenCards([]);setHiddenZones([]);setSearch('');setMapPage(0)}}>Reset filters</button>}
      </div>}
      {displayCards.length>0&&!filtered.length&&<p role="status">No tiles match your filters.</p>}
      <RoleMapLayout directory={directory}>{zones.map(([zone,title,description])=>{
        const cards=map.cards.filter(card=>card.zone===zone&&visibleIds.has(card.id))
        if(!cards.length&&!dragged)return null
        if(hiddenZones.includes(zone))return null
        return <section aria-label={zoneLabel(zone)} className={'zone '+zone+(over===zone?' drop-target':'')} key={zone}
          onDragOver={e=>{if(dragged&&!busy){e.preventDefault();setOver(zone)}}}
          onDrop={e=>{e.preventDefault();drop(zone,null)}}>
          <div className="zone-header"><div><h2>{title}</h2><p>{description}</p></div><button aria-label={`Add card to ${zoneLabel(zone)}`} disabled={busy} onClick={()=>{setError('');setEditing({zone})}}>+</button></div>
          <div className="zone-cards">{cards.length===0&&<p className="empty">No cards yet</p>}{cards.map(card=>{
            const person=card.person_id?peopleById.get(card.person_id):undefined
            const organization=card.organization_id?organizationsById.get(card.organization_id):undefined
            return <article key={card.id} className={'card'+(over===card.id?' drop-target':'')+(dragged===card.id?' dragging':'')} draggable={!busy}
              onDragStart={e=>{e.dataTransfer.setData('text/plain',card.id);e.dataTransfer.effectAllowed='move';setDragged(card.id)}}
              onDragEnd={()=>{setDragged(null);setOver(null)}}
              onDragOver={e=>{if(dragged&&!busy){e.preventDefault();e.stopPropagation();setOver(card.id)}}}
              onDrop={e=>{e.preventDefault();e.stopPropagation();drop(zone,card.id)}}>
              <button className="card-main" disabled={busy} onClick={()=>{setError('');setEditing({zone,card})}}>
                <Avatar name={person?.name??organization?.name??card.title} src={person?photos[person.id]:undefined}/>
                <span className="card-text"><strong>{person?.name??organization?.name??card.title}</strong>
                  <span>{person||organization?card.title:card.status}</span>
                </span>
              </button>
              <div className="tile-actions"><button className="move" aria-label={`Move ${person?.name??organization?.name??card.title} · ${card.title}`} disabled={busy} onClick={()=>{setError('');setMoving(card)}}>Move to…</button>
              <button className="move" disabled={busy} onClick={()=>setHiddenCards(items=>[...items,card.id])}
                aria-label={`Hide ${person?.name??organization?.name??card.title}`}>Hide</button></div>
            </article>
          })}</div>
        </section>
      })}</RoleMapLayout>
      <MapPager page={currentPage} pages={pages} change={setMapPage}/>
      <footer>Drag cards to rearrange the map, or use <strong>Move to…</strong> to pick a zone and position.</footer>
    </>}
    {exporting&&<Panel title="Export rolemap" close={()=>setExporting(false)} busy={false}><ExportPanel db={db!} workspace={id} title={company.name} cards={filtered}/></Panel>}
    {editing&&<CardEditor {...editing} map={map} workspace={id} busy={busy||checkedOut} error={error} close={()=>{setEditing(null);setBlocked(false)}}
      upgrade={blocked?()=>void upgrade():undefined}
      save={(fields,photo)=>{
        lastSave.current={zone:editing.zone,cardId:editing.card?.id,fields,photo}
        return mutate(()=>db!.rpc('save_card_with_headshot',{workspace:id,card:editing.card?.id??null,fields,photo:photo??null}),()=>{
          if(editing.draft){sessionStorage.removeItem(draftKey);setDraft(null)}
          setEditing(null)
        })
      }}
      remove={editing.card?()=>mutate(()=>db!.from('placements').delete().eq('company_id',id).eq('id',editing.card!.id),()=>setEditing(null),'Card removed'):undefined}/>}
    {moving&&<MoveCard card={moving} map={map} error={error} busy={busy} close={()=>setMoving(null)} move={(zone,before)=>void move(moving,zone,before)}/>}
  </main>
}

function Panel({title,close,busy,children}:{title:string;close:()=>void;busy:boolean;children:React.ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close()},[])
  return <dialog ref={dialog} aria-labelledby="panel-title" onCancel={e=>{e.preventDefault();if(!busy)close()}}>
    <header className="panel-heading"><h2 id="panel-title">{title}</h2><button type="button" onClick={close} disabled={busy} aria-label="Close panel">×</button></header>
    {children}
  </dialog>
}

function CardEditor({zone,card,draft,draftPhoto,map,workspace,busy,error,close,save,remove,upgrade}:{zone:Zone;card?:Card;draft?:Record<string,string>;draftPhoto?:string;map:MapData;workspace:string;busy:boolean;error:string;close:()=>void;save:(fields:Record<string,string>,photo?:string)=>void;remove?:()=>void;upgrade?:()=>void}) {
  const [status,setStatus]=useState<Status>((draft?.status as Status|undefined)??card?.status??'Filled')
  const [kind,setKind]=useState(draft ? (draft.organization_id||draft.organization_name?'partner':'person') : (card?.organization_id?'partner':'person'))
  const [personId,setPersonId]=useState(draft?.person_id??card?.person_id??'')
  const [orgId,setOrgId]=useState(draft?.organization_id??card?.organization_id??'')
  const [validation,setValidation]=useState('')
  const [confirmRemove,setConfirmRemove]=useState(false)
  const [photo,setPhoto]=useState<string|undefined>(draftPhoto)
  const [storedPhoto,setStoredPhoto]=useState<string|undefined>()
  const [photoBusy,setPhotoBusy]=useState(false)
  useEffect(()=>{
    let active=true
    setStoredPhoto(undefined)
    if(personId)void ownerPhotos(db!,workspace,[personId])
      .then(result=>{if(active)setStoredPhoto(result[personId])}).catch(()=>{})
    return ()=>{active=false}
  },[personId,workspace])
  const person=map.people.find(p=>p.id===personId)
  const org=map.organizations.find(o=>o.id===orgId)
  const linkedin=person&&linkedinUrl(person.linkedin)
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidation('')
    const fields:Record<string,string>={}
    for(const [k,v] of new FormData(event.currentTarget))fields[k]=String(v).trim()
    for(const k of ['person_id','organization_id','person_name','organization_name','bio','linkedin','email','affiliation'])fields[k]??=''
    if(fields.linkedin&&!linkedinUrl(fields.linkedin)){setValidation('Enter a LinkedIn URL beginning with https://www.linkedin.com/.');return}
    if(!fields.title){setValidation('Enter a role title.');return}
    if(status==='Filled'&&!fields.person_name&&!fields.organization_name){setValidation('Enter a person or organization name.');return}
    if(status==='Filled'&&kind==='person'&&!fields.person_name){setValidation('Enter the person’s name.');return}
    if(status==='Filled'&&kind==='partner'&&!fields.organization_name){setValidation('Enter the organization’s name.');return}
    if(!fields.person_name&&['bio','linkedin','email','affiliation'].some(k=>fields[k])){setValidation('Enter a contact name to save contact details.');return}
    void save(fields,fields.person_name?photo:undefined)
  }
  return <Panel title={card?'Card details':zone==='founder'?'Add founding lead':'Add card'} close={close} busy={busy}>
    <form onSubmit={submit}>
      <fieldset disabled={busy||photoBusy}>
        <label>Zone<select name="zone" defaultValue={draft?.zone??zone}>{zones.map(([z])=><option key={z} value={z}>{zoneLabel(z)}</option>)}</select></label>
        <div className="fields"><label>Role title<input name="title" defaultValue={draft?.title??card?.title??(zone==='founder'?'Founder':'')} required maxLength={120}/></label>
        <label>Status<select name="status" value={status} onChange={e=>setStatus(e.target.value as Status)}><option>Filled</option><option>Open</option><option>Later</option></select></label></div>
        <label>Remit<textarea name="remit" defaultValue={draft?.remit??card?.remit} maxLength={2000} placeholder="What does this role own?"/></label>
        {status==='Filled'&&<>
          <label>Card type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="person">Person</option><option value="partner">Partner organization</option></select></label>
          {kind==='partner'&&<><label>Organization<select name="organization_id" value={orgId} onChange={e=>setOrgId(e.target.value)}><option value="">New organization</option>{map.organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label>Organization name<input key={orgId} name="organization_name" defaultValue={(draft && orgId===draft.organization_id ? draft.organization_name : undefined)??org?.name} maxLength={120} required/></label></>}
          {(map.people.length>0||kind==='partner')&&<label>{kind==='partner'?'Named contact (optional)':'Person record'}<select name="person_id" value={personId} onChange={e=>{setPersonId(e.target.value);setPhoto(undefined)}}><option value="">{kind==='partner'?'No existing contact':'New person'}</option>{map.people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
          {person&&<p className="hint">Contact details are shared across this person’s roles.</p>}
          <div className="person-fields" key={personId}>
            <label>Name<input name="person_name" defaultValue={(draft && personId===draft.person_id ? draft.person_name : undefined)??person?.name} required={kind==='person'||!!personId} maxLength={120} autoFocus={!card&&zone==='founder'}/></label>
            <div className="headshot-edit">
              <Avatar name={person?.name||'Person'} src={photo??storedPhoto}/>
              <label>Headshot<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event=>{
                const input=event.currentTarget
                const file=input.files?.[0]
                input.value=''
                if(!file)return
                setPhotoBusy(true);setValidation('')
                try{setPhoto(await prepareHeadshot(file))}
                catch(error){setValidation(errorText(error))}
                finally{setPhotoBusy(false)}
              }}/></label>
              {(photo??storedPhoto)&&<button type="button" onClick={()=>setPhoto('')}>Remove headshot</button>}
            </div>
            <label>Bio<textarea name="bio" defaultValue={(draft && personId===draft.person_id ? draft.bio : undefined)??person?.bio} maxLength={3000}/></label>
            <label>LinkedIn<input type="url" name="linkedin" defaultValue={(draft && personId===draft.person_id ? draft.linkedin : undefined)??person?.linkedin} maxLength={500} placeholder="https://www.linkedin.com/in/…"/>{linkedin&&<a href={linkedin} target="_blank" rel="noopener noreferrer">Open LinkedIn profile</a>}</label>
            <label>Email<input name="email" type="email" defaultValue={(draft && personId===draft.person_id ? draft.email : undefined)??person?.email} maxLength={254}/></label>
            <label>Company or affiliation<input name="affiliation" defaultValue={(draft && personId===draft.person_id ? draft.affiliation : undefined)??person?.affiliation} maxLength={120}/></label>
          </div>
        </>}
      </fieldset>
      {(validation||error)&&<p className="error" role="alert">{validation||error}</p>}
      {upgrade&&<button type="button" className="primary" disabled={busy} onClick={upgrade}>Upgrade for $10/year</button>}
      {confirmRemove&&<p>Remove this placement from the map? The person or organization stays available for other roles.</p>}
      <div className="panel-actions"><button className="primary" disabled={busy||photoBusy}>{busy?'Saving…':photoBusy?'Preparing image…':'Save card'}</button>
      {remove&&<button type="button" disabled={busy} onClick={()=>{if(confirmRemove)remove();else setConfirmRemove(true)}}>{confirmRemove?'Confirm removal':'Remove card'}</button>}
      </div>
    </form>
  </Panel>
}

function MoveCard({card,map,close,move,busy,error}:{card:Card;map:MapData;close:()=>void;move:(zone:Zone,before:string|null)=>void;busy:boolean;error:string}) {
  const [zone,setZone]=useState(card.zone)
  const [before,setBefore]=useState('')
  return <Panel title={'Move '+card.title} close={close} busy={busy}>
    <form onSubmit={e=>{e.preventDefault();move(zone,before||null)}}>
      <label>Destination zone<select autoFocus value={zone} disabled={busy} onChange={e=>{setZone(e.target.value as Zone);setBefore('')}}>{zones.map(([z])=><option key={z} value={z}>{zoneLabel(z)}</option>)}</select></label>
      <label>Position<select value={before} disabled={busy} onChange={e=>setBefore(e.target.value)}>
        <option value="">End of zone</option>{map.cards.filter(c=>c.zone===zone&&c.id!==card.id).map((c,index)=><option key={c.id} value={c.id}>Before {index+1}. {c.title}{c.person_id?' · '+map.people.find(p=>p.id===c.person_id)?.name:''}</option>)}
      </select></label>
      {error&&<p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy?'Saving…':'Move card'}</button>
    </form>
  </Panel>
}

function Account({startRegister, admin=false}:{startRegister:boolean;admin?:boolean}) {
  const [session,setSession]=useState<Session|null|undefined>()
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!db)return
    let live=true
    const {data:{subscription}}=db.auth.onAuthStateChange((_event,next)=>{if(live){
      if(next && authCallback && window.location.pathname === '/') window.history.replaceState(null,'','/login')
      setSession(next)
    }})
    void db.auth.getSession().then(result=>{if(live&&result.error)setError(result.error.message)})
    return()=>{live=false;subscription.unsubscribe()}
  },[])
  if(!db)return <main className="welcome"><section className="auth-card">{wordmark}<h1>Sign-in is unavailable</h1><p>Please try again later.</p></section></main>
  if(session===undefined)return <main className="welcome"><p role={error?'alert':'status'}>{error||'Checking session…'}</p></main>
  if (!session) return <Auth startRegister={startRegister}/>
  return admin?<Admin db={db} key={session.user.id}/>:<Workspace session={session} key={session.user.id}/>
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/login' || path === '/signup' || (path === '/' && authCallback)) {
    return <Account startRegister={path === '/signup'}/>
  }
  if (path === '/admin') return <Account startRegister={false} admin/>
  const snapshot=path.match(/^\/map\/([0-9a-f-]{36})$/i)
  if(snapshot&&db)return <SharedMap db={db} token={snapshot[1]}/>
  if (path === '/feature-request') return <FeatureRequest/>
  if (path === '/planner') return <PlannerPage/>
  if (isLegalPath(path)) return <LegalPage path={path}/>
  return <Homepage/>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<main className="main" role="status">Loading…</main>}><App/></Suspense></StrictMode>)
