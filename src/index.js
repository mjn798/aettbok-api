// configure environment variables

require('dotenv/config')

// configure imports and defaults

const aettbok     = require('./common/aettbok')
const compression = require('compression')
const express     = require('express')

const serverPort  = process.env.SERVER_PORT || 3000

// configure application
// case sensitive routes
// use json by default
// use compression - expects "Accept-Encoding: gzip" header
//                 - default compression threshold: 1 kb

const app = express()
app.disable('x-powered-by')
app.set('case sensitive routing', true)
app.use(express.json())
app.use(compression())

// configure routes

app.get('/ping', (_req, res) => res.status(200).send())

app.delete('/:label/:id',           aettbok.validateToken, (req, res) => aettbok.deleteNodeWithLabelAndId(req, res))
app.delete('/:label/:id/Relations', aettbok.validateToken, (req, res) => aettbok.deleteRelationship(req, res))
app.get('/:label',                  aettbok.validateToken, (req, res) => aettbok.getNodesWithLabel(req, res))
app.get('/:label/:id',              aettbok.validateToken, (req, res) => aettbok.getNodeWithLabelAndId(req, res))
app.post('/:label',                 aettbok.validateToken, (req, res) => aettbok.postNodeInsert(req, res))
app.post('/:label/:id',             aettbok.validateToken, (req, res) => aettbok.postNodeUpdate(req, res))
app.put('/:label/:id/Relations',    aettbok.validateToken, (req, res) => aettbok.putRelationship(req, res))

// start server and listen to incoming request

app.listen(serverPort, () => console.info(`Server running on port ${serverPort}`))