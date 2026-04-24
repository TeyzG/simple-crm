# Huong Dan Cau Hinh Google Sheet Tren Vercel

Tai lieu nay dung de xu ly loi:

`Chua cau hinh Google Sheet tren server (GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).`

---

## Buoc 1) Chuan bi Google side

1. Vao [Google Cloud Console](https://console.cloud.google.com/), tao/chon 1 project.
2. Vao `APIs & Services` -> `Library` -> bat **Google Sheets API**.
3. Vao `IAM & Admin` -> `Service Accounts` -> tao service account moi.
4. Mo service account vua tao -> `Keys` -> `Add key` -> chon **JSON** -> tai file key.

Trong file JSON, can 2 gia tri:

- `client_email`
- `private_key`

---

## Buoc 2) Chuan bi Google Sheet

1. Tao 1 Google Sheet moi (hoac dung file san co).
2. Dat ten tab dung voi app (mac dinh: `Don Hang`).
3. Nhan `Share`, moi `client_email` cua service account voi quyen **Editor**.
4. Lay Spreadsheet ID trong URL:

`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

---

## Buoc 3) Cau hinh bien moi truong tren Vercel

Vao:

- [Vercel project environment variables](https://vercel.com/le-nhans-projects/tamanh-crm/settings/environment-variables)

Them cac bien bat buoc:

- `GOOGLE_SPREADSHEET_ID` = ID lay tu URL Sheet
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email` trong JSON key
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` = `private_key` trong JSON key

Bien tuy chon:

- `GOOGLE_SHEET_TAB_NAME` = `Don Hang` (neu ten tab khac mac dinh)
- `SHEETS_SYNC_TOKEN` = token bao ve API server
- `VITE_SHEETS_SYNC_TOKEN` = token cho frontend (neu dung token)
- `VITE_USE_SHEETS` = `true` de bat dong bo Sheet

---

## Buoc 4) Cach nhap `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` dung

Ban co 2 cach:

1. Dan nguyen key nhieu dong (co `-----BEGIN PRIVATE KEY-----` den `-----END PRIVATE KEY-----`).
2. Neu UI khong giu newline, dung ban 1 dong voi `\\n`:

```text
-----BEGIN PRIVATE KEY-----\nMIIEv...\n...\n-----END PRIVATE KEY-----\n
```

Code server da xu ly `\\n` -> newline, nen cach 2 chay duoc.

---

## Buoc 5) Redeploy

Sau khi them/sua environment variables:

1. Vao `Deployments` trong Vercel project.
2. Chon deploy moi nhat -> `Redeploy` (hoac push commit moi len GitHub).

Luu y:

- Bien bat dau bang `VITE_` se duoc nhung vao frontend luc build, nen **bat buoc redeploy** moi an.

---

## Buoc 6) Kiem tra nhanh

1. Mo URL online (`*.vercel.app`).
2. Neu khong con banner loi cau hinh Sheet la da ket noi duoc.
3. Tao thu 1 don moi, mo Google Sheet de kiem tra co dong moi.

---

## Ghi chu bao mat quan trong

- Khong commit file JSON service account len GitHub.
- Khong chia se `private_key`.
- Khong dua thong tin bi mat vao file frontend.
- `VITE_*` khong phai bao mat server that su, chi phu hop cho cau hinh giao dien.
