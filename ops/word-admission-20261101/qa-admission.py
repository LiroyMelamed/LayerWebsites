#!/usr/bin/python3
"""Temporary QA-only one-slot entry point; no CLI/environment overrides.

Install only beside the exact reviewed managed-admission.py during QA. This
entry point is never the final shared fleet entry point.
"""
import dataclasses
import importlib.util
from pathlib import Path
import sys

path = Path(__file__).with_name('managed-admission.py')
spec = importlib.util.spec_from_file_location('managed_admission', path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
config = dataclasses.replace(module.PRODUCTION,
    state=Path('/var/lib/melamedia-word-admission-20261101-qa'), slots=1)
sys.exit(module.run(config, sys.argv[1:]))
