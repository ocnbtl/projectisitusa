"""Independent offline IL original-witness review. Standard library only.

--verify reconstructs every evidence-derived byte, retaining only the historical
first-write performance measurement (which cannot be deterministically rerun).
No MAIN adapters, prior reviewer results, network, or canonical writers are used.
"""
import argparse, base64, collections, ctypes, datetime, gzip, hashlib, json, re, time
from pathlib import Path

BASE = 'afd2d95233e8712fa16edd0cd99065dc4b674c7b'
ACTOR = 'ebird_monk_il_review_r24'
JOB = 'ebird-monk-il-original-review-20260909-r24'
DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
SPECIES = 'myiopsitta-monachus'
NAME = 'Myiopsitta monachus'
LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode'
KEYS = [5362048729, 5400220724, 5421376948, 5473973960, 5502373614]
PAIRS = ['17031:'+SPECIES, '17043:'+SPECIES, '17197:'+SPECIES]
DWC = 'http://rs.tdwg.org/dwc/terms/'
EVAL = 'ops/national-research/evaluations/'
NAMES = ['ebird-monk-selected-originals-20260909-r23', 'ebird-monk-partial-public-slice-20260909-r22', 'ebird-eod-public-metadata-20260909-r19', 'ebird-eod-original-field-pilot-20260909-r19']
PINNED_ARCHIVES = ['62ee4e6b3ab02bb286fa85a6fa3d3254ea0b1b7370e2688b0a565bde32397d9a', '4e901e30602c6318e05bff08b2fdf01598628779b00f1f71b0bcc3b14a1abb17', '38746673c3e8c6a9f916d34254d5f6e87fe51da30a04a43ee8d898652bd23740', 'd9ed8aeeeb0240f6b054a224c0ada8f579552bfbd4f162a6f92d57daf46c203b']
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).with_name('proposal.json')

def sha(b): return hashlib.sha256(b).hexdigest()
def pack(x): return (json.dumps(x, ensure_ascii=True, indent=2, sort_keys=True)+'\n').encode()
def read(p): return json.loads((ROOT/p).read_bytes())
def descriptor(p,b): return {'path':p,'bytes':len(b),'sha256':sha(b)}
def peak_mb():
    class PMC(ctypes.Structure):
        _fields_ = [('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(n,ctypes.c_size_t) for n in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
    p=PMC(); p.cb=ctypes.sizeof(p)
    kernel=ctypes.WinDLL('kernel32'); kernel.GetCurrentProcess.restype=ctypes.c_void_p
    psapi=ctypes.WinDLL('psapi'); psapi.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ulong]
    assert psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(p),p.cb)
    return round(p.PeakWorkingSetSize/1048576,3)

def raw_rows(raw):
    # Find and parse the actual results array, retaining exact byte offsets.
    s=raw.decode('utf-8'); m=re.search(r'"results"\s*:\s*\[',s); assert m
    pos=m.end(); dec=json.JSONDecoder(); idx=0
    while True:
        while s[pos] in ' \r\n\t,': pos+=1
        if s[pos]==']': break
        row,end=dec.raw_decode(s,pos)
        if row.get('stateProvince')=='Illinois' and row.get('county') in ['Cook','DuPage','Will']:
            b=s[pos:end].encode('utf-8')
            yield idx,row,{'jsonPointer':'/results/'+str(idx),'byteOffset':len(s[:pos].encode('utf-8')),'bytes':len(b),'sha256':sha(b)}
        idx+=1; pos=end
    assert idx==300

def original_field_witnesses(raw):
    s=raw.decode('utf-8'); dec=json.JSONDecoder(); result={}
    for m in re.finditer(r'"(http[^"\\]+)"\s*:',s):
        start=m.end()
        while s[start].isspace(): start+=1
        value,end=dec.raw_decode(s,start); b=s[start:end].encode('utf-8')
        result[m.group(1)]={'value':value,'byteOffset':len(s[:start].encode('utf-8')),'bytes':len(b),'rawValueBase64':base64.b64encode(b).decode(),'sha256':sha(b)}
    return result

