import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import * as XLSX from 'xlsx'
import { APP_TABS, DEFAULT_STATUS, ORDER_STATUSES, STATUS_CLASS_MAP } from './config/appConfig'

const STORAGE_KEY = 'simple_orders'
const useSheets = import.meta.env.VITE_USE_SHEETS === 'true'
const LOGIN_STORAGE_KEY = 'simple_crm_login_ok'
const AUTH_USERNAME = import.meta.env.VITE_LOGIN_USERNAME || ''
const AUTH_PASSWORD = import.meta.env.VITE_LOGIN_PASSWORD || ''
const authRequired = AUTH_USERNAME !== '' && AUTH_PASSWORD !== ''

const EMPTY_ORDER = {
  ngayThang: '',
  tenKH: '',
  soDienThoai: '',
  sanPham: '',
  thanhTien: '',
  tienCoc: '',
  conLai: '',
  ngayDat: '',
  ngayGuiHang: '',
  giaoThoMay: '',
  ngayGiaoThoMay: '',
  thoMayTra: '',
  giaoThoTheu: '',
  ngayGiaoThoTheu: '',
  thoTheuTra: '',
  khongCanTheu: false,
  trangThai: DEFAULT_STATUS,
}

function migrateOrder(o) {
  if (!o || typeof o !== 'object') return { ...EMPTY_ORDER }
  const k = o.khongCanTheu
  const khongCanTheu =
    k === true ||
    k === 'Có' ||
    String(k || '').trim().toLowerCase() === 'có' ||
    String(k || '').trim().toLowerCase() === 'co'
  return {
    ...EMPTY_ORDER,
    ...o,
    khongCanTheu,
    ngayGiaoThoMay: o.ngayGiaoThoMay ?? '',
    ngayGiaoThoTheu: o.ngayGiaoThoTheu ?? '',
  }
}

function migrateOrdersList(list) {
  if (!Array.isArray(list)) return []
  return list.map(migrateOrder)
}

function fmtDate(d) {
  if (!d) return ''
  if (d instanceof Date) return d.toLocaleDateString('vi-VN')
  return d
}

function fmtMoney(v) {
  if (!v && v !== 0) return ''
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v
  if (isNaN(n)) return v
  return n.toLocaleString('vi-VN') + '₫'
}

function parseExcelDate(v) {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().split('T')[0]
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
  return String(v)
}

function parseExcelBool(v) {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'có' || s === 'co' || s === 'x' || s === '1' || s === 'true' || s === 'yes'
}

