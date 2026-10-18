# SMTO third-party licenses and source links

This directory contains license texts, copyright notices, a component inventory,
and links to upstream source. It does not contain third-party source archives or
SMTO application source. SMTO's application license does not replace these terms.

- [Source links](SOURCE_LINKS.md) identify component versions and upstream locations.
- `manifest.json` records notice hashes, provenance, and the pinned build inputs.
- `cpython/` covers the observed Linux x86_64 Python 3.12.14 runtime, including
  incorporated libraries and Tcl/Tk/Itcl/Thread terms.
- `pip/` retains the embedded bootstrap package's own and vendored notices.
- `nuitka/` preserves the generated runtime terms and proprietary-output exception.
  The Nuitka compiler itself is not included in the application payload.
- `mermaid/` covers the exact Mermaid 10.9.3 bundle, its runtime dependency closure,
  and generated-parser notices. Some closure entries may have been tree-shaken.
- `libxcrypt/` preserves the Ubuntu package copyright inventory and full terms.

Builds include this directory under `app/LICENSES/third-party/` and copy the complete
`LICENSES/` tree to each server/gateway release details folder. Keep that folder
available alongside the executable download so source directions and notices are
accessible before installation. Existing native notices and application terms are
also included in that release folder.

The application's other locked Python dependencies and browser packages are
installed directly from upstream on the customer's machine. Their own installers
retain their license documents; those packages are not copied into this folder or
redistributed merely because their URLs occur in the build BOM.

## libcrypt / libxcrypt

The retained Linux library is Ubuntu `libcrypt1:amd64`, version `1:4.4.27-1`.
Its LGPL-2.1-or-later grant allows the LGPLv3 option; this directory retains both
the original LGPLv2.1 text and the LGPLv3/GPLv3 texts for that option, together with
per-file permissive terms. The Ubuntu `.dsc`, original source archive and Debian
packaging archive linked in SOURCE_LINKS.md identify the exact source package.
Both source archives are needed for the distribution's modifications/build rules.
They are hosted by Ubuntu, not by SMTO. No local source archive is shipped.

Third-party hosting does not eliminate the distributor's applicable source-access
obligations. Links must remain available for the required period. The library's
replacement/relinking review is deferred; these documents do not approve release.
No operating-system or bundled runtime component has been removed or replaced.

## Review boundaries

This inventory improves notice delivery; it is not an overall license clearance.
Proxmox copied-metadata permissions and the libcrypt replacement route remain open
and deferred. Berkeley DB's source-access scope and ELKJS's transitive Java source
mapping still require review; the dagre-d3-es fork's missing standalone notice is
recorded. The release gate retains these open categories. Linux evidence does not
establish complete incorporated-library coverage for unreviewed macOS/Windows
runtimes. See `docs/compliance/distribution-assessment.md` in the source repository
for the engineering assessment. No claim is made that adding a link alone clears
all component-specific obligations.
