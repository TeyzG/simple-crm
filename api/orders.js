const { google } = require('googleapis')

/** 15 cột gốc + 3 cột mới (giữ thứ tự cũ để Sheet cũ vẫn đọc được). */
const HEADER_ROW = [
  'id',
  'Ngày tháng',
  'Tên KH',
  'Số điện thoại',
  'Sản phẩm',
  'Thành tiền',
  'Tiền cọc',
  'Còn lại',
  'Ngày đặt',
  'Ngày gửi hàng',
  'Giao thợ may',
  'Thợ may trả',
  'Giao thợ thêu',
  'Thợ thêu trả',
  'Trạng thái',
  'Ngày giao thợ may',
  'Ngày giao thợ thêu',
  'Không cần thêu',
]

const COL_LAST = 'R'
const COL_COUNT = HEADER_ROW.length

function quoteSheet(name) {
  const safe = String(name || 'Sheet1').replace(/'/g, "''")
  return `'${safe}'`
}

function getSheetName() {
  return process.env.GOOGLE_SHEET_TAB_NAME || 'Đơn Hàng'
}

function getSpreadsheetId() {
  return process.env.GOOGLE_SPREADSHEET_ID || ''
}

function jwtFromEnv() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) return null
  const key = String(rawKey).replace(/\\n/g, '\n')
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function checkToken(req, res) {
  const expected = process.env.SHEETS_SYNC_TOKEN
  if (!expected) return true
  const h = req.headers.authorization || ''
  if (h !== `Bearer ${expected}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

function padRow(row) {
  const r = row || []
  return [...r, ...Array(COL_COUNT - r.length).fill('')]
}

function parseKhongCanTheu(v) {
  if (v === true || v === false) return v
  const s = String(v || '').trim().toLowerCase()
  return s === 'có' || s === 'co' || s === 'x' || s === '1' || s === 'true' || s === 'yes'
}

function rowToOrder(row) {
  if (!row || !row.length) return null
  const p = padRow(row)
  const [
    id,
    ngayThang,
    tenKH,
    soDienThoai,
    sanPham,
    thanhTien,
    tienCoc,
    conLai,
    ngayDat,
    ngayGuiHang,
    giaoThoMay,
    thoMayTra,
    giaoThoTheu,
    thoTheuTra,
    trangThai,
    ngayGiaoThoMay,
    ngayGiaoThoTheu,
    khongCanTheuCell,
  ] = p
  const name = String(tenKH || '').trim()
  if (!name) return null
  const idNum = Number(id)
  return {
    id: Number.isFinite(idNum) && idNum > 0 ? idNum : id || Date.now(),
    ngayThang: ngayThang != null ? String(ngayThang) : '',
    tenKH: name,
    soDienThoai: soDienThoai != null ? String(soDienThoai) : '',
    sanPham: sanPham != null ? String(sanPham) : '',
    thanhTien: thanhTien != null ? String(thanhTien) : '',
    tienCoc: tienCoc != null ? String(tienCoc) : '',
    conLai: conLai != null ? String(conLai) : '',
    ngayDat: ngayDat != null ? String(ngayDat) : '',
    ngayGuiHang: ngayGuiHang != null ? String(ngayGuiHang) : '',
    giaoThoMay: giaoThoMay != null ? String(giaoThoMay) : '',
    thoMayTra: thoMayTra != null ? String(thoMayTra) : '',
    giaoThoTheu: giaoThoTheu != null ? String(giaoThoTheu) : '',
    thoTheuTra: thoTheuTra != null ? String(thoTheuTra) : '',
    trangThai: trangThai != null ? String(trangThai) : 'Mới',
    ngayGiaoThoMay: ngayGiaoThoMay != null ? String(ngayGiaoThoMay) : '',
    ngayGiaoThoTheu: ngayGiaoThoTheu != null ? String(ngayGiaoThoTheu) : '',
    khongCanTheu: parseKhongCanTheu(khongCanTheuCell),
  }
}

function orderToRow(o) {
  const k = o.khongCanTheu === true ? 'Có' : ''
  return [
    o.id,
    o.ngayThang ?? '',
    o.tenKH ?? '',
    o.soDienThoai ?? '',
    o.sanPham ?? '',
    o.thanhTien ?? '',
    o.tienCoc ?? '',
    o.conLai ?? '',
    o.ngayDat ?? '',
    o.ngayGuiHang ?? '',
    o.giaoThoMay ?? '',
    o.thoMayTra ?? '',
    o.giaoThoTheu ?? '',
    o.thoTheuTra ?? '',
    o.trangThai ?? 'Mới',
    o.ngayGiaoThoMay ?? '',
    o.ngayGiaoThoTheu ?? '',
    k,
  ]
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  if (!checkToken(req, res)) return

  const auth = jwtFromEnv()
  const spreadsheetId = getSpreadsheetId()
  if (!auth || !spreadsheetId) {
    res.status(503).json({
      error:
        'Chưa cấu hình Google Sheet trên server (GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).',
    })
    return
  }

  const sheet = getSheetName()
  const rangePrefix = `${quoteSheet(sheet)}!`

  try {
    await auth.authorize()
  } catch (e) {
    res.status(500).json({ error: 'Đăng nhập Google thất bại: ' + (e.message || String(e)) })
    return
  }

  const sheets = google.sheets({ version: 'v4', auth })
  const wideRange = `${rangePrefix}A1:${COL_LAST}50000`
  const dataRange = `${rangePrefix}A2:${COL_LAST}50000`

  if (req.method === 'GET') {
    try {
      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: dataRange,
        majorDimension: 'ROWS',
      })
      const rows = data.values || []
      const orders = []
      for (const row of rows) {
        const o = rowToOrder(row)
        if (o) orders.push(o)
      }
      res.status(200).json({ orders })
    } catch (e) {
      const msg = e.message || String(e)
      if (msg.includes(404) || msg.toLowerCase().includes('not found')) {
        res.status(404).json({
          error:
            'Không đọc được Sheet. Kiểm tra GOOGLE_SPREADSHEET_ID và tên tab GOOGLE_SHEET_TAB_NAME (mặc định "Đơn Hàng").',
        })
        return
      }
      if (msg.includes(403) || msg.toLowerCase().includes('permission')) {
        res.status(403).json({
          error:
            'Service account chưa được chia sẻ quyền chỉnh sửa Spreadsheet. Mở Sheet → Chia sẻ → thêm email service account với quyền Biên tập viên.',
        })
        return
      }
      res.status(500).json({ error: msg })
    }
    return
  }

  if (req.method === 'POST') {
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}')
      } catch {
        res.status(400).json({ error: 'JSON không hợp lệ' })
        return
      }
    }
    const list = body && Array.isArray(body.orders) ? body.orders : null
    if (!list) {
      res.status(400).json({ error: 'Thiếu mảng orders' })
      return
    }

    const rows = [HEADER_ROW, ...list.map(orderToRow)]

    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: wideRange,
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${rangePrefix}A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      })
      res.status(200).json({ ok: true, count: list.length })
    } catch (e) {
      const msg = e.message || String(e)
      res.status(500).json({ error: msg })
    }
    return
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS')
  res.status(405).json({ error: 'Method not allowed' })
}