def build():
    descriptors=[]; embedded={}; retained={}; receipts=[]; material=[]; selected_rows={}; pages=[]
    regpath='src/data/research/county-equivalent-registry.json'; reg=read(regpath)
    counties={x['countyFips']:x for x in reg['countyEquivalents'] if x['countyFips'] in [p[:5] for p in PAIRS]}
    assert len(counties)==3 and all(x['status']=='active' and x['stateCode']=='IL' for x in counties.values())
    mapping={alias:fips for fips,c in counties.items() for alias in [c['shortName'],c['legalName']]+c['aliases']}
    catalogpath='src/data/generated/species.json'; catalog=next(x for x in read(catalogpath) if x['id']==SPECIES)
    assert catalog['scientificName']==NAME
    for p in [regpath,catalogpath]: descriptors.append(descriptor(p,(ROOT/p).read_bytes()))
    evaluations=[]
    for name,pin in zip(NAMES,PINNED_ARCHIVES):
        ep=EVAL+name+'.json'; e=read(ep); evaluations.append(e); descriptors.append(descriptor(ep,(ROOT/ep).read_bytes()))
        ap=e['artifact']['path']; ab=(ROOT/ap).read_bytes(); assert sha(ab)==pin==e['artifact']['sha256'] and len(ab)==e['artifact']['bytes']
        descriptors.append(descriptor(ap,ab)); archive=json.loads(gzip.decompress(ab)); del ab
        for f in archive['files']:
            p=f['originalPath']; b=base64.b64decode(f['contents'],validate=True)
            assert len(b)==f['bytes'] and sha(b)==f['sha256'],p
            raw=gzip.decompress(b) if p.endswith('.gz') else b
            d={**descriptor(p,b),'archivePath':ap,'decodedBytes':len(raw),'decodedSha256':sha(raw)}
            assert p not in embedded or embedded[p]['sha256']==d['sha256']; embedded[p]=d
            if p.endswith('receipt.json'):
                receipt=json.loads(raw); receipts.append((p,receipt)); retained[p]=raw
            if '/method-context-' in p or p.endswith('/dataset.json.gz') or p.endswith('/myiopsitta-monachus.json.gz') or any(p.endswith('/'+str(k)+'.json.gz') for k in KEYS): retained[p]=raw
            if '/page-' in p and name==NAMES[1]:
                page=json.loads(raw); assert page['count']==21878 and page['endOfRecords'] is False and len(page['results'])==300
                pages.append({'path':p,'offset':page['offset'],'count':len(page['results']),'endOfRecords':False})
                for i,r,loc in raw_rows(raw):
                    loc['path']=p; loc['pageOffset']=page['offset']
                    pair=mapping[r['county']]+':'+SPECIES; contradictions=[]
                    if not (r.get('taxonKey')==r.get('acceptedTaxonKey')==2479407 and r.get('species')==NAME and r.get('taxonomicStatus')=='ACCEPTED'): contradictions.append('taxon-mismatch')
                    for classification in r.get('classifications',{}).values():
                        accepted=classification.get('acceptedUsage',{})
                        if not (classification.get('taxonomicStatus')=='ACCEPTED' and accepted.get('genericName')=='Myiopsitta' and accepted.get('specificEpithet')=='monachus' and accepted.get('rank')=='SPECIES'): contradictions.append('accepted-classification-mismatch')
                    if not (r.get('basisOfRecord')=='HUMAN_OBSERVATION' and r.get('occurrenceStatus')=='PRESENT'): contradictions.append('positive-basis-mismatch')
                    try:
                        date=datetime.date(r['year'],r['month'],r['day']).isoformat()
                        if date!=r['eventDate'] or r['year']!=2024: contradictions.append('date-mismatch')
                    except (ValueError,KeyError): contradictions.append('date-invalid')
                    if r.get('datasetKey')!=DATASET or r.get('publishingOrgKey')!='e2e717bf-551a-4917-bdc9-4fa0f342c530': contradictions.append('publisher-identity-mismatch')
                    if r.get('occurrenceID')!='URN:catalog:CLO:EBIRD:'+str(r.get('catalogNumber')) or r.get('identifier')!=r.get('catalogNumber') or str(r['key'])!=r.get('gbifID'): contradictions.append('record-identity-mismatch')
                    if r.get('license')!=LICENSE: contradictions.append('license-mismatch')
                    if r.get('individualCount') is not None and r['individualCount']<=0: contradictions.append('nonpositive-count')
                    context={k:r[k] for k in ['locality','occurrenceRemarks','eventRemarks','establishmentMeans','degreeOfEstablishment','behavior','habitat','dynamicProperties'] if k in r}
                    contextstr=json.dumps(context,ensure_ascii=True).lower()
                    triggers=sorted(set(re.findall(r'\b(?:home|zoo|captive|captivity|caged|aviary|pet|escapee|escaped|domestic)\b',contextstr)))
                    # No such explicit captivity text occurs in this lease; fail closed for future altered inputs.
                    if set(triggers)&{'captive','captivity','caged','aviary','pet','escapee','escaped','domestic'}: contradictions.append('explicit-context-requires-independent-review')
                    gadm=r.get('gadm',{}); gadmc=gadm.get('level2',{}).get('name'); gadms=gadm.get('level1',{}).get('name')
                    if gadmc and gadmc.casefold()!=r['county'].casefold(): contradictions.append('gadm-county-disagreement-secondary-coordinate-context')
                    if gadms and gadms!='Illinois': contradictions.append('gadm-state-disagreement-secondary-coordinate-context')
                    summary={'key':r['key'],'pairKey':pair,'locator':loc,'occurrenceID':r['occurrenceID'],'eventDate':r.get('eventDate'),'individualCount':r.get('individualCount'),'context':context,'contextTriggers':triggers,'issues':r.get('issues',[]),'opaqueStatus':r.get('http://unknown.org/status'),'coordinateUncertaintyInMeters':r.get('coordinateUncertaintyInMeters'),'contradictions':contradictions,'disposition':'selected-original-reviewed-separately' if r['key'] in KEYS else 'interpreted-only-original-not-acquired'}
                    material.append(summary)
                    if r['key'] in KEYS: selected_rows[r['key']]=(r,loc,contradictions)
                del page
        del archive
    assert len(material)==489 and len({r['key'] for r in material})==489 and len({r['occurrenceID'] for r in material})==489 and sorted(selected_rows)==KEYS
    assert sorted(x['offset'] for x in pages)==list(range(0,15000,300))
    # Verify every retained receipt descriptor for every available embedded path, including decoded bytes.
    matched=0; missing=[]
    def walk(v):
        nonlocal matched
        if isinstance(v,dict):
            if isinstance(v.get('path'),str) and ('sha256' in v or 'decodedSha256' in v):
                p=v['path']; d=embedded.get(p) or next((x for x in descriptors if x['path']==p),None)
                if d:
                    for k in ['bytes','sha256','decodedBytes','decodedSha256']:
                        if k in v: assert v[k]==d[k],(p,k)
                    matched+=1
                else: missing.append({'path':p,'qualification':'Reference has no embedded source bytes in the four archives; not claimed hash-verified.'})
            for z in v.values(): walk(z)
        elif isinstance(v,list):
            for z in v: walk(z)
    for _,r in receipts: walk(r)
    for e in evaluations:
        # Cross-archive evaluation links and metadata declarations must match their retained bytes.
        walk(e)
    origpath=next(p for p in retained if '/monk-selected-originals-' in p and p.endswith('receipt.json'))
    acquisition=json.loads(retained[origpath]); assert acquisition['completed'] is True and len(acquisition['responses'])==141 and not acquisition['errors']
    assert acquisition['repositoryBaseCommit']=='0a451f65a2c46fde2102ceeb1c7eee3017aafb0f'
    selection={x['key']:x for x in acquisition['selection'] if x['key'] in KEYS}
    for pair in PAIRS:
        ordered=sorted((r for r in material if r['pairKey']==pair),key=lambda r:(-datetime.date.fromisoformat(r['eventDate']).toordinal(),r['key']))[:2]
        assert sorted(r['key'] for r in ordered)==sorted(k for k,v in selection.items() if v['pair']==pair)
    datasetpath=next(p for p in retained if p.endswith('/dataset.json.gz')); dataset=json.loads(retained[datasetpath])
    taxpath=next(p for p in retained if p.endswith('/myiopsitta-monachus.json.gz')); tax=json.loads(retained[taxpath])
    assert dataset['key']==DATASET and dataset['license']==LICENSE
    assert tax['usageKey']==2479407 and tax['canonicalName']==NAME and tax['status']=='ACCEPTED' and tax['matchType']=='EXACT'
    originals=[]
    for response in acquisition['responses']:
        k=response['key']
        if k not in KEYS: continue
        p=response['path']; raw=retained[p]; o=json.loads(raw); r,loc,contr=selected_rows[k]; held=list(contr); pick=selection[k]; pair=pick['pair']; fips=pair[:5]
        def check(condition,reason):
            if not condition: held.append(reason)
        check(response['status']==200,'original-response-failed')
        check(o['key']==k and o['datasetKey']==DATASET and o['publishingOrgKey']==dataset['publishingOrganizationKey'],'original-identity-mismatch')
        check(o.get(DWC+'scientificName')==NAME,'original-taxon-mismatch')
        check(o.get(DWC+'stateProvince')=='Illinois' and o.get(DWC+'county') in counties[fips]['aliases'],'original-geography-mismatch')
        check(o.get(DWC+'basisOfRecord')=='HumanObservation' and o.get(DWC+'occurrenceStatus')=='PRESENT','original-positive-basis-mismatch')
        date=datetime.date(int(o[DWC+'year']),int(o[DWC+'month']),int(o[DWC+'day'])).isoformat()
        check(date==r['eventDate']==pick['eventDate'],'original-date-mismatch')
        for field in ['occurrenceID','catalogNumber','institutionCode','collectionCode','locality','recordedBy','county','stateProvince','taxonConceptID']:
            check(o.get(DWC+field)==r.get(field),'original-interpreted-'+field+'-mismatch')
        for field in ['decimalLatitude','decimalLongitude','individualCount']:
            check(float(o[DWC+field])==r[field],'original-interpreted-'+field+'-mismatch')
        check(o.get('http://purl.org/dc/terms/identifier')==r.get('identifier'),'original-identifier-mismatch')
        check(o.get('http://rs.gbif.org/terms/1.0/gbifID')==str(k),'original-gbifID-mismatch')
        check(pick['responsePath']==loc['path'] and pick['rowIndex']==int(loc['jsonPointer'].split('/')[-1]) and pick['responseSha256']==embedded[loc['path']]['sha256'],'selection-locator-mismatch')
        for field in ['status','crawl_attempt','omitFromScheduledCrawl']:
            uri='http://unknown.org/'+field; check(o.get(uri)==r.get(uri),'opaque-field-mismatch')
        originals.append({'key':k,'pairKey':pair,'disposition':'held' if held else 'supported','holdReasons':sorted(set(held)),'claim':'historical-recorded-presence-only','selection':pick,'acquisitionResponse':response,'originalDescriptor':embedded[p],'rawOriginalBase64':base64.b64encode(raw).decode(),'originalFieldByteWitnesses':original_field_witnesses(raw),'interpretedLocator':loc,'interpretedFields':r,'geography':{'policy':'Exact original state and county text to active registry aliases; coordinates are contextual only.','registryEntry':counties[fips]},'licenseEvidence':{'originalRecordLicensePresent':DWC+'license' in o or 'http://purl.org/dc/terms/license' in o,'interpretedLicense':r['license'],'datasetLicense':dataset['license'],'datasetPath':datasetpath},'caveats':['Source observer ID is attribution, not independent human approval.','Original county supports this historical location; no coordinate-derived county or countywide abundance claim.','Original fields do not independently prove current persistence, establishment, impact, breeding, or individual quality approval.','Opaque not_reviewed/crawler values match dataset metadata but their record-level meaning is not established.','No coordinate uncertainty or original license field; explicit county and interpreted plus dataset CC BY 4.0 rights are retained.']})
    originals.sort(key=lambda x:x['key']); pairreviews=[]
    for pair in PAIRS:
        rr=[r for r in originals if r['pairKey']==pair]; supported=[r for r in rr if r['disposition']=='supported']
        preferred=sorted(supported,key=lambda x:(-datetime.date.fromisoformat(x['selection']['eventDate']).toordinal(),x['key']))
        pairreviews.append({'pairKey':pair,'primaryKey':preferred[0]['key'] if preferred else None,'recordKeys':sorted(r['key'] for r in rr),'heldKeys':sorted(r['key'] for r in rr if r['disposition']=='held'),'disposition':'supported' if supported else 'held'})
    context=[]
    for p,raw in sorted(retained.items()):
        if '/method-context-' not in p or not p.endswith('.gz'): continue
        snippets=[]
        for term in [b'wild, living birds',b'provisional',b'not_reviewed',b'quality',b'public outputs']:
            match=re.search(re.escape(term),raw,re.I)
            if match:
                a=max(0,match.start()-100); b=min(len(raw),match.end()+450); window=raw[a:b]
                snippets.append({'term':term.decode(),'byteOffset':a,'bytes':b-a,'rawBase64':base64.b64encode(window).decode(),'sha256':sha(window)})
        context.append({'descriptor':embedded[p],'snippets':snippets})
    issues=collections.Counter(i for r in material for i in r['issues'])
    triggercounts=collections.Counter(i for r in material for i in r['contextTriggers'])
    countfields={'canonicalEvents':0,'canonicalRuns':0,'newDeterminations':0,'completedSourceScreens':0,'negativeClaims':0,'networkRequests':0}
    return {'schemaVersion':1,'kind':'independent-selected-original-review-proposal','jobId':JOB,'leaseId':'lease-'+JOB+'-1','actorId':ACTOR,'baseSha':BASE,'status':'proposal-ready-main-method-required','adapterReview':{'actorId':ACTOR,'baseSha':BASE,'status':'proposal-ready-main-method-required','pairs':pairreviews},'preflight':{'result':'pass','head':BASE,'command':'node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/il-r24-lease.json --repo C:/Code/project-isitusa-worktrees/'+JOB},'scope':{'stateCode':'IL','speciesId':SPECIES,'pairKeys':PAIRS,'selectedOriginalKeys':KEYS,'materialInterpretedRows':489,'sourceSearchRows':15000,'declaredSourceSearchRows':21878,'paginationComplete':False,'sourceScreenComplete':False},'sourceDescriptors':descriptors,'embeddedDescriptors':sorted(embedded.values(),key=lambda d:d['path']),'hashVerification':{'outerArchives':4,'embeddedFiles':len(embedded),'receiptAndEvaluationDescriptorMatches':matched,'unavailableReferences':sorted({json.dumps(x,sort_keys=True):x for x in missing}.values(),key=lambda x:x['path']),'allAvailableEmbeddedStoredAndDecodedHashesVerified':True},'sourceContext':{'sourceId':'gbif-ebird','publisher':'Cornell Lab of Ornithology, mediated by GBIF','datasetKey':DATASET,'datasetTitle':dataset['title'],'publishingOrganizationKey':dataset['publishingOrganizationKey'],'license':dataset['license'],'datasetDescriptor':embedded[datasetpath],'datasetMachineTags':dataset['machineTags'],'taxonomyMatch':tax,'taxonomyDescriptor':embedded[taxpath],'retainedMethodContext':context,'inferences':['Dataset and EML identify Cornell eBird observation data; source rules concern wild living birds and discourage captive records. This supports qualified observation context, not an individual human approval attestation.','not_reviewed values also occur on older dataset machine tags under citizenScience namespaces; crawler fields correspond to crawler metadata. Matching values suggest metadata context but do not prove each field was injected by a particular system.','CONTINENT_DERIVED_FROM_COORDINATES does not derive the accepted county. TAXON_CONCEPT_ID_NOT_FOUND is retained even though original binomial and accepted classifications agree.','Home, colony, sanctuary, substation and zoo place words alone do not establish captivity or reproduction; no unacquired original is approved.']},'originalAcquisitionLineage':{'receiptDescriptor':embedded[origpath],'codeCommit':acquisition['repositoryBaseCommit'],'recipe':acquisition['recipe'],'parentDiagnostic':acquisition['parentDiagnostic'],'parentReceipts':acquisition['parentSourceReceipts'],'startedAt':acquisition['startedAt'],'finishedAt':acquisition['finishedAt'],'selectedResponses':141,'completed':acquisition['completed'],'errors':acquisition['errors'],'automaticRetries':acquisition['automaticRetries'],'selectionRule':'Up to two latest retained rows by event date, ties ascending key, fixed before acquisition with no replacement; independently recomputed for all three leased pairs.'},'originalReviews':originals,'materialInterpretedReview':{'keyInventory':sorted(r['key'] for r in material),'countyCounts':dict(sorted(collections.Counter(r['pairKey'] for r in material).items())),'issueCounts':dict(sorted(issues.items())),'contextTriggerCounts':dict(sorted(triggercounts.items())),'missingUncertainty':sum(r['coordinateUncertaintyInMeters'] is None for r in material),'missingIndividualCount':sum(r['individualCount'] is None for r in material),'localityCounts':dict(sorted(collections.Counter(r['context'].get('locality','') for r in material).items())),'contradictions':[{'key':r['key'],'locator':r['locator'],'reasons':r['contradictions']} for r in material if r['contradictions']],'rows':sorted(material,key=lambda x:x['key']),'qualification':'All489 interpreted rows inspected. Exactly5 selected original records reviewed. Other484 rows are not original approvals or evidence events; missing numeric count with PRESENT is not a negative.'},'pageAccounting':sorted(pages,key=lambda x:x['offset']),'counts':{'baseline':countfields,'final':countfields,'net':countfields,'supportedSelectedOriginals':sum(r['disposition']=='supported' for r in originals),'heldSelectedOriginals':sum(r['disposition']=='held' for r in originals),'supportedProposedPairs':sum(p['disposition']=='supported' for p in pairreviews)},'limitations':['Partial 15000/21878 mutable search does not establish exhaustive county coverage, source-family completion, absence, or non-detection.','2024 observations do not prove current2026 persistence, naturalization, invasive impact, abundance, or breeding.','Registry validFrom describes current Census registry edition; explicit unchanged Cook/DuPage/Will county labels are used without coordinate reassignment.','Research workflow and architecture files carry older frozen skill hashes; fresh successful pinned preflight and AGENTS use the current frozen Windows contract.','Generic lease expectedOutputs lists evidence-run artifacts, but the exact completion criteria and executionContract require only this proposal and recipe. No completed-run manifest is fabricated.'],'remainingMainWork':['Review this independent proposal and exact five original decisions under the MAIN-owned selected-original replay v2 method.','Reconcile the three still-deferred pairs against current MAIN state before any canonical event creation.','Run MAIN-owned canonical verification and compilation before claiming net determination movement.'],'performanceProtocol':{'memoryMetric':'Windows GetProcessMemoryInfo PeakWorkingSetSize / 1048576','maximumMiB':384,'recipe':'Standard library offline processing of each interpreted page sequentially; no retained full15000-row object graph.','telemetryReplay':'--verify preserves the recorded first-write executionMeasurement only and rederives every other proposal byte. Current verification elapsed/peak are emitted separately to stdout.'}}

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--verify',action='store_true'); args=parser.parse_args(); started=time.perf_counter()
    result=build(); elapsed=round(time.perf_counter()-started,6); peak=peak_mb(); assert peak<384
    if args.verify:
        prior=json.loads(OUT.read_bytes()); measurement=prior['executionMeasurement']
        assert 0<measurement['peakWorkingSetMiB']<384 and measurement['elapsedSeconds']>0
        result['executionMeasurement']=measurement
        expected=pack(result); assert OUT.read_bytes()==expected,'Proposal is not byte-exact reproduced'
    else:
        result['executionMeasurement']={'elapsedSeconds':elapsed,'peakWorkingSetMiB':peak,'kind':'measured-first-write-offline-review'}
        expected=pack(result); assert len(expected)<8388608; OUT.write_bytes(expected)
    print(json.dumps({'ok':True,'mode':'verify' if args.verify else 'write','proposalBytes':len(expected),'proposalSha256':sha(expected),'elapsedSeconds':round(time.perf_counter()-started,6),'peakWorkingSetMiB':peak_mb(),'adapterReview':result['adapterReview'],'contradictions':result['materialInterpretedReview']['contradictions'],'hashVerification':result['hashVerification']}))

if __name__=='__main__': main()
