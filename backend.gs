// --- DRB Network Database - Secure OTP Backend ---
// Deploy this script as a Web App (Execute as: Me, Access: Anyone)

const SPREADSHEET_ID = '1oXzXtw4lPY_jV4D9BA65aipjm9yf44mw4Qyx8tufZrE';
const OLD_SHEET_NAME = 'Form responses';
const NEW_SHEET_NAME = 'Form Responses new';
const OTP_SHEET_NAME = 'OTP_Log';

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