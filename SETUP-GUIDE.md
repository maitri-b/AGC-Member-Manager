# Agents Club Member Manager - Setup Guide

## Project Structure

```
agentsclub-member-manager/
├── src/
│   ├── app/
│   │   ├── api/auth/[...nextauth]/   # NextAuth API routes
│   │   ├── dashboard/                 # Dashboard page
│   │   ├── login/                     # Login page
│   │   ├── members/                   # Members list & detail
│   │   ├── profile/                   # User profile
│   │   ├── admin/                     # Admin panel
│   │   ├── unauthorized/              # Unauthorized page
│   │   ├── layout.tsx                 # Root layout
│   │   ├── page.tsx                   # Home (redirects to login)
│   │   └── globals.css                # Global styles
│   ├── components/
│   │   ├── LineLoginButton.tsx        # LINE login button
│   │   ├── Navbar.tsx                 # Navigation bar
│   │   └── ProtectedRoute.tsx         # Route protection HOC
│   ├── lib/
│   │   ├── firebase.ts                # Firebase client config
│   │   ├── firebase-admin.ts          # Firebase admin config
│   │   ├── auth-options.ts            # NextAuth configuration
│   │   ├── auth-provider.tsx          # Session provider
│   │   ├── google-sheets.ts           # Google Sheets service
│   │   └── permissions.ts             # Permission utilities
│   ├── types/
│   │   ├── member.ts                  # Member type definitions
│   │   └── next-auth.d.ts             # NextAuth type extensions
│   └── middleware.ts                  # Auth middleware
├── .env.example                       # Environment variables template
└── .env.local                         # Your local environment (DO NOT COMMIT)
```

---

## Step 1: LINE Login Setup

### 1.1 Create LINE Login Channel

