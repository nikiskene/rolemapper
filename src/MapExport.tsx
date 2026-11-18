import { useEffect, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errorText, zoneLabel, zones, type Status, type Zone } from './model'

export type DisplayCard = {id:string;zone:Zone;name:string;title:string;status:Status;photoId:string|null}
export type Photos = Record<string,string>

export function mapPageSize(people:number) {
  if(people<=10)return 20
  if(people<=50)return 20
  if(people<=200)return 30
  if(people<=500)return 40
  return 50
}

export function RoleMapLayout({directory,children}:{directory:boolean;children:ReactNode}) {
  return <div className={directory?'map-layout':'map-layout map-scroll'} tabIndex={directory?undefined:0}
    role={directory?undefined:'region'} aria-label={directory?undefined:'Scrollable rolemap'}>
    <div className={'board map-compact '+(directory?'list map-directory':'map-fixed')} aria-label="Company map">
      {children}
    </div>
  </div>
}

export function Avatar({name,src}:{name:string;src?:string}) {
  const initials=name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]||'').join('').toUpperCase()
  return <span className="map-avatar" aria-hidden="true">{src?<img src={src} alt=""/>:initials}</span>
}

export async function prepareHeadshot(file:File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>12_000_000) {
    throw new Error('Choose a JPEG, PNG or WebP image under 12 MB.')
  }
  const image=await createImageBitmap(file)
  try {
    const canvas=document.createElement('canvas')
    const side=Math.min(image.width,image.height)
    canvas.width=canvas.height=192
    const context=canvas.getContext('2d')!
    context.fillStyle='#fff';context.fillRect(0,0,192,192)
    context.drawImage(image,(image.width-side)/2,(image.height-side)/2,side,side,0,0,192,192)
    for(const quality of [.82,.68,.53,.38]){
      const data=canvas.toDataURL('image/jpeg',quality)
      if(data.length<=24000)return data
    }
    throw new Error('This image could not be compressed. Try a smaller crop.')
  } finally {image.close()}
}

export async function ownerPhotos(db:SupabaseClient,workspace:string,ids:string[]) {
  if(!ids.length)return {}
  const {data,error}=await db.from('person_headshots').select('person_id,image').eq('company_id',workspace).in('person_id',ids)
  if(error)throw error
  return Object.fromEntries(data.map(row=>[row.person_id,row.image])) as Photos
}

export function photoIds(cards:DisplayCard[]) {
  return [...new Set(cards.flatMap(card=>card.photoId?[card.photoId]:[]))]
}

function fitted(ctx:CanvasRenderingContext2D,value:string,width:number) {
  if(ctx.measureText(value).width<=width)return value
  const chars=Array.from(value)
  while(chars.length && ctx.measureText(chars.join('')+'…').width>width)chars.pop()
  return chars.join('')+'…'
}

type ImagePage={zone:Zone;name:string;title:string;photoId:string|null;status:Status}[]

export async function makeJpeg(title:string,cards:ImagePage,page:number,total:number,photos:Photos) {
  const grouped=zones.flatMap(([zone])=>{
    const inZone=cards.filter(card=>card.zone===zone)
    return inZone.length?[{zone,cards:inZone}]:[]
  })
  const columns=3
  const canvas=document.createElement('canvas')
  canvas.width=1500
  canvas.height=190+grouped.reduce((height,group)=>height+55+Math.ceil(group.cards.length/columns)*108,0)
  const ctx=canvas.getContext('2d')!
  ctx.fillStyle='#f7f6fb';ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.fillStyle='#30234f';ctx.font='700 50px system-ui';ctx.fillText(fitted(ctx,title,1370),48,84)
  ctx.font='22px system-ui';ctx.fillText('Rolemapper · Page '+page+' of '+total,48,122)
  let y=164
  for(const group of grouped){
    ctx.fillStyle='#4a3478';ctx.font='700 27px system-ui';ctx.fillText(zoneLabel(group.zone)||group.zone,48,y+26)
    y+=46
    for(const [index,card] of group.cards.entries()){
      const x=48+(index%columns)*472, top=y+Math.floor(index/columns)*108
      ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(x,top,454,92,12);ctx.fill()
      const source=card.photoId?photos[card.photoId]:undefined
      if(source){
        const photo=new Image();photo.src=source
        try {
          await photo.decode()
          ctx.save();ctx.beginPath();ctx.arc(x+48,top+46,30,0,Math.PI*2);ctx.clip()
          ctx.drawImage(photo,x+18,top+16,60,60);ctx.restore()
        } catch { /* Keep the tile readable if an image cannot be decoded. */ }
      }
      const textX=x+(source?91:18), maxWidth=440-(textX-x)
      ctx.fillStyle='#30234f';ctx.font='700 24px system-ui';ctx.fillText(fitted(ctx,card.name,maxWidth),textX,top+37)
      ctx.fillStyle='#584d70';ctx.font='20px system-ui'
      ctx.fillText(fitted(ctx,card.name===card.title?card.status:card.title,maxWidth),textX,top+67)
    }
    y+=Math.ceil(group.cards.length/columns)*108+9
  }
  const output=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('JPEG could not be created.')),'image/jpeg',.9))
  const filename=(title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'rolemap')
  return {output,name:filename+(total>1?'-'+page:'')+'.jpg'}
}

