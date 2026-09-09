"""Independent offline FL selected-original review; Python standard library only.
--verify rebuilds all evidence fields and compares exact proposal bytes. Historical
first-generation telemetry is carried unchanged and separately range-checked.
No source acquisition, MAIN code imports, events, runs, or projection generation.
"""
import argparse, base64, collections, ctypes, datetime, gzip, hashlib, json
import pathlib, re, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parents[5]
OUT = pathlib.Path(__file__).resolve().parent
ACTOR = 'ebird_monk_fl_review_r23'
JOB = 'ebird-monk-fl-original-review-20260909-r23'
BASE = 'f34b7b1868250986043594913ed49f1a36b3b9dd'
ACQ_BASE = '0a451f65a2c46fde2102ceeb1c7eee3017aafb0f'
DS = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
SP = 'myiopsitta-monachus'
NAME = 'Myiopsitta monachus'
STATUS = 'proposal-ready-main-method-required'
FIPS = ['12009','12011','12015','12021','12057','12069','12071','12073','12081','12085','12087','12095','12097','12099','12101','12103','12105','12115','12117','12129']
PAIRS = [x+':'+SP for x in FIPS]
KEYS = [5304163896,5311168910,5321735154,5322368993,5325388241,5326013332,5329386983,5335440102,5345335827,5351674450,5356253624,5373134805,5380142733,5389887075,5402404813,5403211821,5412932310,5418470841,5435408941,5441921548,5443376901,5445865917,5447817953,5448889286,5453316760,5461674469,5463927511,5469724287,5475778473,5477626179,5508844764,5510448781,5533415279,5541895200,5570655078,5665117015,5671398642,5695503034]
INPUTS = ['ebird-monk-selected-originals-20260909-r23','ebird-monk-partial-public-slice-20260909-r22','ebird-eod-public-metadata-20260909-r19','ebird-eod-original-field-pilot-20260909-r19']
DWC = 'http://rs.tdwg.org/dwc/terms/'
LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode'
SAFE_ISSUES = {'CONTINENT_DERIVED_FROM_COORDINATES','TAXON_CONCEPT_ID_NOT_FOUND'}
START = time.perf_counter()

def sha(b): return hashlib.sha256(b).hexdigest()
def js(b): return json.loads(b.decode('utf-8-sig'))
def enc(d): return (json.dumps(d,ensure_ascii=True,sort_keys=True,indent=2)+'\n').encode('utf-8')
def desc(p,b): return {'path':p,'bytes':len(b),'sha256':sha(b)}
def peak_mb():
    class PMC(ctypes.Structure):
        _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(x,ctypes.c_size_t) for x in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
    p=PMC();p.cb=ctypes.sizeof(p)
    k=ctypes.WinDLL('kernel32');k.GetCurrentProcess.restype=ctypes.c_void_p
    ps=ctypes.WinDLL('psapi');ps.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ulong]
    assert ps.GetProcessMemoryInfo(k.GetCurrentProcess(),ctypes.byref(p),p.cb)
    return round(p.PeakWorkingSetSize/1048576,3)
def walk(x):
    if isinstance(x,dict):
        yield x
        for v in x.values():yield from walk(v)
    elif isinstance(x,list):
        for v in x:yield from walk(v)
def ctx(text):
    t=text.lower();out=[]
    if re.search(r'\b(home|yard|residence|private personal)\b',t):out.append('residential-locality-not-captivity')
    if re.search(r'\bzoo\b',t):out.append('zoo-locality-not-captivity')
    if 'sanctuary' in t:out.append('sanctuary-locality-not-captivity')
    if 'colony' in t:out.append('colony-label-not-establishment-proof')
    if 'more precise location' in t:out.append('broad-locality-county-only')
    if re.search(r'do\s+not\s+report\s+captive\s+birds',t):out.append('captive-prohibition-label-not-captivity')
    clean=re.sub(r'do\s+not\s+report\s+captive\s+birds','',t)
    if re.search(r'\b(captive|caged|aviary|pet|escaped|escapee|domestic)\b',clean):out.append('explicit-context-needs-review')
    return out

