"""Execute: python configurar-dominio.py https://seu-dominio.com"""
import sys,re
from pathlib import Path
from urllib.parse import urlparse
base=sys.argv[1].rstrip('/')
assert urlparse(base).scheme=='https' and urlparse(base).netloc, 'Informe a URL HTTPS pública do site'
p=Path(__file__).resolve().parent.parent/'index.html';s=p.read_text()
s=re.sub(r'<meta property="og:image" content="[^"]*">',f'<meta property="og:image" content="{base}/social-preview.jpg">',s)
s=re.sub(r'<link rel="canonical"[^>]*>|<meta property="og:url"[^>]*>','',s)
s=s.replace('</head>',f'<link rel="canonical" href="{base}/"><meta property="og:url" content="{base}/"></head>');p.write_text(s)
print('Domínio e imagem de compartilhamento configurados.')
