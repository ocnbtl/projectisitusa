"""California retained-source review using a disclosed pinned source-decoding scaffold. Standard library only; no MAIN adapter imports.
Run from the leased worktree: python <this-file> --verify
Without --verify, writes only sibling proposal.json. Verification never writes.
"""
import argparse
import base64
from collections import Counter, defaultdict
import ctypes
from datetime import date
import gzip
import hashlib
import html
import json
from pathlib import Path
import re
import time

JOB = 'ebird-monk-ca-original-review-20260909-r25'
ACTOR = 'ebird_monk_ca_review_r25'
BASE = 'a376652295797ad9957eaadda4f9e5bd3c73c880'
ACQUISITION_BASE = '0a451f65a2c46fde2102ceeb1c7eee3017aafb0f'
DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
PUBLISHER = 'e2e717bf-551a-4917-bdc9-4fa0f342c530'
SPECIES = 'myiopsitta-monachus'
NAME = 'Myiopsitta monachus'
DWC = 'http://rs.tdwg.org/dwc/terms/'
GBIF = 'http://rs.gbif.org/terms/1.0/'
DC = 'http://purl.org/dc/terms/'
LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode'
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).with_name('proposal.json')
SELECTED = [5345138559, 5365708130, 5384946390, 5673117396]
PAIRS = ['06025:' + SPECIES, '06073:' + SPECIES]
PINS = {
 'ebird-monk-selected-originals-20260909-r23': ('84901b5b0d06c9296d3bd580d8d75924f996e48bf72ee87a6864e5bf0bc4afdd', 11357),
 'ebird-monk-partial-public-slice-20260909-r22': ('45b5765860b9a940942530cc577717d1a240bab5d7cee976d46b03a50b945566', 6062),
 'ebird-eod-public-metadata-20260909-r19': ('9bf3278aa98bce0e16838a8d33267ae6eeac694b3030f11c03daebae723a84f6', 13821),
 'ebird-eod-original-field-pilot-20260909-r19': ('fb25f58776a543a24166431c0f8acde68cfc56b0f83514f4c979ae6db30c9f5d', 4673),
}

def sha(b):
    return hashlib.sha256(b).hexdigest()

def descriptor(p, b):
    return {'path': p, 'bytes': len(b), 'sha256': sha(b)}

def decoded(b):
    return gzip.decompress(b) if b[:2] == b'\x1f\x8b' else b

def require(ok, message):
    if not ok:
        raise ValueError(message)

def peak_mib():
    class Counters(ctypes.Structure):
        _fields_ = [('cb', ctypes.c_ulong), ('PageFaultCount', ctypes.c_ulong)] + [(n, ctypes.c_size_t) for n in ['PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage']]
    v = Counters(); v.cb = ctypes.sizeof(v)
    kernel = ctypes.WinDLL('kernel32'); kernel.GetCurrentProcess.restype = ctypes.c_void_p
    psapi = ctypes.WinDLL('psapi'); psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
    require(psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(v), v.cb), 'memory measurement failed')
    return round(v.PeakWorkingSetSize / 1048576, 3)

def byte_fields(raw, original):
    result = []
    for key in sorted(original):
        if not key.startswith('http'):
            continue
        pattern = re.escape(json.dumps(key).encode()) + rb'\s*:\s*("(?:[^"\\]|\\.)*"|[^,}\s]+)'
        m = re.search(pattern, raw)
        require(m is not None, 'missing byte witness ' + key)
        require(json.loads(m.group(1)) == original[key], 'byte witness value ' + key)
        result.append({'field': key, 'value': original[key], 'byteOffset': m.start(1), 'byteLength': len(m.group(1)), 'valueLexemeBase64': base64.b64encode(m.group(1)).decode()})
    return result

