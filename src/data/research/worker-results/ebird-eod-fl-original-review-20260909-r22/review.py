#!/usr/bin/env python3
"""Independent, standard-library-only offline EOD review and read-only verification.

Run from any directory: python review.py [--verify]. No network, MAIN imports,
archive extraction, registry writes, canonical events, or projection generation.
The review payload is deterministic; observed execution telemetry is not replayed.
"""
import argparse
import base64
import collections
import ctypes
import datetime as dt
import gzip
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
import time

JOB = 'ebird-eod-fl-original-review-20260909-r22'
ACTOR = 'ebird_eod_fl_review_r22'
BASE = '9469aa3863680cf9950e9acb9db38d60d455f56e'
ACQUISITION = 'd4d860e6b27296e09cada8cfadde35e734668522'
CLAIMED = '2026-09-09T01:51:27.651Z'
EXPIRES = '2026-09-09T02:36:27.097Z'
DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e'
SPECIES = 'brotogeris-versicolurus'
BINOMIAL = 'Brotogeris versicolurus'
DWC = 'http://rs.tdwg.org/dwc/terms/'
PREFIX = '.cache/research/campaigns/20260908-r19-ebird-bulk/'
EVAL = 'ops/national-research/evaluations/'
PILOT = EVAL + 'ebird-eod-original-field-pilot-20260909-r19.json'
META = EVAL + 'ebird-eod-public-metadata-20260909-r19.json'
PILOT_ARCHIVE = EVAL + 'artifacts/ebird-eod-original-field-pilot-20260909-r19.json.gz'
META_ARCHIVE = EVAL + 'artifacts/ebird-eod-public-metadata-20260909-r19.json.gz'
FIPS = ['12086', '12087', '12103']
PAIRS = [c + ':' + SPECIES for c in FIPS]
OUTPUT = 'src/data/research/worker-results/' + JOB
PINS = {
 PILOT: 'fb25f58776a543a24166431c0f8acde68cfc56b0f83514f4c979ae6db30c9f5d',
 META: '9bf3278aa98bce0e16838a8d33267ae6eeac694b3030f11c03daebae723a84f6',
 PILOT_ARCHIVE: 'd9ed8aeeeb0240f6b054a224c0ada8f579552bfbd4f162a6f92d57daf46c203b',
 META_ARCHIVE: '38746673c3e8c6a9f916d34254d5f6e87fe51da30a04a43ee8d898652bd23740',
 'src/data/research/state-registry.json': '6080d7e61bf9a34794a14e9f6976edc378fbb10908dbd40296d3006923ef1f94',
 'src/data/research/county-equivalent-registry.json': '50eede46823aa219ae3b22739224067e1de102fefd336d033bddb01b7f5501ee',
 'src/data/research/source-registry.json': '37539d9b2bc6d47186e69864486e586739e7f140ec549170fe1388d9b9a77e59',
 'src/data/generated/species.json': 'fb82d2c2f0c4ae031569a3bcb472e2e9d8a1a15fac1e7a12a9e7583776df5233',
 'public/generated/research/FL/counties/12086.json': 'bf459a7b48b3edce9522c8d55cefaf4a54959f4c917e7ee5b9e3384acbe4a693',
 'public/generated/research/FL/counties/12087.json': 'f08504719c7147b9078e6e47b8400a9fbabffcf49ef24f3d9887199a8e75030b',
 'public/generated/research/FL/counties/12103.json': '606cc231d66a760b88f5de55f6daf58191ec8994cd4a232400d6acd5070d9b7b'
}
SELECTED = {'12086': 5308062365, '12087': 5480839584, '12103': 5527580017}
SELECTED_REASON = {
 '12086': 'Coral Reef Park is an explicitly named outdoor locality with matching original county and interpreted GADM, a positive count, and no other same-date/same-location row in the retained slice. This avoids selecting a potentially shared checklist event as independent corroboration; it is not a confidence score.',
 '12087': 'The 2024-10-30 Card Sound Golf Club record has explicit original county, matching GADM, a positive count, and a named outdoor locality; it is the latest retained county record outside the same-date/same-location multi-observer group.',
 '12103': 'The sole retained county record reports St. Pete Beach, explicit Pinellas/Florida, matching interpreted GADM, exact species, and positive human observation. Single-record support remains a caveat.'
}

def digest(b):
 return hashlib.sha256(b).hexdigest()

def encoded(j):
 return (json.dumps(j, ensure_ascii=True, sort_keys=True, indent=2) + '\n').encode('utf-8')

def check(ok, message):
 if not ok:
  raise ValueError(message)

