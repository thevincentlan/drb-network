// --- DRB Network Database - Secure OTP Backend ---
// Deploy this script as a Web App (Execute as: Me, Access: Anyone)

const SPREADSHEET_ID = '1oXzXtw4lPY_jV4D9BA65aipjm9yf44mw4Qyx8tufZrE';
const OLD_SHEET_NAME = 'Form responses';
const NEW_SHEET_NAME = 'Form Responses new';
const OTP_SHEET_NAME = 'OTP_Log';
const ACCESS_REQUESTS_SHEET_NAME = 'Access Requests';
const ACCESS_REQUEST_FIELDS = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'grad_year', label: 'ERHS Graduation Year', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone Number' },
  { key: 'city', label: 'Current City' },
  { key: 'state', label: 'Current State' },
  { key: 'occupation', label: 'Occupation / Industry' },
  { key: 'contact_for_events', label: 'Okay for DRB Event Contact' },
  { key: 'education_university', label: 'University' },
  { key: 'education_major', label: 'Major(s)' },
  { key: 'education_degree', label: 'Degree(s)' },
  { key: 'education_grad_year', label: 'Education Graduation Year(s)' },
  { key: 'greek_affiliation', label: 'Greek Affiliation' },
  { key: 'tenure', label: 'Tenure on DRB (Years)' },
  { key: 'leadership', label: 'Leadership Positions Held' },
  { key: 'awards', label: 'DRB Awards' },
  { key: 'favorite_step', label: 'Favorite Step' },
  { key: 'military_branch', label: 'Military Branch' },
  { key: 'military_rank', label: 'Military Rank' },
  { key: 'about', label: 'Highlights / About' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'social_media', label: 'Other Social Media' },
  { key: 'websites', label: 'Website(s)' },
  { key: 'current_photo_filename', label: 'Current Photo Filename' },
  { key: 'drb_photo_filename', label: 'DRB Photo Filename' },
  { key: 'share_email', label: 'Share Email With Alumni' },
  { key: 'share_phone', label: 'Share Phone With Alumni' },
  { key: 'share_social', label: 'Share Social Links With Alumni' },
  { key: 'review_notes', label: 'Approval Notes' }
];

