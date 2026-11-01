#!/usr/bin/env python3
"""Read-only content audit; one reader, resumable hash journal, no media copies.

Paths are not deletion instructions. Same-size candidates receive complete SHA256
reads; inode aliases are reported separately. APFS extent sharing is unknown.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import time


def identity(st):
    return [st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns]


def digest_file(path, expected, deadline):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if identity(os.fstat(fd)) != expected:
            raise ValueError('source_changed_before_read')
        h = hashlib.sha256()
        while True:
            if time.monotonic() > deadline:
                raise TimeoutError('audit_lease_expired')
            b = os.read(fd, 4 * 1024 * 1024)
            if not b:
                break
            h.update(b)
        if identity(os.fstat(fd)) != expected or identity(os.lstat(path)) != expected:
            raise ValueError('source_changed_during_read')
        return h.hexdigest()
    finally:
        os.close(fd)


def inventory(root, deadline):
    files = []; links = []; errors = []; stack = [root]; device = root.stat().st_dev
    while stack:
        if time.monotonic() > deadline:
            raise TimeoutError('inventory_lease_expired')
        with os.scandir(stack.pop()) as entries:
            for e in entries:
                try:
                    st = e.stat(follow_symlinks=False)
                    rel = str(Path(e.path).relative_to(root))
                    if stat.S_ISLNK(st.st_mode):
                        links.append(rel)
                    elif st.st_dev != device:
                        errors.append([rel, 'different_device'])
                    elif stat.S_ISDIR(st.st_mode):
                        stack.append(Path(e.path))
                    elif stat.S_ISREG(st.st_mode):
                        files.append((rel, identity(st), st.st_blocks * 512))
                except OSError as exc:
                    errors.append([e.path, type(exc).__name__])
    return files, links, errors


def run(root, output, seconds=900):
    started = time.monotonic()
    root = root.resolve(strict=True); output = output.resolve()
    if output == root or root in output.parents:
        raise ValueError('audit_output_must_be_outside_source')
    output.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + seconds
    db = sqlite3.connect(output / 'hashes.sqlite', timeout=3)
    db.execute('pragma journal_mode=DELETE')
    if db.execute('pragma page_size').fetchone()[0] != 4096:
        raise ValueError('unexpected_journal_page_size')
    db.execute('pragma max_page_count=32768')  # 128 MiB; measured 196k candidate paths
    db.execute('create table if not exists hashes(path text primary key,pin text,sha text)')
    db.execute('create table if not exists meta(root text)')
    old = db.execute('select root from meta').fetchone()
    if old and old[0] != str(root):
        raise ValueError('journal_source_mismatch')
    if not old:
        db.execute('insert into meta values(?)',(str(root),)); db.commit()
    files, links, errors = inventory(root, deadline)
    by_size = {}; unique = {}; hardlinks = 0
    for rel, pin, allocated in files:
        key = tuple(pin[:2])
        if key in unique:
            hardlinks += 1
            continue
        unique[key] = (rel, pin, allocated)
        if pin[2]:
            by_size.setdefault(pin[2], []).append((rel, pin, allocated))
    candidates = [f for group in by_size.values() if len(group)>1 for f in group]
    candidates.sort(key=lambda f:(not f[0].startswith('data/backups/'), -f[1][2], f[0]))
    groups = {}; done=0; read_bytes=0; resumed=0; interrupted=False; last=time.monotonic()
    for rel, pin, allocated in candidates:
        if time.monotonic()>deadline:
            interrupted=True; break
        try:
            if identity(os.lstat(root/rel)) != pin:
                raise ValueError('source_changed_since_inventory')
            previous=db.execute('select pin,sha from hashes where path=?',(rel,)).fetchone()
            if previous and json.loads(previous[0]) == pin:
                sha=previous[1]; resumed+=1
            else:
                sha=digest_file(root/rel,pin,deadline);read_bytes+=pin[2]
                db.execute('insert or replace into hashes values(?,?,?)',(rel,json.dumps(pin),sha));db.commit()
            groups.setdefault((pin[2],sha),[]).append((rel,allocated));done+=1
        except TimeoutError:
            interrupted=True;break
        except (OSError,ValueError) as exc:
            errors.append([rel,str(exc)])
        if time.monotonic()-last>10:
            print(json.dumps({'hashed_or_reused':done,'candidates':len(candidates),'read_bytes':read_bytes,'resumed':resumed}),flush=True);last=time.monotonic()
    # Exclude files that changed after their hash from the measured duplicate set.
    unstable=[]
    for rel,pin,_ in unique.values():
        try:
            if identity(os.lstat(root/rel))!=pin:unstable.append(rel)
        except OSError:unstable.append(rel)
    unstable_set=set(unstable)
    duplicate_groups=[]; logical=0;allocated_upper=0;backup_duplicate=0
    for (size,sha), members in groups.items():
        members=[m for m in members if m[0] not in unstable_set]
        if len(members)<2:continue
        logical+=size*(len(members)-1)
        allocated_upper+=sum(a for _,a in members)-max(a for _,a in members)
        backup_count=sum(p.startswith('data/backups/') for p,_ in members)
        backup_duplicate+=max(0,backup_count-1)*size
        duplicate_groups.append({'sha256':sha,'bytes_each':size,'paths':[p for p,_ in members], 'redundant_logical_bytes':size*(len(members)-1)})
    duplicate_groups.sort(key=lambda x:-x['redundant_logical_bytes'])
    summary={'root':str(root),'at':time.time(),'complete':not interrupted and not errors and not unstable,
        'elapsed_seconds':time.monotonic()-started,'hash_pass_complete':not interrupted and done==len(candidates),
        'inventory_files':len(files),'unique_inodes':len(unique),'hardlink_aliases':hardlinks,'symlinks_skipped':len(links),
        'source_logical_bytes':sum(p[1][2] for p in unique.values()),'source_allocated_bytes':sum(p[2] for p in unique.values()),
        'candidate_files':len(candidates),'candidate_bytes':sum(p[1][2] for p in candidates),'hashed_or_reused':done,
        'read_bytes_this_run':read_bytes,'reused_hashes':resumed,'errors':errors,'changed_paths':unstable,
        'duplicate_groups':len(duplicate_groups),'redundant_logical_bytes':logical,'allocated_redundancy_upper_bound':allocated_upper,
        'backup_only_redundant_logical_bytes':backup_duplicate,'physical_reclaim_bytes':'unknown: APFS clones, snapshots, references and retention not qualified',
        'deleted_files':0,'method':'complete SHA256 per same-size candidate; distinct inodes only; fresh identity checks; symlinks excluded'}
    for name,value in [('summary.json',summary),('duplicates.json',duplicate_groups)]:
        body=json.dumps(value,indent=2)+'\n'
        if len(body.encode())>16*1024*1024:
            raise ValueError('report_exceeds_16MiB_budget')
        temp=output/(name+'.tmp');temp.write_text(body);os.replace(temp,output/name)
    db.close();print(json.dumps(summary),flush=True)
    return summary


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--seconds',type=int,default=900)
    a=p.parse_args()
    if not 1<=a.seconds<=1800:p.error('seconds must be 1..1800')
    run(a.root,a.output,a.seconds)
