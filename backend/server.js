import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import cluster from 'cluster'
import os from 'os'
import fetch from 'node-fetch';

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new SocketIO(httpServer, { cors: { origin: '*' } })

// Store io instance in app for access in controllers
app.set('io', io);

// --- CORS config for credentials ---
const FRONTEND_ORIGINS = ['http://localhost:5173', 'https://chat-app-0809.netlify.app']
app.use(cors({
  origin: FRONTEND_ORIGINS,
  credentials: true,
}))
// --- end CORS config ---

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoint for uptime monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Keep-alive ping for Render/hosted environments (prevents cold start)
// You can use an external uptime monitor to ping this endpoint every 5-10 minutes
if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
  setInterval(() => {
    fetch('https://' + process.env.RENDER_EXTERNAL_HOSTNAME + '/health').catch(() => {});
  }, 1000 * 60 * 9); // every 9 minutes
}

// Use only 1 worker on Render or if WEB_CONCURRENCY=1 to avoid cold start/memory issues
const isRender = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_HOSTNAME;
const numCPUs = process.env.WEB_CONCURRENCY
  ? parseInt(process.env.WEB_CONCURRENCY)
  : (isRender ? 1 : os.cpus().length);

if (cluster.isPrimary) {
  // Master process: fork workers
  console.log(`Primary ${process.pid} is running. Forking ${numCPUs} workers...`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Worker process: run the server

  // Create uploads directory if it doesn't exist (sync is ok at startup)
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }

  // Serve static files from uploads directory
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

  // Default health check route
  app.get('/', (req, res) => {
    res.send('API is running...')
  })

  // MongoDB connection
  const isProduction = process.env.NODE_ENV === 'production';
  const localUri = process.env.MONGO_LOCAL_URI || 'mongodb://127.0.0.1:27017/chat-app';
  const atlasUri = process.env.MONGO_URI; // Atlas URI should be set in production

  const mongoUri = isProduction ? atlasUri : localUri;

  mongoose.connect(mongoUri, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    // Only use SSL/TLS for Atlas (production)
    ...(isProduction
      ? {
          ssl: true,
          tls: true,
          tlsAllowInvalidCertificates: false
        }
      : {})
  })
    .then(() => {
      console.log('MongoDB connected:', mongoUri)

      // Import cloudinary config and routes/controllers after DB connection
      import('./config/cloudinary.js').then(() => {
        // Import routes
        import('./routes/auth.js').then(({ default: authRoutes }) => {
          import('./routes/user.js').then(({ default: userRoutes }) => {
            import('./routes/chat.js').then(({ default: chatRoutes }) => {
              import('./routes/image.js').then(({ default: imageRoutes }) => {
                import('./routes/ai.js').then(({ default: aiRoutes }) => {
                  // Use routes
                  app.use('/api/auth', authRoutes)
                  app.use('/api/user', userRoutes)
                  app.use('/api/chat', chatRoutes)
                  app.use('/api/images', imageRoutes)
                  app.use('/api/ai', aiRoutes)

                  // 404 handler for unmatched /api routes
                  app.use('/api/*', (req, res) => {
                    res.status(404).json({ error: 'API route not found' })
                  })

                  // Catch-all 404 for any other route
                  app.use((req, res) => {
                    res.status(404).json({ error: 'Not found' })
                  })

                  // Socket.io for P2P chat signaling
                  io.on('connection', (socket) => {
                    // Join own room for instant message delivery
                    socket.on('chat:join', (userId) => {
                      socket.join(userId);
                    });

                    // Listen for sending a message via socket
                    socket.on('chat:message', async (data) => {
                      // data: { from, to, content, type }
                      try {
                        // Save message to DB
                        const { default: Message } = await import('./models/Message.js');
                        const msg = await Message.create({
                          from: data.from,
                          to: data.to,
                          content: data.content,
                          type: data.type || 'text',
                        });
                        // Emit to both sender and receiver rooms
                        io.to(data.from).emit('chat:message', msg);
                        io.to(data.to).emit('chat:message', msg);
                      } catch (err) {
                        // Optionally emit error to sender
                        socket.emit('chat:error', { error: err.message });
                      }
                    });
                  })
                  // Set server timeout to 60s (default is 2min, but Render may kill slow requests)
                  httpServer.setTimeout?.(60000);
                  const PORT = process.env.PORT || 5000;
                  httpServer.listen(PORT, '0.0.0.0', (err) => {
                    if (err) {
                      console.error('Server failed to start:', err);
                    } else {
                      console.log('Server running on http://localhost:' + PORT);
                    }
                  });
                })
              })
            })
          })
        })
      })
    })
    .catch(err => {
      console.error('MongoDB connection error:', err);
      process.exit(1);
    });

  // Optional: Log unhandled promise rejections for debugging
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
  });

}
export default app