function doGet(e) {
  try {
    const request = e.parameter;
    const action = request.action;
    if (!action) {
      return createJsonResponse({ success: false, error: 'Missing action parameter.' });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetOld = ss.getSheetByName(OLD_SHEET_NAME);
    const sheetNew = ss.getSheetByName(NEW_SHEET_NAME);
    const dataOld = sheetOld ? sheetOld.getDataRange().getValues() : [];
    const dataNew = sheetNew ? sheetNew.getDataRange().getValues() : [];

    // --- ACTION: Admin Login (skip email verification) ---
    if (action === 'admin_login') {
      return createJsonResponse({
        success: true,
        csvOld: convertToCsv(dataOld),
        csvNew: convertToCsv(dataNew)
      });
    }

    // --- ACTION: Approve Request from Email ---
    if (action === 'approve_request') {
      const requestId = request.requestId;
      if (!requestId) return HtmlService.createHtmlOutput('Error: Missing requestId.');

      const requestSheet = getOrCreateAccessRequestsSheet(ss);
      const data = requestSheet.getDataRange().getValues();
      if (data.length < 2) return HtmlService.createHtmlOutput('Error: No data in Access Requests sheet.');

      const headers = data[0];
      const reqIdCol = headers.indexOf('Request ID');
      const statusCol = headers.indexOf('Status');

      let targetRowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][reqIdCol]) === String(requestId)) {
          targetRowIndex = i;
          break;
        }
      }

      if (targetRowIndex === -1) return HtmlService.createHtmlOutput('Error: Request ID not found in sheet.');

      const rowData = data[targetRowIndex];
      const currentStatus = String(rowData[statusCol]);
      if (currentStatus.includes('Approved')) {
        return HtmlService.createHtmlOutput('<div style="font-family:sans-serif; text-align:center; padding:40px;"><h2>✅ Already Approved</h2><p>This request has already been approved and synced.</p></div>');
      }

      const props = PropertiesService.getScriptProperties();
      const supabaseUrl = props.getProperty('SUPABASE_URL');
      const supabaseKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !supabaseKey) {
        return HtmlService.createHtmlOutput('Error: Missing Supabase credentials in Apps Script Properties (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
      }

      const emailVal = rowData[headers.indexOf('Email')] || '';
      const email = String(emailVal).trim().toLowerCase();
      const firstName = String(rowData[headers.indexOf('First Name')] || '').trim();
      const lastName = String(rowData[headers.indexOf('Last Name')] || '').trim();
      const gradYear = parseInt(String(rowData[headers.indexOf('ERHS Graduation Year')]), 10) || null;

      if (!email || !firstName || !lastName || !gradYear) {
        return HtmlService.createHtmlOutput('Error: Missing core fields (Email, First Name, Last Name, Grad Year) in the sheet. Please fix the row and try again.');
      }

      const alumniPayload = {
        first_name: firstName, last_name: lastName, grad_year: gradYear, email: email,
        phone: String(rowData[headers.indexOf('Phone Number')] || '').trim(),
        city: String(rowData[headers.indexOf('Current City')] || '').trim(),
        state: String(rowData[headers.indexOf('Current State')] || '').trim(),
        occupation: String(rowData[headers.indexOf('Occupation / Industry')] || '').trim(),
        tenure: String(rowData[headers.indexOf('Tenure on DRB (Years)')] || '').trim(),
        favorite_step: String(rowData[headers.indexOf('Favorite Step')] || '').trim(),
        about: String(rowData[headers.indexOf('Highlights / About')] || '').trim(),
        military_branch: String(rowData[headers.indexOf('Military Branch')] || '').trim(),
        military_rank: String(rowData[headers.indexOf('Military Rank')] || '').trim()
      };

      const alumniInsertRes = supabaseJsonRequest_(supabaseUrl, supabaseKey, 'POST', '/rest/v1/alumni', alumniPayload, {
        headers: { Prefer: 'return=representation' }
      });
      if (alumniInsertRes.status >= 400 && !String(alumniInsertRes.text || '').includes('duplicate key')) {
        return HtmlService.createHtmlOutput('Database Error: ' + alumniInsertRes.text);
      }

      let alumnusRecord = null;
      if (alumniInsertRes.status >= 200 && alumniInsertRes.status < 300) {
        alumnusRecord = Array.isArray(alumniInsertRes.json) ? alumniInsertRes.json[0] : alumniInsertRes.json;
      }
      if (!alumnusRecord || !alumnusRecord.id) {
        const existingAlumnusRes = supabaseJsonRequest_(
          supabaseUrl,
          supabaseKey,
          'GET',
          '/rest/v1/alumni?select=id,email&email=eq.' + encodeURIComponent(email) + '&limit=1'
        );
        if (existingAlumnusRes.status >= 400) {
          return HtmlService.createHtmlOutput('Database Error: ' + existingAlumnusRes.text);
        }
        alumnusRecord = Array.isArray(existingAlumnusRes.json) ? existingAlumnusRes.json[0] : null;
      }
      if (!alumnusRecord || !alumnusRecord.id) {
        return HtmlService.createHtmlOutput('Database Error: Could not determine approved alumnus ID.');
      }

      syncApprovedRequestSupplementalFields_(supabaseUrl, supabaseKey, alumnusRecord.id, rowData, headers);
      syncApprovedRequestRelatedRecords_(supabaseUrl, supabaseKey, alumnusRecord.id, rowData, headers);

      const authPayload = {
        email: email, email_confirm: true, user_metadata: { first_name: firstName, last_name: lastName }
      };
      const authRes = supabaseJsonRequest_(supabaseUrl, supabaseKey, 'POST', '/auth/v1/admin/users', authPayload);

      if (authRes.status >= 200 && authRes.status < 300) {
        requestSheet.getRange(targetRowIndex + 1, statusCol + 1).setValue('Approved & Synced');
        return HtmlService.createHtmlOutput('<div style="font-family:sans-serif; text-align:center; padding:40px; color:#166534; background:#f0fdf4; border-radius:12px;"><h2>✅ Successfully Approved!</h2><p>User added to Supabase DB and permitted to log in.</p></div>');
      } else if (String(authRes.text || '').includes('already exists')) {
        requestSheet.getRange(targetRowIndex + 1, statusCol + 1).setValue('Approved (Auth Existed)');
        return HtmlService.createHtmlOutput('<div style="font-family:sans-serif; text-align:center; padding:40px; color:#166534; background:#f0fdf4; border-radius:12px;"><h2>✅ Profile Synced!</h2><p>Data was added. Authentication user already existed.</p></div>');
      } else {
        requestSheet.getRange(targetRowIndex + 1, statusCol + 1).setValue('Auth Error');
        return HtmlService.createHtmlOutput('Auth API Error: ' + authRes.text);
      }
    }

    const emailInput = e.parameter.email ? String(e.parameter.email).toLowerCase().trim() : '';
    if (!emailInput) {
      return createJsonResponse({ success: false, error: 'Missing email parameter.' });
    }

    // Check if the user exists in EITHER sheet
    let isAuthorizedUser = false;
    let actualUserEmail = '';

    function searchSheetForEmail(data) {
      if (data.length < 2) return false;
      const headers = data[0];
      const emailIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes('email'));
      if (emailIdx === -1) return false;

      for (let i = 1; i < data.length; i++) {
        const rowEmail = String(data[i][emailIdx]).toLowerCase().trim();
        if (rowEmail === emailInput || rowEmail.includes(emailInput)) {
          return true;
        }
      }
      return false;
    }

    if (searchSheetForEmail(dataOld) || searchSheetForEmail(dataNew)) {
      isAuthorizedUser = true;
      actualUserEmail = emailInput;
    }

    if (!isAuthorizedUser) {
      return createJsonResponse({ success: false, error: 'Email not found in the official directory. Access denied.' });
    }

    // --- ACTION: Request OTP Code ---
    if (action === 'request_otp') {
      let otpSheet = ss.getSheetByName(OTP_SHEET_NAME);
      if (!otpSheet) {
        otpSheet = ss.insertSheet(OTP_SHEET_NAME);
        otpSheet.appendRow(['Email', 'Code', 'Expires At']);
        otpSheet.hideSheet();
      }

      cleanupExpiredOTPs(otpSheet);

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const now = new Date();
      const expirationMillis = now.getTime() + (15 * 60 * 1000);

      otpSheet.appendRow([actualUserEmail, code, expirationMillis]);

      const emailSubject = 'Your DRB Network Login Code: ' + code;
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #4B9CD3; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">DRB Network Database</h1>
          </div>
          <div style="padding: 30px; color: #333;">
            <p style="font-size: 16px;">Hi there,</p>
            <p style="font-size: 16px;">Your secure login code is:</p>
            <div style="background-color: #f5f5f5; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1a1a1a;">${code}</span>
            </div>
            <p style="font-size: 14px; color: #666; margin-top: 30px;">This code will safely expire in 15 minutes. If you did not request this, you can ignore this email.</p>
          </div>
        </div>
      `;

      MailApp.sendEmail({
        to: actualUserEmail,
        subject: emailSubject,
        htmlBody: htmlBody,
        name: 'DRB Network Security'
      });

      return createJsonResponse({ success: true, message: 'Code sent successfully.' });
    }

    // --- ACTION: Verify OTP Code ---
    else if (action === 'verify_otp') {
      const inputCode = request.code ? String(request.code).trim() : '';
      if (!inputCode) {
        return createJsonResponse({ success: false, error: 'Verification code is required.' });
      }

      let otpSheet = ss.getSheetByName(OTP_SHEET_NAME);
      if (!otpSheet) {
        return createJsonResponse({ success: false, error: 'Server error: OTP configuration missing.' });
      }

      const otpData = otpSheet.getDataRange().getValues();
      let isValid = false;
      const nowTime = new Date().getTime();
      let rowToDelete = -1;

      for (let i = otpData.length - 1; i > 0; i--) {
        const rowEmail = String(otpData[i][0]).toLowerCase().trim();
        const storedCode = String(otpData[i][1]).trim();
        const expiresAt = Number(otpData[i][2]);

        if (rowEmail === actualUserEmail && storedCode === inputCode) {
          if (nowTime > expiresAt) {
            return createJsonResponse({ success: false, error: 'This code has expired. Please request a new one.' });
          }
          isValid = true;
          rowToDelete = i + 1;
          break;
        }
      }

      if (isValid) {
        otpSheet.deleteRow(rowToDelete);

        // Return BOTH sheets as separate CSV payloads
        return createJsonResponse({
          success: true,
          csvOld: convertToCsv(dataOld),
          csvNew: convertToCsv(dataNew)
        });
      } else {
        return createJsonResponse({ success: false, error: 'Invalid verification code.' });
      }
    }

    else {
      return createJsonResponse({ success: false, error: 'Invalid action provided.' });
    }

  } catch (error) {
    return createJsonResponse({ success: false, error: 'Internal server error: ' + error.toString() });
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'request_access') {
      const request = normalizeAccessRequest(body.request || {});
      const attachments = normalizeAccessAttachments(body.request && body.request.attachments);
      request.current_photo_filename = attachments.find(attachment => attachment.role === 'Current Photo')?.name || '';
      request.drb_photo_filename = attachments.find(attachment => attachment.role === 'DRB Photo')?.name || '';
      const missingFields = ACCESS_REQUEST_FIELDS
        .filter(field => field.required && !request[field.key])
        .map(field => field.label);

      if (missingFields.length > 0) {
        return createJsonResponse({ success: false, error: 'Missing required fields: ' + missingFields.join(', ') });
      }

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(request.email)) {
        return createJsonResponse({ success: false, error: 'A valid email address is required.' });
      }

      const approvalRecipient = getApprovalRecipient();
      if (!approvalRecipient) {
        return createJsonResponse({ success: false, error: 'Approval email is not configured for this deployment.' });
      }

      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const requestSheet = getOrCreateAccessRequestsSheet(ss);
      const requestId = Utilities.getUuid();
      const submittedAt = new Date();

      requestSheet.appendRow([
        submittedAt,
        requestId,
        'Pending Review',
        ...ACCESS_REQUEST_FIELDS.map(field => formatAccessRequestValueForSheet(request[field.key], field.key)),
        request.source_url || '',
        request.submitted_at || ''
      ]);

      const emailOptions = {
        to: approvalRecipient,
        replyTo: request.email,
        subject: buildAccessRequestSubject(request),
        htmlBody: buildAccessRequestEmail(request, requestId, submittedAt),
        name: 'DRB Network Database'
      };
      if (attachments.length > 0) {
        emailOptions.attachments = attachments.map(createAccessRequestBlob);
      }

      MailApp.sendEmail(emailOptions);

      return createJsonResponse({ success: true, message: 'Request sent for approval.' });
    }

    if (action === 'update_profile') {
      const email = body.email ? String(body.email).toLowerCase().trim() : '';
      const updates = body.updates || {};

      if (!email || Object.keys(updates).length === 0) {
        return createJsonResponse({ success: false, error: 'Missing email or updates.' });
      }

      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

      // Try to find and update in each sheet
      const sheetsToSearch = [
        { name: NEW_SHEET_NAME, sheet: ss.getSheetByName(NEW_SHEET_NAME) },
        { name: OLD_SHEET_NAME, sheet: ss.getSheetByName(OLD_SHEET_NAME) }
      ];

      for (const sheetInfo of sheetsToSearch) {
        if (!sheetInfo.sheet) continue;
        const data = sheetInfo.sheet.getDataRange().getValues();
        if (data.length < 2) continue;

        const headers = data[0];
        const emailIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes('email'));
        if (emailIdx === -1) continue;

        for (let i = 1; i < data.length; i++) {
          const rowEmail = String(data[i][emailIdx]).toLowerCase().trim();
          if (rowEmail === email || rowEmail.includes(email)) {
            // Found the user — apply updates
            for (const [headerMatch, newValue] of Object.entries(updates)) {
              const colIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes(headerMatch.toLowerCase()));
              if (colIdx !== -1) {
                sheetInfo.sheet.getRange(i + 1, colIdx + 1).setValue(newValue);
              }
            }

            // Return fresh CSV data for both sheets
            const dataOld = ss.getSheetByName(OLD_SHEET_NAME).getDataRange().getValues();
            const dataNew = ss.getSheetByName(NEW_SHEET_NAME).getDataRange().getValues();

            return createJsonResponse({
              success: true,
              message: 'Profile updated successfully.',
              csvOld: convertToCsv(dataOld),
              csvNew: convertToCsv(dataNew)
            });
          }
        }
      }

      return createJsonResponse({ success: false, error: 'Could not find your profile to update.' });
    }

    return createJsonResponse({ success: false, error: 'Invalid action.' });
  } catch (error) {
    return createJsonResponse({ success: false, error: 'Server error: ' + error.toString() });
  }
}

function cleanupExpiredOTPs(otpSheet) {
  try {
    const data = otpSheet.getDataRange().getValues();
    const nowTime = new Date().getTime();
    for (let i = data.length - 1; i > 0; i--) {
      const expiresAt = Number(data[i][2]);
      if (nowTime > expiresAt) {
        otpSheet.deleteRow(i + 1);
      }
    }
  } catch(e) {}
}

function convertToCsv(data) {
  return data.map(row =>
    row.map(cell => {
      let str = String(cell);
      return (str.includes(',') || str.includes('\n') || str.includes('"')) ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  ).join('\n');
}

function normalizeAccessRequest(request) {
  const normalized = {
    source_url: normalizeAccessRequestValue(request.source_url),
    submitted_at: normalizeAccessRequestValue(request.submitted_at),
    current_photo_filename: normalizeAccessRequestValue(request.current_photo_filename),
    drb_photo_filename: normalizeAccessRequestValue(request.drb_photo_filename)
  };

  ACCESS_REQUEST_FIELDS.forEach(field => {
    if (field.key.startsWith('share_')) {
      normalized[field.key] = normalizeAccessRequestBoolean(request[field.key]);
    } else {
      normalized[field.key] = normalizeAccessRequestValue(request[field.key]);
    }
  });

  normalized.email = normalized.email.toLowerCase();
  return normalized;
}

function normalizeAccessAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];

  const maxAttachmentCount = 2;
  return rawAttachments
    .slice(0, maxAttachmentCount)
    .map(attachment => ({
      role: normalizeAccessRequestValue(attachment.role),
      name: normalizeAccessRequestValue(attachment.name),
      mimeType: normalizeAccessRequestValue(attachment.mimeType) || 'image/jpeg',
      data: normalizeAccessRequestValue(attachment.data).replace(/^data:[^;]+;base64,/, '')
    }))
    .filter(attachment => attachment.name && attachment.data);
}

function normalizeAccessRequestValue(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeAccessRequestBoolean(value) {
  return value === true || value === 'true' || value === 'yes' || value === 'on';
}

function formatAccessRequestValueForSheet(value, fieldKey) {
  if (fieldKey.startsWith('share_')) {
    return value ? 'Yes' : 'No';
  }
  return value || '';
}

function createAccessRequestBlob(attachment) {
  const bytes = Utilities.base64Decode(attachment.data);
  return Utilities.newBlob(bytes, attachment.mimeType || 'image/jpeg', attachment.name || 'photo.jpg');
}

function supabaseJsonRequest_(supabaseUrl, supabaseKey, method, path, payload, options) {
  const requestOptions = options || {};
  const headers = Object.assign({
    'apikey': supabaseKey,
    'Authorization': 'Bearer ' + supabaseKey
  }, requestOptions.headers || {});
  const fetchOptions = {
    method: method,
    muteHttpExceptions: true,
    headers: headers
  };

  if (payload !== undefined && payload !== null) {
    fetchOptions.contentType = 'application/json';
    fetchOptions.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(supabaseUrl + path, fetchOptions);
  const text = response.getContentText();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {}

  return {
    status: response.getResponseCode(),
    text: text,
    json: json
  };
}

function splitSheetLines_(value) {
  return String(value || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseSheetBoolean_(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) return null;
  if (['true', 't', '1', 'yes', 'y'].indexOf(normalizedValue) !== -1) return true;
  if (['false', 'f', '0', 'no', 'n'].indexOf(normalizedValue) !== -1) return false;
  return null;
}

function syncApprovedRequestSupplementalFields_(supabaseUrl, supabaseKey, alumnusId, rowData, headers) {
  const payload = {
    greek_affiliation: String(rowData[headers.indexOf('Greek Affiliation')] || '').trim(),
    share_email: parseSheetBoolean_(rowData[headers.indexOf('Share Email With Alumni')]),
    share_phone: parseSheetBoolean_(rowData[headers.indexOf('Share Phone With Alumni')]),
    share_social: parseSheetBoolean_(rowData[headers.indexOf('Share Social Links With Alumni')])
  };

  const updateRes = supabaseJsonRequest_(
    supabaseUrl,
    supabaseKey,
    'PATCH',
    '/rest/v1/alumni?id=eq.' + encodeURIComponent(alumnusId),
    payload,
    { headers: { Prefer: 'return=minimal' } }
  );

  if (updateRes.status >= 400) {
    const responseText = String(updateRes.text || '');
    const missingColumn = responseText.indexOf('Could not find the') !== -1 || responseText.indexOf('column') !== -1;
    if (missingColumn) {
      console.warn('Skipping supplemental alumni field sync because the alumni table is missing one or more optional columns.');
      return;
    }
    throw new Error('Failed to save supplemental alumni fields: ' + responseText);
  }
}

function syncApprovedRequestRelatedRecords_(supabaseUrl, supabaseKey, alumnusId, rowData, headers) {
  const existingEducationRes = supabaseJsonRequest_(
    supabaseUrl,
    supabaseKey,
    'GET',
    '/rest/v1/alumni_education?select=id&alumnus_id=eq.' + encodeURIComponent(alumnusId)
  );
  if (existingEducationRes.status >= 400) throw new Error('Failed to load existing education records: ' + existingEducationRes.text);

  const educationIds = Array.isArray(existingEducationRes.json) ? existingEducationRes.json.map(record => record.id).filter(Boolean) : [];
  if (educationIds.length > 0) {
    const deleteMajorsRes = supabaseJsonRequest_(
      supabaseUrl,
      supabaseKey,
      'DELETE',
      '/rest/v1/education_majors?education_id=in.(' + educationIds.map(id => encodeURIComponent(id)).join(',') + ')'
    );
    if (deleteMajorsRes.status >= 400) throw new Error('Failed to clear existing majors: ' + deleteMajorsRes.text);
  }

  const deleteEducationRes = supabaseJsonRequest_(
    supabaseUrl,
    supabaseKey,
    'DELETE',
    '/rest/v1/alumni_education?alumnus_id=eq.' + encodeURIComponent(alumnusId)
  );
  if (deleteEducationRes.status >= 400) throw new Error('Failed to clear existing education: ' + deleteEducationRes.text);

  const deleteLinksRes = supabaseJsonRequest_(
    supabaseUrl,
    supabaseKey,
    'DELETE',
    '/rest/v1/alumni_links?alumnus_id=eq.' + encodeURIComponent(alumnusId)
  );
  if (deleteLinksRes.status >= 400) throw new Error('Failed to clear existing links: ' + deleteLinksRes.text);

  const deleteAwardsRes = supabaseJsonRequest_(
    supabaseUrl,
    supabaseKey,
    'DELETE',
    '/rest/v1/alumni_awards?alumnus_id=eq.' + encodeURIComponent(alumnusId)
  );
  if (deleteAwardsRes.status >= 400) throw new Error('Failed to clear existing awards: ' + deleteAwardsRes.text);

  const deleteLeadershipRes = supabaseJsonRequest_(
    supabaseUrl,
    supabaseKey,
    'DELETE',
    '/rest/v1/alumni_leadership?alumnus_id=eq.' + encodeURIComponent(alumnusId)
  );
  if (deleteLeadershipRes.status >= 400) throw new Error('Failed to clear existing leadership: ' + deleteLeadershipRes.text);

  const universities = splitSheetLines_(rowData[headers.indexOf('University')]);
  const majors = splitSheetLines_(rowData[headers.indexOf('Major(s)')]);
  const degrees = splitSheetLines_(rowData[headers.indexOf('Degree(s)')]);
  const gradYears = splitSheetLines_(rowData[headers.indexOf('Education Graduation Year(s)')]);

  for (var i = 0; i < universities.length; i++) {
    const educationPayload = {
      alumnus_id: alumnusId,
      university: universities[i] || '',
      degree: degrees[i] || '',
      grad_year: gradYears[i] ? parseInt(gradYears[i], 10) || null : null
    };
    const educationInsertRes = supabaseJsonRequest_(
      supabaseUrl,
      supabaseKey,
      'POST',
      '/rest/v1/alumni_education',
      educationPayload,
      { headers: { Prefer: 'return=representation' } }
    );
    if (educationInsertRes.status >= 400) throw new Error('Failed to save education: ' + educationInsertRes.text);

    const insertedEducation = Array.isArray(educationInsertRes.json) ? educationInsertRes.json[0] : educationInsertRes.json;
    const majorValues = String(majors[i] || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    if (insertedEducation && insertedEducation.id && majorValues.length > 0) {
      const majorInsertRes = supabaseJsonRequest_(
        supabaseUrl,
        supabaseKey,
        'POST',
        '/rest/v1/education_majors',
        majorValues.map(major => ({ education_id: insertedEducation.id, major_name: major }))
      );
      if (majorInsertRes.status >= 400) throw new Error('Failed to save majors: ' + majorInsertRes.text);
    }
  }

  const awards = splitSheetLines_(rowData[headers.indexOf('DRB Awards')]);
  if (awards.length > 0) {
    const awardsInsertRes = supabaseJsonRequest_(
      supabaseUrl,
      supabaseKey,
      'POST',
      '/rest/v1/alumni_awards',
      awards.map(award => ({ alumnus_id: alumnusId, award_name: award }))
    );
    if (awardsInsertRes.status >= 400) throw new Error('Failed to save awards: ' + awardsInsertRes.text);
  }

  const leadership = splitSheetLines_(rowData[headers.indexOf('Leadership Positions Held')]);
  if (leadership.length > 0) {
    const leadershipInsertRes = supabaseJsonRequest_(
      supabaseUrl,
      supabaseKey,
      'POST',
      '/rest/v1/alumni_leadership',
      leadership.map(position => ({ alumnus_id: alumnusId, position_name: position }))
    );
    if (leadershipInsertRes.status >= 400) throw new Error('Failed to save leadership: ' + leadershipInsertRes.text);
  }

  const linkInserts = [];
  const instagram = String(rowData[headers.indexOf('Instagram')] || '').trim();
  if (instagram) {
    const handle = instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
    linkInserts.push({
      alumnus_id: alumnusId,
      type: 'Instagram',
      url: 'https://instagram.com/' + handle,
      display_text: 'Instagram',
      is_social: true
    });
  }

  const socialMediaRaw = String(rowData[headers.indexOf('Other Social Media')] || '').trim();
  if (socialMediaRaw) {
    socialMediaRaw.split('|').map(item => item.trim()).filter(Boolean).forEach(item => {
      const separatorIndex = item.indexOf(':');
      const label = separatorIndex >= 0 ? item.slice(0, separatorIndex).trim() : 'Social';
      const url = separatorIndex >= 0 ? item.slice(separatorIndex + 1).trim() : item;
      if (!url) return;
      const typeLower = label.toLowerCase();
      linkInserts.push({
        alumnus_id: alumnusId,
        type: label,
        url: url,
        display_text: label,
        is_social: !(typeLower === 'website' || typeLower === 'portfolio' || typeLower === 'company' || typeLower === 'blog' || typeLower === 'other')
      });
    });
  }

  const websitesRaw = String(rowData[headers.indexOf('Website(s)')] || '').trim();
  if (websitesRaw) {
    websitesRaw.split('|').map(item => item.trim()).filter(Boolean).forEach(url => {
      linkInserts.push({
        alumnus_id: alumnusId,
        type: 'Website',
        url: url,
        display_text: 'Website',
        is_social: false
      });
    });
  }

  if (linkInserts.length > 0) {
    const linksInsertRes = supabaseJsonRequest_(supabaseUrl, supabaseKey, 'POST', '/rest/v1/alumni_links', linkInserts);
    if (linksInsertRes.status >= 400) throw new Error('Failed to save links: ' + linksInsertRes.text);
  }
}

function getApprovalRecipient() {
  const configuredRecipient = PropertiesService.getScriptProperties().getProperty('APPROVAL_EMAIL');
  if (configuredRecipient) return configuredRecipient;

  const effectiveUserEmail = Session.getEffectiveUser().getEmail();
  return effectiveUserEmail || '';
}

function getOrCreateAccessRequestsSheet(ss) {
  let sheet = ss.getSheetByName(ACCESS_REQUESTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ACCESS_REQUESTS_SHEET_NAME);
    sheet.appendRow([
      'Submitted At',
      'Request ID',
      'Status',
      ...ACCESS_REQUEST_FIELDS.map(field => field.label),
      'Source URL',
      'Client Submitted At'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function buildAccessRequestSubject(request) {
  const classYear = request.grad_year ? 'Class of ' + request.grad_year : 'Class year missing';
  return `New DRB Alumni Account Request: ${request.first_name} ${request.last_name} (${classYear})`;
}

function buildAccessRequestEmail(request, requestId, submittedAt) {
  const detailsHtml = ACCESS_REQUEST_FIELDS
    .map(field => {
      const value = request[field.key];
      if (field.key.startsWith('share_')) {
        return `<tr><td style="padding:10px 12px; border:1px solid #d0d7de; background:#f8fafc; font-weight:600;">${escapeHtml(field.label)}</td><td style="padding:10px 12px; border:1px solid #d0d7de;">${value ? 'Yes' : 'No'}</td></tr>`;
      }
      if (!value) return '';
      return `<tr><td style="padding:10px 12px; border:1px solid #d0d7de; background:#f8fafc; font-weight:600; width:220px;">${escapeHtml(field.label)}</td><td style="padding:10px 12px; border:1px solid #d0d7de;">${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif; max-width:720px; margin:auto; color:#1f2937;">
      <div style="background:#0f172a; color:#ffffff; padding:24px 28px; border-radius:16px 16px 0 0;">
        <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; opacity:0.75;">DRB Network Database</div>
        <h1 style="margin:8px 0 0; font-size:24px;">New Alumni Account Request</h1>
      </div>
      <div style="border:1px solid #d0d7de; border-top:none; border-radius:0 0 16px 16px; padding:24px 28px; background:#ffffff;">
        <p style="margin-top:0; font-size:15px; line-height:1.6;">
          ${escapeHtml(request.first_name)} ${escapeHtml(request.last_name)} submitted a request for directory access.
          Reply directly to this email to contact the requester at <strong>${escapeHtml(request.email)}</strong>.
        </p>
        <p style="font-size:13px; color:#475569; line-height:1.6;">
          Request ID: <strong>${escapeHtml(requestId)}</strong><br>
          Submitted: <strong>${escapeHtml(submittedAt.toISOString())}</strong>
        </p>
        <table style="width:100%; border-collapse:collapse; margin-top:20px;">
          ${detailsHtml}
          ${request.source_url ? `<tr><td style="padding:10px 12px; border:1px solid #d0d7de; background:#f8fafc; font-weight:600;">Source URL</td><td style="padding:10px 12px; border:1px solid #d0d7de;">${escapeHtml(request.source_url)}</td></tr>` : ''}
        </table>
        <div style="margin-top: 30px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 25px;">
          <p style="font-size: 14px; color: #334155; margin-bottom: 15px;">If you see a typo, edit the entry in the Google Sheet first.<br>Otherwise, click below to instantly push this user to Supabase.</p>
          <a href="${ScriptApp.getService().getUrl()}?action=approve_request&requestId=${requestId}" style="background-color: #10b981; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; letter-spacing: 0.5px; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);">Approve & Add to Database</a>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
