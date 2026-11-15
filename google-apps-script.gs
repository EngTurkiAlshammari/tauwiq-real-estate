/**
 * Tauwiq Leads API for GitHub Pages + Google Sheets.
 * Bind this script to the Google Sheet that will store leads.
 * Deploy as Web App: Execute as Me; Who has access: Anyone.
 */

const SHEET_NAME = 'Leads';
const SALES_REPS = [
  { name: 'مكتب المبيعات ١', phone: '966563673401' },
  { name: 'مكتب المبيعات ٢', phone: '966547965350' }
];
const HEADERS = [
  'تاريخ التسجيل',
  'رقم الطلب',
  'اسم العميل',
  'رقم الجوال',
  'الوحدة المهتم بها',
  'طريقة التواصل',
  'مسؤول المبيعات',
  'رقم مسؤول المبيعات',
  'حالة الطلب'
];

/** Run this once from the Apps Script editor. */
function setup() {
  const sheet = getLeadsSheet_();
  ensureHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#633843')
    .setFontColor('#ffffff');
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('D:D').setNumberFormat('@');
  sheet.getRange('H:H').setNumberFormat('@');
  sheet.autoResizeColumns(1, HEADERS.length);
  return 'تم إعداد ورقة Leads بنجاح';
}

/**
 * Health check + JSONP status lookup.
 * JSONP is used only to retrieve a lead's assignment by its random request ID;
 * no customer personal data is returned from this endpoint.
 */
function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  if (p.action === 'status') return getLeadStatusJsonp_(p);

  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      service: 'Tauwiq Leads API',
      message: 'الخدمة تعمل. أرسل الطلبات عبر POST.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Receive JSON text/plain POST from the GitHub Pages website. */
function doPost(e) {
  let lock;
  try {
    const raw = e && e.postData && e.postData.contents;
    const p = raw ? JSON.parse(raw) : ((e && e.parameter) ? e.parameter : {});
    const requestId = clean_(p.requestId, 100) || Utilities.getUuid();

    // Honeypot: ignore automated submissions that fill the hidden field.
    if (clean_(p.website, 200)) {
      return jsonResponse_({ success: true, ignored: true, requestId: requestId });
    }

    const firstName = clean_(p.firstName, 80);
    const lastName = clean_(p.lastName, 80);
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const phone = normalizeSaudiPhone_(p.phone);
    const unit = clean_(p.unit, 80);
    const contactMethod = clean_(p.contactMethod, 40) || 'واتساب';
    const consent = String(p.consent || '').toLowerCase() === 'true';

    if (!firstName || !lastName) throw new Error('يرجى إدخال الاسم الأول واسم العائلة.');
    if (!phone) throw new Error('يرجى إدخال رقم جوال سعودي صحيح.');
    if (!consent) throw new Error('يلزم الموافقة على استخدام البيانات للتواصل.');
    if (!/^TW-[A-Za-z0-9_-]{8,90}$/.test(requestId)) throw new Error('رقم الطلب غير صالح.');

    lock = LockService.getScriptLock();
    lock.waitLock(20000);

    const sheet = getLeadsSheet_();
    ensureHeaders_(sheet);

    // Make POST retry-safe: a repeated request ID never creates a second row.
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const found = sheet.getRange(2, 2, lastRow - 1, 1)
        .createTextFinder(requestId)
        .matchEntireCell(true)
        .findNext();
      if (found) return jsonResponse_({ success: true, requestId: requestId, duplicate: true });
    }

    const props = PropertiesService.getScriptProperties();
    const nextIndex = Number(props.getProperty('NEXT_SALES') || '0') % SALES_REPS.length;
    const rep = SALES_REPS[nextIndex];

    sheet.appendRow([
      new Date(),
      requestId,
      fullName,
      phone,
      unit,
      contactMethod,
      rep.name,
      rep.phone,
      'جديد'
    ]);
    SpreadsheetApp.flush();
    props.setProperty('NEXT_SALES', String((nextIndex + 1) % SALES_REPS.length));

    return jsonResponse_({ success: true, requestId: requestId });
  } catch (error) {
    return jsonResponse_({
      success: false,
      message: (error && error.message) ? error.message : 'تعذر تسجيل الطلب.'
    });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function getLeadStatusJsonp_(params) {
  const callback = String(params.callback || '');
  const requestId = clean_(params.requestId, 100);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(callback) || !/^TW-[A-Za-z0-9_-]{8,90}$/.test(requestId)) {
    return ContentService.createTextOutput('/* invalid status request */')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  let data = { success: true, found: false };
  try {
    const sheet = getLeadsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const found = sheet.getRange(2, 2, lastRow - 1, 1)
        .createTextFinder(requestId)
        .matchEntireCell(true)
        .findNext();
      if (found) {
        const rowNumber = found.getRow();
        const row = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
        data = {
          success: true,
          found: true,
          requestId: requestId,
          leadId: rowNumber - 1,
          assignedSalesName: String(row[6] || ''),
          assignedSalesPhone: String(row[7] || '')
        };
      }
    }
  } catch (error) {
    data = { success: false, found: false, message: 'تعذر التحقق من حالة الطلب.' };
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getLeadsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('اربط السكربت بملف Google Sheets أولاً.');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) sheet.insertRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange('D:D').setNumberFormat('@');
  sheet.getRange('H:H').setNumberFormat('@');
}

function normalizeSaudiPhone_(value) {
  let digits = String(value || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (digits.startsWith('05') && digits.length === 10) digits = '966' + digits.slice(1);
  else if (digits.startsWith('5') && digits.length === 9) digits = '966' + digits;
  if (!/^9665\d{8}$/.test(digits)) return '';
  return '+' + digits;
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
