/************************************************************
 * Newborn Chula Fellow EPA Tracker — v1 (rebuild)
 * Google Apps Script backend. Sheets = database, DocumentApp = PDF engine.
 * Built from the "EPA Tracker and milestone app" prototype design
 * (dc.html) + the fix list in handoff-newborn-chula-epa-tracker.md.
 *
 * NOT YET DONE (by explicit request — tackled last):
 *   - Session.getActiveUser() auth / role-gated dropdowns (handoff 3.1, 3.3)
 *   - Fellow/faculty self-select via dropdown is unauthenticated,
 *     same residual risk as the current production app until auth ships.
 ************************************************************/

const APP = {
  NAME: 'Newborn Chula Fellow EPA Tracker',
  COMPLETION_LEVEL: 4,
  COMM_REQUIRED_PASS_COUNT: 2,
  UNIT_RECORD_EMAIL: 'newbornchula@redcross.or.th',
  PDF_FOLDER_NAME: 'Newborn Chula Fellow EPA Tracker PDFs',
  TIMEZONE: Session.getScriptTimeZone() || 'Asia/Bangkok'
};

const SHEETS = {
  SETTINGS: 'Settings',
  USERS: 'Users',
  FELLOWS: 'Fellows',
  FACULTY: 'Faculty',
  ASSESSMENTS: 'Assessments',
  DOMAINS: 'Domains',
  SUBMISSIONS: 'Submissions',
  CHECKPOINTS: 'Checkpoints',
  AUDIT: 'Audit_Log'
};

const HEADERS = {
  SETTINGS: ['key', 'value'],
  USERS: ['email', 'display_name', 'role', 'linked_id', 'active'],
  FELLOWS: ['fellow_id', 'name', 'short_name', 'email', 'training_year', 'active', 'signature_png'],
  FACULTY: ['faculty_id', 'name', 'short_name', 'email', 'active', 'signature_png'],
  ASSESSMENTS: ['assessment_id', 'category', 'subtype', 'title', 'score_type', 'required_pass_count', 'active'],
  DOMAINS: ['domain_id', 'category', 'section', 'label', 'display_order'],
  SUBMISSIONS: [
    'submission_id', 'created_at', 'fellow_id', 'fellow_name', 'training_year',
    'assessment_id', 'category', 'subtype', 'title', 'score_type',
    'patient_name', 'hn', 'diagnosis', 'case_date', 'location', 'reflection',
    'assessor_id', 'assessor_name', 'assessor_email',
    'status', 'token', 'token_used',
    'domain_scores_json', 'global_result', 'comment', 'graded_at',
    'assessor_signature_png', 'pdf_file_id', 'pdf_url'
  ],
  CHECKPOINTS: ['checkpoint_id', 'fellow_id', 'label', 'frozen_at', 'snapshot_json'],
  AUDIT: ['timestamp', 'actor', 'action', 'entity_id', 'detail_json']
};

const CATEGORY_LABEL = { MINI_CEX: 'Mini-CEX', CBD: 'CBD', DOPS: 'DOPS', COMMU: 'Communication' };

const ASSESSMENT_SEED = [
  ['MINICEX_EPA1', 'MINI_CEX', 'EPA1', 'EPA 1: ร่วมวางแผนกับสูติแพทย์ ในการดูแลรักษามารดาและทารกในครรภ์ที่ผิดปกติ', 'NUMERIC', '', 'TRUE'],
  ['MINICEX_EPA2', 'MINI_CEX', 'EPA2', 'EPA 2: ให้การดูแลทารกแรกเกิดเสี่ยงสูงเมื่อแรกเกิด', 'NUMERIC', '', 'TRUE'],
  ['MINICEX_EPA3', 'MINI_CEX', 'EPA3', 'EPA 3: การบริบาลทารกแรกเกิดในภาวะวิกฤต', 'NUMERIC', '', 'TRUE'],
  ['MINICEX_EPA5', 'MINI_CEX', 'EPA5', 'EPA 5: การบริบาลทารกแรกเกิดหลังภาวะวิกฤต และการติดตามต่อเนื่องระยะยาว', 'NUMERIC', '', 'TRUE'],
  ['CBD_EPA3', 'CBD', 'EPA3', 'EPA 3: การบริบาลทารกแรกเกิดในภาวะวิกฤต', 'NUMERIC', '', 'TRUE'],
  ['CBD_EPA5', 'CBD', 'EPA5', 'EPA 5: การบริบาลทารกแรกเกิดหลังภาวะวิกฤต และการติดตามต่อเนื่องระยะยาว', 'NUMERIC', '', 'TRUE'],
  ['DOPS1', 'DOPS', 'DOPS1', 'Intubation', 'NUMERIC', '', 'TRUE'],
  ['DOPS2', 'DOPS', 'DOPS2', 'Umbilical vessel catheterization', 'NUMERIC', '', 'TRUE'],
  ['DOPS3', 'DOPS', 'DOPS3', 'Surfactant administration', 'NUMERIC', '', 'TRUE'],
  ['DOPS4', 'DOPS', 'DOPS4', 'Amplitude EEG', 'NUMERIC', '', 'TRUE'],
  ['DOPS5', 'DOPS', 'DOPS5', 'Abdominal paracentesis', 'NUMERIC', '', 'TRUE'],
  ['DOPS6', 'DOPS', 'DOPS6', 'Peripheral arterial line insertion', 'NUMERIC', '', 'TRUE'],
  ['DOPS7', 'DOPS', 'DOPS7', 'PICC line insertion / central venous catheter', 'NUMERIC', '', 'TRUE'],
  ['DOPS8', 'DOPS', 'DOPS8', 'Thoracocentesis / chest drain', 'NUMERIC', '', 'TRUE'],
  ['DOPS9', 'DOPS', 'DOPS9', 'Non-invasive / invasive mechanical ventilation respiratory support', 'NUMERIC', '', 'TRUE'],
  ['DOPS10', 'DOPS', 'DOPS10', 'Therapeutic hypothermia', 'NUMERIC', '', 'TRUE'],
  ['COMMU', 'COMMU', 'COMMU', 'Communication Skills', 'CHECKLIST', APP.COMM_REQUIRED_PASS_COUNT, 'TRUE']
];

