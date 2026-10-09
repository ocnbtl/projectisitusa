const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('C:/Users/Ocean/.codex/visualizations/2026/09/05/01a06f1e-a9ed-77c2-8c4e-21213ababf8b/participation-verification-20260928/deps/node_modules/@electric-sql/pglite');
const root=process.cwd();
(async()=>{
 const db=new PGlite(); const report={engine:'PGlite 0.5.8 in-memory PostgreSQL',scope:'Real local SQL execution with minimal auth/storage fixture schemas. NOT Supabase Auth/Storage integration or deployment verification.',schema:[],tests:[]};
 try {
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),created_at timestamptz,updated_at timestamptz,aal text);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
    GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated,service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON storage.objects TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
  for(const file of ['01-core.sql','02-workflows.sql','03-support-and-campaigns.sql','04-capacity.sql','05-identification.sql','06-campaign-editing.sql']){await db.exec(fs.readFileSync(path.join(root,'supabase/schema',file),'utf8'));report.schema.push(file);console.log('SCHEMA PASS '+file);}
  for(const file of ['authorization.sql','transactions.sql','delivery-quota.sql']){await db.exec(fs.readFileSync(path.join(root,'tests/participation',file),'utf8'));report.tests.push(file);console.log('TEST PASS '+file);}
  await db.exec(fs.readFileSync(path.join(__dirname,'roles-capacity.sql'),'utf8'));report.tests.push('roles-capacity.sql');console.log('TEST PASS roles-capacity.sql');
  await db.exec(fs.readFileSync(path.join(__dirname,'campaign-editing.sql'),'utf8'));report.tests.push('campaign-editing.sql');console.log('TEST PASS campaign-editing.sql');
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema/07-organization-work.sql'),'utf8'));report.schema.push('07-organization-work.sql');
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema/08-work-completion.sql'),'utf8'));report.schema.push('08-work-completion.sql');
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema/09-campaign-feedback.sql'),'utf8'));report.schema.push('09-campaign-feedback.sql');
  await db.exec(fs.readFileSync(path.join(__dirname,'organization-work.sql'),'utf8'));report.tests.push('organization-work.sql');console.log('TEST PASS organization-work.sql');
  report.status='passed';
 }catch(e){report.status='failed';report.error={message:e.message,code:e.code,detail:e.detail,where:e.where,position:e.position};console.error(JSON.stringify(report.error));process.exitCode=1;}
 finally{await db.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'sql-report.json'),JSON.stringify(report,null,2));}
})();
