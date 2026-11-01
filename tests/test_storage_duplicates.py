import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).parents[1] / 'scripts/audit-storage-duplicates.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class DuplicateAuditTests(unittest.TestCase):
    def test_content_aliases_and_resume(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'source'; root.mkdir()
            (root/'a').write_bytes(b'hello')
            (root/'b').write_bytes(b'hello')
            (root/'c').write_bytes(b'other')
            os.link(root/'a',root/'hardlink')
            (root/'symlink').symlink_to(root/'b')
            out=Path(temp)/'report'
            with contextlib.redirect_stdout(io.StringIO()):
                first=audit.run(root,out)
                second=audit.run(root,out)
                (root/'b').write_bytes(b'world')
                third=audit.run(root,out)
            self.assertTrue(first['complete'])
            self.assertEqual(first['redundant_logical_bytes'],5)
            self.assertEqual(first['hardlink_aliases'],1)
            self.assertEqual(first['symlinks_skipped'],1)
            self.assertEqual(second['read_bytes_this_run'],0)
            self.assertEqual(third['redundant_logical_bytes'],0)
            self.assertEqual(third['read_bytes_this_run'],5)
            self.assertEqual(third['deleted_files'],0)

    def test_stale_identity_and_symlink_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'a';p.write_bytes(b'first')
            pin=audit.identity(p.stat());p.write_bytes(b'changed')
            with self.assertRaises(ValueError):audit.digest_file(p,pin,time.monotonic()+5)
            s=Path(temp)/'link';s.symlink_to(p)
            with self.assertRaises(OSError):audit.digest_file(s,audit.identity(p.stat()),time.monotonic()+5)

    def test_scope_and_expired_read(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp); f=p/'a';f.write_bytes(b'data')
            with self.assertRaises(ValueError):audit.run(p,p/'report')
            with self.assertRaises(TimeoutError):audit.digest_file(f,audit.identity(f.stat()),time.monotonic()-1)


if __name__ == '__main__': unittest.main()
