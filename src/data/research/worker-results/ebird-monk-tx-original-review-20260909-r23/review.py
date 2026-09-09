"""Offline independent TX Monk review; Python standard library only.

Source pages are decoded sequentially. No MAIN implementation is imported.
--verify reconstructs exact proposal bytes; frozen initial measurement provenance
is an explicit constant, while every invocation reports its own measured telemetry.
Only the selected 43 original-field responses can receive original approval.
"""
import argparse
import base64
import collections
import ctypes
import datetime
import gzip
import hashlib
import html
import json
from pathlib import Path
import re
import time

JOB = 'ebird-monk-tx-original-review-20260909-r23'
ACTOR = 'ebird_monk_tx_review_r23'
BASE = 'f34b7b1868250986043594913ed49f1a36b3b9dd'
DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
BINOMIAL = 'Myiopsitta monachus'
TAXON = 2479407
LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode'
DWC = 'http://rs.tdwg.org/dwc/terms/'
CACHE = '.cache/research/campaigns/20260908-r19-ebird-bulk/'
EVAL = 'ops/national-research/evaluations/'
NAMES = ['ebird-monk-selected-originals-20260909-r23', 'ebird-monk-partial-public-slice-20260909-r22', 'ebird-eod-public-metadata-20260909-r19', 'ebird-eod-original-field-pilot-20260909-r19']
FIPS = ['48003','48027','48029','48039','48061','48099','48113','48121','48141','48157','48167','48201','48209','48215','48249','48325','48329','48339','48355','48439','48453','48479','48491']
PAIRS = [f + ':myiopsitta-monachus' for f in FIPS]
KEYS = [5299354213,5301132390,5304123916,5308031399,5313097808,5314318958,5316224228,5316294520,5321686513,5333162005,5337260213,5341629204,5344802692,5357797096,5359394157,5376883614,5380783278,5416294987,5432256464,5441390551,5443740669,5450332907,5451313267,5460622528,5461397719,5464335051,5472435308,5474270049,5481089972,5486953269,5489168416,5512534041,5555295873,5567711371,5568435870,5570935239,5585465340,5586688184,5624292361,5629620924,5632171139,5685474547,5691459781]
INITIAL_MEASUREMENT = {'initialRecipeCompletedAt': '2026-09-09T02:58:51Z', 'wallSeconds': 1.960451, 'peakWorkingSetBytes': 57552896, 'peakWorkingSetMiB': 54.887, 'workerFirstObservedAt': '2026-09-09T02:51:23Z', 'workerResumedAt': '2026-09-09T03:16:41Z', 'elapsedAtResumeSeconds': 1518, 'qualification': 'Initial recipe measurements are observed tool-output provenance. Worker wall clock includes an external interruption; active agent review time was not independently metered.'}


def sha(b):
    return hashlib.sha256(b).hexdigest()


def encoded(d):
    return (json.dumps(d, ensure_ascii=True, indent=2, sort_keys=True) + '\n').encode('utf-8')


def desc(path, b):
    return {'path': path, 'bytes': len(b), 'sha256': sha(b)}


def check_bytes(b, d, decoded=False):
    pre = 'decoded' if decoded else ''
    bk, hk = (pre + 'Bytes', pre + 'Sha256') if pre else ('bytes', 'sha256')
    if bk in d:
        assert len(b) == d[bk], (d.get('path'), bk)
    if hk in d:
        assert sha(b) == d[hk], (d.get('path'), hk)


def peak_bytes():
    class PMC(ctypes.Structure):
        _fields_ = [('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong),('PeakWorkingSetSize',ctypes.c_size_t),('WorkingSetSize',ctypes.c_size_t),('QuotaPeakPagedPoolUsage',ctypes.c_size_t),('QuotaPagedPoolUsage',ctypes.c_size_t),('QuotaPeakNonPagedPoolUsage',ctypes.c_size_t),('QuotaNonPagedPoolUsage',ctypes.c_size_t),('PagefileUsage',ctypes.c_size_t),('PeakPagefileUsage',ctypes.c_size_t)]
    x = PMC(); x.cb = ctypes.sizeof(x)
    kernel = ctypes.windll.kernel32
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    psapi = ctypes.windll.psapi
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(PMC), ctypes.c_ulong]
    assert psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(x), x.cb)
    return int(x.PeakWorkingSetSize)


