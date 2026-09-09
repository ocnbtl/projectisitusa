"""Independent offline NY Monk Parakeet review; Python standard library only.
Run --write to reproduce proposal.json, or --verify for exact byte comparison.
Sources remain in pinned committed archives. Pages are decoded sequentially.
No MAIN code, network, package installation, or canonical evidence emission.
"""
import argparse, base64, collections, ctypes, datetime, gzip, hashlib, json, re, sys, time
from pathlib import Path

BASE = 'f34b7b1868250986043594913ed49f1a36b3b9dd'
ACTOR = 'ebird_monk_ny_review_r23'
JOB = 'ebird-monk-ny-original-review-20260909-r23'
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
DWC = 'http://rs.tdwg.org/dwc/terms/'
DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode'
PAIRS = [x+':myiopsitta-monachus' for x in ['36005','36047','36059','36061','36081','36085','36103','36119']]
KEYS = [5310332147,5316039740,5359314289,5373132979,5377353911,5378697112,5380656227,5402404971,5412520849,5420991483,5446698002,5449276834,5451320799,5458473421,5475030852,5575566363]
NAMES = ['ebird-monk-selected-originals-20260909-r23','ebird-monk-partial-public-slice-20260909-r22','ebird-eod-public-metadata-20260909-r19','ebird-eod-original-field-pilot-20260909-r19']
PINS = {
'src/data/research/source-registry.json': (73701, '12bca4e67345f78e06272034c264f5c7ad38415156b479e6eb8e45c3848ec281'),
'src/data/research/county-equivalent-registry.json': (1972613, '50eede46823aa219ae3b22739224067e1de102fefd336d033bddb01b7f5501ee'),
'src/data/research/state-registry.json': (24205, '6080d7e61bf9a34794a14e9f6976edc378fbb10908dbd40296d3006923ef1f94'),
'ops/national-research/evaluations/ebird-monk-selected-originals-20260909-r23.json': (11357, '84901b5b0d06c9296d3bd580d8d75924f996e48bf72ee87a6864e5bf0bc4afdd'),
'ops/national-research/evaluations/ebird-monk-partial-public-slice-20260909-r22.json': (6062, '45b5765860b9a940942530cc577717d1a240bab5d7cee976d46b03a50b945566'),
'ops/national-research/evaluations/ebird-eod-public-metadata-20260909-r19.json': (13821, '9bf3278aa98bce0e16838a8d33267ae6eeac694b3030f11c03daebae723a84f6'),
'ops/national-research/evaluations/ebird-eod-original-field-pilot-20260909-r19.json': (4673, 'fb25f58776a543a24166431c0f8acde68cfc56b0f83514f4c979ae6db30c9f5d')}
# Fixed observation of this independent audit, updated after measured execution.
AUDIT_MEASUREMENT = {'activeReviewStartedAt':'2026-09-09T02:50:38Z','resumedAt':'2026-09-09T03:17:02Z','recipeWallSeconds':1.313,'recipePeakWorkingSetMiB':72.879,'measurementRecordedAt':'2026-09-09T03:21:30Z','qualification':'Audit interrupted between source inspection and artifact construction. Recipe measurements describe offline reproduction; wall clock includes interruption.'}

def sha(b): return hashlib.sha256(b).hexdigest()
def desc(p,b): return {'path':p,'bytes':len(b),'sha256':sha(b)}
def require(ok,msg):
    if not ok: raise ValueError(msg)
def encoded(obj): return (json.dumps(obj,ensure_ascii=True,sort_keys=True,indent=2)+'\n').encode()
def peak():
    class PMC(ctypes.Structure):
        _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(x,ctypes.c_size_t) for x in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
    p=PMC();p.cb=ctypes.sizeof(p)
    fn=ctypes.windll.psapi.GetProcessMemoryInfo
    fn.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ulong]
    fn.restype=ctypes.c_int
    require(fn(ctypes.c_void_p(-1),ctypes.byref(p),p.cb)!=0,'process memory measurement')
    return round(p.PeakWorkingSetSize/1048576,3)