const DOMAINS_BY_CATEGORY = {
  MINI_CEX: ['Data gathering skills', 'Physical examination skills', 'Communication/Counselling', 'Professionalism', 'Clinical judgement', 'Organization/Efficiency', 'Overall clinical performance'],
  CBD: ['Data gathering skills', 'Clinical finding and interpretation', 'Investigation and management', 'Follow up and future planning', 'Professionalism', 'Overall clinical performance'],
  DOPS: ['Demonstrates understanding of indications, anatomy, technique of procedures', 'Obtains informed consent', 'Demonstrates appropriate pre-procedure preparation including pain management', 'Demonstrates patient safety and risk awareness', 'Aseptic technique', 'Technical ability', 'Seeks help when appropriate', 'Post-procedure management', 'Communication skills', 'Overall clinical performance']
};

const COMMU_SECTIONS = [
  { section: 'A. เริ่มต้น (Opening)', items: ['ทักทาย/สร้างความคุ้นเคย', 'แนะนำตนเองและขั้นตอน', 'ท่าทีผ่อนคลาย', 'ใส่ใจต่อความสุขสบายของผู้ป่วย', 'สิ่งแวดล้อม', 'สอบถามความเข้าใจผู้ป่วย', 'ให้ความมั่นใจในการเก็บข้อมูลเป็นความลับ (confidentiality)'] },
  { section: 'B. เข้าใจประเด็นปัญหา (Identification of problem)', items: ['ถามถึงปัญหาต่าง ๆ', 'จัดลำดับความสำคัญ', 'ติดตามเรื่องราวอย่างต่อเนื่อง', 'สำรวจลงลึก', 'ทำความเข้าใจปัญหาให้กระจ่าง'] },
  { section: 'C. ตั้งเป้าหมาย (Goal setting)', items: ['เลือกปัญหาที่แท้จริงที่ต้องการ', 'การสรุปและนำสู่ประเด็น', 'การดึงเข้าประเด็นที่ต้องการ', 'สร้างแรงจูงใจ', 'กำหนดเป้าหมายร่วมกัน'] },
  { section: 'D. การแก้ปัญหา (Problem solving)', items: ['การให้ข้อมูลทางการแพทย์ (Medical facts)', 'ใช้ภาษาง่าย', 'เป็นประโยชน์', 'ถูกต้อง', 'เพียงพอ', 'เสนอทางเลือกที่เหมาะสม และหารือข้อดีข้อเสีย', 'การให้ผู้ป่วยมีส่วนร่วม', 'การให้ความหวัง', 'สรุปเป็นระยะ (Segment Summary)'] },
  { section: 'E. การจบการสนทนา (Closing)', items: ['เปิดโอกาสให้ถาม', 'แสดงความชื่นชม', 'การนัดหมายติดตาม'] },
  { section: 'F. ทักษะตลอดกระบวนการ (Counseling techniques)', items: ['การใช้ภาษา', 'การใช้ความเงียบ', 'การสื่อสารสองทาง', 'การมีส่วนร่วมในการตัดสินใจ', 'การใช้คำถาม (Questioning-open end)', 'การฟัง (Active Listening)', 'มีส่วนร่วมในความรู้สึก (Share of feeling)', 'การสะท้อนความรู้สึก (Acknowledges)', 'มีส่วนร่วมในความคิด (Share of thinking)', 'การสะท้อนความคิด (Reflection of thinking)', 'การให้กำลังใจ (Support: positive)', 'ความเข้าใจความรู้สึก (Empathy)', 'ไม่ตัดสินผิดถูก (Nonjudgmental, neutral)', 'ท่าทางเข้าใจ (Understanding)', 'ยอมรับ (Unconditional positive regard)'] }
];

