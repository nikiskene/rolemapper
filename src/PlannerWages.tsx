import { useEffect, useState } from 'react'
import { amountText, locations, marketNames, type Wage, type WageData } from './internationalWages'

export function useWageData(enabled:boolean) {
  const [data,setData] = useState<WageData>({})
  const [failed,setFailed] = useState<string[]>([])
  const [loaded,setLoaded] = useState(false)
  useEffect(()=>{
    if(!enabled||loaded) return
    const controller = new AbortController()
    const sources = [
      ['canada','canada','Canada'], ['london','london','London'], ['ukNational','uk-national','United Kingdom'],
      ['singapore','singapore','Singapore'], ['austria','austria','Austria'],
    ] as const
    const signal = AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])
    void Promise.allSettled(sources.map(async ([key,file])=>{
      const response = await fetch('/wages/'+file+'.json',{signal})
      if(!response.ok) throw new Error(file)
      const rows = await response.json()
      return [key,rows] as const
    })).then(results=>{
      if(controller.signal.aborted) return
      setFailed(results.flatMap((result,index)=>result.status==='rejected'?[sources[index][2]]:[]))
      setData(Object.fromEntries(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])))
      setLoaded(true)
    })
    return ()=>controller.abort()
  },[enabled,loaded])
  return {data,failed,loaded}
}

export function MarketChoices({inherit=false}:{inherit?:boolean}) {
  return <>
    <option value="">{inherit?'Use the default hiring market':'Choose a hiring market (optional)'}</option>
    <option value="us">United States</option>
    {marketNames.map(value=><option key={value}>{value}</option>)}
    <option value="remote">Remote across markets</option><option value="other">Other market</option>
  </>
}

export function LocationInput({id,market,city,change,data}:{id:string;market:string;city:string;change:(city:string)=>void;data:WageData}) {
  const choices = locations(market,data)
  return <>
    <label>{market==='other'?'City and country':'City or region'}<input value={city} list={choices.length?id:undefined}
      onChange={event=>change(event.target.value)} maxLength={100}/></label>
    {!!choices.length&&<datalist id={id}>{choices.map(value=><option key={value} value={value}/>)}</datalist>}
  </>
}

const periodLabel = {hour:'hour',month:'month',year:'year'}
const wageText = (wage:Wage,value:number) => {
  const amount = wage.period==='hour'
    ? wage.currency+' '+new Intl.NumberFormat('en',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)
    : amountText(wage.currency,value)
  return amount+'/'+periodLabel[wage.period]
}
const comparable = (value:string) => value.toLowerCase().trim()
export function WageDetails({wage,role,proxy,hours,weeks}:{wage:Wage;role:string;proxy:boolean;hours:number;weeks:number}) {
  const quality = proxy?'User-selected proxy':comparable(role)===comparable(wage.title)?'Exact title':'Broader occupation match'
  return <>
    <p><strong>{wageText(wage,wage.amount)} {wage.statistic}</strong> · {wage.geography}</p>
    <details>
      <summary>How we calculated this</summary>
      <p>{quality} · {wage.title}{wage.code&&' · '+wage.code}</p>
      {wage.low!==null&&wage.high!==null&&<p>{wage.range} · {wageText(wage,wage.low)} to {wageText(wage,wage.high)}</p>}
      {wage.basic?.[0]!=null&&<p>Basic monthly wage · {amountText(wage.currency,wage.basic[0])} median
        {wage.basic[1]!=null&&wage.basic[2]!=null&&' · '+amountText(wage.currency,wage.basic[1])+' to '+amountText(wage.currency,wage.basic[2])+' (P25–P75)'}</p>}
      <p>{wage.basis}{wage.period==='hour'&&' Annualized at '+hours+' hours per week and '+weeks+' paid weeks per year before allocation.'}</p>
      {wage.notes&&<p>{wage.notes}</p>}
      <p><a href={wage.url} target="_blank" rel="noreferrer">{wage.publisher}</a> · {wage.reference}
        </p>
      {wage.licence&&<p><a href={wage.licence} target="_blank" rel="noreferrer">{wage.attribution??'Reuse terms'}</a></p>}
    </details>
  </>
}

export type HireInput = {market?:string;city?:string;allocation?:string;burden?:string;proxy?:string;manual?:Record<string,string>}
export type PlannedHire = {
  id:string; role:string; named:boolean; market:string; city:string; currency:string; input:HireInput
  options:Wage[]; wage?:Wage; needsProxy:boolean; assumption:number|null; assumptionSource:string; employer:number|null
}
export function HireWageFields({hire,data,hours,weeks,manual,change}:{hire:PlannedHire;data:WageData;hours:number;weeks:number;manual:string;change:(values:Partial<HireInput>)=>void}) {
  const {id,role,input,currency,market,city,wage,options,needsProxy} = hire
  return <div className="site-sources">
    <strong>{role}</strong>
    <label>Hiring market for {role}<select value={input.market??''} onChange={event=>change({market:event.target.value||undefined,city:undefined,proxy:undefined})}><MarketChoices inherit/></select></label>
    {input.market&&<LocationInput id={'wage-'+id} market={market} city={city} change={value=>change({city:value,proxy:undefined})} data={data}/>}
    <label>Allocation for {role} (%)<input type="number" min="1" max="100" step="1" required value={input.allocation??'100'} onChange={event=>change({allocation:event.target.value})}/></label>
    <label>Employer costs for {role} (% of wage)<input type="number" min="0" max="300" step="0.1"
      value={input.burden??''} onChange={event=>change({burden:event.target.value})} placeholder="Use the default assumption"/></label>
    {needsProxy&&options.length>0&&<label>Comparable occupation for {role}<select value={input.proxy??''} onChange={event=>change({proxy:event.target.value})}>
      <option value="">Choose a group that fits the duties</option>
      {options.map(option=><option key={option.title}>{option.title}</option>)}
    </select></label>}
    {wage?<WageDetails wage={wage} role={role} proxy={needsProxy} hours={hours} weeks={weeks}/>
      :<p>Enter a local estimate{needsProxy&&options.length?' or choose a comparable occupation above':''}.</p>}
    <label>Monthly wage override for {role} ({currency})<input type="number" min="0" max="10000000" step="0.01"
      value={manual} onChange={event=>change({manual:{...input.manual,[currency]:event.target.value}})} placeholder="Full-time monthly amount"/></label>
    {manual!==''&&wage&&<button type="button" className="site-button secondary" onClick={()=>change({manual:{...input.manual,[currency]:''}})}>Restore published wage</button>}
  </div>
}
