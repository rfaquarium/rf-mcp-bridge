/**
 * =========================================================================
 * 🤖 RF WORKSPACE PRO - XIAOZHI LIVE MCP BRIDGE (V2.0 FULL 23-TABLE BRAIN)
 * Kết nối 24/7 với Xiaozhi Cloud MCP Endpoint (Trợ Lý Hương)
 * - Đồng bộ ngầm toàn bộ 23 bảng CSDL từ Google Sheets Master mỗi 45 giây
 * - Phản hồi tức thì (< 5ms) từ bộ nhớ đệm RAM + Disk Cache (brain_cache.json)
 * - Đọc hiểu 100% Đơn hàng, Sản xuất, Đóng gói, Kho hàng (549+ SKU), Xuất nhập,
 *   BOM, Thu chi, Sổ quỹ ngân hàng, Công nợ NCC, Hoàn ứng, Lợi nhuận P&L,
 *   Nhân sự, Chấm công, Bảng lương, Thưởng phạt, KPI, CTV, Tài liệu & 3D.
 * =========================================================================
 */

import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve('bridge.log');
const CACHE_FILE = path.resolve('brain_cache.json');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) { }
  console.log(msg);
}

const XIAOZHI_MCP_URL = 'wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjExNDc1ODIsImFnZW50SWQiOjI1OTEwODQsImVuZHBvaW50SWQiOiJhZ2VudF8yNTkxMDg0IiwicHVycG9zZSI6Im1jcC1lbmRwb2ludCIsImlhdCI6MTc5MzYwMzAwNywiZXhwIjoxODI1MTYwNjA3fQ.qN5zVwxQttCgNqXWeugc27EexCnoJ4l-uw9-J0l6Fe2FWoRFAebkOFZuncClOkm29WxA_wDiXUx7N2jhVPJSaA';
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxJ2S3z23PEU41oTRP9rtkyxdVReBghkHCmm15yjP7xY3sUAlUsh0mA_jKWKDwX2DGK/exec?action=rfBotQuery';

const TOOLS = [
  {
    name: 'rf_workspace_query',
    description: 'Tra cứu toàn bộ 23 bảng CSDL thời gian thực của xưởng Rich Fish Aquarium (RF Workspace Pro): 1. Đơn hàng (số đơn hôm nay, doanh thu, chi tiết đơn Shopee VN / Shopee Singapore xuất khẩu, đơn chờ bàn giao, đối soát). 2. Sản xuất & Đóng gói (lệnh sản xuất khâu 1 cắt dán, khâu 2 gia cố, QC, đóng gói, năng suất thợ). 3. Kho hàng & Vật tư (549+ mã SKU tồn kho, tổng giá trị kho, mã sắp hết hàng, tra cứu tồn kho từng sản phẩm, phiếu xuất nhập kho, định mức BOM). 4. Báo cáo lợi nhuận P&L (kết quả kinh doanh, doanh thu, phí sàn, lãi ròng từng kênh Shopee VN, Bán lẻ, TikTok, CTV, Xuất khẩu và chi phí công ty). 5. Bảng lương & Nhân sự (bảng lương chi tiết từng người, tổng quỹ lương, quân số chấm công đi làm hôm nay, thưởng phạt, KPI, tài chính CTV). 6. Tài chính & Thu chi (dòng tiền thu chi, số dư tài khoản ngân hàng, công nợ nhà cung cấp). 7. Chính sách xưởng (bảo hiểm bể vỡ 100%, bảo hành rò rỉ nước 6 tháng, quy chuẩn đóng gói 4 lớp chống sốc).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Nội dung câu hỏi chi tiết của người dùng (ví dụ: báo cáo P&L lợi nhuận các kênh, bảng lương nhân viên, lương của Dương, kho hàng còn gì, thu chi thế nào, số dư tài khoản, công nợ nhà cung cấp, đơn Shopee Singapore giá bao nhiêu, nay mấy đơn...)'
        },
        type: {
          type: 'string',
          enum: ['all', 'orders', 'production', 'packing', 'inventory', 'profit', 'salary', 'attendance', 'finance', 'policy', 'kpi'],
          description: 'Phân loại: profit (báo cáo P&L lợi nhuận lãi lỗ các kênh), salary (bảng lương/thu nhập từng người), attendance (chấm công đi làm), orders (đơn hàng), production (sản xuất), packing (đóng gói), inventory (kho hàng/tồn kho/xuất nhập), finance (thu chi/sổ quỹ/công nợ), policy (chính sách bảo hành đóng gói), all (tổng hợp)'
        }
      }
    }
  }
];

let cachedBrain = null;
let isSyncingBrain = false;

// Nạp cache từ đĩa ngay khi khởi động (0ms latency)
try {
  if (fs.existsSync(CACHE_FILE)) {
    cachedBrain = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    log(`📦 [RF Bridge] Đã nạp Brain Cache 23 bảng từ đĩa (Cập nhật lúc: ${cachedBrain?.generatedAt || 'N/A'})`);
  }
} catch (e) {
  log(`⚠️ [RF Bridge] Không thể đọc cache khởi tạo: ${e.message}`);
}