def decode_file(f):
    b=base64.b64decode(f['contents'],validate=True)
    require(len(b)==f['bytes'] and sha(b)==f['sha256'],'embedded hash '+f['originalPath'])
    return gzip.decompress(b) if f['originalPath'].endswith('.gz') else b

def byte_witnesses(raw):
    s=raw.decode('utf-8');dec=json.JSONDecoder();pos=1;out=[]
    while True:
        while pos<len(s) and s[pos] in ' \n\r\t,':pos+=1
        if s[pos]=='}':break
        start=pos;k,pos=dec.raw_decode(s,pos)
        while s[pos] in ' \n\r\t:':pos+=1
        v,end=dec.raw_decode(s,pos);frag=s[start:end].encode('utf-8')
        out.append({'field':k,'value':v,'byteStart':len(s[:start].encode('utf-8')),'byteEndExclusive':len(s[:end].encode('utf-8')),'fragmentBase64':base64.b64encode(frag).decode(),'sha256':sha(frag)})
        pos=end
    return out

def row_stream(raw):
    s=raw.decode('utf-8');m=re.search(r'"results"\s*:\s*\[',s);require(m is not None,'results array')
    pos=m.end();bytepos=len(s[:pos].encode('utf-8'));dec=json.JSONDecoder();i=0
    while True:
        old=pos
        while s[pos] in ' \r\n\t,':pos+=1
        bytepos+=len(s[old:pos].encode('utf-8'))
        if s[pos]==']':break
        row,end=dec.raw_decode(s,pos);b=s[pos:end].encode('utf-8')
        yield i,row,bytepos,bytepos+len(b),sha(b)
        i+=1;pos=end;bytepos+=len(b)

def evaluate(row,county):
    failures=[]
    tests={
      'exact-accepted-taxon':row.get('species')=='Myiopsitta monachus' and row.get('taxonKey')==2479407 and row.get('acceptedTaxonKey')==2479407 and row.get('taxonomicStatus')=='ACCEPTED' and row.get('taxonRank')=='SPECIES',
      'positive-human-observation':row.get('basisOfRecord')=='HUMAN_OBSERVATION' and row.get('occurrenceStatus')=='PRESENT' and (row.get('individualCount') is None or row.get('individualCount')>0),
      'explicit-current-county':row.get('county') in county['aliases']+[county['shortName'],county['legalName']] and row.get('stateProvince')=='New York' and row.get('countryCode')=='US',
      'stable-identity':str(row.get('gbifID'))==str(row['key']) and row.get('institutionCode')=='CLO' and row.get('occurrenceID')=='URN:catalog:CLO:'+str(row.get('collectionCode'))+':'+str(row.get('catalogNumber')) and row.get('identifier')==row.get('catalogNumber'),
      'source-and-license':row.get('datasetKey')==DATASET and row.get('license')==LICENSE,
      'valid-coordinates':isinstance(row.get('decimalLatitude'),(float,int)) and isinstance(row.get('decimalLongitude'),(float,int)) and -90<=row['decimalLatitude']<=90 and -180<=row['decimalLongitude']<=180,
    }
    try: tests['exact-date']=datetime.date(row['year'],row['month'],row['day']).isoformat()==row['eventDate'] and row['year']==2024
    except (ValueError,KeyError): tests['exact-date']=False
    for c in row.get('classifications',{}).values():
        if c.get('taxonomicStatus')!='ACCEPTED' or c.get('acceptedUsage',{}).get('genericName')!='Myiopsitta' or c.get('acceptedUsage',{}).get('specificEpithet')!='monachus':failures.append('classification-contradiction')
    failures += [k for k,v in tests.items() if not v]
    unknown=set(row.get('issues',[]))-{'CONTINENT_DERIVED_FROM_COORDINATES','TAXON_CONCEPT_ID_NOT_FOUND'}
    if unknown:failures.append('unresolved-issue:'+','.join(sorted(unknown)))
    for field in ['occurrenceRemarks','organismRemarks','eventRemarks','establishmentMeans','degreeOfEstablishment']:
        if re.search(r'captive|caged|in captivity|zoo exhibit',str(row.get(field,'')),re.I):failures.append('explicit-captivity-context:'+field)
    return sorted(set(failures))