1. ไปที่ [LINE Developers Console](https://developers.line.biz/console/)
2. Login ด้วย LINE Account
3. สร้าง Provider ใหม่ หรือเลือก Provider ที่มีอยู่
4. Click **Create a new channel** → เลือก **LINE Login**
5. กรอกข้อมูล:
   - Channel name: `Agents Club Member`
   - Channel description: `ระบบจัดการสมาชิก Agents Club`
   - App types: เลือก **Web app**
   - Email: ใส่อีเมลติดต่อ

### 1.2 Configure LINE Login

1. ไปที่ **LINE Login** tab
2. ตั้งค่า **Callback URL**:
   - Development: `http://localhost:3000/api/auth/callback/line`
   - Production: `https://your-domain.com/api/auth/callback/line`

### 1.3 Get Credentials

ไปที่ **Basic settings** tab และ copy:
- **Channel ID** → ใส่ใน `LINE_CHANNEL_ID`
- **Channel secret** → ใส่ใน `LINE_CHANNEL_SECRET`

---

## Step 2: Firebase Setup

### 2.1 Create Firebase Project

1. ไปที่ [Firebase Console](https://console.firebase.google.com/)
2. Click **Create a project**
3. ตั้งชื่อโปรเจกต์: `agentsclub-member-manager`
4. เลือก region และสร้างโปรเจกต์

### 2.2 Enable Firestore

1. ไปที่ **Build** → **Firestore Database**
2. Click **Create database**
3. เลือก **Start in production mode**
4. เลือก region ใกล้สุด (asia-southeast1 สำหรับไทย)

### 2.3 Get Firebase Config (Client)

1. ไปที่ **Project Settings** (gear icon)
2. Scroll ลงไปที่ **Your apps** → Click **</>** (Web)
3. Register app ชื่อ `agentsclub-member-web`
4. Copy config ใส่ใน `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=agentsclub-member-manager.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=agentsclub-member-manager
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=agentsclub-member-manager.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 2.4 Get Firebase Admin Credentials

1. ไปที่ **Project Settings** → **Service accounts**
2. Click **Generate new private key**
3. Download JSON file
4. Copy ค่าใส่ `.env.local`:

```env
FIREBASE_ADMIN_PROJECT_ID=agentsclub-member-manager
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@agentsclub-member-manager.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 2.5 Set Firestore Security Rules

ไปที่ **Firestore Database** → **Rules** และใส่:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      // Users can read their own data
      allow read: if request.auth != null && request.auth.uid == userId;
      // Only admins can write
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Roles collection - read only for authenticated users
    match /roles/{roleId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

---

## Step 3: Google Sheets API Setup

### 3.1 Enable Google Sheets API

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. เลือกหรือสร้างโปรเจกต์ (ใช้โปรเจกต์เดียวกับ Firebase ได้)
3. ไปที่ **APIs & Services** → **Library**
4. ค้นหา **Google Sheets API** แล้ว **Enable**

### 3.2 Create Service Account

1. ไปที่ **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service account**
3. ตั้งชื่อ: `agentsclub-sheets-service`
4. Click **Create and Continue**
5. ข้าม Role (optional) แล้ว Click **Done**

### 3.3 Get Service Account Key

1. Click ที่ Service account ที่สร้าง
2. ไปที่ **Keys** tab
3. Click **Add Key** → **Create new key** → **JSON**
4. Download และ copy ค่าใส่ `.env.local`:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=agentsclub-sheets-service@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3.4 Share Google Sheet

**สำคัญมาก!** ต้อง share Google Sheet ให้ Service Account:

1. เปิด Google Sheet: https://docs.google.com/spreadsheets/d/1-vnRuKbadb-AQ_sMscihkKpc68wDtt9ZK5KFRZ6ekXo
2. Click **Share** button
3. ใส่ email ของ Service Account (เช่น `agentsclub-sheets-service@your-project.iam.gserviceaccount.com`)
4. ให้สิทธิ์ **Editor**
5. Click **Share**

---

## Step 4: Configure Environment

### 4.1 Edit .env.local

เปิดไฟล์ `.env.local` และใส่ค่าทั้งหมด:

```env
# LINE Login
LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_channel_secret

# LINE Messaging API (Optional)
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=your_access_token

# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk@your_project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google Sheets
GOOGLE_SHEET_ID=1-vnRuKbadb-AQ_sMscihkKpc68wDtt9ZK5KFRZ6ekXo
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@your_project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# NextAuth - Generate: openssl rand -base64 32
NEXTAUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000

# App
NEXT_PUBLIC_APP_NAME=Agents Club Member Manager
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4.2 Generate NextAuth Secret

รัน command นี้เพื่อสร้าง secret:

```bash
openssl rand -base64 32
```

หรือใช้เว็บ: https://generate-secret.vercel.app/32

---

## Step 5: Google Sheet Structure

Sheet ชื่อ **Check_Member_List2023** มีโครงสร้างดังนี้:

| Column | Description |
|--------|-------------|
| MemberID | รหัสสมาชิก |
| บริษัท (ภาษาอังกฤษ) | ชื่อบริษัท EN |
| ชื่อ-นามสกุล (ภาษาไทย) | ชื่อ-นามสกุล TH |
| ขื่อเล่น | ชื่อเล่น |
| ไอดี ไลน์ | LINE ID |
| ชื่อไลน์ | LINE Display Name |
| เบอร์โทร | เบอร์โทรศัพท์ |
| เบอร์มือถือ | เบอร์มือถือ |
| ใบอนุญาตนำเที่ยวเลขที่ | หมายเลขใบอนุญาต |
| เว็บไซต์ | Website |
| อีเมล | Email |
| วันหมดอายุ | วันหมดอายุใบอนุญาต |
| ตำแหน่งในบริษัท | ตำแหน่งในบริษัท |
| ตำแหน่ง | ตำแหน่งในสมาคม |
| ชื่อบริษัทตามที่จดทะเบียน | ชื่อบริษัทเต็ม |
| สถานะ | สถานะสมาชิก |
| สถานะไลน์กลุ่ม | สถานะในกลุ่ม LINE |
| LINE_UserID | LINE User ID (สำหรับ login) |
| LastUpdated | วันที่อัพเดทล่าสุด |
| UpdatedBy | ผู้อัพเดท |
| lineDisplayName | ชื่อแสดง LINE |

---

## Step 6: Setup First Admin User

หลังจาก deploy และ login ครั้งแรก จะเป็น "guest" โดยอัตโนมัติ

### Manual Admin Setup

1. ไปที่ Firebase Console → Firestore
2. ไปที่ collection `users`
3. หา document ของคุณ (ID คือ LINE User ID)
4. แก้ไข field `role` จาก `guest` เป็น `admin`
5. แก้ไข field `permissions` เป็น:
```json
["member:read", "member:write", "member:delete", "member:create", "report:view", "report:export", "admin:access", "admin:users", "admin:roles", "admin:settings"]
```

---

## Step 7: Run the Application

### Development

```bash
cd agentsclub-member-manager
npm install
npm run dev
```

เปิด http://localhost:3000

### Production Build

```bash
npm run build
npm start
```

---

## Step 8: Deploy to Vercel

### 8.1 Push to GitHub

```bash
git add .
git commit -m "Initial Agents Club Member Manager setup"
git push origin main
```

### 8.2 Deploy on Vercel

1. ไปที่ [Vercel](https://vercel.com)
2. Import repository จาก GitHub
3. ไปที่ **Settings** → **Environment Variables**
4. เพิ่ม environment variables ทั้งหมดจาก `.env.local`
5. Deploy!

### 8.3 Update LINE Callback URL

หลัง deploy แล้ว ต้องเพิ่ม production callback URL ที่ LINE Developers:
- `https://your-app.vercel.app/api/auth/callback/line`

---

## Role & Permission Reference

| Role | Thai Name | Permissions |
|------|-----------|-------------|
| admin | ผู้ดูแลระบบ | ทุกอย่าง |
| committee | กรรมการ | ดู/แก้ไขสมาชิก, ดูรายงาน |
| member | สมาชิก | ดูข้อมูลตัวเอง |
| guest | ผู้เยี่ยมชม | รอการอนุมัติ |

---

## Troubleshooting

### "Unable to fetch user data"
- ตรวจสอบ Firebase credentials
- ตรวจสอบ Firestore rules

### "Google Sheets API error"
- ตรวจสอบว่า share sheet ให้ service account แล้ว
- ตรวจสอบ API key และ credentials

### "LINE Login failed"
- ตรวจสอบ Channel ID และ Secret
- ตรวจสอบ Callback URL ตรงกับที่ตั้งค่า

---

## Contact

หากมีปัญหาในการ setup ติดต่อ:
- Agents Club Administrator
