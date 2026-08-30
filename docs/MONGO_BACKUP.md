# Mongo backup

Local Mongo backups are written to:

```text
E:\backup\reminder-app\mongo
```

Run manually from the repository root:

```powershell
npm run backup:mongo
```

The backup script:

- reads `MONGODB_URI` and `MONGODB_DB` from the process environment, `server\.env`, or `server\.env.local`;
- defaults the database name to `reminder-app` when `MONGODB_DB` is missing;
- writes each dump to a timestamped folder;
- keeps old backups by default. Pass `-KeepDays 30` to the PowerShell script if retention cleanup is explicitly wanted;
- requires MongoDB Database Tools, specifically `mongodump`, to be installed and available in `PATH`.
