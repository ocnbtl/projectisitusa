"""Independent offline NRSA 2018-19 review. Run --write or --verify. No network."""
import argparse, base64, collections, csv, datetime, gzip, hashlib, io, json, math, pathlib, re, subprocess, unicodedata
BASE='753829bcfe88115dddbc46654a5e76ee97d6e3e9'
JOB='epa-nrsa-1819-source-review-a-20260908-r20'
ACTOR='epa_nrsa_1819_review_a_r20'
ROOT=pathlib.Path(__file__).resolve().parents[5]
OUT=pathlib.Path(__file__).resolve().parent
ARCHIVE='ops/national-research/evaluations/artifacts/epa-nrsa-1819-preflight-20260908-r20.json.gz'
ARCHIVE_SHA='2d9fa00357ebaba1a9b87481be69a2de3918748836fa752c2b3a2fcc1825cf8b'
CACHE='.cache/research/campaigns/20260908-r20-epa-nrsa-1819/'
OLD='.cache/research/campaigns/20260908-r18-epa-nrsa/'
LEASE_PATH=pathlib.Path('C:/Code/project-isitusa/.cache/research/campaigns/20260908-r20-epa-nrsa-1819/a-lease.json')
sha=lambda b:hashlib.sha256(b).hexdigest()
serialize=lambda o:(json.dumps(o,indent=2,ensure_ascii=True)+'\n').encode()
def blob(p):
    return subprocess.check_output(['git','show',BASE+':'+p],cwd=ROOT)
def norm(s):
    return re.sub('[^a-z0-9]','', ''.join(c for c in unicodedata.normalize('NFKD',s.lower()) if not unicodedata.combining(c)))
def name(r):
    return (r.get('GENUS','')+' '+r.get('SPECIES','')).strip().lower()
def date(s):
    if not re.fullmatch(r'\d{1,2}/\d{1,2}/\d{4}',s):return None
    try:return datetime.datetime.strptime(s,'%m/%d/%Y').date().isoformat()
    except ValueError:return None
def key(r):
    d=date(r.get('DATE_COL','')); state=r.get('STATE',r.get('PSTL_CODE',''))
    if not d or not r.get('SITE_ID') or r.get('VISIT_NO') not in ('1','2') or not re.fullmatch('[A-Z]{2}',state):return None
    return r['SITE_ID'],d,r['VISIT_NO'],state
def parse(raw,encoding='utf-8-sig',delimiter=',',metadata=False):
    lines=raw.splitlines(keepends=True)
    reader=csv.reader(io.StringIO(raw.decode(encoding,errors='strict'),newline=''),delimiter=delimiter,strict=not metadata)
    header=next(reader); assert len(set(header))==len(header) and all(header)
    previous=reader.line_num; offset=sum(map(len,lines[:previous])); result=[]
    for values in reader:
        end=reader.line_num; original=b''.join(lines[previous:end]); start=offset; offset+=len(original); first=previous+1; previous=end
        if not values:continue
        assert len(values)==len(header),(end,len(values),len(header))
        r=dict(zip(header,values))
        result.append({'r':r,'w':{'parsedRowIndexZeroBased':len(result),'physicalStartLineOneBased':first,'physicalEndLineOneBased':end,'rawByteOffsetZeroBased':start,'rawRecordBytes':len(original),'rawRecordSha256':sha(original),'sourceFields':{k:v for k,v in r.items() if v!=''}}})
    assert offset==len(raw)
    return result,header
def index(rows,fn):
    x=collections.defaultdict(list)
    for i,e in enumerate(rows):
        k=fn(e['r'])
        if k is not None:x[k].append(i)
    return x
def bounds(t):
    scale,translate=t['transform']['scale'],t['transform']['translate']; arcs=[]
    for arc in t['arcs']:
        x=y=0; points=[]
        for dx,dy in arc:
            x+=dx;y+=dy;points.append((x*scale[0]+translate[0],y*scale[1]+translate[1]))
        arcs.append([min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)])
    def flat(v):
        if isinstance(v,int):yield v if v>=0 else ~v
        else:
            for q in v:yield from flat(q)
    result={}
    for g in t['objects']['counties']['geometries']:
        a=[arcs[i] for i in flat(g['arcs'])]
        result[g['id']]=[min(q[0] for q in a),min(q[1] for q in a),max(q[2] for q in a),max(q[3] for q in a)]
    return result