/**
 * Đồng bộ ngầm toàn bộ 23 bảng từ Google Sheets Master về RAM
 */
async function syncBrainInBackground() {
  if (isSyncingBrain) return;
  isSyncingBrain = true;
  try {
    const resp = await fetch(`${GAS_API_URL}&type=full_brain`, { redirect: 'follow' });
    const json = await resp.json();
    if (json && json.brain) {
      cachedBrain = json.brain;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cachedBrain, null, 2), 'utf8');
      log(`🔄 [RF Bridge] Đã đồng bộ ngầm 23 bảng CSDL thành công (${cachedBrain.generatedAt})`);
    }
  } catch (err) {
    log(`⚠️ [RF Bridge] Lỗi đồng bộ ngầm: ${err.message}`);
  } finally {
    isSyncingBrain = false;
  }
}

function normVN(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

function cleanAccountName(name) {
  const s = String(name || '').trim();
  const firstPart = s.split('|')[0].trim();
  return firstPart
    .toLowerCase()
    .replace(/(^|\s)\S/g, l => l.toUpperCase())
    .replace(/Vndc/i, 'VNDC')
    .replace(/Tk\b/i, 'Tài khoản');
}

function fmtMoney(val) {
  const num = Number(val || 0);
  if (!Number.isFinite(num) || num === 0) return '0 đồng';
  const abs = Math.abs(num);
  const sign = num < 0 ? 'đang âm ' : '';

  if (abs >= 1e9) {
    const ty = Math.round(abs / 1e7) / 100;
    return `${sign}${ty} tỷ`;
  }
  if (abs >= 1e6) {
    const tr = Math.round(abs / 1e5) / 10;
    if (tr % 1 === 0) return `${sign}${tr} triệu`;
    const nguyen = Math.floor(tr);
    const le = Math.round((tr - nguyen) * 10);
    if (le > 0) return `${sign}${nguyen} triệu ${le}`;
    return `${sign}${nguyen} triệu`;
  }
  if (abs >= 1e3) {
    const k = Math.round(abs / 1e3);
    return `${sign}${k} nghìn`;
  }
  return `${sign}${Math.round(abs)} đồng`;
}

function formatProductNameForVoice(name) {
  if (!name) return 'Sản phẩm';
  let s = String(name).trim();
  // Xóa mã SKU trong ngoặc vuông hoặc định dạng [SKU]
  s = s.replace(/\[[^\]]+\]/g, '').trim();
  // Xóa mã SKU nếu có dạng PK-..., BE-..., LAY-...
  s = s.replace(/\b[A-Z0-9]{2,}-[A-Z0-9_-]+\b/g, '').trim();
  // Thay thế dấu x trong kích thước thành "nhân": ví dụ 30x20x20 -> 30 nhân 20 nhân 20
  s = s.replace(/(\d+)\s*[xX*]\s*(\d+)/g, '$1 nhân $2');
  s = s.replace(/(\d+)\s*[xX*]\s*(\d+)/g, '$1 nhân $2');
  // Thay cm thành xăng ti mét (kể cả dính liền số như 22cm hay có cách 22 cm)
  s = s.replace(/(\d+)\s*cm\b/gi, '$1 xăng ti mét');
  s = s.replace(/\bcm\b/gi, 'xăng ti mét');
  // Thay mm thành mi li mét
  s = s.replace(/(\d+)\s*mm\b/gi, '$1 mi li mét');
  s = s.replace(/\bmm\b/gi, 'mi li mét');
  // Thay kg thành ki lô gam
  s = s.replace(/(\d+)\s*kg\b/gi, '$1 ki lô gam');
  s = s.replace(/\bkg\b/gi, 'ki lô gam');
  return s.replace(/\s+/g, ' ').trim();
}

function parseAccessoriesText(accRaw, noteRaw) {
  if (!accRaw && !noteRaw) return 'Hàng tiêu chuẩn';
  let items = [];
  if (accRaw && String(accRaw).trim().startsWith('[')) {
    try {
      const arr = JSON.parse(accRaw);
      if (Array.isArray(arr) && arr.length > 0) {
        items = arr.map(x => {
          const qty = x.quantity || 1;
          const cleanName = formatProductNameForVoice(x.name || 'sản phẩm');
          return `${qty > 1 ? qty + ' cái ' : ''}${cleanName}`;
        });
      }
    } catch (e) { }
  } else if (accRaw && accRaw !== '[]') {
    items.push(formatProductNameForVoice(accRaw));
  }
  // Nếu có ghi chú người dùng thực tế (không phải ghi chú tự động của hệ thống)
  if (noteRaw && !/bù tồn|mvd|sku|mvđ/i.test(noteRaw)) {
    items.push(`lưu ý: ${noteRaw}`);
  }
  return items.length > 0 ? items.join(', ') : 'Hàng tiêu chuẩn';
}

/**
 * Bộ tổng hợp câu trả lời thông minh tức thì (< 5ms) từ Brain 23 bảng
 * Luôn kiểm soát payload dưới 2.500 ký tự để không bao giờ bị tràn frame WebSocket Xiaozhi (Code 1009)
 */
