"""Read-only checks for an existing Vocabularium candidate ZIP. Uses Python's standard library."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
from urllib.parse import urlsplit
import zipfile


class PackageError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise PackageError(message)


def origin_parts(value):
    require(isinstance(value, str), 'Server origin must be text.')
    parts = urlsplit(value)
    require(parts.hostname and parts.path in ('', '/') and not parts.query and not parts.fragment
            and parts.username is None and parts.password is None, 'Use a server origin without credentials, path, query, or fragment.')
    require(parts.scheme == 'https' or (parts.scheme == 'http' and parts.hostname in ('localhost', '127.0.0.1')),
            'Use HTTPS, or HTTP localhost for a local candidate.')
    _ = parts.port  # Reject an invalid port as well.
    return parts


def verify_package(archive, expected_origin, expected_revision):
    archive = Path(archive)
    origin_parts(expected_origin)
    require(re.fullmatch(r'[0-9a-f]{40}', expected_revision), 'Expected revision must be a full Git commit SHA.')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    sidecar = archive.with_suffix('.zip.sha256').read_text().strip().split(None, 1)
    require(len(sidecar) == 2 and sidecar[0] == digest and sidecar[1] == archive.name,
            'Checksum sidecar does not match this archive and filename.')
    supplied_secrets = [os.environ[name].encode() for name in ('OPENCODE_API_KEY', 'OPENAI_API_KEY') if os.environ.get(name)]
    with zipfile.ZipFile(archive) as package:
        require(package.testzip() is None, 'Archive integrity check failed.')
        names = package.namelist()
        require(len(names) == len(set(names)), 'Archive contains duplicate entries.')
        required = {'package-info.json', 'INSTALL-WINDOWS.md', 'extension/manifest.json', 'extension/config.js'}
        require(required.issubset(names), 'Archive is missing required package files.')
        for member in package.infolist():
            path = PurePosixPath(member.filename)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in member.filename
                    and not member.is_dir() and not stat.S_ISLNK(member.external_attr >> 16),
                    'Archive contains an unsafe or unexpected entry.')
            is_extension = len(path.parts) > 1 and path.parts[0] == 'extension'
            require(member.filename in {'package-info.json', 'INSTALL-WINDOWS.md'}
                    or (is_extension and path.suffix in {'.js', '.json', '.html', '.css'}),
                    'Archive contains a file outside the current extension package format.')
            content = package.read(member)
            require(not any(secret in content for secret in supplied_secrets), 'Archive contains a supplied API secret.')
            if is_extension and path.suffix == '.js':
                require(not any(marker in content for marker in (b'captureForTest', b'__testCapture', b'test-capture')),
                        'Extension contains a known capture test hook.')
        metadata = json.loads(package.read('package-info.json'))
        manifest = json.loads(package.read('extension/manifest.json'))
        require(isinstance(metadata, dict) and isinstance(manifest, dict), 'Package metadata must be JSON objects.')
        require(metadata.get('uncommittedChanges') is False, 'Final candidate must identify a clean source checkout.')
        require(metadata.get('sourceRevision') == expected_revision, 'Package source revision differs from the expected commit.')
        version = metadata.get('version')
        require(isinstance(version, str) and re.fullmatch(r'\d+(\.\d+){1,3}', version), 'Package version is invalid.')
        require(manifest.get('version') == version, 'Package and extension versions differ.')
        origin = metadata.get('serverOrigin')
        parts = origin_parts(origin)
        require(origin == expected_origin, 'Package server origin differs from the expected origin.')
        config = package.read('extension/config.js').decode()
        match = re.fullmatch(r'export const API_URL = (.+);\n', config)
        require(match is not None, 'Extension config format is unexpected; review the build script.')
        require(json.loads(match.group(1)) == origin, 'Extension config and package origins differ.')
        hostname = f'[{parts.hostname}]' if ':' in parts.hostname else parts.hostname
        require(manifest.get('host_permissions') == [f'{parts.scheme}://{hostname}/*'],
                'Extension host permission differs from its configured backend.')
    return {'archive': str(archive.resolve()), 'version': version, 'sourceRevision': expected_revision,
            'serverOrigin': origin, 'sha256': digest, 'files': len(names), 'result': 'passed',
            'suppliedSecretValuesChecked': bool(supplied_secrets)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--expect-origin', required=True)
    parser.add_argument('--expect-revision', required=True)
    args = parser.parse_args()
    try:
        result = verify_package(args.archive, args.expect_origin, args.expect_revision)
    except PackageError as error:
        print(f'Package verification failed: {error}', file=sys.stderr)
        return 1
    except (ValueError, OSError, KeyError, zipfile.BadZipFile, RuntimeError):
        # Avoid echoing untrusted archive fields or paths that may contain credentials.
        print('Package verification failed. Check the expected origin/revision, checksum, and package contents.', file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
