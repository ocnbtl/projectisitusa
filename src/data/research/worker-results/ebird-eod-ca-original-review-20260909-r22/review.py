#!/usr/bin/env python3
"""Independent offline CA EOD proposal. Standard library only; no MAIN imports.
--write writes only sibling proposal.json. --verify reconstructs all deterministic
content and compares exact serialized bytes, retaining measured run telemetry.
"""
import argparse
import base64
import ctypes
import datetime as dt
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time

JOB = 'ebird-eod-ca-original-review-20260909-r22'
ACTOR = 'ebird_eod_ca_review_r22'
BASE = '9469aa3863680cf9950e9acb9db38d60d455f56e'
ACQUISITION = 'd4d860e6b27296e09cada8cfadde35e734668522'
DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
SPECIES = 'brotogeris-versicolurus'
NAME = 'Brotogeris versicolurus'
PREFIX = '.cache/research/campaigns/20260908-r19-ebird-bulk/'
EVAL = 'ops/national-research/evaluations/'
DWC = 'http://rs.tdwg.org/dwc/terms/'
DC = 'http://purl.org/dc/terms/'
GBT = 'http://rs.gbif.org/terms/1.0/'
LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode'
PAIRS = ['06037:' + SPECIES, '06085:' + SPECIES]
PINS = {
 EVAL+'ebird-eod-original-field-pilot-20260909-r19.json': (4673, 'fb25f58776a543a24166431c0f8acde68cfc56b0f83514f4c979ae6db30c9f5d'),
 EVAL+'ebird-eod-public-metadata-20260909-r19.json': (13821, '9bf3278aa98bce0e16838a8d33267ae6eeac694b3030f11c03daebae723a84f6'),
 EVAL+'artifacts/ebird-eod-original-field-pilot-20260909-r19.json.gz': (144204, 'd9ed8aeeeb0240f6b054a224c0ada8f579552bfbd4f162a6f92d57daf46c203b'),
 EVAL+'artifacts/ebird-eod-public-metadata-20260909-r19.json.gz': (31390, '38746673c3e8c6a9f916d34254d5f6e87fe51da30a04a43ee8d898652bd23740'),
 'src/data/research/state-registry.json': (24205, '6080d7e61bf9a34794a14e9f6976edc378fbb10908dbd40296d3006923ef1f94'),
 'src/data/research/county-equivalent-registry.json': (1972613, '50eede46823aa219ae3b22739224067e1de102fefd336d033bddb01b7f5501ee'),
 'src/data/research/source-registry.json': (72459, '37539d9b2bc6d47186e69864486e586739e7f140ec549170fe1388d9b9a77e59'),
 'src/data/generated/species.json': (5738579, 'fb82d2c2f0c4ae031569a3bcb472e2e9d8a1a15fac1e7a12a9e7583776df5233'),
 'public/generated/research/CA/counties/06037.json': (2104638, 'ca5572e41a8bab682bc00ffbe6660cecc5126719dd8493b2fb3ec5dd6fa9e0db'),
 'public/generated/research/CA/counties/06085.json': (912551, '5e0322f109a8494e907aeb8c7578357b2e2962d8be4189f461b37bdb8618f0e9'),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        require(key not in obj, 'Duplicate JSON key: ' + key)
        obj[key] = value
    return obj


def parse(data):
    return json.loads(data, object_pairs_hook=unique_object)


def canonical(obj):
    return json.dumps(obj, ensure_ascii=True, sort_keys=True, indent=2).encode('ascii') + b'\n'


def descriptor(path, data):
    return {'path': path, 'bytes': len(data), 'sha256': sha(data)}


class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.hidden = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plaintext(raw):
    parser = PlainHTML()
    parser.feed(raw.decode('utf-8'))
    return ' '.join(' '.join(parser.parts).split())


def peak_memory_mib():
    if __import__('sys').platform == 'win32':
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize',
                'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage',
                'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        psapi = ctypes.WinDLL('psapi', use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
        value = Counters()
        value.cb = ctypes.sizeof(value)
        require(psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(value), value.cb), 'GetProcessMemoryInfo failed')
        return round(value.PeakWorkingSetSize / 1048576, 3)
    import resource
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1048576 if __import__('sys').platform == 'darwin' else 1024), 3)


