# ติดตั้ง MongoDB + GitHub + Vercel

Repository เป้าหมาย: https://github.com/bmmorsaman/smart-do

## MongoDB Atlas

1. สร้าง cluster ที่รองรับ transaction สร้าง Database User สิทธิ์ readWrite เฉพาะฐานข้อมูล smart_materials
2. ตั้ง Network Access ให้เครื่องที่รัน db:init และ Vercel เข้าถึงได้ ใช้รายการ IP/เครือข่ายที่เหมาะกับการเผยแพร่จริง หากจำเป็นต้องอนุญาตทุก IP ให้ใช้บัญชีฐานข้อมูลเฉพาะแอปและรหัสผ่านที่เดายาก
3. Connect → Drivers → Node.js คัดลอก URI ใส่ .env.local ห้าม commit URI หรือรหัสผ่าน ใช้ URL encoding หากรหัสผ่านมีอักขระพิเศษ

```dotenv
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER/
MONGODB_DB=smart_materials
INITIAL_ADMIN_EMAIL=admin@example.org
INITIAL_ADMIN_PASSWORD=YOUR_NEW_PASSWORD
INITIAL_ADMIN_NAME=ผู้ดูแลระบบ
```

รัน `npm run db:init` ในเครื่องเพียงครั้งแรก สร้าง indexes และบัญชี Admin โดย hash รหัสผ่านแบบ scrypt จากนั้นนำ INITIAL_ADMIN_PASSWORD ออกจาก .env.local แล้วเริ่ม `npm run dev` ใหม่

Collections: users, sessions, login_attempts, requests, records, stock_movements, audit_log, material_settings, organization_settings, app_logos

เก็บ session token แบบ hash และกำหนดหมดอายุ 6 ชั่วโมง viewer อ่านอย่างเดียว ส่วน Admin จัดการบัญชี การรับ/จ่ายและ audit อยู่ใน transaction เดียวและใช้ request ID ป้องกันบันทึกซ้ำ ข้อมูลก่อนเปลี่ยนระบบยังไม่ได้ย้ายเข้า MongoDB

## GitHub

ก่อนส่งโค้ด ตรวจ .gitignore ซึ่งไม่ส่ง node_modules, dist, .env.local, .tmp และ .vercel อย่าใช้ force push ทับงานเดิม ให้ใช้สาขาใหม่สำหรับการเปลี่ยนฐานข้อมูล

หากโฟลเดอร์เครื่องยังไม่มี Git ให้ clone repository ไปโฟลเดอร์ใหม่ แล้วคัดลอกไฟล์โปรแกรมที่ต้องส่ง โดยไม่คัดลอกไฟล์ลับหรือ node_modules จากนั้นสร้างสาขาและ commit/push:

```sh
git switch -c migrate-mongodb-vercel
git add .
git commit -m "Use MongoDB API on Vercel"
git push -u origin migrate-mongodb-vercel
```

## Vercel

1. Add New → Project → Import Git Repository → bmmorsaman/smart-do เลือกสาขาที่มีโค้ดใหม่
2. Framework Vite; Build npm run build; Output dist; Node.js 22.x หรือใหม่กว่า
3. เพิ่ม Environment Variables ฝั่งเซิร์ฟเวอร์: MONGODB_URI และ MONGODB_DB ทั้ง Preview/Production ตามต้องการ ไม่ต้องใส่ INITIAL_ADMIN_PASSWORD บน Vercel
4. Deploy และล็อกอินด้วย Admin ที่สร้างใน Atlas

api/data.js จะรันเป็น Node.js Function แยกจากไฟล์หน้าเว็บ ไม่มีการส่ง MONGODB_URI ไปเบราว์เซอร์ vercel.json ตั้ง build และ output ไว้แล้ว

ทดสอบทะเบียน รับ 10 จ่าย 3 ยอด 7 ประวัติ มูลค่าคงเหลือ และรายงาน ทดสอบ viewer บันทึกไม่ได้ และ officer จัดการบัญชีไม่ได้ก่อนเริ่มใช้ข้อมูลจริง

หน้า รับวัสดุ/จ่ายวัสดุ: เลือกวัสดุแล้วเลื่อนลงส่วนรายการที่บันทึกแล้ว สามารถค้นหา แก้วันที่ เลขที่เอกสาร จำนวน และบุคคล หรือลบรายการผิดได้เฉพาะ Admin/เจ้าหน้าที่ ระบบใช้ราคาเดิมของรายการ คำนวณยอดและประวัติใหม่ใน transaction และไม่ยอมให้ยอดย้อนหลังติดลบ รายการเดิมที่แก้หรือลบยังตรวจได้ในประวัติการทำรายการ

เอกสารอ้างอิง: [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [MongoDB Transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/transaction-conv/)
