"""Package the built extension and owner instructions using Python's standard library."""
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path
from urllib.parse import urlparse

root = Path(__file__).resolve().parent.parent
extension = root / 'artifacts' / 'extension'
manifest = json.loads((extension / 'manifest.json').read_text())
config = (extension / 'config.js').read_text()
match = re.fullmatch(r'export const API_URL = (.+);\n', config)
if not match:
    raise SystemExit('Run npm run build before packaging.')
origin = json.loads(match.group(1))
variant = 'local' if urlparse(origin).hostname in ('127.0.0.1', 'localhost') else 'configured'
version = manifest['version']
if not re.fullmatch(r'\d+(\.\d+){1,3}', version):
    raise SystemExit('The extension version is invalid.')
archive = root / 'artifacts' / f'vocabularium-{version}-{variant}-candidate.zip'
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip())
metadata = {'version': version, 'serverOrigin': origin, 'sourceRevision': revision, 'uncommittedChanges': dirty,
            'status': 'Candidate — owner Windows acceptance pending; see INSTALL-WINDOWS.md and issue #12 for hosted evidence'}
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
    for path in sorted(extension.rglob('*')):
        if path.is_file():
            if path.suffix not in ('.js', '.json', '.html', '.css'):
                raise SystemExit(f'Unexpected extension file: {path.name}')
            output.write(path, Path('extension') / path.relative_to(extension))
    output.write(root / 'docs' / 'Windows-Install.md', 'INSTALL-WINDOWS.md')
    output.writestr('package-info.json', json.dumps(metadata, indent=2) + '\n')
with zipfile.ZipFile(archive) as package:
    if package.testzip() is not None:
        raise SystemExit('The package integrity check failed.')
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n')
print(f'Created {archive.relative_to(root)} for {origin}')
print(f'SHA-256: {checksum}')