export function downloadJpeg(file:{output:Blob;name:string}) {
  const href=URL.createObjectURL(file.output)
  const link=document.createElement('a');link.href=href;link.download=file.name;link.click()
  window.setTimeout(()=>URL.revokeObjectURL(href),5000)
}

export function ExportPanel({db,workspace,title,cards}:{db:SupabaseClient;workspace:string;title:string;cards:DisplayCard[]}) {
  const [token,setToken]=useState('')
  const [includePhotos,setIncludePhotos]=useState(false)
  const [error,setError]=useState('')
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)
  const [confirm,setConfirm]=useState(false)
  const [page,setPage]=useState(1)
  const perImage=48
  const total=Math.ceil(cards.length/perImage)
  const current=Math.min(page,total||1)
  const link=token?window.location.origin+'/map/'+token:''
  useEffect(()=>{
    let alive=true
    void db.rpc('my_map_snapshot',{workspace}).then(({data,error})=>{
      if(!alive)return
      if(error)setError(errorText(error));else setToken(data||'')
    })
    return ()=>{alive=false}
  },[db,workspace])

  async function run(action:()=>Promise<void>) {
    setError('');setStatus('');setBusy(true)
    try {await action()}catch(error){setError(errorText(error))}finally{setBusy(false)}
  }
  return <div className="map-export">
    <p>Export the {cards.length} visible {cards.length===1?'tile':'tiles'}. A shared URL is a snapshot. Anyone with the link can view it until you replace or revoke it.</p>
    <label className="check-line"><input type="checkbox" checked={includePhotos} onChange={event=>setIncludePhotos(event.target.checked)}/> Include headshots</label>
    {total>1&&<label>JPEG page<select value={current} onChange={event=>setPage(Number(event.target.value))}>
      {Array.from({length:total},(_,index)=><option key={index} value={index+1}>{index+1} of {total}</option>)}
    </select></label>}
    <div className="panel-actions">
      <button disabled={busy||!cards.length} onClick={()=>void run(async()=>{
        const selected=cards.slice((current-1)*perImage,current*perImage)
        const photos=includePhotos?await ownerPhotos(db,workspace,photoIds(selected)):{}
        downloadJpeg(await makeJpeg(title,selected,current,total,photos))
      })}>Download JPEG{total>1?' page '+current:''}</button>
      <button className="primary" disabled={busy||!cards.length} onClick={()=>setConfirm(true)}>{token?'Replace shared URL':'Create shared URL'}</button>
    </div>
    {confirm&&<div><p>{token?'Replace the current link and share these visible tiles?':'Share these visible tiles with anyone who has the link?'}</p>
      <p>{includePhotos?'Names, titles, functions, statuses and headshots will be visible.':'Names, titles, functions and statuses will be visible.'}</p>
      <div className="panel-actions"><button disabled={busy} onClick={()=>void run(async()=>{
        const {data,error}=await db.rpc('publish_map_snapshot',{workspace,visible_cards:cards.map(card=>card.id),include_headshots:includePhotos})
        if(error)throw error
        setToken(data);setConfirm(false);setStatus('Shared URL ready.')
      })}>Publish snapshot</button><button disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button></div>
    </div>}
    {link&&<><label>Shared URL<input readOnly value={link} onFocus={event=>event.target.select()}/></label>
      <div className="panel-actions"><button disabled={busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(link);setStatus('Link copied.')})}>Copy link</button>
        <a href={link} target="_blank" rel="noreferrer">Open snapshot</a>
        <button disabled={busy} onClick={()=>void run(async()=>{
          const {error}=await db.rpc('revoke_map_snapshot',{workspace})
          if(error)throw error
          setToken('');setStatus('Shared URL revoked.')
        })}>Revoke link</button></div></>}
    {busy&&<p role="status">Working…</p>}
    {status&&<p role="status">{status}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
  </div>
}

