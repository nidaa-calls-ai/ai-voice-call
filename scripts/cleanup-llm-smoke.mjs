// One-off: remove the LLM smoke-test users (local dev DB only).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const users = await db.user.findMany({
  where: { username: { startsWith: 'nidaa_llm_' } },
  select: { id: true, username: true },
})
for (const u of users) {
  const calls = await db.call.deleteMany({ where: { userId: u.id } })
  await db.pushSubscription.deleteMany({ where: { userId: u.id } })
  await db.user.delete({ where: { id: u.id } })
  console.log(`deleted ${u.username}: calls=${calls.count}`)
}
console.log(users.length ? 'cleanup done' : 'nothing to clean')
