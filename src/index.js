// configure imports and defaults

require('dotenv/config')

const aettbok     = require('./common/aettbok')
const tokens      = require('./common/tokenvalidator')
const compression = require('compression')
const express     = require('express')
const cors        = require('cors')

const serverPort  = process.env.SERVER_PORT || 3000

// configure application

const app = express()
app.disable('x-powered-by')
app.set('case sensitive routing', true)
app.use(express.json())
app.use(compression())
app.use(cors())

// configure routes

app.get('/ping', (_req, res) => res.status(204).send())

app.delete('/:label/:id', tokens.validateToken, (req, res) => aettbok.deleteNodeWithLabelAndId(req, res))
app.get('/:label/:id?',   tokens.validateToken, (req, res) => aettbok.getNodes(req, res))
app.post('/:label',       tokens.validateToken, (req, res) => aettbok.postNodeInsert(req, res))
app.post('/:label/:id',   tokens.validateToken, (req, res) => aettbok.postNodeUpdate(req, res))

// start server and listen to incoming request

app.listen(serverPort, () => console.info(`Server running on port ${serverPort}`))