function extractOrderToken(query) {
  if (!query) return null;
  let clean = String(query).replace(/\b([a-zA-Z0-9])\s+(?=[a-zA-Z0-9]\b)/gi, '$1');
  clean = clean.replace(/\b([a-zA-Z0-9])\s+(?=[a-zA-Z0-9]\b)/gi, '$1');

  const directMatch = clean.match(/(?:đơn\s+hàng|đơn|mã|đuôi)\s+([a-zA-Z0-9]{3,25})/i);
  if (directMatch && directMatch[1]) {
    const candidate = directMatch[1].toUpperCase();
    if (!/^(HANG|NAO|HOM|NAY|MOI|CU|CUA|TRUOC|SAU)$/.test(candidate)) {
      return candidate;
    }
  }

  const tokens = (clean.match(/[a-zA-Z0-9]{3,25}/g) || []).map(t => t.toUpperCase());
  const stopWords = new Set(['DON', 'HANG', 'KHAU', 'BAN', 'TIM', 'KIEM', 'TRA', 'XEM', 'CHO', 'NAO', 'TIEN', 'DUONG', 'TAM', 'HOM', 'NAY', 'XONG', 'NHAN', 'CHUA', 'LAM', 'GIA', 'DONG', 'GOI', 'SHOP', 'CUA', 'NGUYEN', 'ALL', 'THE', 'VI', 'DU', 'BAO', 'MAY', 'CON']);
  let filtered = tokens.filter(t => !stopWords.has(t) && (!/^\d+$/.test(t) || t.length >= 4));
  if (filtered.length === 0 && tokens.length > 0) {
    filtered = tokens.filter(t => !stopWords.has(t));
  }
  return filtered.length > 0 ? filtered[0] : null;
}

function detectVoiceProductionAction(query) {
  if (!query) return null;
  const qNorm = normVN(query);
  const token = extractOrderToken(query);
  if (!token) return null;

  let actionType = null;
  if (/nhan.*khau\s*1|nhan.*k1|lam.*khau\s*1|lam.*k1|nhan.*don/.test(qNorm)) {
    actionType = 'nhan_k1';
  } else if (/xong.*khau\s*1|xong.*k1|hoan\s*thanh.*khau\s*1|hoan\s*thanh.*k1|khau\s*1.*xong/.test(qNorm)) {
    actionType = 'xong_k1';
  } else if (/nhan.*khau\s*2|nhan.*k2|lam.*khau\s*2|lam.*k2/.test(qNorm)) {
    actionType = 'nhan_k2';
  } else if (/xong.*khau\s*2|xong.*k2|hoan\s*thanh.*khau\s*2|hoan\s*thanh.*k2|khau\s*2.*xong/.test(qNorm)) {
    actionType = 'xong_k2';
  }

  if (!actionType) return null;

  let workerName = 'Nguyễn Hoàng Dương';
  if (/tam/.test(qNorm)) workerName = 'Nguyễn Hữu Tâm';
  else if (/huong/.test(qNorm)) workerName = 'Nguyễn Thị Diệu Hương';
  else if (/tien|sep/.test(qNorm)) workerName = 'Nguyễn Ngọc Tiến';
  else if (/duong/.test(qNorm)) workerName = 'Nguyễn Hoàng Dương';

  return { actionType, workerName, orderToken: token };
}

function searchSpecificOrder(brain, query) {
  if (!query || !brain) return null;
  const token = extractOrderToken(query);
  if (!token) return null;

  const o = brain.orders || {};
  const p = brain.production || {};
  const allOrders = [].concat(o.todayOrdersList || [], o.recentOrders || [], o.exportOrders || []);

  let matchedOrder = null;
  for (const ord of allOrders) {
    const code = String(ord.code || '').toUpperCase();
    const cust = String(ord.customer || '').toUpperCase();
    if (code.endsWith(token) || code.includes(token) || cust.includes(token)) {
      matchedOrder = ord;
      break;
    }
  }

  if (!matchedOrder) return null;

  const rawCode = String(matchedOrder.code || '');
  const mainCode = rawCode.split('|')[0].trim();
  const suffix = mainCode.length >= 4 ? mainCode.slice(-4) : (token || mainCode);
  const ch = matchedOrder.channel || 'Sàn';
  const cust = matchedOrder.customer || 'Khách';

  let matchedProd = null;
  const pendingProds = p.pendingItems || [];
  for (const pr of pendingProds) {
    const pOrdId = String(pr.orderId || '');
    if ((matchedOrder.id && pOrdId === matchedOrder.id) || (mainCode && pOrdId === mainCode) || pOrdId.toUpperCase().includes(token)) {
      matchedProd = pr;
      break;
    }
  }

  let speech = `Dạ Sếp Tiến, đơn đuôi ${suffix} là đơn ${ch} của khách ${cust}.`;
  if (matchedProd) {
    const pName = formatProductNameForVoice(matchedProd.name);
    const p1Info = matchedProd.p1_status === 'Done' ? `Khâu 1 đã xong bởi ${matchedProd.p1_user || 'thợ'}` : (matchedProd.p1_user ? `Khâu 1 đang làm bởi ${matchedProd.p1_user}` : 'Khâu 1 chưa có ai nhận');
    const p2Info = matchedProd.p2_status === 'Done' ? `Khâu 2 đã xong bởi ${matchedProd.p2_user || 'thợ'}` : (matchedProd.p2_user ? `Khâu 2 đang làm bởi ${matchedProd.p2_user}` : 'Khâu 2 chưa bắt đầu');
    speech += ` Sản phẩm: ${pName}. Tiến độ: ${p1Info}, ${p2Info}.`;
    if (matchedProd.p1_status !== 'Done' && !matchedProd.p1_user) {
      speech += ` Sếp hoặc anh Dương có muốn nhận làm khâu 1 đơn này luôn không ạ?`;
    }
  } else {
    speech += ` Trạng thái đơn hiện tại: ${matchedOrder.status || 'Chờ Sản Xuất'}.`;
  }

  return { speech, order: matchedOrder, prod: matchedProd, suffix };
}

