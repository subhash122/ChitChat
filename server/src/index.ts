import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import http from 'http'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import conversationsRouter from './routes/conversations'
import messagesRouter from './routes/messages'
import { rabbitmqService } from './services/rabbitmq'
import { initializeSocket } from './services/socket'


const app = express()
const server = http.createServer(app)

app.use(cors({
	origin: process.env.CLIENT_URL!,
	credentials: true
}))
app.use(cookieParser())
app.use(express.json())

// Routes
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/messages', messagesRouter)

// Health check
app.get('/api/health', (_req, res) => {
	res.json({ status: 'ok' })
})

const PORT = Number(process.env.SERVER_PORT)

async function bootstrap() {
	await rabbitmqService.connect()
	initializeSocket(server)

	server.listen(PORT, () => {
		console.log(`Server running on port ${PORT}`)
	})
}

bootstrap().catch(console.error)

export { server }
