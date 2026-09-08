#!/usr/bin/env python3
"""Independent EPA 2013/2014 original-byte review. Python standard library.
Run python review.py --verify [--repo ROOT]. No network requests or shared edits.
Verification recomputes the full review and reproduces exact proposal bytes;
original process telemetry is replayed as historical execution data, not as a
claim to have reproduced an earlier duration. No project adapter is imported.
"""
import argparse, base64, collections, csv, ctypes, datetime as dt, gzip, hashlib
import io, json, math, pathlib, re, subprocess, sys, time
PAIRS = ['05001:ctenopharyngodon-idella', '05077:cyprinus-carpio', '05105:cyprinus-carpio', '06007:salmo-trutta', '08033:salmo-trutta', '08103:salmo-trutta', '08125:cyprinus-carpio', '12073:cyprinus-carpio', '12111:pterygoplichthys-disjunctivus', '12115:oreochromis-aureus', '13067:ctenopharyngodon-idella', '13077:cyprinus-carpio', '13135:salmo-trutta', '13271:cyprinus-carpio', '16021:salmo-trutta', '16047:cyprinus-carpio', '16075:cyprinus-carpio', '17057:cyprinus-carpio', '17061:hypophthalmichthys-molitrix', '17171:cyprinus-carpio', '19047:ctenopharyngodon-idella', '19047:hypophthalmichthys-molitrix', '19091:cyprinus-carpio', '19139:cyprinus-carpio', '19155:ctenopharyngodon-idella', '20013:ctenopharyngodon-idella', '20041:cyprinus-carpio', '20123:cyprinus-carpio', '20209:cyprinus-carpio', '21103:cyprinus-carpio', '21171:cyprinus-carpio', '21183:cyprinus-carpio', '22009:ctenopharyngodon-idella', '22019:cyprinus-carpio', '22069:cyprinus-carpio', '22113:cyprinus-carpio', '24005:salmo-trutta', '25011:cyprinus-carpio', '25017:salmo-trutta', '26005:salmo-trutta', '26047:cyprinus-carpio', '26081:neogobius-melanostomus', '26103:salmo-trutta', '26159:salmo-trutta', '27035:cyprinus-carpio', '27045:cyprinus-carpio', '27085:cyprinus-carpio', '27103:cyprinus-carpio', '27163:cyprinus-carpio', '28095:cyprinus-carpio', '29031:ctenopharyngodon-idella', '29107:cyprinus-carpio', '29107:hypophthalmichthys-nobilis', '29183:ctenopharyngodon-idella', '29186:hypophthalmichthys-nobilis', '29223:cyprinus-carpio', '30021:cyprinus-carpio', '30041:cyprinus-carpio', '30055:cyprinus-carpio', '30065:cyprinus-carpio', '30071:cyprinus-carpio', '30105:cyprinus-carpio', '31031:salmo-trutta', '31041:cyprinus-carpio', '31095:cyprinus-carpio', '31125:cyprinus-carpio', '31145:cyprinus-carpio', '31177:hypophthalmichthys-nobilis', '32005:cyprinus-carpio', '34027:cyprinus-carpio', '35005:salmo-trutta', '35045:cyprinus-carpio', '35047:cyprinus-carpio', '36009:salmo-trutta', '36017:salmo-trutta', '36021:cyprinus-carpio', '36033:salmo-trutta', '36053:salmo-trutta', '36101:salmo-trutta', '36113:salmo-trutta', '37047:cyprinus-carpio', '37183:cyprinus-carpio', '38017:cyprinus-carpio', '38081:cyprinus-carpio', '38097:cyprinus-carpio', '39039:cyprinus-carpio', '39077:cyprinus-carpio', '39147:cyprinus-carpio', '40091:ctenopharyngodon-idella', '41055:cyprinus-carpio', '44009:salmo-trutta', '45041:ctenopharyngodon-idella', '46005:hypophthalmichthys-nobilis', '46035:cyprinus-carpio', '46079:cyprinus-carpio', '48029:cyprinus-carpio', '48051:ctenopharyngodon-idella', '48113:cyprinus-carpio', '48145:cyprinus-carpio', '48213:cyprinus-carpio', '48407:ctenopharyngodon-idella', '48423:cyprinus-carpio', '49015:cyprinus-carpio', '49033:salmo-trutta', '50005:salmo-trutta', '51083:cyprinus-carpio', '51155:cyprinus-carpio', '53071:cyprinus-carpio', '54031:cyprinus-carpio', '55069:cyprinus-carpio', '55097:salmo-trutta', '56011:salmo-trutta', '56017:cyprinus-carpio', '56019:cyprinus-carpio', '56025:cyprinus-carpio', '56037:cyprinus-carpio']
PINS = [{'name': 'isitusa-national-orchestrator', 'version': 'frozen-windows-bulk-validation-2026-07-30-r2', 'gitCommit': 'e3513cc6bde303432320d1d3904ea638eec6333c', 'contentHash': '9f934116bc4f1ad80b3b61d805f4ad4c0070773ed3040c28e96098c74d888757'}, {'name': 'isitusa-evidence-worker', 'version': 'frozen-windows-bulk-validation-2026-07-30-r2', 'gitCommit': 'e3513cc6bde303432320d1d3904ea638eec6333c', 'contentHash': '52f13ef7e2574a6428701c0fcc9d0512e313fe639adf826888490ce5a38a6b8b'}]
LOCAL_PINS = {'src/data/research/county-equivalent-registry.json': {'bytes': 1972613, 'sha256': '50eede46823aa219ae3b22739224067e1de102fefd336d033bddb01b7f5501ee'}, 'src/data/source/county-equivalents-topology.json': {'bytes': 1801704, 'sha256': '71bcbd0571137d470e667da72a4bfd1487e542486a085dbdfded2625fdb5166a'}, 'src/data/generated/species.json': {'bytes': 5738579, 'sha256': 'fb82d2c2f0c4ae031569a3bcb472e2e9d8a1a15fac1e7a12a9e7583776df5233'}, 'src/data/research/source-registry.json': {'bytes': 71978, 'sha256': 'cc3b9b5460625d06ca1d281af83efc533f06067e6286a40619a6a4e7631c0244'}}
JOB = 'epa-nrsa-1314-source-review-a-20260908-r21'
ACTOR = 'epa_nrsa_1314_review_a_r21'
BASE = '9dbecd70fcfb81e326ebd1d9982ef94883a97563'
LEASE = 'lease-epa-nrsa-1314-source-review-a-20260908-r21-1'

