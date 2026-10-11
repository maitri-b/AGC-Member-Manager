# LINE Group Integration - Group ID Management

## ภาพรวม (Overview)

ระบบสามารถบันทึก LINE Group ID อัตโนมัติเมื่อ LINE Official Account เข้าร่วมกลุ่ม หรือเมื่อมีข้อความในกลุ่ม เพื่อใช้ในการส่งการแจ้งเตือนอัตโนมัติไปยังกลุ่มต่างๆ

## วิธีการทำงาน (How It Works)

### 1. LINE Webhook Endpoint
เมื่อมี event เกิดขึ้นจาก LINE Platform (เช่น bot เข้ากลุ่ม, มีข้อความในกลุ่ม) LINE จะส่ง webhook มาที่ระบบ

**Endpoint**: `/api/line/webhook`

**รองรับ Events**:
- `join` - Bot เข้าร่วมกลุ่ม
- `message` - มีข้อความในกลุ่ม (อัพเดท lastActivity)
- `follow` - User เพิ่ม bot เป็นเพื่อน
- `leave` - Bot ถูกเอาออกจากกลุ่ม

### 2. การบันทึก Group ID

#### Event: Join (Bot เข้าร่วมกลุ่ม)
```typescript
await adminDb().collection('lineGroups').doc(groupId).set({
  groupId: groupId,
  joinedAt: new Date(),
  source: 'webhook_join',
  eventType: 'join',
  lastActivity: new Date()
});
```

#### Event: Message (มีข้อความในกลุ่ม)
```typescript
await adminDb().collection('lineGroups').doc(groupId).set({
  groupId: groupId,
  lastActivity: new Date(),
  lastMessageAt: new Date()
}, { merge: true });
```

#### Event: Leave (Bot ออกจากกลุ่ม)
```typescript
await adminDb().collection('lineGroups').doc(groupId).update({
  leftAt: new Date(),
  active: false
});
```

### 3. Webhook Signature Verification
ระบบตรวจสอบ signature จาก LINE เพื่อความปลอดภัย:

```typescript
function verifySignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}
```

## API Endpoints

### GET `/api/line/groups`
ดึงรายการ LINE Groups ทั้งหมดที่ระบบบันทึกไว้

**Authorization**: Admin only

**Response**:
```json
{
  "groups": [
    {
      "id": "C1234567890abcdef1234567890abcdef",
      "groupId": "C1234567890abcdef1234567890abcdef",
      "groupName": "Agents Club Main Group",
      "joinedAt": "2024-01-15T10:30:00.000Z",
      "lastActivity": "2024-01-20T14:45:00.000Z",
      "leftAt": null,
      "active": true,
      "source": "webhook_join"
    }
  ]
}
```

**ฟิลด์ข้อมูล**:
- `groupId` - LINE Group ID (ใช้ในการส่งข้อความ)
- `groupName` - ชื่อกลุ่มที่ตั้งเอง (optional)
- `joinedAt` - วันที่ bot เข้าร่วมกลุ่ม
- `lastActivity` - กิจกรรมล่าสุดในกลุ่ม
- `leftAt` - วันที่ bot ออกจากกลุ่ม (null = ยังอยู่)
- `active` - สถานะกลุ่ม (false = bot ถูกเอาออกแล้ว)
- `source` - แหล่งที่มาของข้อมูล (webhook_join, webhook_message)

### POST `/api/line/webhook`
Webhook endpoint สำหรับรับ events จาก LINE Platform

**Headers Required**:
- `x-line-signature` - LINE webhook signature

**Body**: LINE webhook event payload

## Firestore Collections

### `lineGroups`
เก็บข้อมูล LINE Groups

**Document ID**: Group ID จาก LINE (ขึ้นต้นด้วย 'C')

