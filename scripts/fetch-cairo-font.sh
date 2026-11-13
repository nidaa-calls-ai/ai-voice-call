#!/bin/bash
# Download Cairo variable woff2 subsets from Google Fonts into public/fonts/
set -e
mkdir -p /home/z/my-project/public/fonts
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS=$(curl -s -m 20 "https://fonts.googleapis.com/css2?family=Cairo:wght@200..1000&display=swap" -H "User-Agent: $UA")
echo "$CSS" > /tmp/cairo.css
python3 - <<'EOF'
import re, subprocess, pathlib
css = open('/tmp/cairo.css').read()
blocks = re.findall(r'/\*\s*(\S+)\s*\*/\s*@font-face\s*{(.*?)}', css, re.S)
out = pathlib.Path('/home/z/my-project/public/fonts')
seen = {}
for subset, body in blocks:
    url = re.search(r'url\((https://[^)]+\.woff2)\)', body)
    rng = re.search(r'unicode-range:\s*([^;]+);', body)
    if not url:
        continue
    seen[subset] = (url.group(1), rng.group(1).strip() if rng else '')
for subset, (url, rng) in seen.items():
    dest = out / f'cairo-{subset}.woff2'
    subprocess.run(['curl', '-s', '-m', '30', '-o', str(dest), url], check=True)
    size = dest.stat().st_size
    print(f'{subset}: {dest.name} {size//1024}KB')
    open(out / f'cairo-{subset}.unicode-range.txt', 'w').write(rng)
EOF
ls -la /home/z/my-project/public/fonts/