ARCHIVE='ops/national-research/evaluations/artifacts/epa-nrsa-1314-preflight-20260908-r21.json.gz'
ARCHIVE_SHA='631dab66cfd6b50bb918090d5b50a12e1bce6f544ccc6a0ea4e248244ebd975e'
REQUESTS=[
 {'number':1,'type':'search','query':'site.nas.er.usgs.gov Pterygoplichthys disjunctivus hybrids pardalis Florida','result':'Results returned; USGS 2012 primary study and FWS synthesis identified.'},
 {'number':2,'type':'search','query':'site.fs.usda.gov "Rio Penasco" "Otero"','result':'Results returned; NRCS Upper Rio Penasco watershed page identified.'},
 {'number':3,'type':'search','query':'site.fs.usda.gov "Butte Creek" "Butte Meadows" Plumas','result':'Results returned; no exact-site contradiction established.'},
 {'number':4,'type':'open','url':'https://www.usgs.gov/publications/discovery-south-american-suckermouth-armored-catfishes-loricariidae-pterygoplichthys','result':'Rendered primary publication summary dated 2012-10-17; HTTP status not exposed.'},
 {'number':5,'type':'open','url':'https://www.nrcs.usda.gov/state-offices/new-mexico/upper-rio-penasco-watershed-sites-dams-1-2-3a','result':'Rendered NRCS page; HTTP status not exposed. Describes Otero dams, not this sample.'},
 {'number':6,'type':'search','query':'site.nas.er.usgs.gov "Pterygoplichthys disjunctivus" "Florida" "taxonomic"','result':'Results returned, including a taxonomic review and FWS regional identity discussion.'},
 {'number':7,'type':'search','query':'site.fws.gov "Pterygoplichthys disjunctivus" "hybrids"','result':'Results returned; FWS Amazon Sailfin Catfish PDF search extraction discussed introduced Florida species concepts.'},
 {'number':8,'type':'open','url':'https://nas.er.usgs.gov/queries/FactSheet.aspx?speciesID=767','result':'Failed fetch: HTTP 403 Forbidden. No retry or evidence inference.'}
]
CONTEXT=[
 {'id':'usgs-2012-plecos','url':REQUESTS[3]['url'],'publisher':'U.S. Geological Survey','title':'Discovery of South American suckermouth armored catfishes in the Santa Fe River drainage','publicationDate':'2012-10-17','doi':'10.3391/bir.2012.1.3.04','inspection':'Rendered page lines 6-9','finding':'The primary study reports specimens resembling disjunctivus and a possible disjunctivus-pardalis hybrid; it describes disjunctivus or hybrids as widespread in peninsular Florida. Regional taxonomic context is not a reassessment of EPA UID 1003467.'},
 {'id':'fws-florida-pleco-concept','url':'https://www.fws.gov/sites/default/files/documents/Ecological-Risk-Screening-Summary-Amazon-Sailfin-Catfish.pdf','publisher':'U.S. Fish and Wildlife Service','title':'Ecological Risk Screening Summary: Amazon Sailfin Catfish','inspection':'Search extraction only, citing Godwin et al. 2016, Wu et al. 2011 and Gestring et al. 2010; PDF itself was not opened','finding':'The agency synthesis explicitly discusses introduced peninsular Florida populations identified as pardalis or disjunctivus, a likely hybrid introduction, and unresolved morphological species limits. This regional species-concept problem supports a conservative exact-species hold pending identification provenance; it does not establish that the seven EPA fish were hybrids.'},
 {'id':'nrcs-upper-penasco','url':REQUESTS[4]['url'],'publisher':'USDA Natural Resources Conservation Service','title':'Upper Rio Penasco Watershed - Sites (Dams) 1, 2, and 3A','inspection':'Rendered page lines 17-19','finding':'Specific Upper Rio Penasco dams are in Otero County. This does not locate EPA UID 1003486. Its coordinates are within pinned Chaves topology, so the shared river name is not a material contradiction.'}
]
def sha(b):return hashlib.sha256(b).hexdigest()
def norm(s):return ' '.join(s.split()).casefold()
def utc():return dt.datetime.now(dt.timezone.utc).isoformat()
def peak_mb():
 if sys.platform=='win32':
  class PMC(ctypes.Structure):
   _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(n,ctypes.c_size_t) for n in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
  p=PMC();p.cb=ctypes.sizeof(p);kernel=ctypes.WinDLL('kernel32');api=ctypes.WinDLL('psapi')
  kernel.GetCurrentProcess.restype=ctypes.c_void_p
  api.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.POINTER(PMC),ctypes.c_ulong]
  assert api.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(p),p.cb)
  return round(p.PeakWorkingSetSize/1048576,3)
 import resource
 return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/(1048576 if sys.platform=='darwin' else 1024),3)