**Fields**:
```typescript
{
  groupId: string;           // LINE Group ID
  groupName?: string;        // ชื่อกลุ่มที่ตั้งเอง
  joinedAt: Timestamp;       // วันที่เข้าร่วม
  lastActivity: Timestamp;   // กิจกรรมล่าสุด
  lastMessageAt?: Timestamp; // ข้อความล่าสุด
  leftAt?: Timestamp;        // วันที่ออกจากกลุ่ม
  active?: boolean;          // สถานะ (default: true)
  source: string;            // webhook_join, webhook_message
  eventType?: string;        // join, message, leave
}
```

### `lineFollowers`
เก็บข้อมูล Users ที่เพิ่ม bot เป็นเพื่อน

**Document ID**: User ID จาก LINE (ขึ้นต้นด้วย 'U')

**Fields**:
```typescript
{
  userId: string;
  followedAt: Timestamp;
  source: string; // webhook_follow
}
```

## การตั้งค่า LINE Developers Console

### 1. Webhook URL
ตั้งค่า Webhook URL ใน LINE Developers Console:

```
https://your-domain.com/api/line/webhook
```

### 2. Webhook Events
เปิดใช้งาน events ที่ต้องการ:
- ✅ Join event
- ✅ Message event
- ✅ Follow event
- ✅ Leave event

### 3. Environment Variables
ตั้งค่าใน `.env.local`:

**สำคัญ**: ถ้าคุณมี LINE Login และ LINE Messaging API แยกเป็น 2 Channels

#### ตัวแปรที่ต้องมี:
```bash
# LINE Messaging API - Channel Secret (สำหรับ verify webhook signature)
LINE_MESSAGING_CHANNEL_SECRET=your_messaging_channel_secret

# LINE Messaging API - Access Token (สำหรับส่งข้อความ)
LINE_CHANNEL_ACCESS_TOKEN=your_messaging_access_token

# LINE Login - Channel ID & Secret (สำหรับ login)
LINE_CHANNEL_ID=your_login_channel_id
LINE_CHANNEL_SECRET=your_login_channel_secret
```

**หมายเหตุ**:
- `LINE_MESSAGING_CHANNEL_SECRET` ใช้สำหรับ verify webhook signature (ต้องเป็นของ Messaging API Channel)
- `LINE_CHANNEL_SECRET` ใช้สำหรับ LINE Login (อาจเป็นค่าคนละอันกับ Messaging)
- `LINE_CHANNEL_ACCESS_TOKEN` ใช้สำหรับส่งข้อความ (Messaging API)

## วิธีหา Group ID

### ขั้นตอนที่ 1: เชิญ Bot เข้ากลุ่ม
1. เปิด LINE Group ที่ต้องการ
2. กดที่เมนู → "เชิญ"
3. เลือก LINE Official Account ของคุณ
4. เชิญเข้ากลุ่ม

### ขั้นตอนที่ 2: ส่งข้อความทดสอบ
1. ส่งข้อความอะไรก็ได้ในกลุ่ม (เช่น "สวัสดี")
2. ระบบจะบันทึก Group ID อัตโนมัติ

### ขั้นตอนที่ 3: ดู Group ID
1. เข้าสู่ระบบด้วยบัญชี Admin
2. ไปที่ Settings → LINE Groups
3. คัดลอก Group ID ที่ต้องการใช้งาน

## การใช้งาน Group ID

### ส่งข้อความไปยังกลุ่ม
```typescript
const LINE_API = 'https://api.line.me/v2/bot/message/push';

const response = await fetch(LINE_API, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
  },
  body: JSON.stringify({
    to: groupId, // Group ID จากระบบ
    messages: [
      {
        type: 'text',
        text: 'ข้อความที่ต้องการส่ง'
      }
    ]
  })
});
```

### ตัวอย่างการส่งการแจ้งเตือนการลงทะเบียน
```typescript
const groupId = 'C1234567890abcdef1234567890abcdef';

await sendLineNotification(groupId, {
  type: 'text',
  text: `🎉 มีสมาชิกลงทะเบียนใหม่!\n\n` +
        `กิจกรรม: ${eventName}\n` +
        `บริษัท: ${companyName}\n` +
        `จำนวน: ${attendeeCount} คน`
});
```