def build(telemetry=None):
    docs={};blobs={};descriptors=[];outer=[];alljson=[]
    for name in INPUTS:
        path='ops/national-research/evaluations/'+name+'.json'
        b=(ROOT/path).read_bytes();d=js(b);docs[name]=d;outer.append(desc(path,b));alljson.append(d)
        ad=d['artifact'];ab=(ROOT/ad['path']).read_bytes()
        assert len(ab)==ad['bytes'] and sha(ab)==ad['sha256'],ad['path']
        outer.append(desc(ad['path'],ab));archive=js(gzip.decompress(ab))
        if 'files' in ad:assert len(archive['files'])==ad['files']
        for f in archive['files']:
            p=f['originalPath'];b=base64.b64decode(f['contents'],validate=True)
            assert len(b)==f['bytes'] and sha(b)==f['sha256'],p
            decoded=gzip.decompress(b) if p.endswith('.gz') else b
            de={**desc(p,b),'archivePath':ad['path'],'decodedBytes':len(decoded),'decodedSha256':sha(decoded)}
            descriptors.append(de)
            # Keep compressed source pages; process one decoded page at a time below.
            if '/page-' in p:blobs[p]=b
            elif p.endswith('.json.gz') or p.endswith('receipt.json'):
                obj=js(decoded);alljson.append(obj);blobs[p]=b
            elif '/method-context-' in p and '.raw.gz' in p:blobs[p]=b
        del archive,ab
    bypath={d['path']:d for d in descriptors}
    # Check every available descriptor reference, including decoded source hashes.
    reference_checks=0;lineage_only=[]
    for doc in alljson:
        for obj in walk(doc):
            p=obj.get('path')
            if not p or not obj.get('sha256'):continue
            de=bypath.get(p)
            if de is None:
                if (ROOT/p).is_file() and not p.startswith('.cache/'):
                    bb=(ROOT/p).read_bytes();de=desc(p,bb)
                else:
                    lineage_only.append({k:obj[k] for k in ['path','bytes','sha256'] if k in obj});continue
            for k in ['bytes','sha256','decodedBytes','decodedSha256']:
                if k in obj:assert obj[k]==de[k],(p,k)
            reference_checks+=1
    def load(p):
        b=blobs[p];return js(gzip.decompress(b) if p.endswith('.gz') else b)
    sm=docs[INPUTS[0]];partial=docs[INPUTS[1]]
    acquisition=load(sm['acquisition']['path'])
    assert acquisition['repositoryBaseCommit']==ACQ_BASE and acquisition['completed'] is True
    assert len(acquisition['selection'])==len(acquisition['responses'])==141
    assert acquisition['errors']==[] and acquisition['automaticRetries']==0
    selected={x['key']:x for x in acquisition['selection'] if x['pair'] in PAIRS}
    assert sorted(selected)==KEYS
    requests={x['key']:x for x in acquisition['responses']}
    source_receipts=[load(x['path']) for x in acquisition['parentSourceReceipts']]
    pages=sorted([x for d in source_receipts for x in d['responses']],key=lambda x:x['page'])
    assert len(pages)==50 and [x['page'] for x in pages]==list(range(50))
    regpath='src/data/research/county-equivalent-registry.json';rb=(ROOT/regpath).read_bytes();reg=js(rb)
    active=[c for c in reg['countyEquivalents'] if c['stateCode']=='FL' and c['status']=='active']
    def county(text):
        matches=[c for c in active if text in set([c['shortName'],c['legalName']]+c.get('aliases',[]))]
        return matches[0]['countyFips'] if len(matches)==1 else None
    county_info={c['countyFips']:c for c in active if c['countyFips'] in FIPS}
    summaries={p:{'pairKey':p,'county':county_info[p[:5]]['shortName'],'inventory':[],'issues':collections.Counter(),'context':collections.Counter(),'variants':collections.defaultdict(collections.Counter),'contradictions':[],'missingGadmKeys':[],'contextRows':[],'identityVariantRows':[]} for p in PAIRS}
    selected_rows={};seen=set();occurrence_seen=set();total=0;page_desc=[]
    checks=lambda r: []
    def interpreted_checks(r):
        bad=[]
        for k,v in {'datasetKey':DS,'species':NAME,'taxonKey':2479407,'acceptedTaxonKey':2479407,'speciesKey':2479407,'taxonRank':'SPECIES','taxonomicStatus':'ACCEPTED','basisOfRecord':'HUMAN_OBSERVATION','occurrenceStatus':'PRESENT','countryCode':'US','stateProvince':'Florida','license':LICENSE,'year':2024}.items():
            if r.get(k)!=v:bad.append('interpreted-'+k+'-conflict')
        try:
            date=datetime.date(int(r['year']),int(r['month']),int(r['day'])).isoformat()
            if r['eventDate']!=date:bad.append('interpreted-eventDate-conflict')
        except (KeyError,ValueError,TypeError):bad.append('interpreted-invalid-date')
        if not re.fullmatch(r'URN:catalog:CLO:EBIRD(?:_ATL_[A-Z_]+)?:OBS\d+',r.get('occurrenceID','')):bad.append('interpreted-weak-occurrence-id')
        if str(r.get('gbifID'))!=str(r['key']):bad.append('interpreted-gbifID-conflict')
        if r.get('catalogNumber')!=r.get('identifier') or r.get('occurrenceID')!='URN:catalog:'+str(r.get('institutionCode'))+':'+str(r.get('collectionCode'))+':'+str(r.get('catalogNumber')):bad.append('interpreted-catalog-identity-conflict')
        if r.get('individualCount') is not None and r['individualCount']<=0:bad.append('nonpositive-count')
        if set(r.get('issues',[]))-SAFE_ISSUES:bad.append('unresolved-issue')
        for ns,cl in r.get('classifications',{}).items():
            a=cl.get('acceptedUsage',{})
            if cl.get('taxonomicStatus')!='ACCEPTED' or a.get('rank')!='SPECIES' or a.get('genericName')!='Myiopsitta' or a.get('specificEpithet')!='monachus':bad.append('classification-conflict:'+ns)
        if not r.get('classifications'):bad.append('classifications-missing')
        gadm=r.get('gadm',{})
        if gadm.get('level1',{}).get('name') not in [None,'Florida']:bad.append('gadm-state-conflict')
        if gadm.get('level2',{}).get('name') not in [None,r['county']]:bad.append('gadm-county-conflict')
        if ctx(' '.join(str(r.get(k,'')) for k in ['locality','occurrenceRemarks','eventRemarks','dynamicProperties','establishmentMeans','degreeOfEstablishment'])).count('explicit-context-needs-review'):bad.append('explicit-context-needs-review')
        return bad
    dec=json.JSONDecoder()
    for page in pages:
        assert page['status']==200 and page['offset']==page['page']*300 and page['declaredCount']==21878 and page['endOfRecords'] is False
        raw=gzip.decompress(blobs[page['path']]);assert sha(raw)==page['decodedSha256'] and len(raw)==page['decodedBytes']
        text=raw.decode('utf-8');parsed=js(raw)
        assert parsed['offset']==page['offset'] and parsed['count']==21878 and len(parsed['results'])==300 and parsed['endOfRecords'] is False
        cursor=re.search(r'"results"\s*:\s*\[',text).end();last=0;bytepos=0
        for idx,r in enumerate(parsed['results']):
            while text[cursor] in ' \r\n\t,':cursor+=1
            _,end=dec.raw_decode(text,cursor)
            bytepos+=len(text[last:cursor].encode('utf-8'));rowbytes=text[cursor:end].encode('utf-8')
            loc={'key':r['key'],'page':page['page'],'rowIndex':idx,'decodedByteOffset':bytepos,'decodedByteLength':len(rowbytes),'rawRowSha256':sha(rowbytes)}
            last=cursor;cursor=end
            assert r['key'] not in seen and r['occurrenceID'] not in occurrence_seen
            seen.add(r['key']);occurrence_seen.add(r['occurrenceID']);total+=1
            cf=county(r.get('county')) if r.get('stateProvince')=='Florida' else None
            pair=(cf+':'+SP) if cf else None
            if pair not in summaries:continue
            s=summaries[pair];s['inventory'].append(loc);s['issues'].update(r.get('issues',[]));tags=ctx(' '.join(str(r.get(k,'')) for k in ['locality','occurrenceRemarks','eventRemarks','dynamicProperties','establishmentMeans','degreeOfEstablishment']));s['context'].update(tags)
            for field in ['basisOfRecord','occurrenceStatus','species','taxonKey','taxonomicStatus','year','license','institutionCode','collectionCode','individualCount','coordinateUncertaintyInMeters','establishmentMeans','http://unknown.org/status','http://unknown.org/crawl_attempt','http://unknown.org/omitFromScheduledCrawl']:
                s['variants'][field][str(r.get(field))]+=1
            bad=interpreted_checks(r)
            if bad:s['contradictions'].append({'key':r['key'],'reasons':bad,'locality':r.get('locality')})
            if not r.get('gadm',{}).get('level2',{}).get('name'):s['missingGadmKeys'].append(r['key'])
            if r.get('collectionCode')!='EBIRD':s['identityVariantRows'].append({k:r.get(k) for k in ['key','institutionCode','collectionCode','occurrenceID','catalogNumber','identifier']})
            if tags:s['contextRows'].append({'key':r['key'],'locality':r.get('locality'),'tags':tags})
            if r['key'] in selected:
                q=selected[r['key']];assert q['pair']==pair and q['responsePath']==page['path'] and q['rowIndex']==idx and q['responseSha256']==page['sha256']
                selected_rows[r['key']]=(r,loc,bad)
        page_desc.append(page)
        del raw,text,parsed
    assert total==15000 and sum(len(x['inventory']) for x in summaries.values())==5557 and sorted(selected_rows)==KEYS
    # Independently reproduce preacquisition top-two selection without trusting diagnostic approvals.
    # Dates for every material row are re-read one page at a time; retain only top two per pair.
    tops={p:[] for p in PAIRS}
    for page in pages:
        for r in load(page['path'])['results']:
            cf=county(r.get('county')) if r.get('stateProvince')=='Florida' else None;p=cf+':'+SP if cf else None
            if p in tops:tops[p]=sorted(tops[p]+[(r['eventDate'],r['key'])],key=lambda x:(-int(x[0].replace('-','')),x[1]))[:2]
    assert sorted(k for top in tops.values() for date,k in top)==KEYS
    originals=[];adapter=[]
    for key in KEYS:
        req=requests[key];assert req['status']==200 and req['url']==f'https://api.gbif.org/v1/occurrence/{key}/verbatim'
        originalraw=gzip.decompress(blobs[req['path']]);o=js(originalraw);r,loc,bad=selected_rows[key];bad=list(bad);g=lambda k:o.get(DWC+k)
        for field,value in {'scientificName':NAME,'country':'United States','stateProvince':'Florida','basisOfRecord':'HumanObservation','occurrenceStatus':'PRESENT','institutionCode':'CLO','collectionCode':'EBIRD','genus':'Myiopsitta','specificEpithet':'monachus'}.items():
            if g(field)!=value:bad.append('original-'+field+'-conflict')
        if o.get('key')!=key or o.get('datasetKey')!=DS or o.get('http://rs.gbif.org/terms/1.0/gbifID')!=str(key):bad.append('original-dataset-or-key-conflict')
        if county(g('county'))!=selected[key]['pair'][:5] or g('county')!=r['county']:bad.append('original-county-conflict')
        for field in ['occurrenceID','catalogNumber','locality','recordedBy','geodeticDatum','taxonConceptID']:
            if g(field)!=r.get(field):bad.append('original-interpreted-'+field+'-conflict')
        if o.get('http://purl.org/dc/terms/identifier')!=r['identifier']:bad.append('original-identifier-conflict')
        for field in ['decimalLatitude','decimalLongitude']:
            if float(g(field))!=r.get(field):bad.append('original-coordinate-conflict')
        try:
            date=datetime.date(int(g('year')),int(g('month')),int(g('day'))).isoformat()
            if date!=r['eventDate']:bad.append('original-date-conflict')
        except (ValueError,TypeError):bad.append('original-invalid-date');date=None
        if g('individualCount') not in ['X',None] and int(g('individualCount'))!=r.get('individualCount'):bad.append('original-count-conflict')
        tags=ctx(' '.join(str(g(k) or '') for k in ['locality','occurrenceRemarks','eventRemarks','dynamicProperties','establishmentMeans','degreeOfEstablishment']))
        if 'explicit-context-needs-review' in tags:bad.append('original-explicit-context-needs-review')
        for field in ['http://unknown.org/status','http://unknown.org/crawl_attempt','http://unknown.org/omitFromScheduledCrawl']:
            if o.get(field)!=r.get(field):bad.append('opaque-metadata-conflict')
        originals.append({'key':key,'pairKey':selected[key]['pair'],'disposition':'held' if bad else 'supported','holdReasons':sorted(set(bad)),'claimSupported':'recorded-present' if not bad else None,'request':req,'selectionLineage':selected[key],'originalResponseDecodedBase64':base64.b64encode(originalraw).decode('ascii'),'originalFields':o,'interpretedLocator':loc,'interpretedFields':r,'sourceDate':date,'localityContextTags':tags,'reviewReason':'Exact publisher county/state, exact original binomial and accepted classifications, positive observation, stable identifiers, matching date and coordinates, and CC BY 4.0 interpreted/dataset license.' if not bad else 'Retain explicit contradictions; no replacement original acquired.','caveats':['Historical 2024 occurrence only.','No individual human approval or captive=false field is claimed.','Missing coordinate uncertainty does not invalidate explicit publisher county.','Opaque source metadata retained under dataset-level qualified context.']})
    for pair in PAIRS:
        records=[x for x in originals if x['pairKey']==pair];supported=sorted([x for x in records if x['disposition']=='supported'],key=lambda x:(-int(x['sourceDate'].replace('-','')),x['key']))
        adapter.append({'pairKey':pair,'primaryKey':supported[0]['key'] if supported else None,'recordKeys':sorted(x['key'] for x in records),'heldKeys':sorted(x['key'] for x in records if x['disposition']=='held'),'disposition':'supported' if supported else 'held'})
    metapath=next(p for p in blobs if '/taxonomy-discovery-' in p and p.endswith('/dataset.json.gz'))
    dataset=load(metapath);taxpath=next(p for p in blobs if '/taxonomy-discovery-' in p and p.endswith('/myiopsitta-monachus.json.gz'));tax=load(taxpath)
    assert tax['usageKey']==2479407 and tax['canonicalName']==NAME and tax['status']=='ACCEPTED' and tax['matchType']=='EXACT'
    assert dataset['key']==DS and dataset['license']==LICENSE
    contexts=[]
    for p in blobs:
        if '/method-context-' in p and p.endswith('/receipt.json'):
            contexts=load(p)['responses'];assert len(contexts)==5
    for p,s in summaries.items():
        s['inventory'].sort(key=lambda x:x['key']);s['missingGadmKeys'].sort();s['contextRows'].sort(key=lambda x:x['key']);s['contradictions'].sort(key=lambda x:x['key']);s['identityVariantRows'].sort(key=lambda x:x['key'])
        s['interpretedRowCount']=len(s['inventory']);s['originalsReviewed']=len([k for k in KEYS if selected[k]['pair']==p]);s['additionalInterpretedRows']=s['interpretedRowCount']-s['originalsReviewed']
        s['additionalOriginalDisposition']='not-acquired-not-approved';s['scopeComplete']=False
    if telemetry is None:telemetry={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'recipeElapsedSecondsToAssembly':round(time.perf_counter()-START,3),'recipePeakWorkingSetMiBToAssembly':peak_mb(),'leaseElapsedSecondsAtAssembly':round((datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat('2026-09-09T02:50:37.634+00:00')).total_seconds(),3),'leaseElapsedQualification':'Elapsed since lease claim, including interrupted time; not CPU or uninterrupted active-review time.','measurement':'Windows GetProcessMemoryInfo peak working set; whole verification runtime separately reported on stdout.'}
    assert telemetry['recipePeakWorkingSetMiBToAssembly']<384
    proposal={'schemaVersion':1,'kind':'independent-selected-original-evidence-review-proposal','status':STATUS,'jobId':JOB,'leaseId':'lease-'+JOB+'-1','actorId':ACTOR,'baseSha':BASE,'branch':'codex/'+JOB,'sourceId':'gbif-ebird','adapterReview':{'actorId':ACTOR,'baseSha':BASE,'status':STATUS,'pairs':adapter},'preflight':{'ok':True,'head':BASE,'errors':[],'command':'node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease <MAIN-provided fl-r23-lease.json> --repo <isolated leased worktree>','rerunOnResume':True,'skillPins':{'orchestrator':'9f934116bc4f1ad80b3b61d805f4ad4c0070773ed3040c28e96098c74d888757','worker':'52f13ef7e2574a6428701c0fcc9d0512e313fe639adf826888490ce5a38a6b8b'}},'sourceDescriptors':{'outer':outer,'embedded':sorted(descriptors,key=lambda x:(x['archivePath'],x['path'])),'checkedAvailableReferences':reference_checks,'lineageOnlyUnretainedReferences':sorted({json.dumps(x,sort_keys=True):x for x in lineage_only}.values(),key=lambda x:x['path']),'countyRegistry':desc(regpath,rb)},'acquisitionLineage':{'codeCommit':ACQ_BASE,'receipt':sm['acquisition'],'recipe':sm['recipe'],'selectedOriginalsAcquiredAllScopes':141,'selectedOriginalsReviewedThisScope':38,'startedAt':acquisition['startedAt'],'finishedAt':acquisition['finishedAt'],'automaticRetries':0,'selection':'Independently reproduced up to two latest retained dates per pair, ties ascending numeric key; no replacement after acquisition.'},'sourceSearch':{'sourceYear':2024,'parameters':partial['parameters'],'declaredRows':21878,'retainedRows':15000,'unretrievedRows':6878,'paginationComplete':False,'sourceFamilyScreenComplete':False,'terminalPages':0,'pageResponses':page_desc,'stops':partial['stops'],'qualification':'Only retained interpreted rows and fixed selected originals were reviewed. Mutable partial search does not complete any county source-family screen and supports no negatives.'},'sourceMethodContext':{'datasetDescriptor':bypath[metapath],'datasetFacts':{k:dataset[k] for k in ['key','title','publishingOrganizationKey','pubDate','license','temporalCoverages','machineTags','citation','endpoints']},'taxonomyDescriptor':bypath[taxpath],'taxonomyMatch':tax,'methodContextResponses':contexts,'independentFindings':['Publisher county text in its explicit Florida state maps uniquely to active registry county; coordinates are compared only, never used to assign counties.','Eleven additional interpreted records use EBIRD_ATL collection-code namespaces. Their occurrence URNs agree with their own institution, collection and catalog fields; namespace text is not county authority. Originals for these records remain unacquired and unapproved.','The two retained accepted classifications agree on Myiopsitta monachus. TAXON_CONCEPT_ID_NOT_FOUND does not erase the exact binomial match; the unresolved avibase concept identifier is retained.','Original http://unknown.org/status=not_reviewed and crawl fields match older dataset-level machine-tag names/values. This is contextual evidence of metadata origin, not proof of individual reviewer approval or rejection.','eBird rules describe wild living unrestrained birds and exclude captive birds; dataset policy alone is not a per-record captive=false attestation.','Residential, sanctuary and zoo locality names do not establish captivity. The three interpreted do-not-report-captive-birds labels are instructions within locality names, not affirmative captive observations.','License is explicit CC BY 4.0 in retained dataset and interpreted records; verbatim occurrence response has no independent license field. Attribution remains Cornell Lab of Ornithology via GBIF EOD and its retained citation.','2024 annual records published in 2025 and retrieved in 2026 establish historical recorded occurrence only, not persistence, establishment, abundance, invasive impact or current status.'],'methodRegistration':'MAIN must evaluate/register selected-positive-witness acquisition semantics; existing complete-source method does not establish a completed partial-search screen.'},'originalReviews':originals,'interpretedReview':{'scopeRows':5557,'originalsReviewed':38,'additionalInterpretedRows':5519,'additionalOriginalsAcquiredOrApproved':0,'rowLocatorFormat':'Zero-based page and results array rowIndex; decoded UTF-8 byte offset/length and exact raw row hash. pageResponses resolves page to exact response path, source URL, retrieval and compressed/decoded hashes.','pairs':[summaries[p] for p in PAIRS]},'counts':{'selectedPairs':20,'selectedOriginals':38,'supportedOriginals':sum(x['disposition']=='supported' for x in originals),'heldOriginals':sum(x['disposition']=='held' for x in originals),'supportedPairs':sum(x['disposition']=='supported' for x in adapter),'heldPairs':sum(x['disposition']=='held' for x in adapter),'materialInterpretedRows':5557,'canonicalEvents':0,'canonicalRuns':0,'newDeterminations':0,'completedSourceScreens':0,'networkRequests':0,'providerWrites':0},'reproducibility':{'recipe':'review.py','command':'python src/data/research/worker-results/'+JOB+'/review.py --verify','importsMainCode':False,'network':False,'verification':'Rebuilds all source inventories, checks byte/hash witnesses and matched selected originals, reruns independent rule decisions, and compares byte-identical proposal. Historical generation telemetry is carried unchanged, not falsely remeasured.','processing':'One decoded interpreted page at a time. All archives and their embedded stored hashes checked, including out-of-scope material integrity only.'},'performance':telemetry,'remainingMainWork':['Independently accept or hold this proposal and register/evaluate the partial-search selected-witness method.','Create canonical events only through MAIN-reviewed method; reconcile unique county-species changes against current baseline.','Source-family scope remains incomplete. No absence or non-detection conclusions.']}
    return proposal

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--verify',action='store_true');args=ap.parse_args();target=OUT/'proposal.json'
    saved=js(target.read_bytes()) if args.verify else None
    result=build(saved['performance'] if saved else None);data=enc(result)
    assert len(data)<8*1024*1024 and peak_mb()<384
    if args.verify:assert data==target.read_bytes(),'proposal reproduction differs'
    else:target.write_bytes(data)
    print(json.dumps({'ok':True,'mode':'verify' if args.verify else 'generate','proposalSha256':sha(data),'proposalBytes':len(data),'counts':result['counts'],'elapsedSeconds':round(time.perf_counter()-START,3),'peakWorkingSetMiB':peak_mb()}))
if __name__=='__main__':main()