def parse_csv(raw,label,encoding):
 physical=raw.splitlines(keepends=True);assert b''.join(physical)==raw
 text=raw.decode(encoding,errors='strict');assert text.encode(encoding)==raw
 reader=csv.reader(io.StringIO(text,newline=''),strict=True);header=next(reader);previous=reader.line_num
 assert len(header)==len(set(header));head=b''.join(physical[:previous]);records=[]
 for index,values in enumerate(reader):
  end=reader.line_num;original=b''.join(physical[previous:end]);assert len(values)==len(header),(label,index)
  ending='CRLF' if original.endswith(b'\r\n') else 'LF' if original.endswith(b'\n') else 'CR' if original.endswith(b'\r') else 'none'
  records.append({'artifact':label,'dataRowIndexZeroBased':index,'csvRecordOneBasedIncludingHeader':index+2,'physicalStartLineOneBased':previous+1,'physicalEndLineOneBased':end,'originalRowBytes':len(original),'originalTerminator':ending,'rawRowSha256IncludingTerminator':sha(original),'rawRowBase64IncludingTerminator':base64.b64encode(original).decode('ascii'),'fields':dict(zip(header,values))});previous=end
 assert previous==len(physical)
 return records,{'encoding':encoding,'byteReversible':True,'rowCount':len(records),'physicalLineCount':len(physical),'header':header,'headerSha256IncludingTerminator':sha(head),'rowTerminatorCounts':dict(collections.Counter(r['originalTerminator'] for r in records)),'nonAsciiByteCounts':{str(k):v for k,v in sorted(collections.Counter(n for n in raw if n>127).items())}}
def fips(v):
 if re.fullmatch(r'[0-9]{5}',v):return v
 if re.fullmatch(r'[0-9]{4}',v):return '0'+v
 return None
def date(v):
 try:return dt.datetime.strptime(v,'%m/%d/%Y').date().isoformat()
 except ValueError:return None
def key(row):
 f=row['fields'];k=(f.get('SITE_ID'),date(f.get('DATE_COL','')),f.get('VISIT_NO'),f.get('PSTL_CODE'))
 return k if all(k) else None
def inring(x,y,r):
 inside=False
 for (a,b),(c,d) in zip(r,r[1:]+r[:1]):
  if (b>y)!=(d>y) and x<(c-a)*(y-b)/(d-b)+a:inside=not inside
 return inside
