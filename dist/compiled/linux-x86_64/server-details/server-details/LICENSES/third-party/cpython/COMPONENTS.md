# Python incorporated-library evidence

Linux x86_64 CPython 3.12.14, python-build-standalone release 20260901.

The source URLs include the upstream tarballs and the tagged build recipes/patches.
The full archive metadata sometimes lists alternative implementations. The inventory
selects OpenSSL 3.5.8 and zlib 1.3.2 from the matching release recipes and runtime.
The platform runtime and its crypt, TLS, database, and Tcl/Tk modules are unchanged.

| Extension | Upstream notice references |
| --- | --- |
| _bz2 | LICENSE.bzip2.txt |
| _ctypes | LICENSE.libffi.txt |
| _curses | LICENSE.ncurses.txt |
| _curses_panel | LICENSE.ncurses.txt |
| _dbm | LICENSE.bdb.txt |
| _decimal | LICENSE.mpdecimal.txt |
| _hashlib | LICENSE.openssl-1.1.txt, LICENSE.openssl-3.txt |
| _lzma | LICENSE.liblzma.txt |
| _sqlite3 | LICENSE.sqlite.txt, LICENSE.zlib-ng.txt, LICENSE.zlib.txt |
| _ssl | LICENSE.openssl-1.1.txt, LICENSE.openssl-3.txt |
| _tkinter | LICENSE.libX11.txt, LICENSE.libXau.txt, LICENSE.libxcb.txt, LICENSE.tcl.txt, LICENSE.zlib-ng.txt, LICENSE.zlib.txt |
| _uuid | LICENSE.libuuid.txt |
| binascii | LICENSE.zlib-ng.txt, LICENSE.zlib.txt |
| pyexpat | LICENSE.expat.txt |
| readline | LICENSE.libedit.txt, LICENSE.ncurses.txt |
| zlib | LICENSE.zlib-ng.txt, LICENSE.zlib.txt |

The metadata includes alternative OpenSSL 1.1 and zlib-ng license paths; these
are not assertions that those variants are in this runtime. CPython's main
license also preserves its internally incorporated code notices.

Berkeley DB 6.0.19 is included through `_dbm`. Its Sleepycat source-access terms
are preserved in LICENSE.bdb.txt; the scope of those terms for this packaging
remains an open review. Adding notices does not approve it.