/********************
 * Web entry
 ********************/
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'app';
  if (page === 'grade') {
    const t = HtmlService.createTemplateFromFile('Grade');
    t.token = (e.parameter.token || '').trim();
    return t.evaluate()
      .setTitle(APP.NAME + ' — Grading')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createTemplateFromFile('WebApp').evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/********************
 * One-time setup — run manually from the Apps Script editor once,
 * then Deploy > New deployment > Web app.
 ********************/
function setupSpreadsheet() {
  let ss;
  const existingId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (existingId) {
    try { ss = SpreadsheetApp.openById(existingId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(APP.NAME + ' Data');
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  }
  Object.keys(SHEETS).forEach(key => {
    const name = SHEETS[key];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      const headers = HEADERS[key];
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#4a1d3d').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > Object.keys(SHEETS).length) ss.deleteSheet(defaultSheet);

  seedIfEmpty_(ss, SHEETS.ASSESSMENTS, ASSESSMENT_SEED);

  const domainRows = [];
  let domainCounter = 0;
  Object.keys(DOMAINS_BY_CATEGORY).forEach(cat => {
    DOMAINS_BY_CATEGORY[cat].forEach((label, i) => {
      domainCounter++;
      domainRows.push(['DOM' + domainCounter, cat, '', label, i]);
    });
  });
  COMMU_SECTIONS.forEach((sec, si) => {
    sec.items.forEach((label, ii) => {
      domainCounter++;
      domainRows.push(['DOM' + domainCounter, 'COMMU', sec.section, label, si * 100 + ii]);
    });
  });
  seedIfEmpty_(ss, SHEETS.DOMAINS, domainRows);

  Logger.log('Spreadsheet ready: ' + ss.getUrl());
  return ss.getUrl();
}

function seedIfEmpty_(ss, sheetName, rows) {
  const sh = ss.getSheetByName(sheetName);
  if (sh.getLastRow() <= 1 && rows.length) {
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/********************
 * Sheet helpers
 ********************/
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Missing SPREADSHEET_ID. Run setupSpreadsheet() once from the Apps Script editor first.');
  return SpreadsheetApp.openById(id);
}
function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}
function readObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}
function appendRow_(sheetName, headerOrder, obj) {
  const sh = getSheet_(sheetName);
  sh.appendRow(headerOrder.map(h => (obj[h] === undefined || obj[h] === null) ? '' : obj[h]));
}
function findRowIndexByKey_(sheetName, keyField, keyValue) {
  const sh = getSheet_(sheetName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const keyCol = headers.indexOf(keyField);
  if (keyCol === -1) return -1;
  const values = sh.getRange(2, keyCol + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(keyValue)) return i + 2;
  }
  return -1;
}
function updateRowByKey_(sheetName, keyField, keyValue, patch) {
  const sh = getSheet_(sheetName);
  const rowIdx = findRowIndexByKey_(sheetName, keyField, keyValue);
  if (rowIdx === -1) throw new Error('Row not found: ' + sheetName + ' ' + keyField + '=' + keyValue);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const current = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  headers.forEach((h, i) => { if (patch.hasOwnProperty(h)) current[i] = patch[h]; });
  sh.getRange(rowIdx, 1, 1, headers.length).setValues([current]);
}
function logAudit_(action, entityId, detail) {
  try {
    appendRow_(SHEETS.AUDIT, HEADERS.AUDIT, {
      timestamp: new Date(), actor: Session.getActiveUser().getEmail() || 'unknown',
      action, entity_id: entityId, detail_json: JSON.stringify(detail || {})
    });
  } catch (e) { /* audit must never block the main action */ }
}
function newId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }

/********************
 * Bootstrap — hydrate the main app
 ********************/
function api_bootstrap() {
  const fellows = readObjects_(SHEETS.FELLOWS).filter(f => String(f.active) !== 'FALSE');
  const faculty = readObjects_(SHEETS.FACULTY).filter(f => String(f.active) !== 'FALSE');
  const assessments = readObjects_(SHEETS.ASSESSMENTS).filter(a => String(a.active) !== 'FALSE');
  const domains = readObjects_(SHEETS.DOMAINS);
  const submissions = readObjects_(SHEETS.SUBMISSIONS);
  return {
    fellows: fellows.map(f => ({ id: f.fellow_id, name: f.name, short: f.short_name, year: f.training_year, email: f.email, hasSignature: !!f.signature_png })),
    faculty: faculty.map(f => ({ id: f.faculty_id, name: f.name, short: f.short_name, email: f.email, hasSignature: !!f.signature_png })),
    assessments: assessments.map(a => ({ id: a.assessment_id, category: a.category, subtype: a.subtype, title: a.title, scoreType: a.score_type, requiredPass: a.required_pass_count || APP.COMM_REQUIRED_PASS_COUNT })),
    categoryLabel: CATEGORY_LABEL,
    domainsByCategory: DOMAINS_BY_CATEGORY,
    commuSections: COMMU_SECTIONS,
    completionLevel: APP.COMPLETION_LEVEL,
    submissions: submissions.map(stripForDashboard_)
  };
}

function stripForDashboard_(s) {
  return {
    id: s.submission_id, fellowId: s.fellow_id, assessmentId: s.assessment_id,
    category: s.category, subtype: s.subtype, title: s.title,
    assessorId: s.assessor_id, assessorName: s.assessor_name,
    status: s.status, createdAt: s.created_at, gradedAt: s.graded_at,
    globalResult: s.status === 'GRADED' ? s.global_result : ''
  };
}

/********************
 * Fellow: submit assessment request
 ********************/
function api_submitRequest(payload) {
  const fellow = readObjects_(SHEETS.FELLOWS).find(f => f.fellow_id === payload.fellowId);
  const assessor = readObjects_(SHEETS.FACULTY).find(f => f.faculty_id === payload.assessorId);
  const assessment = readObjects_(SHEETS.ASSESSMENTS).find(a => a.assessment_id === payload.assessmentId);
  if (!fellow || !assessor || !assessment) throw new Error('Invalid fellow / assessor / assessment.');
  if (!payload.patientName || !payload.hn || !payload.caseDate) throw new Error('Patient name, HN and case date are required.');

  const submissionId = newId_('SUB');
  const token = Utilities.getUuid();
  const row = {
    submission_id: submissionId, created_at: new Date(), fellow_id: fellow.fellow_id, fellow_name: fellow.name,
    training_year: payload.trainingYear || fellow.training_year,
    assessment_id: assessment.assessment_id, category: assessment.category, subtype: assessment.subtype,
    title: assessment.title, score_type: assessment.score_type,
    patient_name: payload.patientName, hn: payload.hn, diagnosis: payload.diagnosis || '',
    case_date: payload.caseDate, location: payload.location || '', reflection: payload.reflection || '',
    assessor_id: assessor.faculty_id, assessor_name: assessor.name, assessor_email: assessor.email,
    status: 'PENDING', token, token_used: 'FALSE',
    domain_scores_json: '', global_result: '', comment: '', graded_at: '',
    assessor_signature_png: '', pdf_file_id: '', pdf_url: ''
  };
  appendRow_(SHEETS.SUBMISSIONS, HEADERS.SUBMISSIONS, row);
  logAudit_('submit_request', submissionId, { fellowId: fellow.fellow_id, assessorId: assessor.faculty_id });

  sendAssessorEmail_(row);
  return { ok: true, submissionId };
}

function escapeHtml_(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sendAssessorEmail_(row) {
  const url = ScriptApp.getService().getUrl() + '?page=grade&token=' + encodeURIComponent(row.token);
  const subject = '[EPA Tracker] Assessment request — ' + row.fellow_name + ' · ' + row.subtype;
  const html = '<p>อาจารย์ ' + escapeHtml_(row.assessor_name) + ' ครับ/ค่ะ</p>' +
    '<p>' + escapeHtml_(row.fellow_name) + ' (F' + escapeHtml_(row.training_year) + ') ส่งคำขอประเมิน <b>' + CATEGORY_LABEL[row.category] + ' · ' + escapeHtml_(row.subtype) + '</b></p>' +
    '<p><b>' + escapeHtml_(row.title) + '</b></p>' +
    '<p>ผู้ป่วย: ' + escapeHtml_(row.patient_name) + ' (HN ' + escapeHtml_(row.hn) + ') — ' + escapeHtml_(row.diagnosis || '-') + '<br>' +
    'สถานที่/วันที่: ' + escapeHtml_(row.location || '-') + ' · ' + escapeHtml_(row.case_date) + '</p>' +
    '<p><a href="' + url + '" style="background:#a3306b;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">เปิดแบบประเมิน</a></p>' +
    '<p style="color:#888;font-size:12px">ลิงก์นี้ใช้ได้ครั้งเดียว หากประเมินไปแล้วลิงก์จะปิดใช้งานอัตโนมัติ</p>';
  MailApp.sendEmail({ to: row.assessor_email, subject, htmlBody: html });
}

/********************
 * Faculty: grading (one-time token link)
 ********************/
function api_getGradingByToken(token) {
  const s = readObjects_(SHEETS.SUBMISSIONS).find(r => r.token === token);
  if (!s) return { ok: false, error: 'ลิงก์นี้ไม่ถูกต้อง' };
  if (String(s.token_used) === 'TRUE' || s.status === 'GRADED') return { ok: false, error: 'แบบประเมินนี้ถูกส่งไปแล้ว ลิงก์นี้ใช้ไม่ได้อีกต่อไป' };

  const assessment = readObjects_(SHEETS.ASSESSMENTS).find(a => a.assessment_id === s.assessment_id);
  const isChecklist = assessment.category === 'COMMU';
  let sections;
  if (isChecklist) {
    sections = COMMU_SECTIONS.map((sec, si) => ({
      section: sec.section,
      items: sec.items.map((label, ii) => ({ key: 'COMMU_' + si + '_' + ii, label }))
    }));
  } else {
    sections = [{ section: '', items: DOMAINS_BY_CATEGORY[assessment.category].map((label, di) => ({ key: assessment.category + '_' + di, label })) }];
  }
  return {
    ok: true,
    submission: {
      fellowName: s.fellow_name, patientName: s.patient_name, hn: s.hn, diagnosis: s.diagnosis,
      location: s.location, caseDate: s.case_date, reflection: s.reflection,
      category: assessment.category, categoryLabel: CATEGORY_LABEL[assessment.category],
      subtype: assessment.subtype, title: assessment.title, isChecklist
    },
    sections,
    globalOptions: isChecklist ? ['PASS', 'FAIL'] : ['1', '2', '3', '4', '5']
  };
}

function api_submitGrading(payload) {
  const rowIdx = findRowIndexByKey_(SHEETS.SUBMISSIONS, 'token', payload.token);
  if (rowIdx === -1) throw new Error('ลิงก์นี้ไม่ถูกต้อง');
  const sh = getSheet_(SHEETS.SUBMISSIONS);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rowVals = sh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  const s = {}; headers.forEach((h, i) => s[h] = rowVals[i]);

  if (String(s.token_used) === 'TRUE' || s.status === 'GRADED') throw new Error('แบบประเมินนี้ถูกส่งไปแล้ว');
  if (!payload.globalResult) throw new Error('กรุณาเลือกผลรวม (overall result)');
  if (!payload.assessorSignaturePng) throw new Error('กรุณาเซ็นชื่อก่อนส่งผลประเมิน');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const rowIdx2 = findRowIndexByKey_(SHEETS.SUBMISSIONS, 'token', payload.token);
    const recheck = sh.getRange(rowIdx2, headers.indexOf('token_used') + 1, 1, 1).getValue();
    if (String(recheck) === 'TRUE') throw new Error('แบบประเมินนี้ถูกส่งไปแล้ว');

    updateRowByKey_(SHEETS.SUBMISSIONS, 'token', payload.token, {
      status: 'GRADED', token_used: 'TRUE',
      domain_scores_json: JSON.stringify(payload.scores || {}),
      global_result: payload.globalResult, comment: payload.comment || '',
      graded_at: new Date(), assessor_signature_png: payload.assessorSignaturePng
    });
  } finally {
    lock.releaseLock();
  }

  const updated = readObjects_(SHEETS.SUBMISSIONS).find(r => r.token === payload.token);
  logAudit_('submit_grading', updated.submission_id, { assessorId: updated.assessor_id, globalResult: updated.global_result });

  let pdfUrl = '';
  try {
    pdfUrl = buildAndStorePdf_(updated).url;
  } catch (e) {
    logAudit_('pdf_error', updated.submission_id, { message: e.message });
  }
  return { ok: true, pdfUrl };
}

/********************
 * PDF generation
 ********************/
function getOrCreateFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}
function base64ToBlob_(dataUrl, name) {
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
  return Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', name);
}

function buildAndStorePdf_(s) {
  const fellow = readObjects_(SHEETS.FELLOWS).find(f => f.fellow_id === s.fellow_id) || {};
  const domains = JSON.parse(s.domain_scores_json || '{}');
  const domainLabels = domainLabelMap_(s.category);

  const doc = DocumentApp.create('EPA_' + s.submission_id + '_tmp');
  const body = doc.getBody();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);
  body.appendParagraph(APP.NAME).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(CATEGORY_LABEL[s.category] + ' · ' + s.subtype).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(s.title);

  const info = body.appendTable([
    ['Fellow', s.fellow_name + ' (F' + s.training_year + ')'],
    ['Assessor', s.assessor_name],
    ['Patient', s.patient_name + ' · HN ' + s.hn],
    ['Diagnosis', s.diagnosis || '-'],
    ['Location / Date', (s.location || '-') + ' · ' + s.case_date]
  ]);
  info.getRow(0).getCell(0).setBold(true);

  body.appendParagraph('Reflection').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(s.reflection || '-');

  body.appendParagraph('Domain scores').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const scoreRows = [['Domain', 'Score']];
  Object.keys(domains).forEach(key => {
    scoreRows.push([domainLabels[key] || key, domains[key]]);
  });
  if (scoreRows.length > 1) body.appendTable(scoreRows);

  const overallLabel = s.category === 'COMMU' ? s.global_result : ('Level ' + s.global_result);
  body.appendParagraph('Overall result: ' + overallLabel).setHeading(DocumentApp.ParagraphHeading.HEADING3);

  body.appendParagraph('Feedback').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(s.comment || '-');

  body.appendParagraph('Signatures').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const sigTable = body.appendTable([['Assessor', 'Fellow']]);
  const assessorSigBlob = base64ToBlob_(s.assessor_signature_png, 'assessor_sig.png');
  const fellowSigBlob = fellow.signature_png ? base64ToBlob_(fellow.signature_png, 'fellow_sig.png') : null;
  if (assessorSigBlob) sigTable.getRow(0).getCell(0).appendImage(assessorSigBlob).setWidth(150);
  if (fellowSigBlob) sigTable.getRow(0).getCell(1).appendImage(fellowSigBlob).setWidth(150);
  body.appendParagraph(s.assessor_name + '   /   ' + s.fellow_name);
  body.appendParagraph('Graded at: ' + Utilities.formatDate(new Date(s.graded_at), APP.TIMEZONE, 'dd MMM yyyy HH:mm') + ' (' + APP.TIMEZONE + ')');

  doc.saveAndClose();
  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF).setName(s.subtype + '_' + s.fellow_name + '_' + s.submission_id + '.pdf');
  const folder = getOrCreateFolder_(APP.PDF_FOLDER_NAME);
  const pdfFile = folder.createFile(pdfBlob);
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  updateRowByKey_(SHEETS.SUBMISSIONS, 'submission_id', s.submission_id, { pdf_file_id: pdfFile.getId(), pdf_url: pdfFile.getUrl() });

  if (!fellow.email) logAudit_('missing_fellow_email', s.submission_id, { fellowId: s.fellow_id });
  const mailOptions = {
    to: fellow.email || APP.UNIT_RECORD_EMAIL,
    subject: '[EPA Tracker] ผลประเมิน ' + CATEGORY_LABEL[s.category] + ' · ' + s.subtype + ' — ' + overallLabel,
    htmlBody: '<p>ผลการประเมิน <b>' + s.title + '</b> โดย ' + s.assessor_name + '</p><p>ผลรวม: <b>' + overallLabel + '</b></p><p>ดูรายละเอียดในไฟล์ PDF ที่แนบมา</p>',
    attachments: [pdfBlob]
  };
  if (fellow.email) mailOptions.cc = APP.UNIT_RECORD_EMAIL;
  MailApp.sendEmail(mailOptions);

  return { fileId: pdfFile.getId(), url: pdfFile.getUrl() };
}

