#!/usr/bin/env python3
"""Plan an Echo Album heal from a local download folder (read-only except --staging).

Matches downloaded masters and stem archives to exact Builder songs (Suno ID first,
then playlist/store title, always confirmed by measured duration), validates container
headers, chooses one file per slot, and safely extracts stem archives into --staging.
Writes a plan JSON consumed by scripts/apply-echo-download-heal.mjs. No store writes.
"""
import argparse, collections, json, os, re, shutil, subprocess, unicodedata, zipfile

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
ROLE_OK = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$')
DUR_TOL = 0.75


def norm(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def container(path):
    with open(path, 'rb') as handle:
        head = handle.read(16)
    if head[:4] == b'RIFF' and head[8:12] == b'WAVE':
        return 'wav'
    if head[:3] == b'ID3' or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return 'mp3'
    return 'other'


def duration(path):
    if container(path) == 'mp3':
        # VBR stems may lack a Xing header, so header estimates drift badly; decode to measure.
        out = subprocess.run(['ffmpeg', '-nostdin', '-v', 'quiet', '-stats', '-i', path, '-map', '0:a:0', '-f', 'null', '-'],
                             capture_output=True, text=True, timeout=180)
        times = re.findall(r'time=(\d+):(\d+):(\d+(?:\.\d+)?)', out.stderr)
        return int(times[-1][0]) * 3600 + int(times[-1][1]) * 60 + float(times[-1][2]) if times else None
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True, timeout=60)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return None