function buildAnswerFromBrain(brain, rawQuery = '', reqType = 'all') {
  // 0. TÌM KIẾM ĐƠN HÀNG CỤ THỂ THEO MÃ/ĐUÔI HOẶC TÊN KHÁCH
  const specificOrder = searchSpecificOrder(brain, rawQuery);
  if (specificOrder) {
    return specificOrder.speech;
  }

  const normQ = normVN(rawQuery);
  const rType = normVN(reqType);

  const askProfit = rType === 'profit' || /pnl|p&l|vnl|loi nhuan|lai lo|bao cao lai|ket qua kinh doanh|lai rong|loi nhuan rong|kinh doanh/.test(normQ);
  const askSalary = rType === 'salary' || /luong|bang luong|thu nhap|quy luong|tam ung|ung luong|tien luong|phu cap|thuong phat/.test(normQ);
  const askAttendance = rType === 'attendance' || /nhan vien|nhan su|di lam|cham cong|ai lam|quan so|vang|nghi|diem danh/.test(normQ);
  const askPolicy = rType === 'policy' || /chinh sach|bao hanh|doi tra|be vo|khieu nai|vo be|van chuyen|dong goi|quyen loi/.test(normQ);
  const askExport = /xuat khau|quoc te|singapore|sg|malaysia|malay|thai lan|thailand|philippin|philip|nuoc ngoai/.test(normQ);
  const askOrders = rType === 'orders' || askExport || /don hang|\bdon\b|order|doanh thu|doanh so|ban hang|shopee|tiktok|lazada|khach|ban giao|doi soat|hoan hang|huy don/.test(normQ);
  const askFinance = rType === 'finance' || /thu chi|tai chinh|dong tien|tien mat|so quy|tai khoan|so du|ngan hang|cong no|nha cung cap|ncc|hoan ung|phi van chuyen/.test(normQ);
  const askInventory = rType === 'inventory' || /\bkho\b|ton kho|kho hang|vat tu|nguyen lieu|san pham|sku|het hang|sap het|nhap kho|xuat kho|bom|dinh muc|keo|da|lua|reu|den|loc|fomex|san suoi|cuoi/.test(normQ);
  const askProd = rType === 'production' || /san xuat|che tac|gia cong|khau 1|khau 2|be kinh|layout|cat dan|gia co|qc|tien do|lenh/.test(normQ);
  const askPacking = rType === 'packing' || /dong goi|packing|boc hang/.test(normQ);
  const askKnowledge = rType === 'knowledge' || /tai lieu|quy trinh|dao tao|sop|3d|gia layout/.test(normQ);

  const o = brain.orders || {};
  const p = brain.production || {};
  const pk = brain.packings || {};
  const inv = brain.inventory || {};
  const ie = brain.importExport || {};
  const fin = brain.finance || {};
  const acc = brain.accounts || {};
  const sup = brain.suppliers || {};
  const prof = brain.profitReports || {};
  const hr = brain.hr || {};

  const chSummary = Object.keys(o.todayChannels || {}).map(k => `${o.todayChannels[k]} đơn ${k}`).join(', ');

  const blocks = [];

  // 1. NẾU HỎI VỀ BÁO CÁO P&L / LỢI NHUẬN / LÃI LỖ / KẾT QUẢ KINH DOANH
  if (askProfit) {
    const allRep = prof.reports || [];
    const channelReports = allRep.filter(r => r.channel && r.channel !== 'COMPANY_GENERAL' && ((r.revenue || 0) > 0 || (r.netProfit || 0) > 0));
    const generalReports = allRep.filter(r => r.channel === 'COMPANY_GENERAL');

    let totalRev = 0;
    let totalNet = 0;
    channelReports.forEach(r => {
      totalRev += (r.revenue || 0);
      totalNet += (r.netProfit || 0);
    });

    // Tự động sắp xếp top các kênh có lợi nhuận cao nhất từ dữ liệu thực tế
    const topChannels = [...channelReports]
      .sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0))
      .slice(0, 3)
      .map(r => {
        let ch = r.channel;
        if (ch === 'Shopee VN') ch = 'Shopee';
        if (ch === 'Xuất Khẩu') ch = 'Xuất khẩu';
        return `${ch} lãi ${fmtMoney(r.netProfit)}`;
      }).join(', ');

    const gen = generalReports.find(g => (g.salary || 0) > 0 || (g.operation || 0) > 0) || generalReports[0] || {};
    const salStr = gen.salary > 0 ? ` Lương công ty kỳ qua là ${fmtMoney(gen.salary)}.` : '';

    blocks.push(
      `Dạ Sếp Tiến, theo báo cáo P&L mới nhất từ hệ thống: Tổng doanh thu các kênh đạt ${fmtMoney(totalRev)}, tổng lợi nhuận kênh đạt ${fmtMoney(totalNet)}. Top kênh gồm: ${topChannels || 'chưa có dữ liệu'}.${salStr} Sếp có cần em đọc chi tiết kênh nào không ạ?`
    );
  }

  // 2. NẾU HỎI VỀ BẢNG LƯƠNG / THU NHẬP / QUỸ LƯƠNG / TẠM ỨNG
  else if (askSalary) {
    const list = hr.salaryList || [];
    const prettyMonth = String(hr.salaryMonth || '').replace(/(\d{4})-(\d{2})/, 'tháng $2 năm $1');
    const matchedStaff = list.find(s => {
      const sNorm = normVN(s.user);
      const parts = sNorm.split(/\s+/);
      const lastName = parts[parts.length - 1];
      if (normQ.includes(sNorm)) return true;
      if (lastName.length >= 3 && normQ.includes(lastName)) return true;
      if (/tien|sep/.test(normQ) && sNorm.includes('tien')) return true;
      if (/duong/.test(normQ) && sNorm.includes('duong')) return true;
      if (/tam/.test(normQ) && sNorm.includes('tam')) return true;
      if (/huong/.test(normQ) && sNorm.includes('huong')) return true;
      if (/trang/.test(normQ) && sNorm.includes('trang')) return true;
      return false;
    });

    if (matchedStaff) {
      blocks.push(
        `Dạ Sếp, lương của bạn ${matchedStaff.user} ${prettyMonth ? 'kỳ ' + prettyMonth : ''} là ${fmtMoney(matchedStaff.totalSalary)}, gồm lương cơ bản ${fmtMoney(matchedStaff.baseSalary)}${matchedStaff.fuelAllowance > 0 ? ' và phụ cấp xăng xe ' + fmtMoney(matchedStaff.fuelAllowance) : ''}.`
      );
    } else {
      // Đọc động từng người từ CSDL thực tế trong sheet
      const staffSummaries = list
        .filter(s => (s.totalSalary || 0) > 0)
        .slice(0, 5)
        .map(s => {
          let shortName = s.user
            .replace('Nguyễn Thị ', '')
            .replace('Nguyễn Ngọc ', 'Sếp ')
            .replace('Nguyễn ', '')
            .replace('Lại Trường ', '')
            .replace('Lại ', '')
            .replace('Bạch Thị ', '')
            .replace('Hà Quang ', '');
          return `${shortName} ${fmtMoney(s.totalSalary)}`;
        }).join(', ');

      blocks.push(
        `Dạ Sếp Tiến, bảng lương ${prettyMonth ? 'kỳ ' + prettyMonth : ''} có tổng quỹ là ${fmtMoney(hr.totalSalaryPool)} cho ${list.length} nhân sự. Gồm: ${staffSummaries || 'chưa có số liệu'}. Sếp muốn xem chi tiết ai ạ?`
      );
    }
  }

  // 3. NẾU HỎI VỀ ĐIỂM DANH / CHẤM CÔNG / QUÂN SỐ ĐI LÀM
  else if (askAttendance) {
    const workingStaff = (hr.todayWorkingList || []).map(w => w.user.replace('Nguyễn ', '').replace('Hà ', '')).join(', ');
    blocks.push(
      `Dạ Sếp, hôm nay có ${hr.todayWorkingCount} nhân sự đi làm gồm: ${workingStaff || 'chưa có ai điểm danh'}. Mọi khâu đang hoạt động bình thường ạ.`
    );
  }

  // 4. NẾU HỎI VỀ XUẤT KHẨU / KHÁCH QUỐC TẾ (SINGAPORE, MALAYSIA, THÁI LAN, PHILIPPINES)
  else if (askExport) {
    const expCount = (o.exportOrders || []).length;
    const expRev = (o.exportOrders || []).reduce((sum, ord) => sum + (ord.revenue || 0), 0);
    const expCusts = Array.from(new Set((o.exportOrders || []).map(ord => ord.customer).filter(Boolean))).slice(0, 3).join(', ');

    const isSpecificCountry = /malay|thai|philip/.test(normQ);
    if (isSpecificCountry) {
      blocks.push(
        `Dạ Sếp Tiến, mảng xuất khẩu xưởng hiện ghi nhận ${expCount} đơn với tổng doanh thu ${fmtMoney(expRev)}. Các sàn Malaysia hay Thái Lan chưa mở mã kênh riêng, nhưng đã có khách hàng quốc tế như ${expCusts || 'khách ngoại quốc'} đặt mua layout của xưởng rồi ạ.`
      );
    } else {
      blocks.push(
        `Dạ Sếp Tiến, xưởng hiện có ${expCount} đơn xuất khẩu với tổng doanh thu ${fmtMoney(expRev)}. Gần đây có khách ${expCusts || 'quốc tế'} đặt hàng. Sếp có cần tra cứu đơn nào không ạ?`
      );
    }
  }

  // 5. NẾU HỎI VỀ ĐƠN HÀNG HÔM NAY / BÀN GIAO KHO
  else if (askOrders) {
    const todayWaitingCarried = (o.todayOrdersList || []).filter(item => !item.isCarriedToWH && item.status !== 'Đơn Huỷ').length;
    let handoverNote = '';
    if (normQ.includes('ban giao') || normQ.includes('cho kho') || normQ.includes('58') || normQ.includes('ton dong')) {
      handoverNote = ` Riêng khâu bàn giao kho: hôm nay có ${todayWaitingCarried} đơn đang tiến hành, còn con số ${o.waitingHandoverCount} đơn là tổng tích lũy tồn đọng các đơn cũ từ những ngày trước chưa bấm nút xác nhận Chở Kho.`;
    } else {
      handoverNote = ` Cả ${todayWaitingCarried} đơn hôm nay đang trong quy trình sản xuất và đóng gói để chở kho.`;
    }
    blocks.push(
      `Dạ, hôm nay xưởng có ${o.todayCount} đơn hàng, doanh thu ${fmtMoney(o.todayRevenue)}${chSummary ? ' gồm ' + chSummary : ''}, có ${o.todayNeedsProdCount} đơn cần sản xuất.${handoverNote} Sếp có muốn xem chi tiết đơn nào không ạ?`
    );
  }

  // 6. NẾU HỎI VỀ TÀI CHÍNH / SỔ QUỸ / TÀI KHOẢN / TIỀN MẶT / THU CHI / CÔNG NỢ
  else if (askFinance) {
    const topAccs = (acc.accountsList || [])
      .slice(0, 3)
      .map(a => `${cleanAccountName(a.accountName)} có ${fmtMoney(a.balance)}`)
      .join(', ');

    blocks.push(
      `Dạ, tổng số dư các quỹ của xưởng hiện tại là ${fmtMoney(acc.totalBalance)}${topAccs ? ', gồm ' + topAccs : ''}. Toàn xưởng đang nợ các nhà cung cấp tổng cộng là ${fmtMoney(sup.totalDebt)}. Sếp cần kiểm tra tài khoản nào ạ?`
    );
  }

  // 7. NẾU HỎI VỀ KHO HÀNG / TỒN KHO / VẬT TƯ LŨA ĐÁ / XUẤT NHẬP (THUẬT TOÁN TÌM KIẾM ĐỘC QUYỀN)
  else if (askInventory) {
    const stopWords = /^(kho|ton|hang|con|khong|bao|nhieu|kiem|tra|cho|hoi|ve|du|lieu|trong|xem|ma|san|pham|vat|tu|all|tat|ca|em|anh|sep|co|la|gi|nhung|cac|loai|the|nao|nua|a)$/;
    const queryWords = normQ.split(/\s+/).filter(w => w.length >= 2 && !stopWords.test(w));
    
    let matchedProds = [];
    if (queryWords.length > 0 && inv.productsList) {
      const searchCore = queryWords.join(' ');
      const scored = [];
      for (const pr of inv.productsList) {
        const hay = normVN(`${pr.sku} ${pr.name} ${pr.category} ${pr.subCategory}`);
        let score = 0;
        if (hay.includes(searchCore)) score += 100;
        for (const w of queryWords) {
          const regWord = new RegExp(`\\b${w}\\b`, 'i');
          if (regWord.test(hay)) score += 15;
          else if (hay.includes(w)) score += 5;
        }
        if (score > 10) scored.push({ pr, score });
      }
      scored.sort((a, b) => b.score - a.score);
      matchedProds = scored.map(s => s.pr);
    }

    if (matchedProds.length > 0) {
      const pLines = matchedProds.slice(0, 3).map(pr => `${formatProductNameForVoice(pr.name)} còn ${pr.quantity} ${pr.unit}`).join(', ');
      blocks.push(`Dạ Sếp, kiểm tra kho: ${pLines}.`);
    } else {
      const lowBrief = (inv.lowStockItems || []).slice(0, 2).map(i => `${formatProductNameForVoice(i.name)} còn ${i.quantity} ${i.unit}`).join(', ');
      blocks.push(
        `Dạ, kho xưởng có ${inv.totalSkus || 0} mã hàng với tổng giá trị vốn tồn là ${fmtMoney(inv.totalCostValue)}. Hàng cơ bản an toàn, có một số mã sắp hết như ${lowBrief || 'bể kính nhỏ'}. Sếp muốn kiểm tra mã nào ạ?`
      );
    }
  }

  // 8. NẾU HỎI VỀ SẢN XUẤT / ĐÓNG GÓI / 2 KHÂU CHUYỀN
  else if (askProd || askPacking) {
    blocks.push(
        `Dạ Sếp, chuyền 2 khâu xưởng hiện có ${p.pendingCount} lệnh đang chạy, gồm ${p.phase1WaitingCount} lệnh Khâu 1 dựng phom cắt dán và ${p.phase2WaitingCount} lệnh Khâu 2 gia cố bột đá bột lũa và vuốt keo. Đóng gói hôm nay đã hoàn thành ${pk.todayCount} đơn đạt chuẩn 4 lớp chống sốc. Sếp cần ưu tiên mẫu nào ạ?`
    );
  }

  // 9. NẾU HỎI VỀ CHÍNH SÁCH BÁN HÀNG / BẢO HÀNH BỂ VỠ / ĐỔI TRẢ / CSKH (CHUẨN RF_KNOWLEDGE_OS)
  else if (askPolicy) {
    blocks.push(
        `Dạ, chính sách chuẩn của Rich Fish Aquarium: Xưởng cam kết bảo hiểm bể vỡ 100%, bảo hành rò rỉ nước 6 tháng và đóng gói 4 lớp an toàn. Với đơn sàn Shopee TikTok khách bấm hoàn tiền hoặc bù kiện mới; đơn ngoài xưởng thu hồi sửa 100% phí 2 chiều. Rich Fish không bán cây thủy sinh tươi sống và không nhận setup bảo dưỡng tại nhà ạ.`
    );
  }

  // 10. NẾU HỎI VỀ HỆ THỐNG VẬT TƯ LŨA ĐÁ / DANH MỤC LAYOUT / QUY CÁCH BỂ KÍNH
  else if (askKnowledge || /vat tu|nguyen lieu|cac loai lua|cac loai da|danh muc|quy cach|quy trinh/.test(normQ)) {
    blocks.push(
      `Dạ Sếp, xưởng sở hữu hệ sinh thái vật tư rất phong phú: Về Lũa gồm Thạch Sùng, Đỗ Quyên, Hải Sơn Quỳ, Xương Chùm, Nhọ Nồi, San Miếng, San Cành, San Trắng, Lũa Mini và Rễ Rừng. Về Đá có Đá Da Voi, Tai Mèo, Nham Xanh, Đá Vỉa, Cuội Suối, Kẹp Kem cùng Sạn suối, Cát vàng, Cát trắng. Bố cục gồm 13 danh mục chuẩn từ Biotop Cuội, Đảo Bay, Vách, Nature, Hẻm Núi, Rừng đến Bonsai và Linh Thú ạ.`
    );
  }

  // 11. NẾU HỎI TỔNG QUAN HỆ THỐNG (ALL / GENERAL)
  else {
    blocks.push(
      `Dạ, tổng quan xưởng hôm nay: có ${o.todayCount} đơn hàng, doanh thu ${fmtMoney(o.todayRevenue)}. Có ${p.pendingCount} lệnh sản xuất đang chạy. Quỹ tài khoản hiện có ${fmtMoney(acc.totalBalance)}, và có ${hr.todayWorkingCount} nhân sự đang đi làm. Sếp cần em hỗ trợ mảng nào ạ?`
    );
  }

  let finalRes = blocks.join('\n\n');
  // Bảo vệ an toàn tuyệt đối: Luôn giới hạn dưới 2.000 ký tự để không bao giờ bị quá tải frame WebSocket (Code 1009)
  if (finalRes.length > 2000) {
    const cutPos = finalRes.lastIndexOf('\n', 2000);
    finalRes = (cutPos > 1500 ? finalRes.slice(0, cutPos) : finalRes.slice(0, 2000)) + '\n...';
  }
  return finalRes;
}

