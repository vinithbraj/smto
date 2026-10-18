# Third-Party Attributions

The independent compiled build in [build/README.md](build/README.md) emits an
artifact-specific BOM and notices under `dist/compiled/<platform>/`. Its private
CPython and compiled application are embedded; application dependencies are
downloaded directly from upstream into a shared environment on the customer's
machine. Those downloaded packages are not redistributed in the compiled
executables. The checked-in [license directory](licenses/README.md) contains full
collected notices, a hash-verified inventory, and [upstream source links](licenses/SOURCE_LINKS.md).
Both compiled roles embed it and deliver the complete `LICENSES/` tree in their
release details folders. Keep those folders available alongside the executable
downloads. Source archives are not included. The notice inventory does not replace
the outstanding component reviews or approve release.
The [15 October 2026 re-review](docs/compliance/distribution-assessment.md)
separates their integration from embedded-component obligations and records four
cleared categories and four outstanding embedded-content findings. The earlier
observed-binary assessment below describes legacy distributions.

Distribution assessment updated: 2026-10-13. The summary tables below were last
maintained on 2026-09-15 and are not a complete release BOM.

For the current source/import inventory, observed Linux server and gateway binary
contents, license compatibility verdicts, obligations and unresolved issues, see
[the distribution assessment](docs/compliance/distribution-assessment.md) and
[the complete assessment manifest](docs/compliance/distribution-bom.md).
The [CSV manifest](docs/compliance/distribution-bom.csv) includes each component's
distribution status and conditions for proprietary redistribution.

This file lists third-party components that are declared, bundled, built, or
downloaded by this repository. It is informational and does not replace the
license text or package metadata distributed by each upstream project.

Source installation workflows download many dependencies separately. Binary
distribution workflows also embed a private CPython runtime, Python dependencies,
native libraries and vendor assets inside the server and gateway executables.
Those embedded components are redistributed even when the user receives only one
executable. Chromium, model weights and host tools have separate provisioning
paths; their inclusion must be checked against the exact artifact being shipped.
All components remain subject to their upstream licenses and terms. The assessment
records remaining notice, source-availability and license-provenance gaps; this
file alone is not evidence that redistribution obligations have been satisfied.
All third-party names, trademarks, and service marks are the property of their
respective owners.

## Bundled Frontend Components

These files are checked into this repository and redistributed with the Python
package/static assets.

| Component | Use | License | Attribution / Source |
| --- | --- | --- | --- |
| Mermaid | Diagram rendering in the manual | MIT | Copyright (c) 2014-2022 Knut Sveidqvist. License file: `src/manual/static/vendor/mermaid/LICENSE`. Source: https://github.com/mermaid-js/mermaid |

## Python Dependencies

These are direct Python dependencies declared in `pyproject.toml`. Transitive
dependencies are resolved by the installer and retain their own upstream
licenses and metadata.

### Runtime

| Component | Requirement | License |
| --- | --- | --- |
| jsonschema | `jsonschema>=4.23,<5.0` | MIT |
| FastAPI | `fastapi>=0.116,<1.0` | MIT |
| psutil | `psutil>=5.9,<8.0` | BSD-3-Clause |
| Pydantic | `pydantic>=2.11,<3.0` | MIT |
| Google Auth | `google-auth>=2.30,<3.0` | Apache-2.0 |
| PyYAML | `pyyaml>=6.0.2,<7.0` | MIT |
| Requests | `requests>=2.32,<3.0` | Apache-2.0 |
| Rich | `rich>=14.0,<15.0` | MIT |
| regex | `regex>=2024.11.6,<2027` | Apache-2.0 AND CNRI-Python |
| SQLGlot | `sqlglot>=26.0,<27.0` | MIT |
| Typer | `typer>=0.16,<1.0` | MIT |
| Uvicorn | `uvicorn[standard]>=0.35,<1.0` | BSD-3-Clause |
| websockets | `websockets>=16.0,<17.0` | BSD-3-Clause |

### Test / E2E Dependency

| Component | Requirement | License |
| --- | --- | --- |
| Playwright for Python | `playwright>=1.49,<2.0` | Apache-2.0 |

### Optional Office Dependencies

These libraries are installed on the selected Gateway through `aor-runtime[office]`.
No Office backend is imported during base runtime or skill registration.

| Component | Requirement | Verified version | License |
| --- | --- | --- | --- |
| [python-docx](https://python-docx.readthedocs.io/en/latest/) | `>=1.2,<2` | 1.2.0 | MIT |
| [openpyxl](https://openpyxl.readthedocs.io/en/stable/) | `>=3.1.5,<4` | 3.1.5 | MIT |
| [python-pptx](https://python-pptx.readthedocs.io/en/latest/) | `>=1.0.2,<2` | 1.0.2 | MIT |

Resolved transitive libraries in validation included lxml 6.1.3 (BSD-3-Clause) and
XlsxWriter 3.2.9 (BSD-2-Clause). Pillow is an existing base dependency. Upstream
distribution metadata and licenses remain authoritative. LibreOffice is not required
or invoked by the Office skill.

### Optional Manual Dependency

| Component | Requirement | License |
| --- | --- | --- |
| markdown-it-py | `markdown-it-py>=3,<4` | MIT |

### Development And Tooling Dependencies

| Component | Requirement | License |
| --- | --- | --- |
| Bandit | `bandit>=1.8,<2.0` | Apache-2.0 |
| Black | `black>=25.0,<26.0` | MIT |
| build | `build>=1.2,<2.0` | MIT |
| coverage.py | `coverage>=7.0,<8.0` | Apache-2.0 |
| Flake8 | `flake8>=7.0,<8.0` | MIT |
| HTTPX | `httpx>=0.27,<1.0` | BSD-3-Clause |
| IPython | `ipython>=9.0,<10.0` | BSD-3-Clause |
| isort | `isort>=6.0,<7.0` | MIT |
| mypy | `mypy>=1.10,<2.0` | MIT |
| openpyxl | `openpyxl>=3.1,<4.0` | MIT |
| pip-audit | `pip-audit>=2.7,<3.0` | Apache-2.0 |
| pipdeptree | `pipdeptree>=2.20,<3.0` | MIT |
| pre-commit | `pre-commit>=4.0,<5.0` | MIT |
| pyarrow | `pyarrow>=15.0,<23.0` | Apache-2.0 |
| pylint | `pylint>=3.0,<5.0` | GPL-2.0-or-later |
| pyright | `pyright>=1.1,<2.0` | MIT |
| pytest | `pytest>=8.0,<9.0` | MIT |
| pytest-cov | `pytest-cov>=5.0,<8.0` | MIT |
| Ruff | `ruff>=0.8,<1.0` | MIT |
| Twine | `twine>=6.0,<7.0` | Apache-2.0 |

## Browser And System Components

These third-party components are installed by setup workflows rather
than checked into the repository.

| Component | How It Is Used | License / Terms |
| --- | --- | --- |
| Playwright Chromium browser | Installed by `python -m playwright install chromium` for browser automation | Chromium and Playwright upstream notices apply |

## Notes

- Local files under `.aor/` and `artifacts/models/`
  are generated, built, or downloaded during setup and are not intended to be
  committed.
- For a public release, publish from a clean history that never contained
  removed third-party binary/model blobs.
