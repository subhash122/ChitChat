import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/:conversationId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const conversationId = req.params.conversationId as string
  const { cursor, limit = '50' } = req.query

  const take = Math.min(parseInt(limit as string, 10), 100)

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take,
    ...(cursor ? {
      cursor: { id: cursor as string },
      skip: 1
    } : {}),
    select: {
      id: true,
      content: true,
      senderId: true,
      receiverId: true,
      status: true,
      createdAt: true,
      deliveredAt: true,
      readAt: true
    }
  })

  res.json({
    messages: messages.reverse(),
    nextCursor: messages.length === take ? messages[0]?.id : null
  })
})

export default router