async function handleToolQuery(query, type) {
  // 1. KIỂM TRA THAO TÁC SẢN XUẤT QUA GIỌNG NÓI (VOICE PRODUCTION ACTION)
  const voiceAction = detectVoiceProductionAction(query);
  if (voiceAction) {
    log(`🎯 [RF Bridge] Phát hiện lệnh sản xuất qua giọng nói: ${JSON.stringify(voiceAction)}`);
    try {
      const apiUrl = `${GAS_API_URL}&action=rfBotVoiceProductionAction&orderToken=${encodeURIComponent(voiceAction.orderToken)}&actionType=${encodeURIComponent(voiceAction.actionType)}&workerName=${encodeURIComponent(voiceAction.workerName)}`;
      const resp = await fetch(apiUrl, { redirect: 'follow' });
      const json = await resp.json();
      if (json && json.speech_text) {
        log(`✅ [RF Bridge] Cập nhật CSDL thành công: ${json.speech_text}`);
        syncBrainInBackground();
        return json.speech_text;
      }
    } catch (err) {
      log(`⚠️ [RF Bridge] Lỗi gọi API hành động sản xuất: ${err.message}`);
    }
  }

  // 2. Nếu đã có cachedBrain trong RAM, phản hồi tức thì (< 5ms)
  if (cachedBrain) {
    log(`⚡ [RF Bridge] Trả lời siêu tốc (<5ms) từ Brain Cache 23 bảng cho query="${query || ''}", type="${type || 'all'}"`);
    return buildAnswerFromBrain(cachedBrain, query, type);
  }

  // Nếu chưa có cache, gọi trực tiếp GAS và lưu cache
  try {
    log(`[RF Bridge] Đang kéo dữ liệu live từ GAS: query="${query || ''}", type="${type || 'all'}"...`);
    const resp = await fetch(`${GAS_API_URL}&type=full_brain&query=${encodeURIComponent(query || '')}`, { redirect: 'follow' });
    const json = await resp.json();
    if (json && json.brain) {
      cachedBrain = json.brain;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cachedBrain, null, 2), 'utf8');
      return buildAnswerFromBrain(cachedBrain, query, type);
    }
    return json.full_context || json.speech_text || 'Đã lấy được dữ liệu xưởng thành công.';
  } catch (err) {
    log(`[RF Bridge] Lỗi handleToolQuery: ${err.message}`);
    return 'Dạ xin lỗi sếp, hệ thống đang đồng bộ dữ liệu, vui lòng hỏi lại sau vài giây.';
  }
}

