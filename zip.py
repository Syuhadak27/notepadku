
import zipfile
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
BACKUP_DIR = BASE_DIR / ".cc_backup"
IGNORE_DIRS = {".git", "node_modules", ".cc_backup"}

BACKUP_DIR.mkdir(exist_ok=True)

versions = [
    int(p.name.split("_")[0][1:])
    for p in BACKUP_DIR.glob("v*_*.zip")
    if p.name.split("_")[0][1:].isdigit()
]

version = max(versions, default=0) + 1
timestamp = datetime.now().strftime("%d%m%y_%H-%M")
backup_file = BACKUP_DIR / f"v{version}_{timestamp}.zip"
self_file = Path(__file__).resolve()

with zipfile.ZipFile(backup_file, "w", zipfile.ZIP_DEFLATED) as zipf:
    for path in BASE_DIR.rglob("*"):
        if not path.is_file():
            continue

        relative = path.relative_to(BASE_DIR)

        if any(part in IGNORE_DIRS for part in relative.parts):
            continue

        if path.resolve() == self_file:
            continue

        zipf.write(path, relative)

print(f"Backup berhasil: {backup_file.name}")