function domainLabelMap_(category) {
  const map = {};
  if (category === 'COMMU') {
    COMMU_SECTIONS.forEach((sec, si) => sec.items.forEach((label, ii) => { map['COMMU_' + si + '_' + ii] = sec.section + ' — ' + label; }));
  } else {
    (DOMAINS_BY_CATEGORY[category] || []).forEach((label, i) => { map[category + '_' + i] = label; });
  }
  return map;
}

function api_regeneratePdf(submissionId) {
  const s = readObjects_(SHEETS.SUBMISSIONS).find(r => r.submission_id === submissionId);
  if (!s || s.status !== 'GRADED') throw new Error('Submission not graded yet.');
  const result = buildAndStorePdf_(s);
  logAudit_('regenerate_pdf', submissionId, {});
  return { ok: true, url: result.url };
}

/********************
 * Admin: fellows / faculty
 ********************/
function api_adminUpsertFellow(payload) {
  const existing = payload.id ? readObjects_(SHEETS.FELLOWS).find(f => f.fellow_id === payload.id) : null;
  if (existing) {
    updateRowByKey_(SHEETS.FELLOWS, 'fellow_id', payload.id, {
      name: payload.name, short_name: payload.shortName, email: payload.email,
      training_year: payload.trainingYear, active: payload.active !== false ? 'TRUE' : 'FALSE',
      signature_png: payload.signaturePng || existing.signature_png || ''
    });
    logAudit_('update_fellow', payload.id, {});
    return { ok: true, id: payload.id };
  }
  const id = newId_('FEL');
  appendRow_(SHEETS.FELLOWS, HEADERS.FELLOWS, {
    fellow_id: id, name: payload.name, short_name: payload.shortName, email: payload.email,
    training_year: payload.trainingYear, active: 'TRUE', signature_png: payload.signaturePng || ''
  });
  logAudit_('create_fellow', id, {});
  return { ok: true, id };
}

