import json, re, urllib.request, urllib.parse
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from xml.etree.ElementTree import Element, SubElement, ElementTree

SHEET_ID = '1gX73WskIs3D-8IcyPJ24NT0xn1KIEJSjMXOF9nCQqTg'
SHEET_NAME = 'Bangla News'
BASE_URL = 'https://abdurrazzak123.github.io/banglanews.2026/'
OUT = 'news-sitemap.xml'

url = (
    f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?'
    f'tqx=out:json&sheet={urllib.parse.quote(SHEET_NAME)}&tq=' + urllib.parse.quote('select *')
)
with urllib.request.urlopen(url, timeout=30) as r:
    text = r.read().decode('utf-8')

m = re.search(r'google\.visualization\.Query\.setResponse\((.*)\);?\s*$', text, re.S)
if not m:
    raise RuntimeError('Could not parse Google Sheet response')
data = json.loads(m.group(1))
rows = data.get('table', {}).get('rows', [])

TZ = ZoneInfo('Asia/Dhaka')
now = datetime.now(TZ)
cutoff = now - timedelta(days=2)

def cell(row, idx):
    c = row.get('c', [])
    if idx >= len(c) or c[idx] is None:
        return ''
    return str(c[idx].get('v', '') or '').strip()

def parse_date(value):
    if not value:
        return None
    # Google Visualization often returns Date(2026,8,2[,hour,minute,second])
    md = re.fullmatch(r'Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)', value)
    if md:
        y, mo, d = map(int, md.group(1,2,3))
        hh = int(md.group(4) or 0); mm = int(md.group(5) or 0); ss = int(md.group(6) or 0)
        return datetime(y, mo+1, d, hh, mm, ss, tzinfo=TZ)
    for fmt in ('%Y-%m-%dT%H:%M:%S%z','%Y-%m-%d %H:%M:%S','%Y-%m-%d','%m/%d/%Y %H:%M:%S','%m/%d/%Y'):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.replace(tzinfo=TZ) if dt.tzinfo is None else dt.astimezone(TZ)
        except ValueError:
            pass
    return None

items = []
for row in rows:
    article_id = cell(row, 0)
    title = cell(row, 2)
    date_raw = cell(row, 5)
    dt = parse_date(date_raw)
    if not article_id or not title or not dt:
        continue
    if dt < cutoff or dt > now + timedelta(minutes=10):
        continue
    article_url = BASE_URL + 'details.html?id=' + urllib.parse.quote(article_id, safe='')
    items.append((dt, article_url, title))

# newest first; deduplicate by URL
seen = set(); fresh = []
for item in sorted(items, reverse=True):
    if item[1] not in seen:
        seen.add(item[1]); fresh.append(item)
    if len(fresh) >= 1000:
        break

urlset = Element('urlset', {
    'xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
    'xmlns:news': 'http://www.google.com/schemas/sitemap-news/0.9'
})
for dt, loc, title in fresh:
    u = SubElement(urlset, 'url')
    SubElement(u, 'loc').text = loc
    news = SubElement(u, 'news:news')
    pub = SubElement(news, 'news:publication')
    SubElement(pub, 'news:name').text = 'বাংলা সংবাদ'
    SubElement(pub, 'news:language').text = 'bn'
    SubElement(news, 'news:publication_date').text = dt.isoformat()
    SubElement(news, 'news:title').text = title

ElementTree(urlset).write(OUT, encoding='utf-8', xml_declaration=True)
print(f'Generated {OUT} with {len(fresh)} fresh articles')
