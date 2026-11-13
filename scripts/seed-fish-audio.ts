// One-off seed: store the owner's fish.audio credentials as the initial setting
// so the voice works out of the box. Run: bun scripts/seed-fish-audio.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const apiKey = process.env.FISH_API_KEY || ''
  const voiceId = '12a85233597842b6a4e169c3db4ec1e0'
  if (!apiKey.startsWith('sk-fish-')) {
    console.error('FISH_API_KEY env missing/invalid')
    process.exit(1)
  }
  await prisma.setting.upsert({
    where: { key: 'fish_audio_api_key' },
    update: { value: apiKey },
    create: { key: 'fish_audio_api_key', value: apiKey },
  })
  await prisma.setting.upsert({
    where: { key: 'fish_audio_voice_id' },
    update: { value: voiceId },
    create: { key: 'fish_audio_voice_id', value: voiceId },
  })
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'fish_audio' } } })
  console.log(
    rows.map((r) => `${r.key} = ${r.key.endsWith('api_key') ? r.value.slice(0, 11) + '...' : r.value}`).join('\n')
  )
}

main().finally(() => prisma.$disconnect())
