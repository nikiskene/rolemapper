import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { must, sampleFields } from '../scripts/sample.mjs'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
function client() {
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}

test('Supabase Auth and REST isolate real signed-in owners and anonymous callers', async () => {
  assert.ok(url && key && ['127.0.0.1','localhost'].includes(new URL(url).hostname), 'Use a local Supabase instance with email confirmations disabled.')
  async function owner() {
    const db=client()
    const credentials={email:`test-${randomUUID()}@example.com`, password:randomUUID()}
    must(await db.auth.signUp(credentials))
    const {session}=must(await db.auth.signInWithPassword(credentials))
    assert.ok(session)
    return db
  }
  async function workspace(db,name) {
    const company=must(await db.rpc('create_company',{company_name:name}))
    const card=must(await db.rpc('save_card',{workspace:company,card:null,fields:sampleFields({person_name:name,organization_name:name+' Labs',email:'private@example.com'})}))
    const placement=must(await db.from('placements').select('*').eq('id',card).single())
    return {company,card,placement}
  }
  const [a,b]=await Promise.all([owner(),owner()])
  const [wa,wb]=await Promise.all([workspace(a,'Alice'),workspace(b,'Bob')])
  const tables=['companies','maps','people','organizations','placements']
  for (const [db,own,other] of [[a,wa,wb],[b,wb,wa]]) {
    for (const table of tables) {
      const companyColumn=table==='companies'?'id':'company_id'
      assert.equal(must(await db.from(table).select('*').eq(companyColumn,own.company)).length,1)
      assert.deepEqual(must(await db.from(table).select('*').eq(companyColumn,other.company)),[])
    }
    for (const [table,otherId,column] of [
      ['placements',other.card,'title'],['people',other.placement.person_id,'name'],['organizations',other.placement.organization_id,'name']
    ]) {
      assert.deepEqual(must(await db.from(table).update({[column]:'Forbidden edit'}).eq('id',otherId).select('id')),[])
      assert.deepEqual(must(await db.from(table).delete().eq('id',otherId).select('id')),[])
    }
    assert.equal((await db.from('people').insert({company_id:other.company,name:'Forbidden person'})).error?.code,'42501')
    assert.equal((await db.rpc('move_card',{workspace:other.company,card:other.card,target:'team'})).error?.code,'42501')
    assert.equal((await db.rpc('save_card',{workspace:other.company,card:other.card,fields:sampleFields()})).error?.code,'42501')
    assert.equal((await db.from('placements').insert({company_id:own.company,zone:'team',rank:0,title:'Invalid link',status:'Filled',person_id:other.placement.person_id})).error?.code,'23503')
    assert.equal((await db.from('placements').insert({company_id:own.company,zone:'team',rank:0,title:'Invalid link',status:'Filled',organization_id:other.placement.organization_id})).error?.code,'23503')
  }
  const visitor=client()
  for (const table of tables) assert.equal((await visitor.from(table).select('*')).error?.code,'42501')
  assert.ok((await visitor.rpc('create_company',{company_name:'Anonymous'})).error)
  must(await a.rpc('move_card',{workspace:wa.company,card:wa.card,target:'team'}))
  const after=must(await a.from('placements').select('zone').eq('id',wa.card).single())
  assert.equal(after.zone,'team')
})
