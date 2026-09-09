"""Independent, offline Arizona Monk Parakeet source review; standard library only.

Run from the leased repository: python <this-file> --write or --verify.
Only --write mutates proposal.json. --verify reconstructs every proposal byte.
No MAIN adapter, reviewer output, cache receipt or network client is imported.
Exact response bytes are verified against versioned archive and receipt hashes.
"""
import argparse
import base64
import collections
import ctypes
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import time

JOB = 'ebird-monk-az-original-review-20260909-r24'
ACTOR = 'ebird_monk_az_review_r24'
BASE = 'afd2d95233e8712fa16edd0cd99065dc4b674c7b'
ACQUISITION = '0a451f65a2c46fde2102ceeb1c7eee3017aafb0f'
DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
PUBLISHER = 'e2e717bf-551a-4917-bdc9-4fa0f342c530'
SPECIES = 'myiopsitta-monachus'
NAME = 'Myiopsitta monachus'
LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode'
COUNTIES = {'04013': 'Maricopa', '04019': 'Pima', '04021': 'Pinal'}
KEYS = [5306954725, 5317667172, 5351172963, 5354100081, 5377509063, 5390084613]
NAMES = ['ebird-monk-selected-originals-20260909-r23',
         'ebird-monk-partial-public-slice-20260909-r22',
         'ebird-eod-public-metadata-20260909-r19',
         'ebird-eod-original-field-pilot-20260909-r19']
ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().with_name('proposal.json')
DWC = 'http://rs.tdwg.org/dwc/terms/'
CALIBRATION = {'mode': 'verify', 'elapsedSeconds': 1.117713, 'peakMemoryMiB': 75.016, 'result': 'byte-identical proposal replay passed before embedding this historical measurement'}


def digest(b):
    return hashlib.sha256(b).hexdigest()


def check(ok, message):
    if not ok:
        raise ValueError(message)


def descriptor(path, b):
    return {'path': path, 'bytes': len(b), 'sha256': digest(b)}


def verified(b, d, label):
    check(digest(b) == d['sha256'], 'SHA256 mismatch: ' + label)
    if 'bytes' in d:
        check(len(b) == d['bytes'], 'byte mismatch: ' + label)


def pair_for(county, state):
    if state != 'Arizona':
        return None
    return next((f + ':' + SPECIES for f, n in COUNTIES.items() if n == county), None)


def peak_mb():
    if os.name == 'nt':
        class Counters(ctypes.Structure):
            _fields_ = [('cb', ctypes.c_ulong), ('PageFaultCount', ctypes.c_ulong)] + [
                (n, ctypes.c_size_t) for n in ['PeakWorkingSetSize', 'WorkingSetSize',
                'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage',
                'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage']]
        pc = Counters()
        pc.cb = ctypes.sizeof(pc)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.GetCurrentProcess.restype = ctypes.c_void_p
        psapi = ctypes.WinDLL('psapi', use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
        check(psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(pc), pc.cb), 'memory telemetry failed')
        return round(pc.PeakWorkingSetSize / 1048576, 3)
    import resource
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 3)


