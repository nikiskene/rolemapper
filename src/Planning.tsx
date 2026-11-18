import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorText, type MapData } from './model'
import './planning.css'

type Props = {db:SupabaseClient; workspace:string}
type Row = {id:string}
type Fields = Record<string,FormDataEntryValue>
const today = () => {
  const date = new Date()
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function values(event:FormEvent<HTMLFormElement>):Fields {
  event.preventDefault()
  return Object.fromEntries(new FormData(event.currentTarget))
}
const str = (fields:Fields,key:string) => String(fields[key]??'').trim()
const num = (fields:Fields,key:string) => str(fields,key)===''?null:Number(str(fields,key))
function field(label:string,name:string,value:string|number|null='',type='text',options:Record<string,string|number|boolean>={}) {
  return <label>{label}<input name={name} type={type} defaultValue={value??''} {...options}/></label>
}
function pick(label:string,name:string,value:string,options:string[]) {
  return <label>{label}<select name={name} defaultValue={value}>{options.map(v=><option key={v}>{v}</option>)}</select></label>
}
function useRows<T extends Row>(db:SupabaseClient, workspace:string, table:string, order:string, parent?:string) {
  const [rows,setRows]=useState<T[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [revision,refresh]=useState(0)
  useEffect(()=>{
    let active=true
    async function load() {
      try {
        const collected:T[]=[]
        for(let offset=0;;offset+=500){
          let query=db.from(table).select('*').eq('company_id',workspace).eq('archived',false)
          if(parent) query=query.eq('scenario_id',parent)
          const {data,error}=await query.order(order).order('id').range(offset,offset+499)
          if(error) throw error
          collected.push(...data as unknown as T[])
          if(!active)return
          if(data.length<500)break
        }
        setRows(collected)
      } catch(error) {if(active)setError(errorText(error))}
      finally {if(active)setLoading(false)}
    }
    void load()
    return ()=>{active=false}
  },[db,workspace,table,order,parent,revision])
  async function change(action:()=>PromiseLike<{error:unknown}>,success?:()=>void) {
    setBusy(true);setError('')
    try {
      const {error}=await action()
      if(error)throw error
      refresh(value=>value+1)
      success?.()
    }catch(error){setError(errorText(error))}
    finally{setBusy(false)}
  }
  const update=(id:string, payload:object)=>db.from(table).update(payload).eq('company_id',workspace).eq('id',id)
  const save=(payload:object,id?:string,success?:()=>void)=>change(
    ()=>id?update(id,payload):db.from(table).insert({...payload,company_id:workspace}),success)
  return {rows,error,busy,loading,save,change}
}
function Actions({busy,cancel,children}:{busy:boolean;cancel:()=>void;children?:ReactNode}) {
  return <div className="plan-actions"><button className="primary" disabled={busy}>Save</button><button type="button" onClick={cancel}>Cancel</button>{children}</div>
}
type Handoff=Row & {title:string;owner_key:string;owner_label:string;next_key:string;next_label:string;hours:number;target_date:string|null;notes:string;status:string;completed_on:string|null}
export function Handoffs({db,workspace,map}:{map:MapData}&Props) {
  const store=useRows<Handoff>(db,workspace,'responsibilities','position')
  const [editing,edit]=useState<Handoff|'new'|null>(null)
  const [completing,complete]=useState<Handoff|null>(null)
  const [dragged,drag]=useState<string|null>(null)
  const owners = new Map([
    ...map.people.map(p=>['person:'+p.id,p.name] as const),
    ...map.organizations.map(o=>['partner:'+o.id,o.name+' (partner)'] as const),
    ...map.cards.filter(c=>c.status!=='Filled').map(c=>['role:'+c.id,c.title+' (open role)'] as const),
  ] as [string,string][])
  const actual = new Map([...owners].filter(([key])=>!key.startsWith('role:')))
  const pending=store.rows.filter(h=>h.status!=='Handed off')
  const [rowCount,hours]=[pending.slice(0,3).length,pending.slice(0,3).reduce((sum,h)=>sum+Number(h.hours),0)]
  const move=(item:string,anchor:string,after_anchor:boolean)=>void store.change(()=>db.rpc('move_responsibility',{workspace,item,anchor,after_anchor}))
  function ownerInput(label:string,name:string,key:string,labelBefore:string,available:Map<string,string>) {
    return <label>{label}<select name={name} defaultValue={key}><option value="">Unassigned</option>
      {key&&!available.has(key)&&<option value={key}>{labelBefore} (no longer available)</option>}
      {[...available].map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>
  }
  const h=editing==='new'?null:editing
  return <section className="planning">
    <header className="plan-heading"><div><h2>Handoffs</h2><p>Transfer responsibilities one at a time. Your live map stays as it is.</p></div>
      <button className="primary" onClick={()=>{edit('new');complete(null)}}>+ Add responsibility</button></header>
    {rowCount>0&&<p className="plan-callout">The next {rowCount} {rowCount===1?'handoff represents':'handoffs represent'} <strong>{Number(hours.toFixed(2))} hours per week</strong>.</p>}
    {store.error&&<p role="alert">{store.error}</p>}
    {editing&&<form className="plan-form" onSubmit={e=>{
      const f=values(e), owner_key=str(f,'owner'), next_key=str(f,'next')
      void store.save({title:str(f,'title'),owner_key,owner_label:actual.get(owner_key)??(owner_key?h?.owner_label:''),
        next_key,next_label:owners.get(next_key)??(next_key?h?.next_label:''),hours:num(f,'hours')??0,
        target_date:str(f,'target')||null,notes:str(f,'notes'),status:str(f,'status')||h?.status||'To plan'},h?.id,()=>edit(null))
    }}>
      {field('Responsibility','title',h?.title,'text',{required:true,maxLength:160})}
      {ownerInput('Current owner','owner',h?.owner_key??'',h?.owner_label??'',actual)}
      {ownerInput('Proposed next owner','next',h?.next_key??'',h?.next_label??'',owners)}
      {field('Estimated founder hours per week','hours',h?.hours??0,'number',{min:0,max:168,step:0.01,required:true})}
      {field('Target date','target',h?.target_date,'date')}
      {pick('Status','status',h?.status==='Ready'?'Ready':'To plan',['To plan','Ready'])}
      <label className="plan-wide">Readiness notes<textarea name="notes" defaultValue={h?.notes} maxLength={3000}/></label>
      <Actions busy={store.busy} cancel={()=>edit(null)}/>
    </form>}
    {completing&&<form className="plan-form" onSubmit={e=>{
      const f=values(e),key=str(f,'owner'),label=actual.get(key)
      if(!label)return
      void store.save({status:'Handed off',owner_key:key,owner_label:label,next_key:key,next_label:label,completed_on:str(f,'date')},completing.id,()=>complete(null))
    }}>
      <strong className="plan-wide">Confirm handoff: {completing.title}</strong>
      <label>New owner<select required name="owner" defaultValue={actual.has(completing.next_key)?completing.next_key:''}><option value="">Choose a person or partner</option>{[...actual].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      {field('Handoff date','date',today(),'date',{required:true,max:today()})}
      {actual.size===0&&<p className="plan-wide">Add the new owner to the live map before confirming this handoff.</p>}
      <div className="plan-actions"><button className="primary" disabled={store.busy||!actual.size}>Confirm handoff</button><button type="button" onClick={()=>complete(null)}>Cancel</button></div>
    </form>}
    {store.loading?<p>Loading responsibilities…</p>:!store.rows.length&&!editing&&<p>No responsibilities yet. Add something you want to hand over.</p>}
    <ol className="plan-list">{store.rows.map((r,i)=><li key={r.id} onDragOver={e=>{if(dragged)e.preventDefault()}} onDrop={e=>{
      if(!dragged||store.busy)return
      e.preventDefault();move(dragged,r.id,store.rows.findIndex(row=>row.id===dragged)<i);drag(null)
    }}><div><strong>{r.title}</strong><p>{r.status} · {r.hours} h/week{r.target_date&&' · Target '+r.target_date}{r.completed_on&&' · Completed '+r.completed_on}</p>
      <p>Current: {actual.get(r.owner_key)??(r.owner_key?r.owner_label+' (reassign)':'Unassigned')}
        {r.status!=='Handed off'&&<> · Next: {owners.get(r.next_key)??(r.next_key?r.next_label+' (reassign)':'Unassigned')}</>}</p>{r.notes&&<p>{r.notes}</p>}</div>
      <div className="plan-actions"><span className="plan-grip" draggable onDragStart={e=>{drag(r.id);e.dataTransfer.setData('text/plain',r.id)}} onDragEnd={()=>drag(null)} title="Drag to reorder" aria-hidden="true">⠿</span>
        <button disabled={store.busy||i===0} aria-label={'Move '+r.title+' up'} onClick={()=>move(r.id,store.rows[i-1].id,false)}>↑</button>
        <button disabled={store.busy||i===store.rows.length-1} aria-label={'Move '+r.title+' down'} onClick={()=>move(r.id,store.rows[i+1].id,true)}>↓</button>
        {r.status==='Handed off'?<button disabled={store.busy} onClick={()=>void store.save({status:'To plan',completed_on:null,next_key:'',next_label:''},r.id,()=>{edit(null);complete(null)})}>Reopen</button>:<>
          <button onClick={()=>{edit(r);complete(null)}}>Edit</button><button onClick={()=>{complete(r);edit(null)}}>Hand off</button></>}
        <button disabled={store.busy} onClick={()=>{if(window.confirm('Archive this responsibility?'))void store.save({archived:true},r.id,()=>{edit(null);complete(null)})}}>Archive</button>
      </div></li>)}</ol>
  </section>
}

type Scenario = Row & {name:string;goal:string;target_date:string|null;budget:number|null;budget_currency:string;is_baseline:boolean}
type CostRole = Row & {
  title:string;assignee:string;seniority:string;country:string;region:string;employment:string
  allocation:number;period:string;currency:string;cost_low:number|null;cost_high:number|null;basis:string
  burden:number|null;full_time:boolean;source:string;estimate_date:string|null
}
type Total = {low:number;high:number}
function totals(roles:CostRole[]) {
  const groups = new Map<string,Total>()
  let missing=0
  for(const role of roles){
    if(role.cost_low===null){missing++;continue}
    const burden=role.basis==='Base pay'&&role.burden!==null
    const basis=burden||role.basis==='Contractor fee'?'Employer cost':role.basis
    const factor=(role.period==='Yearly'?1/12:1)*(role.full_time?role.allocation/100:1)*(burden?1+(role.burden??0)/100:1)
    const key=role.currency+' · '+basis
    const g=groups.get(key)??{low:0,high:0}
    groups.set(key,{low:g.low+role.cost_low*factor,high:g.high+(role.cost_high??role.cost_low)*factor})
  }
  return {groups,missing}
}
function amount(low:number,high:number) {
  const show=(value:number)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(Math.round(value*100)/100)
  return show(low)===show(high)?show(low):show(low)+'–'+show(high)
}
function CostSummary({roles,baseline}:{roles:CostRole[];baseline?:CostRole[]}) {
  const current=totals(roles), original=baseline&&totals(baseline)
  const keys=[...new Set([...current.groups.keys(),...(original?.groups.keys()??[])])].sort()
  const comparable=original&&!original.missing&&!current.missing&&keys.length===1
  return <div className="plan-cost">
    {!keys.length&&<p>No cost estimates yet.</p>}
    {!!keys.length&&<div className="plan-table"><table><thead><tr><th>Currency and basis</th>
      {original&&<th>Baseline / month</th>}<th>{original?'Planned':'Baseline'} / month</th><th>Annual total</th>
      {original&&<th>Monthly change</th>}</tr></thead><tbody>{keys.map(key=>{
      const a=original?.groups.get(key), b=current.groups.get(key)
      return <tr key={key}><th scope="row">{key}</th>{original&&<td>{a?amount(a.low,a.high):'—'}</td>}
        <td>{b?amount(b.low,b.high):'—'}</td><td>{b?amount(12*b.low,12*b.high):'—'}</td>
        {original&&<td>{comparable?amount((b?.low??0)-(a?.high??0),(b?.high??0)-(a?.low??0)):'—'}</td>}</tr>
    })}</tbody></table></div>}
    {(current.missing>0||!!original?.missing)&&<p>Partial totals: {current.missing} without estimates{original&&' in this plan; '+original.missing+' in the baseline'}.</p>}
    {original&&!comparable&&!!keys.length&&<p>Monthly change requires complete estimates in the same currency and cost basis.</p>}
    <p>Employer cost includes contractor fees and base pay with a burden rate. Currency subtotals are kept separate.</p>
  </div>
}
const starters:Record<string,string[]> = {
  'Enterprise growth':['Enterprise account lead','Customer success lead','Implementation specialist'],
  'Delivery capacity':['Delivery lead','Operations coordinator','Delivery specialist'],
  'Product development':['Product lead','Software engineer','Product designer'],
}
function RoleForm({role,busy,cancel,save,map}:{role?:Partial<CostRole>;busy:boolean;cancel:()=>void;save:(data:object)=>void;map:MapData}) {
  const [basis,setBasis]=useState(role?.basis??'Employer cost')
  const [validation,setValidation]=useState('')
  return <form className="plan-form" onSubmit={e=>{
    const f=values(e), cost_low=num(f,'low'),cost_high=num(f,'high')
    if(cost_high!==null&&(cost_low===null||cost_high<cost_low)){setValidation('Enter a low estimate first. The high estimate must be at least as large.');return}
    save({title:str(f,'title'),assignee:str(f,'assignee'),seniority:str(f,'seniority'),country:str(f,'country'),
      region:str(f,'region'),employment:str(f,'employment'),allocation:num(f,'allocation'),period:str(f,'period'),
      currency:str(f,'currency').toUpperCase(),cost_low,cost_high,basis,burden:num(f,'burden'),
      full_time:f.full_time==='on',source:str(f,'source'),estimate_date:str(f,'estimate_date')||null})
  }}>
    {field('Role title','title',role?.title,'text',{required:true,maxLength:120})}
    {field('Assigned to','assignee',role?.assignee,'text',{list:'scenario-assignees',maxLength:260,placeholder:'Optional'})}
    <datalist id="scenario-assignees">{[...map.people,...map.organizations].map(p=><option key={p.id} value={p.name}/>)}</datalist>
    {field('Seniority','seniority',role?.seniority,'text',{maxLength:80})}
    {field('Country','country',role?.country,'text',{maxLength:100})}
    {field('City or region','region',role?.region,'text',{maxLength:100})}
    {pick('Employment','employment',role?.employment??'Employee',['Employee','Fractional','Contractor'])}
    {field('Allocation (%)','allocation',role?.allocation??100,'number',{required:true,min:0,max:100,step:0.01})}
    {pick('Estimate period','period',role?.period??'Yearly',['Monthly','Yearly'])}
    {field('Currency code','currency',role?.currency??'USD','text',{pattern:'[A-Za-z]{3}',required:true,maxLength:3})}
    <label>Cost basis<select value={basis} onChange={e=>setBasis(e.target.value)}>{['Employer cost','Base pay','Contractor fee'].map(v=><option key={v}>{v}</option>)}</select></label>
    {field('Estimate or low end','low',role?.cost_low,'number',{min:0,step:0.01,max:999999999999.99})}
    {field('High end (optional)','high',role?.cost_high,'number',{min:0,step:0.01,max:999999999999.99})}
    {basis==='Base pay'&&field('Employer burden (%)','burden',role?.burden,'number',{min:0,max:999.99,step:0.01})}
    <label className="plan-checkbox"><input type="checkbox" name="full_time" defaultChecked={role?.full_time??true}/> Estimate is for full-time work; apply allocation</label>
    {field('Estimate source','source',role?.source,'text',{maxLength:240})}
    {field('Estimate date','estimate_date',role?.estimate_date,'date')}
    {validation&&<p role="alert" className="plan-wide">{validation}</p>}
    <Actions busy={busy} cancel={cancel}/>
  </form>
}
function ScenarioDetail({db,workspace,plan,baseline,map}:{plan:Scenario;baseline?:Scenario;map:MapData}&Props) {
  const store=useRows<CostRole>(db,workspace,'scenario_roles','title',plan.id)
  const comparison=useRows<CostRole>(db,workspace,'scenario_roles','title',baseline?.id??plan.id)
  const [editing,edit]=useState<Partial<CostRole>|null>(null)
  const [template,setTemplate]=useState('')
  return <>
    {(store.error||comparison.error)&&<p role="alert">{store.error||comparison.error}</p>}
    {!store.loading&&(plan.is_baseline||!comparison.loading)&&<CostSummary roles={store.rows} baseline={plan.is_baseline||!baseline?undefined:comparison.rows}/>}
    {plan.is_baseline?<p>This is a private snapshot of filled roles taken when you captured the baseline or created your first scenario. Update its estimates to use them in new scenarios.</p>:
      <div className="plan-actions">
        <button className="primary" onClick={()=>edit({})}>+ Add role</button>
        <label>Starter roles <select value={template} onChange={e=>setTemplate(e.target.value)}><option value="">Choose a goal</option>{Object.keys(starters).map(v=><option key={v}>{v}</option>)}</select></label>
        {starters[template]?.map(title=><button key={title} onClick={()=>edit({title})}>+ {title}</button>)}
      </div>}
    {editing&&!editing.id&&<RoleForm key={editing.title??''} role={editing} map={map} busy={store.busy} cancel={()=>edit(null)}
      save={data=>void store.save({...data,scenario_id:plan.id},undefined,()=>edit(null))}/>}
    {store.loading?<p>Loading roles…</p>:!store.rows.length&&<p>No roles in this snapshot.</p>}
    <ul className="plan-list">{store.rows.map(role=><li key={role.id}>
      <div><strong>{role.title}</strong><p>{role.assignee||'Unassigned'} · {role.employment} · {role.allocation}%
        {role.cost_low===null?' · Estimate missing':' · '+role.currency+' '+amount(role.cost_low,role.cost_high??role.cost_low)+' / '+role.period.toLowerCase()}</p></div>
      <div className="plan-actions"><button onClick={()=>edit(role)}>{plan.is_baseline?'Edit estimate':'Edit role'}</button>
        {!plan.is_baseline&&<button disabled={store.busy} onClick={()=>{if(window.confirm('Remove this role from the scenario?'))void store.save({archived:true},role.id,()=>edit(null))}}>Remove</button>}</div>
      {editing?.id===role.id&&<RoleForm key={role.id} role={role} map={map} busy={store.busy} cancel={()=>edit(null)} save={data=>void store.save(data,role.id,()=>edit(null))}/>}
    </li>)}</ul>
  </>
}
export function Scenarios({db,workspace,map}:{map:MapData}&Props) {
  const store=useRows<Scenario>(db,workspace,'scenarios','created_at')
  const [active,setActive]=useState('')
  const [creating,create]=useState(false)
  const [details,setDetails]=useState(false)
  const baseline=store.rows.find(s=>s.is_baseline)
  const plan=store.rows.find(s=>s.id===active)??baseline
  return <section className="planning">
    <header className="plan-heading"><div><h2>Scenarios</h2><p>Copy the live map, plan a future team and compare it with your current baseline.</p></div>
      <button className="primary" disabled={store.loading||store.busy} onClick={()=>{create(true);setDetails(false)}}>+ New scenario</button></header>
    {store.error&&<p role="alert">{store.error}</p>}
    {store.loading&&<p>Loading scenarios…</p>}
    {!store.loading&&!baseline&&<p className="plan-callout">Capture the current filled roles as your comparison baseline. <button disabled={store.busy} onClick={()=>void store.change(()=>db.rpc('snapshot_scenario',{workspace,plan_name:'Current baseline',baseline:true}))}>Capture baseline</button></p>}
    {creating&&<form className="plan-form" onSubmit={e=>{
      const f=values(e)
      void store.change(async()=>{
        if(!baseline){const result=await db.rpc('snapshot_scenario',{workspace,plan_name:'Current baseline',baseline:true});if(result.error)return result}
        const result=await db.rpc('snapshot_scenario',{workspace,plan_name:str(f,'name'),baseline:false})
        if(!result.error)setActive(result.data)
        return result
      },()=>create(false))
    }}>
      {field('Scenario name','name','','text',{maxLength:120,required:true})}
      <div className="plan-actions"><button className="primary" disabled={store.busy}>Copy live map</button><button type="button" onClick={()=>create(false)}>Cancel</button></div>
    </form>}
    {plan&&<>
      <nav aria-label="Choose a scenario" className="plan-actions plan-tabs">
        {store.rows.map(s=><button className={s.id===plan.id?'primary':''} key={s.id} aria-pressed={s.id===plan.id} onClick={()=>{setActive(s.id);setDetails(false)}}>{s.name}</button>)}
      </nav>
      {!plan.is_baseline&&<div className="plan-meta">
        <div><h3>{plan.name}</h3>{plan.goal&&<p>{plan.goal}</p>}
          <p>{plan.target_date?'Target '+plan.target_date:'No target date'} · {plan.budget===null?'No budget':plan.budget_currency+' '+amount(plan.budget,plan.budget)+' annual budget'}</p></div>
        <div className="plan-actions"><button onClick={()=>setDetails(!details)}>Edit goal and budget</button>
          <button disabled={store.busy} onClick={()=>{if(window.confirm('Archive this scenario?'))void store.save({archived:true},plan.id,()=>{setActive('');setDetails(false)})}}>Archive scenario</button></div>
      </div>}
      {details&&!plan.is_baseline&&<form className="plan-form" key={plan.id} onSubmit={e=>{
        const f=values(e)
        void store.save({name:str(f,'name'),goal:str(f,'goal'),target_date:str(f,'target')||null,budget:num(f,'budget'),
          budget_currency:str(f,'currency').toUpperCase()},plan.id,()=>setDetails(false))
      }}>
        {field('Scenario name','name',plan.name,'text',{required:true,maxLength:120})}
        {field('Target date','target',plan.target_date,'date')}
        {field('Annual budget','budget',plan.budget,'number',{min:0,step:0.01,max:999999999999.99})}
        {field('Budget currency','currency',plan.budget_currency,'text',{pattern:'[A-Za-z]{3}',maxLength:3,required:true})}
        <label className="plan-wide">Growth goal<textarea name="goal" defaultValue={plan.goal} maxLength={3000}/></label>
        <Actions busy={store.busy} cancel={()=>setDetails(false)}/>
      </form>}
      <ScenarioDetail key={plan.id} db={db} workspace={workspace} plan={plan} baseline={baseline} map={map}/>
    </>}
  </section>
}