class Topology:
 def __init__(self,raw):
  self.data=json.loads(raw);self.cache={};self.polygons={}
  for g in self.data['objects']['counties']['geometries']:
   polygons=[]
   for p in g['arcs'] if g['type']=='MultiPolygon' else [g['arcs']]:
    rings=[]
    for ids in p:
     ring=[]
     for i in ids:
      a=self.arc(i);ring.extend(a if not ring else a[1:])
     rings.append(ring)
    polygons.append(rings)
   self.polygons[g['id']]=polygons
 def arc(self,i):
  n=i if i>=0 else ~i
  if n not in self.cache:
   x=y=0;result=[];scale=self.data['transform']['scale'];tr=self.data['transform']['translate']
   for dx,dy in self.data['arcs'][n]:x+=dx;y+=dy;result.append((x*scale[0]+tr[0],y*scale[1]+tr[1]))
   self.cache[n]=result
  return self.cache[n] if i>=0 else self.cache[n][::-1]
 def diagnostic(self,code,f):
  x,y=float(f['LON_DD83']),float(f['LAT_DD83']);polys=self.polygons[code]
  inside=any(inring(x,y,p[0]) and not any(inring(x,y,h) for h in p[1:]) for p in polys)
  sx=111.32*math.cos(math.radians(y));best=float('inf')
  for p in polys:
   for r in p:
    for (a,b),(c,d) in zip(r,r[1:]+r[:1]):
     ax=(a-x)*sx;ay=(b-y)*111.32;dx=(c-a)*sx;dy=(d-b)*111.32;den=dx*dx+dy*dy
     t=max(0,min(1,-(ax*dx+ay*dy)/den)) if den else 0;best=min(best,math.hypot(ax+t*dx,ay+t*dy))
  return {'publisherCountyContainsDesignPoint':inside,'distanceToPublisherBoundaryKmApprox':round(best,6),'originalFields':{k:f[k] for k in ['UID','LAT_DD83','LON_DD83','GNIS_ID','GNIS_NAME','NARS_NAME','HUC8','HUC8_NM','COMID','REACHCODE','STATECTY','CNTYNAME','STATE','BORD_RIV','PSTL_CODE']},'role':'Conflict diagnostic only; generalized Census topology does not route or reassign county.'}