export function SharedMap({db,token}:{db:SupabaseClient;token:string}) {
  const [snapshot,setSnapshot]=useState<{title:string;cards:DisplayCard[]}|null>(null)
  const [finished,setFinished]=useState(false)
  const [page,setPage]=useState(0)
  const [photos,setPhotos]=useState<Photos>({})
  const [list,setList]=useState<boolean|null>(null)
  const [search,setSearch]=useState("")
  const [narrow]=useState(()=>window.matchMedia('(max-width:720px)').matches)
  const pageSize=40
  const all=snapshot?.cards||[]
  const directory=list??(narrow||all.length>20)
  const keyword=search.trim().toLowerCase()
  const matches=all.filter(card=>!keyword||[card.name,card.title,zoneLabel(card.zone)].some(label=>label?.toLowerCase().includes(keyword)))
  const visible=matches.slice(page*pageSize,(page+1)*pageSize)
  const ids=photoIds(visible).join(',')
  useEffect(()=>{
    let alive=true
    async function refresh(){
      const {data,error}=await db.rpc('read_map_snapshot',{share_token:token})
      if(!alive)return
      setSnapshot(error?null:data)
      setFinished(true)
    }
    void refresh()
    const timer=window.setInterval(()=>void refresh(),30000)
    return ()=>{alive=false;window.clearInterval(timer)}
  },[db,token])
  useEffect(()=>{
    let alive=true
    setPhotos({})
    if(ids)void db.rpc('read_map_snapshot_photos',{share_token:token,photo_ids:ids.split(',')})
      .then(({data,error})=>{if(alive&&!error)setPhotos(data)})
    return ()=>{alive=false}
  },[db,token,ids])
  if(!snapshot)return <main className="main"><h1>{finished?'Map unavailable':'Loading map…'}</h1></main>
  return <main className="main">
    <h1>{snapshot.title}</h1><p>Rolemap snapshot · {all.length} placements</p>
    <div className="map-filters"><label>Search this map<input type="search" value={search}
      onChange={event=>{setSearch(event.target.value);setPage(0)}}/></label>
      <button onClick={()=>setList(!directory)}>{directory?'Show map':'Show grouped list'}</button>
    </div>
    {!visible.length&&<p role="status">No tiles match your search.</p>}
    <RoleMapLayout directory={directory}>{zones.map(([zone])=>{
      const cards=visible.filter(card=>card.zone===zone)
      return cards.length>0&&<section className={'zone '+zone} key={zone}><h2>{zoneLabel(zone)}</h2>
        <div className="zone-cards">{cards.map(card=><article className="card shared-tile" key={card.id}>
          <Avatar name={card.name} src={card.photoId?photos[card.photoId]:undefined}/>
          <div><strong>{card.name}</strong><p>{card.title===card.name?card.status:card.title}</p></div>
        </article>)}</div>
      </section>
    })}</RoleMapLayout>
    <MapPager page={page} pages={Math.ceil(matches.length/pageSize)} change={setPage}/>
  </main>
}

export function MapPager({page,pages,change}:{page:number;pages:number;change:(page:number)=>void}) {
  if(pages<=1)return null
  return <nav className="map-pager" aria-label="Map pages">
    <button disabled={page===0} onClick={()=>change(page-1)}>Previous</button>
    <span>Page {page+1} of {pages}</span>
    <button disabled={page>=pages-1} onClick={()=>change(page+1)}>Next</button>
  </nav>
}
