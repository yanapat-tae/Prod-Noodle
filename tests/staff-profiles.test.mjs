import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const operation=readFileSync(new URL('../supabase/operations/20261011_requested_staff_profiles.sql',import.meta.url),'utf8');
const people=[['d5441734-6746-4dd5-beb9-e27c30565901','yanapat1999@gmail.com'],['dfee2d4e-8ab3-4e03-a214-33fceba5a1d6','pimcharat.c@gmail.com'],['ae815ee5-845e-4159-a649-fe8687254981','sittichaicherdkiattikul@gmail.com'],['3853da58-9bd4-457c-97cf-97e060201954','kyi.27@icloud.com'],['c74251bb-cc92-4f69-ab1c-5614b687947f','prang.kantarat@gmail.com'],['74d32d1a-6eaf-4610-8e6d-d14186583baa','prang.kantarat@hotmail.com']];
test('Requested profiles use existing exact Auth users, preserve other users and repeat safely; mismatch rolls back',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique);create table public.admins(auth_user_id uuid primary key references auth.users(id),account_slot integer unique check(account_slot between 1 and 6),display_name text,role text,is_active boolean default true);`);
 for(const person of people)await db.query('insert into auth.users values($1,$2)',person);
 for(let i=0;i<2;i++)await db.query("insert into public.admins values($1,$2,'Original','owner',true)",[people[i][0],i+1]);
 await db.query("update auth.users set email='mismatch@example.com' where id=$1",[people[3][0]]);
 await assert.rejects(()=>db.exec(operation),/Email\/UID mismatch/);await db.exec('rollback');
 assert.equal((await db.query('select * from public.admins')).rows.length,2);
 await db.query('update auth.users set email=$2 where id=$1',people[3]);
 await db.exec(operation);const first=(await db.query('select * from public.admins order by account_slot')).rows;
 assert.deepEqual(first.map(a=>[a.display_name,a.role]),[['เต้','owner'],['ปลั๊ก','owner'],['พ่อ','admin'],['ฟ้า','admin'],['พี่ปราง','owner'],['แม่','admin']]);
 await db.exec(operation);assert.deepEqual((await db.query('select * from public.admins order by account_slot')).rows,first);
 assert.equal((await db.query('select * from auth.users')).rows.length,6);
 }finally{await db.close();}
});
