#!/usr/bin/env python3
"""Prepare the existing synthetic browser harness for a pinned integration tree."""
import argparse
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--repo', required=True, type=Path)
p.add_argument('--deps', required=True, type=Path)
p.add_argument('--output', required=True, type=Path)
a = p.parse_args()
source = (a.repo / 'docs/releases/card-save-billing-20261101/qa-followup/browser-fixture.cjs').read_text()
old_root = "const ROOT = path.resolve(__dirname, '../../../../');"
old_deps = "const DEPS = '/Users/liroymelamed/Projects/LayerWebsites/frontend/node_modules';"
assert source.count(old_root) == source.count(old_deps) == 1
source = source.replace(old_root, 'const ROOT = ' + repr(str(a.repo)) + ';')
source = source.replace(old_deps, 'const DEPS = ' + repr(str(a.deps)) + ';')
a.output.write_text(source)