def nested(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from nested(v)
    elif isinstance(o, list):
        for v in o:
            yield from nested(v)


def normalize_name(s):
    return s.strip().casefold()


def valid_date(d):
    try:
        expected = datetime.date(int(d['year']),int(d['month']),int(d['day'])).isoformat()
        return expected == d.get('eventDate') and expected.startswith('2024-')
    except (KeyError,ValueError,TypeError):
        return False


def row_iter(raw):
    """Yield parsed rows with exact UTF-8 byte offsets into provider response."""
    s = raw.decode('utf-8')
    m = re.search(r'"results"\s*:\s*\[', s)
    assert m
    p = m.end(); prev = 0; bytepos = 0; index = 0
    decoder = json.JSONDecoder()
    while True:
        while s[p].isspace() or s[p] == ',': p += 1
        if s[p] == ']': break
        row, end = decoder.raw_decode(s,p)
        bytepos += len(s[prev:p].encode('utf-8'))
        rb = s[p:end].encode('utf-8')
        assert raw[bytepos:bytepos+len(rb)] == rb
        yield index,row,bytepos,rb
        index += 1; prev = end; p = end; bytepos += len(rb)


def review(root):
    outer = []; embedded = []; payloads = {}; descriptor_by_path = {}; documents = []
    # Only embedded compressed pages are retained in memory; no expanded page cache.
    for name in NAMES:
        ep = EVAL + name + '.json'; eb = (root/ep).read_bytes(); ed = json.loads(eb)
        outer.append(desc(ep,eb)); documents.append(ed)
        ap = ed['artifact']['path']; ab = (root/ap).read_bytes(); check_bytes(ab,ed['artifact'])
        outer.append(desc(ap,ab))
        arc = json.loads(gzip.decompress(ab))
        if 'files' in ed['artifact']: assert len(arc['files']) == ed['artifact']['files']
        for i,f in enumerate(arc['files']):
            assert f['encoding'] == 'base64'
            b = base64.b64decode(f['contents'],validate=True); check_bytes(b,f)
            p = f['originalPath']; sd = desc(p,b)
            sd.update({'archivePath':ap,'archiveSha256':sha(ab),'fileIndex':i})
            if p.endswith('.gz'):
                dec = gzip.decompress(b); sd.update(decodedBytes=len(dec),decodedSha256=sha(dec)); del dec
            if p in payloads: assert payloads[p] == b
            payloads[p] = b; descriptor_by_path[p] = sd; embedded.append(sd)
        del arc,ab,eb
    # All retained descriptor references are verified where their bytes are present.
    crosschecks = 0
    for d in documents + [json.loads(b) for p,b in payloads.items() if p.endswith('receipt.json')]:
        for x in nested(d):
            if isinstance(x.get('path'),str) and x['path'] in payloads:
                check_bytes(payloads[x['path']],x)
                if 'decodedSha256' in x: check_bytes(gzip.decompress(payloads[x['path']]),x,True)
                crosschecks += 1
    def get(p): return json.loads(payloads[p])
    def gzget(p): return json.loads(gzip.decompress(payloads[p]))
    receipt = get(CACHE+'monk-selected-originals-20260909-r23/receipt.json')
    assert receipt['completed'] and not receipt['errors'] and len(receipt['selection']) == 141
    assert receipt['automaticRetries'] == receipt['authenticatedRequests'] == receipt['providerWrites'] == 0
    selections = {s['key']:s for s in receipt['selection'] if s['stateCode'] == 'TX'}
    assert sorted(selections) == KEYS
    assert sorted({s['pair'] for s in selections.values()}) == PAIRS
    responses = {x['key']:x for x in receipt['responses']}
    assert sorted(responses) == sorted(s['key'] for s in receipt['selection'])
    group = next(x for x in documents[0]['stateGroups'] if x['stateCode']=='TX')
    assert group['selectedKeys'] == KEYS and group['pairs'] == PAIRS and group['materialInterpretedRows'] == 3330
    registries = []
    for p in ['src/data/research/county-equivalent-registry.json','src/data/research/state-registry.json','src/data/research/source-registry.json']:
        b = (root/p).read_bytes(); registries.append(desc(p,b))
    registry = json.loads((root/registries[0]['path']).read_bytes())
    state_registry = json.loads((root/registries[1]['path']).read_bytes())
    state = next(x for x in state_registry['jurisdictions'] if x['stateCode']=='TX')
    assert state['stateName']=='Texas' and state['stateFips']=='48' and state['nationalV1Scope']
    tx = [c for c in registry['countyEquivalents'] if c['stateCode']=='TX' and c['status']=='active']
    assert len(tx)==state['countyEquivalentCount']==254
    lookup = collections.defaultdict(set)
    for c in tx:
        for n in [c['shortName'],c['legalName']]+c['aliases']:
            lookup[normalize_name(n)].add(c['countyFips'])
    def map_county(state,county):
        if state != 'Texas' or not isinstance(county,str): return None
        fs = lookup[normalize_name(county)]
        return next(iter(fs)) if len(fs)==1 else None
    source = next(x for x in json.loads((root/registries[2]['path']).read_bytes())['sources'] if x['id']=='gbif-ebird')
    assert source['evidenceCapabilities'] == ['recorded-present'] and source['negativeSemantics']=='none'
    dataset = gzget(CACHE+'taxonomy-discovery-20260909/dataset.json.gz')
    taxon = gzget(CACHE+'taxonomy-discovery-20260909/myiopsitta-monachus.json.gz')
    assert dataset['key']==DATASET and dataset['license']==LICENSE
    assert taxon['usageKey']==TAXON and taxon['canonicalName']==BINOMIAL and taxon['status']=='ACCEPTED' and taxon['matchType']=='EXACT'
    page_receipts = [get(CACHE+'monk-parakeet-public-2024-20260909/receipt.json'),get(CACHE+'monk-parakeet-public-2024-resume-20260909/receipt.json')]
    pages = sorted([x for d in page_receipts for x in d['responses']],key=lambda x:x['offset'])
    assert [x['offset'] for x in pages] == list(range(0,15000,300))
    groups = {p:{'pairKey':p,'county':next(c['legalName'] for c in tx if c['countyFips']==p[:5]),'rows':[], 'issueCounts':collections.Counter(),'contextCounts':collections.Counter(),'contextRecords':[], 'contradictions':[], 'dates':[], 'selectedOriginalKeys':sorted(k for k,s in selections.items() if s['pair']==p)} for p in PAIRS}
    seen_keys = set(); seen_ids = set(); selected_rows = {}; page_inventory = []; checks = collections.Counter()
    for page_index,pd in enumerate(pages):
        assert pd['status']==200 and not pd['endOfRecords'] and pd['declaredCount']==21878
        b = payloads[pd['path']]; check_bytes(b,pd); raw = gzip.decompress(b); check_bytes(raw,pd,True)
        envelope = json.loads(raw); assert envelope['offset']==page_index*300 and envelope['count']==21878 and not envelope['endOfRecords']; del envelope
        page_inventory.append(dict(pd,archivePath=documents[1]['artifact']['path'],pageIndex=page_index))
        nr=0
        for ri,d,offset,rb in row_iter(raw):
            nr+=1; key=d['key']; oid=d.get('occurrenceID')
            assert key not in seen_keys and oid not in seen_ids; seen_keys.add(key); seen_ids.add(oid)
            fips=map_county(d.get('stateProvince'),d.get('county'))
            if fips not in FIPS: continue
            pair=fips+':myiopsitta-monachus'; g=groups[pair]
            locator={'key':key,'pageIndex':page_index,'rowIndex':ri,'responsePath':pd['path'],'responseSha256':pd['sha256'],'decodedByteOffset':offset,'decodedRowBytes':len(rb),'decodedRowSha256':sha(rb)}
            g['rows'].append(locator); g['dates'].append(d.get('eventDate'))
            errors=[]
            if not (d.get('datasetKey')==DATASET and d.get('publishingOrgKey')==dataset['publishingOrganizationKey']):errors.append('dataset-or-publisher-mismatch')
            if not (d.get('taxonKey')==d.get('speciesKey')==d.get('acceptedTaxonKey')==TAXON and d.get('species')==BINOMIAL and d.get('taxonomicStatus')=='ACCEPTED'):errors.append('taxon-mismatch')
            for cl in d.get('classifications',{}).values():
                u=cl.get('acceptedUsage',{})
                if cl.get('taxonomicStatus')!='ACCEPTED' or u.get('genericName')!='Myiopsitta' or u.get('specificEpithet')!='monachus' or u.get('rank')!='SPECIES':errors.append('classification-contradiction')
            if not (d.get('basisOfRecord')=='HUMAN_OBSERVATION' and d.get('occurrenceStatus')=='PRESENT'):errors.append('nonpositive-observation')
            if not valid_date(d):errors.append('date-mismatch')
            if isinstance(d.get('individualCount'),(int,float)) and d['individualCount']<=0:errors.append('nonpositive-individual-count')
            if not (d.get('license')==LICENSE and d.get('countryCode')=='US'):errors.append('rights-or-country-mismatch')
            if not (str(d.get('gbifID'))==str(key) and oid=='URN:catalog:CLO:EBIRD:'+d.get('catalogNumber','') and d.get('identifier')==d.get('catalogNumber')):errors.append('record-identity-mismatch')
            loc=d.get('locality','')
            context=[]
            if re.search(r'\bhome\b|\bprivate\b|\bapartments\b',loc,re.I):context.append('residential-or-private-locality-not-captivity')
            if re.search(r'zoo',loc,re.I):context.append('zoo-name-not-captivity')
            if re.search(r'\bpet\b',loc,re.I):context.append('pet-business-context-not-captivity')
            if re.search(r'\bcaptive\b|\bcaged\b|\baviary\b|\bdead\b',loc,re.I):errors.append('explicit-restrictive-context-review-required')
            for field in ['establishmentMeans','degreeOfEstablishment','occurrenceRemarks','identificationRemarks','dataGeneralizations','informationWithheld']:
                if d.get(field):context.append('nonempty-'+field)
            gadm=d.get('gadm',{}).get('level2',{}).get('name')
            if gadm and normalize_name(gadm)!=normalize_name(d['county']):
                errors.append('publisher-county-versus-gadm-conflict')
            if not gadm:context.append('gadm-county-missing-explicit-county-retained')
            if d.get('coordinateUncertaintyInMeters') is None:checks['missingCoordinateUncertainty']+=1
            if not d.get('media'):checks['noMediaInRetainedResponse']+=1
            g['issueCounts'].update(d.get('issues',[])); g['contextCounts'].update(context)
            checks['positiveHumanObservation'] += d.get('basisOfRecord')=='HUMAN_OBSERVATION' and d.get('occurrenceStatus')=='PRESENT'
            checks['exactCalendarDate'] += valid_date(d)
            checks['exactAcceptedTaxon'] += d.get('acceptedTaxonKey')==TAXON and d.get('species')==BINOMIAL
            if context:g['contextRecords'].append({'key':key,'locality':loc,'contexts':context,'originalAcquired':key in selections})
            if errors:g['contradictions'].append({'key':key,'reasons':sorted(set(errors)),'publisherCounty':d['county'],'gadmCounty':gadm,'locality':loc,'disposition':'held-interpreted-candidate-original-not-acquired' if key not in selections else 'selected-original-review-required','locator':locator})
            if key in selections:selected_rows[key]=(d,locator,errors)
        assert nr==300
        del raw
    assert len(seen_keys)==len(seen_ids)==15000
    assert sum(len(g['rows']) for g in groups.values())==3330 and sorted(selected_rows)==KEYS
    originals=[]; adapter=[]
    for pair,g in groups.items():
        # Selection was fixed before acquisition; verify it independently from all retained pair rows.
        selected=[]
        for key in g['selectedOriginalKeys']:
            s=selections[key]; response=responses[key]; raw=gzip.decompress(payloads[response['path']]); check_bytes(raw,response,True)
            o=json.loads(raw); d,locator,errors=selected_rows[key]; errors=list(errors)
            of={k[len(DWC):]:v for k,v in o.items() if k.startswith(DWC)}
            assert response['status']==200 and response['pair']==pair
            assert s['responsePath']==locator['responsePath'] and s['responseSha256']==locator['responseSha256'] and s['rowIndex']==locator['rowIndex']
            if o.get('key')!=key or o.get('datasetKey')!=DATASET or o.get('publishingOrgKey')!=dataset['publishingOrganizationKey']:errors.append('original-dataset-or-key-mismatch')
            if of.get('scientificName')!=BINOMIAL or of.get('genus')!='Myiopsitta' or of.get('specificEpithet')!='monachus' or of.get('class')!='Aves':errors.append('original-taxon-mismatch')
            if map_county(of.get('stateProvince'),of.get('county'))!=pair[:5] or of.get('county')!=d.get('county'):errors.append('original-county-mismatch')
            if of.get('country')!='United States':errors.append('original-country-mismatch')
            try: od=datetime.date(int(of['year']),int(of['month']),int(of['day'])).isoformat()
            except (KeyError,ValueError):od=None
            if od!=d['eventDate'] or od!=s['eventDate']:errors.append('original-date-mismatch')
            if of.get('basisOfRecord')!='HumanObservation' or of.get('occurrenceStatus')!='PRESENT':errors.append('original-nonpositive-observation')
            if not (of.get('occurrenceID')==d.get('occurrenceID')==s['occurrenceId'] and of.get('catalogNumber')==d.get('catalogNumber') and o.get('http://purl.org/dc/terms/identifier')==d.get('identifier') and o.get('http://rs.gbif.org/terms/1.0/gbifID')==str(key)):errors.append('original-identity-mismatch')
            for field in ['decimalLatitude','decimalLongitude']:
                if float(of[field])!=float(d[field]):errors.append('original-coordinate-mismatch')
            for field in ['individualCount','recordedBy','locality','taxonConceptID','geodeticDatum']:
                if str(of.get(field))!=str(d.get(field)):errors.append('original-'+field+'-mismatch')
            for field in ['status','crawl_attempt','omitFromScheduledCrawl']:
                if o.get('http://unknown.org/'+field)!=d.get('http://unknown.org/'+field):errors.append('original-opaque-metadata-mismatch')
            decision='held' if errors else 'supported'
            notes=['Explicit original county resolves uniquely through active Texas registry names; no county derived from coordinates.','Original binomial agrees with both retained accepted GBIF classifications; unresolved taxonConceptID annotation is retained.','2024 positive source observation supports historical recorded presence only.','Opaque status/crawl fields have dataset-level context; no individual human expert approval is established.','Missing coordinate uncertainty and media are limitations, not contradictions to explicit original county authority.']
            if key==5308031399:notes.append('Kats home is a residential locality label; neither it nor any retained field states that this bird was captive. The singleton occurrence is supported with that limitation.')
            if pair=='48355:myiopsitta-monachus':notes.append('Same-day selected records count 6 and 51 birds at Pollywog Pond under different occurrence IDs and observers. This count difference does not contradict recorded presence; no abundance estimate is combined.')
            if pair in ['48027:myiopsitta-monachus','48029:myiopsitta-monachus','48099:myiopsitta-monachus','48215:myiopsitta-monachus','48339:myiopsitta-monachus']:notes.append('Selected records share site/date and may reflect a shared birding event; distinct IDs do not prove independent sightings or independent abundance samples.')
            originals.append({'key':key,'pairKey':pair,'disposition':decision,'reasonCodes':sorted(set(errors)) if errors else ['exact-original-taxon','exact-original-county','original-interpreted-identity-date-coordinate-agreement','positive-human-observation'],'originalResponse':response,'originalDecodedResponseBase64':base64.b64encode(raw).decode(),'originalDecodedResponseSha256':sha(raw),'originalFields':of,'originalOpaqueFields':{k:v for k,v in o.items() if k.startswith('http://unknown.org/')},'interpretedLocator':locator,'sourceUrl':s['sourceUrl'],'notes':notes})
            selected.append((key,decision,od))
        supported=sorted((x for x in selected if x[1]=='supported'),key=lambda x:(-datetime.date.fromisoformat(x[2]).toordinal(),x[0]))
        adapter.append({'pairKey':pair,'primaryKey':supported[0][0] if supported else None,'recordKeys':g['selectedOriginalKeys'],'heldKeys':sorted(x[0] for x in selected if x[1]=='held'),'disposition':'supported' if supported else 'held'})
    # Verify latest-two selection using retained row dates, one additional sequential pass.
    candidates={p:[] for p in PAIRS}
    for pd in pages:
        raw=gzip.decompress(payloads[pd['path']])
        for ri,d,offset,rb in row_iter(raw):
            f=map_county(d.get('stateProvince'),d.get('county'))
            if f in FIPS:candidates[f+':myiopsitta-monachus'].append((d['eventDate'],d['key']))
        del raw
    for pair,g in groups.items():
        latest=sorted(candidates[pair],key=lambda x:(-datetime.date.fromisoformat(x[0]).toordinal(),x[1]))[:2]
        assert sorted(x[1] for x in latest)==g['selectedOriginalKeys']
        g['rowCount']=len(g['rows']); g['unacquiredOriginalCount']=g['rowCount']-len(g['selectedOriginalKeys'])
        g['rows'].sort(key=lambda x:x['key']); g['dateRange']=[min(g.pop('dates')),max(x[0] for x in candidates[pair])]
        g['issueCounts']=dict(sorted(g['issueCounts'].items()));g['contextCounts']=dict(sorted(g['contextCounts'].items()))
        g['contextRecords'].sort(key=lambda x:x['key']);g['contradictions'].sort(key=lambda x:x['key'])
        g['otherMaterialDisposition']='Interpreted context reviewed; all unselected originals remain unacquired and are not approved. Specific conflicts are held; no negative evidence follows.'
    method_receipt=get(CACHE+'method-context-20260909/receipt.json')
    method_context=[]
    anchors={'dataset-eml':['Taxonomic authority','No warranty','Data released annually'],'ebird-rules':['eBird is intended for observations of wild','You may report any unrestrained'],'ebird-review':['automated filters','Accepted','Unconfirmed'],'ebird-downloads':['provisional','sampling event'],'gbif-machine-tags':['omitFromScheduledCrawl','crawl_attempt']}
    for response in method_receipt['responses']:
        raw=gzip.decompress(payloads[response['path']]); text=html.unescape(re.sub('<[^>]*>',' ',raw.decode('utf-8')));text=re.sub(r'\s+',' ',text)
        excerpts=[]
        for anchor in anchors[response['name']]:
            p=text.casefold().find(anchor.casefold())
            if p>=0:excerpts.append({'searchAnchor':anchor,'normalizedTextOffset':p,'excerpt':text[max(0,p-80):p+360]})
        method_context.append({'response':response,'textTransform':'HTML tag removal, entity unescape, whitespace collapse; offsets reference transformed context only, never raw byte witnesses.','contextExcerpts':excerpts})
    contradictions=[x for g in groups.values() for x in g['contradictions']]
    return {'schemaVersion':1,'kind':'independent-selected-original-evidence-proposal','jobId':JOB,'leaseId':'lease-'+JOB+'-1','actorId':ACTOR,'actorType':'agent','baseSha':BASE,'branch':'codex/'+JOB,'status':'proposal-ready-main-method-required','adapterReview':{'actorId':ACTOR,'baseSha':BASE,'status':'proposal-ready-main-method-required','pairs':adapter},'preflight':{'command':'node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease <tx-r23-lease.json> --repo <isolated-worktree>','result':'pass','head':BASE,'errors':[],'workerSkillVersion':'frozen-windows-bulk-validation-2026-07-30-r2'},'performance':INITIAL_MEASUREMENT,'sourceDescriptors':{'outer':outer,'embedded':sorted(embedded,key=lambda x:(x['archivePath'],x['fileIndex'])),'registries':registries,'crossReferencesVerified':crosschecks},'sourceContext':{'sourceRegistryEntry':source,'dataset':{k:dataset.get(k) for k in ['key','title','publishingOrganizationKey','pubDate','license','temporalCoverages','machineTags']},'taxonomyMatch':taxon,'methodContext':method_context,'facts':['Original publisher scientific names and explicit Texas county/state fields are retained byte-for-byte for each selected record.','All selected original responses returned HTTP 200 and acquisition completed without retry.','Retained source has 15000 unique interpreted records of 21878 declared; 6878 records remain unacquired and no terminal page was reached.'],'inferences':['Repeated not_reviewed, crawl_attempt and omitFromScheduledCrawl values match older dataset machine tags. This supplies dataset-level context, not proof of the origin or per-record meaning of opaque unknown.org fields.','eBird documents automated filters and review of flagged observations. Public visibility and dataset membership do not prove individual human review of any leased record.','eBird rules intend wild living birds and permit unrestrained escaped/domestic birds. Locality alone does not establish captivity, establishment or natural origin.'],'limitations':['2024 observations are historical; 2026 retrieval does not establish present persistence, abundance, establishment or invasive impact.','All 3330 rows have TAXON_CONCEPT_ID_NOT_FOUND and CONTINENT_DERIVED_FROM_COORDINATES. Exact original binomial plus accepted classifications supports selected taxon identity; original taxon concept text is not silently treated as resolved.','Source does not supply individual checklist-review decisions, media, uncertainty or complete-checklist effort sufficient for negatives.','GADM geography is retained as conflict context and never used to substitute a county.','Selected latest retained records are not claimed to be the latest national observations; incomplete search omits 6878 declared rows.']},'originalAcquisitionLineage':{k:receipt[k] for k in ['repositoryBaseCommit','recipe','parentDiagnostic','parentSourceReceipts','startedAt','finishedAt','selection','automaticRetries','authenticatedRequests','providerWrites','completed','errors'] if k!='selection'} | {'selectedScope':sorted(selections.values(),key=lambda x:x['key']),'wholeAcquisitionOriginalCount':141,'leasedOriginalCount':43},'partialSearch':{'parameters':documents[1]['parameters'],'pagination':documents[1]['pagination'],'requestAccounting':documents[1]['requestAccounting'],'stops':documents[1]['stops'],'pageInventory':page_inventory,'scopeComplete':False},'selectedOriginalReviews':sorted(originals,key=lambda x:x['key']),'materialInterpretedReview':{'rows':3330,'originalsAcquiredForLeasedScope':43,'unacquiredOriginals':3287,'checks':dict(sorted(checks.items())),'pairs':[groups[p] for p in PAIRS],'explicitContradictions':contradictions},'counts':{'baseline':{'proposalSupportedPairs':0,'proposalSupportedOriginals':0,'canonicalEvents':0,'completedRuns':0,'newDeterminations':0,'completedSourceFamilyScreens':0},'final':{'proposalSupportedPairs':sum(x['disposition']=='supported' for x in adapter),'proposalSupportedOriginals':sum(x['disposition']=='supported' for x in originals),'canonicalEvents':0,'completedRuns':0,'newDeterminations':0,'completedSourceFamilyScreens':0},'net':{'proposalSupportedPairs':sum(x['disposition']=='supported' for x in adapter),'proposalSupportedOriginals':sum(x['disposition']=='supported' for x in originals),'canonicalEvents':0,'completedRuns':0,'newDeterminations':0,'completedSourceFamilyScreens':0},'selectedOriginalHolds':sum(x['disposition']=='held' for x in originals),'materialInterpretedConflictRecords':len(contradictions)},'verification':{'offline':True,'networkRequests':0,'importsMainCode':False,'allOuterAndEmbeddedHashesVerified':True,'allSelectedOriginalBytesAndResponseDescriptorsVerified':True,'exactSourceRowByteLocatorsAndHashes':True,'selectionRecomputedFromAllRetainedPairRows':True,'sourcePagesDecodedSequentially':True,'command':'python src/data/research/worker-results/'+JOB+'/review.py --verify','volatileMeasurements':'Initial execution measurements are frozen recipe provenance. Each rerun independently measures and reports its own wall time and peak working set.'},'semanticAttestation':{'negativeClaims':0,'unacquiredOriginalsApproved':0,'partialSourceMarkedComplete':False,'countyDerivedFromCoordinates':False,'humanApprovalClaimed':False,'captivityInferredFromHomeOrZooAlone':False},'mainRequired':['Review this proposal and register/test the selected-witness method that preserves incomplete parent search and separate original/interpreted scope.','Retain the two nonselected geography conflicts for follow-up without invalidating sound selected occurrences in those counties.','MAIN alone may create canonical events, immutable runs, determinations or source-screen outcomes after its independent integration gate.']}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--verify',action='store_true');parser.add_argument('--repo',type=Path);args=parser.parse_args()
    start=time.perf_counter();root=(args.repo or Path(__file__).resolve().parents[5]).resolve()
    out=Path(__file__).with_name('proposal.json');proposal=review(root);b=encoded(proposal)
    a=proposal['adapterReview']
    assert set(a)=={'actorId','baseSha','status','pairs'} and a['actorId']==ACTOR and a['baseSha']==BASE
    assert [x['pairKey'] for x in a['pairs']]==PAIRS
    for x in a['pairs']:
        assert set(x)=={'pairKey','primaryKey','recordKeys','heldKeys','disposition'}
        assert x['recordKeys']==sorted(set(x['recordKeys'])) and x['heldKeys']==sorted(set(x['heldKeys']))
        assert set(x['heldKeys']).issubset(x['recordKeys'])
        assert (x['primaryKey'] in set(x['recordKeys'])-set(x['heldKeys'])) if x['disposition']=='supported' else x['primaryKey'] is None
    assert sorted(k for x in a['pairs'] for k in x['recordKeys'])==KEYS
    assert len(b)+Path(__file__).stat().st_size < 8*1024*1024
    if args.verify:
        assert out.read_bytes()==b,'Proposal differs from independent offline reconstruction'
    else:out.write_bytes(b)
    peak=peak_bytes();assert peak < 384*1024*1024
    print(json.dumps({'ok':True,'mode':'verify' if args.verify else 'write','proposalSha256':sha(b),'proposalBytes':len(b),'wallSeconds':round(time.perf_counter()-start,6),'peakWorkingSetBytes':peak,'peakWorkingSetMiB':round(peak/1024/1024,3),'pairs':proposal['adapterReview']['pairs'],'counts':proposal['counts']},sort_keys=True))


if __name__=='__main__':main()