def reconstruct():
    evaluations = {}
    outer = []
    members = {}
    member_descriptors = []
    receipts = []
    # Archive JSON stores compressed page bytes in base64. Do not inflate all pages.
    for name in NAMES:
        ep = 'ops/national-research/evaluations/' + name + '.json'
        eb = (ROOT / ep).read_bytes()
        ev = json.loads(eb)
        evaluations[name] = ev
        outer.append(descriptor(ep, eb))
        ap = ev['artifact']['path']
        ab = (ROOT / ap).read_bytes()
        verified(ab, ev['artifact'], ap)
        decoded_archive = gzip.decompress(ab)
        archive = json.loads(decoded_archive)
        outer.append(dict(descriptor(ap, ab), decodedBytes=len(decoded_archive), decodedSha256=digest(decoded_archive)))
        if 'files' in ev['artifact']:
            check(len(archive['files']) == ev['artifact']['files'], 'archive member count')
        for i, f in enumerate(archive['files']):
            check(f['encoding'] == 'base64', 'member encoding')
            path = f['originalPath']
            b = base64.b64decode(f['contents'], validate=True)
            verified(b, f, path)
            d = gzip.decompress(b) if path.endswith('.gz') else b
            md = dict(descriptor(path, b), archivePath=ap, archiveMemberIndex=i,
                      decodedBytes=len(d), decodedSha256=digest(d))
            member_descriptors.append(md)
            check(path not in members, 'duplicate archive member path')
            members[path] = (b, md)
            if path.endswith('/receipt.json'):
                receipts.append((path, json.loads(d)))
        del archive, decoded_archive
    response_by_path = {}
    for rp, receipt in receipts:
        for response in receipt.get('responses', []) + receipt.get('receipts', []):
            p = response.get('path')
            if p not in members:
                continue
            b, md = members[p]
            verified(b, response, p)
            if 'decodedSha256' in response:
                check(response['decodedSha256'] == md['decodedSha256'], 'response decoded hash')
            if 'decodedBytes' in response:
                check(response['decodedBytes'] == md['decodedBytes'], 'response decoded bytes')
            check(response.get('status') == 200, 'retained response HTTP status')
            response_by_path[p] = dict(response, receiptPath=rp)
        recipe = receipt.get('recipe')
        if recipe and recipe.get('path') in members:
            verified(members[recipe['path']][0], recipe, 'acquisition recipe')

    def get_suffix(suffix):
        matching = [(p, b, d) for p, (b, d) in members.items() if p.endswith(suffix)]
        check(len(matching) == 1, 'unique source suffix: ' + suffix)
        p, b, md = matching[0]
        return p, gzip.decompress(b) if p.endswith('.gz') else b, md

    selected_ev = evaluations[NAMES[0]]
    partial_ev = evaluations[NAMES[1]]
    for field in ['acquisition', 'recipe', 'parentDiagnostic']:
        d = selected_ev[field]
        verified(members[d['path']][0], d, field)
    verified((ROOT / selected_ev['partialSource']['path']).read_bytes(), selected_ev['partialSource'], 'partial evaluation')
    verified((ROOT / selected_ev['partialSourceArtifact']['path']).read_bytes(), selected_ev['partialSourceArtifact'], 'partial archive')
    receipt_path, rb, rmd = get_suffix('/monk-selected-originals-20260909-r23/receipt.json')
    selected_receipt = json.loads(rb)
    check(selected_receipt['repositoryBaseCommit'] == ACQUISITION, 'original acquisition lineage')
    check(selected_receipt['completed'] is True and not selected_receipt['errors'], 'selected acquisition completion')
    check(len(selected_receipt['responses']) == 141 and selected_receipt['automaticRetries'] == 0, 'selected request accounting')
    for d in selected_receipt['parentSourceReceipts']:
        verified(members[d['path']][0], d, 'parent source receipt')
    selections = {r['key']: r for r in selected_receipt['selection'] if r['key'] in KEYS}
    check(sorted(selections) == KEYS, 'exact leased original keys')
    selected_responses = {r['key']: r for r in selected_receipt['responses'] if r['key'] in KEYS}

    registry_path = 'src/data/research/county-equivalent-registry.json'
    registry_bytes = (ROOT / registry_path).read_bytes()
    registry = json.loads(registry_bytes)
    authority = []
    for fips, county in COUNTIES.items():
        matches = [c for c in registry['countyEquivalents'] if c['status'] == 'active'
                   and c['stateName'] == 'Arizona' and county in [c['shortName'], c['legalName']] + c['aliases']]
        check(len(matches) == 1 and matches[0]['countyFips'] == fips, 'exact active county mapping')
        authority.append(matches[0])
    catalog_path = 'src/data/generated/species.json'
    catalog_bytes = (ROOT / catalog_path).read_bytes()
    catalog = json.loads(catalog_bytes)
    check(len([s for s in catalog if s['id'] == SPECIES and s['scientificName'] == NAME]) == 1, 'catalog taxon')
    tax_path, tax_bytes, tax_md = get_suffix('/taxonomy-discovery-20260909/myiopsitta-monachus.json.gz')
    taxon = json.loads(tax_bytes)
    check(taxon['usageKey'] == 2479407 and taxon['canonicalName'] == NAME and taxon['status'] == 'ACCEPTED'
          and taxon['matchType'] == 'EXACT' and taxon['rank'] == 'SPECIES' and taxon['class'] == 'Aves', 'accepted exact taxon')
    dataset_path, db, dataset_md = get_suffix('/taxonomy-discovery-20260909/dataset.json.gz')
    dataset = json.loads(db)
    check(dataset['key'] == DATASET and dataset['publishingOrganizationKey'] == PUBLISHER and dataset['license'] == LICENSE, 'source identity and rights')

    rows = []
    selected_interpreted = {}
    all_keys = set()
    all_occurrences = set()
    pages = []
    decoder = json.JSONDecoder()
    # Exactly one ~1.5MB decoded source response is parsed at a time.
    for p, (compressed, md) in sorted(members.items()):
        if '/page-' not in p:
            continue
        raw = gzip.decompress(compressed)
        text = raw.decode('utf-8')
        page = json.loads(text)
        response = response_by_path[p]
        check(page['offset'] == response['offset'] and page['count'] == 21878
              and page['limit'] == 300 and len(page['results']) == 300 and page['endOfRecords'] is False, 'partial page accounting')
        pages.append({k: response[k] for k in ['page', 'offset', 'url', 'status', 'retrievedAt', 'path', 'bytes', 'sha256', 'decodedBytes', 'decodedSha256']})
        match = re.search(r'"results"\s*:\s*\[', text)
        check(match is not None, 'results locator')
        pos = match.end()
        byte_pos = len(text[:pos].encode('utf-8'))
        for index, expected in enumerate(page['results']):
            start = pos
            while text[start] in ' \r\n\t,':
                start += 1
            r, end = decoder.raw_decode(text, start)
            check(r == expected, 'row locator decode')
            start_byte = byte_pos + len(text[pos:start].encode('utf-8'))
            row_bytes = text[start:end].encode('utf-8')
            byte_pos = start_byte + len(row_bytes)
            pos = end
            check(r['key'] not in all_keys and r['occurrenceID'] not in all_occurrences, 'duplicate source identity')
            all_keys.add(r['key'])
            all_occurrences.add(r['occurrenceID'])
            pair = pair_for(r.get('county'), r.get('stateProvince'))
            if pair is None:
                continue
            conflicts = []
            tests = {
                'exactTaxon': r.get('species') == NAME and r.get('taxonKey') == 2479407 and r.get('speciesKey') == 2479407 and r.get('acceptedTaxonKey') == 2479407 and r.get('taxonomicStatus') == 'ACCEPTED' and r.get('taxonRank') == 'SPECIES',
                'sourceIdentity': r.get('datasetKey') == DATASET and r.get('publishingOrgKey') == PUBLISHER and str(r['key']) == r.get('gbifID') and r.get('occurrenceID') == 'URN:catalog:CLO:EBIRD:' + r.get('catalogNumber', '') and r.get('identifier') == r.get('catalogNumber') and r.get('institutionCode') == 'CLO' and r.get('collectionCode') == 'EBIRD',
                'positiveObservation': r.get('basisOfRecord') == 'HUMAN_OBSERVATION' and r.get('occurrenceStatus') == 'PRESENT' and (r.get('individualCount') is None or r['individualCount'] > 0),
                'licensed': r.get('license') == LICENSE,
                'country': r.get('countryCode') == 'US',
            }
            try:
                date = datetime.date(r['year'], r['month'], r['day'])
                tests['calendarDate'] = date.isoformat() == r['eventDate'] and date.year == 2024
            except (KeyError, ValueError):
                tests['calendarDate'] = False
            for k, v in tests.items():
                if not v:
                    conflicts.append(k)
            classification_checks = {}
            for ck, cv in r.get('classifications', {}).items():
                cu = cv.get('acceptedUsage', {})
                classification_checks[ck] = cv.get('taxonomicStatus') == 'ACCEPTED' and cu.get('genericName') == 'Myiopsitta' and cu.get('specificEpithet') == 'monachus' and cu.get('rank') == 'SPECIES'
            if not classification_checks or not all(classification_checks.values()):
                conflicts.append('accepted-classification-conflict')
            gadm = r.get('gadm', {})
            if gadm.get('level1', {}).get('name') != 'Arizona' or gadm.get('level2', {}).get('name') != r['county']:
                conflicts.append('interpreted-gadm-text-disagrees-with-publisher-county')
            context_fields = {k: v for k, v in r.items() if re.search('locality|remarks|establishment|captive|cultiv|habitat|pathway', k, re.I)}
            suspect = {k: v for k, v in context_fields.items() if re.search(r'\b(captive|caged|aviary|dead|zoo|pet|domestic|escapee|escaped)\b', str(v), re.I)}
            if suspect:
                conflicts.append('explicit-context-needs-individual-resolution')
            loc = {'responsePath': p, 'responseSha256': md['sha256'], 'decodedResponseSha256': md['decodedSha256'],
                   'rowIndex': index, 'jsonPointer': '/results/' + str(index), 'decodedByteOffset': start_byte,
                   'rowBytes': len(row_bytes), 'rawRowSha256': digest(row_bytes), 'sourceUrl': 'https://www.gbif.org/occurrence/' + str(r['key'])}
            row = dict(key=r['key'], pairKey=pair, occurrenceID=r['occurrenceID'], eventDate=r['eventDate'],
                       locator=loc, checks=tests, classificationChecks=classification_checks,
                       issues=r.get('issues', []), contextFields=context_fields, explicitConflicts=conflicts,
                       individualCount=r.get('individualCount'), uncertainty=r.get('coordinateUncertaintyInMeters'),
                       opaqueTags={k: v for k, v in r.items() if k.startswith('http://unknown.org/')},
                       originalFieldsReviewed=r['key'] in KEYS,
                       disposition='selected-original-reviewed-separately' if r['key'] in KEYS else 'interpreted-only-original-not-acquired')
            rows.append(row)
            if r['key'] in KEYS:
                selected_interpreted[r['key']] = r
        del page, raw, text
    pages.sort(key=lambda r: r['offset'])
    check([p['offset'] for p in pages] == list(range(0, 15000, 300)), 'contiguous partial offsets')
    check(len(all_keys) == len(all_occurrences) == 15000 and len(rows) == 234, 'source inventory counts')
    check(sorted(selected_interpreted) == KEYS, 'all selected interpreted rows found')
    rows.sort(key=lambda r: r['key'])
    row_lookup = {r['key']: r for r in rows}
    originals = []
    for key in KEYS:
        response = selected_responses[key]
        b, md = members[response['path']]
        raw = gzip.decompress(b)
        o = json.loads(raw)
        r = selected_interpreted[key]
        summary = row_lookup[key]
        selection = selections[key]
        conflicts = list(summary['explicitConflicts'])
        check(selection['responsePath'] == summary['locator']['responsePath'] and selection['responseSha256'] == summary['locator']['responseSha256'] and selection['rowIndex'] == summary['locator']['rowIndex'], 'selected interpreted locator')
        original_context = {k: v for k, v in o.items() if re.search('locality|remarks|establishment|captive|cultiv|habitat|pathway', k, re.I)}
        original_suspect = {k: v for k, v in original_context.items() if re.search(r'\b(captive|caged|aviary|dead|zoo|pet|domestic|escapee|escaped)\b', str(v), re.I)}
        if original_suspect:
            conflicts.append('original-context-needs-individual-resolution')
        same = ['locality', 'county', 'stateProvince', 'catalogNumber', 'occurrenceID', 'institutionCode', 'collectionCode', 'genus', 'specificEpithet', 'taxonConceptID', 'recordedBy', 'geodeticDatum', 'occurrenceStatus']
        checks = {k: o.get(DWC + k) == r.get(k) for k in same}
        checks.update({
            'key': o.get('key') == key and o.get('http://rs.gbif.org/terms/1.0/gbifID') == str(key),
            'dataset': o.get('datasetKey') == r['datasetKey'] == DATASET,
            'publisher': o.get('publishingOrgKey') == r['publishingOrgKey'] == PUBLISHER,
            'scientificName': o.get(DWC + 'scientificName') == NAME == taxon['canonicalName'],
            'basis': o.get(DWC + 'basisOfRecord') == 'HumanObservation' and r['basisOfRecord'] == 'HUMAN_OBSERVATION',
            'country': o.get(DWC + 'country') == 'United States' and r['countryCode'] == 'US',
            'identifier': o.get('http://purl.org/dc/terms/identifier') == r['identifier'],
            'positiveCount': int(o.get(DWC + 'individualCount', 0)) == r.get('individualCount') and r.get('individualCount', 0) > 0,
            'explicitCounty': pair_for(o.get(DWC + 'county'), o.get(DWC + 'stateProvince')) == selection['pair'] == summary['pairKey'],
        })
        for coord in ['decimalLatitude', 'decimalLongitude']:
            checks[coord] = float(o[DWC + coord]) == r[coord]
        checks['date'] = datetime.date(int(o[DWC + 'year']), int(o[DWC + 'month']), int(o[DWC + 'day'])).isoformat() == r['eventDate'] == selection['eventDate']
        for tag in ['status', 'crawl_attempt', 'omitFromScheduledCrawl']:
            checks['opaque:' + tag] = o.get('http://unknown.org/' + tag) == r.get('http://unknown.org/' + tag)
        for field, passed in checks.items():
            if not passed:
                conflicts.append('original-interpretation:' + field)
        # All source fields are retained exactly, including non-Darwin-Core wrapper metadata.
        originals.append({'key': key, 'pairKey': summary['pairKey'], 'disposition': 'held' if conflicts else 'supported',
                          'checks': checks, 'originalContextFields': original_context, 'explicitConflicts': conflicts, 'selection': selection,
                          'originalResponse': dict(response, archivePath=md['archivePath'], archiveMemberIndex=md['archiveMemberIndex']),
                          'originalDecodedBytesBase64': base64.b64encode(raw).decode('ascii'),
                          'originalFields': o, 'interpretedLocator': summary['locator'],
                          'rightsSource': 'Interpreted record license and independently retained dataset license; original response has no individual license field.',
                          'wildRecordAssessment': 'Supported historical recorded observation under the retained eBird wild-living-bird submission policy; no explicit captive/dead context in this original. This is a source-context inference, not proof of establishment or individual expert approval.',
                          'contextAssessment': 'The original locality is a trail, ranch, town or street/address label. These labels alone do not assert captivity; original and interpreted locality agree.'})
    pairs = []
    for fips in sorted(COUNTIES):
        pair = fips + ':' + SPECIES
        rr = [r for r in rows if r['pairKey'] == pair]
        oo = [o for o in originals if o['pairKey'] == pair]
        held = sorted(o['key'] for o in oo if o['disposition'] == 'held')
        supported = [o for o in oo if o['disposition'] == 'supported']
        ranked = sorted(rr, key=lambda r: (-datetime.date.fromisoformat(r['eventDate']).toordinal(), r['key']))[:2]
        check(sorted(r['key'] for r in ranked) == sorted(o['key'] for o in oo), 'pre-acquisition selection rule independently reproduced')
        primary = sorted(supported, key=lambda o: (-datetime.date.fromisoformat(o['selection']['eventDate']).toordinal(), o['key']))[0]['key'] if supported else None
        pairs.append({'pairKey': pair, 'primaryKey': primary, 'recordKeys': sorted(o['key'] for o in oo), 'heldKeys': held, 'disposition': 'supported' if supported else 'held'})

    contexts = []
    for suffix, patterns, interpretation in [
        ('/method-context-20260909/ebird-rules.raw.gz', [b'eBird is intended for observations', b'You may report any unrestrained bird'], 'Submission policy supports wild-living-bird context and permits unrestrained escapees. It does not prove establishment or compliance for each record.'),
        ('/method-context-20260909/ebird-downloads.raw.gz', [b'The EOD is updated annually', b'Additional metadata associated'], 'EOD supplies occurrence data without checklist sampling effort; cannot support survey non-detection.'),
        ('/method-context-20260909/gbif-machine-tags.raw.gz', [b'CRAWL_ATTEMPT', b'OMIT_FROM_SCHEDULED_CRAWL'], 'Crawler counters and scheduled-crawl omission concern datasets, not individual biological acceptance.'),
        ('/method-context-20260909/ebird-review.raw.gz', [b'Flagged'], 'General eBird review documentation does not establish that these six records were individually approved by humans.')]:
        p, b, md = get_suffix(suffix)
        witnesses = []
        for pattern in patterns:
            at = b.find(pattern)
            check(at >= 0, 'metadata witness not found: ' + repr(pattern))
            start = max(0, at - 160)
            end = min(len(b), at + 700)
            witnesses.append({'decodedByteOffset': start, 'bytes': end - start, 'sha256': digest(b[start:end]), 'utf8Text': b[start:end].decode('utf-8', errors='replace')})
        contexts.append({'descriptor': md, 'response': response_by_path[p], 'witnesses': witnesses, 'interpretation': interpretation})
    issue_counts = collections.Counter(i for r in rows for i in r['issues'])
    context_counts = {k: dict(sorted(collections.Counter(str(r['contextFields'].get(k)) for r in rows).items()))
                      for k in sorted(set().union(*(r['contextFields'] for r in rows)))}
    pair_summaries = []
    for pair in pairs:
        rr = [r for r in rows if r['pairKey'] == pair['pairKey']]
        pair_summaries.append({'pairKey': pair['pairKey'], 'materialInterpretedRows': len(rr), 'recordKeys': [r['key'] for r in rr],
                               'originalReviewedKeys': pair['recordKeys'], 'originalNotAcquiredKeys': [r['key'] for r in rr if not r['originalFieldsReviewed']],
                               'dateRange': [min(r['eventDate'] for r in rr), max(r['eventDate'] for r in rr)],
                               'explicitContradictions': [{'key': r['key'], 'conflicts': r['explicitConflicts']} for r in rr if r['explicitConflicts']]})
    return {
        'schemaVersion': 1, 'kind': 'independent-retained-original-record-review-proposal', 'jobId': JOB,
        'actorId': ACTOR, 'baseSha': BASE, 'status': 'proposal-ready-main-method-required',
        'adapterReview': {'actorId': ACTOR, 'baseSha': BASE, 'status': 'proposal-ready-main-method-required', 'pairs': pairs},
        'scope': {'sourceId': 'gbif-ebird', 'datasetKey': DATASET, 'stateCode': 'AZ', 'speciesId': SPECIES, 'selectedOriginalKeys': KEYS, 'materialInterpretedRows': 234},
        'counts': {'selectedOriginalSupported': sum(o['disposition'] == 'supported' for o in originals),
                   'selectedOriginalHeld': sum(o['disposition'] == 'held' for o in originals), 'supportedPairs': sum(p['disposition'] == 'supported' for p in pairs),
                   'interpretedOnlyRows': 228, 'canonicalEvents': 0, 'canonicalRuns': 0, 'canonicalDeterminations': 0,
                   'negativeClaims': 0, 'completedSourceFamilyScreens': 0, 'networkRequests': 0},
        'canonicalChangeAccounting': {'baseline': {'events': 0, 'runs': 0, 'determinations': 0}, 'final': {'events': 0, 'runs': 0, 'determinations': 0}, 'net': {'events': 0, 'runs': 0, 'determinations': 0}, 'qualification': 'Counts refer only to canonical contributions created by this worker, not total repository state.'},
        'independentMethodProposal': ['Review immutable original publisher fields and exact interpreted counterpart by key and occurrenceID.',
            'Use explicit original state and a unique active county name or registered alias. Do not route by coordinates.',
            'Require exact original catalog binomial and accepted species-level GBIF classifications; preserve unresolved Avibase concept issue.',
            'Require positive HumanObservation and consistent real calendar date, coordinates, stable identity and retained rights.',
            'Retain each explicit original contradiction as its own held record; another independently sound selected occurrence may still support its pair.',
            'Use fixed latest-date/ascending-key selection only within retained partial material, never imply a latest county observation overall.',
            'Apply only historical recorded presence after MAIN validates this independent proposal under its shared method; no canonical output from this worker.'],
        'originalRecordReviews': originals, 'interpretedPairSummaries': pair_summaries, 'materialInterpretedInventory': rows,
        'aggregateChecks': {'issueCounts': dict(sorted(issue_counts.items())), 'contextCounts': context_counts,
            'missingUncertainty': sum(r['uncertainty'] is None for r in rows), 'missingIndividualCountKeys': [r['key'] for r in rows if r['individualCount'] is None],
            'explicitContradictions': [{'key': r['key'], 'conflicts': r['explicitConflicts']} for r in rows if r['explicitConflicts']],
            'qualification': 'All retained interpreted fields were inspected mechanically for identity, classifications, dates, positive status, county and context; only six selected original response bodies received original-field review. Missing individualCount does not negate PRESENT; those two rows remain unapproved interpreted-only records.'},
        'sourceAuthority': {'registry': descriptor('src/data/research/source-registry.json', (ROOT / 'src/data/research/source-registry.json').read_bytes()),
            'datasetDescriptor': dataset_md, 'datasetResponse': response_by_path[dataset_path],
            'datasetFacts': {k: dataset[k] for k in ['key', 'title', 'publishingOrganizationKey', 'doi', 'license', 'temporalCoverages', 'machineTags']},
            'acceptedTaxonomyDescriptor': tax_md, 'acceptedTaxonomy': taxon,
            'countyRegistry': descriptor(registry_path, registry_bytes), 'countyAuthorityRows': authority,
            'catalog': descriptor(catalog_path, catalog_bytes), 'methodContext': contexts,
            'opaqueTagQualification': 'Original http://unknown.org/status=not_reviewed matches older dataset-level citizenScience.gbif.org and citizenScience.mgrosjean.gbif.org tags. Matching values and retained namespaces/timestamps provide dataset context, not a proven field lineage, individual eBird rejection, or individual human approval. crawl_attempt=24 and omitFromScheduledCrawl=true match dataset crawler tags; they are not biological validity decisions.'},
        'sourceAcquisitionLineage': {'selectedOriginalCodeCommit': ACQUISITION, 'selectedOriginalReceipt': rmd,
            'selectedOriginalRecipe': selected_receipt['recipe'], 'selectedOriginalStartedAt': selected_receipt['startedAt'], 'selectedOriginalFinishedAt': selected_receipt['finishedAt'],
            'selectedOriginalRequests': 141, 'selectedOriginalRetries': 0, 'parentSourceCodeLineage': partial_ev['sourceCodeLineage'],
            'parentReceipts': selected_receipt['parentSourceReceipts'], 'parentDiagnostic': selected_receipt['parentDiagnostic'],
            'preservation': 'Acquisition code identity is preserved independently of this later reviewer base. Embedded acquisition recipes are hashed as bytes, never imported or executed.'},
        'pagination': {'scopeComplete': False, 'receivedRows': 15000, 'declaredRows': 21878, 'unretrievedRows': 6878,
            'uniqueKeys': len(all_keys), 'uniqueOccurrenceIDs': len(all_occurrences), 'terminalPages': 0, 'retainedPages': pages,
            'parentStops': partial_ev['stops'], 'qualification': 'Partial mutable public search. Selected original GET completion is separate from incomplete parent pagination.'},
        'sourceDescriptors': {'outer': outer, 'embedded': sorted(member_descriptors, key=lambda d: (d['archivePath'], d['path']))},
        'caveats': ['Historical 2024 observation supports recorded presence only; no current persistence, establishment, abundance or invasive-impact claim.',
            'No provider silence, missing data, partial search or rejection creates absence, non-detection or completed source-family research.',
            'Explicit publisher county is the authority. Coordinates and GADM text are contradiction checks only; no coordinate county inference.',
            'All234 interpreted records retain CONTINENT_DERIVED_FROM_COORDINATES and TAXON_CONCEPT_ID_NOT_FOUND. Exact accepted original binomial/classifications support taxon despite unresolved source concept ID.',
            'All234 lack uncertainty and establishment fields. Missing uncertainty alone does not negate explicit county text, and missing establishment is unknown.',
            'At-home, backyard, street and ranch labels alone do not establish captivity. No selected original contains explicit captive/dead evidence.',
            'EOD lacks checklist sampling effort, and general review policy is not an individual human approval certificate.',
            'MAIN has a shared retained-original method at this base; this is an independent pair review proposal requiring MAIN validation and integration, not a fabricated new evidence run.',
            'Historical repository workflow documents cite older skill pins and missing registry paths; the job lease and successful frozen Windows preflight supplied the current bounded authority.'],
        'performance': {'memoryBudgetMiB': 384, 'measurementMethod': 'Windows GetProcessMemoryInfo PeakWorkingSetSize; wall time from perf_counter. Each invocation prints actual metrics to stdout.',
                        'recordedOfflineVerificationCalibration': CALIBRATION, 'determinism': 'Historical calibration values are fixed recipe constants; --verify measures its own new performance separately while reproducing proposal bytes.'},
        'verification': {'preflight': {'ok': True, 'head': BASE, 'command': 'C:/Code/tools/node-v22.23.2-win-x64/node.exe .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/az-r24-lease.json --repo C:/Code/project-isitusa-worktrees/' + JOB},
            'offlineCommand': 'C:/Users/Ocean/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe src/data/research/worker-results/' + JOB + '/review.py --verify',
            'outerArchiveHashes': True, 'allEmbeddedHashes': True, 'receiptResponseHashes': True, 'selectedOriginalIdentityChecks': True,
            'sequentialPageReplay': True, 'exactOriginalByteWitnesses': True, 'allMaterialInterpretedLocatorsAndHashes': True},
        'remainingWork': ['MAIN reviews and validates this proposal, rechecks current pair state, and decides canonical integration through the shared selected-original method.'],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    check(args.write != args.verify, 'choose exactly one of --write or --verify')
    start = time.perf_counter()
    proposal = reconstruct()
    payload = (json.dumps(proposal, indent=2, ensure_ascii=True) + '\n').encode('utf-8')
    check(len(payload) < 8388608, 'proposal exceeds 8MiB')
    if args.verify:
        check(OUT.read_bytes() == payload, 'proposal byte reproduction failed')
    else:
        OUT.write_bytes(payload)
    peak = peak_mb()
    check(peak <= 384, 'memory reservation exceeded')
    print(json.dumps({'ok': True, 'mode': 'verify' if args.verify else 'write', 'proposalBytes': len(payload),
                      'proposalSha256': digest(payload), 'elapsedSeconds': round(time.perf_counter() - start, 6),
                      'peakMemoryMiB': peak, 'counts': proposal['counts'], 'adapterReview': proposal['adapterReview']}))


if __name__ == '__main__':
    main()