def review(lease,contract,stamp):
    assert lease['jobId']==JOB and lease['baseSha']==BASE
    pairs=sorted(lease['taxaOrPairScope']['pairs'])
    assert len(pairs)==len(set(pairs))==149 and pairs==sorted(contract['exactCandidatePairs'])
    assert contract['proposalOnly'] and contract['reviewOnly'] and contract['noNetworkAcquisition']
    assert lease['permittedPaths']==['src/data/research/worker-results/'+JOB+'/**']
    outer=(ROOT/ARCHIVE).read_bytes();assert len(outer)==2027641 and sha(outer)==ARCHIVE_SHA
    archive=json.loads(gzip.decompress(outer)); files={}; embedded=[]
    for f in archive['files']:
        b=base64.b64decode(f['contents'],validate=True)
        assert f['originalPath'] not in files and len(b)==f['bytes'] and sha(b)==f['sha256']
        files[f['originalPath']]=b;embedded.append({k:f[k] for k in ['originalPath','bytes','sha256']})
    assert len(files)==45
    j=lambda p:json.loads(files[p])
    receipts={'primary':j(CACHE+'primary-reacquisition-1/retrieval-receipt.json'),'2013':j(CACHE+'taxonomy-retrieval-receipt.json'),'2023':j(OLD+'retrieval-receipt.json')}
    fresh=receipts['primary']
    assert fresh['requests']==fresh['successfulResponses']==6 and fresh['providerWrites']==fresh['automaticRetries']==0
    assert fresh['repositoryBaseCommit']=='22be801ad3a2ac1fae425896282012947422cfbb'
    assert sha(files[fresh['recipe']['path']])==fresh['recipe']['sha256']
    provenance={};parity=[]
    for label,receipt in receipts.items():
        for r in receipt['receipts']:
            if r['path'] not in files:continue
            b=files[r['path']];d=gzip.decompress(b)
            assert r['status']==200 and r['url']==r['finalUrl'] and len(b)==r['bytes'] and sha(b)==r['sha256']
            assert len(d)==r['decodedBytes'] and sha(d)==r['decodedSha256']
            provenance[r['path']]=r
            if label=='primary':
                p=CACHE+pathlib.PurePosixPath(r['path']).name
                assert gzip.decompress(files[p])==d
                parity.append({'originalPath':p,'freshPath':r['path'],'decodedSha256':sha(d),'decodedBytes':len(d),'identical':True})
    assert len(parity)==6
    paths=['src/data/research/county-equivalent-registry.json','src/data/research/state-registry.json','src/data/research/state-research-config.json','src/data/generated/species.json','src/data/source/county-equivalents-topology.json','src/data/source/county-equivalents-topology.receipt.json']
    local={p:blob(p) for p in paths}
    context=[{'path':p,'gitCommit':BASE,'bytes':len(b),'sha256':sha(b)} for p,b in local.items()]
    counties={c['countyFips']:c for c in json.loads(local[paths[0]])['countyEquivalents']}
    targets={s['id']:s['scientificName'] for s in json.loads(local[paths[3]]) if s['id'] in lease['taxaOrPairScope']['taxa']}
    assert len(targets)==13
    names={n.lower():s for s,n in targets.items()}
    bboxes=bounds(json.loads(local[paths[4]]))
    assert sha(local[paths[4]])==json.loads(local[paths[5]])['output']['sha256']
    source_paths={
      'fish':CACHE+'primary-reacquisition-1/nrsa-1819-fish-count-data.csv.gz',
      'sampling':CACHE+'primary-reacquisition-1/nrsa-1819-fish-sampling-information-data.csv.gz',
      'site':CACHE+'primary-reacquisition-1/NRSA_1819_SiteInfo.csv.gz',
      'taxon2013':CACHE+'nrsa1314_fishtaxa_02042019.csv.gz',
      'taxon2023':OLD+'nrsa2324_fishtaxa.csv.gz',
      'fishMetadata':CACHE+'primary-reacquisition-1/nrsa-1819-fish-count-metadata.txt.gz',
      'samplingMetadata':CACHE+'primary-reacquisition-1/nrsa-1819-fish-sampling-information-metadata.txt.gz',
      'siteMetadata':CACHE+'primary-reacquisition-1/NRSA18_19_Site_Information_Metadata.txt.gz',
      'taxon2013Metadata':CACHE+'nrsa1314_fishtaxa_meta_04292019.txt.gz',
      'taxon2023Metadata':OLD+'nrsa2324_fishtaxa_metadata.csv.gz'}
    tables={};profiles=[]
    for label,p in source_paths.items():
        b=gzip.decompress(files[p]);enc='cp1252' if label=='siteMetadata' else 'utf-8-sig'
        sep='\t' if label.endswith('Metadata') and label!='taxon2023Metadata' else ','
        rows,header=parse(b,enc,sep,label.endswith('Metadata'));tables[label]=rows
        profiles.append({'name':label,'path':p,'bytes':len(files[p]),'sha256':sha(files[p]),'decodedBytes':len(b),'decodedSha256':sha(b),'textEncoding':enc,'utf8BomPresent':b.startswith(b'\xef\xbb\xbf'),'delimiter':sep,'rowCount':len(rows),'columns':header,'retrieval':provenance[p]})
    assert [len(tables[n]) for n in ['fish','sampling','site','taxon2013','taxon2023']]==[22057,2221,2112,850,911]
    assert gzip.decompress(files[source_paths['site']]).startswith(b'\xef\xbb\xbf')
    try:gzip.decompress(files[source_paths['siteMetadata']]).decode('utf-8');raise AssertionError('Expected non-UTF8 metadata')
    except UnicodeDecodeError:pass
    fish,sampling,sites=[tables[n] for n in ['fish','sampling','site']]
    ids={y:index(tables['taxon'+y],lambda r:r['TAXA_ID']) for y in ['2013','2023']}
    common={y:index(tables['taxon'+y],lambda r:r['FINAL_NAME'].upper()) for y in ['2013','2023']}
    sx=index(sampling,key);vx=index(sites,key);vs=index(sites,lambda r:r['SITE_ID'])
    pair_rows={p:[] for p in pairs};scan=collections.Counter();complete=set();different=set()
    for fi,e in enumerate(fish):
        f=e['r'];k=key(f)
        if k:complete.add(k)
        si=sx.get(k,[]) if k else [];vi=vx.get(k,[]) if k else []
        if k and len(si)==len(vi)==1 and f['UID']!=sampling[si[0]]['r']['UID'] and f['UID']!=sites[vi[0]]['r']['UID']:different.add(k)
        species=set();tx={}
        for y in ['2013','2023']:
            q=sorted(set(ids[y].get(f['TAXA_ID'],[])+common[y].get(f['FINAL_NAME'].upper(),[])));tx[y]=q
            species.update(names[name(tables['taxon'+y][i]['r'])] for i in q if name(tables['taxon'+y][i]['r']) in names)
        if not species:scan['outsideLeasedTaxa']+=1;continue
        scan['leasedTaxonCandidates']+=1
        possible_sites=sorted(set(vi+vs.get(f['SITE_ID'],[])));ps=set()
        for i in possible_sites:
            v=sites[i]['r']
            for s in species:
                p=v['STATECTY'].lstrip('F')+':'+s
                if p in pair_rows:ps.add(p)
        if not ps:scan['outsideLeasedCountiesOrUnlocated']+=1;continue
        scan['retainedLeasedPairFishRows']+=1
        for p in sorted(ps):
            fips,species_id=p.split(':');reasons=[];caveats=[]
            r={'pairKey':p,'date':date(f['DATE_COL']),'total':int(f['TOTAL']) if re.fullmatch(r'\d+',f['TOTAL']) else None,'fish':e['w'],'sampling':None,'site':None,'taxon2023':None,'taxon2013':None,'candidateSiteRowIndices':possible_sites,'exactSamplingMatches':si,'exactSiteMatches':vi,'taxonomyCandidateRowIndices':tx}
            if not k or len(si)!=1 or len(vi)!=1:reasons.append('nonunique-or-incomplete-composite-visit')
            s=sampling[si[0]]['r'] if len(si)==1 else None
            v=sites[vi[0]]['r'] if len(vi)==1 else None
            if s:r['sampling']=sampling[si[0]]['w']
            if v:r['site']=sites[vi[0]]['w']
            if s and v:
                r['visitJoin']={'keyFields':['SITE_ID','normalized DATE_COL','VISIT_NO','STATE/PSTL_CODE'],'key':list(k),'fishUid':f['UID'],'samplingUid':s['UID'],'siteUid':v['UID'],'uidsRewritten':False,'samplingSiteUidAgreement':s['UID']==v['UID'],'uniqueSamplingMatch':True,'uniqueSiteMatch':True}
                if not s['UID'] or s['UID']!=v['UID']:reasons.append('sampling-site-uid-conflict')
                if s['SAMPLE_TYPE']!='FISH':reasons.append('not-fish-sampling')
                if s['ACTUAL_DATE'] and date(s['ACTUAL_DATE'])!=r['date']:reasons.append('actual-date-conflict')
                if any(f[x] and s[x] and f[x]!=s[x] for x in ['AG_ECO9','EPA_REG']):reasons.append('fish-sampling-context-conflict')
                if v['DSGN_CYCLE']!='2018-19' or v['EVAL_CAT']!='Target_Sampled' or v['YEAR']!=r['date'][:4]:reasons.append('site-cycle-year-or-sampling-conflict')
                if s['FISH_SAMPLING']:reasons.append('sampling-adverse-flag-'+s['FISH_SAMPLING'].lower())
                effort={x:s[x] for x in ['PRIM_GEAR','PRIM_FSHTIME','PRIM_LENGTH_FISHED','PRIM_SHKTIME','SEC_GEAR','SEC_FSHTIME','SEC_LENGTH_FISHED','SEC_SHKTIME'] if s[x]}
                effort_positive=any(re.fullmatch(r'\d+(\.\d+)?',q) and float(q)>0 for x,q in effort.items() if not x.endswith('GEAR'))
                r['samplingAssessment']={'sampledFish':s['SAMPLED_FISH'],'sufficiency':s['FISH_SAMPLING_SUFFICIENT'],'notConductedOrSuspended':s['FISH_SAMPLING'],'positiveRecordedEffort':effort_positive,'effort':effort,'sourceFlags':{x:q for x,q in s.items() if x.endswith('_FLAG') and q},'completeSurveyClaim':False}
                if s['SAMPLED_FISH']!='YES-SUFFICIENT' or s['FISH_SAMPLING_SUFFICIENT']!='Y':
                    caveats.append('Effort qualification retained: SAMPLED_FISH='+repr(s['SAMPLED_FISH'])+'; sufficiency='+repr(s['FISH_SAMPLING_SUFFICIENT'])+'. Positive count and positive recorded effort support capture only, not a complete survey.')
                    if not s['SAMPLED_FISH'].startswith('YES') and not effort_positive:reasons.append('sampling-qualification-without-positive-effort')
                if r['samplingAssessment']['sourceFlags']:caveats.append('Original protocol/gear comment flags are retained. Comment text is absent from these tables. Flags alone do not negate a distinct positive count; precise gear execution is not inferred.')
                c=counties.get(fips)
                if not c or c['status']!='active' or v['STATECTY']!='F'+fips or c['stateCode']!=v['PSTL_CODE'] or c['stateCode']!=f['STATE'] or c['stateName']!=v['STATE_NM'] or not any(norm(n)==norm(v['CNTYNAME']) for n in [c['shortName'],c['legalName']]+c['aliases']):reasons.append('publisher-county-identity-conflict')
                bb=bboxes[fips];lon,lat=float(v['LON_DD83']),float(v['LAT_DD83']);gap=max(bb[0]-lon,lon-bb[2],bb[1]-lat,lat-bb[3],0)
                r['geographyAssessment']={'publisherFips':v['STATECTY'],'publisherCounty':v['CNTYNAME'],'publisherState':v['PSTL_CODE'],'registryCounty':{x:c[x] for x in ['countyFips','shortName','stateCode','status']} if c else None,'boundaryFlag':v['BORD_RIV'],'riverName':v['GNIS_NAME'],'framePoint':[lon,lat],'declaredCountyBoundingBox':bb,'degreesOutsideBoundingBox':round(gap,6),'coordinateUse':'Gross contradiction diagnostic only. No coordinate-derived county assignment or substitute county.'}
                if gap>0.1:
                    reasons.append('material-frame-versus-declared-county-conflict')
                    caveats.append('The design point is grossly outside the declared county bounding box, and the named boundary river conflicts with that county. No bank or replacement county is assigned. The original publisher must resolve this county identity; passing FIPS/name text equality alone is insufficient.')
                if v['BORD_RIV']!='Not_Border':caveats.append('Boundary river flagged. Explicit publisher FIPS/name/state remain the positive geographic evidence. Frame coordinates are diagnostics only; bank-level position, ownership and countywide extent are not inferred.')
            for y in ['2013','2023']:
                m=ids[y].get(f['TAXA_ID'],[])
                if len(m)==1:
                    t=tables['taxon'+y][m[0]];r['taxon'+y]=t['w']
                    if t['r']['FINAL_NAME'].upper()!=f['FINAL_NAME'].upper() or name(t['r'])!=targets[species_id].lower():reasons.append('source-taxon-'+y+'-identity-conflict')
                elif m:reasons.append('ambiguous-taxon-id-'+y)
                elif y=='2023':reasons.append('missing-current-taxon-reference')
            if r['taxon2013'] is None:
                if species_id=='tilapia-mariae' and f['FINAL_NAME']=='SPOTTED TILAPIA' and f['TAXA_ID']=='5183' and r['taxon2023']:
                    caveats.append('2013 reference has no TAXA_ID 5183. The 2023 official row matches source ID and common name, while the contemporaneous 2018 field manual Appendix D PDF page 78 lists Tilapia mariae as spotted tilapia. This explicit newer-reference-only crosswalk is proposed; global numeric ID stability is not assumed.')
                else:reasons.append('older-taxon-reference-absent-unresolved')
            r['taxonomyReasoning']='Require exact source TAXA_ID plus FINAL_NAME in each available official reference, and exact genus/species against pinned catalog. Also scan exact common names for alternative/conflicting IDs. No fuzzy, hybrid, genus-only or rank-collapse inference.'
            if r['taxon2013'] and r['taxon2023']:
                a,b=r['taxon2013']['sourceFields'],r['taxon2023']['sourceFields']
                if a.get('ITISTSN') and b.get('ITISTSN') and a['ITISTSN']!=b['ITISTSN']:reasons.append('cross-cycle-itis-conflict')
            if species_id=='clarias-batrachus':
                reasons.append('introduced-us-walking-catfish-species-concept-unresolved')
                caveats.append('USGS NAS reports that the identity of US introductions is in doubt after Clarias batrachus was restricted to Java. EPA reference strings agree, but no revised identification or voucher resolves this Florida record to the exact catalog species concept. Retain source label and hold; do not silently rename.')
            if species_id.startswith('pterygoplichthys-'):caveats.append('USGS documents historical sailfin catfish misidentifications. Both official reference cycles here retain the exact species and ID without hybrid qualifiers. Support is for the original reported identification, not independent specimen re-identification.')
            if f['IS_DISTINCT']!='1':reasons.append('non-distinct-taxon')
            if r['total'] is None or r['total']<=0:reasons.append('nonpositive-or-invalid-total')
            if f['ANOM_CT'] and not re.fullmatch(r'\d+',f['ANOM_CT']):reasons.append('invalid-anomaly-count')
            # Anomalies are not necessarily unique fish. No ANOM_CT <= TOTAL rule.
            if not r['date'] or r['date'][:4] not in ['2018','2019']:reasons.append('field-date-outside-cycle')
            r['disposition']='hold' if reasons else 'supported-original-positive'
            r['holdReasons']=sorted(set(reasons));r['caveats']=caveats;pair_rows[p].append(r)
    assert all(pair_rows.values())
    all_rows=[r for p in pairs for r in pair_rows[p]]
    def rank(r):
        s=r['sampling']['sourceFields'];v=r['site']['sourceFields']
        return s.get('SAMPLED_FISH')=='YES-SUFFICIENT',s.get('FISH_SAMPLING_SUFFICIENT')=='Y',not r['samplingAssessment']['sourceFlags'],v.get('BORD_RIV')=='Not_Border',r['taxon2013'] is not None,r['date'],r['total'],-r['fish']['parsedRowIndexZeroBased']
    witnesses=[];held=[];assessments=[]
    for p in pairs:
        rows=pair_rows[p];good=[r for r in rows if r['disposition']=='supported-original-positive'];primary=max(good,key=rank) if good else None
        if primary:witnesses.append({k:primary[k] for k in ['pairKey','date','total','fish','sampling','site','taxon2023','taxon2013']})
        else:held.append(p)
        assessments.append({'pairKey':p,'status':'supported-pending-main-method' if primary else 'held','consideredFishRowCount':len(rows),'supportedFishRowCount':len(good),'heldFishRowCount':len(rows)-len(good),'selectedFishRowIndex':primary['fish']['parsedRowIndexZeroBased'] if primary else None,'heldReasons':sorted(set(q for r in rows for q in r['holdReasons'])),'rows':rows})
    supported=sorted(w['pairKey'] for w in witnesses);assert sorted(supported+held)==pairs and not set(supported)&set(held)
    relevant={'TOTAL','ANOM_CT','IS_DISTINCT','FINAL_NAME','TAXA_ID','UID','SITE_ID','DATE_COL','VISIT_NO','STATE','STATECTY','CNTYNAME','BORD_RIV','PSTL_CODE','LAT_DD83','LON_DD83','FISH_SAMPLING','FISH_SAMPLING_SUFFICIENT','SAMPLED_FISH','EVAL_CAT'}
    metadata={n:[e['w'] for e in tables[n] if e['r'].get('PARAMETER',e['r'].get('COLUMN_NAME')) in relevant] for n in tables if n.endswith('Metadata')}
    return {
      'schemaVersion':1,'kind':'independent-epa-nrsa-1819-source-method-proposal','status':'proposal-ready-main-method-required',
      'actorId':ACTOR,'recordedAt':stamp,'baseSha':BASE,'jobId':JOB,'leaseId':lease['leaseId'],'branch':lease['branch'],
      'leaseSnapshot':lease,'executionContract':contract,
      'authorityQualification':'The lease omits optional executionContract. MAIN identified a-job.json; its contract was read and checked against lease pairs and path allowlist. Lease completionCriteria and job contract authorize proposal-only outputs. No completed-run manifest is appropriate.',
      'inputArchive':{'path':ARCHIVE,'bytes':len(outer),'sha256':sha(outer)},
      'recipe':{'path':'src/data/research/worker-results/'+JOB+'/review.py','sha256':sha(pathlib.Path(__file__).read_bytes())},
      'pinnedContext':context,'sourceId':'epa-nrsa-fish-counts','taxa':targets,
      'sourceQualification':{'publisher':'U.S. Environmental Protection Agency','sourceIndexUrl':'https://www.epa.gov/national-aquatic-resource-surveys/data-national-aquatic-resource-surveys','supportedEvidence':'Historical distinct species-specific positive fish counts at sampled locations under a separately reviewed method.','terms':'Official public EPA download bodies are retained unchanged; no individual copyright license is asserted. Attribute EPA. Web context is limited to citations and short review notes.','freshness':'Observations date to 2018/2019; fish and sampling publication is 2022, site publication is 2022 with source upload in 2023. Fresh 2026 retrieval does not make observations current.','negativeSemantics':'none','stableIdentity':'Survey cycle, original table-specific UID, complete SITE_ID/date/VISIT_NO/state composite, TAXA_ID and raw row locator. Fish UID is never overwritten.'},
      'leasedPairs':pairs,'supportedPairs':supported,'heldPairs':held,'witnesses':witnesses,'pairAssessments':assessments,
      'profiles':profiles,'sourceMetadataWitnesses':metadata,
      'byteVerification':{'outerVerified':True,'allEmbeddedFilesVerified':embedded,'primaryOriginalFreshParity':parity,'siteBomHandledForHeaderOnly':True,'siteMetadataCp1252DecodeRequired':True,'sourceBodiesRewritten':0},
      'acquisitionReceiptSha256':sha(files[CACHE+'primary-reacquisition-1/retrieval-receipt.json']),
      'receiptLineageQualification':{'freshPrimaryReceiptPath':CACHE+'primary-reacquisition-1/retrieval-receipt.json','acquisitionRepositoryCommit':fresh['repositoryBaseCommit'],'originalPrimaryRequestMetadataUnavailable':True,'overwrittenPrimaryReceiptNotUsedAsPrimaryProvenance':True,'recovery':j(CACHE+'receipt-collision-recovery.json'),'supplementalQualification':j(CACHE+'taxonomy-acquisition-lineage-qualification.json'),'workerReacquiredSourceBytes':False},
      'requestAccounting':{'workerProviderGets':0,'workerSourceReacquisitions':0,'workerPrimaryContextWebOperations':8,'workerProviderWrites':0,'workerAutomaticRetries':0,
        'frozen2018Campaign':{'originalPrimaryGets':6,'freshPrimaryGets':6,'taxonomy2013Gets':2,'successfulProgrammaticGets':14,'webMetadataOperations':3,'webMetadataDecodeFailures':1,'providerWrites':0,'qualification':'Original six bodies survive but original request metadata was overwritten. No original timestamps or headers are reconstructed.'},
        'reusedPrior2023Campaign':{'newWorkerRequests':0,'originalPriorCampaignGets':6,'taxonomyBodiesUsed':2},
        'operations':[
          {'operation':'search','query':'site.nas.er.usgs.gov Clarias batrachus species profile taxonomy'},
          {'operation':'search','query':'site.nas.er.usgs.gov Pterygoplichthys disjunctivus multiradiatus hybrid Florida'},
          {'operation':'search','query':'site.epa.gov nrsa 2018 2019 fish taxonomy spotted tilapia 5183'},
          {'operation':'open','url':'https://19january2021snapshot.epa.gov/sites/static/files/2018-10/documents/nrsa1819_fom_appendix_version_1.1_april_2018.pdf'},
          {'operation':'open','url':'https://nas.er.usgs.gov/Queries/FactSheet.aspx?SpeciesID=486'},
          {'operation':'open','url':'https://www.epa.gov/system/files/documents/2024-12/nrsa-2018-19-tsd-final-11252024.pdf'},
          {'operation':'find','document':'2018 field manual appendix','pattern':'mariae'},
          {'operation':'find','document':'2018-19 technical support document','pattern':'EVALUATION OF FISH IDENTIFICATIONS'}]},
      'externalContext':[
        {'url':'https://nas.er.usgs.gov/Queries/FactSheet.aspx?SpeciesID=486','publisher':'USGS NAS','accessedDate':'2026-09-08','section':'Identification','quote':'The identity of the fish introduced into the USA is in doubt','reviewFinding':'The profile explains that Ng and Kottelat (2008) restricted Clarias batrachus to Java. Original EPA labels do not resolve the introduced-US species concept. This is an identity hold, not absence.'},
        {'url':'https://19january2021snapshot.epa.gov/sites/static/files/2018-10/documents/nrsa1819_fom_appendix_version_1.1_april_2018.pdf','publisher':'EPA','accessedDate':'2026-09-08','section':'Appendix D, PDF page 78','quote':'Tilapia mariae spotted tilapia','reviewFinding':'Contemporaneous field naming corroborates the original common name plus exact 2023 TAXA_ID 5183/genus/species. This supplements the absent 2013 row; numeric IDs are not assumed universal.'},
        {'url':'https://nas.er.usgs.gov/queries/factsheet.aspx?speciesid=767','publisher':'USGS NAS','accessedDate':'2026-09-08','section':'Remarks','reviewFinding':'Historical Florida sailfin catfish identifications included confusion between disjunctivus and multiradiatus. The cited profile supplies no revised identity for these 2018/2019 specimens. Retain both source names and restrict support to original reported identification.'},
        {'url':'https://www.epa.gov/system/files/documents/2024-12/nrsa-2018-19-tsd-final-11252024.pdf','publisher':'EPA','accessedDate':'2026-09-08','section':'2.3.6 Evaluation of Fish Identifications, PDF page 16','reviewFinding':'EPA describes shared taxonomic references and voucher-based checking. This program context does not establish that a particular leased row was individually voucher-validated.'}],
      'independentScan':{'fishRowsRead':len(fish),'samplingRowsRead':len(sampling),'siteRowsRead':len(sites),'taxonomy2013RowsRead':len(tables['taxon2013']),'taxonomy2023RowsRead':len(tables['taxon2023']),'fullFishScanCounts':dict(sorted(scan.items())),'fullFishScanCountSemantics':'outsideLeasedTaxa + outsideLeasedCountiesOrUnlocated + retainedLeasedPairFishRows = fishRowsRead; leasedTaxonCandidates is the subtotal of the latter two.','completeFishVisitKeys':len(complete),'completeKeysWithUniqueSamplingAndSite':sum(len(sx.get(k,[]))==len(vx.get(k,[]))==1 for k in complete),'fishUidDifferentFromBothOtherTablesKeys':len(different),'samplingRowsWithIncompleteJoinKey':sum(key(e['r']) is None for e in sampling),'candidateDiagnosticUsedForAcceptance':False,'candidateRecipeExecuted':False},
      'selectionRule':'Inspect all rows matching a source ID or exact common name, including all SITE_ID county associations before unique complete visit joining. Among supported rows prefer YES-SUFFICIENT, then sufficiency Y, no comment flags, non-boundary, dual-cycle taxonomy, latest date, largest total and lowest row index. All alternate holds are retained.',
      'locatorConvention':'Zero-based parsed data-row index excludes header and blank lines. One-based physical start/end lines and zero-based raw offset locate original bytes. Raw hashes include original CSV CRLF terminators. Header BOM is omitted only from parsing, not raw bytes. sourceFields contains all original nonempty fields; omitted values are exactly empty strings. Metadata raw hashes preserve original physical terminators and encoding.',
      'methodRequirementsForMain':[
        'Register a distinct 2018-19 method with ten source profiles and a separate sampling table. Do not reuse 2023 STUDY or size-bin predicates absent here.',
        'Keep original acquisition code 22be801ad3a2ac1fae425896282012947422cfbb and fresh primary receipt. Worker base records interpretation lineage.',
        'Preserve original fish, sampling and site UIDs; require a complete unique composite visit and sampling-site UID equality.',
        'TOTAL counts individuals. ANOM_CT counts anomalies and the metadata does not constrain it to be less than or equal to TOTAL.',
        'Keep row-specific sampling, county and taxon-concept holds. Partial effort can support a positive capture when original positive count and actual effort agree.',
        'Retain the explicit newer-reference-only taxon rationale. MAIN should retain supplementary context bodies needed for its canonical method contract.',
        'Create canonical immutable runs only after MAIN registration and review. This proposal is not accepted evidence, completed source research or net determination progress.'],
      'caveats':['Historical sampled-location support only: no persistence, establishment, abundance, countywide prevalence or negative claim.',
        'County fields originate in the sampling frame. Census topology is used solely for gross contradiction diagnostics, never to create affirmative county routing or a replacement county.',
        'Eight bounded web context operations; no bulk acquisition, package installation or provider writes.',
        'Frozen completed-run profile requires one state and canonical immutable outputs. This multistate method proposal intentionally creates no manifest or evidence events.'],
      'counts':{'leasedPairs':len(pairs),'reviewedPairs':len(assessments),'supportedPairs':len(supported),'heldPairs':len(held),'consideredFishRows':len(all_rows),'distinctConsideredFishRows':len({r['fish']['parsedRowIndexZeroBased'] for r in all_rows}),'supportedFishRows':sum(r['disposition']=='supported-original-positive' for r in all_rows),'heldFishRows':sum(r['disposition']=='hold' for r in all_rows),'acceptedDeterminations':0,'assertionEvents':0,'reviewEvents':0,'rejectionEvents':0,'outcomeEvents':0,'completedCanonicalRuns':0,'netCountySpeciesDeterminations':0},
      'verification':{'frozenPreflight':{'ok':True,'head':BASE,'errors':[],'command':'C:/Code/tools/node-v22.23.2-win-x64/node.exe .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease C:/Code/project-isitusa/.cache/research/campaigns/20260908-r20-epa-nrsa-1819/a-lease.json --repo C:/Code/project-isitusa-worktrees/epa-nrsa-1819-source-review-a-20260908-r20'},'reproduceCommand':'python src/data/research/worker-results/'+JOB+'/review.py --verify','sourceRowsIndependentlyParsedWith':'Python standard-library csv.reader','scopeAccountingExact':True,'sharedFilesChanged':False,'canonicalValidationNotApplicable':'Proposal-only shared method review; no false completed manifest.'}
    }
def main():
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True);group.add_argument('--write',action='store_true');group.add_argument('--verify',action='store_true');args=parser.parse_args()
    assert (ROOT/'.git').exists(),ROOT
    if args.write:assert ROOT.name==JOB,ROOT
    output=OUT/'proposal.json'
    if args.verify:
        expected=json.loads(output.read_bytes());lease=expected['leaseSnapshot'];contract=expected['executionContract'];stamp=expected['recordedAt']
    else:
        lease=json.loads(LEASE_PATH.read_bytes());contract=json.loads(LEASE_PATH.with_name('a-job.json').read_bytes())['executionContract'];stamp=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    result=review(lease,contract,stamp);b=serialize(result)
    if args.verify:assert output.read_bytes()==b,'Proposal differs from deterministic reconstruction.'
    else:
        assert not output.exists(),'Refuse to overwrite existing proposal.'
        output.write_bytes(b)
    print(json.dumps({'status':result['status'],'verification':'reproduced-byte-identical' if args.verify else 'written','counts':result['counts'],'heldPairs':result['heldPairs'],'proposalBytes':len(b),'proposalSha256':sha(b),'recipeSha256':sha(pathlib.Path(__file__).read_bytes())},indent=2))
if __name__=='__main__':main()