def peak_memory():
 if os.name == 'nt':
  class Counters(ctypes.Structure):
   _fields_ = [('cb', ctypes.c_ulong), ('PageFaultCount', ctypes.c_ulong)] + [(x, ctypes.c_size_t) for x in ['PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage']]
  c = Counters(); c.cb = ctypes.sizeof(c)
  kernel = ctypes.WinDLL('kernel32', use_last_error=True)
  kernel.GetCurrentProcess.restype = ctypes.c_void_p
  api = ctypes.WinDLL('psapi', use_last_error=True)
  api.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
  check(api.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(c), c.cb), 'GetProcessMemoryInfo failed')
  return {'peakWorkingSetBytes': c.PeakWorkingSetSize, 'measurement': 'Windows GetProcessMemoryInfo PeakWorkingSetSize for this independent Python process'}
 import resource
 size = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
 return {'peakWorkingSetBytes': size if sys.platform == 'darwin' else size * 1024, 'measurement': 'getrusage RUSAGE_SELF ru_maxrss for this independent Python process'}

def rebuild(root):
 inputs = []
 for path, pin in PINS.items():
  b = (root / path).read_bytes()
  check(digest(b) == pin, 'Pinned input mismatch: ' + path)
  inputs.append({'path': path, 'bytes': len(b), 'sha256': pin})
 def local(path):
  return json.loads((root / path).read_bytes())
 files = {}; descriptors = {}; archive_checks = []
 for path in [PILOT_ARCHIVE, META_ARCHIVE]:
  outer = (root / path).read_bytes(); unpacked = gzip.decompress(outer)
  members = json.loads(unpacked)['files']
  archive_checks.append({'path': path, 'sha256': digest(outer), 'bytes': len(outer), 'decodedSha256': digest(unpacked), 'decodedBytes': len(unpacked), 'embeddedFilesVerified': len(members)})
  for index, f in enumerate(members):
   check(f['encoding'] == 'base64', 'Unexpected member encoding')
   b = base64.b64decode(f['contents'], validate=True)
   check(len(b) == f['bytes'] and digest(b) == f['sha256'], 'Embedded byte mismatch: ' + f['originalPath'])
   check(f['originalPath'] not in files, 'Duplicate archive member')
   raw = gzip.decompress(b) if f['originalPath'].endswith('.gz') else b
   files[f['originalPath']] = raw
   descriptors[f['originalPath']] = {'archivePath': path, 'archiveSha256': digest(outer), 'memberIndex': index, 'originalPath': f['originalPath'], 'bytes': len(b), 'sha256': digest(b), 'decodedBytes': len(raw), 'decodedSha256': digest(raw)}
 check(len(files) == 90, 'Expected exactly 90 retained files')
 def obj(path):
  return json.loads(files[PREFIX + path])
 receipts = {}; responses = {}; receipt_checks = []
 for path, raw in files.items():
  if path.endswith('/receipt.json'):
   receipt = json.loads(raw); receipts[path] = receipt
   n = 0
   for response in receipt.get('responses', receipt.get('receipts', [])):
    desc = descriptors[response['path']]
    for field in ['bytes', 'sha256', 'decodedBytes', 'decodedSha256']:
     if field in response:
      check(response[field] == desc[field], 'Receipt response byte mismatch: ' + response['path'] + ':' + field)
    check(response['status'] == 200, 'Non-success retained response')
    responses[response['path']] = response; n += 1
   if receipt.get('repositoryBaseCommit'):
    expected_code = 'd77df0449785d9c9786e64e177aeeaf0d3a8019f' if ('/taxonomy-discovery-' in path or '/count-calibration-' in path) else ACQUISITION
    check(receipt['repositoryBaseCommit'] == expected_code, 'Retained acquisition code lineage mismatch')
   for field in ['parentReceipt', 'priorTaxonomyReceipt']:
    link = receipt.get(field)
    if link:
     check(digest(files[link['path']]) == link['sha256'], 'Receipt parent lineage mismatch')
   recipe = receipt.get('recipe')
   if recipe:
    check(digest(files[recipe['path']]) == recipe['sha256'], 'Recipe hash mismatch')
   receipt_checks.append({'path': path, 'sha256': digest(raw), 'responsesVerified': n, 'repositoryBaseCommit': receipt.get('repositoryBaseCommit'), 'errorsPreserved': receipt.get('errors', [])})
 def witness(path):
  full = path if path.startswith(PREFIX) else PREFIX + path
  result = dict(descriptors[full])
  if full in responses:
   r = responses[full]
   result.update({'sourceUrl': r['url'], 'retrievedAt': r['retrievedAt'], 'httpStatus': r['status']})
  return result
 search_receipt = obj('public-pilot-20260909/receipt.json')
 search_path = PREFIX + 'public-pilot-20260909/records.json.gz'
 search_raw = files[search_path]; search = json.loads(search_raw)
 check(search['offset'] == 0 and search['endOfRecords'] is True and search['count'] == len(search['results']) == 41, 'Incomplete search page')
 check(search_receipt['parameters'] == {'datasetKey': DATASET, 'country': 'US', 'year': '2024', 'taxonKey': '2479582', 'offset': '0', 'limit': '300'}, 'Search parameters changed')
 check(search_receipt['repositoryBaseCommit'] == ACQUISITION, 'Acquisition lineage mismatch')
 # Parse each raw JSON row independently and preserve exact source byte spans.
 text = search_raw.decode('utf-8'); decoder = json.JSONDecoder()
 at = re.search(r'"results"\s*:\s*\[', text).end(); row_spans = []
 for r in search['results']:
  while text[at] in ' \r\n\t,': at += 1
  parsed, end = decoder.raw_decode(text, at)
  check(parsed == r, 'Raw row extraction mismatch')
  start_byte = len(text[:at].encode('utf-8')); end_byte = len(text[:end].encode('utf-8'))
  row_spans.append({'startByte': start_byte, 'endByteExclusive': end_byte, 'sha256': digest(search_raw[start_byte:end_byte])})
  at = end
 check(len({r['key'] for r in search['results']}) == 41, 'Duplicate search key')
 counties = local('src/data/research/county-equivalent-registry.json')['countyEquivalents']
 jurisdictions = local('src/data/research/state-registry.json')['jurisdictions']
 check(len([s for s in jurisdictions if s.get('stateCode') == 'FL' or s.get('code') == 'FL']) == 1, 'Florida registry identity missing')
 catalog = [s for s in local('src/data/generated/species.json') if s['id'] == SPECIES]
 check(len(catalog) == 1 and catalog[0]['scientificName'] == BINOMIAL and catalog[0]['category'] == 'wildlife', 'Catalog identity mismatch')
 source_registry = local('src/data/research/source-registry.json')
 source_rows = source_registry if isinstance(source_registry, list) else next(v for v in source_registry.values() if isinstance(v, list))
 source = next(s for s in source_rows if s['id'] == 'gbif-ebird')
 check('researchAdapter' not in source, 'Source registration changed; this proposal must be reviewed again')
 dataset = obj('taxonomy-discovery-20260909/dataset.json.gz')
 taxon = obj('taxonomy-discovery-20260909/brotogeris-versicolurus.json.gz')
 check(dataset['key'] == DATASET and taxon['canonicalName'] == BINOMIAL and taxon['usageKey'] == 2479582 and taxon['matchType'] == 'EXACT' and taxon['confidence'] == 100, 'Metadata/taxonomy mismatch')
 metadata_tags = dataset['machineTags']
 rows = []
 for i, r in enumerate(search['results']):
  if r.get('stateProvince') != 'Florida': continue
  candidates = [p for p in files if p.endswith('/' + str(r['key']) + '.json.gz')]
  check(len(candidates) == 1, 'Missing or repeated original response')
  vp = candidates[0]; raw = files[vp]; v = json.loads(raw)
  def field(k): return v.get(DWC + k)
  matches = [c for c in counties if c['status'] == 'active' and c['stateName'] == field('stateProvince') and field('county') in c['aliases']]
  check(len(matches) == 1 and matches[0]['countyFips'] in FIPS, 'Outside leased pair or ambiguous original geography')
  county = matches[0]; holds = []
  def gate(ok, code):
   if not ok: holds.append(code)
  gate(v['key'] == r['key'] and str(v['key']) == v['http://rs.gbif.org/terms/1.0/gbifID'] == r['gbifID'], 'gbif-key-contradiction')
  gate(v['datasetKey'] == r['datasetKey'] == DATASET and v['publishingOrgKey'] == r['publishingOrgKey'] == dataset['publishingOrganizationKey'], 'dataset-publisher-contradiction')
  gate(field('scientificName') == r['species'] == BINOMIAL and field('genus') == r['genus'] == 'Brotogeris' and field('specificEpithet') == 'versicolurus', 'taxon-contradiction')
  for classification in r['classifications'].values():
   accepted = classification['acceptedUsage']
   gate(classification['taxonomicStatus'] == 'ACCEPTED' and accepted['genericName'] == 'Brotogeris' and accepted['specificEpithet'] == 'versicolurus', 'classification-taxon-contradiction')
  gate(r['acceptedScientificName'].startswith(BINOMIAL + ' (') and r['speciesKey'] == r['taxonKey'] == r['acceptedTaxonKey'] == 2479582 and r['taxonomicStatus'] == 'ACCEPTED', 'accepted-taxon-contradiction')
  gate(field('country') == 'United States' and r['countryCode'] == 'US' and field('stateProvince') == r['stateProvince'] == 'Florida' and field('county') == r['county'], 'publisher-geography-contradiction')
  gadm = r.get('gadm', {})
  gate(not gadm.get('level1') or gadm['level1']['name'] == 'Florida', 'interpreted-state-contradiction')
  gate(not gadm.get('level2') or gadm['level2']['name'] in county['aliases'], 'interpreted-county-contradiction')
  day = dt.date(int(field('year')), int(field('month')), int(field('day')))
  gate(day.year == 2024 and day.isoformat() == r['eventDate'], 'event-date-contradiction')
  gate(field('basisOfRecord') == 'HumanObservation' and r['basisOfRecord'] == 'HUMAN_OBSERVATION' and field('occurrenceStatus') == r['occurrenceStatus'] == 'PRESENT', 'not-positive-human-observation')
  gate(int(field('individualCount')) == r['individualCount'] and r['individualCount'] > 0, 'nonpositive-or-disagreeing-count')
  gate(field('occurrenceID') == r['occurrenceID'] == 'URN:catalog:CLO:EBIRD:' + field('catalogNumber') and field('catalogNumber') == r['catalogNumber'] == r['identifier'] == v['http://purl.org/dc/terms/identifier'], 'source-identity-contradiction')
  gate(field('collectionCode') == r['collectionCode'] == 'EBIRD' and field('institutionCode') == r['institutionCode'] == 'CLO', 'institution-contradiction')
  gate(r['license'] == dataset['license'] == 'http://creativecommons.org/licenses/by/4.0/legalcode', 'rights-contradiction')
  gate(set(r['issues']) <= {'CONTINENT_DERIVED_FROM_COORDINATES', 'TAXON_CONCEPT_ID_NOT_FOUND'}, 'unreviewed-quality-issue')
  gate(field('locality') == r['locality'] and field('recordedBy') == r['recordedBy'], 'locality-observer-contradiction')
  for k in ['decimalLatitude', 'decimalLongitude']:
   gate(float(field(k)) == r[k], 'coordinate-interpretation-contradiction')
  contexts = {k: r.get(k) for k in ['establishmentMeans', 'degreeOfEstablishment', 'occurrenceRemarks', 'identificationRemarks', 'coordinateUncertaintyInMeters']}
  gate(not any(contexts[k] for k in ['establishmentMeans', 'degreeOfEstablishment', 'occurrenceRemarks', 'identificationRemarks']), 'new-context-requires-manual-review')
  gate(not re.search(r'\b(captive|caged|aviary|zoo|dead)\b', r['locality'], re.I), 'concrete-captive-or-dead-context')
  tag_matches = {}
  for k in ['status', 'crawl_attempt', 'omitFromScheduledCrawl']:
   value = v['http://unknown.org/' + k]
   found = [t for t in metadata_tags if t['name'] == k and t['value'] == value]
   gate(r['http://unknown.org/' + k] == value and len(found) > 0, 'opaque-tag-disagreement')
   tag_matches[k] = found
  field_witnesses = []
  vt = raw.decode('utf-8')
  for k, value in v.items():
   if not k.startswith('http'): continue
   match = re.search(re.escape(json.dumps(k)) + r'\s*:\s*', vt)
   check(match is not None, 'Missing original field bytes')
   parsed, end = decoder.raw_decode(vt, match.end())
   check(parsed == value, 'Original field parsing disagreement')
   start_byte = len(vt[:match.start()].encode('utf-8')); end_byte = len(vt[:end].encode('utf-8'))
   field_witnesses.append({'field': k, 'value': value, 'startByte': start_byte, 'endByteExclusive': end_byte, 'sha256': digest(raw[start_byte:end_byte])})
  rows.append({'pair': county['countyFips'] + ':' + SPECIES, 'gbifKey': r['key'], 'sourceRecordId': r['occurrenceID'], 'sourceRecordUrl': 'https://www.gbif.org/occurrence/' + str(r['key']), 'sourceRecordDate': day.isoformat(), 'originalResponse': witness(vp), 'originalRecord': v, 'originalFieldWitnesses': field_witnesses, 'interpretedResponse': witness(search_path), 'interpretedRowIndex': i, 'interpretedRowBytes': row_spans[i], 'interpretedRecord': r, 'countyRegistryWitness': county, 'opaqueTagMatches': tag_matches, 'disposition': 'hold' if holds else 'supports-recorded-present-proposal', 'recordSpecificHoldReasons': holds, 'canonicalPublicationHoldReasons': ['main-source-method-registration-required'], 'contextFields': contexts, 'wildlifeAssessment': 'Consistent with the retained eBird wild-living-bird reporting rules and positive HumanObservation. The row lacks an explicit wild/captive field; escaped/free-flying origin and establishment are not resolved. Locality text alone is not captivity evidence.', 'qualityAssessment': 'Retain TAXON_CONCEPT_ID_NOT_FOUND: the Avibase concept identifier is unresolved by GBIF, while original canonical name and both accepted classifications agree at species. CONTINENT_DERIVED_FROM_COORDINATES is not the county mapping method. Missing uncertainty/media/GADM does not negate explicit unambiguous original county.', 'claimLimit': 'Historical recorded occurrence only; no countywide abundance, current persistence, establishment, invasive impact, complete-checklist negative or absence.'})
 check(len(rows) == 23 and len({r['sourceRecordId'] for r in rows}) == 23, 'Leased record coverage/identity count mismatch')
 grouped = collections.defaultdict(list)
 for r in rows:
  x = r['interpretedRecord']
  grouped[(r['pair'], x['eventDate'], x['decimalLatitude'], x['decimalLongitude'], x['individualCount'])].append(r['gbifKey'])
 repeated = [{'pair': k[0], 'eventDate': k[1], 'latitude': k[2], 'longitude': k[3], 'individualCount': k[4], 'recordKeys': sorted(v), 'interpretation': 'Possible shared observation/checklist event; distinct source IDs are retained, but statistical independence and distinct birds are not established.'} for k,v in grouped.items() if len(v) > 1]
 for row in rows:
  row['possibleSharedEventRecordKeys'] = next((g['recordKeys'] for g in repeated if row['gbifKey'] in g['recordKeys']), [])
 # The following short snippets are independently located in retained primary bytes.
 reference_specs = [
  ('dataset', 'taxonomy-discovery-20260909/dataset.json.gz', 'not_reviewed'),
  ('taxon', 'taxonomy-discovery-20260909/brotogeris-versicolurus.json.gz', 'Brotogeris versicolurus'),
  ('eml', 'method-context-20260909/dataset-eml.raw.gz', 'CC-BY'),
  ('review', 'method-context-20260909/ebird-review.raw.gz', 'Unconfirmed'),
  ('rules', 'method-context-20260909/ebird-rules.raw.gz', 'wild, living birds'),
  ('downloads', 'method-context-20260909/ebird-downloads.raw.gz', 'The EOD contains basic occurrence data'),
  ('crawler', 'method-context-20260909/gbif-machine-tags.raw.gz', 'CRAWL_ATTEMPT')
 ]
 refs = []
 for rid, path, needle in reference_specs:
  b = files[PREFIX + path]; token = needle.encode(); pos = b.find(token)
  check(pos >= 0, 'Primary reference token missing: ' + rid)
  refs.append({'id': rid, **witness(path), 'exactShortExcerpt': needle, 'startByte': pos, 'endByteExclusive': pos + len(token), 'excerptSha256': digest(token)})
 conclusions = [
  {'id':'source-identity-rights', 'classification':'source-supported-facts', 'references':['dataset','eml'], 'conclusion':'Cornell Lab of Ornithology publishes the retained annual EOD via GBIF under CC-BY 4.0, with a 2024-12-31 data horizon, 2025-08-08 publication date, and DOI 10.15468/aomfnb. Preserve source attribution, DOI, observation IDs and dates, the license link and derivative-review provenance. Original verbatim rows contain no individual license field; interpreted licenses agree with the dataset. EML disclaims accuracy warranty.'},
  {'id':'quality-process', 'classification':'source-supported-method-with-qualified-row-inference', 'references':['review','rules'], 'conclusion':'Cornell describes automated species/count/location/date filters and further review of flagged records; Unconfirmed observations remain private. Public positive EOD records are consistent with this process, but the retained EOD fields do not expose the individual review decision or prove that a human expert reviewed each row. The proposal actor claims agent review only.'},
  {'id':'opaque-status', 'classification':'qualified-inference', 'references':['dataset','review','crawler'], 'conclusion':'Every leased original and interpreted row carries unknown.org/status=not_reviewed, crawl_attempt=24 and omitFromScheduledCrawl=true. Identical values occur in retained dataset machineTags. CitizenScience status tags predate these 2024 observations (2019, 2022, 2023); crawler documentation explicitly concerns dataset processing. Metadata propagation is the best-supported inference, not a proved export transformation. These tags do not establish individual rejection, individual approval, or captivity; keep namespaces, times and uncertainty visible.'},
  {'id':'crawler-fields', 'classification':'source-supported-facts', 'references':['dataset','crawler'], 'conclusion':'GBIF defines crawl_attempt as dataset crawl-attempt accounting, including failed attempts, and omitFromScheduledCrawl as exclusion from periodic dataset crawling. These are acquisition/freshness metadata, not animal-review decisions. The row crawlId and lastCrawled agree with retained dataset tag values and timestamp.'},
  {'id':'wildlife-context', 'classification':'qualified-inference', 'references':['rules'], 'conclusion':'Cornell requests observations of wild living birds, excludes captive/dead birds, and allows unrestrained birds including suspected escapes. All leased rows are positive human observations without concrete captive/dead context. Parks, streets, hotel grounds, golf clubs, arboretum and private-property localities do not establish captivity. Row-level wild/captive and establishment fields are absent; infer only historical recorded occurrence consistent with program rules.'},
  {'id':'geography-taxonomy', 'classification':'independent-record-review', 'references':['taxon'], 'conclusion':'All leased original binomials and accepted interpreted names agree with the pinned wildlife catalog. Original Florida county aliases resolve uniquely to active 12086, 12087 or 12103 registry entries. Coordinates are retained but never used to assign a county. One row has empty GADM; every populated GADM state/county agrees. The registry is the current 2025 reference topology; no relevant predecessor/successor county conflict is recorded. Missing coordinate uncertainty and unresolved Avibase concept key are caveats, with no observed identity/geography contradiction.'},
  {'id':'scope-and-negatives', 'classification':'source-supported-facts', 'references':['downloads','eml'], 'conclusion':'EOD provides species/date/location occurrences and omits sampling-event effort metadata. A terminal 41-record API response completes that fixed US/2024/species search snapshot only. This worker reviews its 23 Florida rows, not all eBird observations, all years, or a county protocol. No absence, non-detection, establishment or current persistence can be derived.'}
 ]
 pair_reviews = []
 for county in FIPS:
  pair = county + ':' + SPECIES; material = [r for r in rows if r['pair'] == pair]
  projection_path = 'public/generated/research/FL/counties/' + county + '.json'; projection = local(projection_path)
  check(not [p for p in projection['pairs'] if p.get('speciesId') == SPECIES], 'Target unexpectedly explicit in baseline')
  check(projection['pairResolution']['defaultDisplayStatus'] == 'not-researched', 'Sparse baseline changed')
  selected = next(r for r in material if r['gbifKey'] == SELECTED[county])
  pair_reviews.append({'pair':pair, 'countyFips':county, 'countyName':material[0]['countyRegistryWitness']['shortName'], 'materialRecordsReviewed':len(material), 'supportingRecords':sum(not r['recordSpecificHoldReasons'] for r in material), 'recordSpecificHolds':sum(bool(r['recordSpecificHoldReasons']) for r in material), 'selectedStrongestWitnessKey': selected['gbifKey'] if not selected['recordSpecificHoldReasons'] else None, 'selectionReason':SELECTED_REASON[county], 'selectedWitness':selected['originalResponse'], 'dateRange':[min(r['sourceRecordDate'] for r in material),max(r['sourceRecordDate'] for r in material)], 'reviewCompleteForLeasedRetainedRows':True, 'canonicalSourceScreenComplete':False, 'publicationHeld':True, 'holdReasons':['main-source-method-registration-required'], 'baseline':{'projectionPath':projection_path,'projectionSha256':PINS[projection_path], 'displayStatus':'not-researched','resolution':'catalog member absent from explicit pairs, use pinned sparse default'}, 'finalCanonicalDisplayStatus':'not-researched', 'netCanonicalDeterminations':0})
 positive = sum(not r['recordSpecificHoldReasons'] for r in rows)
 counters = {'sourceRequests':0,'canonicalRuns':0,'assertionEvents':0,'reviewEvents':0,'rejectionEvents':0,'outcomeEvents':0,'canonicalDeterminations':0,'verifiedAbsent':0,'notDetected':0,'canonicalResearchCompletedPairs':0,'reviewedMaterialRecords':23,'supportingProposalRecords':positive,'recordSpecificHolds':23-positive,'reviewedPairs':3,'supportingProposalPairs':sum(p['supportingRecords']>0 for p in pair_reviews),'selectedWitnesses':sum(p['selectedStrongestWitnessKey'] is not None for p in pair_reviews),'methodHeldPairs':3,'methodHeldRecords':23,'duplicateSourceIds':0,'possibleSharedEventGroups':len(repeated)}
 baseline = {k:0 for k in counters}
 preflight = 'C:/Code/tools/node-v22.23.2-win-x64/node.exe .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs preflight --lease C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/fl-r22-lease.json --repo C:/Code/project-isitusa-worktrees/' + JOB
 return {'schemaVersion':1, 'kind':'independent-ebird-eod-original-field-review-proposal', 'status':'proposal-ready-main-method-required', 'actorId':ACTOR, 'actorType':'agent', 'jobId':JOB, 'leaseId':'lease-'+JOB+'-1', 'branch':'codex/'+JOB, 'worktree':'C:/Code/project-isitusa-worktrees/'+JOB, 'baseSha':BASE, 'actualAcquisitionCodeCommit':ACQUISITION, 'metadataAcquisitionCodeCommit':'d77df0449785d9c9786e64e177aeeaf0d3a8019f', 'methodContextCodeCommit':None, 'methodContextRecipeSha256':'d41cbf7c816cdaaebf55114703ea344d1b9489ebbd6e0655fc95aa940b3ab12b', 'methodContextCodeQualification':'The retained method-context receipt pins recipe bytes but does not declare a repository commit; no commit is inferred.', 'acquisitionLineageExplanation':'Search and both original-response receipts independently retain d4d860e6b27296e09cada8cfadde35e734668522. The newer review base does not replace acquisition identity.', 'skillPins':[{'name':'isitusa-national-orchestrator','version':'frozen-windows-bulk-validation-2026-07-30-r2','contentHash':'9f934116bc4f1ad80b3b61d805f4ad4c0070773ed3040c28e96098c74d888757'},{'name':'isitusa-evidence-worker','version':'frozen-windows-bulk-validation-2026-07-30-r2','contentHash':'52f13ef7e2574a6428701c0fcc9d0512e313fe639adf826888490ce5a38a6b8b'}], 'sourceId':'gbif-ebird', 'stateCode':'FL', 'exactPairs':PAIRS, 'sourceMethodRegistrationPending':True, 'contractAuthority':{'jobPath':'C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/fl-r22-job.json','jobSha256':'e30a5743cd53dc205667c551872ad9784cc430759de4f984a1c1ed11b90d5232','leasePath':'C:/Code/project-isitusa/.cache/research/campaigns/20260908-r19-ebird-bulk/fl-r22-lease.json','leaseSha256':'ab94a35b9a5b55b84947ec5736f2ebf58f064331a50d1a132fb1e38ceba790dd','explanation':'Registered job executionContract explicitly restricts this to proposal.json and review.py. Generic frozen evidence-run expectedOutputs do not justify a fabricated completion manifest.'}, 'inputPins':inputs, 'archiveVerification':archive_checks, 'embeddedFileWitnesses':[descriptors[p] for p in sorted(descriptors)], 'receiptChecks':sorted(receipt_checks,key=lambda r:r['path']), 'parameters':search_receipt['parameters'], 'searchResponse':witness(search_path), 'searchSnapshot':{'count':41,'uniqueKeys':41,'offset':0,'endOfRecords':True,'leasedFloridaRows':23,'outOfLeaseRowsNotSubstantivelyReviewed':18}, 'sourceRegistryEntry':source, 'catalogIdentity':{'id':SPECIES,'scientificName':BINOMIAL,'category':'wildlife'}, 'datasetMetadata':{'key':dataset['key'],'title':dataset['title'],'doi':dataset['doi'],'publishingOrganizationKey':dataset['publishingOrganizationKey'],'pubDate':dataset['pubDate'],'temporalCoverages':dataset['temporalCoverages'],'license':dataset['license'],'citation':dataset['citation'],'machineTags':metadata_tags}, 'primaryReferences':refs, 'methodConclusions':conclusions, 'pairReviews':pair_reviews, 'recordReviews':sorted(rows,key=lambda r:(r['pair'],r['gbifKey'])), 'possibleSharedEvents':repeated, 'counts':{'baseline':baseline,'final':counters,'net':{k:counters[k]-baseline[k] for k in counters}}, 'mainDiagnosticAssessment':{'usedAsApproval':False,'analysisCodeImported':False,'guidanceConflicts':'docs/research/README.md retains retired Mac checkout and older frozen-skill references; current AGENTS.md, assigned lease and passing frozen preflight govern this isolated worker. Unavailable sparse orchestration/reference files were not populated or mutated; the exact registered job/lease contract was supplied read-only by MAIN.', 'assessment':'Independent provider-byte checks agree with the pilot summary on exact names, dates, counties and record totals. Additional qualification: 3 same-date/location/count groups may share observations, so distinct record IDs do not imply independent sightings or additive birds. Dataset tag inheritance and wild context are qualified inferences; individual expert approval is not asserted.'}, 'validationCommands':[{'command':preflight,'exitCode':0,'result':'pass before any worker edit at pinned base'}, {'command':'python '+OUTPUT+'/review.py --verify','result':'required read-only deterministic-payload and immutable-byte verification'}, {'command':'git -c safe.directory=C:/Code/project-isitusa-worktrees/'+JOB+' diff --check '+BASE+'...HEAD','result':'required after scoped commit'}], 'validationDevelopmentNote':'An initial strengthened verifier incorrectly expected metadata receipt code identity to equal the later occurrence acquisition identity. Offline inspection showed metadata/count acquisition at d77df0449785d9c9786e64e177aeeaf0d3a8019f; the final verifier pins and preserves both actual identities. This was a local verifier assertion, not a provider error.', 'remainingWork':['MAIN must register and test the retained-EOD source method and publication gate before canonical events.','MAIN must independently validate and integrate the proposal; this worker creates no run, completed manifest, projection or determination.'], 'semanticAttestation':{'sourceSilenceCreatedNegative':False,'failedRequestCreatedNegative':False,'rejectionCreatedNegative':False,'missingGeographyCreatedDetermination':False,'incompleteScopeMarkedComplete':False,'humanReviewClaimed':False,'coordinatesUsedForCountyAssignment':False,'networkRequestsMade':0}}

