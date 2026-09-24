# Agent Club - Constitution (Development Rules)

## Overview
เอกสารนี้เป็นกฎหลักในการพัฒนาระบบ Agent Club Member Management System
ใช้ Google Apps Script (GAS) ผ่าน Clasp CLI

---

## Law 1: Date Serialization Rule
**ห้ามส่ง Date object โดยตรงจาก Backend ไป Frontend**

```javascript
// ❌ WRONG - จะทำให้เกิด error
return { date: new Date() };

// ✅ CORRECT - ใช้ cleanDataForWeb()
return cleanDataForWeb({ date: new Date() });
```

ฟังก์ชัน `cleanDataForWeb()` จะ:
- แปลง Date objects → ISO string
- แปลง undefined → null
- แปลง NaN/Infinity → 0
- ข้าม functions

---

## Law 2: IIFE Scope Isolation
**JavaScript ใน HTML ต้องห่อด้วย IIFE เสมอ**

```javascript
// ✅ CORRECT
(function() {
  'use strict';

  // All code here

  // Expose to global at the end
  window.functionName = functionName;
})();
```

เหตุผล: ป้องกัน variable collision และ global pollution

---

## Law 14: Single-Page Application Only
**GAS Web App ใช้ Index.html เป็นไฟล์หลักไฟล์เดียว**

ข้อจำกัดของ GAS:
- ❌ ไม่สามารถ redirect ไป URL อื่นได้
- ❌ ไม่สามารถส่ง URL parameters ได้
- ❌ ไม่สามารถมีหลาย page ได้

วิธีแก้:
- ใช้ SPA Architecture
- ซ่อน/แสดง section ด้วย JavaScript
- เก็บ session ใน sessionStorage

```html
<!-- ใน Index.html -->
<section id="loginSection" style="display:none;">...</section>
<section id="dashboardSection" style="display:none;">...</section>
```

```javascript
// JavaScript ควบคุมการแสดง section
function showLogin() {
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
}
```

---

## Law 20: Debug Info Visibility Rule
**เพิ่ม Logger.log() สำหรับ debug ใน Backend**

```javascript
function getMembers(token, filters) {
  Logger.log('=== getMembers START ===');
  Logger.log('Filters: ' + JSON.stringify(filters));
  // ... code ...
  Logger.log('Result count: ' + members.length);
}
```

ดู Log ได้ที่: Apps Script Editor > View > Logs

---

## Law 21: UI/UX Feedback Rule
**ต้องมี Loading indicator สำหรับทุก async operation**

```javascript
// ✅ CORRECT
showLoading('กำลังโหลดข้อมูล...');
google.script.run
  .withSuccessHandler(function(result) {
    hideLoading();
    // handle result
  })
  .withFailureHandler(function(error) {
    hideLoading();
    showToast('error', 'เกิดข้อผิดพลาด', error.message);
  })
  .serverFunction();
```

---

## Law 22: Token-Based Authentication
**ใช้ Token + CacheService สำหรับ session management**

```javascript
// Backend - สร้าง token
function generateToken(userId) {
  const token = Utilities.base64Encode(userId + '|' + timestamp + '|' + random);
  const cache = CacheService.getScriptCache();
  cache.put('token_' + token, JSON.stringify(data), TOKEN_EXPIRY_HOURS * 3600);
  return token;
}

// Frontend - เก็บ token ใน sessionStorage
sessionStorage.setItem('agentclub_token', token);
```

---

## Law 23: Safe String Conversion
**ใช้ safeString() สำหรับแปลงค่าจาก Sheet**

```javascript
function safeString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatThaiDate(value);
  return String(value);
}
```

---

## Law 24: Thai Date Format Support
**รองรับวันที่หลายรูปแบบ**

```javascript
function parseThaiDate(dateStr) {
  // รูปแบบที่รองรับ:
  // 1. "1 มกราคม 2568" (Thai format with Buddhist year)
  // 2. "2025-01-15" (ISO format)
  // 3. "15/01/2025" (DD/MM/YYYY)
  // 4. JavaScript Date string
}
```

---

## File Structure Rules

### ไฟล์หลัก
| File | Purpose |
|------|---------|
| `Index.html` | Main SPA file (Login + Dashboard) |
| `Code.js` | Backend GAS functions |
| `JavaScript.html` | Frontend JavaScript (IIFE wrapped) |
| `Styles.html` | CSS styles |
| `Modals.html` | Bootstrap modals |

### การ include ไฟล์
```html
<!-- ใน Index.html -->
<?!= include('Styles'); ?>
<?!= include('Modals'); ?>
<?!= include('JavaScript'); ?>
```

```javascript
// ใน Code.js
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

---

## Deployment Rules

### Push และ Deploy
```bash
# Push code ไปยัง GAS
clasp push

# Deploy version ใหม่
clasp deploy

# หรือ deploy ทับ version เดิม
clasp deploy --deploymentId <DEPLOYMENT_ID>
```

### ตรวจสอบ Deployment
```bash
clasp deployments
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Index.html  │ ←→ │ JavaScript  │ ←→ │ Modals.html │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         ↓                  ↓                                 │
│    sessionStorage    google.script.run                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Code.js   │ ←→ │ CacheService│ ←→ │SpreadsheetApp│    │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     GOOGLE SHEET                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │ Check_Member_List2023│    │       Users        │        │
│  └─────────────────────┘    └─────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling Pattern

```javascript
// Backend
function serverFunction(token, data) {
  try {
    if (!verifyToken(token)) {
      return { success: false, message: 'Token ไม่ถูกต้อง' };
    }
    // ... process ...
    return cleanDataForWeb({ success: true, data: result });
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// Frontend
google.script.run
  .withSuccessHandler(function(result) {
    if (result && result.success) {
      // handle success
    } else {
      showToast('error', 'เกิดข้อผิดพลาด', result.message);
    }
  })
  .withFailureHandler(function(error) {
    showToast('error', 'เกิดข้อผิดพลาด', error.message);
  })
  .serverFunction(token, data);
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-02 | Initial SPA implementation |
| 1.1 | 2025-02 | Added cleanDataForWeb (Law 1) |
| 1.2 | 2025-02 | Fixed filters, improved parseThaiDate |

---

*Last Updated: February 2025*
