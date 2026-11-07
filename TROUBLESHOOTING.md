# TROUBLESHOOTING.md

## PowerShell activation blocked
If virtual-environment activation is blocked by execution policy, run this for the current terminal only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Python launcher
If `py -3.11` is unavailable, install Python 3.11+ and verify with `py --list` or `python --version`.

## Gnani connection errors
Do not guess endpoint paths, headers, model IDs, or audio formats. Compare the error and request against the current official documentation and the API access details supplied to your account. Never paste API secrets into chat or commit them.
