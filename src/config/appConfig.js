export const ORDER_STATUSES = [
  'Đơn mới',
  'Order Vải',
  'Gửi Thợ May',
  'Gửi Thợ Thêu',
  'Gửi Hàng',
  'Đã Nhận',
  'Hoàn Đơn',
  'Sửa Lại SP',
  'Bỏ Cọc',
]

export const DEFAULT_STATUS = ORDER_STATUSES[0]

export const STATUS_CLASS_MAP = {
  'Đơn mới': 'badge-new',
  'Order Vải': 'badge-pending',
  'Gửi Thợ May': 'badge-pending',
  'Gửi Thợ Thêu': 'badge-pending',
  'Gửi Hàng': 'badge-pending',
  'Đã Nhận': 'badge-done',
  'Hoàn Đơn': 'badge-done',
  'Sửa Lại SP': 'badge-pending',
  'Bỏ Cọc': 'badge-cancel',
}

export const APP_TABS = [
  { id: 'orders', label: 'Đơn hàng' },
  { id: 'may-management', label: 'Quản lý may' },
  { id: 'theu-management', label: 'Quản lý thêu' },
  { id: 'import', label: 'Nhập dữ liệu' },
]
