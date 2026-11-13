// One-off cleanup: remove the heartbeat smoke-test user and restore the
// legacy state its first-user migration claimed (local dev DB only).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const USERNAME = 'smoketest_hb'

const user = await db.user.findUnique({ where: { username: USERNAME } })
if (!user) {
  console.log('smoke user not found — nothing to do')
} else {
  const calls = await db.call.count({ where: { userId: user.id } })
  const subs = await db.pushSubscription.count({ where: { userId: user.id } })
  console.log(`smoke user ${user.id}: calls=${calls}, pushSubs=${subs}, hasFishKey=${!!user.fishApiKey}`)

  // 1. restore the legacy global fish config rows that were claimed
  if (user.fishApiKey) {
    await db.setting.upsert({
      where: { key: 'fish_audio_api_key' },
      update: { value: user.fishApiKey },
      create: { key: 'fish_audio_api_key', value: user.fishApiKey },
    })
    if (user.fishVoiceId) {
      await db.setting.upsert({
        where: { key: 'fish_audio_voice_id' },
        update: { value: user.fishVoiceId },
        create: { key: 'fish_audio_voice_id', value: user.fishVoiceId },
      })
    }
    console.log('legacy fish settings restored')
  }

  // 2. unassign the migrated legacy calls/push back to userId=null
  await db.call.updateMany({ where: { userId: user.id }, data: { userId: null } })
  await db.pushSubscription.updateMany({ where: { userId: user.id }, data: { userId: null } })

  // 3. drop the smoke user (also removes its heartbeat Setting row via no-cascade? none — do it manually)
  await db.setting.deleteMany({ where: { key: `phone:lastSeen:${user.id}` } })
  await db.user.delete({ where: { id: user.id } })
  console.log('smoke user deleted, legacy rows unassigned')
}

await db.$disconnect()
