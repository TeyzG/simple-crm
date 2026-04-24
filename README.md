# Simple CRM - Quản Lý Đơn Hàng

Ứng dụng quản lý đơn hàng may & thêu, tương thích file Excel gốc.

## Tính năng
- Thêm, sửa, xoá đơn hàng
- Menu theo nghiệp vụ: `Đơn hàng`, `Quản lý may`, `Quản lý thêu`
- Import file .xlsx (đúng cấu trúc)
- Xuất Excel
- Lọc theo trạng thái, tìm kiếm
- Thống kê tổng quan

## Cấu hình trạng thái

- Danh sách trạng thái chính thức nằm ở file `src/config/appConfig.js`.
- Muốn thêm/sửa/xoá trạng thái: chỉnh `ORDER_STATUSES` trong file này.
- Trạng thái mặc định khi tạo đơn: `DEFAULT_STATUS`.
- Màu badge theo trạng thái: `STATUS_CLASS_MAP`.

## Deploy lên Vercel (miễn phí)

### Bước 1: Tạo tài khoản GitHub
- Vào https://github.com và đăng ký tài khoản (nếu chưa có)

### Bước 2: Upload code lên GitHub
- Tạo repository mới tên `simple-crm`
- Upload toàn bộ thư mục này lên

### Bước 3: Deploy lên Vercel
1. Vào https://vercel.com và đăng ký bằng GitHub
2. Nhấn "New Project"
3. Chọn repository `simple-crm`
4. Vercel tự nhận ra Vite, nhấn Deploy
5. Sau ~1 phút có link dạng: `simple-crm.vercel.app`

## Google Sheet làm backend (nhiều người dùng chung dữ liệu)

Ứng dụng **không thể** gọi Google Sheets API trực tiếp từ trình duyệt với tài khoản service (sẽ lộ private key). Cách làm: **Vercel Serverless** (`/api/orders`) ghi/đọc Sheet; web chỉ gọi API cùng domain.

### 1) Tạo Google Cloud & Service Account
1. [Google Cloud Console](https://console.cloud.google.com/) → tạo project (hoặc chọn project có sẵn).
2. **APIs & Services → Library** → bật **Google Sheets API**.
3. **IAM → Service Accounts** → Create → tạo key kiểu **JSON**, lấy `client_email` và `private_key`.

### 2) Tạo Spreadsheet
1. Tạo file Google Sheet mới.
2. Đổi tên tab thành **Đơn Hàng** (hoặc đặt tên khác rồi khai báo `GOOGLE_SHEET_TAB_NAME` trên Vercel).
3. **Chia sẻ** Sheet → thêm email service account (dạng `...@...gserviceaccount.com`) với quyền **Biên tập viên**.
4. Copy **ID** trong URL: `https://docs.google.com/spreadsheets/d/`**`PASTE_ID_HERE`**`/edit`

### Cấu trúc Sheet chính thức (dòng 1 = tiêu đề, dòng 2 trở đi = đơn)

Tab mặc định **`Đơn Hàng`**. API ghi đủ **18 cột** theo đúng thứ tự sau (cột **A–R**). Bạn có thể tạo dòng 1 trong Sheet trùng tên cột này; lần lưu từ app sẽ ghi lại hàng tiêu đề + dữ liệu.

| Cột | Tiêu đề cột | Ghi chú |
|-----|----------------|--------|
| A | id | Số id nội bộ (app tự gán khi tạo đơn) |
| B | Ngày tháng | Tuỳ dùng / import |
| C | Tên KH | Bắt buộc có để đơn hợp lệ |
| D | Số điện thoại | |
| E | Sản phẩm | |
| F | Thành tiền | |
| G | Tiền cọc | |
| H | Còn lại | |
| I | Ngày đặt | Định dạng ngày (YYYY-MM-DD khi nhập từ form) |
| J | Ngày gửi hàng | |
| K | Giao thợ may | **Tên** thợ may |
| L | Thợ may trả | **Ngày** thợ may trả |
| M | Giao thợ thêu | **Tên** thợ thêu |
| N | Thợ thêu trả | **Ngày** thợ thêu trả |
| O | Trạng thái | Đơn mới, Order Vải, Gửi Thợ May, Gửi Thợ Thêu, Gửi Hàng, Đã Nhận, Hoàn Đơn, Sửa Lại SP, Bỏ Cọc |
| P | Ngày giao thợ may | Ngày giao vải cho thợ may |
| Q | Ngày giao thợ thêu | Ngày giao cho thợ thêu |
| R | Không cần thêu | Điền **`Có`** nếu đơn không cần thêu; để trống = cần thêu |

Sheet cũ chỉ có **15 cột (A–O)** vẫn đọc được; cột P–R thiếu sẽ coi như trống. Lần **lưu** từ app sau đó sẽ ghi đủ 18 cột.

### 3) Biến môi trường trên Vercel
Trong project Vercel → **Settings → Environment Variables**:

| Biến | Ghi chú |
|------|---------|
| `GOOGLE_SPREADSHEET_ID` | ID từ URL Sheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` trong JSON |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` trong JSON (giữ nguyên xuống dòng, khi dán vào Vercel thường dùng `\n` thay cho newline) |
| `GOOGLE_SHEET_TAB_NAME` | (tuỳ chọn) Mặc định `Đơn Hàng` |
| `SHEETS_SYNC_TOKEN` | (tuỳ chọn) Chuỗi bí mật; nếu có thì bắt buộc header `Authorization: Bearer …` khớp |
| `VITE_USE_SHEETS` | Đặt `true` để bật đồng bộ Sheet từ frontend |
| `VITE_SHEETS_SYNC_TOKEN` | (tuỳ chọn) Cùng giá trị với `SHEETS_SYNC_TOKEN` nếu dùng |
| `VITE_LOGIN_USERNAME` | (tuỳ chọn) Bật màn hình đăng nhập khi có đủ username + password |
| `VITE_LOGIN_PASSWORD` | (tuỳ chọn) Mật khẩu đăng nhập frontend |

Sau khi thêm biến → **Redeploy** để build lại (biến `VITE_*` được nhúng lúc build).

Lưu ý bảo mật: `VITE_*` nằm trong bundle frontend, phù hợp để chặn truy cập nội bộ cơ bản. Không thay thế cơ chế auth server thật.

### 4) Chạy local có API Sheet
`npm run dev` chỉ chạy Vite, không có `/api`. Dùng CLI Vercel: `npx vercel dev` (cần đăng nhập Vercel, biến môi trường lấy từ project hoặc file `.env.local`).

## Chạy local
```bash
npm install
npm run dev
```
