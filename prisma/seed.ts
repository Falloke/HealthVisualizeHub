// prisma/seed.ts
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'Adminhhhub@mail.com';
  const hash = await bcrypt.hash('Admin333364', 10);

  // สร้างถ้ายังไม่มี / ถ้ามีแล้วก็แค่อัปเดต role+password
  await prisma.user.upsert({
    where: { email },
    update: { role: 'Admin', password: hash },
    create: {
      first_name: 'System',
      last_name: 'Admin',
      role: 'Admin',
      brith_date: new Date('2000-01-01'),
      position: 'ผู้ดูแลระบบ',
      province: 'กรุงเทพมหานคร',
      email,
      password: hash,
    },
  });
  console.log('✅ Admin ready:', email);
}

main().finally(() => prisma.$disconnect());