def adapter_projection(review):
 pairs = []
 for pair in sorted(review['pairReviews'], key=lambda x: x['pair']):
  records = [r for r in review['recordReviews'] if r['pair'] == pair['pair']]
  held = sorted(r['gbifKey'] for r in records if r['recordSpecificHoldReasons'])
  supported = pair['supportingRecords'] > 0
  pairs.append({'pairKey':pair['pair'], 'primaryKey':pair['selectedStrongestWitnessKey'] if supported else None, 'recordKeys':sorted(r['gbifKey'] for r in records), 'heldKeys':held, 'disposition':'supported' if supported else 'held'})
 return {'actorId':ACTOR, 'baseSha':BASE, 'status':'proposal-ready-main-method-required', 'pairs':pairs}


def main():
 parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--verify', action='store_true'); args = parser.parse_args()
 started = time.perf_counter(); here = Path(__file__).resolve(); root = here.parents[5]
 check(here.parent == root / OUTPUT, 'Recipe is outside exact permitted output root')
 review = rebuild(root); payload_hash = digest(encoded(review)); target = here.with_name('proposal.json')
 if args.verify:
  saved = json.loads(target.read_bytes())
  check(saved['review'] == review and saved['reviewPayloadSha256'] == payload_hash, 'Proposal fails independent deterministic replay')
  check(saved['adapterReview'] == adapter_projection(review), 'Adapter review projection fails independent deterministic replay')
  check(saved['recipe']['sha256'] == digest(here.read_bytes()) and saved['recipe']['path'] == OUTPUT + '/review.py', 'Recipe provenance mismatch')
  check(saved['performance']['peakWorkingSetBytes'] > 0 and saved['performance']['elapsedRecipeSeconds'] >= 0, 'Invalid historical telemetry')
  check(saved['performance']['peakWorkingSetBytes'] < 384 * 1024 * 1024, 'Memory budget exceeded')
  action = 'verified'
 else:
  now = dt.datetime.now(dt.timezone.utc)
  check(now < dt.datetime.fromisoformat(EXPIRES.replace('Z','+00:00')), 'Lease expired; no writes allowed')
  performance = {**peak_memory(), 'elapsedRecipeSeconds':round(time.perf_counter()-started,6), 'elapsedSinceLeaseClaimSeconds':round((now-dt.datetime.fromisoformat(CLAIMED.replace('Z','+00:00'))).total_seconds(),3), 'leaseClaimedAt':CLAIMED, 'observedAt':now.isoformat(), 'scope':'Measured recipe process; elapsedSinceLeaseClaimSeconds includes dispatch and interactive review. Historical telemetry is validated but not expected to reproduce exactly.'}
  result = {'adapterReview':adapter_projection(review), 'review':review, 'reviewPayloadSha256':payload_hash, 'recipe':{'path':OUTPUT+'/review.py','sha256':digest(here.read_bytes())}, 'performance':performance}
  content = encoded(result); check(len(content) < 8388608, 'Artifact budget exceeded')
  target.write_bytes(content); action = 'generated'
 print(json.dumps({'status':action,'proposalSha256':digest(target.read_bytes()),'reviewPayloadSha256':payload_hash,'counts':review['counts']['final'],'verificationElapsedSeconds':round(time.perf_counter()-started,6),**peak_memory()},sort_keys=True))

if __name__ == '__main__':
 main()
