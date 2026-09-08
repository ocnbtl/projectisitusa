"""Independent original-byte EPA 2013/2014 proposal review; no canonical writes.
Generate once with --acquire-context; reproduce retained bytes offline with --verify.
Only proposal.json beside this recipe may be written. No source bulk acquisition.
"""
import argparse,base64,collections,csv,ctypes,datetime,gzip,hashlib,html,io,json,math,pathlib,re,subprocess,sys,time,unicodedata,urllib.request,urllib.error,urllib.parse
START=time.perf_counter()
ROOT=pathlib.Path(__file__).resolve().parents[5]
OUT=pathlib.Path(__file__).with_name('proposal.json')
ARCHIVE='ops/national-research/evaluations/artifacts/epa-nrsa-1314-preflight-20260908-r21.json.gz'
ARCHIVE_SHA='631dab66cfd6b50bb918090d5b50a12e1bce6f544ccc6a0ea4e248244ebd975e'
R21='.cache/research/campaigns/20260908-r21-epa-nrsa-1314/'
R20='.cache/research/campaigns/20260908-r20-epa-nrsa-1819/'
SOURCE_BASE='7674fc93bc4fadff8731118b9378a2785e05a7b2'
ACTOR='epa_nrsa_1314_review_b_r21'
def sha(b):return hashlib.sha256(b).hexdigest()
def encoded(obj):return (json.dumps(obj,indent=2,ensure_ascii=True)+'\n').encode('utf-8')
def gitread(path):
 p=subprocess.run(['git','-c','safe.directory='+ROOT.as_posix(),'show',LEASE['baseSha']+':'+path],cwd=ROOT,capture_output=True,check=True)
 return p.stdout
class MemoryCounters(ctypes.Structure):
 _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(n,ctypes.c_size_t) for n in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
def memory():
 c=MemoryCounters();c.cb=ctypes.sizeof(c)
 ctypes.windll.kernel32.GetCurrentProcess.restype=ctypes.c_void_p
 h=ctypes.windll.kernel32.GetCurrentProcess()
 f=ctypes.windll.psapi.GetProcessMemoryInfo;f.argtypes=[ctypes.c_void_p,ctypes.POINTER(MemoryCounters),ctypes.c_ulong];f.restype=ctypes.c_int
 assert f(h,ctypes.byref(c),c.cb)!=0
 assert c.PeakWorkingSetSize>0
 assert c.PeakWorkingSetSize<=384*1024*1024,('memory reservation exceeded',c.PeakWorkingSetSize)
 return {'peakWorkingSetBytes':c.PeakWorkingSetSize,'peakWorkingSetMiB':round(c.PeakWorkingSetSize/1048576,3),'workingSetBytes':c.WorkingSetSize,'pageFaultCount':c.PageFaultCount,'memorySource':'Windows GetProcessMemoryInfo'}
