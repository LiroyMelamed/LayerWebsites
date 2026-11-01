#!/usr/bin/env python3
"""Current gate entry points. Run on a fresh pinned task cache only."""
from pathlib import Path
import subprocess,sys
folder=Path(__file__).resolve().parent
for script in ['run-tests-only.py','compile-frozen.py']:
 result=subprocess.run([sys.executable,str(folder/script)])
 if result.returncode:sys.exit(result.returncode)
