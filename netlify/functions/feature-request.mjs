import { createClient } from '@supabase/supabase-js'

export const config = {
  path: '/api/feature-request',
  rateLimit: { action:'rate_limit', windowLimit:4, windowSize:60, aggregateBy:['ip','domain'] },
}

const limits = {headline:100, description:1000, benefit:700}
const respond = (body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}})

export default async function submit(request) {
  if(request.method!=='POST')return respond({error:'Use POST.'},405)
  if(request.headers.get('origin')!==new URL(request.url).origin)return respond({error:'Open the Rolemapper feature request form.'},403)
  if(!request.headers.get('content-type')?.startsWith('application/json'))return respond({error:'Invalid submission.'},400)

  let body
  try {
    const raw=await request.text()
    if(raw.length>15000)return respond({error:'Your request is too long.'},413)
    body=JSON.parse(raw)
  } catch { return respond({error:'Invalid submission.'},400) }
  if(body?.website)return respond({ok:true})
  const fields={}
  for(const [name,limit] of Object.entries(limits)){
    const value=typeof body?.[name]==='string'?body[name].trim():''
    if(!value||value.length>limit)return respond({error:'Complete all three fields within their character limits.'},400)
    fields[name]=value
  }
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key)return respond({error:'The inbox is temporarily unavailable. Try again shortly.'},503)
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {error}=await db.rpc('submit_feature_request',fields)
  if(error){
    console.error('Could not save feature request.',error.code)
    return respond({error:'The inbox is temporarily unavailable. Try again shortly.'},503)
  }
  return respond({ok:true},201)
}