function api_adminUpsertFaculty(payload) {
  const existing = payload.id ? readObjects_(SHEETS.FACULTY).find(f => f.faculty_id === payload.id) : null;
  if (existing) {
    updateRowByKey_(SHEETS.FACULTY, 'faculty_id', payload.id, {
      name: payload.name, short_name: payload.shortName, email: payload.email,
      active: payload.active !== false ? 'TRUE' : 'FALSE',
      signature_png: payload.signaturePng || existing.signature_png || ''
    });
    logAudit_('update_faculty', payload.id, {});
    return { ok: true, id: payload.id };
  }
  const id = newId_('FAC');
  appendRow_(SHEETS.FACULTY, HEADERS.FACULTY, {
    faculty_id: id, name: payload.name, short_name: payload.shortName, email: payload.email,
    active: 'TRUE', signature_png: payload.signaturePng || ''
  });
  logAudit_('create_faculty', id, {});
  return { ok: true, id };
}

/********************
 * Portfolio export + checkpoint reports
 ********************/
function api_exportPortfolio(fellowId) {
  const fellow = readObjects_(SHEETS.FELLOWS).find(f => f.fellow_id === fellowId);
  if (!fellow) throw new Error('Fellow not found');
  const records = readObjects_(SHEETS.SUBMISSIONS).filter(s => s.fellow_id === fellowId && s.status === 'GRADED')
    .sort((a, b) => new Date(a.graded_at) - new Date(b.graded_at));
  if (!records.length) throw new Error('No completed assessments yet for this fellow.');

  const doc = DocumentApp.create('Portfolio_' + fellow.name + '_tmp');
  const body = doc.getBody();
  body.appendParagraph(APP.NAME + ' — Year-End Portfolio').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(fellow.name + ' · F' + fellow.training_year).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Generated ' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'dd MMM yyyy'));

  records.forEach(s => {
    body.appendPageBreak();
    const domains = JSON.parse(s.domain_scores_json || '{}');
    const domainLabels = domainLabelMap_(s.category);
    body.appendParagraph(CATEGORY_LABEL[s.category] + ' · ' + s.subtype + ' — ' + s.title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendTable([
      ['Assessor', s.assessor_name],
      ['Patient', s.patient_name + ' · HN ' + s.hn],
      ['Case date', s.case_date],
      ['Overall result', s.category === 'COMMU' ? s.global_result : ('Level ' + s.global_result)],
      ['Graded at', Utilities.formatDate(new Date(s.graded_at), APP.TIMEZONE, 'dd MMM yyyy')]
    ]);
    const scoreRows = [['Domain', 'Score']];
    Object.keys(domains).forEach(key => scoreRows.push([domainLabels[key] || key, domains[key]]));
    if (scoreRows.length > 1) body.appendTable(scoreRows);
    if (s.comment) { body.appendParagraph('Feedback:').setBold(true); body.appendParagraph(s.comment); }
  });

  doc.saveAndClose();
  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF).setName('Portfolio_' + fellow.name + '_' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd') + '.pdf');
  const folder = getOrCreateFolder_(APP.PDF_FOLDER_NAME);
  const pdfFile = folder.createFile(pdfBlob);
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  logAudit_('export_portfolio', fellowId, { records: records.length });
  return { ok: true, url: pdfFile.getUrl() };
}

function api_generateCheckpoint(fellowId, label) {
  const dash = computeFellowDashboard_(fellowId);
  const id = newId_('CKPT');
  appendRow_(SHEETS.CHECKPOINTS, HEADERS.CHECKPOINTS, {
    checkpoint_id: id, fellow_id: fellowId, label: label || '', frozen_at: new Date(),
    snapshot_json: JSON.stringify(dash)
  });
  logAudit_('generate_checkpoint', fellowId, { label });
  return { ok: true, id, snapshot: dash };
}

function api_listCheckpoints(fellowId) {
  return readObjects_(SHEETS.CHECKPOINTS).filter(c => c.fellow_id === fellowId)
    .map(c => ({ id: c.checkpoint_id, label: c.label, frozenAt: c.frozen_at, snapshot: JSON.parse(c.snapshot_json || '{}') }))
    .sort((a, b) => new Date(b.frozenAt) - new Date(a.frozenAt));
}

/********************
 * One-time import from the legacy V3.3 spreadsheet (separate Fellows/Faculty/
 * Assessment_Submission/Assessment_Record/Assessment_Domain_Score sheets).
 * Run manually from the Apps Script editor once, with the legacy Spreadsheet
 * ID (Apps Script editor of the OLD project → linked Sheet → its URL,
 * the /d/<ID>/ segment). Matches assessment items by (category, subtype)
 * rather than assessment_id, since the legacy ID scheme is unconfirmed.
 * Only migrates GRADED records (immutable history) — legacy PENDING
 * requests are logged to Audit_Log for manual resubmission, since their
 * one-time links point at the old deployment URL and can't be carried over.
 ********************/
function importFromLegacySpreadsheet_(legacySpreadsheetId) {
  const legacy = SpreadsheetApp.openById(legacySpreadsheetId);
  const report = { fellowsImported: 0, facultyImported: 0, recordsImported: 0, pendingSkipped: 0, unmatchedAssessments: [] };

  const legacyFellows = readLegacySheet_(legacy, 'Fellows');
  legacyFellows.forEach(f => {
    if (!f.email) return;
    const exists = readObjects_(SHEETS.FELLOWS).find(x => x.email === f.email);
    if (exists) return;
    appendRow_(SHEETS.FELLOWS, HEADERS.FELLOWS, {
      fellow_id: newId_('FEL'), name: f.name, short_name: (f.name || '').split(' ')[0],
      email: f.email, training_year: f.default_training_year || '1', active: 'TRUE', signature_png: ''
    });
    report.fellowsImported++;
  });

  const legacyFaculty = readLegacySheet_(legacy, 'Faculty');
  legacyFaculty.forEach(f => {
    if (!f.email) return;
    const exists = readObjects_(SHEETS.FACULTY).find(x => x.email === f.email);
    if (exists) return;
    appendRow_(SHEETS.FACULTY, HEADERS.FACULTY, {
      faculty_id: newId_('FAC'), name: f.name, short_name: (f.name || '').split(' ')[0],
      email: f.email, active: 'TRUE', signature_png: ''
    });
    report.facultyImported++;
  });

  const fellowByEmail = {}; readObjects_(SHEETS.FELLOWS).forEach(f => fellowByEmail[f.email] = f);
  const facultyByEmail = {}; readObjects_(SHEETS.FACULTY).forEach(f => facultyByEmail[f.email] = f);
  const assessmentByKey = {}; ASSESSMENT_SEED.forEach(row => assessmentByKey[row[1] + '|' + row[2]] = row);

  const legacySubmissions = readLegacySheet_(legacy, 'Assessment_Submission');
  const legacyRecords = readLegacySheet_(legacy, 'Assessment_Record');
  const legacyScores = readLegacySheet_(legacy, 'Assessment_Domain_Score');
  const submissionById = {}; legacySubmissions.forEach(s => submissionById[s.submission_id] = s);
  const alreadyImportedTokens = {}; readObjects_(SHEETS.SUBMISSIONS).forEach(s => { alreadyImportedTokens[s.token] = true; });
  report.alreadyImportedSkipped = 0;

  legacyRecords.forEach(rec => {
    const legacyToken = 'legacy_' + rec.record_id;
    if (alreadyImportedTokens[legacyToken]) { report.alreadyImportedSkipped++; return; }
    const sub = submissionById[rec.submission_id] || {};
    const key = rec.category + '|' + rec.subtype;
    const assessment = assessmentByKey[key];
    if (!assessment) { report.unmatchedAssessments.push(key); return; }
    const fellow = fellowByEmail[rec.fellow_email] || {};
    const faculty = facultyByEmail[rec.assessor_email] || {};
    const scores = {};
    legacyScores.filter(sc => sc.record_id === rec.record_id).forEach((sc, i) => { scores[assessment[1] + '_' + i] = sc.score_value; });
    appendRow_(SHEETS.SUBMISSIONS, HEADERS.SUBMISSIONS, {
      submission_id: newId_('SUB'), created_at: rec.created_at || new Date(),
      fellow_id: fellow.fellow_id || '', fellow_name: rec.fellow_name, training_year: rec.training_year,
      assessment_id: assessment[0], category: rec.category, subtype: rec.subtype, title: rec.title, score_type: assessment[4],
      patient_name: rec.patient_name, hn: rec.hn, diagnosis: rec.diagnosis, case_date: rec.case_date,
      location: sub.assessment_location || rec.assessment_location || '', reflection: sub.reflection || '',
      assessor_id: faculty.faculty_id || '', assessor_name: rec.assessor_name, assessor_email: rec.assessor_email,
      status: 'GRADED', token: 'legacy_' + rec.record_id, token_used: 'TRUE',
      domain_scores_json: JSON.stringify(scores),
      global_result: rec.category === 'COMMU' ? rec.global_result : rec.global_level,
      comment: rec.global_comment || '', graded_at: rec.created_at || '',
      assessor_signature_png: '', pdf_file_id: rec.pdf_file_id || '', pdf_url: rec.pdf_url || ''
    });
    report.recordsImported++;
  });

  const gradedSubmissionIds = {}; legacyRecords.forEach(r => gradedSubmissionIds[r.submission_id] = true);
  legacySubmissions.forEach(s => { if (!gradedSubmissionIds[s.submission_id] && s.status !== 'GRADED') report.pendingSkipped++; });

  logAudit_('legacy_import', legacySpreadsheetId, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function readLegacySheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues().map(row => {
    const obj = {}; headers.forEach((h, i) => obj[h] = row[i]); return obj;
  });
}

function computeFellowDashboard_(fellowId) {
  const assessments = readObjects_(SHEETS.ASSESSMENTS).filter(a => String(a.active) !== 'FALSE');
  const submissions = readObjects_(SHEETS.SUBMISSIONS).filter(s => s.fellow_id === fellowId);
  const categories = Object.keys(CATEGORY_LABEL);
  const byCategory = categories.map(category => {
    const items = assessments.filter(a => a.category === category).map(a => {
      const recs = submissions.filter(s => s.assessment_id === a.assessment_id);
      const graded = recs.filter(r => r.status === 'GRADED');
      const pending = recs.filter(r => r.status === 'PENDING');
      let status = 'NOT_SUBMITTED';
      if (category === 'COMMU') {
        const passGraded = graded.filter(r => r.global_result === 'PASS');
        if (passGraded.length >= (a.required_pass_count || APP.COMM_REQUIRED_PASS_COUNT)) status = 'COMPLETED';
        else if (pending.length) status = 'PENDING';
        else if (graded.length) status = 'NOT_COMPLETED';
      } else {
        const passGraded = graded.filter(r => Number(r.global_result) >= APP.COMPLETION_LEVEL);
        if (passGraded.length) status = 'COMPLETED';
        else if (pending.length) status = 'PENDING';
        else if (graded.length) status = 'NOT_COMPLETED';
      }
      return { id: a.assessment_id, subtype: a.subtype, title: a.title, status };
    });
    const completedCount = items.filter(i => i.status === 'COMPLETED').length;
    const percent = items.length ? Math.round(completedCount / items.length * 100) : 0;
    return { category, label: CATEGORY_LABEL[category], items, completedCount, total: items.length, percent };
  });
  const total = byCategory.reduce((s, c) => s + c.total, 0);
  const completed = byCategory.reduce((s, c) => s + c.completedCount, 0);
  return { fellowId, byCategory, total, completed, percent: total ? Math.round(completed / total * 100) : 0 };
}
