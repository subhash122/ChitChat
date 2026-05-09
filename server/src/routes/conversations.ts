import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [
        { user1Id: req.userId },
        { user2Id: req.userId }
      ]
    },
    include: {
      user1: { select: { id: true, name: true, email: true } },
      user2: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, createdAt: true, senderId: true, status: true }
      }
    },
    orderBy: { lastMsgAt: 'desc' }
  })
  res.json(conversations)
})

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { userId: otherUserId } = req.body
  const currentUserId = req.userId!

  if (!otherUserId) {
    res.status(400).json({ error: 'userId is required' })
    return
  }

  const [user1Id, user2Id] = [currentUserId, otherUserId].sort()

  let conversation = await prisma.conversation.findUnique({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    include: {
      user1: { select: { id: true, name: true, email: true } },
      user2: { select: { id: true, name: true, email: true } }
    }
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { user1Id, user2Id },
      include: {
        user1: { select: { id: true, name: true, email: true } },
        user2: { select: { id: true, name: true, email: true } }
      }
    })
  }

  res.json(conversation)
})

export default router