let activeWs = null;

function startBridge() {
  log('[RF Bridge] Đang kết nối tới Xiaozhi MCP Server...');
  try {
    const ws = new WebSocket(XIAOZHI_MCP_URL);
    activeWs = ws;

    ws.onopen = () => {
      log('✅ [RF Bridge] ĐÃ KẾT NỐI THÀNH CÔNG VỚI XIAOZHI MCP (Trợ Lý Hương - V2.0 Full 23 Tables)!');
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        log(`[RF Bridge] Nhận yêu cầu: ${msg.method || `ID=${msg.id}`}`);

        if (msg.method === 'initialize') {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: 'RF_Workspace_Pro_MCP', version: '2.0.0' }
            }
          }));
          log(' -> Đã phản hồi initialize thành công.');
          return;
        }

        if (msg.method === 'notifications/initialized') {
          log(' -> MCP Session đã sẵn sàng phục vụ.');
          return;
        }

        if (msg.method === 'ping') {
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));
          return;
        }

        if (msg.method === 'tools/list') {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { tools: TOOLS }
          }));
          log(' -> Đã đăng ký công cụ rf_workspace_query (Full 23 Tables) thành công.');
          return;
        }

        if (msg.method === 'tools/call') {
          const { name, arguments: args } = msg.params || {};
          log(`🎤 [RF Bridge] ROBOT ĐANG GỌI TOOL "${name}": ${JSON.stringify(args || {})}`);

          const answerText = await handleToolQuery(args?.query, args?.type);
          const preview = answerText.replace(/\s+/g, ' ').slice(0, 220);
          log(`🔊 [RF Bridge] ĐÃ GỬI DỮ LIỆU 23 BẢNG (${answerText.length} ký tự): "${preview}..."`);

          // Trả về trực tiếp văn bản thuần cho LLM (Plain Text Clean Voice), tuyệt đối KHÔNG bọc trong JSON rác
          // để tránh LLM đọc lẫn dấu ngoặc nhọn, dấu nháy kép làm hỏng TTS và giật âm thanh
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: answerText }],
              isError: false
            }
          }));
          log(' -> Đã gửi kết quả plain text sạch cho Xiaozhi.');
          return;
        }

        if (msg.id !== undefined) {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: 'Method not found' }
          }));
        }
      } catch (e) {
        log(`[RF Bridge] Lỗi xử lý message: ${e.message}`);
      }
    };

    ws.onerror = (err) => {
      log(`❌ [RF Bridge] WebSocket Error: ${err.message}`);
    };

    ws.onclose = (e) => {
      log(`⚠️ [RF Bridge] WebSocket bị đóng (Code ${e.code}). Tự động kết nối lại sau 3 giây...`);
      setTimeout(startBridge, 3000);
    };
  } catch (err) {
    log(`[RF Bridge] Ngoại lệ kết nối: ${err.message}. Thử lại sau 5 giây...`);
    setTimeout(startBridge, 5000);
  }
}

// 1. Heartbeat keepalive gửi ping định kỳ mỗi 20 giây để giữ kết nối WebSocket không bao giờ ngắt
setInterval(() => {
  if (activeWs && activeWs.readyState === 1) {
    try {
      activeWs.send(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }));
    } catch (e) { }
  }
}, 20000);

// 2. Đồng bộ ngầm 23 bảng từ Google Sheets mỗi 45 giây
setInterval(() => {
  syncBrainInBackground();
}, 45000);

// Khởi chạy kết nối ngay lập tức và đồng bộ dữ liệu mới nhất
startBridge();
syncBrainInBackground();


// Lightweight HTTP Health Check Server (Render / Koyeb / Railway 24/7 Keepalive)
import http from 'http';
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ONLINE',
    service: 'RF_Workspace_Pro_MCP_Bridge',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  }));
});
server.listen(PORT, () => {
  log(`🌐 [HTTP Health] Health check server listening on port ${PORT}`);
});