function sheetsApiHeaders() {
  const h = { Accept: 'application/json' }
  const t = import.meta.env.VITE_SHEETS_SYNC_TOKEN
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

/** @typedef {'create'|'assignMay'|'assignTheu'|'fullEdit'|'bulkStatus'} ModalMode */

export default function App() {
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState(() => {
    if (useSheets) return []
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      return migrateOrdersList(raw)
    } catch {
      return []
    }
  })
  const [sheetLoading, setSheetLoading] = useState(useSheets)
  const [sheetError, setSheetError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Tất cả')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  /** @type {[ModalMode, function]} */
  const [modalMode, setModalMode] = useState(/** @type {ModalMode} */ ('create'))
  const [activeEditId, setActiveEditId] = useState(/** @type {number|null} */ (null))
  const [bulkIds, setBulkIds] = useState(/** @type {number[]|null} */ (null))
  const [form, setForm] = useState(EMPTY_ORDER)
  const [importMsg, setImportMsg] = useState('')
  const [selectedIds, setSelectedIds] = useState(/** @type {number[]} */ ([]))
  const [bulkStatusChoice, setBulkStatusChoice] = useState(ORDER_STATUSES[0])
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (!authRequired) return true
    return localStorage.getItem(LOGIN_STORAGE_KEY) === '1'
  })
  const [loginInput, setLoginInput] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const headerSelectAllRef = useRef(null)

  const PER_PAGE = 15

  const closeModal = useCallback(() => {
    setShowModal(false)
    setBulkIds(null)
    setActiveEditId(null)
  }, [])

  useEffect(() => {
    if (!useSheets) return
    let cancelled = false
    ;(async () => {
      setSheetError('')
      setSheetLoading(true)
      try {
        const res = await fetch('/api/orders', { headers: sheetsApiHeaders() })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || res.statusText)
        if (!cancelled) setOrders(migrateOrdersList(j.orders))
      } catch (e) {
        if (!cancelled) setSheetError(e.message || String(e))
      } finally {
        if (!cancelled) setSheetLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function save(data) {
    const normalized = migrateOrdersList(data)
    if (!useSheets) {
      setOrders(normalized)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
      return
    }
    setSyncing(true)
    setSheetError('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { ...sheetsApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: normalized }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || res.statusText)
      setOrders(normalized)
    } catch (e) {
      const msg = e.message || String(e)
      setSheetError(msg)
      throw e
    } finally {
      setSyncing(false)
    }
  }

  function openCreate() {
    setModalMode('create')
    setActiveEditId(null)
    setBulkIds(null)
    setForm({ ...EMPTY_ORDER, ngayDat: new Date().toISOString().split('T')[0] })
    setShowModal(true)
  }

  function openFullEdit(o) {
    setModalMode('fullEdit')
    setActiveEditId(o.id)
    setBulkIds(null)
    setForm(migrateOrder(o))
    setShowModal(true)
  }

  function openAssignMay(o) {
    setModalMode('assignMay')
    setActiveEditId(o.id)
    setBulkIds(null)
    const m = migrateOrder(o)
    setForm({
      ...EMPTY_ORDER,
      giaoThoMay: m.giaoThoMay,
      ngayGiaoThoMay: m.ngayGiaoThoMay,
      thoMayTra: m.thoMayTra,
      ngayGuiHang: m.ngayGuiHang,
    })
    setShowModal(true)
  }

  function openAssignTheu(o) {
    if (o.khongCanTheu) {
      alert('Đơn đánh dấu không cần thêu — không mở form giao thợ thêu.')
      return
    }
    setModalMode('assignTheu')
    setActiveEditId(o.id)
    setBulkIds(null)
    const m = migrateOrder(o)
    setForm({
      ...EMPTY_ORDER,
      giaoThoTheu: m.giaoThoTheu,
      ngayGiaoThoTheu: m.ngayGiaoThoTheu,
      thoTheuTra: m.thoTheuTra,
    })
    setShowModal(true)
  }

  function openBulkAssignMay() {
    if (!selectedIds.length) return
    setModalMode('assignMay')
    setActiveEditId(null)
    setBulkIds([...selectedIds])
    setForm({
      ...EMPTY_ORDER,
      giaoThoMay: '',
      ngayGiaoThoMay: new Date().toISOString().split('T')[0],
      thoMayTra: '',
      ngayGuiHang: '',
    })
    setShowModal(true)
  }

  function openBulkAssignTheu() {
    const ids = selectedIds.filter(id => {
      const o = orders.find(x => x.id === id)
      return o && !o.khongCanTheu
    })
    if (!ids.length) {
      alert('Chọn ít nhất một đơn cần thêu (bỏ qua đơn “không cần thêu”).')
      return
    }
    setModalMode('assignTheu')
    setActiveEditId(null)
    setBulkIds(ids)
    setForm({
      ...EMPTY_ORDER,
      giaoThoTheu: '',
      ngayGiaoThoTheu: new Date().toISOString().split('T')[0],
      thoTheuTra: '',
    })
    setShowModal(true)
  }

  function openBulkStatusModal() {
    if (!selectedIds.length) return
    setModalMode('bulkStatus')
    setActiveEditId(null)
    setBulkIds([...selectedIds])
    setForm({ ...EMPTY_ORDER, trangThai: bulkStatusChoice })
    setShowModal(true)
  }

  async function submitForm() {
    try {
      if (modalMode === 'create') {
        if (!form.tenKH.trim()) {
          alert('Vui lòng nhập tên khách hàng')
          return
        }
        const row = { ...form, id: Date.now() }
        await save([migrateOrder(row), ...orders])
        closeModal()
        return
      }

      if (modalMode === 'fullEdit') {
        if (!form.tenKH.trim()) {
          alert('Vui lòng nhập tên khách hàng')
          return
        }
        if (activeEditId == null) return
        const next = orders.map(o => (o.id === activeEditId ? migrateOrder({ ...form, id: activeEditId }) : o))
        await save(next)
        closeModal()
        return
      }

      if (modalMode === 'assignMay') {
        const patch = {
          giaoThoMay: form.giaoThoMay,
          ngayGiaoThoMay: form.ngayGiaoThoMay,
          thoMayTra: form.thoMayTra,
          ngayGuiHang: form.ngayGuiHang,
        }
        if (bulkIds && bulkIds.length) {
          const set = new Set(bulkIds)
          const next = orders.map(o => (set.has(o.id) ? migrateOrder({ ...o, ...patch }) : o))
          await save(next)
          setSelectedIds([])
        } else if (activeEditId != null) {
          const next = orders.map(o =>
            o.id === activeEditId ? migrateOrder({ ...o, ...patch }) : o,
          )
          await save(next)
        }
        closeModal()
        return
      }

      if (modalMode === 'assignTheu') {
        const patch = {
          giaoThoTheu: form.giaoThoTheu,
          ngayGiaoThoTheu: form.ngayGiaoThoTheu,
          thoTheuTra: form.thoTheuTra,
        }
        if (bulkIds && bulkIds.length) {
          const set = new Set(bulkIds)
          const next = orders.map(o =>
            set.has(o.id) && !o.khongCanTheu ? migrateOrder({ ...o, ...patch }) : o,
          )
          await save(next)
          setSelectedIds([])
        } else if (activeEditId != null) {
          const o0 = orders.find(o => o.id === activeEditId)
          if (o0?.khongCanTheu) {
            alert('Đơn không cần thêu.')
            return
          }
          const next = orders.map(o =>
            o.id === activeEditId ? migrateOrder({ ...o, ...patch }) : o,
          )
          await save(next)
        }
        closeModal()
        return
      }

      if (modalMode === 'bulkStatus') {
        if (!bulkIds?.length) return
        const set = new Set(bulkIds)
        const st = form.trangThai
        const next = orders.map(o => (set.has(o.id) ? migrateOrder({ ...o, trangThai: st }) : o))
        await save(next)
        setSelectedIds([])
        closeModal()
        return
      }
    } catch {
      alert('Không lưu được. Kiểm tra thông báo lỗi trên trang (hoặc Google Sheet).')
    }
  }

  async function deleteOrder(id) {
    if (!confirm('Xoá đơn hàng này?')) return
    try {
      await save(orders.filter(o => o.id !== id))
      setSelectedIds(prev => prev.filter(x => x !== id))
    } catch {
      alert('Không cập nhật được dữ liệu.')
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function selectAllOnPage(ids) {
    const allSelected = ids.length && ids.every(id => selectedIds.includes(id))
    if (allSelected) setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
    else setSelectedIds(prev => [...new Set([...prev, ...ids])])
  }

  function clearSelection() {
    setSelectedIds([])
  }

  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const imported = rows.map((r, i) =>
          migrateOrder({
            id: Date.now() + i,
            ngayThang: parseExcelDate(r['Ngày tháng'] || r['ngayThang'] || ''),
            tenKH: r['Tên KH'] || r['tenKH'] || '',
            soDienThoai: String(r['Số điện thoại '] || r['Số điện thoại'] || r['soDienThoai'] || ''),
            sanPham: r['Sản phẩm'] || r['sanPham'] || '',
            thanhTien: r['Thành tiền'] || r['thanhTien'] || '',
            tienCoc: r['Tiền cọc'] || r['tienCoc'] || '',
            conLai: r['Còn lại'] || r['conLai'] || '',
            ngayDat: parseExcelDate(r['Ngày đặt'] || r['ngayDat'] || ''),
            ngayGuiHang: parseExcelDate(r['Ngày gửi hàng'] || r['ngayGuiHang'] || ''),
            giaoThoMay: r['Giao thợ may'] || r['giaoThoMay'] || '',
            ngayGiaoThoMay: parseExcelDate(r['Ngày giao thợ may'] || r['ngayGiaoThoMay'] || ''),
            thoMayTra: parseExcelDate(r['Thợ may trả'] || r['thoMayTra'] || ''),
            giaoThoTheu: r['Giao thợ thêu'] || r['giaoThoTheu'] || '',
            ngayGiaoThoTheu: parseExcelDate(r['Ngày giao thợ thêu'] || r['ngayGiaoThoTheu'] || ''),
            thoTheuTra: parseExcelDate(r['Thợ thêu trả'] || r['thoTheuTra'] || ''),
            khongCanTheu: parseExcelBool(r['Không cần thêu'] ?? r['khongCanTheu']),
            trangThai: r['Trang thái'] || r['Trạng thái'] || r['trangThai'] || DEFAULT_STATUS,
          }),
        ).filter(r => r.tenKH)
        await save([...imported, ...orders])
        setImportMsg(`Đã nhập ${imported.length} đơn hàng`)
        setTimeout(() => setImportMsg(''), 4000)
        setTab('orders')
      } catch (err) {
        alert('Lỗi đọc file hoặc đồng bộ: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  function exportXLSX() {
    const data = filtered.map(o => ({
      'Ngày tháng': o.ngayThang,
      'Tên KH': o.tenKH,
      'Số điện thoại': o.soDienThoai,
      'Sản phẩm': o.sanPham,
      'Thành tiền': o.thanhTien,
      'Tiền cọc': o.tienCoc,
      'Còn lại': o.conLai,
      'Ngày đặt': o.ngayDat,
      'Ngày gửi hàng': o.ngayGuiHang,
      'Giao thợ may': o.giaoThoMay,
      'Ngày giao thợ may': o.ngayGiaoThoMay,
      'Thợ may trả': o.thoMayTra,
      'Giao thợ thêu': o.giaoThoTheu,
      'Ngày giao thợ thêu': o.ngayGiaoThoTheu,
      'Thợ thêu trả': o.thoTheuTra,
      'Không cần thêu': o.khongCanTheu ? 'Có' : '',
      'Trạng thái': o.trangThai,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Đơn Hàng')
    XLSX.writeFile(wb, `simple_DonHang_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`)
  }

  const isMayTab = tab === 'may-management'
  const isTheuTab = tab === 'theu-management'
  const isOrdersTab = tab === 'orders'

  const filtered = useMemo(() => {
    let list = orders
    if (isMayTab) list = list.filter(o => o.trangThai === 'Gửi Thợ May')
    if (isTheuTab) list = list.filter(o => o.trangThai === 'Gửi Thợ Thêu')
    if (isOrdersTab && statusFilter !== 'Tất cả') list = list.filter(o => o.trangThai === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        o =>
          (o.tenKH || '').toLowerCase().includes(q) ||
          (o.soDienThoai || '').includes(q) ||
          (o.sanPham || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [orders, search, statusFilter, isMayTab, isTheuTab, isOrdersTab])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageData = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const pageIds = pageData.map(o => o.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id))
  const somePageSelected = pageIds.some(id => selectedIds.includes(id))

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current
    if (el) el.indeterminate = somePageSelected && !allPageSelected
  }, [somePageSelected, allPageSelected])

  const selectedNeedTheu = selectedIds.filter(id => {
    const o = orders.find(x => x.id === id)
    return o && !o.khongCanTheu
  }).length

  useEffect(() => {
    setPage(1)
    setSelectedIds([])
  }, [search, statusFilter, tab])

  const stats = useMemo(() => {
    const total = orders.length
    const done = orders.filter(o => ['Đã Nhận', 'Hoàn Đơn'].includes(o.trangThai)).length
    const pending = orders.filter(o => !['Đã Nhận', 'Hoàn Đơn', 'Bỏ Cọc'].includes(o.trangThai)).length
    const revenue = orders.reduce((s, o) => {
      const v = parseFloat(String(o.thanhTien).replace(/[^\d.]/g, ''))
      return s + (isNaN(v) ? 0 : v)
    }, 0)
    return { total, done, pending, revenue }
  }, [orders])

  function modalTitle() {
    if (modalMode === 'create') return 'Lên đơn'
    if (modalMode === 'fullEdit') return 'Sửa đầy đủ'
    if (modalMode === 'assignMay') return bulkIds?.length ? `Giao thợ may (${bulkIds.length} đơn)` : 'Giao thợ may'
    if (modalMode === 'assignTheu') return bulkIds?.length ? `Giao thợ thêu (${bulkIds.length} đơn)` : 'Giao thợ thêu'
    if (modalMode === 'bulkStatus') return `Đổi trạng thái (${bulkIds?.length || 0} đơn)`
    return ''
  }

  function renderRowActions(o) {
    return (
      <div className="row-actions">
        <button type="button" className="btn btn-sm btn-touch" onClick={() => openFullEdit(o)}>
          Sửa đủ
        </button>
        <button type="button" className="btn btn-sm btn-touch" onClick={() => openAssignMay(o)}>
          Giao may
        </button>
        <button
          type="button"
          className="btn btn-sm btn-touch"
          disabled={!!o.khongCanTheu}
          title={o.khongCanTheu ? 'Đơn không cần thêu' : ''}
          onClick={() => openAssignTheu(o)}
        >
          Giao thêu
        </button>
        <button type="button" className="btn btn-sm btn-touch btn-danger-text" onClick={() => deleteOrder(o.id)}>
          Xoá
        </button>
      </div>
    )
  }

  function orderSummaryLines(o) {
    const may = [o.giaoThoMay, o.ngayGiaoThoMay && fmtDate(o.ngayGiaoThoMay), o.thoMayTra && fmtDate(o.thoMayTra)]
      .filter(Boolean)
      .join(' · ')
    const theu = o.khongCanTheu
      ? 'Không thêu'
      : [o.giaoThoTheu, o.ngayGiaoThoTheu && fmtDate(o.ngayGiaoThoTheu), o.thoTheuTra && fmtDate(o.thoTheuTra)]
          .filter(Boolean)
          .join(' · ') || '—'
    return { may: may || '—', theu }
  }

  function submitLogin(e) {
    e.preventDefault()
    if (!authRequired) {
      setIsAuthenticated(true)
      return
    }
    const ok = loginInput.username === AUTH_USERNAME && loginInput.password === AUTH_PASSWORD
    if (!ok) {
      setLoginError('Sai tên đăng nhập hoặc mật khẩu.')
      return
    }
    localStorage.setItem(LOGIN_STORAGE_KEY, '1')
    setIsAuthenticated(true)
    setLoginError('')
    setLoginInput({ username: '', password: '' })
  }

  function logout() {
    localStorage.removeItem(LOGIN_STORAGE_KEY)
    setIsAuthenticated(false)
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-page">
        <form className="auth-card" onSubmit={submitLogin}>
          <h2>Đăng nhập CRM</h2>
          <p>Dùng tài khoản cấu hình trong file `.env` để vào hệ thống.</p>
          <label>
            Tên đăng nhập
            <input
              value={loginInput.username}
              onChange={e => setLoginInput(v => ({ ...v, username: e.target.value }))}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={loginInput.password}
              onChange={e => setLoginInput(v => ({ ...v, password: e.target.value }))}
              autoComplete="current-password"
              required
            />
          </label>
          {loginError && <div className="auth-error">{loginError}</div>}
          <button type="submit" className="btn btn-primary btn-touch auth-submit">Đăng nhập</button>
        </form>
      </div>
    )
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Simple</h1>
          <p>Quản lý đơn hàng{useSheets ? ' · Google Sheet' : ''}</p>
          {authRequired && (
            <button type="button" className="btn btn-sm sidebar-logout" onClick={logout}>
              Đăng xuất
            </button>
          )}
        </div>
        <nav className="sidebar-nav">
          {APP_TABS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {sheetError && <div className="banner banner-error">{sheetError}</div>}
        {syncing && <div className="banner banner-muted">Đang đồng bộ Google Sheet…</div>}
        {importMsg && <div className="banner banner-success">{importMsg}</div>}

        {(tab === 'orders' || tab === 'may-management' || tab === 'theu-management') && (
          <>
            {sheetLoading && (
              <div className="page-header muted">
                <h2>Đang tải dữ liệu từ Google Sheet…</h2>
              </div>
            )}
            <div className="page-header" style={{ display: sheetLoading ? 'none' : undefined }}>
              <h2>
                {isMayTab ? 'Quản lý may' : isTheuTab ? 'Quản lý thêu' : 'Danh sách đơn hàng'}
              </h2>
              <p>
                {isMayTab
                  ? 'Danh sách đơn có trạng thái "Gửi Thợ May"'
                  : isTheuTab
                    ? 'Danh sách đơn có trạng thái "Gửi Thợ Thêu"'
                    : 'Quản lý đơn hàng may và thêu — chọn nhiều đơn để thao tác hàng loạt'}
              </p>
            </div>

            <div className="stats-row" style={{ display: sheetLoading ? 'none' : undefined }}>
              <div className="stat-card">
                <div className="stat-label">Tổng đơn</div>
                <div className="stat-val">{stats.total}</div>
              </div>
              <div className="stat-card stat-accent">
                <div className="stat-label">Đang xử lý</div>
                <div className="stat-val">{stats.pending}</div>
              </div>
              <div className="stat-card stat-green">
                <div className="stat-label">Hoàn tất</div>
                <div className="stat-val">{stats.done}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Doanh thu</div>
                <div className="stat-val stat-val-sm">
                  {stats.revenue > 0 ? (stats.revenue / 1000000).toFixed(1) + 'M' : '—'}
                </div>
              </div>
            </div>

            {isOrdersTab && (
              <div className="filter-chips" style={{ display: sheetLoading ? 'none' : undefined }}>
                {['Tất cả', ...ORDER_STATUSES].map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`chip ${statusFilter === s ? 'active' : ''}`}
                    onClick={() => {
                      setStatusFilter(s)
                      setPage(1)
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="toolbar toolbar-wrap" style={{ display: sheetLoading ? 'none' : undefined }}>
              <div className="toolbar-search">
                <span className="search-icon" aria-hidden>⌕</span>
                <input
                  placeholder="Tìm tên KH, SĐT, sản phẩm..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
              <button type="button" className="btn btn-touch" onClick={exportXLSX}>
                Xuất Excel
              </button>
              {isOrdersTab && (
                <button type="button" className="btn btn-primary btn-touch" onClick={openCreate}>
                  + Lên đơn
                </button>
              )}
            </div>

            {selectedIds.length > 0 && (
              <div className="bulk-bar">
                <span className="bulk-bar-label">
                  Đã chọn <strong>{selectedIds.length}</strong> đơn
                  {selectedNeedTheu < selectedIds.length && (
                    <span className="bulk-bar-sub"> ({selectedNeedTheu} đơn cần thêu)</span>
                  )}
                </span>
                <div className="bulk-bar-actions">
                  <button type="button" className="btn btn-touch" onClick={openBulkAssignMay}>
                    Giao thợ may
                  </button>
                  <button type="button" className="btn btn-touch" onClick={openBulkAssignTheu} disabled={!selectedNeedTheu}>
                    Giao thợ thêu
                  </button>
                  <div className="bulk-status-inline">
                    <select
                      className="bulk-status-select"
                      value={bulkStatusChoice}
                      onChange={e => setBulkStatusChoice(e.target.value)}
                    >
                      {ORDER_STATUSES.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-touch" onClick={openBulkStatusModal}>
                      Đổi trạng thái
                    </button>
                  </div>
                  <button type="button" className="btn btn-touch" onClick={clearSelection}>
                    Bỏ chọn
                  </button>
                </div>
              </div>
            )}

            <div className="table-wrap table-desktop" style={{ display: sheetLoading ? 'none' : undefined }}>
              <table>
                <thead>
                  <tr>
                    <th className="th-check">
                      <input
                        ref={headerSelectAllRef}
                        type="checkbox"
                        aria-label="Chọn tất cả đơn trên trang này"
                        checked={allPageSelected}
                        onChange={() => selectAllOnPage(pageIds)}
                      />
                    </th>
                    <th>Ngày đặt</th>
                    <th>Khách hàng</th>
                    <th>Sản phẩm</th>
                    <th>Thành tiền</th>
                    <th>Còn lại</th>
                    <th>Ngày giao</th>
                    <th>Trạng thái</th>
                    <th className="th-actions">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="empty">
                          <div className="empty-icon" aria-hidden>
                            —
                          </div>
                          <p>
                            {orders.length === 0
                              ? 'Chưa có đơn hàng. Lên đơn hoặc nhập Excel.'
                              : 'Không tìm thấy đơn phù hợp.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pageData.map(o => {
                      const { may, theu } = orderSummaryLines(o)
                      return (
                        <tr key={o.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(o.id)}
                              onChange={() => toggleSelect(o.id)}
                              aria-label={'Chọn ' + o.tenKH}
                            />
                          </td>
                          <td className="td-muted">{fmtDate(o.ngayDat) || fmtDate(o.ngayThang)}</td>
                          <td>
                            <div className="cell-strong">{o.tenKH}</div>
                            <div className="cell-sub">{o.soDienThoai}</div>
                          </td>
                          <td>{o.sanPham}</td>
                          <td className="cell-strong">{fmtMoney(o.thanhTien)}</td>
                          <td
                            className="cell-strong"
                            style={{
                              color:
                                o.conLai && parseFloat(String(o.conLai).replace(/\D/g, '')) > 0
                                  ? 'var(--red)'
                                  : 'var(--green)',
                            }}
                          >
                            {fmtMoney(o.conLai)}
                          </td>
                          <td className="td-muted">{fmtDate(o.ngayGuiHang)}</td>
                          <td>
                            <span className={`badge ${STATUS_CLASS_MAP[o.trangThai] || 'badge-new'}`}>{o.trangThai || DEFAULT_STATUS}</span>
                            {o.khongCanTheu && (
                              <span className="badge badge-muted" style={{ marginLeft: 6 }}>
                                Không thêu
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="table-actions-col">
                              <span className="table-meta" title="May">
                                {may}
                              </span>
                              <span className="table-meta" title="Thêu">
                                {theu}
                              </span>
                              {renderRowActions(o)}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="pagination">
                  <span className="page-info">{filtered.length} đơn</span>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`page-btn ${page === p ? 'active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="order-cards" style={{ display: sheetLoading ? 'none' : undefined }}>
              {pageData.length === 0 ? (
                <div className="empty card-empty">
                  <p>{orders.length === 0 ? 'Chưa có đơn hàng.' : 'Không có đơn trên trang này.'}</p>
                </div>
              ) : (
                pageData.map(o => {
                  const { may, theu } = orderSummaryLines(o)
                  return (
                    <article key={o.id} className="order-card">
                      <div className="order-card-top">
                        <label className="order-card-check">
                          <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggleSelect(o.id)} />
                          <span className={`badge ${STATUS_CLASS_MAP[o.trangThai] || 'badge-new'}`}>{o.trangThai || DEFAULT_STATUS}</span>
                          {o.khongCanTheu && <span className="badge badge-muted">Không thêu</span>}
                        </label>
                        <div className="order-card-date">{fmtDate(o.ngayDat) || fmtDate(o.ngayThang)}</div>
                      </div>
                      <div className="order-card-name">{o.tenKH}</div>
                      <div className="order-card-sub">{o.soDienThoai}</div>
                      <div className="order-card-product">{o.sanPham}</div>
                      <div className="order-card-money">
                        <span>{fmtMoney(o.thanhTien)}</span>
                        <span className="order-card-conlai">Còn: {fmtMoney(o.conLai)}</span>
                      </div>
                      <div className="order-card-flow">
                        <div>
                          <span className="flow-label">May</span> {may}
                        </div>
                        <div>
                          <span className="flow-label">Thêu</span> {theu}
                        </div>
                      </div>
                      <div className="order-card-actions">{renderRowActions(o)}</div>
                    </article>
                  )
                })
              )}
              {totalPages > 1 && (
                <div className="pagination card-pagination">
                  <span className="page-info">{filtered.length} đơn</span>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`page-btn ${page === p ? 'active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'import' && (
          <>
            <div className="page-header">
              <h2>Nhập dữ liệu từ Excel</h2>
              <p>File .xlsx — sheet đầu tiên</p>
            </div>
            <div className="table-wrap import-panel">
              <label className="import-area">
                <div className="import-area-icon" aria-hidden>
                  +
                </div>
                <p>Chọn file Excel</p>
                <p className="sub">.xlsx / .xls</p>
                <input type="file" accept=".xlsx,.xls" className="visually-hidden" onChange={handleImport} />
              </label>
              <div className="import-hint">
                <p className="import-hint-title">Cột hỗ trợ (có thể thiếu cột mới — sẽ để trống):</p>
                <p className="import-hint-body">
                  Ngày tháng, Tên KH, Số điện thoại, Sản phẩm, Thành tiền, Tiền cọc, Còn lại, Ngày đặt, Ngày gửi hàng, Giao thợ
                  may, Ngày giao thợ may, Thợ may trả, Giao thợ thêu, Ngày giao thợ thêu, Thợ thêu trả, Không cần thêu (Có
                  / để trống), Trạng thái
                </p>
              </div>
              <div className="import-actions">
                <button
                  type="button"
                  className="btn btn-touch"
                  onClick={async () => {
                    if (!confirm('Xoá toàn bộ dữ liệu?')) return
                    try {
                      await save([])
                      alert('Đã xoá toàn bộ dữ liệu')
                    } catch {
                      alert('Không xoá được.')
                    }
                  }}
                >
                  Xoá tất cả dữ liệu
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {showModal && (
        <div className="modal-overlay" role="presentation" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header">
              <h3 id="modal-title">{modalTitle()}</h3>
              <button type="button" className="modal-close btn-touch-icon" onClick={closeModal} aria-label="Đóng">
                ×
              </button>
            </div>
            <div className="modal-body">
              {(modalMode === 'create' || modalMode === 'fullEdit') && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Tên khách hàng *</label>
                    <input
                      value={form.tenKH}
                      onChange={e => setForm(f => ({ ...f, tenKH: e.target.value }))}
                      placeholder="Nguyễn Thị A"
                      autoComplete="name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Số điện thoại</label>
                    <input
                      value={form.soDienThoai}
                      onChange={e => setForm(f => ({ ...f, soDienThoai: e.target.value }))}
                      placeholder="0901 234 567"
                      inputMode="tel"
                    />
                  </div>
                  <div className="form-group full">
                    <label>Sản phẩm</label>
                    <input
                      value={form.sanPham}
                      onChange={e => setForm(f => ({ ...f, sanPham: e.target.value }))}
                      placeholder="Áo dài, khăn…"
                    />
                  </div>

                  <div className="form-section">Tài chính</div>
                  <div className="form-group">
                    <label>Thành tiền (VNĐ)</label>
                    <input
                      value={form.thanhTien}
                      onChange={e => setForm(f => ({ ...f, thanhTien: e.target.value }))}
                      placeholder="500000"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="form-group">
                    <label>Tiền cọc</label>
                    <input value={form.tienCoc} onChange={e => setForm(f => ({ ...f, tienCoc: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Còn lại</label>
                    <input value={form.conLai} onChange={e => setForm(f => ({ ...f, conLai: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Trạng thái</label>
                    <select value={form.trangThai} onChange={e => setForm(f => ({ ...f, trangThai: e.target.value }))}>
                      {ORDER_STATUSES.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-section">Ngày giao hàng</div>
                  <div className="form-group">
                    <label>Ngày đặt</label>
                    <input type="date" value={form.ngayDat} onChange={e => setForm(f => ({ ...f, ngayDat: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Ngày gửi hàng</label>
                    <input
                      type="date"
                      value={form.ngayGuiHang}
                      onChange={e => setForm(f => ({ ...f, ngayGuiHang: e.target.value }))}
                    />
                  </div>

                  {modalMode === 'create' && (
                    <>
                      <div className="form-section">Bước thêu</div>
                      <p className="form-hint full">
                        Thợ may và thợ thêu (tên, ngày giao, ngày trả) nhập sau trong danh sách đơn: Giao may / Giao thêu hoặc Sửa đủ.
                      </p>
                      <fieldset className="form-fieldset full">
                        <legend className="form-legend">Đơn có cần thêu không?</legend>
                        <label className="form-radio">
                          <input
                            type="radio"
                            name="canTheuCreate"
                            checked={!form.khongCanTheu}
                            onChange={() => setForm(f => ({ ...f, khongCanTheu: false }))}
                          />
                          <span>Cần thêu (sau này giao thợ thêu)</span>
                        </label>
                        <label className="form-radio">
                          <input
                            type="radio"
                            name="canTheuCreate"
                            checked={!!form.khongCanTheu}
                            onChange={() => setForm(f => ({ ...f, khongCanTheu: true }))}
                          />
                          <span>Không cần thêu</span>
                        </label>
                      </fieldset>
                    </>
                  )}

                  {modalMode === 'fullEdit' && (
                    <>
                      <div className="form-section">Thợ may</div>
                      <div className="form-group">
                        <label>Tên thợ may</label>
                        <input
                          value={form.giaoThoMay}
                          onChange={e => setForm(f => ({ ...f, giaoThoMay: e.target.value }))}
                          placeholder="Tên thợ may"
                        />
                      </div>
                      <div className="form-group">
                        <label>Ngày giao vải cho thợ may</label>
                        <input
                          type="date"
                          value={form.ngayGiaoThoMay}
                          onChange={e => setForm(f => ({ ...f, ngayGiaoThoMay: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Ngày thợ may trả</label>
                        <input type="date" value={form.thoMayTra} onChange={e => setForm(f => ({ ...f, thoMayTra: e.target.value }))} />
                      </div>

                      <div className="form-section">Thợ thêu</div>
                      <label className="form-check full">
                        <input
                          type="checkbox"
                          checked={!!form.khongCanTheu}
                          onChange={e => setForm(f => ({ ...f, khongCanTheu: e.target.checked }))}
                        />
                        <span>Đơn này không cần giao thợ thêu</span>
                      </label>
                      {!form.khongCanTheu && (
                        <>
                          <div className="form-group">
                            <label>Tên thợ thêu</label>
                            <input
                              value={form.giaoThoTheu}
                              onChange={e => setForm(f => ({ ...f, giaoThoTheu: e.target.value }))}
                              placeholder="Tên thợ thêu"
                            />
                          </div>
                          <div className="form-group">
                            <label>Ngày giao cho thợ thêu</label>
                            <input
                              type="date"
                              value={form.ngayGiaoThoTheu}
                              onChange={e => setForm(f => ({ ...f, ngayGiaoThoTheu: e.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Ngày thợ thêu trả</label>
                            <input
                              type="date"
                              value={form.thoTheuTra}
                              onChange={e => setForm(f => ({ ...f, thoTheuTra: e.target.value }))}
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {modalMode === 'assignMay' && (
                <div className="form-grid">
                  {bulkIds?.length ? (
                    <p className="form-hint full">Áp dụng cùng thông tin sau cho {bulkIds.length} đơn đã chọn.</p>
                  ) : (
                    <p className="form-hint full">Cập nhật giao vải / nhận hàng từ thợ may cho một đơn.</p>
                  )}
                  <div className="form-group full">
                    <label>Tên thợ may</label>
                    <input
                      value={form.giaoThoMay}
                      onChange={e => setForm(f => ({ ...f, giaoThoMay: e.target.value }))}
                      placeholder="Tên thợ may"
                    />
                  </div>
                  <div className="form-group">
                    <label>Ngày giao vải cho thợ may</label>
                    <input
                      type="date"
                      value={form.ngayGiaoThoMay}
                      onChange={e => setForm(f => ({ ...f, ngayGiaoThoMay: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Ngày thợ may trả</label>
                    <input type="date" value={form.thoMayTra} onChange={e => setForm(f => ({ ...f, thoMayTra: e.target.value }))} />
                  </div>
                  <div className="form-group full">
                    <label>Ngày gửi hàng (tuỳ chọn)</label>
                    <input
                      type="date"
                      value={form.ngayGuiHang}
                      onChange={e => setForm(f => ({ ...f, ngayGuiHang: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {modalMode === 'assignTheu' && (
                <div className="form-grid">
                  {bulkIds?.length ? (
                    <p className="form-hint full">Chỉ áp dụng cho đơn chưa đánh dấu “không cần thêu”. Đang gán {bulkIds.length} đơn.</p>
                  ) : (
                    <p className="form-hint full">Giao áo đã may cho thợ thêu.</p>
                  )}
                  <div className="form-group full">
                    <label>Tên thợ thêu</label>
                    <input
                      value={form.giaoThoTheu}
                      onChange={e => setForm(f => ({ ...f, giaoThoTheu: e.target.value }))}
                      placeholder="Tên thợ thêu"
                    />
                  </div>
                  <div className="form-group">
                    <label>Ngày giao cho thợ thêu</label>
                    <input
                      type="date"
                      value={form.ngayGiaoThoTheu}
                      onChange={e => setForm(f => ({ ...f, ngayGiaoThoTheu: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Ngày thợ thêu trả</label>
                    <input
                      type="date"
                      value={form.thoTheuTra}
                      onChange={e => setForm(f => ({ ...f, thoTheuTra: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {modalMode === 'bulkStatus' && (
                <div className="form-grid">
                  <p className="form-hint full">Đặt trạng thái mới cho {bulkIds?.length || 0} đơn đã chọn.</p>
                  <div className="form-group full">
                    <label>Trạng thái</label>
                    <select value={form.trangThai} onChange={e => setForm(f => ({ ...f, trangThai: e.target.value }))}>
                      {ORDER_STATUSES.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-touch" onClick={closeModal}>
                Huỷ
              </button>
              <button type="button" className="btn btn-primary btn-touch" onClick={submitForm}>
                {modalMode === 'create'
                  ? 'Thêm đơn'
                  : modalMode === 'bulkStatus'
                    ? 'Áp dụng'
                    : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
