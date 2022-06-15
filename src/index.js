// configure environment variables

require('dotenv/config')

// configure imports and defaults

const aettbok     = new (require('./common/aettbok'))()
const redis       = require('./db/redis')
const jwt         = require('jsonwebtoken')
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

app.delete('/:label/:id',           validateToken, (req, res) => aettbok.deleteNodeWithLabelAndId(req, res))
app.delete('/:label/:id/Relations', validateToken, (req, res) => aettbok.deleteRelationship(req, res))
app.get('/:label',                  validateToken, (req, res) => aettbok.getNodesWithLabel(req, res))
app.get('/:label/:id',              validateToken, (req, res) => aettbok.getNodeWithLabelAndId(req, res))
app.get('/:label/:id/Relations',    validateToken, (req, res) => aettbok.getNodeWithLabelAndId(req, res, 'relations'))
app.post('/:label',                 validateToken, (req, res) => aettbok.postNodeInsert(req, res))
app.post('/:label/:id',             validateToken, (req, res) => aettbok.postNodeUpdate(req, res))
app.put('/:label/:id/Relations',    validateToken, (req, res) => aettbok.putRelationship(req, res))

// start server and listen to incoming request

app.listen(serverPort, () => console.info(`Server running on port ${serverPort}`))



// validate authentication token

/*
    400 (Bad Request)           = no valid token
    401 (Unauthorized)          = invalid token
    403 (Forbidden)             = invalid permissions
    500 (Internal Server Error) = Google / Redis issues
*/

async function validateToken(req, res, next) {

    let authenticationDetails = aettbok.getAuthenticationDetails(req)

    // missing or incorrect token header = (400)
    if (authenticationDetails === null || !authenticationDetails.header || !authenticationDetails.header.kid || !authenticationDetails.header.alg || !authenticationDetails.token) { return aettbok.sendError(res, 400, 'validateToken:invalidAuthenticationDetails') }

    let authenticationKey = await redis.getGoogleApiKey(authenticationDetails.header.kid)

    if (authenticationKey.error) { return aettbok.sendError(res, authenticationKey.error, 'validateToken:googleApiKeyError') }

    // verify token against key
    return jwt.verify(authenticationDetails.token, authenticationKey.key, { algorithms: [authenticationDetails.header.alg] }, (error, data) => {

        // invalid token = (401)
        if (error) { return aettbok.sendError(res, 401, 'validateToken:invalidToken') }

        // GET needs read permissions
        // POST, PUT and DELETE need write permissions
        // if ((['GET'].includes(req.method) && (!data.user.roles.includes('read'))) || (['POST', 'PUT', 'DELETE'].includes(req.method) && (!data.user.roles.includes('write')))) { console.debug('jwt:validateToken:InvalidAccess', req.method, data.user, 403); return res.status(403).send() }

        // store userid (subject) in request and continue with next function of original call
        req.sub = data.sub
        return next()

    })

}