def build(repo):
    inputs, input_descriptors = {}, []
    for path, (size, digest) in sorted(PINS.items()):
        raw = (repo / path).read_bytes()
        require((len(raw), sha(raw)) == (size, digest), 'Pinned input changed: ' + path)
        inputs[path] = raw
        input_descriptors.append(descriptor(path, raw))
    files, file_descriptors, outer = {}, {}, []
    for path in sorted(p for p in inputs if p.endswith('.gz')):
        decoded = gzip.decompress(inputs[path])
        archive = parse(decoded)
        seen = set()
        outer.append({**descriptor(path, inputs[path]), 'decodedBytes': len(decoded),
                      'decodedSha256': sha(decoded), 'embeddedFiles': len(archive['files'])})
        for item in archive['files']:
            name = item['originalPath']
            require(item['encoding'] == 'base64' and name not in seen and name not in files,
                    'Invalid or duplicate embedded path: ' + name)
            seen.add(name)
            data = base64.b64decode(item['contents'], validate=True)
            require((len(data), sha(data)) == (item['bytes'], item['sha256']), 'Embedded hash mismatch: ' + name)
            raw = gzip.decompress(data) if name.endswith('.gz') else data
            files[name] = raw
            file_descriptors[name] = {**descriptor(name, data), 'archivePath': path,
                'decodedBytes': len(raw), 'decodedSha256': sha(raw)}
    require(len(files) == 90, 'Expected 90 independently hashed embedded files')
    receipts = {name: parse(raw) for name, raw in files.items() if name.endswith('/receipt.json')}
    checked_refs, responses = 0, {}
    def check_refs(node):
        nonlocal checked_refs
        if isinstance(node, dict):
            name = node.get('path')
            if name in files and 'sha256' in node:
                d = file_descriptors[name]
                for field in ('bytes', 'sha256', 'decodedBytes', 'decodedSha256'):
                    if field in node:
                        require(node[field] == d[field], 'Receipt descriptor mismatch: ' + name + ' ' + field)
                checked_refs += 1
                if 'status' in node:
                    require(node['status'] == 200, 'Retained response did not succeed: ' + name)
                    responses[name] = node
            for value in node.values():
                check_refs(value)
        elif isinstance(node, list):
            for value in node:
                check_refs(value)
    for receipt in receipts.values():
        check_refs(receipt)
    for evaluation in (EVAL+'ebird-eod-original-field-pilot-20260909-r19.json', EVAL+'ebird-eod-public-metadata-20260909-r19.json'):
        d = parse(inputs[evaluation])['artifact']
        require(sha(inputs[d['path']]) == d['sha256'] and len(inputs[d['path']]) == d['bytes'], 'Evaluation archive pin mismatch')

    def ref(short):
        name = PREFIX + short
        return {**file_descriptors[name], **{k: responses[name][k] for k in ('url', 'status', 'retrievedAt') if name in responses and k in responses[name]}}

    state = next(x for x in parse(inputs['src/data/research/state-registry.json'])['jurisdictions'] if x['stateCode'] == 'CA')
    counties = parse(inputs['src/data/research/county-equivalent-registry.json'])['countyEquivalents']
    species = next(x for x in parse(inputs['src/data/generated/species.json']) if x['id'] == SPECIES)
    require(species['scientificName'] == NAME and species['category'] == 'wildlife', 'Catalog target mismatch')
    source = next(x for x in parse(inputs['src/data/research/source-registry.json'])['sources'] if x['id'] == 'gbif-ebird')
    require(source['evidenceCapabilities'] == ['recorded-present'] and source['negativeSemantics'] == 'none', 'Source semantics changed')
    search_name = PREFIX + 'public-pilot-20260909/records.json.gz'
    search_raw = files[search_name]
    search = parse(search_raw)
    search_receipt = receipts[PREFIX+'public-pilot-20260909/receipt.json']
    first_receipt = receipts[PREFIX+'public-pilot-verbatim-20260909/receipt.json']
    remaining_receipt = receipts[PREFIX+'public-pilot-verbatim-remaining-20260909/receipt.json']
    for receipt in (search_receipt, first_receipt, remaining_receipt):
        require(receipt['repositoryBaseCommit'] == ACQUISITION, 'Original acquisition identity changed')
    require(search['offset'] == 0 and search['limit'] == 300 and search['endOfRecords'] is True,
            'Search is not a terminal first page')
    require(search['count'] == len(search['results']) == len({x['key'] for x in search['results']}) == 41,
            'Search count or identity mismatch')
    original_responses = first_receipt['responses'] + remaining_receipt['responses']
    require(len(original_responses) == len({x['key'] for x in original_responses}) == 41, 'Original response coverage mismatch')
    require(set(x['key'] for x in original_responses) == set(x['key'] for x in search['results']), 'Original/search identity coverage mismatch')
    require(len(first_receipt['errors']) == 1 and not first_receipt['completed'], 'Initial parser failure was not preserved')
    require(not remaining_receipt['errors'] and remaining_receipt['completed'], 'Original recovery incomplete')
    require('parsed.core' in first_receipt['errors'][0]['message'], 'Unexpected preserved parser failure')
    all_originals = {x['key']: parse(files[x['path']]) for x in original_responses}
    ca_rows = [x for x in search['results'] if x.get('stateProvince') == 'California']
    require(len(ca_rows) == 18, 'CA source count changed')
    require({x['key'] for x in ca_rows} == {k for k, o in all_originals.items() if o.get(DWC+'stateProvince') == 'California'}, 'Original/interpreted CA scope mismatch')
    dataset = parse(files[PREFIX+'taxonomy-discovery-20260909/dataset.json.gz'])
    taxonomy = parse(files[PREFIX+'taxonomy-discovery-20260909/'+SPECIES+'.json.gz'])
    require(dataset['key'] == DATASET and dataset['license'] == LICENSE, 'Dataset/rights mismatch')
    require(taxonomy['canonicalName'] == NAME and taxonomy['usageKey'] == 2479582 and taxonomy['matchType'] == 'EXACT' and taxonomy['status'] == 'ACCEPTED', 'Taxonomy mismatch')
    require(dataset['publishingOrganizationKey'] == 'e2e717bf-551a-4917-bdc9-4fa0f342c530', 'Publisher mismatch')
    tag_concordance = {name: [t for t in dataset['machineTags'] if t['name'] == name] for name in ('status', 'crawl_attempt', 'omitFromScheduledCrawl')}
    require(all(tag_concordance.values()), 'Missing dataset machine tags')
    text, row_spans = search_raw.decode('utf-8'), {}
    decoder = json.JSONDecoder(object_pairs_hook=unique_object)
    for match in re.finditer(r'\{\s*"key"\s*:\s*(\d+)', text):
        obj, stop = decoder.raw_decode(text, match.start())
        if obj.get('datasetKey') == DATASET:
            start_byte = len(text[:match.start()].encode('utf-8'))
            raw = text[match.start():stop].encode('utf-8')
            require(obj['key'] not in row_spans, 'Duplicate raw row span')
            row_spans[obj['key']] = (obj, {'offsetBytes': start_byte, 'lengthBytes': len(raw), 'sha256': sha(raw)})
    require(len(row_spans) == 41, 'Exact interpreted byte-span coverage failed')
    records = []
    for row in sorted(ca_rows, key=lambda x: x['key']):
        key, holds = row['key'], []
        original = all_originals[key]
        response = next(x for x in original_responses if x['key'] == key)
        def check(ok, reason):
            if not ok:
                holds.append(reason)
        check(original['key'] == key and original[GBT+'gbifID'] == str(key) == row['gbifID'], 'gbif-identity-contradiction')
        check(original['datasetKey'] == row['datasetKey'] == DATASET, 'dataset-identity-contradiction')
        check(original['publishingOrgKey'] == row['publishingOrgKey'] == dataset['publishingOrganizationKey'], 'publisher-identity-contradiction')
        catalog = original[DWC+'catalogNumber']
        check(original[DWC+'occurrenceID'] == row['occurrenceID'] == 'URN:catalog:CLO:EBIRD:'+catalog, 'occurrence-identity-contradiction')
        check(original[DC+'identifier'] == row['identifier'] == row['catalogNumber'] == catalog, 'catalog-identity-contradiction')
        check(original[DWC+'scientificName'] == row['species'] == NAME, 'scientific-name-contradiction')
        check(row['taxonKey'] == row['acceptedTaxonKey'] == row['speciesKey'] == 2479582 and row['taxonomicStatus'] == 'ACCEPTED' and row['taxonRank'] == 'SPECIES', 'accepted-taxon-contradiction')
        check(row['acceptedScientificName'] == row['scientificName'] == taxonomy['scientificName'], 'accepted-name-contradiction')
        for classification in row['classifications'].values():
            check(classification['taxonomicStatus'] == 'ACCEPTED' and classification['usage']['genericName'] == 'Brotogeris' and classification['usage']['specificEpithet'] == 'versicolurus', 'secondary-classification-contradiction')
        check(original[DWC+'stateProvince'] == row['stateProvince'] == state['stateName'], 'state-contradiction')
        matches = [c for c in counties if c['status'] == 'active' and c['stateCode'] == 'CA' and original[DWC+'county'] in [c['shortName'], c['legalName'], *c['aliases']]]
        check(len(matches) == 1, 'county-not-unique')
        county = matches[0] if len(matches) == 1 else None
        fips = county['countyFips'] if county else None
        check(fips in ('06037', '06085') and original[DWC+'county'] == row['county'], 'county-contradiction')
        check(original[DWC+'country'] == 'United States' and row['countryCode'] == 'US', 'country-contradiction')
        source_date = dt.date(*(int(original[DWC+k]) for k in ('year', 'month', 'day'))).isoformat()
        check(source_date == row['eventDate'] and source_date.startswith('2024-'), 'event-date-contradiction')
        for field in ('county', 'stateProvince', 'locality', 'recordedBy', 'taxonConceptID', 'occurrenceStatus', 'geodeticDatum'):
            check(original[DWC+field] == row[field], 'original-interpreted-'+field+'-contradiction')
        for field in ('year', 'month', 'day', 'individualCount', 'decimalLatitude', 'decimalLongitude'):
            check(float(original[DWC+field]) == row[field], 'original-interpreted-'+field+'-contradiction')
        check(original[DWC+'basisOfRecord'] == 'HumanObservation' and row['basisOfRecord'] == 'HUMAN_OBSERVATION', 'observation-basis-contradiction')
        check(original[DWC+'occurrenceStatus'] == 'PRESENT' and row['individualCount'] > 0, 'presence-contradiction')
        check(row['license'] == LICENSE, 'license-contradiction')
        check(set(row['issues']) == {'CONTINENT_DERIVED_FROM_COORDINATES', 'TAXON_CONCEPT_ID_NOT_FOUND'}, 'new-quality-flag-requires-review')
        check(row['gadm']['level1']['name'] == row['stateProvince'] and row['gadm']['level2']['name'] == row['county'], 'interpreted-geography-contradiction')
        opaque = {name: original['http://unknown.org/'+name] for name in tag_concordance}
        check(all(row['http://unknown.org/'+name] == value and any(t['value'] == value for t in tag_concordance[name]) for name, value in opaque.items()), 'opaque-tag-concordance-failed')
        check(not any(re.search(r'\b(captive|caged|zoo|aviary|pet bird)\b', str(original.get(DWC+f, '')), re.I) for f in ('locality', 'occurrenceRemarks', 'establishmentMeans')), 'explicit-captive-context-requires-review')
        require(row_spans[key][0] == row, 'Raw interpreted row mismatch')
        missing = [f for f in ('eventDate', 'coordinateUncertaintyInMeters', 'identificationVerificationStatus', 'occurrenceRemarks', 'establishmentMeans', 'degreeOfEstablishment') if DWC+f not in original]
        records.append({'gbifKey': key, 'pair': str(fips)+':'+SPECIES,
            'sourceRecordId': original[DWC+'occurrenceID'], 'recordUrl': 'https://www.gbif.org/occurrence/'+str(key),
            'originalResponse': {**ref(response['path'][len(PREFIX):]), 'rawJsonByteWitness': {'offsetBytes': 0, 'lengthBytes': len(files[response['path']]), 'sha256': sha(files[response['path']])}},
            'interpretedResponse': {**ref('public-pilot-20260909/records.json.gz'), 'jsonPointer': '/results/'+str(search['results'].index(row)), 'rawJsonByteWitness': row_spans[key][1]},
            'originalFields': original, 'interpretedFields': row,
            'fieldAssessment': {'sourceDate': source_date, 'countyRegistryMatch': county,
                'geographyMethod': 'Exact original publisher county alias within exact original publisher state; no coordinate routing.',
                'gadmUse': 'Consistency check only; it is not the county mapping authority.',
                'missingOriginalFields': missing, 'originalLicenseFieldPresent': DC+'license' in original,
                'rightsBasis': 'Matching interpreted and dataset CC-BY-4.0; original verbatim response has no record license field.',
                'quality': 'Exact original binomial and accepted name/key support identity despite an unresolved Avibase taxonConceptID flag. Retain both GBIF issues; neither establishes a misidentification.',
                'wildlifeContext': ('Personal-location text is neutral regarding restraint. At home, Milpitas does not say captive or pet; Cornell allows unrestrained escaped birds. Individual wild/captive/escape status is not supplied.' if 'At home' in row['locality'] else 'Locality is compatible with an outdoor observation. Cornell source policy supports wild living birds; no individual wild/captive/escape status is supplied.'),
                'opaqueFields': opaque, 'individualExpertApprovalEstablished': False,
                'photoRequiredForThisProposal': False, 'uncertaintyRequiredForExplicitCountyMatch': False},
            'disposition': 'hold-for-record-contradiction' if holds else 'supports-recorded-present-proposal',
            'recordHoldReasons': sorted(set(holds)), 'publicationEligible': False,
            'integrationHoldReasons': ['main-source-method-registration-required']})
    require(len({r['sourceRecordId'] for r in records}) == 18, 'Duplicate source record identities')
    require({r['pair'] for r in records} == set(PAIRS), 'Unexpected pair scope')
    groups = {}
    for record in records:
        row = record['interpretedFields']
        key = (record['pair'], row['eventDate'], row['decimalLatitude'], row['decimalLongitude'])
        groups.setdefault(key, []).append(record['gbifKey'])
    clusters = [{'pair': key[0], 'eventDate': key[1], 'coordinates': list(key[2:]), 'gbifKeys': sorted(ids)} for key, ids in sorted(groups.items())]
    pair_results, selected = [], {'06037': 5436343111, '06085': 5435483133}
    for fips in ('06037', '06085'):
        projection_path = 'public/generated/research/CA/counties/'+fips+'.json'
        projection = parse(inputs[projection_path])
        require(not [p for p in projection['pairs'] if p.get('speciesId') == SPECIES], 'Baseline has an explicit target row')
        resolution = projection['pairResolution']
        overrides = [p for p in resolution['applicabilityOverrides'] if p['speciesId'] == SPECIES]
        require(not overrides and resolution['defaultDisplayStatus'] == 'not-researched' and resolution['defaultApplicability'] == 'unknown', 'Sparse baseline changed')
        reviewed = [r for r in records if r['pair'] == fips+':'+SPECIES]
        supported = [r for r in reviewed if not r['recordHoldReasons']]
        require(len(reviewed) == (14 if fips == '06037' else 4), 'Per-pair review count changed')
        chosen = next((r for r in supported if r['gbifKey'] == selected[fips]), None)
        pair_results.append({'pair': fips+':'+SPECIES, 'countyName': projection['countyName'],
            'baseline': {'projection': descriptor(projection_path, inputs[projection_path]), 'asOf': projection['asOf'], 'displayStatus': 'not-researched', 'applicability': 'unknown', 'explicitTargetRows': 0},
            'final': {'displayStatus': 'not-researched', 'applicability': 'unknown', 'canonicalEvidenceEventsAdded': 0, 'determinationsAdded': 0},
            'reviewedRecords': len(reviewed), 'supportingRecords': len(supported), 'recordHolds': len(reviewed)-len(supported),
            'selectedWitnessGbifKey': chosen['gbifKey'] if chosen else None,
            'selectionReason': ('Legg Lake is the latest dated retained Los Angeles observation and explicitly reports two birds; other dated parrot-roost records corroborate historical occurrence. This is a practical representative, not proof of greater identification accuracy.' if fips == '06037' else 'The May 28 Rancho Canada del Oro OSP observation offers an independent date and outdoor locality context beyond the three August 2 personal-location reports. Outdoor status is inferred from the locality label, not independently surveyed.'),
            'proposedClaim': 'recorded-present' if chosen else None, 'scope': 'point-observation-with-explicit-county',
            'candidateDecision': 'supported-subject-to-main-method' if chosen else 'held',
            'integrationHoldReasons': ['main-source-method-registration-required'],
            'materialRecordKeys': [r['gbifKey'] for r in reviewed],
            'sourceScreenComplete': False, 'protocolComplete': False})

    method_specs = [
      ('annual-occurrence-scope', 'method-context-20260909/ebird-downloads.raw.gz', ['The EOD is updated annually', 'sampling event data'],
       'Cornell describes EOD as annually updated basic occurrence data and excludes sampling-event effort metadata. These rows cannot support checklist non-detection, county absence, or protocol completion.', 'source-supported'),
      ('source-quality-process', 'method-context-20260909/ebird-review.raw.gz', ['every record passes through a rigorous evaluation process', 'An unusual or "flagged" observation will not appear publicly'],
       'Cornell describes automated screening for every observation and additional volunteer review of flagged observations. Public EOD inclusion is compatible with that source process; the retained rows do not prove an individual expert decision.', 'source-policy-with-qualified-inference'),
      ('living-unrestrained-birds', 'method-context-20260909/ebird-rules.raw.gz', ['wild, living birds', 'unrestrained bird'],
       'Cornell requests living wild birds, excludes captive records and allows unrestrained birds including suspected escapes. This supports a qualified wild-observation interpretation, but does not individually certify wild origin, establish populations, or make a home locality captive.', 'source-policy-with-qualified-inference'),
      ('crawler-fields', 'method-context-20260909/gbif-machine-tags.raw.gz', ['counter starting at 1', 'periodic crawl'],
       'GBIF TagName identifies crawl_attempt as a dataset crawl counter and omitFromScheduledCrawl as exclusion from periodic crawling. These are dataset operations, not individual occurrence review outcomes.', 'source-supported'),
      ('dataset-rights-and-edition', 'method-context-20260909/dataset-eml.raw.gz', ['Data released annually.', 'CC-BY-4.0'],
       'The retained EML identifies Cornell, annual release, Clements v2024 taxonomy, the 2024 archive and CC-BY-4.0. Retrieval and GBIF reinterpretation in 2026 do not change 2024 observation dates. Carry dataset attribution, DOI, source record identifiers, retrieval date, and license into any future run.', 'source-supported'),
    ]
    conclusions = []
    for ident, short, needles, conclusion, epistemic in method_specs:
        plain, witnesses = plaintext(files[PREFIX+short]), []
        for needle in needles:
            offset = plain.find(needle)
            require(offset >= 0, 'Missing primary text witness: '+needle)
            witnesses.append({'quote': needle, 'normalizedTextCharacterOffset': offset})
        conclusions.append({'id': ident, 'epistemicStatus': epistemic, 'conclusion': conclusion,
            'reference': ref(short), 'textWitnesses': witnesses, 'normalizedTextSha256': sha(plain.encode('utf-8')),
            'normalization': 'Python HTMLParser data nodes excluding script/style, joined with spaces, whitespace collapsed.'})
    conclusions.append({'id': 'opaque-not-reviewed', 'epistemicStatus': 'qualified-inference',
        'conclusion': 'All 18 original and interpreted http://unknown.org/status values equal not_reviewed. Dataset machine tags repeat this value in citizenScience namespaces with 2019, 2022 and 2023 timestamps, predating these 2024 observations. Dataset-annotation propagation is a plausible explanation; the precise transformation was not proven from retained primary documentation. No individual rejection, individual human acceptance, or absence is inferred.',
        'reference': ref('taxonomy-discovery-20260909/dataset.json.gz'), 'exactDatasetTags': tag_concordance})
    supported_count = sum(not r['recordHoldReasons'] for r in records)
    supported_pairs = sum(p['selectedWitnessGbifKey'] is not None for p in pair_results)
    baseline_counts = {'retainedScopedProviderCandidates': 18, 'reviewedOriginalRecords': 0, 'reviewedInterpretedRecords': 0,
        'proposalSupportingRecords': 0, 'proposalRecordHolds': 0, 'proposalSupportedPairs': 0,
        'selectedWitnessRecords': 0, 'proposalPublicationHeldRecords': 0, 'duplicateStableRecords': 0,
        'canonicalAssertionEvents': 0, 'canonicalReviewEvents': 0, 'canonicalRejectionEvents': 0,
        'canonicalOutcomeEvents': 0, 'canonicalEvidenceEvents': 0, 'canonicalRuns': 0,
        'verifiedPresentPairs': 0, 'verifiedAbsentPairs': 0, 'notDetectedPairs': 0,
        'notResearchedPairs': 2, 'newDeterminations': 0, 'sourceRequests': 0, 'sourceScreenCompletedPairs': 0}
    final_counts = {**baseline_counts, 'reviewedOriginalRecords': 18, 'reviewedInterpretedRecords': 18,
        'proposalSupportingRecords': supported_count, 'proposalRecordHolds': 18-supported_count,
        'proposalSupportedPairs': supported_pairs, 'selectedWitnessRecords': supported_pairs,
        'proposalPublicationHeldRecords': 18}
    adapter_review = {'actorId': ACTOR, 'baseSha': BASE, 'status': 'proposal-ready-main-method-required',
        'pairs': [{'pairKey': p['pair'], 'primaryKey': p['selectedWitnessGbifKey'],
            'recordKeys': sorted(p['materialRecordKeys']),
            'heldKeys': sorted(r['gbifKey'] for r in records if r['pair'] == p['pair'] and r['recordHoldReasons']),
            'disposition': 'supported' if p['selectedWitnessGbifKey'] else 'held'} for p in sorted(pair_results, key=lambda x: x['pair'])]}
    return {'schemaVersion': 1, 'kind': 'independent-ebird-eod-original-field-review-proposal',
        'status': 'proposal-ready-main-method-required', 'actorId': ACTOR, 'jobId': JOB,
        'leaseId': 'lease-'+JOB+'-1', 'branch': 'codex/'+JOB, 'baseSha': BASE,
        'expectedReceiptCodeCommit': ACQUISITION, 'actualOccurrenceAcquisitionCodeCommit': ACQUISITION,
        'actualMetadataAcquisitionCodeCommit': receipts[PREFIX+'taxonomy-discovery-20260909/receipt.json']['repositoryBaseCommit'],
        'methodContextAcquisitionCodeIdentity': {'repositoryCommit': None, 'qualification': 'The retained method-context receipt pins recipe bytes but does not declare a repository commit; do not invent one.', 'recipe': receipts[PREFIX+'method-context-20260909/receipt.json']['recipe']},
        'sourceId': 'gbif-ebird', 'datasetKey': DATASET, 'exactPairs': PAIRS, 'adapterReview': adapter_review,
        'registeredSourceAtBase': source, 'sourceMethodRegistrationPending': True,
        'scopeQualification': 'This reviews all 18 records for exactly two leased CA pairs from one terminal 41-row US species/year slice. It does not review the other 23 rows for evidence acceptance or complete a source/category protocol.',
        'authority': {'registeredJobSnapshot': 'C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/ca-r22-job.json',
            'leasePath': 'C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/ca-r22-lease.json',
            'executionContractLocation': 'Registered job executionContract; the frozen lease has generic expectedOutputs.',
            'onlyOutputs': ['src/data/research/worker-results/'+JOB+'/proposal.json', 'src/data/research/worker-results/'+JOB+'/review.py'],
            'noNetwork': True, 'noCanonicalRunOrCompletedManifest': True},
        'inputDescriptors': input_descriptors, 'outerArchiveChecks': outer,
        'embeddedByteChecks': [file_descriptors[k] for k in sorted(file_descriptors)],
        'checkedReceiptDescriptorReferences': checked_refs,
        'sourceParameters': search_receipt['parameters'],
        'sourceSliceCompleteness': {'declaredRows': 41, 'receivedRows': 41, 'uniqueGbifKeys': 41, 'offset': 0,
            'terminalPage': True, 'originalResponses': 41, 'scopeOriginalRows': 18, 'scopeInterpretedRows': 18,
            'qualification': 'All archived bytes were hash-checked; evidence dispositions are bounded to the 18 CA rows.'},
        'originalFailurePreservation': {'firstResponse': ref('public-pilot-verbatim-20260909/5297997915.json.gz'),
            'error': first_receipt['errors'][0], 'firstReceiptCompleted': False,
            'remainingReceiptCompleted': True, 'reacquiredFirstRecord': False,
            'interpretation': 'The initial successful HTTP response survived a wrong core-object parser assumption. A flat full-URI parser reads the same original bytes; there was no failed source response or missing scoped record.'},
        'sourceAttribution': {'title': dataset['title'], 'doi': dataset['doi'], 'publisher': 'Cornell Lab of Ornithology',
            'license': LICENSE, 'citation': dataset['citation'], 'publicationDate': dataset['pubDate'],
            'observationEditionEnd': dataset['temporalCoverages'][0]['end'], 'datasetReference': ref('taxonomy-discovery-20260909/dataset.json.gz')},
        'taxonomyReference': {'sourceMatch': taxonomy, 'reference': ref('taxonomy-discovery-20260909/'+SPECIES+'.json.gz'),
            'catalogIdentity': {k: species[k] for k in ('id', 'scientificName', 'category')},
            'qualification': 'The catalog introduction pathway is not used to infer captive status of any source record.'},
        'primaryMethodConclusions': conclusions, 'records': records, 'pairReviews': pair_results,
        'sameDateCoordinateClusters': clusters,
        'repeatObservationQualification': 'All 18 stable occurrence identifiers differ. Same-date coordinate clusters may share checklists or birds; EOD lacks checklist identifiers here. Do not count them as 18 independent birds or surveys. One representative is selected per pair.',
        'counts': {'baseline': baseline_counts, 'final': final_counts,
            'net': {k: final_counts[k]-baseline_counts[k] for k in baseline_counts}},
        'mainDiagnosticComparison': {'usedForApproval': False, 'analysisCodeExecutedOrImported': False,
            'conclusion': 'Independent source parsing agrees with the stated exact county/taxon/date concordance. The claim of dataset-tag propagation remains qualified because the transformation is not proven. No claim of individual human review, current persistence, or establishment is supported.'},
        'remainingWork': ['MAIN must register, implement, test and independently validate the EOD retained-source method before canonical assertions, reviews or outcomes.',
            'MAIN must reconcile accepted witnesses against current projections at integration time; the two possible pair determinations are conditional, not reported progress.'],
        'semanticAttestation': {'sourceSilenceCreatedNegative': False, 'missingGeographyCreatedDetermination': False,
            'rejectionCreatedNegative': False, 'incompleteScopeMarkedComplete': False, 'humanApprovalClaimed': False,
            'currentPersistenceClaimed': False, 'establishmentClaimed': False, 'coordinateCountyRoutingUsed': False},
        'validationCommands': [
            {'command': 'C:/Code/tools/node-v22.23.2-win-x64/node.exe .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/ca-r22-lease.json --repo C:/Code/project-isitusa-worktrees/'+JOB,
             'result': 'pass-before-edits', 'exitCode': 0, 'verifiedHead': BASE},
            {'command': 'python src/data/research/worker-results/'+JOB+'/review.py --verify', 'purpose': 'Reconstruct all deterministic proposal fields including adapterReview, verify input/embedded/response/row byte hashes, validate saved telemetry and exact serialized proposal bytes.'},
            {'command': 'git -c safe.directory=C:/Code/project-isitusa-worktrees/'+JOB+' diff --check '+BASE+'...HEAD', 'purpose': 'Committed output whitespace check; result reported separately after commit.'}]
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--write', action='store_true')
    action.add_argument('--verify', action='store_true')
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[5])
    args = parser.parse_args()
    started, clock = dt.datetime.now(dt.timezone.utc), time.perf_counter()
    review = build(args.repo.resolve())
    output = Path(__file__).with_name('proposal.json')
    recipe_hash = sha(Path(__file__).read_bytes())
    if args.write:
        telemetry = {'startedAt': started.isoformat(), 'finishedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'elapsedSeconds': round(time.perf_counter()-clock, 6), 'peakProcessMemoryMiB': peak_memory_mib(),
            'scope': 'This measured Python reconstruction process; excludes agent reading and Git operations.',
            'memoryMethod': 'Windows GetProcessMemoryInfo PeakWorkingSetSize, or platform getrusage peak RSS.',
            'manualInterventions': 0, 'sourceRequests': 0,
            'leaseClaimedAt': '2026-09-09T01:51:27.097Z',
            'elapsedSinceLeaseClaimSeconds': round((dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat('2026-09-09T01:51:27.097+00:00')).total_seconds(), 3),
            'leaseElapsedQualification': 'Upper bound on worker review duration; includes any MAIN preparation between lease claim and worker start.'}
        require(telemetry['peakProcessMemoryMiB'] <= 384, 'Lease memory cap exceeded')
        output.write_bytes(canonical({**review, 'recipeSha256': recipe_hash, 'executionTelemetry': telemetry}))
        mode = 'written'
    else:
        saved_bytes = output.read_bytes()
        saved = parse(saved_bytes)
        require(saved.get('recipeSha256') == recipe_hash, 'Recipe changed after proposal generation')
        telemetry = saved['executionTelemetry']
        require(0 < telemetry['peakProcessMemoryMiB'] <= 384 and 0 <= telemetry['elapsedSeconds'] < 1500 and telemetry['sourceRequests'] == 0, 'Saved telemetry invalid')
        require(dt.datetime.fromisoformat(telemetry['finishedAt']) >= dt.datetime.fromisoformat(telemetry['startedAt']), 'Saved timing invalid')
        require(canonical({**review, 'recipeSha256': recipe_hash, 'executionTelemetry': telemetry}) == saved_bytes, 'Proposal does not reproduce exactly')
        mode = 'verified'
    print(json.dumps({'ok': True, 'mode': mode, 'status': review['status'], 'proposal': str(output),
        'proposalSha256': sha(output.read_bytes()), 'proposalBytes': output.stat().st_size,
        'recipeSha256': recipe_hash, 'reviewedRecords': 18,
        'supportingRecords': review['counts']['final']['proposalSupportingRecords'],
        'recordHolds': review['counts']['final']['proposalRecordHolds'],
        'supportedPairs': review['counts']['final']['proposalSupportedPairs'],
        'canonicalEvents': 0, 'newDeterminations': 0,
        'elapsedSeconds': round(time.perf_counter()-clock, 6), 'peakProcessMemoryMiB': peak_memory_mib()}, indent=2))


if __name__ == '__main__':
    main()