## UI Components

### Admin: LINE Groups Page
**Path**: `/admin/line-groups`

**Features**:
- แสดงรายการ LINE Groups ทั้งหมด
- Copy Group ID ได้
- แสดงสถานะ (Active/Left)
- แสดงวันที่เข้าร่วม และกิจกรรมล่าสุด
- Refresh button

### Settings: LINE Groups Section
**Path**: `/admin/settings` → LINE Groups tab

**Features**:
- แสดง Group ID พร้อมตั้งชื่อกลุ่มได้
- แก้ไขชื่อกลุ่ม
- ลบ Group ID
- เรียงตามวันที่กิจกรรมล่าสุด

## Troubleshooting

### ไม่เห็น Group ID ในระบบ
1. ตรวจสอบว่า Webhook URL ตั้งค่าถูกต้องใน LINE Developers Console
2. ตรวจสอบว่าเปิดใช้งาน Webhook events
3. ลองส่งข้อความในกลุ่มอีกครั้ง
4. ตรวจสอบ logs ที่ Vercel/Server

### Webhook Signature Invalid (401 Unauthorized)
1. ตรวจสอบว่าใช้ `LINE_MESSAGING_CHANNEL_SECRET` จาก **Messaging API Channel** (ไม่ใช่ LINE Login Channel)
2. ตรวจสอบว่า environment variable ตั้งค่าครบใน Vercel/Server
3. ถ้ามี 2 Channels แยกกัน (Login + Messaging) ต้องใช้ Secret ของ Messaging API Channel
4. Redeploy หลังจากเปลี่ยน environment variables
5. ทดสอบด้วย LINE Webhook Tester

### Bot ไม่ส่งข้อความได้
1. ตรวจสอบว่า Group ID ถูกต้อง (ขึ้นต้นด้วย 'C')
2. ตรวจสอบว่า Bot ยังอยู่ในกลุ่ม
3. ตรวจสอบว่า `LINE_CHANNEL_ACCESS_TOKEN` ถูกต้อง
4. ตรวจสอบ quota การส่งข้อความใน LINE Developers Console

## Security Considerations

### Webhook Signature Verification
- ✅ ตรวจสอบ signature ทุกครั้งที่มี webhook request
- ✅ ใช้ HMAC SHA256 ตาม LINE specification
- ✅ Return 401 Unauthorized หาก signature ไม่ถูกต้อง

### Access Control
- ✅ API endpoint `/api/line/groups` ต้อง login และมีสิทธิ์ admin
- ✅ เก็บ Channel Secret และ Access Token ใน environment variables
- ✅ ไม่ expose Group ID ต่อ public

## Related Files

### API Routes
- `/src/app/api/line/webhook/route.ts` - Webhook endpoint
- `/src/app/api/line/groups/route.ts` - Get groups API

### Admin Pages
- `/src/app/admin/line-groups/page.tsx` - LINE Groups management page
- `/src/app/admin/settings/page.tsx` - Settings page with LINE Groups section

### Libraries
- `/src/lib/firebase-admin.ts` - Firebase Admin SDK setup

## Future Enhancements

### Planned Features
- [ ] Rich Message templates สำหรับการแจ้งเตือน
- [ ] Schedule messages (ส่งข้อความตามเวลาที่กำหนด)
- [ ] Message history และ analytics
- [ ] Group member count tracking
- [ ] Broadcast message to multiple groups
- [ ] LINE Flex Message builder

### API Improvements
- [ ] Batch update group names
- [ ] Export group list to Excel
- [ ] Search/filter groups
- [ ] Group activity statistics
- [ ] Webhook event logs

---

**Last Updated**: January 2024
**Version**: 1.0
**Author**: Claude Code