def review():
    scaffold_path = 'src/data/research/worker-results/ebird-monk-la-original-review-20260909-r24/review.py'
    scaffold_bytes = (ROOT / scaffold_path).read_bytes()
    require(len(scaffold_bytes) == 28724 and sha(scaffold_bytes) == 'fdbc87de145605230a8bca1938eaa4097fc9f54935ddf5222b2f2e70c65d1a01', 'reused scaffold pin')
    blobs = {}; inventory = []; inputs = []; docs = []; evaluations = {}
    for name, (expected_hash, expected_bytes) in PINS.items():
        ep = 'ops/national-research/evaluations/' + name + '.json'
        eb = (ROOT / ep).read_bytes()
        require(sha(eb) == expected_hash and len(eb) == expected_bytes, 'evaluation pin ' + ep)
        ev = json.loads(eb); evaluations[name] = ev; docs.append((ep, ev)); inputs.append(descriptor(ep, eb))
        ad = ev['artifact']; ab = (ROOT / ad['path']).read_bytes()
        require(sha(ab) == ad['sha256'] and len(ab) == ad['bytes'], 'outer archive ' + ad['path'])
        inputs.append(descriptor(ad['path'], ab)); archive = json.loads(gzip.decompress(ab))
        if 'files' in ad:
            require(len(archive['files']) == ad['files'], 'archive member count')
        for i, f in enumerate(archive['files']):
            p = f['originalPath']; require(f['encoding'] == 'base64', 'encoding')
            b = base64.b64decode(f['contents'], validate=True)
            require(len(b) == f['bytes'] and sha(b) == f['sha256'], 'embedded bytes ' + p)
            require(p not in blobs or blobs[p] == b, 'duplicate path changed ' + p)
            blobs[p] = b; db = decoded(b)
            inventory.append(dict(descriptor(p, b), archive=ad['path'], memberIndex=i, decodedBytes=len(db), decodedSha256=sha(db)))
            if p.endswith('/receipt.json'):
                docs.append((p, json.loads(db)))
        del archive, ab
    lookup = {d['path']: d for d in inventory}
    for item in inputs:
        lookup[item['path']] = item
    checked_refs = []
    def walk(obj, owner, location='$'):
        if isinstance(obj, dict):
            if 'path' in obj and 'sha256' in obj and obj['path'] in lookup:
                d = lookup[obj['path']]
                for field in ['sha256', 'bytes', 'decodedSha256', 'decodedBytes']:
                    if field in obj:
                        require(obj[field] == d.get(field), 'descriptor mismatch ' + owner + location + '/' + field)
                checked_refs.append({'owner': owner, 'locator': location, 'path': obj['path']})
            for k, v in obj.items():
                walk(v, owner, location + '/' + str(k))
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, owner, location + '/' + str(i))
    for owner, doc in docs:
        walk(doc, owner)
    regpath = 'src/data/research/county-equivalent-registry.json'
    regbytes = (ROOT / regpath).read_bytes(); registry = json.loads(regbytes)
    inputs.append(descriptor(regpath, regbytes))
    counties = [c for c in registry['countyEquivalents'] if c['countyFips'] in [p[:5] for p in PAIRS]]
    require(len(counties) == 2 and all(c['status'] == 'active' and c['stateName'] == 'California' and c['stateCode'] == 'CA' for c in counties), 'active CA registry')
    def pair_for(state, county):
        hits = [c for c in counties if state == c['stateName'] and county in [c['shortName'], c['legalName']] + c['aliases']]
        return hits[0]['countyFips'] + ':' + SPECIES if len(hits) == 1 else None
    sourcepath = 'src/data/research/source-registry.json'; sourcebytes = (ROOT / sourcepath).read_bytes()
    source = next(s for s in json.loads(sourcebytes)['sources'] if s['id'] == 'gbif-ebird'); inputs.append(descriptor(sourcepath, sourcebytes))
    require(source['negativeSemantics'] == 'none', 'source negative semantics')
    def by_suffix(s):
        hits = [p for p in blobs if p.endswith(s)]; require(len(hits) == 1, 'unique suffix ' + s)
        return hits[0], decoded(blobs[hits[0]])
    metadata_path, mb = by_suffix('/taxonomy-discovery-20260909/dataset.json.gz'); metadata = json.loads(mb)
    taxpath, tb = by_suffix('/taxonomy-discovery-20260909/myiopsitta-monachus.json.gz'); taxonomy = json.loads(tb)
    require(metadata['key'] == DATASET and metadata['publishingOrganizationKey'] == PUBLISHER and metadata['license'] == LICENSE, 'dataset identity/license')
    require(taxonomy['usageKey'] == 2479407 and taxonomy['canonicalName'] == NAME and taxonomy['status'] == 'ACCEPTED' and taxonomy['matchType'] == 'EXACT', 'retained taxonomy match')
    receipt_path, rb = by_suffix('/monk-selected-originals-20260909-r23/receipt.json'); receipt = json.loads(rb)
    require(receipt['repositoryBaseCommit'] == ACQUISITION_BASE and receipt['completed'] and receipt['errors'] == [] and receipt['automaticRetries'] == 0, 'acquisition lineage')
    responses = {x['key']: x for x in receipt['responses']}; selection = {x['key']: x for x in receipt['selection'] if x['pair'] in PAIRS}
    require(sorted(selection) == SELECTED, 'selected key inventory')
    require(len(responses) == 141 and all(x['status'] == 200 for x in responses.values()), 'original acquisition completeness')
    pages = []
    for owner, doc in docs:
        if doc.get('kind') in ['bounded-ebird-public-source-inspection', 'bounded-ebird-public-source-inspection-resume']:
            require(doc['paginationComplete'] is False, 'parent must remain incomplete')
            pages += doc['responses']
    pages.sort(key=lambda p: p['page']); require([p['page'] for p in pages] == list(range(50)), '50 contiguous source pages')
    material = []; selected_rows = {}; keys = set(); ids = set(); pair_rows = defaultdict(list)
    secondary_conflicts = []; context_rows = []; raw_gadm_variations = []
    distributions = defaultdict(Counter)
    context_pattern = re.compile(r'\b(home|house|haus|zoo|private|airbnb|captive|captivity|caged|aviary|pet|escape[de]?|feral|turf)\b', re.I)
    semantic_fields = ['locality', 'occurrenceRemarks', 'eventRemarks', 'habitat', 'establishmentMeans', 'degreeOfEstablishment', 'pathway']
    for page in pages:
        raw = decoded(blobs[page['path']]); data = json.loads(raw)
        require(page['status'] == 200 and data['offset'] == page['page'] * 300 and data['limit'] == 300 and data['count'] == 21878 and data['endOfRecords'] is False and len(data['results']) == 300, 'page identity/count')
        for ix, r in enumerate(data['results']):
            require(r['key'] not in keys and r['occurrenceID'] not in ids, 'duplicate global source identity')
            keys.add(r['key']); ids.add(r['occurrenceID'])
            pair = pair_for(r.get('stateProvince'), r.get('county'))
            if pair is None:
                continue
            contradictions = []
            checks = {
              'sourceIdentity': r.get('datasetKey') == DATASET and r.get('publishingOrgKey') == PUBLISHER and r.get('institutionCode') == 'CLO' and r.get('collectionCode') == 'EBIRD',
              'exactAcceptedTaxon': all(r.get(k) == 2479407 for k in ['taxonKey', 'speciesKey', 'acceptedTaxonKey']) and r.get('species') == NAME and r.get('taxonomicStatus') == 'ACCEPTED' and r.get('taxonRank') == 'SPECIES',
              'positiveHumanObservation': r.get('basisOfRecord') == 'HUMAN_OBSERVATION' and r.get('occurrenceStatus') == 'PRESENT' and (r.get('individualCount') is None or (isinstance(r.get('individualCount'), int) and r['individualCount'] > 0)),
              'stableIdentity': str(r['key']) == r.get('gbifID') and r.get('identifier') == r.get('catalogNumber') and r.get('occurrenceID') == 'URN:catalog:CLO:EBIRD:' + r.get('catalogNumber', '') and bool(re.fullmatch(r'OBS\d+', r.get('catalogNumber', ''))),
              'license': r.get('license') == LICENSE,
              'validCalendarDate': r.get('eventDate') == date(r['year'], r['month'], r['day']).isoformat() and r['year'] == 2024,
              'acceptedClassifications': all(c.get('taxonomicStatus') == 'ACCEPTED' and c.get('acceptedUsage', {}).get('genericName') == 'Myiopsitta' and c.get('acceptedUsage', {}).get('specificEpithet') == 'monachus' for c in r.get('classifications', {}).values()) and bool(r.get('classifications')),
            }
            contradictions += [name for name, passed in checks.items() if not passed]
            locator = {'responsePath': page['path'], 'responseSha256': page['sha256'], 'decodedSha256': page['decodedSha256'], 'rowIndex': ix, 'jsonPointer': '/results/' + str(ix), 'sourceUrl': 'https://www.gbif.org/occurrence/' + str(r['key']), 'requestUrl': page['url'], 'retrievedAt': page['retrievedAt']}
            gd = r.get('gadm', {}); secondary = gd.get('level2', {}).get('name')
            if secondary != r.get('county'):
                contradictions.append('secondary-gadm-county-disagreement')
                secondary_conflicts.append({'key': r['key'], 'pairKey': pair, 'publisherCounty': r['county'], 'secondaryGadm': gd, 'locator': locator, 'disposition': 'held-interpreted-only-original-not-acquired'})
            if gd.get('level1', {}).get('name') not in [None, 'California']:
                contradictions.append('secondary-gadm-state-disagreement')
            context = {k: r[k] for k in semantic_fields if r.get(k) not in [None, '']}
            hits = sorted(set(m.group(0).lower() for v in context.values() for m in context_pattern.finditer(str(v))))
            specific = {k: v for k, v in context.items() if re.search(r'\b(captive|captivity|caged|aviary|pet)\b', str(v), re.I)}
            if specific:
                contradictions.append('specific-captivity-text-requires-review')
            entry = {'key': r['key'], 'pairKey': pair, 'occurrenceId': r['occurrenceID'], 'eventDate': r['eventDate'], 'count': r.get('individualCount'), 'locator': locator, 'checks': checks, 'issues': r.get('issues', []), 'contextFields': context, 'contextTerms': hits, 'publisherCounty': r.get('county'), 'publisherState': r.get('stateProvince'), 'scientificName': r.get('scientificName'), 'acceptedSpecies': r.get('species'), 'acceptedTaxonKey': r.get('acceptedTaxonKey'), 'classificationKeys': sorted(r.get('classifications', {})), 'secondaryGadm': gd, 'contradictions': contradictions, 'originalAcquiredInLeasedScope': r['key'] in SELECTED, 'disposition': 'selected-original-reviewed-below' if r['key'] in SELECTED else ('held-interpreted-only-original-not-acquired' if contradictions else 'interpreted-only-original-not-acquired')}
            material.append(entry); pair_rows[pair].append(entry)
            if hits:
                context_rows.append({'key': r['key'], 'terms': hits, 'specificCaptivityText': specific, 'interpretation': 'specific context requires review' if specific else 'locality alone does not establish captivity'})
            for k in ['license', 'basisOfRecord', 'occurrenceStatus', 'taxonomicStatus', 'individualCount', 'coordinateUncertaintyInMeters', 'establishmentMeans', 'occurrenceRemarks', 'http://unknown.org/status', 'http://unknown.org/crawl_attempt', 'http://unknown.org/omitFromScheduledCrawl']:
                distributions[k][json.dumps(r.get(k), ensure_ascii=True, sort_keys=True)] += 1
            for issue in r.get('issues', []):
                distributions['issues'][issue] += 1
            if r['key'] in SELECTED:
                selected_rows[r['key']] = (r, entry)
        del data, raw
    require(len(keys) == 15000 and len(material) == 55 and sorted(selected_rows) == SELECTED, 'source/material inventory')
    original_reviews = []; adapter_pairs = []
    for key in SELECTED:
        r, entry = selected_rows[key]; s = selection[key]; response = responses[key]
        require(s['responsePath'] == entry['locator']['responsePath'] and s['responseSha256'] == entry['locator']['responseSha256'] and s['rowIndex'] == entry['locator']['rowIndex'], 'selection interpreted locator')
        raw = decoded(blobs[response['path']]); original = json.loads(raw); reasons = list(entry['contradictions'])
        require(original['key'] == key and original['datasetKey'] == DATASET, 'original response identity')
        f = lambda k: original.get(DWC + k)
        original_pair = pair_for(f('stateProvince'), f('county'))
        checks = {'exactOriginalGeography': original_pair == s['pair'] == entry['pairKey'], 'exactOriginalTaxon': f('scientificName') == NAME and f('genus') == 'Myiopsitta' and f('specificEpithet') == 'monachus', 'positiveOriginalObservation': f('basisOfRecord') == 'HumanObservation' and f('occurrenceStatus') == 'PRESENT' and int(f('individualCount')) > 0, 'originalDate': date(int(f('year')), int(f('month')), int(f('day'))).isoformat() == r['eventDate'], 'originalStableIdentity': original.get(GBIF + 'gbifID') == str(key) and f('occurrenceID') == r['occurrenceID'] and original.get(DC + 'identifier') == r['identifier'], 'originalPublisher': original.get('publishingOrgKey') == PUBLISHER and f('institutionCode') == 'CLO' and f('collectionCode') == 'EBIRD' and f('country') == 'United States', 'sourceLevelLicenseSupported': metadata['license'] == r['license'] == LICENSE}
        for field in ['county', 'stateProvince', 'scientificName', 'locality', 'catalogNumber', 'occurrenceID', 'recordedBy', 'taxonConceptID', 'geodeticDatum']:
            expected = NAME if field == 'scientificName' else r.get(field)
            checks['originalInterpreted/' + field] = f(field) == expected
        for field in ['decimalLatitude', 'decimalLongitude', 'individualCount', 'year', 'month', 'day']:
            checks['originalInterpreted/' + field] = float(f(field)) == float(r[field])
        for field in ['http://unknown.org/status', 'http://unknown.org/crawl_attempt', 'http://unknown.org/omitFromScheduledCrawl']:
            checks['originalInterpreted/' + field] = original.get(field) == r.get(field)
        reasons += [n for n, ok in checks.items() if not ok]
        context_note = {
          5345138559: 'El Cajon Courthouse Parrot Roost is a locality label, without explicit captive, cage or exhibit text. Original county San Diego, California agrees with interpreted fields and secondary GADM. One bird reported on 2024-09-27; next-day record may repeat the same individual, so do not sum birds or infer independent encounters.',
          5384946390: 'El Cajon Courthouse Parrot Roost is a locality label, without explicit captive, cage or exhibit text. One bird on 2024-09-28 at the same coordinates as the other selected San Diego original may be the same individual. Original county/state and accepted species match.',
          5365708130: 'Rockwood Park contains no specific captivity assertion. Original four birds on 2024-05-31, exact Imperial county and California state. This key wins the ascending-key tie among three retained May 31 records; distinct records do not establish independent bird groups.',
          5673117396: 'Rockwood Park contains no specific captivity assertion. Original 55 birds on 2024-08-27 is the latest retained Imperial record. Count is historical source-reported observation, not independent proof of countywide abundance or establishment.',
        }[key]
        original_reviews.append({'key': key, 'pairKey': entry['pairKey'], 'disposition': 'held' if reasons else 'supported', 'reasonCodes': reasons or ['exact-original-taxon', 'exact-original-active-county', 'positive-original-human-observation', 'identity-date-coordinate-agreement', 'no-specific-captivity-contradiction-in-retained-record'], 'checks': checks, 'originalResponse': response, 'interpretedLocator': entry['locator'], 'selectionLineage': s, 'originalFields': original, 'originalBytesBase64': base64.b64encode(raw).decode(), 'originalFieldByteWitnesses': byte_fields(raw, original), 'interpretedClassification': r['classifications'], 'secondaryGadm': r.get('gadm'), 'originalLicenseFieldPresent': DWC + 'license' in original or DC + 'license' in original, 'licenseInference': 'CC BY 4.0 is explicit in dataset metadata and interpreted record; no license field is fabricated in the original response.', 'contextReview': context_note})
    for pair in PAIRS:
        rr = [r for r in original_reviews if r['pairKey'] == pair]; supported = [r['key'] for r in rr if r['disposition'] == 'supported']
        selected_by_date = sorted(pair_rows[pair], key=lambda r: (-date.fromisoformat(r['eventDate']).toordinal(), r['key']))[:2]
        require(sorted(r['key'] for r in selected_by_date) == sorted(r['key'] for r in rr), 'independent latest-two selection ' + pair)
        adapter_pairs.append({'pairKey': pair, 'primaryKey': min(supported) if supported else None, 'recordKeys': sorted(r['key'] for r in rr), 'heldKeys': sorted(r['key'] for r in rr if r['disposition'] == 'held'), 'disposition': 'supported' if supported else 'held'})
    context_evidence = []
    for suffix, phrase in [('/method-context-20260909/ebird-rules.raw.gz', 'eBird is intended for observations of wild'), ('/method-context-20260909/ebird-review.raw.gz', "If there is not enough supporting documentation"), ('/method-context-20260909/gbif-machine-tags.raw.gz', 'OMIT_FROM_SCHEDULED_CRAWL')]:
        p, b = by_suffix(suffix); rawtext = b.decode(); index = rawtext.find(phrase); require(index >= 0, 'context phrase ' + suffix)
        context_evidence.append({'path': p, 'decodedSha256': sha(b), 'byteOffset': len(rawtext[:index].encode()), 'rawExcerpt': rawtext[index:index + 550], 'role': 'dataset/method context, not individual original acceptance'})
    metrics = {'canonicalRuns': 0, 'canonicalEvents': 0, 'newDeterminations': 0, 'completedSourceFamilyScreens': 0, 'absenceClaims': 0, 'nonDetectionClaims': 0, 'networkRequests': 0}
    return {'schemaVersion': 1, 'kind': 'independent-offline-original-record-method-proposal', 'jobId': JOB, 'leaseId': 'lease-' + JOB + '-1', 'actorId': ACTOR, 'baseSha': BASE, 'status': 'proposal-ready-main-method-required', 'adapterReview': {'actorId': ACTOR, 'baseSha': BASE, 'status': 'proposal-ready-main-method-required', 'pairs': adapter_pairs}, 'sourceId': 'gbif-ebird', 'stateCode': 'CA', 'speciesId': SPECIES, 'sourceYear': 2024, 'scopeComplete': False, 'metrics': {'baseline': metrics.copy(), 'final': metrics.copy(), 'net': metrics.copy()}, 'provenance': {'scaffold': descriptor(scaffold_path, scaffold_bytes), 'reuse': 'Reused the verified county-independent archive/base64/gzip decoding, descriptor and byte-witness utilities, sequential-page inspection and offline serialization/telemetry scaffold. Parser was not independently reimplemented. All CA pairs, selected keys, counts, geography checks, context decisions and findings were independently inspected and adapted; no Louisiana conclusions inherited.', 'scaffoldImportedAtRuntime': False}, 'inputDescriptors': inputs, 'archiveMemberDescriptors': inventory, 'verifiedDescriptorReferences': checked_refs, 'archiveVerification': {'outerArchives': 4, 'embeddedMemberOccurrences': len(inventory), 'uniqueEmbeddedPaths': len(blobs), 'allEmbeddedStoredAndDecodedHashes': True, 'retainedDescriptorReferencesChecked': len(checked_refs), 'sourcePagesProcessedSequentially': 50}, 'originalAcquisitionLineage': {'receipt': descriptor(receipt_path, rb), 'repositoryBaseCommit': receipt['repositoryBaseCommit'], 'recipe': receipt['recipe'], 'parentDiagnostic': receipt['parentDiagnostic'], 'parentSourceReceipts': receipt['parentSourceReceipts'], 'startedAt': receipt['startedAt'], 'finishedAt': receipt['finishedAt'], 'allSelectedOriginalsCompleted': 141, 'allSelectedOriginalFailures': 0, 'automaticRetries': 0, 'selectedForThisLease': 4}, 'parentSearch': {'receivedRows': 15000, 'declaredRows': 21878, 'remainingUnretrievedRows': 6878, 'paginationComplete': False, 'terminalPages': 0, 'frozenProviderSnapshot': False, 'nationalKeysVerifiedUnique': len(keys), 'nationalOccurrenceIdsVerifiedUnique': len(ids), 'qualification': 'Retained positive witnesses can support individual historical occurrences. Partial search cannot complete a source-family screen or support any negative claim.'}, 'geography': {'registryEntries': counties, 'method': 'Exact original state and unique active county name or registered alias; no coordinate routing.', 'secondaryGadmLabelVariationKeys': sorted(raw_gadm_variations), 'secondaryGadmVariationInterpretation': 'All 55 material rows have secondary GADM county and state labels matching their explicit publisher county and state; GADM is corroboration only, never routing authority.', 'secondaryGadmConflicts': sorted(secondary_conflicts, key=lambda x: x['key'])}, 'sourceMethodReview': {'authority': 'Cornell Lab of Ornithology via GBIF', 'datasetMetadataPath': metadata_path, 'datasetDoi': metadata['doi'], 'datasetLicense': metadata['license'], 'datasetTemporalCoverages': metadata['temporalCoverages'], 'taxonomyResponsePath': taxpath, 'taxonomyResponse': taxonomy, 'datasetMachineTags': metadata['machineTags'], 'unknownFieldQualification': 'Original http://unknown.org/status=not_reviewed and crawler fields match older dataset-level machine tag values. Matching values provide dataset-context inference, not proof of per-record field provenance, individual rejection, human review or individual expert approval.', 'contextEvidence': context_evidence, 'existingRegistryAdapter': source['researchAdapter'], 'independentMethodProposal': 'MAIN must register and test a selected-original witness profile for this independently reviewed scope. Pin exact selected keys before requests, verify complete selected-original acquisition separately from incomplete parent search, retain all interpreted conflicts and individually held originals, and accept only exact positive original identity/date/taxon/county records with source license and qualified context. Do not reuse the existing v2 replay as approval for these deferred pairs.', 'requiredMainTests': ['Missing/changed original bytes or decoded hash fails', 'Extra/missing selected key or selected locator mismatch fails', 'Original county/state/taxon/date/identity or coordinate contradiction holds that original', 'Specific captivity context holds that original without discarding another valid record', 'Home/private/zoo locality alone does not infer captivity', 'Opaque dataset machine tags cannot create human-approved review', 'Incomplete parent pagination never becomes completed source screen or negative outcome', 'Unacquired interpreted originals never enter approved original recordKeys']}, 'originalReviews': original_reviews, 'materialReview': {'rows': len(material), 'selectedOriginalRows': 4, 'otherInterpretedRowsOriginalsNotAcquired': 51, 'pairs': [{'pairKey': pair, 'rowCount': len(pair_rows[pair]), 'allInterpretedKeys': sorted(x['key'] for x in pair_rows[pair])} for pair in PAIRS], 'fieldAndIssueCounts': {k: dict(sorted(v.items())) for k, v in sorted(distributions.items())}, 'contextRows': sorted(context_rows, key=lambda x: x['key']), 'rowsWithLocators': sorted(material, key=lambda x: (x['pairKey'], x['key']))},  'caveats': ['Proposal only: no immutable completed evidence-run manifest and no canonical writes.', 'Four selected originals reviewed; 51 other material rows have interpreted-only dispositions, not original approvals. No geographic, taxonomic, date, identity, positive-observation, license or specific-captivity contradiction was found in the reviewed scope.', 'Imperial Beach Pier is a locality name on a San Diego record, not an Imperial county assertion. Explicit county and secondary GADM agree on San Diego.', 'CONTINENT_DERIVED_FROM_COORDINATES is a continent annotation; county authority remains the exact publisher county. TAXON_CONCEPT_ID_NOT_FOUND leaves the Avibase concept unresolved while exact accepted GBIF species classifications agree.', 'Missing coordinate uncertainty and photographs do not alone invalidate explicit original county evidence. Records support historical point observations, not countywide abundance, establishment or current persistence.', 'eBird wild-observation rules are dataset context, not individual proof of wildness or human expert approval. Opaque not_reviewed and crawler fields do not establish individual rejection or human acceptance.', 'Repeated locality/date/count records and consecutive one-bird roost records may describe the same individuals. Do not sum counts or claim independent encounters.', 'No fresh retrieval, source-screen completion, establishment, invasive impact, absence or non-detection claim is made.' ], 'performanceContract': {'maximumMemoryMiB': 384, 'measurement': 'Windows GetProcessMemoryInfo PeakWorkingSetSize; actual generation performance stored separately from deterministic review payload', 'offlineVerify': 'Recompute entire review and compare exact serialized proposal bytes, preserving recorded initial-generation performance metadata.'}}

