from pathlib import Path
import json,hashlib,datetime
from pypdf import PdfReader
base=Path('.cache/research/campaigns/20260908-r20-epa-nrsa-1819/supplementary-context')
pdf=base/'nrsa1819-field-manual-appendix.pdf';reader=PdfReader(pdf)
rows=[]
for index in [76,77]:
 text=reader.pages[index].extract_text(extraction_mode='layout')
 path=base/f'manual-page-{index+1}.txt';path.write_text(text,encoding='utf-8',newline='\n')
 rows.append({'pdfPageOneBased':index+1,'text':text})
for name in ['Cichlasoma bimaculatum','Oreochromis niloticus','Tilapia mariae']:
 matches=[{'page':r['pdfPageOneBased'],'line':line.strip()} for r in rows for line in r['text'].splitlines() if name in line]
 assert len(matches)==1,(name,matches)
 print(name,matches)
(base/'manual-page-extraction.json').write_text(json.dumps({'schemaVersion':1,'pdfPages':len(reader.pages),'sourceSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'extractedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'extractor':'pypdf layout text extraction','pages':rows},indent=2)+'\n',encoding='utf-8')
try:
 import fitz
 document=fitz.open(pdf)
 for index in [76,77]:document[index].get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(base/f'manual-page-{index+1}.png')
 print('Rendered both original pages with PyMuPDF.')
except ImportError:
 print('PyMuPDF unavailable; use bundled Poppler.')
