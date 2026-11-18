import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { sampleFields } from '../scripts/sample.mjs'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const tables = ['companies','maps','people','organizations','placements']

test('private map isolation in Postgres: two owners, anonymous role, scoped foreign keys and transactional moves', async () => {
  const db = new PGlite()
  try {
    // Reproduce Supabase's API roles and auth.uid() claim lookup; execute the real migration.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      insert into auth.users values ('${A}'), ('${B}');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261118000100_private_map.sql',import.meta.url),'utf8'))
    const as = async (uid, role='authenticated') => {
      await db.exec(`set role ${role}`)
      await db.query("select set_config('request.jwt.claim.sub', $1, false)",[uid])
    }
    const value = async (sql, args=[]) => (await db.query(sql,args)).rows[0]?.value
    const company = name => value('select public.create_company($1) as value',[name])
    const save = (id,fields,card=null) => value('select public.save_card($1,$2,$3::jsonb) as value',[id,card,JSON.stringify(sampleFields(fields))])
    const move = (id,card,zone,anchor=null) => value('select public.move_card($1,$2,$3,$4)',[id,card,zone,anchor])

    await as(A)
    const a = await company('Alice work')
    const aSecondCompany = await company('Alice second workspace')
    const aCard = await save(a, { email:'founder@fictional.example' })
    const aPerson = await value('select person_id as value from public.placements where id=$1',[aCard])
    const aOrg = await save(a,{zone:'partner-right', title:'Legal', organization_name:'Imaginary Counsel', person_name:''})
    assert.equal(await value('select count(*)::int as value from public.maps where company_id=$1',[aSecondCompany]),1)

    await as(B)
    const b = await company('Bob work')
    const bCard = await save(b,{person_name:'Bob Ames',organization_name:'Bob Labs',email:'secret@fictional.example'})
    const bRow = (await db.query('select * from public.placements where id=$1',[bCard])).rows[0]
    assert.equal(await value('select email as value from public.people where id=$1',[bRow.person_id]),'secret@fictional.example')
    assert.deepEqual((await db.query('select id from public.companies')).rows,[{id:b}])
    await assert.rejects(() => move(a,aOrg,'team'),{code:'42501'})

    await as(A)
    for(const table of tables) {
      assert.equal(await value(`select count(*)::int as value from public.${table} where ${table==='companies'?'id':'company_id'}=$1`,[b]),0)
    }
    for(const [table,otherId,column] of [['people',bRow.person_id,'name'],['organizations',bRow.organization_id,'name'],['placements',bCard,'title']]) {
      assert.equal((await db.query(`update public.${table} set ${column}='Changed' where id=$1`,[otherId])).affectedRows,0)
      assert.equal((await db.query(`delete from public.${table} where id=$1`,[otherId])).affectedRows,0)
    }
    await assert.rejects(()=>db.query("insert into public.people(company_id,name) values ($1,'Wrong')",[b]),{code:'42501'})
    await assert.rejects(()=>db.query("insert into public.organizations(company_id,name) values ($1,'Wrong')",[b]),{code:'42501'})
    await assert.rejects(()=>db.query("insert into public.placements(company_id,zone,rank,title,status) values ($1,'team',0,'Wrong','Open')",[b]),{code:'42501'})
    await assert.rejects(()=>db.query('update public.placements set company_id=$1 where id=$2',[b,aCard]),{code:'42501'})
    await assert.rejects(()=>db.query('update public.companies set owner_id=$1 where id=$2',[B,a]),{code:'42501'})
    await assert.rejects(()=>save(b,{}),{code:'42501'})
    await assert.rejects(()=>save(a,{},bCard),{code:'42501'})
    assert.equal(await value('select count(*)::int as value from public.people where company_id=$1',[a]),1)
    await assert.rejects(()=>save(a,{person_id:bRow.person_id,person_name:''}),{code:'23503'})
    await assert.rejects(()=>save(a,{organization_id:bRow.organization_id}),{code:'23503'})
    await assert.rejects(()=>move(a,bCard,'team'),{code:'42501'})
    await assert.rejects(()=>move(a,aCard,'founder',bCard),/destination changed/)
    await assert.rejects(()=>save(a,{linkedin:'javascript:alert(1)'}),{code:'23514'})
    const backup = await save(a,{zone:'team',title:'Acting CFO',person_id:aPerson,bio:'Two roles, one record.'})
    await move(a,aOrg,'team',backup)
    await move(a,backup,'team',aOrg)
    assert.deepEqual((await db.query("select id from public.placements where company_id=$1 and zone='team' order by rank,id",[a])).rows,[{id:backup},{id:aOrg}])
    assert.equal(await value('select count(distinct person_id)::int as value from public.placements where company_id=$1',[a]),1)

    await as(B)
    assert.equal(await value('select title as value from public.placements where id=$1',[bCard]),'Founder')
    assert.equal(await value('select name as value from public.organizations where id=$1',[bRow.organization_id]),'Bob Labs')

    await as('', 'anon')
    for(const table of tables) await assert.rejects(()=>db.query(`select * from public.${table}`),{code:'42501'})
    await assert.rejects(()=>company('Anonymous'),{code:'42501'})
    await assert.rejects(()=>move(a,aCard,'team'),{code:'42501'})
    await assert.rejects(()=>save(a,{}),{code:'42501'})
  } finally { await db.close() }
})