def encoded(value):
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, indent=2) + '\n').encode('utf-8')

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--verify', action='store_true'); args = parser.parse_args()
    start = time.perf_counter(); payload = review(); memory = peak_mib(); elapsed = round(time.perf_counter() - start, 6)
    require(memory <= 384, 'memory reservation exceeded')
    if args.verify:
        retained = OUT.read_bytes(); old = json.loads(retained)
        performance = old.pop('performance')
        require(performance['generationPeakMemoryMiB'] <= 384 and performance['generationElapsedSeconds'] > 0, 'recorded generation telemetry')
        require(old == payload, 'proposal semantic reproduction mismatch')
        payload['performance'] = performance
        require(encoded(payload) == retained, 'exact proposal byte reproduction mismatch')
    else:
        payload['performance'] = {'generationElapsedSeconds': elapsed, 'generationPeakMemoryMiB': memory, 'metric': 'PeakWorkingSetSize', 'networkRequests': 0}
        retained = encoded(payload); require(len(retained) < 8388608, 'proposal size cap'); OUT.write_bytes(retained)
    print(json.dumps({'ok': True, 'mode': 'verify' if args.verify else 'generate', 'proposal': descriptor(OUT.relative_to(ROOT).as_posix(), retained), 'elapsedSeconds': round(time.perf_counter() - start, 6), 'peakMemoryMiB': peak_mib(), 'adapterReview': payload['adapterReview'], 'materialRows': payload['materialReview']['rows'], 'secondaryGadmConflicts': len(payload['geography']['secondaryGadmConflicts'])}, sort_keys=True))

if __name__ == '__main__':
    main()
