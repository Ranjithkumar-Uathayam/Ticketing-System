# QZ Tray signing keys

This folder holds the RSA key pair used to sign QZ Tray requests, plus the
root CA that lets QZ Tray trust them with **zero popups — not even once**.

```
backend/qz/keys/
  private-key.pem          ← Leaf signing key. NEVER commit. Stays on the server only.
  digital-certificate.txt  ← Leaf cert + root cert, chain concatenated. Served via GET /api/qz/certificate.

backend/qz/root-ca/
  root-ca-cert.pem         ← Public root cert. Safe to distribute — this becomes override.crt on every workstation.
  root-ca-key.pem          ← NEVER commit, never leaves secure storage. Anyone with this can mint certs QZ Tray will silently trust.
```

## Why a self-signed leaf cert alone isn't enough

A plain self-signed certificate (subject == issuer, no CA behind it) still
makes QZ Tray show an "Action Required" dialog the first time for **each**
action type it doesn't yet recognize — connecting, listing printers, and
printing are three separate prompts. QZ Tray's own docs are explicit that
full silent printing requires either a certificate purchased from QZ
Industries, or your own root certificate installed as QZ Tray's trusted
root. That's what this setup now does.

## How it works here

1. `backend/qz/root-ca/root-ca-cert.pem` + `root-ca-key.pem` is a self-signed
   **root CA**, generated once.
2. `backend/qz/keys/private-key.pem` + the leaf half of
   `digital-certificate.txt` is signed *by* that root CA (not self-signed).
   `digital-certificate.txt` contains the leaf cert followed by the root
   cert, so QZ Tray can walk the chain.
3. `root-ca-cert.pem` is installed as `override.crt` in every workstation's
   QZ Tray install directory (see below). Once that's done, QZ Tray trusts
   *any* certificate signed by this root — including if the leaf cert is
   rotated later — with no dialog, no "Remember this decision" click, ever.

## Regenerating (root CA once, leaf certs as often as needed)

```bash
# Root CA — do this once, keep root-ca-key.pem somewhere secure (not in git)
cd backend/qz/root-ca
openssl genrsa -out root-ca-key.pem 2048
openssl req -x509 -new -key root-ca-key.pem -sha512 -days 7300 -out root-ca-cert.pem \
  -subj "/C=IN/ST=TamilNadu/L=Coimbatore/O=Uathayam/OU=Ticketing/CN=Uathayam Ticketing Root CA" \
  -addext "basicConstraints=critical,CA:true" -addext "keyUsage=critical,keyCertSign,cRLSign"

# Leaf cert — safe to redo any time (e.g. rotation), no workstation changes needed afterward
cd ../keys
openssl genrsa -out private-key.pem 2048
openssl req -new -key private-key.pem -out leaf.csr \
  -subj "/C=IN/ST=TamilNadu/L=Coimbatore/O=Uathayam/OU=Ticketing/CN=Uathayam Ticketing QZ Signing"
openssl x509 -req -in leaf.csr -CA ../root-ca/root-ca-cert.pem -CAkey ../root-ca/root-ca-key.pem \
  -CAcreateserial -out leaf-cert.pem -days 3650 -sha512
cat leaf-cert.pem ../root-ca/root-ca-cert.pem > digital-certificate.txt
rm leaf.csr leaf-cert.pem
```

Restart the backend after replacing `private-key.pem` / `digital-certificate.txt`
— the controller reads both files once at process start.

## Rolling out `override.crt` to a workstation

On each PC that runs QZ Tray and prints from this app, as an **administrator**:

```powershell
Copy-Item "C:\Program Files\QZ Tray\override.crt" "C:\Program Files\QZ Tray\override.crt.bak" -ErrorAction SilentlyContinue
Copy-Item "\path\to\root-ca-cert.pem" "C:\Program Files\QZ Tray\override.crt" -Force
Stop-Process -Name "javaw" -ErrorAction SilentlyContinue   # QZ Tray's bundled runtime process
Start-Process "C:\Program Files\QZ Tray\qz-tray.exe"
```

Get `root-ca-cert.pem` from `backend/qz/root-ca/root-ca-cert.pem` (it's the
public cert — safe to copy to any workstation) or ask the person who set
this up to send it. This only needs to be done once per workstation; it
survives leaf certificate rotation since trust is rooted at the CA, not the
leaf.

## Buying a QZ-issued certificate instead

Buying a certificate at https://qz.io/download (paid tier) achieves the same
zero-popup result without needing to install `override.crt` anywhere, since
QZ Tray already ships trusting QZ's own root. Concatenate whatever chain QZ
gives you into `digital-certificate.txt` (leaf first) and drop in the key
they issue as `private-key.pem`.

## Overriding the file locations

Set these in `backend/.env` if you keep the files elsewhere (e.g. mounted
from a secrets volume in production):

```
QZ_CERT_PATH=/absolute/path/to/digital-certificate.txt
QZ_PRIVATE_KEY_PATH=/absolute/path/to/private-key.pem
```
