#!/usr/bin/env python3
"""Offline independent EPA 2018-19 proposal review; Python standard library only.
Create: python review.py --write --lease <b-lease.json> --job <b-job.json>
Reproduce without network or writes: python review.py --verify
The complete deterministic proposal is rebuilt from retained original bytes.
"""
import argparse, base64, collections, csv, datetime, gzip, hashlib, json, math, pathlib, re
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[4]
ARCHIVE = 'ops/national-research/evaluations/artifacts/epa-nrsa-1819-preflight-20260908-r20.json.gz'
ARCHIVE_HASH = '2d9fa00357ebaba1a9b87481be69a2de3918748836fa752c2b3a2fcc1825cf8b'
PREFIX = '.cache/research/campaigns/20260908-r20-epa-nrsa-1819/'
REF_PREFIX = '.cache/research/campaigns/20260908-r18-epa-nrsa/'
PRIMARY = PREFIX + 'primary-reacquisition-1/'
BASE = '753829bcfe88115dddbc46654a5e76ee97d6e3e9'
JOB = 'epa-nrsa-1819-source-review-b-20260908-r20'
def sha(b): return hashlib.sha256(b).hexdigest()
def readjson(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def canonical(d): return (json.dumps(d, ensure_ascii=False, indent=2)+'\n').encode('utf-8')
def norm(s): return ' '.join(s.strip().casefold().split())
def date(s):
    try: return datetime.datetime.strptime(s,'%m/%d/%Y').date().isoformat()
    except ValueError: return None

def visit(f):
    d=date(f['DATE_COL'])
    if not d or f['VISIT_NO'] not in ('1','2') or not f['SITE_ID']: return None
    return f['SITE_ID'],d,f['VISIT_NO'],f.get('STATE',f.get('PSTL_CODE'))

def parse_csv(path,raw):
    lines=raw.splitlines(keepends=True)
    text=[b.decode('utf-8') for b in lines];text[0]=text[0].removeprefix('\ufeff')
    reader=csv.reader(text,strict=True);header=next(reader);prior=reader.line_num
    assert len(set(header))==len(header)
    offsets=[0]
    for line in lines: offsets.append(offsets[-1]+len(line))
    rows=[]
    for i,fields in enumerate(reader):
        end=reader.line_num
        assert len(fields)==len(header),(path,i)
        record=b''.join(lines[prior:end]);assert record==raw[offsets[prior]:offsets[end]]
        rows.append({'parsedRowIndexZeroBased':i,'physicalStartLineOneBased':prior+1,'physicalEndLineOneBased':end,
            'byteOffsetZeroBased':offsets[prior],'rawRecordBytes':len(record),'rawRecordSha256':sha(record),
            'fields':dict(zip(header,fields)),'artifactPath':path})
        prior=end
    return header,rows

def loc(r):
    if r is None:return None
    return {**{k:v for k,v in r.items() if k!='fields'},'sourceFields':{k:v for k,v in r['fields'].items() if v!=''}}

def flat(values):
    for v in values:
        if isinstance(v,int):yield v if v>=0 else ~v
        else:yield from flat(v)

def topology_tools(topo):
    geos={g['id']:g for g in topo['objects']['counties']['geometries']};states=collections.defaultdict(set)
    for g in geos.values():
        for a in flat(g['arcs']):states[a].add(g['properties']['stateCode'])
    scale,trans=topo['transform']['scale'],topo['transform']['translate'];arcs=[]
    for arc in topo['arcs']:
        x=y=0;pts=[]
        for dx,dy in arc:
            x+=dx;y+=dy;pts.append((x*scale[0]+trans[0],y*scale[1]+trans[1]))
        arcs.append(pts)
    def rings(g):
        polys=g['arcs'] if g['type']=='MultiPolygon' else [g['arcs']]
        return [[sum([arcs[a] if a>=0 else arcs[~a][::-1] for a in ring],[]) for ring in p] for p in polys]
    def inside(x,y,ring):
        result=False
        for a,b in zip(ring,ring[1:]+ring[:1]):
            if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:result=not result
        return result
    def diagnostic(site,county):
        g=geos[county];adj=set().union(*(states[a] for a in flat(g['arcs'])));border=site['BORD_RIV']
        claimed=set(border.split(':')) if border!='Not_Border' else set()
        domestic=claimed-{'MX','CA'}
        x,y=float(site['LON_DD83']),float(site['LAT_DD83']);polys=rings(g)
        contained=any(inside(x,y,p[0]) and not any(inside(x,y,h) for h in p[1:]) for p in polys)
        minimum=0.0 if contained else float('inf')
        if not contained:
            sx,sy=111320*math.cos(math.radians(y)),111320
            for p in polys:
                for ring in p:
                    for a,b in zip(ring,ring[1:]+ring[:1]):
                        ax,ay,bx,by=(a[0]-x)*sx,(a[1]-y)*sy,(b[0]-x)*sx,(b[1]-y)*sy
                        dx,dy=bx-ax,by-ay;den=dx*dx+dy*dy
                        q=max(0,min(1,-(ax*dx+ay*dy)/den)) if den else 0
                        minimum=min(minimum,math.hypot(ax+q*dx,ay+q*dy))
        return {'publisherBorder':border,'declaredCountyAdjacentStates':sorted(adj),
            'domesticBorderConsistentWithDeclaredCounty':domestic.issubset(adj),'framePointWithinDeclaredCounty':contained,
            'approximateFrameDistanceOutsideDeclaredCountyMeters':round(minimum),'coordinateAssignedCounty':None,
            'role':'Contradiction diagnostic only. No coordinate routing, reassignment, foreign-border validation or reach-footprint claim.'}
    return diagnostic

def build(context):
    ab=(ROOT/ARCHIVE).read_bytes();assert len(ab)==2027641 and sha(ab)==ARCHIVE_HASH
    archive=json.loads(gzip.decompress(ab));assert archive['kind']=='epa-nrsa-1819-source-preflight'
    files={};descriptors=[];nested_checks=[]
    def check(items,outer):
        names=set()
        for item in items:
            p=item['originalPath'];assert p not in names;names.add(p)
            b=base64.b64decode(item['contents'],validate=True);assert len(b)==item['bytes'] and sha(b)==item['sha256']
            desc={k:item[k] for k in ('originalPath','bytes','sha256')}
            if outer:
                files[p]=b
                if p.endswith('.gz'):
                    decoded=gzip.decompress(b);desc.update(decodedBytes=len(decoded),decodedSha256=sha(decoded))
                descriptors.append(desc)
            else:nested_checks.append(desc)
    check(archive['files'],True)
    nested='ops/national-research/evaluations/artifacts/epa-nrsa-2324-preflight-20260908-r18.json.gz'
    check(json.loads(gzip.decompress(files[nested]))['files'],False)
    def ej(p):return json.loads(files[p])
    def desc(p):return {'artifactPath':p,'bytes':len(files[p]),'sha256':sha(files[p])}
    primary=ej(PRIMARY+'retrieval-receipt.json');taxreceipt=ej(PREFIX+'taxonomy-retrieval-receipt.json');prior=ej(REF_PREFIX+'retrieval-receipt.json')
    parity=[];requests=[]
    for receipt,expected in ((primary,6),(taxreceipt,2),(prior,6)):
        assert len(receipt['receipts'])==expected and receipt['providerWrites']==0 and receipt['automaticRetries']==0
        for r in receipt['receipts']:
            assert r['status']==200 and r['url']==r['finalUrl'] and r['url'].startswith('https://www.epa.gov/')
            retained=r['path'] in files
            if retained:
                body=files[r['path']];decoded=gzip.decompress(body)
                assert len(body)==r['bytes'] and sha(body)==r['sha256']
                assert len(decoded)==r['decodedBytes'] and sha(decoded)==r['decodedSha256']
            if receipt is primary:
                old=PREFIX+pathlib.PurePosixPath(r['path']).name
                assert gzip.decompress(files[old])==decoded
                parity.append({'freshPath':r['path'],'originalPath':old,'decodedBytes':len(decoded),'decodedSha256':sha(decoded),'byteIdentical':True})
            requests.append({**r,'bodyRetainedAtOuterLevel':retained,'requestGroup':receipt['kind'],'pagination':'single complete file response'})
        if receipt['recipe']['path'] in files:assert sha(files[receipt['recipe']['path']])==receipt['recipe']['sha256']
    assert primary['requests']==6 and primary['successfulResponses']==6
    assert primary['finishedAt']>=max(r['retrievedAt'] for r in primary['receipts'])
    assert files[PREFIX+'retrieval-receipt.json']==files[PREFIX+'retrieval-receipt-after-taxonomy-collision.json']
    collision=ej(PREFIX+'receipt-collision-recovery.json');assert collision['overwrittenReceipt']['sha256']==sha(files[PREFIX+'retrieval-receipt.json'])
    catalogs={};inputs=[]
    for p in ['src/data/generated/species.json','src/data/research/county-equivalent-registry.json','src/data/research/state-registry.json','src/data/source/county-equivalents-topology.json','src/data/research/source-registry.json']:
        b=(ROOT/p).read_bytes();inputs.append({'path':p,'bytes':len(b),'sha256':sha(b)});catalogs[p]=json.loads(b)
    species={r['id']:r for r in catalogs['src/data/generated/species.json']}
    counties={r['countyFips']:r for r in catalogs['src/data/research/county-equivalent-registry.json']['countyEquivalents']}
    diagnostic=topology_tools(catalogs['src/data/source/county-equivalents-topology.json'])
    paths={'fish':PRIMARY+'nrsa-1819-fish-count-data.csv.gz','sampling':PRIMARY+'nrsa-1819-fish-sampling-information-data.csv.gz',
        'site':PRIMARY+'NRSA_1819_SiteInfo.csv.gz','taxon2013':PREFIX+'nrsa1314_fishtaxa_02042019.csv.gz','taxon2023':REF_PREFIX+'nrsa2324_fishtaxa.csv.gz'}
    tables={};scans={}
    for label,p in paths.items():
        raw=gzip.decompress(files[p]);header,rows=parse_csv(p,raw);tables[label]=rows
        scans[label]={'artifactPath':p,'decodedBytes':len(raw),'decodedSha256':sha(raw),'encoding':'utf-8-sig' if raw.startswith(b'\xef\xbb\xbf') else 'utf-8',
            'columns':header,'parsedRows':len(rows),'rowHashInventoryColumns':['parsedRowIndexZeroBased','physicalStartLineOneBased','physicalEndLineOneBased','rawRecordSha256'],
            'rowHashInventory':[[r['parsedRowIndexZeroBased'],r['physicalStartLineOneBased'],r['physicalEndLineOneBased'],r['rawRecordSha256']] for r in rows]}
    smap=collections.defaultdict(list);gmap=collections.defaultdict(list);visits=collections.defaultdict(list)
    for r in tables['sampling']:smap[visit(r['fields'])].append(r)
    for r in tables['site']:gmap[visit(r['fields'])].append(r)
    for r in tables['fish']:visits[visit(r['fields'])].append(r)
    joins=collections.Counter()
    for key,fish in visits.items():
        if key is None:joins['invalid-fish-key']+=1;continue
        if len(smap[key])!=1 or len(gmap[key])!=1:joins['ambiguous-or-missing-join']+=1;continue
        uids={r['fields']['UID'] for r in fish};su=smap[key][0]['fields']['UID'];gu=gmap[key][0]['fields']['UID']
        joins['unique-composite-visit']+=1
        if len(uids)!=1:joins['nonunique-fish-UID-within-visit']+=1
        if su!=gu:joins['sampling-site-UID-disagreement']+=1
        joins['all-UIDs-equal' if uids=={su} and su==gu else 'fish-UID-differs']+=1
    assert joins['unique-composite-visit']==1773 and joins['fish-UID-differs']==1772 and not joins['sampling-site-UID-disagreement']
    indexes={}
    for label in ('taxon2013','taxon2023'):
        bykey=collections.defaultdict(list);byid=collections.defaultdict(list);byname=collections.defaultdict(list)
        for row in tables[label]:
            f=row['fields'];bykey[(f['TAXA_ID'],norm(f['FINAL_NAME']))].append(row);byid[f['TAXA_ID']].append(row);byname[norm(f['FINAL_NAME'])].append(row)
        indexes[label]=bykey,byid,byname
    leased=context['lease']['taxaOrPairScope']['pairs'];assert leased==sorted(set(leased)) and len(leased)==149
    ids=sorted({p.split(':')[1] for p in leased});target={norm(species[s]['scientificName']):s for s in ids};crosswalk={}
    for label in ('taxon2023','taxon2013'):
        for row in tables[label]:
            f=row['fields'];scientific=norm(f['GENUS']+' '+f['SPECIES'])
            if scientific in target:crosswalk.setdefault((f['TAXA_ID'],norm(f['FINAL_NAME'])),set()).add(target[scientific])
    reviewed=[];by_pair=collections.defaultdict(list)
    duplicates=collections.Counter((visit(r['fields']),r['fields']['TAXA_ID'],norm(r['fields']['FINAL_NAME'])) for r in tables['fish'])
    for fish in tables['fish']:
        f=fish['fields'];tk=f['TAXA_ID'],norm(f['FINAL_NAME']);targets=crosswalk.get(tk,set())
        if not targets:continue
        key=visit(f);ss=smap.get(key,[]);gs=gmap.get(key,[])
        if len(ss)!=1 or len(gs)!=1:continue
        sampling,site=ss[0],gs[0];s,g=sampling['fields'],site['fields']
        for sid in sorted(targets):
            county=g['STATECTY'][1:] if re.fullmatch(r'F\d{5}',g['STATECTY']) else '';pair=county+':'+sid
            if pair not in leased:continue
            holds=[];caveats=[];t23s=indexes['taxon2023'][0].get(tk,[]);t13s=indexes['taxon2013'][0].get(tk,[])
            t23=t23s[0] if len(t23s)==1 else None;t13=t13s[0] if len(t13s)==1 else None
            for label,matches in [('taxon2023',t23s),('taxon2013',t13s)]:
                if len(matches)>1:holds.append(label+'-ambiguous-exact-key')
                if any(norm(r['fields']['GENUS']+' '+r['fields']['SPECIES'])!=norm(species[sid]['scientificName']) for r in matches):holds.append(label+'-scientific-name-contradiction')
                if len(indexes[label][1].get(f['TAXA_ID'],[]))>1:holds.append(label+'-nonunique-ID')
                if any(norm(r['fields']['GENUS']+' '+r['fields']['SPECIES'])!=norm(species[sid]['scientificName']) for r in indexes[label][2].get(norm(f['FINAL_NAME']),[])):holds.append(label+'-common-name-concept-ambiguity')
            if t23 is None:holds.append('missing-exact-2023-taxonomy-reference')
            if t13 is None:holds.append('newer-reference-only-no-contemporaneous-crosswalk')
            if not re.fullmatch('[1-9][0-9]*',f['TOTAL']):holds.append('invalid-or-nonpositive-total')
            if f['IS_DISTINCT']!='1':holds.append('non-distinct-taxon-in-sample')
            if duplicates[(key,f['TAXA_ID'],norm(f['FINAL_NAME']))]!=1:holds.append('duplicate-source-taxon-visit')
            if s['UID']!=g['UID']:holds.append('sampling-site-UID-disagreement')
            if len({r['fields']['UID'] for r in visits[key]})!=1:holds.append('nonunique-fish-visit-UID')
            if s['SAMPLE_TYPE']!='FISH':holds.append('sampling-not-fish')
            if g['DSGN_CYCLE']!='2018-19' or g['EVAL_CAT']!='Target_Sampled' or g['TNT_CAT']!='Target':holds.append('wrong-cycle-or-not-target-sampled')
            if key[1][:4] not in ('2018','2019') or g['YEAR']!=key[1][:4]:holds.append('date-cycle-contradiction')
            if s['ACTUAL_DATE'] and date(s['ACTUAL_DATE'])!=key[1]:holds.append('actual-date-contradiction')
            if s['FISH_SAMPLING'] in ('DATA_LOST','NO_PERMIT','NO_FISH','NO_FISH_OBSERVED','EQUIPMENT_FAILURE','PERMIT_RESTRICT'):holds.append('sampling-qualification-needs-original-detail')
            elif s['FISH_SAMPLING'] not in ('','NOT_FISHED_REACH_MIN','SITE_CONDITIONS'):holds.append('unreviewed-sampling-qualification')
            c=counties.get(county)
            if not c or c['status']!='active':holds.append('inactive-or-missing-county')
            else:
                if c['stateCode']!=f['STATE'] or c['stateCode']!=s['STATE'] or c['stateCode']!=g['PSTL_CODE'] or norm(c['stateName'])!=norm(g['STATE_NM']):holds.append('publisher-state-contradiction')
                if norm(g['CNTYNAME']) not in {norm(x) for x in [c['shortName'],c['legalName'],*c['aliases']]}:holds.append('publisher-county-name-contradiction')
            diag=diagnostic(g,county)
            if not diag['domesticBorderConsistentWithDeclaredCounty']:holds.append('material-publisher-river-border-county-contradiction')
            if diag['approximateFrameDistanceOutsideDeclaredCountyMeters']>10000:holds.append('gross-frame-versus-declared-county-contradiction')
            elif not diag['framePointWithinDeclaredCounty']:caveats.append('Frame point outside current simplified declared-county geometry is diagnostic only. Limited border displacement does not replace exact publisher geography.')
            if s['SAMPLED_FISH']!='YES-SUFFICIENT' or s['FISH_SAMPLING_SUFFICIENT']!='Y' or s['FISH_SAMPLING']:caveats.append('Partial or uncertain effort; positive TOTAL does not imply survey completeness. NO-prefixed reach/individual thresholds describe effort, not species absence.')
            if any(v for k,v in s.items() if k.endswith('_FLAG')):caveats.append('Protocol and gear flags retained; comment labels do not reject the positive taxon record without supporting detail.')
            if f['ANOM_CT']!='0':caveats.append('ANOM_CT counts anomalies, not distinct fish; no unsupported ANOM_CT <= TOTAL constraint.')
            if g['BORD_RIV']!='Not_Border':caveats.append('Border-river positive remains at publisher assigned county and sampled-reach scale; no adjacent-county expansion.')
            if f['UID']!=s['UID']:caveats.append('Original fish UID differs from sampling/site UID; unique composite visit join preserves all identifiers.')
            row={'pairKey':pair,'date':key[1],'total':int(f['TOTAL']),'scientificName':species[sid]['scientificName'],
                'fish':loc(fish),'sampling':loc(sampling),'site':loc(site),'taxon2023':loc(t23),'taxon2013':loc(t13),
                'join':{'keyFields':['SITE_ID','date(DATE_COL)','VISIT_NO','STATE/PSTL_CODE'],'key':list(key),'samplingMatches':len(ss),'siteMatches':len(gs),
                    'fishUid':f['UID'],'samplingUid':s['UID'],'siteUid':g['UID'],'samplingSiteUidAgree':s['UID']==g['UID']},
                'taxonomy':{'sourceTaxaId':f['TAXA_ID'],'sourceFinalName':f['FINAL_NAME'],
                    'status':'independent-exact-key-references-agree' if t13 and t23 and not any('taxon' in h or 'crosswalk' in h for h in holds) else 'held-cross-cycle-mapping',
                    'matchingMethod':'Exact TAXA_ID plus case-normalized FINAL_NAME in each reference, then exact GENUS+SPECIES to catalog. No globally stable ID assumption, fuzzy match or rank collapse.'},
                'county':{'countyFips':county,'status':c['status'],'stateCode':c['stateCode'],'shortName':c['shortName'],'geographyMethod':'Exact publisher STATECTY FIPS plus CNTYNAME and state to active registry.'},
                'geographyDiagnostic':diag,'proposalDisposition':'held-row' if holds else 'supported-row','holdReasons':sorted(set(holds)),'caveats':caveats}
            reviewed.append(row);by_pair[pair].append(row)
    assert set(by_pair)==set(leased)
    supported=[];held=[];witnesses=[];pair_reviews=[]
    def rank(r):
        f=r['sampling']['sourceFields']
        return (f.get('SAMPLED_FISH')!='YES-SUFFICIENT',f.get('FISH_SAMPLING_SUFFICIENT')!='Y',bool(f.get('FISH_SAMPLING')),
            bool(f.get('FISH_PROTOCOL_FLAG') or f.get('FISH_SAMPLING_FLAG')),r['site']['sourceFields']['BORD_RIV']!='Not_Border',
            -int(r['date'].replace('-','')),-r['total'],r['fish']['parsedRowIndexZeroBased'])
    for pair in leased:
        candidates=by_pair[pair];eligible=[r for r in candidates if not r['holdReasons']];winner=min(eligible,key=rank) if eligible else None
        if winner:supported.append(pair);witnesses.append(winner)
        else:held.append(pair)
        pair_reviews.append({'pairKey':pair,'status':'supported-pending-main-method' if winner else 'held',
            'selectedFishRowIndexZeroBased':winner['fish']['parsedRowIndexZeroBased'] if winner else None,
            'allReviewedFishRowIndexesZeroBased':[r['fish']['parsedRowIndexZeroBased'] for r in candidates],
            'supportedRowCount':len(eligible),'heldRowCount':len(candidates)-len(eligible),
            'holdReasons':sorted({h for r in candidates for h in r['holdReasons']}) if not winner else []})
    metadata=[]
    for p in [PRIMARY+'nrsa-1819-fish-count-metadata.txt.gz',PRIMARY+'nrsa-1819-fish-sampling-information-metadata.txt.gz',PRIMARY+'NRSA18_19_Site_Information_Metadata.txt.gz',
        PREFIX+'nrsa1314_fishtaxa_meta_04292019.txt.gz',REF_PREFIX+'nrsa2324_fishtaxa_metadata.csv.gz']:
        raw=gzip.decompress(files[p]);text=raw.decode('cp1252')
        wanted=('FINAL_NAME','TAXA_ID','GENUS','SPECIES','IS_DISTINCT','TOTAL','ANOM_CT','NON_NATIVE','DATE_COL','UID','STATECTY','CNTYNAME','PSTL_CODE','BORD_RIV','LAT_DD83','LON_DD83','FISH_SAMPLING','SAMPLED_FISH','DSGN_CYCLE','RCHDOWN','RCHUP')
        evidence=[{'physicalLineOneBased':i+1,'rawLineSha256':sha(b),'text':b.decode('cp1252').rstrip('\r\n')} for i,b in enumerate(raw.splitlines(keepends=True)) if any(w in b.decode('cp1252') for w in wanted)]
        metadata.append({'artifactPath':p,'decodedBytes':len(raw),'decodedSha256':sha(raw),'readEncoding':'cp1252','sourceBytesUnmodified':True,'selectedDefinitions':evidence})
    zero={'acceptedDeterminations':0,'assertionEvents':0,'reviewEvents':0,'rejectionEvents':0,'outcomeEvents':0,'countySpeciesDeterminationMovement':0}
    return {'schemaVersion':1,'kind':'epa-nrsa-2018-19-independent-shared-method-proposal','status':'proposal-ready-main-method-required',
        'actorId':'epa_nrsa_1819_review_b_r20','baseSha':BASE,'sourceId':'epa-nrsa-fish-counts','context':context,
        'scope':{'leasedPairs':leased,'supportedPairs':supported,'heldPairs':held},
        'counts':{'leasedPairs':len(leased),'supportedPairs':len(supported),'heldPairs':len(held),'materialFishRowsReviewed':len(reviewed),
            'supportedRows':sum(not r['holdReasons'] for r in reviewed),'heldRows':sum(bool(r['holdReasons']) for r in reviewed),
            'workerPublicReadRequests':0,'workerSourceAcquisitionRequests':0,'baseline':zero,'final':zero,'net':zero},
        'byteVerification':{'archive':{'path':ARCHIVE,'bytes':len(ab),'sha256':sha(ab)},'outerEmbeddedFileCount':len(descriptors),
            'outerEmbeddedFiles':descriptors,'nestedEmbeddedFiles':nested_checks,'freshPrimaryOriginalByteParity':parity,'repositoryInputs':inputs,
            'recipe':{'path':pathlib.Path(__file__).relative_to(ROOT).as_posix(),'sha256':sha(pathlib.Path(__file__).read_bytes())}},
        'requestAccounting':{'workerRequests':0,'workerPrimaryWebOperations':0,'maximumWorkerPrimaryWebOperations':8,'freshPrimarySuccessfulFileGets':6,
            'historicalTaxonomySuccessfulFileGets':2,'prior2023ContextSuccessfulFileGets':6,'retainedReceiptRequests':requests,
            'primaryReceipt':desc(PRIMARY+'retrieval-receipt.json'),'primaryReceiptCodeIdentity':primary['repositoryBaseCommit'],
            'originalPrimaryRequestMetadata':'Unavailable after receipt overwrite. No reconstructed timestamps or headers; duplicated taxonomy receipts are not primary receipts.',
            'receiptCollision':collision,'sourceIndex':prior['indexSource'],'taxonomyLineageQualification':ej(PREFIX+'taxonomy-acquisition-lineage-qualification.json'),
            'preceding2018MetadataWebOperations':{'count':3,'fishCount':'retrieved','sampling':'retrieved','site':'Unicode renderer error'},
            'countQualification':'The same three metadata web operations appear in copied taxonomy context; do not count them again. Original six primary GET bodies survived but original per-request metadata did not. Fresh six GETs supply acquisition authority. Prior context and source-index requests predate this worker.'},
        'sourceVerification':{'publisher':'U.S. Environmental Protection Agency','homepage':'https://www.epa.gov/national-aquatic-resource-surveys/data-national-aquatic-resource-surveys',
            'availability':'Six exact primary URLs returned HTTP 200 during retained fresh retrieval 2026-09-08T20:46:26.895Z through 2026-09-08T20:46:30.500Z.',
            'retention':'Existing registry declares versioned retention; public EPA artifacts remain hashed. No separate license claim invented.',
            'freshness':'Historical observations in 2018-2019. Count/site publication 2022; 2023-24 taxonomy reference published 2026. Retrieval does not refresh observations.',
            'negativeCapability':'none','metadataWitnesses':metadata},
        'visitJoinInventory':dict(sorted(joins.items())),'sourceCsvScans':scans,
        'methodProposal':{'scope':'Historical positive records only. MAIN must register and validate the distinct 2018-19 method.',
            'join':'Unique SITE_ID + valid DATE_COL + VISIT_NO + STATE/PSTL_CODE across complete sampling/site files; sampling/site UID must agree. Fish UID is separate and never rewritten.',
            'taxonomy':'Exact ID and common name independently bridge the 2013-14 and 2023-24 official lists; both must yield exact catalog binomial. Newer-reference-only names held for an authoritative historical bridge.',
            'positives':'Positive integer TOTAL, IS_DISTINCT=1, coherent dated target-sampled 2018-19 visit and exact active publisher county/state. ANOM_CT and NON_NATIVE are context, not presence gates.',
            'sampling':'Sufficiency remains a separate effort axis. Positive counts may survive explicitly qualified insufficient reach/individual effort. DATA_LOST and unresolved categorical contradictions held; original flags retained.',
            'geography':'Publisher FIPS/name/state is authority. County topology detects gross or border contradictions without assigning another county. Small design-point displacement is a caveat, not county evidence. The 10 km gross-discrepancy trigger only places a review hold, never creates a positive.',
            'selectionOrder':['YES-SUFFICIENT effort','sampling sufficient Y','empty suspension flag','no protocol/sampling comment flag','non-border visit','latest observation date','larger count','lowest original row index'],
            'sourceRecordIdentity':'Archive hash plus raw fish row hash/index; preserve fish/sampling/site UIDs and full composite visit. Do not sum alternative visits or non-distinct common/mirror carp.',
            'validationRequiredByMain':['Register explicit 2018-19 retained method and cross-cycle taxonomy policy.','Implement independent canonical byte, visit, sampling and geography validation.','Emit immutable state runs under an evaluated completion profile.','Centrally reconcile exact net unique county-species movement.']},
        'pairReviews':pair_reviews,'witnesses':witnesses,'reviewedRecords':reviewed,
        'caveats':['This is a proposal, not a completed run, source screen, accepted review or public determination.',
            'Missing and held evidence never imply absence or survey non-detection.',
            'Sampled positives do not establish countywide distribution, prevalence, persistence, nativity, establishment or current occurrence.',
            'Raw row hashes include original terminators. Row indexes exclude the header and start at zero; physical lines start at one. Site BOM is handled only in parsing.',
            'Preliminary candidate recipes are integrity checked but never executed or used to choose witnesses.',
            'The job JSON carries executionContract; the lease template omits this optional field. Its safety fields and proposal-only completion criteria govern; no authority broadened.',
            'Frozen complete-run manifest profile cannot represent this national method proposal; no manifest or canonical events created.'],
        'remainingWork':['MAIN source-method registration, canonical implementation/validation and lease closure.']}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');parser.add_argument('--verify',action='store_true');parser.add_argument('--lease');parser.add_argument('--job');args=parser.parse_args()
    output=HERE/'proposal.json'
    if args.write:
        assert not output.exists(),'Refuse to overwrite existing proposal; use --verify.'
        lease,job=readjson(args.lease),readjson(args.job)
        assert lease['baseSha']==BASE and lease['jobId']==JOB and job['jobId']==JOB
        assert lease['taxaOrPairScope']['pairs']==job['executionContract']['exactCandidatePairs'] and 'executionContract' not in lease
        context={'lease':lease,'executionContract':job['executionContract'],'leaseInputSha256':sha(pathlib.Path(args.lease).read_bytes()),'jobInputSha256':sha(pathlib.Path(args.job).read_bytes()),
            'preflight':{'ok':True,'jobId':JOB,'leaseId':lease['leaseId'],'branch':lease['branch'],'head':BASE,
                'command':'node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease <b-lease.json> --repo <isolated-worktree>',
                'evidence':'Executed before edits; exit 0 and errors=[].'}}
    else:
        assert args.verify;context=readjson(output)['context']
    result=build(context);encoded=canonical(result);assert len(encoded)+pathlib.Path(__file__).stat().st_size<=8388608
    if args.write:output.write_bytes(encoded)
    else:assert encoded==output.read_bytes(),'Reproduction differs from retained proposal bytes.'
    print(json.dumps({'verification':'PASS','mode':'write' if args.write else 'verify','proposalBytes':len(encoded),'proposalSha256':sha(encoded),'recipeSha256':sha(pathlib.Path(__file__).read_bytes()),
        'counts':result['counts'],'held':[p for p in result['pairReviews'] if p['status']=='held']},indent=2))
if __name__=='__main__':main()