def review(repo):
 packed=(repo/ARCHIVE).read_bytes();assert len(packed)==3412960 and sha(packed)==ARCHIVE_SHA
 envelope=json.loads(gzip.decompress(packed));files={};descriptors=[]
 for item in envelope['files']:
  assert item['encoding']=='base64';raw=base64.b64decode(item['contents'],validate=True)
  assert len(raw)==item['bytes'] and sha(raw)==item['sha256'];assert item['originalPath'] not in files
  files[item['originalPath']]=raw;descriptors.append({k:item[k] for k in ['originalPath','bytes','sha256']})
 def named(name):
  found=[p for p in files if pathlib.PurePosixPath(p).name==name];assert len(found)==1
  return found[0]
 original_receipts=[];decoded={};lineage=[]
 for name in ['retrieval-receipt.json','taxonomy-retrieval-receipt.json']:
  receipt=json.loads(files[named(name)]);original_receipts.append(receipt);recipe=receipt['recipe']
  assert recipe['path'] in files and sha(files[recipe['path']])==recipe['sha256']
  lineage.append({'record':named(name),'declaredRecipe':recipe,'exactPathAndHashMatch':True})
  for response in receipt['receipts']:
   assert response['status']==200 and response['url']==response['finalUrl'];stored=files[response['path']]
   assert len(stored)==response['bytes'] and sha(stored)==response['sha256'];raw=gzip.decompress(stored)
   assert len(raw)==response['decodedBytes'] and sha(raw)==response['decodedSha256']
   decoded[pathlib.PurePosixPath(response['path']).name]=raw
 for name in ['candidate-preflight.json','candidate-preflight.exact-five-digit-initial.json','candidate-preflight.numeric-fips-border-hold.json']:
  pin=json.loads(files[named(name)])['recipe'];matches=[p for p,b in files.items() if sha(b)==pin['sha256']];assert len(matches)==1
  lineage.append({'record':named(name),'declaredRecipe':pin,'retainedMatchingRecipe':matches[0],'exactPathAndHashMatch':matches[0]==pin['path'],'note':'Historical recipe aliases preserved. Report candidates are not used to decide this independent review.'})
 local={}
 for p,pin in LOCAL_PINS.items():
  raw=(repo/p).read_bytes()
  if sha(raw)!=pin['sha256'] or len(raw)!=pin['bytes']:
   raw=subprocess.run(['git','show',BASE+':'+p],cwd=repo,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=0x08000000 if sys.platform=='win32' else 0).stdout
  assert sha(raw)==pin['sha256'] and len(raw)==pin['bytes'];local[p]=raw
 registry=json.loads(local['src/data/research/county-equivalent-registry.json']);counties={c['countyFips']:c for c in registry['countyEquivalents'] if c['status']=='active'}
 catalog={s['id']:s for s in json.loads(local['src/data/generated/species.json'])};topology=Topology(local['src/data/source/county-equivalents-topology.json'])
 source=next(s for s in json.loads(local['src/data/research/source-registry.json'])['sources'] if s['id']=='epa-nrsa-fish-counts')
 fish,fp=parse_csv(decoded['nrsa1314_fishcts_04232019.csv.gz'],'fish','ascii')
 sites,sp=parse_csv(decoded['nrsa1314_siteinformation_wide_04292019.csv.gz'],'site','iso-8859-1')
 taxa,tp=parse_csv(decoded['nrsa1314_fishtaxa_02042019.csv.gz'],'taxonomy2013','ascii')
 assert sp['nonAsciiByteCounts']=={'241':2}
 nonascii=[r for r in sites if any(ord(c)>127 for c in ''.join(r['fields'].values()))]
 assert len(nonascii)==1 and nonascii[0]['fields']['GNIS_NAME']=='Rio Pe\u00f1asco' and nonascii[0]['fields']['NARS_NAME']=='Rio Pe\u00f1asco'
 by_uid=collections.defaultdict(list);by_key=collections.defaultdict(list);by_tax=collections.defaultdict(list)
 for s in sites:
  by_uid[s['fields']['UID']].append(s)
  if key(s):by_key[key(s)].append(s)
 for t in taxa:by_tax[t['fields']['TAXA_ID']].append(t)
 targets=sorted({p.split(':')[1] for p in PAIRS});crosswalk={};tax_by_species=collections.defaultdict(list)
 for t in taxa:
  f=t['fields'];name=norm(f['GENUS']+' '+f['SPECIES'])
  for species in targets:
   if name==norm(catalog[species]['scientificName']):crosswalk[f['TAXA_ID']]=species;tax_by_species[species].append(t)
 assert set(targets)==set(tax_by_species)
 material={p:[] for p in PAIRS};diagnostics={};join_counts=collections.Counter()

 for fishrow in fish:
  f=fishrow['fields'];us=by_uid[f['UID']];ks=by_key.get(key(fishrow),[])
  both=len(us)==1 and len(ks)==1 and us[0]['dataRowIndexZeroBased']==ks[0]['dataRowIndexZeroBased']
  join_counts['uidAndCompleteKeyAgree' if both else 'nonuniqueOrDisagree']+=1
  species=crosswalk.get(f['TAXA_ID']);possible=set([species] if species else [])
  possible.update(s for s in targets for t in tax_by_species[s] if f['FINAL_NAME']==t['fields']['FINAL_NAME'])
  candidates={s['dataRowIndexZeroBased']:s for s in us+ks}
  possible_pairs={fips(s['fields']['STATECTY'])+':'+taxon for s in candidates.values() for taxon in possible if fips(s['fields']['STATECTY'])}
  for pair in sorted(possible_pairs.intersection(material)):
   code,target=pair.split(':');county=counties[code];reasons=[];warnings=[];matching_tax=by_tax[f['TAXA_ID']]
   if not both:reasons.append('UID and unique full site/date/visit/postal-state joins do not identify the same single site row.')
   if len(matching_tax)!=1:reasons.append('Taxon ID is not unique in contemporaneous taxonomy.')
   elif crosswalk.get(f['TAXA_ID'])!=target or matching_tax[0]['fields']['FINAL_NAME']!=f['FINAL_NAME']:reasons.append('Exact taxon ID, original common name and contemporaneous scientific name do not agree with target.')
   if not re.fullmatch(r'[1-9][0-9]*',f['TOTAL']):reasons.append('TOTAL is not a strictly positive integer.')
   if f['IS_DISTINCT']!='1':reasons.append('IS_DISTINCT is not 1.')
   parsed_date=date(f['DATE_COL'])
   if not parsed_date or parsed_date[:4] not in ('2013','2014'):reasons.append('Invalid or out-of-cycle collection date.')
   site=us[0] if len(us)==1 else None;diag_key=None
   if site:
    sf=site['fields'];original_code=fips(sf['STATECTY'])
    if original_code!=code or norm(sf['CNTYNAME']) not in {norm(x) for x in county['aliases']+[county['shortName'],county['legalName']]}:reasons.append('Publisher FIPS and county name do not independently match the current county.')
    if sf['PSTL_CODE']!=f['PSTL_CODE'] or sf['PSTL_CODE']!=county['stateCode']:reasons.append('Primary fish/site postal state and current county state disagree.')
    border,state=sf['BORD_RIV'],sf['STATE']
    valid_state=state==sf['PSTL_CODE'] or (state==border and re.fullmatch(r'[A-Z]{2}:[A-Z]{2}',state) and sf['PSTL_CODE'] in state.split(':') and len(set(state.split(':')))==2)
    if not valid_state:reasons.append('STATE is neither primary postal state nor exact two-code BORD_RIV containing it.')
    if border and (not re.fullmatch(r'[A-Z]{2}:[A-Z]{2}',border) or sf['PSTL_CODE'] not in border.split(':')):reasons.append('BORD_RIV conflicts with primary state.')
    if sf['SITESAMP']!='Y' or sf['EVALSTAT']!='Target-Sampled' or sf['EVALUATED']!='YES' or sf['NRSA_USE']!='YES':reasons.append('Sampled/evaluated/analysis flags do not all affirm sampled positive context.')
    if sf['SITETYPE']!=f['SITETYPE'] or sf['SITETYPE'] not in ('PROB','HAND'):reasons.append('Original site type is unsupported or inconsistent.')
    if original_code==code:
     diag_key=str(site['dataRowIndexZeroBased'])+':'+code
     if diag_key not in diagnostics:
      diagnostics[diag_key]=topology.diagnostic(code,sf);diagnostics[diag_key].update({'siteRowIndexZeroBased':site['dataRowIndexZeroBased'],'publisherCountyFips':code})
     if not diagnostics[diag_key]['publisherCountyContainsDesignPoint']:warnings.append('Generalized topology places design point just outside county; boundary diagnostic only, not a corrected geography.')
    if len(sf['STATECTY'])==4:warnings.append('Exactly one leading zero restored for interpretation; original string retained, county name and postal state independently matched.')
    if ':' in state:warnings.append('Two-code STATE equals BORD_RIV; primary postal state and original publisher county control the proposed county.')
    dx=(float(f['LON_DD83'])-float(sf['LON_DD83']))*111.32*math.cos(math.radians(float(sf['LAT_DD83'])));dy=(float(f['LAT_DD83'])-float(sf['LAT_DD83']))*111.32
    if math.hypot(dx,dy)>0.01:reasons.append('Fish and site design coordinates differ by more than 10 metres; needs location review.')
   if target=='pterygoplichthys-disjunctivus':reasons.append('Conservative exact-species hold: introduced peninsular Florida disjunctivus/pardalis species concepts are explicitly unresolved in USGS/FWS regional context. The retained EPA row supplies no voucher, morphology or identification provenance resolving this problem. Exact TAXA_ID 5049 and scientific/common names are preserved. This does not identify these seven fish as hybrids.')
   material[pair].append({'fish':fishrow,'siteCandidates':list(candidates.values()),'taxonomyCandidates':matching_tax,'checks':{'sameUniqueUidAndCompleteJoin':bool(both),'uidCandidateCount':len(us),'fullJoinCandidateCount':len(ks),'fullJoinKey':list(key(fishrow)) if key(fishrow) else None,'parsedCollectionDate':parsed_date,'countyRegistryRecord':county,'geographyDiagnosticKey':diag_key},'rowDisposition':'held' if reasons else 'supported-method-candidate','holdReasons':reasons,'warnings':warnings})
 pairs=[]
 for pair in PAIRS:
  rows=material[pair];assert rows,('no original witnesses',pair);supported=[r for r in rows if not r['holdReasons']]
  def rank(r):
   f=r['fish']['fields'];d=diagnostics.get(r['checks']['geographyDiagnosticKey'],{})
   return (not d.get('publisherCountyContainsDesignPoint',False),f['INDEX_VISIT']!='Y',-int(f['TOTAL']) if f['TOTAL'].isdigit() else 0,r['checks']['parsedCollectionDate'] or '',r['fish']['dataRowIndexZeroBased'])
  selected=min(supported or rows,key=rank)
  pairs.append({'pairKey':pair,'status':'supported-method-candidate' if supported else 'held','materialFishRows':len(rows),'supportedRows':len(supported),'heldRows':len(rows)-len(supported),'selectedStrongestWitness':{'fishRowIndexZeroBased':selected['fish']['dataRowIndexZeroBased'],'fishRawRowSha256':selected['fish']['rawRowSha256IncludingTerminator'],'UID':selected['fish']['fields']['UID'],'selectionRule':'Prefer qualified row, publisher-polygon consistency, index visit Y, larger positive count, earlier date, then original row index. Sample counts are not abundance estimates.'},'holdReasons':sorted({reason for r in rows for reason in r['holdReasons']}),'allOriginalWitnesses':rows})
 supported=[p['pairKey'] for p in pairs if p['status']=='supported-method-candidate'];held=[p['pairKey'] for p in pairs if p['status']=='held']
 assert len(supported)+len(held)==len(PAIRS)==116
 outside=[d for d in diagnostics.values() if not d['publisherCountyContainsDesignPoint']]
 assert all(d['distanceToPublisherBoundaryKmApprox']<0.8 for d in outside)
 # The 0.8 bound is observed and asserted for this file, not a county-routing policy.
 witness_rows=[r for p in pairs for r in p['allOriginalWitnesses']]
 identity_count=collections.Counter((r['fish']['fields']['UID'],r['fish']['fields']['TAXA_ID'],r['fish']['fields']['DATE_COL'],r['fish']['fields']['VISIT_NO']) for r in witness_rows)
 counts={'leasedPairs':116,'reviewedPairs':len(pairs),'supportedMethodCandidatePairs':len(supported),'heldPairs':len(held),'materialFishRows':len(witness_rows),'uniqueMaterialFishRows':len({r['fish']['dataRowIndexZeroBased'] for r in witness_rows}),'uniqueReviewedSiteRows':len({s['dataRowIndexZeroBased'] for r in witness_rows for s in r['siteCandidates']}),'uniqueReviewedTaxonRows':len({t['dataRowIndexZeroBased'] for r in witness_rows for t in r['taxonomyCandidates']}),'duplicateSourceIdentities':sum(n-1 for n in identity_count.values() if n>1),'outsideGeneralizedPolygonSiteDiagnostics':len(outside),'newPublicContextRequests':8,'newBulkRequests':0,'canonicalEvidenceEvents':0,'acceptedDeterminations':0,'publicationEligibleAssertions':0,'canonicalOutcomePairs':0,'negativeClaims':0,'providerWrites':0}
 result={'schemaVersion':1,'kind':'independent-epa-nrsa-1314-method-proposal','status':'proposal-ready-main-method-required','actorId':ACTOR,'jobId':JOB,'leaseId':LEASE,'branch':'codex/'+JOB,'baseSha':BASE,'canonicalRunCreated':False,'completionManifestCreated':False,'sourceMethodRegistrationPending':True,'exactLeasedPairs':PAIRS,'supportedPairs':supported,'heldPairs':held,'counts':{'baseline':{k:0 for k in counts},'final':counts,'net':counts},'pairReviews':pairs}
 result['sourceVerification']={'publisher':'U.S. Environmental Protection Agency','registeredSource':source,'sourceCycle':'2013/2014','sourceDataPublicationDates':{'fish':'2019-04-23','site':'2019-04-29','taxonomy':'2019-02-04'},'availability':'Retained 2026-09-08 acquisition receipts affirm six HTTP 200 bulk source responses; worker did not refetch them. Current context retrieval is separately accounted.','terms':'Official public EPA downloads; source registry permits versioned retention. No new license or unrestricted-reuse claim is made; MAIN must qualify this cycle before publication.','freshness':'Historical samples only; retrieval/publication dates are not biological observation dates.','positiveScope':'Historical species-specific positive sample counts at publisher counties only.','negativeScope':'None. Failed requests, omitted taxa, rejected rows and sampling flags create no absence or non-detection.','originalAcquisitionReceipts':original_receipts,'recipeLineage':lineage,'archive':{'path':ARCHIVE,'bytes':len(packed),'sha256':sha(packed),'embeddedFilesVerified':len(descriptors),'embeddedFiles':descriptors},'localInputs':LOCAL_PINS,'csvProfiles':{'fish':fp,'site':sp,'taxonomy2013':tp},'siteEncodingContract':'Exactly two original 0xF1 bytes, both in Rio Penasco names on one row, otherwise ASCII. ISO-8859-1 is byte-reversible inspection for this pinned file; retained bytes are never rewritten.','metadataRead':[{'artifact':p,'decodedSha256':sha(raw),'decodedBytes':len(raw)} for p,raw in decoded.items() if '.txt.' in p],'stableRecordIdentity':'Original TAXA_ID + UID + SITE_ID + collection date + VISIT_NO + PSTL_CODE, original row hash and physical locator. Multiple visits and common/mirror morphs retain separate original identities.','joinPolicy':'Independent Python csv over all source rows. Require globally unique UID and full site/date/visit/postal-state joins to identify the same site row; no inherited cross-cycle UID exception.','wholeFishFileJoinDiagnostics':dict(join_counts)}
 result['taxonomicCrosswalk']=[{'speciesId':s,'catalogScientificName':catalog[s]['scientificName'],'originalTaxonRows':tax_by_species[s],'reasoning':'Exact contemporaneous GENUS + SPECIES to catalog scientific name, with identical fish TAXA_ID and original FINAL_NAME required. Common and mirror carp are explicitly CYPRINUS CARPIO with identical ITIS TSN, so these morph labels do not create separate species.' if s=='cyprinus-carpio' else 'Exact contemporaneous GENUS + SPECIES to catalog scientific name; matching fish TAXA_ID and original FINAL_NAME required.','identityHold':s=='pterygoplichthys-disjunctivus'} for s in targets]
 result['geographyReview']={'countyPolicy':'Active original publisher FIPS plus independent current county alias and primary postal state. Exactly one leading zero may be restored to four-digit numeric FIPS; no missing/retired county reassignment. Two-code STATE must equal BORD_RIV and include primary postal state.','topologySource':topology.data['metadata'],'topologyAlgorithm':'Decode delta arcs and reversed indices; ray-cast outer rings minus holes. Distances use local equirectangular km to polygon segments and are approximate. Source NAD83 design points and generalized Census 1:5,000,000 boundaries are diagnostics only.','materialContradictionFinding':'No material county contradiction established. Seventeen distinct site diagnostics fall outside the generalized publisher polygon, all below 0.8 km; these do not override exact publisher county/name/state. Original river/hydrology fields accompany every site.','specialReviews':[{'UID':'1003486','finding':'Rio Penasco is byte-reversibly Rio Pe\u00f1asco. Point is inside publisher Chaves polygon. NRCS context concerns other dams in Otero and cannot reassign this sample.'},{'UID':'1002747','finding':'Butte Creek point is inside publisher Butte polygon. Four-digit 6007 restores one leading zero to Butte 06007; original name and postal state independently agree.'}],'siteDiagnostics':[diagnostics[k] for k in sorted(diagnostics)]}
 result['publicContext']={'requests':REQUESTS,'maximumRequests':8,'toolCalls':4,'accountingUnit':'Each search query and each URL open is one logical request; 8 total across 4 calls. Underlying search transport counts are not exposed.','successfulLogicalRequests':7,'failedLogicalRequests':1,'authenticatedRequests':0,'bulkDownloads':0,'references':CONTEXT,'retrievalDate':'2026-09-08','offlineReplay':'Reviewed context prose and exact references are retained in recipe; --verify never repeats network requests.'}
 result['verification']={'preflight':{'ok':True,'command':'node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease C:/Code/project-isitusa/.cache/research/campaigns/20260908-r21-epa-nrsa-1314/a-lease.json --repo C:/Code/project-isitusa-worktrees/'+JOB,'exitCode':0,'head':BASE},'skillPins':PINS,'offlineCommand':'python src/data/research/worker-results/'+JOB+'/review.py --verify','mode':'Recompute every review field and compare exact proposal bytes. Original process telemetry is structurally checked and replayed as historical data.','localInputReplay':'Use exact pinned local bytes; if a later MAIN change differs, read the original BASE git blob offline and verify its bytes/hash.','allEmbeddedHashesChecked':True,'allResponseDecodedHashesChecked':True,'allRecipeLineageChecked':True,'allLeasedPairsReviewed':True,'operationalDiagnostics':[{'operation':'Initial oversized shell recipe write','result':'No process or file write occurred; rewritten as bounded file-write chunks. Source bytes and hashes unchanged.','exactError':'CreateProcess { message: "Rejected(\"Failed to create unified exec process: The filename or extension is too long. (os error 206)\")" }'}]}
 result['remainingWork']=['MAIN must adjudicate proposal and pleco hold, register and validate an explicit 2013/2014 method, then create legitimate immutable evidence runs.','No determination, national completeness, projection or net-new county-species movement is established by this method proposal.']
 result['caveats']=['Historical sampled-site counts do not establish present-day persistence, abundance, establishment, reproduction or countywide completeness.','Original flags retained; INDEX_VISIT=N is a repeat visit, not a negative claim.','Pleco hold concerns unresolved source/region species concept; it does not reidentify the EPA fish as hybrids. Failed fact-sheet fetch supplies no evidence.','No shared schema, skill, registry, adapter, projection, provider or orchestrator state was modified.']
 return result