def stem_role(member, title):
    base = os.path.splitext(os.path.basename(member))[0]
    base = re.sub(r'^\d+\s*[-_.]?\s*', '', base)
    match = re.fullmatch(re.escape(title) + r'\s*\((.+)\)', base, flags=re.I) or re.fullmatch(r'.*\((.+)\)', base)
    return (match.group(1) if match else base).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--downloads', required=True)
    ap.add_argument('--store', required=True)
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--inventory', required=True, help='inventory-before JSON from server/audio-atlas-inventory.mjs')
    ap.add_argument('--staging', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', action='append', default=[], help='restrict to these Builder song IDs (repeatable)')
    args = ap.parse_args()

    store = json.load(open(args.store))['songs']
    by_track = {(s.get('audio') or {}).get('registryTrackId'): s for s in store if (s.get('audio') or {}).get('registryTrackId')}
    store_by_title = collections.defaultdict(list)
    for song in store:
        store_by_title[norm(song['title'])].append(song)
    manifest = json.load(open(args.manifest))['songs']
    manifest_by_title = collections.defaultdict(list)
    for row in manifest:
        manifest_by_title[norm(row['title'])].append(row)
    inventory = {row['id']: row for row in json.load(open(args.inventory))['songs']}

    # Group download entries by display title; UUID-named files are keyed by Suno ID.
    groups = collections.defaultdict(lambda: {'master': collections.defaultdict(list), 'archives': [], 'folders': []})
    by_uuid = collections.defaultdict(list)
    for name in sorted(os.listdir(args.downloads)):
        if name.startswith('.'):
            continue
        path = os.path.join(args.downloads, name)
        if os.path.isdir(path):
            if name.endswith(' Stems'):
                groups[name[:-6]]['folders'].append(path)
            continue
        base, ext = os.path.splitext(name)
        ext = ext.lower().lstrip('.')
        base = re.sub(r' \(\d+\)$', '', base)
        if UUID.match(base):
            by_uuid[base].append(path)
        elif ext == 'zip' and base.endswith(' Stems'):
            groups[base[:-6]]['archives'].append(path)
        elif ext in ('wav', 'mp3', 'm4a'):
            groups[base]['master'][ext].append(path)

    def tagged_suno_ids(group):
        # Suno embeds the song URL/ID in MP3 comments; it survives a renamed title.
        found = []
        for path in group['master'].get('mp3', []):
            out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', path],
                                 capture_output=True, text=True, timeout=60).stdout
            found += re.findall(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', out)
        return found

    def candidates_for(title, group):
        rows = [by_track[m['id']] for m in manifest_by_title.get(norm(title), []) if m['id'] in by_track]
        rows += [s for s in store_by_title.get(norm(title), []) if s not in rows]
        if not rows:
            rows = [by_track[i] for i in dict.fromkeys(tagged_suno_ids(group)) if i in by_track]
        return rows

    def matches(song, path):
        expected = (song.get('audio') or {}).get('duration')
        measured = duration(path)
        return expected is not None and measured is not None and abs(measured - expected) <= DUR_TOL, measured

    plan = {'schemaVersion': 'hapa.echo-download-heal-plan.v1', 'downloads': args.downloads, 'songs': [], 'newSongs': [],
            'unresolved': [], 'skippedFormats': ['m4a (AAC; not a Builder completeness format)']}
    assigned = collections.defaultdict(lambda: {'wavMaster': [], 'archives': [], 'folders': [], 'titles': set()})

    for title, group in groups.items():
        probe = (group['master'].get('mp3') or group['master'].get('wav') or [None])[0]
        songs = candidates_for(title, group)
        chosen = None
        if probe and songs:
            for song in songs:
                ok, _ = matches(song, probe)
                if ok:
                    chosen = song
                    break
        elif len(songs) == 1:
            chosen = songs[0]
        if not chosen:
            (plan['newSongs'] if not songs else plan['unresolved']).append({'title': title, 'candidates': [s['id'] for s in songs],
                                                                             'files': sorted(sum(group['master'].values(), []) + group['archives'] + group['folders'])})
            continue
        slot = assigned[chosen['id']]
        slot['titles'].add(title)
        slot['wavMaster'] += group['master'].get('wav', [])
        slot['archives'] += group['archives']
        slot['folders'] += group['folders']
    for track, paths in by_uuid.items():
        song = by_track.get(track)
        if song:
            assigned[song['id']]['wavMaster'] += paths
            assigned[song['id']]['titles'].add(track)
        else:
            plan['unresolved'].append({'title': track, 'reason': 'Suno ID not in Echo manifest or song store', 'files': paths})

    for song_id, slot in sorted(assigned.items()):
        if args.only and song_id not in args.only:
            continue
        song = next(s for s in store if s['id'] == song_id)
        inv = inventory.get(song_id, {})
        entry = {'songId': song_id, 'title': song['title'], 'downloadTitles': sorted(slot['titles']), 'actions': [], 'notes': []}
        # Master WAV: fill only an empty slot with a header-valid, duration-matched file.
        if inv.get('wav', {}).get('state') != 'available':
            for path in slot['wavMaster']:
                if container(path) != 'wav':
                    entry['notes'].append(f'{os.path.basename(path)}: not RIFF/WAVE, skipped')
                    continue
                ok, measured = matches(song, path)
                if ok:
                    entry['actions'].append({'kind': 'master', 'format': 'wav', 'file': path, 'duration': measured})
                    break
                entry['notes'].append(f'{os.path.basename(path)}: duration {measured} does not match song, skipped')
            else:
                if slot['wavMaster']:
                    entry['notes'].append('No valid master WAV among downloads')
        # Stems: newest archive per format; a combined archive or loose folder serves both formats.
        sources = collections.defaultdict(list)
        for archive in slot['archives']:
            with zipfile.ZipFile(archive) as zf:
                members = [m for m in zf.namelist() if not m.endswith('/') and not m.startswith('__MACOSX') and '..' not in m and not m.startswith('/')]
            for fmt in sorted({os.path.splitext(m)[1].lower().lstrip('.') for m in members} & {'wav', 'mp3'}):
                sources[fmt].append((os.path.getmtime(archive), archive))
        stems = {}
        for fmt, found in sources.items():
            archive = max(found)[1]
            target = os.path.join(args.staging, song_id, fmt)
            shutil.rmtree(target, ignore_errors=True)
            os.makedirs(target)
            files = []
            with zipfile.ZipFile(archive) as zf:
                for member in zf.namelist():
                    if member.endswith('/') or member.startswith('__MACOSX') or '..' in member or member.startswith('/'):
                        continue
                    if os.path.splitext(member)[1].lower() != '.' + fmt:
                        continue
                    role = stem_role(member, song['title'])
                    out = os.path.join(target, re.sub(r'[^A-Za-z0-9 _-]', '_', role) + '.' + fmt)
                    with zf.open(member) as src, open(out, 'wb') as dst:
                        shutil.copyfileobj(src, dst)
                    files.append({'role': role, 'file': out, 'member': member, 'archive': archive})
            stems[fmt] = files
        if stems:
            bad = [f for files in stems.values() for f in files if not ROLE_OK.match(f['role']) or container(f['file']) != os.path.splitext(f['file'])[1][1:]]
            ok_duration, measured = matches(song, (stems.get('wav') or stems['mp3'])[0]['file'])
            roles = {fmt: sorted(f['role'] for f in files) for fmt, files in stems.items()}
            existing = len(song.get('stems') or [])
            if bad or not ok_duration:
                entry['notes'].append(f'Stem set rejected: {len(bad)} invalid files, duration {measured}')
            elif set(stems) == {'wav', 'mp3'} and roles['wav'] == roles['mp3']:
                entry['actions'].append({'kind': 'stem-set', 'mode': 'make-current', 'archiveExisting': existing, 'stems': stems})
            elif existing == 0:
                entry['actions'].append({'kind': 'stem-set', 'mode': 'attach-single-format', 'archiveExisting': 0, 'stems': stems})
            else:
                entry['notes'].append(f'Held: only {"/".join(sorted(stems))} stems downloaded; switching would drop the registered MP3 set ({existing} records). Download the matching MP3 stem ZIP to complete.')
        plan['songs'].append(entry)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    json.dump(plan, open(args.out, 'w'), indent=1, default=list)
    summary = collections.Counter()
    for entry in plan['songs']:
        for action in entry['actions']:
            summary[action['kind'] + (':' + action.get('mode', action.get('format', '')))] += 1
        summary['held-stems'] += any(n.startswith('Held') for n in entry['notes'])
    print(json.dumps({'songs': len(plan['songs']), 'actions': summary, 'newSongs': [n['title'] for n in plan['newSongs']],
                      'unresolved': [u['title'] for u in plan['unresolved']]}, indent=1))


if __name__ == '__main__':
    main()
