"""Disposable Linux checks; this branch publishes no release artifacts."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


class CodeMode(unittest.TestCase):
    def test_executable_script(self):
        with tempfile.TemporaryDirectory() as root:
            script = Path(root, "hello.sh")
            script.write_text("#!/bin/sh\nprintf 'Hello, World!\\n'\n")
            script.chmod(0o600)
            old = os.umask(0o077)
            try:
                script.chmod(0o700)
            finally:
                os.umask(old)
            result = subprocess.run(["./hello.sh"], cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout, "Hello, World!\n")
            self.assertEqual(script.stat().st_mode & 0o777, 0o700)