def serialize(v):return (json.dumps(v,ensure_ascii=True,indent=2,sort_keys=True)+'\n').encode('ascii')
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--verify',action='store_true');parser.add_argument('--repo',type=pathlib.Path);args=parser.parse_args()
 script=pathlib.Path(__file__).resolve();repo=args.repo.resolve() if args.repo else script.parents[5];output=script.with_name('proposal.json');start=time.perf_counter();started=utc();result=review(repo)
 result['verification']['recipeSha256']=sha(script.read_bytes())
 if args.verify:
  old=json.loads(output.read_bytes());perf=old['performance'];assert perf['scriptElapsedSeconds']>=0 and 0<perf['peakProcessMemoryMiB']<=384 and perf['processFinishedAt']>=perf['processStartedAt'];result['performance']=perf
  assert serialize(result)==output.read_bytes(),'Proposal differs from independent offline reproduction'
 else:
  result['performance']={'processStartedAt':started,'processFinishedAt':utc(),'scriptElapsedSeconds':round(time.perf_counter()-start,6),'peakProcessMemoryMiB':peak_mb(),'measurement':'Windows GetProcessMemoryInfo PeakWorkingSetSize or platform getrusage RSS; elapsed is measured recipe duration, not fabricated full agent-session duration.','elapsedSinceLeaseClaimSeconds':round((dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat('2026-09-08T22:20:10.742+00:00')).total_seconds(),6),'workerLeaseClaimedAt':'2026-09-08T22:20:10.742Z','memoryLimitMiB':384,'artifactLimitBytes':8388608}
  assert result['performance']['peakProcessMemoryMiB']<=384
  encoded=serialize(result);assert len(encoded)+script.stat().st_size<=8388608;output.write_bytes(encoded)
 assert peak_mb()<=384
 print(json.dumps({'ok':True,'mode':'verify' if args.verify else 'write','proposalSha256':sha(output.read_bytes()),'proposalBytes':output.stat().st_size,'recipeBytes':script.stat().st_size,'counts':result['counts']['final'],'measuredElapsedSeconds':round(time.perf_counter()-start,6),'peakProcessMemoryMiB':peak_mb()},sort_keys=True))
if __name__=='__main__':main()