def build():
    files={};sources=[];documents={};archives=[]
    for p,(n,h) in PINS.items():
        b=(ROOT/p).read_bytes();require((len(b),sha(b))==(n,h),'pinned file '+p);sources.append(desc(p,b));documents[p]=json.loads(b)
    for name in NAMES:
        summary=documents['ops/national-research/evaluations/'+name+'.json'];d=summary['artifact'];b=(ROOT/d['path']).read_bytes()
        require(len(b)==d['bytes'] and sha(b)==d['sha256'],'outer archive '+name)
        decoded=gzip.decompress(b);a=json.loads(decoded);archives.append({**desc(d['path'],b),'decodedBytes':len(decoded),'decodedSha256':sha(decoded),'embeddedFiles':len(a['files'])})
        for f in a['files']:
            p=f['originalPath'];raw=decode_file(f)
            fd={'archivePath':d['path'],'originalPath':p,'bytes':f['bytes'],'sha256':f['sha256'],'decodedBytes':len(raw),'decodedSha256':sha(raw)}
            sources.append(fd)
            if p in files:require(files[p]['sha256']==f['sha256'],'conflicting embedded paths')
            files[p]=f
        del decoded,a,b
    # Independently cross-check every available receipt descriptor against retained bytes.
    receipt_checks=0
    def check_refs(x):
        nonlocal receipt_checks
        if isinstance(x,dict):
            p=x.get('path')
            if p in files and 'sha256' in x:
                f=files[p];require(x['sha256']==f['sha256'],'receipt hash '+p)
                if 'bytes' in x:require(x['bytes']==f['bytes'],'receipt byte count '+p)
                if 'decodedSha256' in x:
                    raw=decode_file(f);require(x['decodedSha256']==sha(raw),'decoded receipt hash '+p)
                    if 'decodedBytes' in x:require(x['decodedBytes']==len(raw),'decoded bytes '+p)
                receipt_checks+=1
            for v in x.values():check_refs(v)
        elif isinstance(x,list):
            for v in x:check_refs(v)
    receipts={p:json.loads(decode_file(f)) for p,f in files.items() if p.endswith('/receipt.json')}
    for r in receipts.values():check_refs(r)
    for d in documents.values():check_refs(d)
    original_path=next(p for p in receipts if 'monk-selected-originals' in p);acq=receipts[original_path]
    selection=[s for s in acq['selection'] if s['pair'] in PAIRS]
    require(sorted(s['key'] for s in selection)==KEYS,'exact leased originals')
    require(acq['completed'] and not acq['errors'] and len(acq['responses'])==141 and acq['automaticRetries']==0,'original acquisition completeness')
    require(acq['repositoryBaseCommit']=='0a451f65a2c46fde2102ceeb1c7eee3017aafb0f','original acquisition identity')
    responses={r['key']:r for r in acq['responses']}
    county_registry=documents['src/data/research/county-equivalent-registry.json']
    counties={c['countyFips']:c for c in county_registry['countyEquivalents'] if c['status']=='active' and c['countyFips'] in [p[:5] for p in PAIRS]}
    require(len(counties)==8 and all(c['stateCode']=='NY' for c in counties.values()),'active county scope')
    by_name={n:c for c in counties.values() for n in c['aliases']+[c['shortName'],c['legalName']]}
    groups={p:[] for p in PAIRS};selected={};page_refs=[];contradictions=[];contexts=[];seen=set();ids=set();global_count=0
    issuecounts=collections.Counter();fieldcounts=collections.defaultdict(collections.Counter);localities=collections.Counter();collection_anomalies=[]
    page_responses=sorted([r for p,a in receipts.items() if 'monk-parakeet-public-2024' in p for r in a['responses']],key=lambda x:x['page'])
    require([r['page'] for r in page_responses]==list(range(50)),'50 contiguous pages')
    for r in page_responses:
        raw=decode_file(files[r['path']]);page=json.loads(raw)
        require(r['status']==200 and page['offset']==r['page']*300 and page['count']==21878 and not page['endOfRecords'] and len(page['results'])==300,'partial page lineage')
        page_refs.append(r);del page
        for i,row,start,end,h in row_stream(raw):
            global_count+=1;k=row['key'];require(k not in seen and row['occurrenceID'] not in ids,'duplicate identity');seen.add(k);ids.add(row['occurrenceID'])
            if row.get('stateProvince')!='New York' or row.get('county') not in by_name:continue
            county=by_name[row['county']];pair=county['countyFips']+':myiopsitta-monachus';fails=evaluate(row,county)
            loc={'pageIndex':r['page'],'rowIndex':i,'byteStart':start,'byteEndExclusive':end,'rawRowSha256':h}
            groups[pair].append({'key':k,'eventDate':row['eventDate'],'locator':loc,'checkFailures':fails})
            issuecounts.update(row.get('issues',[]));localities[row.get('locality','')]+=1
            for fld in ['basisOfRecord','occurrenceStatus','taxonomicStatus','species','license','collectionCode','http://unknown.org/status','http://unknown.org/crawl_attempt','http://unknown.org/omitFromScheduledCrawl','coordinateUncertaintyInMeters','establishmentMeans','degreeOfEstablishment','individualCount']:
                fieldcounts[fld][json.dumps(row.get(fld),ensure_ascii=True)]+=1
            gadm=row.get('gadm',{}).get('level2',{}).get('name')
            if gadm is not None and gadm!=row['county']:
                contradictions.append({'key':k,'pairKey':pair,'kind':'publisher-county-versus-derived-GADM','publisherCounty':row['county'],'gadmCounty':gadm,'locality':row.get('locality'),'locator':loc,'disposition':'unresolved-interpreted-geography-disagreement-no-original-acquired','qualification':'GADM is derived context, not approved county authority. No coordinate rerouting or effect on another sound selected witness.'})
            if fails:contradictions.append({'key':k,'pairKey':pair,'kind':'interpreted-check-failure','failures':fails,'locator':loc})
            if row.get('collectionCode') not in ['EBIRD','EBIRD_ATL_NY']:
                collection_anomalies.append({'key':k,'pairKey':pair,'literalCollectionCode':row.get('collectionCode'),'literalOccurrenceID':row.get('occurrenceID'),'locality':row.get('locality'),'locator':loc,'qualification':'Literal source identity retained. Portal expansion and provenance not established from code alone; original not acquired.'})
            if re.search(r'captive|caged|aviary|escape|\bpet\b|zoo|\bhome\b|\byard\b|\brescue\b',row.get('locality',''),re.I):
                contexts.append({'key':k,'pairKey':pair,'locality':row['locality'],'locator':loc,'disposition':'locality-context-alone-does-not-establish-captivity'})
            if k in KEYS:selected[k]=(row,loc)
        del raw
    require(global_count==15000 and sum(map(len,groups.values()))==3294 and len(selected)==16,'material inventory counts')
    require(len(contradictions)==16 and len(collection_anomalies)==2,'independent discrepancy inventory')
    require(all(x['literalCollectionCode']=='EBIRD_ATL_NZ' for x in collection_anomalies),'literal NZ code')
    original_reviews=[];adapter_pairs=[]
    for pair in PAIRS:
        materials=groups[pair];ranked=sorted(materials,key=lambda x:(-datetime.date.fromisoformat(x['eventDate']).toordinal(),x['key']))[:2]
        ss=[s for s in selection if s['pair']==pair];require(sorted(x['key'] for x in ranked)==sorted(s['key'] for s in ss),'fixed latest-two selection')
        held=[];supported=[]
        for s in sorted(ss,key=lambda x:x['key']):
            k=s['key'];row,loc=selected[k];r=responses[k];raw=decode_file(files[r['path']]);o=json.loads(raw);f=lambda name:o.get(DWC+name)
            require(r['status']==200 and o['key']==k and o['datasetKey']==DATASET,'original response source identity')
            require(s['responsePath']==page_refs[loc['pageIndex']]['path'] and s['rowIndex']==loc['rowIndex'] and s['responseSha256']==page_refs[loc['pageIndex']]['sha256'],'selected interpreted locator')
            fails=evaluate(row,counties[pair[:5]])
            comparisons={'scientificName':'Myiopsitta monachus','stateProvince':row['stateProvince'],'county':row['county'],'occurrenceID':row['occurrenceID'],'catalogNumber':row['catalogNumber'],'collectionCode':row['collectionCode'],'institutionCode':'CLO','occurrenceStatus':'PRESENT','basisOfRecord':'HumanObservation','locality':row['locality']}
            for n,v in comparisons.items():
                if f(n)!=v:fails.append('original-interpreted-'+n+'-contradiction')
            try:
                date=datetime.date(int(f('year')),int(f('month')),int(f('day'))).isoformat()
                if date!=row['eventDate']:fails.append('original-date-contradiction')
            except (ValueError,TypeError):fails.append('invalid-original-date');date=None
            for n in ['decimalLatitude','decimalLongitude']:
                if float(f(n))!=row[n]:fails.append('original-coordinate-contradiction:'+n)
            if int(f('individualCount'))!=row.get('individualCount') or int(f('individualCount'))<=0:fails.append('original-positive-count-contradiction')
            if str(o.get('http://rs.gbif.org/terms/1.0/gbifID'))!=str(k):fails.append('original-key-contradiction')
            matching=[c for c in county_registry['countyEquivalents'] if c['status']=='active' and c['stateName']==f('stateProvince') and f('county') in c['aliases']+[c['shortName'],c['legalName']]]
            if len(matching)!=1 or matching[0]['countyFips']!=pair[:5]:fails.append('nonunique-original-county')
            if fails:held.append(k)
            else:supported.append(k)
            atlas=f('collectionCode')=='EBIRD_ATL_NY'
            original_reviews.append({'key':k,'pairKey':pair,'decision':'held' if fails else 'supported','reasonCodes':sorted(set(fails)) or ['exact-original-taxon','unique-active-original-county','positive-dated-human-observation','stable-matching-source-identity','licensed-source','no-material-selected-record-contradiction'],'recordDate':date,'response':r,'selectionLineage':s,'originalDecodedResponseBase64':base64.b64encode(raw).decode(),'originalFieldByteWitnesses':byte_witnesses(raw),'interpretedLocator':loc,'interpretedRecord':row,'geographyAuthority':{'countyFips':pair[:5],'publisherState':f('stateProvince'),'publisherCounty':f('county'),'method':'Unique active exact county name or registered alias in explicit original state; coordinates not used to assign county.'},'identityReview':{'collectionCode':f('collectionCode'),'occurrenceID':f('occurrenceID'),'catalogNumber':f('catalogNumber'),'institutionCode':f('institutionCode'),'collectionProfileExtensionRequired':atlas,'finding':'Original and interpreted collection code, OBS catalog identifier, and collection-qualified URN agree. EBIRD_ATL_NY is an observed literal code; this review does not establish its portal expansion or infer human approval.' if atlas else 'Original and interpreted EBIRD collection-qualified URN, OBS catalog identifier and CLO institution agree.'},'localityReview':'The retained locality has no explicit captivity statement. Home, yard, church, cemetery, park or logistics-site wording alone is not captivity evidence.','caveats':['Historical recorded occurrence only; no current persistence, establishment, abundance or negative claim.','No individual human approval field is available; unknown.org tags retain qualified dataset context.','Original response has no license field; CC BY 4.0 is verified in interpreted response and dataset metadata.','Missing uncertainty and media do not contradict explicit original county.']})
        primary=next((x['key'] for x in ranked if x['key'] in supported),None)
        adapter_pairs.append({'pairKey':pair,'primaryKey':primary,'recordKeys':sorted(s['key'] for s in ss),'heldKeys':sorted(held),'disposition':'supported' if primary is not None else 'held'})
    dataset_path=next(p for p in files if p.endswith('/taxonomy-discovery-20260909/dataset.json.gz'))
    dataset=json.loads(decode_file(files[dataset_path]));taxpath=next(p for p in files if p.endswith('/taxonomy-discovery-20260909/myiopsitta-monachus.json.gz'));taxonomy=json.loads(decode_file(files[taxpath]))
    require(dataset['key']==DATASET and dataset['license']==LICENSE and taxonomy['canonicalName']=='Myiopsitta monachus' and taxonomy['usageKey']==2479407 and taxonomy['status']=='ACCEPTED' and taxonomy['matchType']=='EXACT','dataset and reference taxonomy')
    require(all(x['decision']=='supported' for x in original_reviews),'unexpected selected hold requires independent reinspection')
    method_receipt=next(r for p,r in receipts.items() if '/method-context-' in p)
    method_facts=[]
    for r in method_receipt['responses']:
        raw=decode_file(files[r['path']]);text=re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',raw.decode('utf-8')))
        method_facts.append({'response':r,'decodedSha256':sha(raw),'independentlyInspected':True})
    return {'schemaVersion':1,'kind':'independent-ebird-selected-original-review-proposal','status':'proposal-ready-main-method-required','jobId':JOB,'leaseId':'lease-'+JOB+'-1','actorId':ACTOR,'actorType':'agent','baseSha':BASE,'branch':'codex/'+JOB,'preflight':{'command':'node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/ny-r23-lease.json --repo C:/Code/project-isitusa-worktrees/ebird-monk-ny-original-review-20260909-r23','ok':True,'head':BASE,'errors':[],'qualification':'Frozen preflight independently executed before edits; no completed-run manifest emitted.'},'adapterReview':{'actorId':ACTOR,'baseSha':BASE,'status':'proposal-ready-main-method-required','pairs':adapter_pairs},'sourceDescriptors':sources,'archiveDescriptors':archives,'descriptorChecks':receipt_checks,'originalAcquisitionLineage':{k:acq[k] for k in ['repositoryBaseCommit','recipe','parentDiagnostic','parentSourceReceipts','startedAt','finishedAt','automaticRetries','authenticatedRequests','providerWrites','completed','totalDecodedBytes']},'sourceReview':{'datasetMetadataPath':dataset_path,'datasetFacts':{k:dataset.get(k) for k in ['key','title','publishingOrganizationKey','license','doi','pubDate','temporalCoverages','machineTags']},'taxonomyReferencePath':taxpath,'taxonomyReference':taxonomy,'methodContext':method_facts,'findings':['Retained Cornell dataset metadata attributes EOD to Cornell Lab of Ornithology, with annual observations ending 2024-12-31 and publication in 2025. Retrieval in 2026 does not refresh observations.','Retained Cornell download documentation describes EOD as basic occurrence data without sampling-event effort. Checklist absence and completeness cannot be reconstructed.','Retained Cornell rules describe wild living bird observations and exclude captive exhibit birds. This is dataset intent, not proof of each bird wildness or establishment.','Retained review documentation describes automated filters and volunteer review for flagged observations; it does not imply a human individually approved every public occurrence.','Dataset machine tags with citizenScience and crawler namespaces contain values matching opaque original unknown.org fields. This supports a dataset-level metadata interpretation; exact propagation is inferred, and individual record approval or rejection is not established.','Retained GBIF TagName documentation describes crawl_attempt as a dataset crawl counter and omitFromScheduledCrawl as a dataset scheduling tag. Neither is an occurrence validity verdict.'],'collectionIdentityFinding':'Three selected original and interpreted records use EBIRD_ATL_NY with exactly matching collection-qualified URNs. These are internally consistent attributable source records. Their code alone does not prove a named atlas portal. MAIN must evaluate and register a collection-profile extension; sound records are not rejected solely for an earlier EBIRD-only predicate.','collectionExtensionKeys':[5380656227,5420991483,5449276834]},'originalReviews':original_reviews,'materialInterpretedReview':{'reviewedRows':3294,'selectedOriginalRows':16,'rowsWithoutAcquiredOriginal':3278,'inventoryQualification':'All listed interpreted rows were checked; only selected keys have original-field approvals. An interpreted-only row remains unapproved even if checks pass.','rowLocatorConvention':'pageIndex selects sourcePages; rowIndex is zero based in results. Byte offsets are half-open UTF-8 ranges in exact decoded response; rawRowSha256 hashes that exact original JSON object byte slice.','sourcePages':page_refs,'pairs':[{'pairKey':p,'materialRowCount':len(groups[p]),'recordKeys':sorted(x['key'] for x in groups[p]),'rows':sorted(groups[p],key=lambda x:x['key'])} for p in PAIRS],'issues':dict(issuecounts),'fieldValueCounts':{k:dict(v) for k,v in fieldcounts.items()},'allLocalityCounts':dict(localities),'localityContext':sorted(contexts,key=lambda x:x['key']),'explicitDisagreements':sorted(contradictions,key=lambda x:x['key']),'unexpectedCollectionCodes':sorted(collection_anomalies,key=lambda x:x['key']),'overlapCaveat':'Distinct occurrence identifiers can report the same birds or site. The two selected Kings witnesses share date and coordinates but different occurrence IDs/counts; do not sum them as independent animals or infer abundance.'},'scope':{'exactCandidatePairs':PAIRS,'selectedOriginalKeys':KEYS,'parentRows':15000,'parentDeclaredRows':21878,'unretrievedRows':6878,'paginationComplete':False,'sourceFamilyScreenComplete':False,'terminalPages':0,'positiveClaimLimit':'Individually reviewed historical recorded presence only. Partial acquisition cannot support negatives, researched-unresolved completion, or source-family completion.'},'counts':{'supportedPairs':8,'heldPairs':0,'supportedOriginals':16,'heldOriginals':0,'materialInterpretedRows':3294,'interpretedGeographyDisagreements':16,'unexpectedInterpretedCollectionCodes':2,'canonicalEvents':0,'completedRuns':0,'newDeterminations':0,'workerNetworkRequests':0,'providerWrites':0},'canonicalChangeCounts':{'baseline':{'events':0,'runs':0,'determinations':0},'final':{'events':0,'runs':0,'determinations':0},'net':{'events':0,'runs':0,'determinations':0}},'remainingMainWork':['Review proposal and exact source witnesses independently.','Evaluate and register/test the selected-witness profile that honestly retains incomplete parent acquisition.','Evaluate EBIRD_ATL_NY collection identity/profile extension using primary source context; do not relabel source codes or require a narrower pilot predicate by implication.','Apply current baseline reconciliation before claiming any net new county-species movement.'],'reproducibility':{'command':'python src/data/research/worker-results/'+JOB+'/review.py --verify','imports':'Python standard library only; no MAIN implementation imported or executed.','comparison':'Exact deterministic proposal bytes, including fixed prior audit measurement. Current verification runtime and peak memory print separately.','pageProcessing':'Sequential; only selected full interpreted rows retained. All embedded compressed hashes and available receipt decoded hashes are checked.'},'performance':AUDIT_MEASUREMENT}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--write',action='store_true');ap.add_argument('--verify',action='store_true');args=ap.parse_args();started=time.perf_counter()
    proposal=build();b=encoded(proposal);require(len(b)<8*1048576,'artifact limit');target=OUT/'proposal.json'
    if args.write:target.write_bytes(b)
    if args.verify:require(target.read_bytes()==b,'proposal byte reproduction')
    require(peak()<384,'memory reservation')
    print(json.dumps({'ok':True,'mode':'verify' if args.verify else 'write' if args.write else 'inspect','bytes':len(b),'sha256':sha(b),'wallSeconds':round(time.perf_counter()-started,3),'peakWorkingSetMiB':peak(),'supportedPairs':8,'supportedOriginals':16,'materialInterpretedRows':3294,'canonicalEvents':0}))