def normalize(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def day(s):
 if not re.fullmatch(r'\d{1,2}/\d{1,2}/20(?:13|14)',s):return None
 try:return datetime.datetime.strptime(s,'%m/%d/%Y').date().isoformat()
 except ValueError:return None
def key(d):return (d['SITE_ID'],day(d['DATE_COL']),d['VISIT_NO'],d['PSTL_CODE'])
def loosekey(d):return key(d)[:3]
def fips(d):
 s=d['STATECTY'];return ('0'+s if len(s)==4 else s) if re.fullmatch('[0-9]{4,5}',s) else None
def parse(raw,encoding,label):
 # latin1 is one byte per codepoint, keeping the original physical line byte slices.
 lines=raw.splitlines(keepends=True); reader=csv.reader(io.StringIO(raw.decode(encoding),newline=''),strict=True)
 header=next(reader);assert len(set(header))==len(header)
 previous=reader.line_num; rows=[]
 for values in reader:
  end=reader.line_num; b=b''.join(lines[previous:end]);assert len(values)==len(header),(label,end,len(values),len(header))
  rows.append({'index':len(rows),'physicalStartLine':previous+1,'physicalEndLine':end,'rawRecordSha256':sha(b),'rawRecordBytes':len(b),'lineTerminator':('CRLF' if b.endswith(b'\r\n') else 'LF' if b.endswith(b'\n') else 'CR' if b.endswith(b'\r') else 'none'),'rawRecordBase64':base64.b64encode(b).decode(),'fields':dict(zip(header,values))})
  previous=end
 assert b''.join(lines)==raw
 return rows,{'label':label,'decodedBytes':len(raw),'decodedSha256':sha(raw),'encoding':encoding,'rowCount':len(rows),'physicalLineCount':len(lines),'header':header}
def archive():
 raw=(ROOT/ARCHIVE).read_bytes();assert len(raw)==3412960 and sha(raw)==ARCHIVE_SHA
 a=json.loads(gzip.decompress(raw));fs={};descriptors=[]
 for f in a['files']:
  b=base64.b64decode(f['contents'],validate=True);assert len(b)==f['bytes'] and sha(b)==f['sha256'];assert f['originalPath'] not in fs
  fs[f['originalPath']]=b;descriptors.append({k:f[k] for k in ['originalPath','bytes','sha256']})
 assert len(fs)==19
 return fs,descriptors
CONTEXT_URLS=[
 'https://www.usgs.gov/publications/discovery-south-american-suckermouth-armored-catfishes-loricariidae-pterygoplichthys',
 'https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=766']
def context(acquire,old):
 if not acquire:
  assert old is not None
  records=old['sourceContext']['retainedResponses']
 else:
  records=[]
  for url in CONTEXT_URLS:
   started=datetime.datetime.now(datetime.timezone.utc).isoformat();req=urllib.request.Request(url,headers={'User-Agent':'Project-Isitusa-source-context-review/1.0'})
   with urllib.request.urlopen(req,timeout=25) as r:
    b=r.read(1000001);assert len(b)<=1000000;assert r.status==200;assert urllib.parse.urlparse(r.url).hostname in ['www.usgs.gov','nas.er.usgs.gov']
    records.append({'url':url,'finalUrl':r.url,'status':r.status,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'startedAt':started,'decodedBytes':len(b),'decodedSha256':sha(b),'bodyGzipBase64':base64.b64encode(gzip.compress(b,mtime=0)).decode(),'retention':'Original HTTP entity bytes gzip-compressed without textual normalization.'})
 assert [r['url'] for r in records]==CONTEXT_URLS
 for r in records:
  b=gzip.decompress(base64.b64decode(r['bodyGzipBase64'],validate=True));assert len(b)==r['decodedBytes'] and sha(b)==r['decodedSha256']
 return records

LEASE={'leaseId': 'lease-epa-nrsa-1314-source-review-b-20260908-r21-1', 'jobId': 'epa-nrsa-1314-source-review-b-20260908-r21', 'attempt': 1, 'previousLeaseId': None, 'workerTaskId': 'epa_nrsa_1314_review_b_r21', 'state': 'active', 'claimedAt': '2026-09-08T22:45:28.926Z', 'expiresAt': '2026-09-08T23:30:27.959Z', 'recoveryAt': None, 'recoveryReason': None, 'stateOrSourceScope': {'states': ['AR', 'CO', 'FL', 'GA', 'IA', 'ID', 'IL', 'KS', 'KY', 'LA', 'MA', 'MD', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OR', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WI', 'WV', 'WY'], 'sourceFamilies': ['epa-nrsa-fish-counts']}, 'taxaOrPairScope': {'taxa': ['ctenopharyngodon-idella', 'cyprinus-carpio', 'hypophthalmichthys-molitrix', 'misgurnus-anguillicaudatus', 'oreochromis-aureus', 'pterygoplichthys-anisitsi', 'pterygoplichthys-disjunctivus', 'salmo-trutta'], 'pairs': ['05001:cyprinus-carpio', '05085:cyprinus-carpio', '05149:cyprinus-carpio', '08023:cyprinus-carpio', '08081:cyprinus-carpio', '08107:salmo-trutta', '12071:oreochromis-aureus', '12099:oreochromis-aureus', '12115:misgurnus-anguillicaudatus', '12115:pterygoplichthys-disjunctivus', '13077:ctenopharyngodon-idella', '13127:cyprinus-carpio', '13235:cyprinus-carpio', '13315:cyprinus-carpio', '16039:cyprinus-carpio', '16067:cyprinus-carpio', '17011:cyprinus-carpio', '17061:cyprinus-carpio', '17075:cyprinus-carpio', '17173:cyprinus-carpio', '19047:cyprinus-carpio', '19055:salmo-trutta', '19139:ctenopharyngodon-idella', '19149:ctenopharyngodon-idella', '19191:cyprinus-carpio', '20013:hypophthalmichthys-molitrix', '20073:cyprinus-carpio', '20191:ctenopharyngodon-idella', '20209:hypophthalmichthys-molitrix', '21163:cyprinus-carpio', '21171:salmo-trutta', '22005:cyprinus-carpio', '22009:cyprinus-carpio', '22067:cyprinus-carpio', '22081:cyprinus-carpio', '24001:cyprinus-carpio', '25009:salmo-trutta', '25015:salmo-trutta', '25027:cyprinus-carpio', '26015:salmo-trutta', '26065:salmo-trutta', '26099:cyprinus-carpio', '26135:cyprinus-carpio', '27013:cyprinus-carpio', '27043:cyprinus-carpio', '27053:cyprinus-carpio', '27099:cyprinus-carpio', '27107:cyprinus-carpio', '28021:cyprinus-carpio', '28163:cyprinus-carpio', '29107:ctenopharyngodon-idella', '29107:hypophthalmichthys-molitrix', '29143:ctenopharyngodon-idella', '29186:ctenopharyngodon-idella', '29197:ctenopharyngodon-idella', '30005:cyprinus-carpio', '30023:salmo-trutta', '30041:salmo-trutta', '30063:salmo-trutta', '30069:cyprinus-carpio', '30083:cyprinus-carpio', '31003:cyprinus-carpio', '31041:ctenopharyngodon-idella', '31081:cyprinus-carpio', '31103:cyprinus-carpio', '31145:ctenopharyngodon-idella', '31177:ctenopharyngodon-idella', '32003:cyprinus-carpio', '34023:cyprinus-carpio', '34031:cyprinus-carpio', '35019:cyprinus-carpio', '35045:salmo-trutta', '35061:cyprinus-carpio', '36011:cyprinus-carpio', '36021:ctenopharyngodon-idella', '36027:cyprinus-carpio', '36051:cyprinus-carpio', '36055:cyprinus-carpio', '36111:salmo-trutta', '36121:salmo-trutta', '37051:cyprinus-carpio', '37193:cyprinus-carpio', '38061:cyprinus-carpio', '38085:cyprinus-carpio', '39005:cyprinus-carpio', '39067:cyprinus-carpio', '39113:cyprinus-carpio', '39155:cyprinus-carpio', '41025:cyprinus-carpio', '41063:cyprinus-carpio', '45003:cyprinus-carpio', '45041:cyprinus-carpio', '46035:ctenopharyngodon-idella', '46035:hypophthalmichthys-molitrix', '47155:cyprinus-carpio', '48029:pterygoplichthys-anisitsi', '48083:cyprinus-carpio', '48121:cyprinus-carpio', '48201:pterygoplichthys-anisitsi', '48253:cyprinus-carpio', '48407:cyprinus-carpio', '48503:cyprinus-carpio', '49017:cyprinus-carpio', '49049:salmo-trutta', '50015:salmo-trutta', '51143:cyprinus-carpio', '51165:cyprinus-carpio', '54011:cyprinus-carpio', '54081:cyprinus-carpio', '55073:cyprinus-carpio', '56009:cyprinus-carpio', '56015:cyprinus-carpio', '56017:salmo-trutta', '56023:salmo-trutta', '56027:cyprinus-carpio', '56037:salmo-trutta']}, 'scopeClaims': ['county/05001/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/05085/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/05149/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/08023/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/08081/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/08107/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/12071/source/epa-nrsa-fish-counts/taxon/oreochromis-aureus', 'county/12099/source/epa-nrsa-fish-counts/taxon/oreochromis-aureus', 'county/12115/source/epa-nrsa-fish-counts/taxon/misgurnus-anguillicaudatus', 'county/12115/source/epa-nrsa-fish-counts/taxon/pterygoplichthys-disjunctivus', 'county/13077/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/13127/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/13235/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/13315/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/16039/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/16067/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/17011/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/17061/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/17075/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/17173/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/19047/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/19055/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/19139/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/19149/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/19191/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/20013/source/epa-nrsa-fish-counts/taxon/hypophthalmichthys-molitrix', 'county/20073/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/20191/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/20209/source/epa-nrsa-fish-counts/taxon/hypophthalmichthys-molitrix', 'county/21163/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/21171/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/22005/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/22009/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/22067/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/22081/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/24001/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/25009/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/25015/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/25027/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/26015/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/26065/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/26099/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/26135/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/27013/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/27043/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/27053/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/27099/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/27107/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/28021/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/28163/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/29107/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/29107/source/epa-nrsa-fish-counts/taxon/hypophthalmichthys-molitrix', 'county/29143/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/29186/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/29197/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/30005/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/30023/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/30041/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/30063/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/30069/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/30083/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/31003/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/31041/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/31081/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/31103/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/31145/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/31177/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/32003/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/34023/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/34031/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/35019/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/35045/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/35061/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/36011/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/36021/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/36027/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/36051/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/36055/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/36111/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/36121/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/37051/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/37193/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/38061/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/38085/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/39005/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/39067/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/39113/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/39155/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/41025/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/41063/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/45003/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/45041/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/46035/source/epa-nrsa-fish-counts/taxon/ctenopharyngodon-idella', 'county/46035/source/epa-nrsa-fish-counts/taxon/hypophthalmichthys-molitrix', 'county/47155/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/48029/source/epa-nrsa-fish-counts/taxon/pterygoplichthys-anisitsi', 'county/48083/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/48121/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/48201/source/epa-nrsa-fish-counts/taxon/pterygoplichthys-anisitsi', 'county/48253/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/48407/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/48503/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/49017/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/49049/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/50015/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/51143/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/51165/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/54011/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/54081/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/55073/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/56009/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/56015/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/56017/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/56023/source/epa-nrsa-fish-counts/taxon/salmo-trutta', 'county/56027/source/epa-nrsa-fish-counts/taxon/cyprinus-carpio', 'county/56037/source/epa-nrsa-fish-counts/taxon/salmo-trutta'], 'branch': 'codex/epa-nrsa-1314-source-review-b-20260908-r21', 'worktree': 'C:\\Code\\project-isitusa-worktrees\\epa-nrsa-1314-source-review-b-20260908-r21', 'baseSha': '712d93f6fbcd7df7c87d81645d1cf9c6f95b373f', 'expectedReceiptCodeCommit': '712d93f6fbcd7df7c87d81645d1cf9c6f95b373f', 'permittedPaths': ['src/data/research/worker-results/epa-nrsa-1314-source-review-b-20260908-r21/**'], 'prohibitedPaths': ['.agents/skills/**', 'AGENTS.md', 'package.json', 'package-lock.json', 'ops/national-research/**', 'src/data/research/schemas/**', 'src/data/research/source-registry.json', 'src/data/research/state-list-source-registry.json', 'src/data/research/research-protocols.json', 'src/data/research/state-registry.json', 'src/data/research/county-equivalent-registry.json', 'src/data/research/state-research-config.json', 'src/data/research/state-applicability/**', 'scripts/**', 'src/lib/**', 'src/data/generated/**', 'public/generated/**', 'app/**', 'src/components/**', '.vercel/**', 'vercel.json'], 'skillPins': [{'name': 'isitusa-national-orchestrator', 'version': 'frozen-windows-bulk-validation-2026-07-30-r2', 'gitCommit': 'e3513cc6bde303432320d1d3904ea638eec6333c', 'contentHash': '9f934116bc4f1ad80b3b61d805f4ad4c0070773ed3040c28e96098c74d888757'}, {'name': 'isitusa-evidence-worker', 'version': 'frozen-windows-bulk-validation-2026-07-30-r2', 'gitCommit': 'e3513cc6bde303432320d1d3904ea638eec6333c', 'contentHash': '52f13ef7e2574a6428701c0fcc9d0512e313fe639adf826888490ce5a38a6b8b'}], 'expectedOutputs': ['manifest', 'artifacts', 'assertions', 'reviews', 'rejections', 'outcomes', 'receipt', 'source-verification'], 'expectedManifestPath': 'src/data/research/worker-results/epa-nrsa-1314-source-review-b-20260908-r21/manifest.json', 'retryPolicy': {'maxAttempts': 2, 'backoffSeconds': [5, 30], 'resumeRequired': True}, 'resourcePolicy': {'maxArtifactBytes': 8388608, 'maxWallMinutes': 45, 'maxMemoryMb': 384}, 'completionCriteria': ['Pass frozen preflight in the isolated lease worktree.', 'Review every exact leased pair and retain reproducible original-byte witnesses or explicit holds.', 'Return committed proposal artifacts without claiming completed evidence-run or determination status; source-method registration is a MAIN-only blocker.']}

def geometry():
 b=(ROOT/'src/data/source/county-equivalents-topology.json').read_bytes();t=json.loads(b);scale=t['transform']['scale'];shift=t['transform']['translate'];arcs={}
 def arc(i):
  reverse=i<0;j=~i if reverse else i
  if j not in arcs:
   x=y=0;points=[]
   for dx,dy in t['arcs'][j]:x+=dx;y+=dy;points.append((x*scale[0]+shift[0],y*scale[1]+shift[1]))
   arcs[j]=points
  return list(reversed(arcs[j])) if reverse else arcs[j]
 def ring(ids):
  out=[]
  for i in ids:
   z=arc(i);out.extend(z if not out else z[1:])
  return out
 needed={p.split(':')[0] for p in LEASE['taxaOrPairScope']['pairs']};result={}
 for g in t['objects']['counties']['geometries']:
  if g['id'] in needed:
   polys=[g['arcs']] if g['type']=='Polygon' else g['arcs'];result[g['id']]=[[ring(r) for r in poly] for poly in polys]
 return result,{'path':'src/data/source/county-equivalents-topology.json','bytes':len(b),'sha256':sha(b),'metadata':t['metadata'],'use':'Generalized Census topology diagnostics only; no automatic reassignment or rejection.'}
def inside_ring(x,y,pts):
 inside=False
 for (x1,y1),(x2,y2) in zip(pts,pts[1:]+pts[:1]):
  if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1:inside=not inside
 return inside
def geographic(row,polys):
 d=row['fields']
 try:y=float(d['LAT_DD83']);x=float(d['LON_DD83'])
 except ValueError:return {'available':False,'reason':'Missing or invalid source design coordinates'}
 inside=any(inside_ring(x,y,p[0]) and not any(inside_ring(x,y,h) for h in p[1:]) for p in polys)
 # Local tangent-plane shortest distance to generalized polygon boundaries.
 kmx=111.32*math.cos(math.radians(y));kmy=111.32;best=float('inf')
 for poly in polys:
  for ring in poly:
   for a,b in zip(ring,ring[1:]+ring[:1]):
    ax=(a[0]-x)*kmx;ay=(a[1]-y)*kmy;bx=(b[0]-x)*kmx;by=(b[1]-y)*kmy;dx=bx-ax;dy=by-ay
    fraction=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
    best=min(best,math.hypot(ax+fraction*dx,ay+fraction*dy))
 return {'available':True,'latitudeSource':d['LAT_DD83'],'longitudeSource':d['LON_DD83'],'insideGeneralizedPublisherCounty':inside,'nearestGeneralizedBoundaryKm':round(best,4),'decisionUse':'Diagnostic only; the publisher county identity controls unless a material source contradiction exists.'}
def build(contexts):
 fs,descriptors=archive();acq=json.loads(fs[R21+'retrieval-receipt.json']);taxacq=json.loads(fs[R20+'taxonomy-retrieval-receipt.json'])
 assert acq['baseCommit']==SOURCE_BASE
 for receipt in [acq,taxacq]:
  r=receipt['recipe'];assert sha(fs[r['path']])==r['sha256']
 source_receipts=[];decoded={}
 for receipt in [acq,taxacq]:
  for r in receipt['receipts']:
   assert r['status']==200 and r['finalUrl']==r['url'];b=fs[r['path']];assert len(b)==r['bytes'] and sha(b)==r['sha256'];d=gzip.decompress(b);assert len(d)==r['decodedBytes'] and sha(d)==r['decodedSha256'];decoded[r['path']]=d;source_receipts.append(r)
 fish,fishprofile=parse(decoded[R21+'nrsa1314_fishcts_04232019.csv.gz'],'utf-8','fish')
 sitebytes=decoded[R21+'nrsa1314_siteinformation_wide_04292019.csv.gz'];assert collections.Counter(b for b in sitebytes if b>127)=={241:2};assert sitebytes.decode('latin1').encode('latin1')==sitebytes
 try:sitebytes.decode('utf-8');raise AssertionError('Expected strict UTF8 rejection for pinned site bytes')
 except UnicodeDecodeError:pass
 site,siteprofile=parse(sitebytes,'latin1','site')
 taxa,taxprofile=parse(decoded[R20+'nrsa1314_fishtaxa_02042019.csv.gz'],'utf-8','taxonomy')
 assert [len(fish),len(site),len(taxa)]==[25280,2261,850]
 nonascii=[]
 for s in site:
  if any(b>127 for b in base64.b64decode(s['rawRecordBase64'])):
   assert 'Pe\xf1asco' in s['fields']['GNIS_NAME'] or 'Pe\xf1asco' in s['fields']['NARS_NAME'];nonascii.append(s)
 catalogbytes=(ROOT/'src/data/generated/species.json').read_bytes();catalog={v['id']:v for v in json.loads(catalogbytes)}
 countybytes=(ROOT/'src/data/research/county-equivalent-registry.json').read_bytes();registry=json.loads(countybytes);counties={v['countyFips']:v for v in registry['countyEquivalents'] if v['status']=='active'}
 states=json.loads((ROOT/'src/data/research/state-registry.json').read_bytes())
 scope=LEASE['taxaOrPairScope']['pairs'];assert len(scope)==len(set(scope))==116;scope_set=set(scope);species={v.split(':')[1] for v in scope}
 tax_by_id=collections.defaultdict(list);tax_by_common=collections.defaultdict(list);crosswalk={};crosswalk_report=[]
 for t in taxa:
  d=t['fields'];tax_by_id[d['TAXA_ID']].append(t);tax_by_common[d['FINAL_NAME']].append(t)
  for sp in species:
   if (d['GENUS']+' '+d['SPECIES']).lower()==catalog[sp]['scientificName'].lower():
    crosswalk[d['TAXA_ID']]=sp;crosswalk_report.append({'speciesId':sp,'catalogScientificName':catalog[sp]['scientificName'],'taxonomyRow':t,'method':'Exact case-insensitive two-part scientific name, with no fuzzy matching or spelling repair.'})
 assert len(set(crosswalk.values()))==8
 uidmap=collections.defaultdict(list);keymap=collections.defaultdict(list);loosemap=collections.defaultdict(list)
 for s in site:
  d=s['fields'];uidmap[d['UID']].append(s);keymap[key(d)].append(s);loosemap[loosekey(d)].append(s)
 preflight=json.loads(fs[R21+'candidate-preflight.json']);discovery={v['pair']:v for v in preflight['candidatePairs']};assert set(scope)<=set(discovery)
 # Independently reconstruct material pair rows using both UID and visit identity,
 # including candidate rows with contradictory postal states excluded in discovery.
 material=collections.defaultdict(list);source_taxon_exclusions=[]
 for f in fish:
  d=f['fields'];byid=tax_by_id[d['TAXA_ID']];sp=crosswalk.get(d['TAXA_ID'])
  if sp is None:
   if d['FINAL_NAME'] in {'DOJO LOACH','BIGHEAD CARP X SILVER CARP'}:source_taxon_exclusions.append({'fishIndex':f['index'],'rawRecordSha256':f['rawRecordSha256'],'taxaId':d['TAXA_ID'],'sourceName':d['FINAL_NAME'],'reason':'No exact catalog binomial crosswalk; do not repair source spelling or project a hybrid onto parent species.'})
   continue
  sites={s['index']:s for s in uidmap[d['UID']]+loosemap[loosekey(d)]}
  for s in sites.values():
   target=fips(s['fields']);pair=str(target)+':'+sp
   if pair not in scope_set:continue
   reasons=[];sd=s['fields'];county=counties.get(target)
   if len(byid)!=1:reasons.append('nonunique-source-taxon-id')
   elif byid[0]['fields']['FINAL_NAME']!=d['FINAL_NAME']:reasons.append('taxon-id-common-name-disagreement')
   if len(uidmap[d['UID']])!=1 or uidmap[d['UID']][0]['index']!=s['index']:reasons.append('nonunique-or-different-UID-join')
   if len(keymap[key(d)])!=1 or keymap[key(d)][0]['index']!=s['index']:reasons.append('full-site-date-visit-postal-state-join-disagreement')
   if d['UID']!=sd['UID']:reasons.append('fish-site-UID-disagreement')
   if day(d['DATE_COL']) is None or day(sd['DATE_COL']) is None:reasons.append('invalid-or-out-of-cycle-date')
   if not re.fullmatch('[0-9]+',d['TOTAL']) or int(d['TOTAL'])<=0:reasons.append('nonpositive-or-noninteger-total')
   if not re.fullmatch('[0-9]+',d['ANOM_CT']):reasons.append('invalid-anomaly-count')
   if d['IS_DISTINCT']!='1':reasons.append('not-distinct-species-count')
   if d['VISIT_NO'] not in ['1','2']:reasons.append('invalid-visit-number')
   if any(sd[k]!=v for k,v in [('SITESAMP','Y'),('EVALSTAT','Target-Sampled'),('NRS13_EVAL','Target_Sampled'),('STUDY','NRSA')]):reasons.append('not-sampled-NRSA-target')
   if not county:reasons.append('not-active-county')
   else:
    if sd['PSTL_CODE']!=county['stateCode'] or d['PSTL_CODE']!=county['stateCode']:reasons.append('postal-state-county-contradiction')
    if normalize(sd['CNTYNAME']) not in {normalize(v) for v in county['aliases']+[county['shortName'],county['legalName']]}:reasons.append('county-name-FIPS-contradiction')
    if sd['STATE']!=county['stateCode'] and not (re.fullmatch('[A-Z]{2}:[A-Z]{2}',sd['STATE']) and sd['STATE']==sd['BORD_RIV'] and county['stateCode'] in sd['STATE'].split(':')):reasons.append('source-STATE-or-border-contradiction')
   material[pair].append({'fish':f,'site':s,'taxonomy':byid[0] if len(byid)==1 else None,'reasons':reasons,'qualifiesBeforeTaxonContextHold':not reasons,'join':{'fishUid':d['UID'],'siteUid':sd['UID'],'fullKey':list(key(d)),'siteFullKey':list(key(sd)),'uidMatches':len(uidmap[d['UID']]),'fullKeyMatches':len(keymap[key(d)]),'publisherFipsOriginal':sd['STATECTY'],'resolvedFips':target,'leadingZeroRestored':len(sd['STATECTY'])==4}})

 polys,topology=geometry();reports=[];baselines=[];outside=[]
 for pair in scope:
  cf,sp=pair.split(':');county=counties[cf];records=sorted(material[pair],key=lambda v:(v['fish']['index'],v['site']['index']));assert records,('no material rows',pair)
  qualifying=[r for r in records if r['qualifiesBeforeTaxonContextHold']]
  expected=discovery[pair]['records'];expected_witnesses={(v['fish']['index'],v['site']['index'],v['taxonomy']['index']) for v in expected}
  actual_witnesses={(v['fish']['index'],v['site']['index'],v['taxonomy']['index']) for v in qualifying}
  assert expected_witnesses==actual_witnesses,('discovery versus independent reconstruction',pair,expected_witnesses,actual_witnesses)
  for e in expected:
   v=next(r for r in qualifying if r['fish']['index']==e['fish']['index'] and r['site']['index']==e['site']['index'])
   for typ in ['fish','site','taxonomy']:assert v[typ]['rawRecordSha256']==e[typ]['rawRecordSha256'] and v[typ]['physicalEndLine']==e[typ]['physicalEndLine']
  pp='public/generated/research/'+county['stateCode']+'/counties/'+cf+'.json';pb=(ROOT/pp).read_bytes();pd=json.loads(pb);assert sha(pb)==discovery[pair]['projectionSha256']
  pr=next((v for v in pd['pairs'] if v['speciesId']==sp),None);prior=pr['displayStatus'] if pr else pd['pairResolution']['defaultDisplayStatus'];assert prior==discovery[pair]['priorStatus'] and prior not in ['verified-present','verified-absent']
  baselines.append({'pair':pair,'path':pp,'bytes':len(pb),'sha256':sha(pb),'status':prior})
  hold=[]
  if sp=='pterygoplichthys-disjunctivus' and county['stateCode']=='FL':
   hold.append({'code':'regional-species-identity-unresolved','sourceUrl':CONTEXT_URLS[0],'reason':'USGS-authored 2012 research describes P. disjunctivus or its hybrids as widespread in peninsular Florida, while distinguishing seven examined specimens best agreeing with disjunctivus from one possible hybrid. The exact EPA taxon ID 5049 and vermiculated sailfin name are preserved, but this table supplies no diagnostic traits, voucher accession or determination history to resolve that specific introduced-species uncertainty. Hold species-level acceptance pending a defensible resolution; these particular fish are not declared hybrids.'})
  for v in records:
   g=geographic(v['site'],polys[cf]);v['geographicDiagnostic']=g
   if g.get('available') and not g['insideGeneralizedPublisherCounty']:outside.append({'pair':pair,'fishIndex':v['fish']['index'],'siteIndex':v['site']['index'],'gnisName':v['site']['fields']['GNIS_NAME'],'narsName':v['site']['fields']['NARS_NAME'],'borderRiver':v['site']['fields']['BORD_RIV'],**g})
  strongest=sorted(qualifying,key=lambda v:(-int(v['fish']['fields']['TOTAL']),day(v['fish']['fields']['DATE_COL']),v['fish']['index']))[0] if qualifying else None
  reports.append({'pair':pair,'stateCode':county['stateCode'],'countyFips':cf,'countyName':county['shortName'],'speciesId':sp,'catalogScientificName':catalog[sp]['scientificName'],'priorStatus':prior,'proposalDecision':'held-main-resolution-required' if hold or not qualifying else 'supported-method-candidate','holds':hold,'materialRows':records,'selectedStrongestWitness':{'fishIndex':strongest['fish']['index'],'siteIndex':strongest['site']['index'],'taxonomyIndex':strongest['taxonomy']['index'],'fishRawRecordSha256':strongest['fish']['rawRecordSha256'],'total':int(strongest['fish']['fields']['TOTAL'])} if strongest else None,'selectionRule':'Greatest positive total, then oldest observation date, then lowest original fish index. All material rows remain visible; no duplicate pair progress.','countyReview':'Publisher FIPS, county name and primary postal state checked independently. Border-state metadata can name two states only under the explicit same-value border rule. Topology uses generalized boundaries solely as a conflict diagnostic.','positiveClaimLimit':'Recorded fish presence at the historical survey date only; no countywide abundance, establishment, current persistence, complete survey, absence or non-detection claim.'})
 # Check embedded acquisition history and aliases without rewriting its original recipe paths.
 nested_path='ops/national-research/evaluations/artifacts/epa-nrsa-1819-preflight-20260908-r20.json.gz';nested=json.loads(gzip.decompress(fs[nested_path]));nested_descriptors=[];nested_fs={}
 for f in nested['files']:
  b=base64.b64decode(f['contents'],validate=True);assert len(b)==f['bytes'] and sha(b)==f['sha256'];nested_fs[f['originalPath']]=b;nested_descriptors.append({k:f[k] for k in ['originalPath','bytes','sha256']})
 assert nested_fs[R20+'acquire-taxonomy-reference.cjs']==fs[R20+'acquire-taxonomy-reference.cjs']
 assert nested_fs[R20+'taxonomy-retrieval-receipt.json']==fs[R20+'taxonomy-retrieval-receipt.json']
 lineage=[]
 for name in ['candidate-preflight.json','candidate-preflight.exact-five-digit-initial.json','candidate-preflight.numeric-fips-border-hold.json']:
  obj=json.loads(fs[R21+name]);pin=obj['recipe'];matches=[k for k,v in fs.items() if sha(v)==pin['sha256']];assert matches
  lineage.append({'artifact':R21+name,'originalRecipeDeclaration':pin,'retainedMatchingRecipePaths':matches,'qualification':'Historical recipe path aliases are preserved. The matching retained bytes, not a rewritten path declaration, prove the executed version.'})
 supported=[r['pair'] for r in reports if r['proposalDecision']=='supported-method-candidate'];held=[r['pair'] for r in reports if r['proposalDecision']!='supported-method-candidate'];allrows=[v for r in reports for v in r['materialRows']]
 source_metadata=[]
 for path,b in decoded.items():
  if '_meta_' in path:source_metadata.append({'sourcePath':path,'decodedSha256':sha(b),'decodedBytes':len(b),'originalTextLatin1':b.decode('latin1'),'qualification':'Metadata spelling, blank labels, duplicated rows and provider line endings retained without editorial repair.'})
 return {'schemaVersion':1,'kind':'independent-epa-nrsa-1314-source-method-proposal','status':'proposal-ready-main-method-required','actorId':ACTOR,'jobId':LEASE['jobId'],'leaseId':LEASE['leaseId'],'branch':LEASE['branch'],'baseSha':LEASE['baseSha'],'expectedReceiptCodeCommit':LEASE['expectedReceiptCodeCommit'],'sourceAcquisitionBaseCommit':SOURCE_BASE,'taxonomyAcquisitionBaseCommit':taxacq['repositoryBaseCommit'],'skillPins':LEASE['skillPins'],'exactLeasedPairs':scope,'supportedPairs':supported,'heldPairs':held,'sourceId':'epa-nrsa-fish-counts','archive':{'path':ARCHIVE,'bytes':3412960,'sha256':ARCHIVE_SHA,'all19EmbeddedDescriptorsVerified':descriptors},'nestedHistoricalArchive':{'path':nested_path,'verifiedDescriptors':nested_descriptors,'taxonomyRecipeAndReceiptByteParity':True,'originalLineageQualification':json.loads(nested_fs[R20+'taxonomy-acquisition-lineage-qualification.json'])},'historicalRecipeAliasAudit':lineage,'sourceReceipts':source_receipts,'sourceMetadata':source_metadata,'sourceProfiles':[fishprofile,siteprofile,taxprofile],'sourceEncodingAudit':{'siteNonAsciiByteCounts':{'241':2},'siteStrictUtf8DecodeFails':True,'siteLatin1ReencodesExactly':True,'originalNonAsciiSiteRows':nonascii,'meaning':'Specific byte-pinned site file only. This is not permission for automatic encoding guesses on future sources.'},'catalogDescriptor':{'path':'src/data/generated/species.json','bytes':len(catalogbytes),'sha256':sha(catalogbytes)},'countyRegistryDescriptor':{'path':'src/data/research/county-equivalent-registry.json','bytes':len(countybytes),'sha256':sha(countybytes),'source':registry['source'],'coordinateDerivationAllowed':False},'topologyDiagnostic':topology,'outOfGeneralizedCountyDiagnostics':outside,'reviewedTaxonCrosswalk':crosswalk_report,'nonCrosswalkTaxonDiagnostics':source_taxon_exclusions,'baselinePairFiles':baselines,'pairReviews':reports,'sourceContext':{'retainedResponses':contexts,'webToolRequests':[{'kind':'search-query','query':'site.nas.er.usgs.gov Pterygoplichthys disjunctivus Florida hybrid identification'},{'kind':'search-query','query':'site.nas.er.usgs.gov Pterygoplichthys anisitsi Texas identification'},{'kind':'open','url':CONTEXT_URLS[0],'result':'USGS primary publication abstract retrieved'},{'kind':'open','url':'https://fishesoftexas.org/documentation/scientific-names/','result':'403 Forbidden; no bypass or retry and not an acceptance or hold basis'}],'accounting':{'webToolQueriesOrOpens':4,'newProgrammaticContextGets':4,'totalActualPublicContextRequests':8,'manualContextRepeatsAfterLocalTelemetryFailure':2,'maximumAllowed':8,'bulkSourceRequests':0,'automaticRetries':0,'providerWrites':0,'authenticationInteractions':0},'texasAnisitsiReview':'EPA ID 5026 explicitly maps to Pterygoplichthys anisitsi. USGS documents this species in Texas and distinguishes its identification. A failed Fishes of Texas page and generic possible hybridization do not overturn these exact EPA determinations. No specimen identity correction is claimed.'},'counts':{'leasedPairs':len(scope),'supportedMethodCandidatePairs':len(supported),'heldPairs':len(held),'materialFishSiteRows':len(allrows),'distinctOriginalFishRows':len({v['fish']['index'] for v in allrows}),'distinctOriginalSiteRows':len({v['site']['index'] for v in allrows}),'distinctOriginalTaxonomyRows':len({v['taxonomy']['index'] for v in allrows if v['taxonomy']}),'qualifyingRowsBeforeContextHolds':sum(v['qualifiesBeforeTaxonContextHold'] for v in allrows),'rejectedMaterialRows':sum(not v['qualifiesBeforeTaxonContextHold'] for v in allrows),'newCanonicalAssertions':0,'newCanonicalReviews':0,'newCanonicalRejections':0,'newCanonicalOutcomes':0,'newCanonicalDeterminations':0,'baselineDeterminations':0,'finalDeterminations':0,'netDeterminations':0},'blocker':'MAIN must review and register the new source-method contract before creating any canonical run. A completed immutable evidence-run manifest cannot honestly be emitted for this multi-state shared-method proposal.','verification':{'frozenWorkerPreflight':{'ok':True,'command':'node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease <b-lease.json> --repo <isolated-worktree>','head':LEASE['baseSha']},'allOuterAndEmbeddedHashesVerified':True,'allSixDecodedSourceHashesVerified':True,'allLeasedDiscoveryWitnessesIndependentlyReconstructed':True,'allMaterialRowsRetainedIncludingContradictoryRows':True,'noCanonicalRunOrCompletedManifestFabricated':True},'semanticAttestation':{'sourceSilenceCreatedNegative':False,'failedRequestCreatedNegative':False,'rejectionCreatedNegative':False,'missingGeographyCreatedDetermination':False,'incompleteScopeMarkedComplete':False,'coordinateReassignmentPerformed':False},'executionQualifications':[{'stage':'Second local generation after two successful context responses','error':'AssertionError at PeakWorkingSetSize > 0','resolution':'Specified Win32 pointer-width function signatures for GetCurrentProcess and GetProcessMemoryInfo. No proposal was emitted. The two context responses were fetched again manually within the remaining two-request allowance; both successful earlier reads count toward the eight-request cap.'},{'stage':'Initial local generation before context acquisition','error':"KeyError: 'status'",'resolution':'Read actual county projection field displayStatus and sparse defaultDisplayStatus. No network requests or proposal output occurred in the failed attempt.'},{'stage':'Sparse checkout documentation reads','error':'Some historical guidance files were absent from sparse worktree','resolution':'Read their exact HEAD blobs with git show; no sparse checkout mutation.'},{'stage':'Archive inventory diagnostic','error':'Initial metadata filter omitted the contents field and produced oversized base64 diagnostic output','resolution':'Subsequent inventory printed only exact descriptor keys; no artifact bytes changed.'}],'reproduction':'--verify reconstructs every source-derived proposal field offline from original archive bytes and immutable worktree inputs. Historical timestamps, context response bytes and original execution telemetry are retained observations, hash-checked and reused rather than falsely claiming identical fresh elapsed time or memory.'}
def main():
 args=argparse.ArgumentParser();args.add_argument('--verify',action='store_true');args.add_argument('--acquire-context',action='store_true');opt=args.parse_args();assert not (opt.verify and opt.acquire_context)
 old=json.loads(OUT.read_bytes()) if OUT.exists() else None
 if opt.verify:assert old is not None
 else:assert old is None,'Refuse to overwrite an existing proposal; investigate or use --verify.'
 result=build([])
 memory()
 records=context(opt.acquire_context,old)
 result['sourceContext']['retainedResponses']=records
 texts=[html.unescape(re.sub('<[^>]+>',' ',gzip.decompress(base64.b64decode(r['bodyGzipBase64'])).decode('utf-8',errors='strict'))) for r in records]
 assert 'hybrids' in texts[0] and 'peninsular Florida' in texts[0]
 assert 'anisitsi' in texts[1] and 'Texas' in texts[1]
 if opt.verify:
  result['recordedAt']=old['recordedAt'];result['performance']=old['performance'];assert result==old,'Offline proposal reconstruction differs'
  assert encoded(result)==OUT.read_bytes(),'Proposal byte serialization differs'
 else:
  result['recordedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();result['performance']={'scriptElapsedSeconds':round(time.perf_counter()-START,6),**memory(),'reservationMiB':384,'workerReviewStartedAt':'2026-09-08T22:46:03Z','workerReviewElapsedSeconds':round((datetime.datetime.now(datetime.timezone.utc)-datetime.datetime(2026,9,8,22,46,3,tzinfo=datetime.timezone.utc)).total_seconds(),3),'scope':'Actual original recipe execution telemetry, with total agent review wall time reported separately.'}
  b=encoded(result);assert len(b)+pathlib.Path(__file__).stat().st_size<=8388608;OUT.write_bytes(b)
 print(json.dumps({'ok':True,'mode':'verify' if opt.verify else 'generate','counts':result['counts'],'proposalBytes':OUT.stat().st_size,'proposalSha256':sha(OUT.read_bytes()),'recipeBytes':pathlib.Path(__file__).stat().st_size,'recipeSha256':sha(pathlib.Path(__file__).read_bytes()),'freshExecutionSeconds':round(time.perf_counter()-START,6),**memory(),'geographicOutsideRows':len(result['outOfGeneralizedCountyDiagnostics'])},indent=2))
if __name__=='__main__':main()
